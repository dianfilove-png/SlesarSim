// Физика: погода, контуры отопления и ГВС, дома, износ, потребности героя
'use strict';

G.Sim = (() => {
  const U = G.U, D = G.D;
  const N = D.HOUSES.length;

  // ---- вода и теплоносители
  const CW = 1.163; // кВт на (м³/ч · К): теплоёмкость потока воды
  const rho = (T) => 1000 * (1 - (T + 288.9414) / (508929.2 * (T + 68.12963)) * (T - 3.9863) * (T - 3.9863)); // плотность, кг/м³ (Тиссен)
  const GCAL = 1163; // кВт в 1 Гкал/ч
  // ---- отопление: насосы Н1/Н2 (H = H0·eff − a·Q², бар и м³/ч), сопротивления ΔP = S·Q²
  const H0_H = 3.1, A_H = 7e-5;
  const R_CTP = 4.1e-5, R_F0 = 3.6e-6; // ЦТП с ТО (сторона контура); чистый грязевик
  const SEG = [0.7e-5, 0.6e-5, 0.9e-5, 1.6e-5, 0.9e-4]; // магистраль квартала до ТК-1…ТК-5 (подача + обратка)
  const DP_B = 1, Q_PER_KW = 1 / (CW * 25); // ветка дома: 1 бар на расчётном расходе (график 95/70)
  const RB = D.HOUSES.map((h) => DP_B / Math.pow(h.kw * Q_PER_KW, 2));
  const KP = 0.3, T_GROUND = 5; // теплопотери магистрали, кВт/К на участок
  const Q_NOM = 105; // расчётный расход контура, м³/ч
  const V_MIX = 8; // вода ЦТП и ТО, м³: инерция Т1/Т2
  // ---- радиаторы: Q = Qном·(Δt/Δtном)^1,3, Δt — среднелогарифмический напор (95/70/20)
  const LMTD_N = 25 / Math.log(75 / 50);
  const Q_INT = 0.07; // бытовые теплопоступления, доля от расчётной теплопотери
  // ---- ТО отопления (пластинчатый, противоток) и сетевая вода
  const UA_HX = 220, GN_MAX = 40; // кВт/К; потолок расхода сетевой воды на ТО, м³/ч
  const P_NET_S = 8, P_NET_R = 5.2; // давление в подаче и обратке теплосети, бар
  // ---- давление: закрытый контур V_SYS, мембранный бак V_TANK (азот P_PRE), под ним — упругость труб
  const V_SYS = 30, V_TANK = 12, P_PRE = 2, W_PIPE = 0.3;
  const KF = 4, KD = 10; // подпитка из обратки сети и дренаж: Q = K·√ΔP, м³/ч
  const P_PPK = 6; // предохранительный клапан
  // ---- ГВС: двухступенчатый ВВП, циркуляция Т4, разбор жильцами
  const H0_G = 0.8, A_G = 0.012;
  const GC_NOM = 5, DRAW_PEAK = 16; // циркуляция и пиковый разбор, м³/ч
  const APTS = D.HOUSES.reduce((a, h) => a + h.apts, 0);
  const SHARE = D.HOUSES.map((h) => h.apts / APTS);
  const RC = SHARE.map((x) => 0.5 / Math.pow(GC_NOM * x, 2)); // циркуляционная ветка дома
  const UL = [0.06, 0.08, 0.1, 0.12, 0.14]; // остывание по пути к крану, кВт/К
  const UL_C = 1.5; // потери циркуляционного кольца, кВт/К
  const UA1 = 45, UA2 = 55, GG_MAX = 30, V_VVP = 0.8; // ступени ВВП, кВт/К; потолок сетевой воды на ВВП, м³/ч

  const GLAND = [0, 0.03, 0.1, 0.3]; // м³/ч течи по сальнику при 4 бар
  const seasonal = (doy) => 6 - 13 * Math.cos(2 * Math.PI * (doy - 20) / 365);
  const heatSeason = (t) => { const d = U.date(t); return d.m >= 9 || d.m <= 3 || (d.m === 4 && d.d <= 15); };
  const tSched = (tout) => (tout >= 20 ? 40 : U.clamp(20 + 75 * Math.pow((20 - tout) / 46, 0.8), 40, 105));
  const drawProfile = (h) => {
    if (h < 5) return 0.12;
    if (h < 6.5) return 0.35;
    if (h < 9) return 0.85;
    if (h < 18) return 0.4;
    if (h < 22.5) return 1;
    return 0.45;
  };
  const pumpEff = (p) => (p.broken ? 0 : 1 - Math.max(0, p.bear - 75) / 50);
  // напоры на закрытую задвижку работающих насосов контура (в HD), вернёт их число
  const HD = [0, 0, 0, 0];
  const heads = (S, c, h0) => {
    let n = 0;
    for (const p of S.pumps) if (p.circ === c && p.on && !p.broken) HD[n++] = h0 * pumpEff(p);
    return n;
  };
  // доля напора лучшего насоса (0…1,08) — для старых проверок «насос крутит»
  const headOf = (S, c) => {
    let best = 0, n = 0;
    for (const p of S.pumps) if (p.circ === c && p.on && !p.broken) { best = Math.max(best, pumpEff(p)); n++; }
    return n > 1 ? Math.min(1.08, best + 0.06) : best;
  };
  // рабочая точка: насосы параллельно, Σ√((H0ᵢ − H)/a) = √(H/S); n — число насосов в HD
  function opPoint(n, a, Ssys) {
    if (!n || !(Ssys < Infinity)) return 0;
    if (n === 1 || HD[0] === HD[1]) return HD[0] > 0 ? Math.sqrt(HD[0] / (a / (n * n) + Ssys)) : 0;
    let lo = 0, hi = Math.max(HD[0], HD[1]);
    for (let k = 0; k < 30; k++) {
      const h = (lo + hi) / 2;
      let q = 0;
      for (let i = 0; i < n; i++) if (HD[i] > h) q += Math.sqrt((HD[i] - h) / a);
      if (q > Math.sqrt(h / Ssys)) lo = h; else hi = h;
    }
    return Math.sqrt(lo / Ssys);
  }
  // параллельные квадратичные сопротивления: 1/√R = Σ 1/√Rᵢ
  const par = (a, b) => (a === Infinity ? b : b === Infinity ? a : 1 / Math.pow(1 / Math.sqrt(a) + 1 / Math.sqrt(b), 2));
  const pipeOpen = (S, pipe) => S.valves.every((v) => v.pipe !== pipe || v.open);
  const sealLeak = (p) => (p.seal >= 100 ? 0.8 : p.seal >= 75 ? 0.05 + (p.seal - 75) * 0.004 : 0);
  const flangeLeak = (v) => (v.flange > 1 ? 1.2 : v.flange ? 0.35 : 0);
  const valveLeak = (v) => GLAND[v.gland] + flangeLeak(v);
  // течи на ЦТП, м³/ч при 4 бар
  const leakOf = (S, c) => {
    let sum = 0;
    for (const v of S.valves) if (D.PIPES[v.pipe].circ === c) sum += valveLeak(v);
    for (const p of S.pumps) if (p.circ === c) sum += sealLeak(p);
    return sum;
  };
  const circPumps = (S, c) => S.pumps.filter((p) => p.circ === c);
  // пороги давления отопления, бар «на холодную» (pCold): норма P_LOW..P_WARN, подпитку закрывать с P_CLOSE,
  // много — выше P_HIGH на холодную или P_HOT по манометру
  const P_LOW = 3.5, P_CLOSE = 4, P_WARN = 4.5, P_HIGH = 4.6, P_HOT = 5.7;
  // тепловые камеры перед домами: открыто ли ответвление контура c ('heat' | 'gvs') на дом i
  const wellOpen = (S, i, c) => D.WELL_PIPES[c].every((k) => S.wells[i].v[k].open);
  // доля порыва, которая ещё течёт: обе задвижки открыты — 1, одна закрыта — подсос с другой трубы, обе — 0
  const burstLeakK = (S) => {
    const B = S.ev.burst;
    if (!B) return 0;
    const n = D.WELL_PIPES[B.pipe].filter((k) => S.wells[B.house].v[k].open).length;
    return n === 2 ? 1 : n === 1 ? 0.33 : 0;
  };
  const burstIsolated = (S) => !!S.ev.burst && burstLeakK(S) === 0;
  // все утечки отопления, м³/ч при текущем давлении: ЦТП, подвалы домов, порыв теплотрассы
  const heatLeak = (S, p = S.heat.ps) => {
    let leak = leakOf(S, 'heat');
    S.houses.forEach((h, i) => { if (h.leak && wellOpen(S, i, 'heat')) leak += 0.06; });
    if (S.ev.burst && S.ev.burst.pipe === 'heat') leak += 3 * burstLeakK(S);
    return leak * Math.sqrt(Math.max(0, p) / 4);
  };
  // ---- давление ↔ объём: w — вода в баке сверх пустого (м³), ниже нуля — бак пуст, давление держат трубы
  const volOf = (p) => (p >= P_PRE ? V_TANK * (1 - (P_PRE + 1) / (p + 1)) : W_PIPE * (Math.max(0, p) / P_PRE - 1));
  const presOf = (w) => (w >= 0 ? (P_PRE + 1) * V_TANK / (V_TANK - Math.min(w, 0.95 * V_TANK)) - 1 : Math.max(0, P_PRE * (1 + w / W_PIPE)));
  const dPdV = (p) => (p >= P_PRE ? (p + 1) * (p + 1) / ((P_PRE + 1) * V_TANK) : P_PRE / W_PIPE); // бар на м³
  // объём, на который контур «сожмётся», если остынет до 20°, м³ (≤ 0 у горячего)
  const shrink = (H) => V_SYS * (rho((H.t1 + H.t2) / 2) / rho(20) - 1);
  // давление, приведённое к холодному контуру (20°): по нему и судят, сколько воды в системе
  const pCold = (S) => presOf(volOf(S.heat.ps) + shrink(S.heat));
  // и обратно: что покажет манометр сейчас, если на холодную будет pc
  const pAt = (S, pc) => presOf(volOf(pc) - shrink(S.heat));
  // давление в обратке теплосети: подпитка идёт, только пока оно выше давления контура
  const pNetRet = (S) => (S.ev.netOff && S.ev.netOff.started ? 0 : S.ev.netLowP ? S.ev.netLowP.p : P_NET_R);
  const feedFlow = (S, p) => KF * Math.sqrt(Math.max(0, pNetRet(S) - p));
  // приток в контур при открытой подпитке за вычетом течей и дренажа, м³/ч при давлении p
  const feedNet = (S, p) => feedFlow(S, p) - heatLeak(S, p) - (S.heat.drain ? KD * Math.sqrt(Math.max(0, p)) : 0);
  // чистое изменение давления отопления при открытой подпитке, бар/мин
  const feedNetRate = (S) => feedNet(S, S.heat.ps) / 60 * dPdV(S.heat.ps);
  // сколько минут подпитывать до pTo бар на холодную (по модели бака, при нынешних температурах); Infinity — не наберётся
  const feedEta = (S, pTo) => {
    let w = volOf(S.heat.ps), t = 0;
    const wt = volOf(pTo) - shrink(S.heat), dw = (wt - w) / 40;
    if (dw <= 0) return 0;
    for (let k = 0; k < 40; k++, w += dw) {
      const r = feedNet(S, presOf(w + dw / 2)) / 60;
      if (r <= 1e-4) return Infinity;
      t += dw / r;
    }
    return t;
  };
  const anyOn = (S, c) => S.pumps.some((p) => p.circ === c && p.on);
  // потолок нагрева: Т1 / Т3 при полностью открытом клапане сетевой воды (считается в шаге)
  const maxT = (S, c) => (S[c].tmax === undefined ? S.tnet - 4 : S[c].tmax);
  // нормированный расход (1 — расчётный): отопление — контур, ГВС — циркуляция
  const qn = (S, c) => (c === 'heat' ? S.heat.q / Q_NOM : S.gvs.q / GC_NOM);
  // насос «на закрытую задвижку»: на ЦТП задвижки открыты — значит, перекрыты все камеры
  const deadMsg = (p, ctpOpen) => (ctpOpen ? 'Насос ' + p.id + ' качает в закрытые камеры: во всех ТК перекрыт ввод на дома!' : 'Насос ' + p.id + ' работает на закрытую задвижку!');

  // противоточный теплообменник, ε-NTU: тепло, кВт (Ch, Cc — кВт/К)
  function hx(UA, Ch, Cc, th, tc) {
    if (Ch <= 0 || Cc <= 0 || th <= tc) return 0;
    const Cmin = Math.min(Ch, Cc), Cr = Cmin / Math.max(Ch, Cc), ntu = UA / Cmin;
    let e;
    if (Cr > 0.999) e = ntu / (1 + ntu);
    else { const x = Math.exp(-ntu * (1 - Cr)); e = (1 - x) / (1 - Cr * x); }
    return e * Cmin * (th - tc);
  }
  // запас поверхности после накипи: ТО отопления при 100% — 30% теплопередачи, ВВП (жёсткая водопроводная вода в трубках) — 15%
  const foulK = (c, f) => 1 - (c === 'gvs' ? 0.0085 : 0.007) * f;

  function weather(S, t) {
    const m = U.mod(t);
    if (m % 60 === 0) {
      const target = S.wx.snap && S.wx.snap.until > t ? S.wx.snap.delta : 0;
      S.wx.dev = U.clamp(S.wx.dev + (target - S.wx.dev) * 0.06 + U.randn() * 0.55, -20, 12);
      if (m % 360 === 0) S.wx.prec = Math.random() < 0.3;
    }
    const d = U.date(t);
    const base = seasonal(d.doy) + 3 * Math.cos(2 * Math.PI * (U.hour(t) - 15) / 24);
    S.tout = base + S.wx.dev;
    let tnet = Math.max(70, 20 + 130 * U.clamp((20 - S.tout) / 46, 0, 1.08));
    if (S.ev.netDrop) tnet -= S.ev.netDrop.delta;
    if (S.ev.netOff && S.ev.netOff.started) tnet = 20;
    S.tnet = tnet;
    S.thvs = 10 - 5 * Math.cos(2 * Math.PI * (d.doy - 45) / 365); // водопровод: ~5° в феврале, ~15° в августе
  }

  function wearRun(p, rateBear, rateSeal) { p.bear = Math.min(100, p.bear + rateBear); p.seal = Math.min(110, p.seal + rateSeal); }

  // гидравлика квартала: эквивалентное сопротивление от ЦТП (лестница: магистраль + ветки домов), расходы по домам
  const RPAR = new Float64Array(N), RDN = new Float64Array(N + 1);
  function network(S) {
    RDN[N] = Infinity;
    for (let k = N - 1; k >= 0; k--) {
      const p = par(wellOpen(S, k, 'heat') ? RB[k] : Infinity, RDN[k + 1]);
      RPAR[k] = p;
      RDN[k] = p === Infinity ? Infinity : SEG[k] + p;
    }
    return RDN[0];
  }
  function spread(S, Q) {
    let q = Q;
    for (let k = 0; k < N; k++) {
      const hs = S.houses[k];
      hs.qin = q; // расход по магистрали к узлу дома
      const dp = q > 0 && RPAR[k] < Infinity ? RPAR[k] * q * q : 0;
      hs.q = dp > 0 && wellOpen(S, k, 'heat') ? Math.min(q, Math.sqrt(dp / RB[k])) : 0;
      q -= hs.q;
    }
  }
  // радиаторы дома: ε-модель с показателем 1,3 (две итерации от прошлой Т2), вернёт кВт
  function radiator(hs, hd, t1) {
    const q = hs.q, tin = hs.tin;
    if (q < 0.01 || t1 <= tin + 0.1) { hs.t2 = Math.min(t1, tin); return 0; }
    const qn0 = hd.kw * hd.rad * (1 - Q_INT) * (hs.air ? 0.82 : 1), C = CW * q;
    let t2 = U.clamp(hs.t2 === undefined ? (t1 + tin) / 2 : hs.t2, tin + 0.05, t1 - 0.05), Q = 0;
    for (let it = 0; it < 2; it++) {
      const a = t1 - tin, b = t2 - tin;
      const dt = Math.abs(a - b) < 0.01 ? a : (a - b) / Math.log(a / b);
      const ua = qn0 * Math.pow(dt / LMTD_N, 0.3) / LMTD_N;
      Q = (1 - Math.exp(-ua / C)) * C * a;
      t2 = Math.max(tin + 0.05, t1 - Q / C);
    }
    hs.t2 = t2;
    return Q;
  }

  function circuitHeat(S, season) {
    const H = S.heat;
    const air = U.clamp((H.ps - 0.6) / 1.2, 0, 1);
    const n = heads(S, 'heat', H0_H * air);
    const head = headOf(S, 'heat');
    // все дома отсечены в камерах — насосу некуда качать, как на закрытую задвижку
    const ctpOpen = pipeOpen(S, 1) && pipeOpen(S, 2), rNet = network(S), open = ctpOpen && rNet < Infinity;
    const c = H.clog / 100, rF = R_F0 * (1 + 700 * c * c * c * c);
    const Q = open ? opPoint(n, A_H, R_CTP + rF + rNet) : 0;
    H.q = Q < 0.01 ? 0 : Q;
    spread(S, H.q);
    // манометры: насос на обратке, бак — на всасе; Т2 — до грязевика
    const q2 = H.q * H.q;
    if (H.q > 0) { H.p1 = H.ps + (R_CTP / 2 + rNet + rF) * q2; H.p2 = H.ps + (rF + R_CTP / 2) * q2; }
    else { H.p1 = H.ps + (n && ctpOpen ? Math.max(HD[0], n > 1 ? HD[1] : 0) : 0); H.p2 = H.ps; }

    // радиаторы домов при текущей Т1, смешение обраток
    const tm0 = (H.t1 + H.t2) / 2;
    const flowing = H.q > 0.5;
    let t = H.t1, sq = 0, st = 0;
    for (let k = 0; k < N; k++) {
      const hs = S.houses[k];
      if (flowing && hs.qin > 0.01) t = T_GROUND + (t - T_GROUND) * Math.exp(-KP / (CW * hs.qin));
      hs.t1 = flowing ? t : H.t1;
      hs.qr = flowing ? radiator(hs, D.HOUSES[k], t) : 0;
      sq += hs.q; st += hs.q * hs.t2;
    }
    const kf = flowing ? 1 - Math.exp(-H.q / 60 / V_MIX) : 0.008;
    H.t2 += ((flowing && sq > 0 ? st / sq : 22) - H.t2) * kf;

    // ТО: регулятор на сетевой стороне держит Т1 по графику + коррекция, клапан не больше GN_MAX
    const ua = UA_HX * foulK('heat', H.foul), Cc = CW * H.q, tset = tSched(S.tout) + H.corr;
    let gn = 0, qh = 0;
    H.tmax = undefined; // нет циркуляции или не сезон — потолок по подаче сети (maxT)
    if (season && flowing && S.tnet > H.t2) {
      const qmax = hx(ua, CW * GN_MAX, Cc, S.tnet, H.t2), qreq = Cc * (tset - H.t2);
      H.tmax = H.t2 + qmax / Cc;
      if (qreq >= qmax) { gn = GN_MAX; qh = qmax; } else if (qreq > 0) {
        let lo = 0, hi = GN_MAX;
        for (let k = 0; k < 14; k++) { const g = (lo + hi) / 2; if (hx(ua, CW * g, Cc, S.tnet, H.t2) < qreq) lo = g; else hi = g; }
        gn = hi; qh = qreq;
      }
    }
    H.gn = gn; H.kw = qh;
    H.trh = gn > 0 ? S.tnet - qh / (CW * gn) : H.t2; // обратка сетевой воды после ТО
    H.t1 += ((flowing ? H.t2 + qh / Cc : 22) - H.t1) * kf;

    // давление: расширение воды, течи, дренаж, подпитка из обратки сети, ППК
    let w = volOf(H.ps);
    w += V_SYS * (rho(tm0) / rho((H.t1 + H.t2) / 2) - 1);
    w -= heatLeak(S) / 60;
    if (H.drain) w -= KD * Math.sqrt(Math.max(0, H.ps)) / 60;
    const pc0 = pCold(S);
    if (H.auto) { if (pc0 < 3.8) H.autoOn = true; else if (pc0 > 4.2) H.autoOn = false; }
    const feeding = H.feed || (H.auto && H.autoOn);
    H.qf = feeding ? feedFlow(S, H.ps) : 0;
    w += H.qf / 60;
    // забытая подпитка: контур перекачан дольше получаса — ППК подтравливает сетевую воду в трап
    H.overMin = H.feed && pc0 > P_HIGH ? (H.overMin || 0) + 1 : 0;
    H.qw = H.overMin > 30 ? 1 : 0;
    if (H.overMin === 31) G.Ev.msg('Мысли', 'Подпитка так и открыта, контур перекачан (на холодную ' + pc0.toFixed(1) + ' бар) — предохранительный клапан подтравливает сетевую воду в трап. Лужа, а ТЭЦ воду считает! Закрой подпитку.');
    w -= H.qw / 60;
    let p = presOf(w);
    const pc = presOf(w + shrink(H));
    if (H.feed && pc > P_WARN && !H.feedWarn) {
      H.feedWarn = true;
      if (S.speed > 1) S.speed = 1;
      G.Ev.msg('Мысли', 'Манометр отопления ' + p.toFixed(1) + ' бар' + (p - pc > 0.2 ? ', на холодную было бы ' + pc.toFixed(1) : '') + ' — пора закрывать подпитку!');
    }
    if (!H.feed || pc < P_CLOSE) H.feedWarn = false;
    // ППК: сбрасывает лишнее в трап; изредка закисает — тогда давление растёт дальше
    if (p > P_PPK) {
      if (!H.ppkOn) {
        H.ppkOn = true;
        H.ppkStuck = Math.random() < 0.04;
        if (S.speed > 1) S.speed = 1;
        if (H.ppkStuck) G.Ev.alarm('Давление в отоплении ' + p.toFixed(1) + ' бар, а предохранительный клапан молчит — закис! Сбрось давление дренажом, иначе сорвёт прокладки!');
        else G.Ev.msg('Мысли', 'Зашипел предохранительный клапан отопления: ' + P_PPK + ' бар, вода уходит в трап.' + (feeding ? ' Подпитка-то открыта!' : ' Вода прогрелась и расширилась — приоткрой дренаж.'));
      }
      H.qppk = H.ppkStuck ? 0 : (w - volOf(P_PPK)) * 60; // сброс, м³/ч
      if (!H.ppkStuck) p = P_PPK;
    } else H.qppk = 0;
    if (p < 5.6) H.ppkOn = false;
    if (p < 5) H.ppkStuck = false;
    H.ps = U.clamp(p, 0, 9);

    // насос на закрытую задвижку или без воды
    for (const pm of circPumps(S, 'heat')) {
      if (!pm.on || pm.broken) continue;
      if (H.ps < 0.8) {
        wearRun(pm, 0.25, 0.15);
        if (!pm.dryMsg) {
          pm.dryMsg = true;
          G.Ev.alarm('Насос ' + pm.id + ' всухую — нет давления в отоплении! Стоп насос' + (H.drain ? ', закрой дренаж' : '') +
            (pNetRet(S) > 1 ? ', подпитка до 4 бар (чек-лист в шкафу).' : ': в обратке теплосети нет давления, подпитать нечем.'));
        }
      } else pm.dryMsg = false;
      if (!open) {
        wearRun(pm, 0.01, 0.04);
        if (!pm.deadMsg) { pm.deadMsg = true; G.Ev.alarm(deadMsg(pm, ctpOpen)); }
      } else pm.deadMsg = false;
    }
    // завоздушивание: статика ниже высоты дома — верхние этажи оголяются
    if (season && head > 0) {
      for (let k = 0; k < N; k++) { const hs = S.houses[k]; if (!hs.air && H.ps < 0.28 * D.HOUSES[k].floors && Math.random() < 0.004) hs.air = 1; }
    }
    // закисший ППК: перепрессовка срывает прокладки
    if (H.blowCd > 0) H.blowCd--;
    if (H.ps > 6.5 && H.blowCd <= 0 && Math.random() < 0.025) {
      H.blowCd = 120;
      G.Ev.blowout();
    }
    // SMS-датчик давления: раньше диспетчера, будит и снимает ускорение
    // слив через дренаж — сам сливаешь: молчит, пока давление снова не наберётся
    // контур слит игроком (дренаж) или сезон ещё не начат приказом, а насосы стоят — тревогу не поднимают
    const watch = anyOn(S, 'heat') || (season && !S.flags.seasonEnd && !H.drain);
    if (S.upg.sms && H.ps < 3 && !H.smsSent && watch) {
      H.smsSent = true;
      if (!H.drain) G.Ev.msg('SMS-датчик ЦТП-7', 'Давление в отоплении ' + H.ps.toFixed(1) + ' бар!', true);
    } else if (H.ps > 3.5) H.smsSent = false;
    if (H.ps < 2 && !H.lowAlarm && watch) {
      H.lowAlarm = true;
      G.Ev.alarm('Падение давления в отоплении: ' + H.ps.toFixed(1) + ' бар! Нужна подпитка.');
    } else if (H.ps > 3) H.lowAlarm = false;
  }

  // ГВС: ХВС подмешивается к циркуляции Т4 и греется в трубках ВВП сетевой водой
  const DRW = new Float64Array(N), CRC = new Float64Array(N);
  function circuitGvs(S, draw) {
    const W = S.gvs, H = S.heat;
    const open3 = pipeOpen(S, 3), open4 = pipeOpen(S, 4);
    // порыв на вводе ГВС: давление падает, ВВП не успевает греть такой расход
    const B = S.ev.burst, gb = B && B.pipe === 'gvs' ? burstLeakK(S) : 0;
    if (W.drain) W.ps += (0 - W.ps) * 0.2;
    else if (!S.ev.hvs) W.ps += (4.6 - leakOf(S, 'gvs') * 0.4 - gb * 2.2 - W.ps) * 0.15;
    else W.ps = Math.max(0, W.ps - 0.004 - draw * 0.02 - gb * 0.02);
    const hasWater = W.ps > 1 && open3;
    // циркуляция: ветки домов параллельно (в камере открыты Т3 и Т4)
    let rc = Infinity;
    for (let k = 0; k < N; k++) if (wellOpen(S, k, 'gvs')) rc = par(rc, RC[k]);
    const loop = rc < Infinity;
    const air = U.clamp((W.ps - 0.6) / 1.2, 0, 1);
    const n = heads(S, 'gvs', H0_G * air);
    const gc = open3 && open4 && loop && W.ps > 1 ? opPoint(n, A_G, rc) : 0;
    W.q = gc < 0.01 ? 0 : gc;
    // разбор по домам (по квартирам) и циркуляция по веткам
    let dr = 0;
    for (let k = 0; k < N; k++) {
      const wv = S.wells[k].v;
      DRW[k] = hasWater && wv[2].open ? DRAW_PEAK * draw * SHARE[k] : 0;
      CRC[k] = W.q > 0 && wv[2].open && wv[3].open ? W.q * Math.sqrt(rc / RC[k]) : 0;
      dr += DRW[k];
    }
    if (hasWater && gb) dr += 12 * gb; // хлещет из порыва — тоже разбор
    W.draw = dr;
    const gw = dr + W.q;
    const tcIn = gw > 0 ? (dr * S.thvs + W.q * W.t4) / gw : S.thvs;
    // ВВП: 1-я ступень — обратка ТО отопления + сетевая вода после 2-й ступени, 2-я — подача сети
    const f = foulK('gvs', W.foul), Cw = CW * gw, gn = H.gn || 0, tg2 = W.tg2 === undefined ? S.tnet - 20 : W.tg2;
    let q1 = 0, q2 = 0, tret = gn > 0 ? H.trh : 40;
    const run = (gg) => {
      const gh = gn + gg, th1 = gh > 0 ? (gn * H.trh + gg * tg2) / gh : 0;
      // перемычка: 1-я ступень не греет выше уставки
      q1 = gh > 0 ? Math.min(hx(UA1 * f, CW * gh, Cw, th1, tcIn), Math.max(0, Cw * (W.set - tcIn))) : 0;
      const tc1 = tcIn + q1 / Cw;
      q2 = gg > 0 ? hx(UA2 * f, CW * gg, Cw, S.tnet, tc1) : 0;
      tret = gh > 0 ? th1 - q1 / (CW * gh) : 40;
      return tc1 + q2 / Cw;
    };
    let gg = 0, t3 = W.t3;
    if (gw > 0.05 && hasWater) {
      t3 = run(GG_MAX);
      W.tmax = t3;
      if (t3 > W.set) {
        let lo = 0, hi = GG_MAX;
        for (let k = 0; k < 14; k++) { const g = (lo + hi) / 2; if (run(g) < W.set) lo = g; else hi = g; }
        gg = hi; t3 = run(gg);
      } else gg = GG_MAX;
      W.tg2 = S.tnet - q2 / (CW * gg);
    } else { W.tmax = S.tnet - 5; if (gn > 0) run(0); }
    W.gn = gg; W.kw = q1 + q2; W.kw1 = q1;
    S.trn = tret; // обратка в сеть, на ТЭЦ
    const kg = hasWater && gw > 0.05 ? 1 - Math.exp(-gw / 60 / V_VVP) : 0.01;
    W.t3 += ((hasWater && gw > 0.05 ? t3 : 20) - W.t3) * kg;
    const t4goal = hasWater && W.q > 0.1 ? 20 + (W.t3 - 20) * Math.exp(-UL_C / (CW * W.q)) : 20;
    W.t4 += (t4goal - W.t4) * 0.05;
    W.p3 = W.ps + (W.q > 0 ? rc * W.q * W.q : n && open3 && open4 ? HD[0] : 0);
    W.p4 = W.ps;
    for (const p of circPumps(S, 'gvs')) {
      if (!p.on || p.broken) continue;
      if (W.ps < 0.8) {
        wearRun(p, 0.25, 0.15);
        if (!p.dryMsg) {
          p.dryMsg = true;
          G.Ev.alarm('Насос ' + p.id + ' всухую — нет давления в ГВС! ' + (S.ev.hvs ? 'Стоп насос и жди водоканал.' : W.drain ? 'Стоп насос, закрой дренаж ГВС.' : 'Стоп насос.'));
        }
      } else p.dryMsg = false;
      if (!(open3 && open4 && loop)) {
        wearRun(p, 0.01, 0.04);
        if (!p.deadMsg) { p.deadMsg = true; G.Ev.alarm(deadMsg(p, open3 && open4)); }
      } else p.deadMsg = false;
    }
    if (W.ps < 1.5 && !W.lowAlarm && !W.drain && !S.ev.hvs) {
      W.lowAlarm = true;
      G.Ev.alarm('Нет давления в ГВС: ' + W.ps.toFixed(1) + ' бар.');
    } else if (W.ps > 3) W.lowAlarm = false;
  }

  // дома: C·dT/dt = Qрад − UA·(Tвн − Tнар) + бытовые; горячая вода в кране
  function houses(S, season, h) {
    const W = S.gvs;
    const gvsOK = W.ps > 1 && pipeOpen(S, 3);
    const night = h < 6 || h >= 23;
    for (let i = 0; i < N; i++) {
      const hd = D.HOUSES[i], hs = S.houses[i], wv = S.wells[i].v;
      const ua = hd.kw / 46;
      hs.tin += (hs.qr + Q_INT * hd.kw - ua * (hs.tin - S.tout)) / (ua * hd.tau * 60);

      let tt;
      if (!gvsOK || !wv[2].open) tt = 12;
      else tt = 20 + (W.t3 - 20) * Math.exp(-UL[i] / (CW * Math.max(0.05, DRW[i] + CRC[i])));
      hs.ttap += (tt - hs.ttap) * 0.06;

      const heatOn = wellOpen(S, i, 'heat');
      const cold = season && S.t >= (S.flags.coldGrace || 0) ? Math.max(0, 18.5 - hs.tin) : 0;
      const hot = Math.max(0, hs.tin - 26) * 0.6;
      const noHot = S.ev.hvs || (S.ev.netOff && S.ev.netOff.started) || S.t < (S.flags.hotGrace || 0) ? 0 : Math.max(0, 52 - hs.ttap) / 8 * (night ? 0.3 : 1);
      const cut = (season && !heatOn ? 0.3 : 0) + (wv[2].open && wv[3].open ? 0 : 0.2);
      const bad = cold + hot + noHot + (hs.leak ? 0.5 : 0) + (hs.air ? 0.4 : 0) + cut;
      hs.sat = U.clamp(hs.sat + (bad > 0.05 ? -bad * 0.004 : 0.003), 0, 100);
      G.Ev.complaints(i, cold, hot, noHot, night, season && S.t >= (S.flags.coldGrace || 0));
    }
  }

  function pumpsWear(S) {
    S.pumps.forEach((p, i) => {
      if (!p.on || p.broken) return;
      p.hours += 1 / 60;
      p.lube = Math.max(0, p.lube - 0.006);
      const k = S.upg.vfd[i] ? 0.6 : 1; // частотник: плавный пуск, обороты по нагрузке
      wearRun(p, 0.0011 * (p.lube < 25 ? 3 : 1) * k, 0.0016 * k);
      if (p.bear >= 100) G.Ev.pumpBroke(p);
    });
  }

  function valvesWear(S, t) {
    if (U.mod(t) % 60 !== 30) return;
    for (const v of S.valves) {
      v.cond = Math.max(0, v.cond - 0.006);
      if (v.gland === 0) {
        if (Math.random() < 0.0004 + (100 - v.cond) / 100 * 0.0015) v.gland = 1;
      } else if (v.gland < 3 && Math.random() < 0.006) v.gland++;
    }
  }

  function needs(S, busy) {
    const P = S.p;
    const sleeping = busy && busy.kind === 'sleep';
    if (sleeping) {
      P.energy += busy.regen || (P.home.mattress ? 0.3 : 0.23);
      P.hunger -= 0.02;
      if (P.hunger > 15) P.health += 0.012;
    } else {
      const e = 0.065 * (P.hunger < 15 ? 1.4 : 1) * (P.mood < 20 ? 1.25 : 1) + (busy && busy.work ? busy.work : 0);
      P.energy -= e;
      P.hunger -= 0.05;
    }
    if (P.hunger <= 0) P.health -= 0.04;
    P.mood += (45 - P.mood) * 0.0003;
    P.energy = U.clamp(P.energy, 0, 100);
    P.hunger = U.clamp(P.hunger, 0, 100);
    P.health = U.clamp(P.health, 0, 100);
    P.mood = U.clamp(P.mood, 0, 100);
  }

  // самочувствие дома для точки на улице: 0 — норма, 1 — на грани, 2 — плохо (квартиры — в сезон, ГВС — всегда)
  const houseLevel = (S, hs) => {
    const season = heatSeason(S.t);
    if ((season && (hs.tin < 18.5 || hs.tin > 26)) || hs.ttap < 50) return 2;
    if ((season && (hs.tin < 19.5 || hs.tin > 25)) || hs.ttap < 55) return 1;
    return 0;
  };
  // температура обратной сетевой воды, уходящей на ТЭЦ (после ТО и ВВП)
  const netReturn = (S) => (S.trn === undefined ? 42 : S.trn);
  // грязевик: на сколько процентов он режет расход отопления против чистого (та же гидравлика)
  function clogCut(S) {
    const H = S.heat;
    if (H.q <= 0.5) return 0;
    const n = heads(S, 'heat', H0_H * U.clamp((H.ps - 0.6) / 1.2, 0, 1)), r = R_CTP + network(S);
    const q0 = opPoint(n, A_H, r + R_F0);
    return q0 > 0 ? Math.max(0, Math.round((1 - H.q / q0) * 100)) : 0;
  }
  // перепад на грязевике, бар
  const filterDp = (S) => { const c = S.heat.clog / 100; return R_F0 * (1 + 700 * c * c * c * c) * S.heat.q * S.heat.q; };

  // один шаг = одна игровая минута
  function step(S, busy) {
    S.t += 1;
    const t = S.t, h = U.hour(t);
    weather(S, t);
    const season = heatSeason(t);
    const draw = drawProfile(h);
    circuitHeat(S, season);
    circuitGvs(S, draw);
    houses(S, season, h);
    pumpsWear(S);
    valvesWear(S, t);
    if (season) S.heat.clog = Math.min(100, S.heat.clog + 0.0011 * (qn(S, 'heat') > 0.1 ? 1 : 0) * (S.upg.magnet ? 0.5 : 1));
    S.heat.foul = Math.min(100, S.heat.foul + (season ? 0.0002 : 0));
    S.gvs.foul = Math.min(100, S.gvs.foul + 0.00038);
    const inLeak = leakOf(S, 'heat') + leakOf(S, 'gvs') + (S.heat.qppk || 0) + (S.heat.qw || 0); // ППК сбрасывает в трап
    S.flood = U.clamp(S.flood + inLeak * 8 / 60 - 1.2 / 60, 0, 100);
    needs(S, busy);
    G.Ev.tick(S, season);
  }

  return { step, houseLevel, netReturn, heatLeak, maxT, wellOpen, burstLeakK, burstIsolated, feedNetRate, feedEta, feedFlow, pNetRet, pCold, pAt, foulK, clogCut, filterDp, qn,
    P_LOW, P_CLOSE, P_WARN, P_HIGH, P_HOT, P_PPK, P_NET_S, P_NET_R, Q_NOM, GC_NOM, GN_MAX, GG_MAX, CW, GCAL,
    seasonal, heatSeason, tSched, drawProfile, pumpEff, headOf, pipeOpen, leakOf, sealLeak, valveLeak, flangeLeak, circPumps, anyOn, GLAND };
})();
