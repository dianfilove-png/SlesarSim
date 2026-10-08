// Физика: погода, контуры отопления и ГВС, дома, износ, потребности героя
'use strict';

G.Sim = (() => {
  const U = G.U, D = G.D;
  const GLAND = [0, 0.03, 0.1, 0.3]; // бар/ч течи по сальнику

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
  const headOf = (S, c) => {
    let best = 0, n = 0;
    for (const p of S.pumps) if (p.circ === c && p.on && !p.broken) { best = Math.max(best, pumpEff(p)); n++; }
    return n > 1 ? Math.min(1.08, best + 0.06) : best;
  };
  const pipeOpen = (S, pipe) => S.valves.every((v) => v.pipe !== pipe || v.open);
  const sealLeak = (p) => (p.seal >= 100 ? 0.8 : p.seal >= 75 ? 0.05 + (p.seal - 75) * 0.004 : 0);
  const flangeLeak = (v) => (v.flange > 1 ? 1.2 : v.flange ? 0.35 : 0);
  const valveLeak = (v) => GLAND[v.gland] + flangeLeak(v);
  const leakOf = (S, c) => {
    let sum = 0;
    for (const v of S.valves) if (D.PIPES[v.pipe].circ === c) sum += valveLeak(v);
    for (const p of S.pumps) if (p.circ === c) sum += sealLeak(p);
    return sum;
  };
  const circPumps = (S, c) => S.pumps.filter((p) => p.circ === c);
  // пороги давления отопления (статика, бар): норма P_LOW..P_HIGH, подпитку закрывать с P_CLOSE
  const P_LOW = 3.5, P_CLOSE = 4, P_WARN = 4.6, P_HIGH = 5, FEED_RATE = 0.06;
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
  // все утечки отопления, бар/ч: ЦТП, подвалы домов, порыв теплотрассы
  const heatLeak = (S) => {
    let leak = leakOf(S, 'heat');
    S.houses.forEach((h, i) => { if (h.leak && wellOpen(S, i, 'heat')) leak += 0.06; });
    if (S.ev.burst && S.ev.burst.pipe === 'heat') leak += 3 * burstLeakK(S);
    return leak;
  };
  // чистое изменение давления отопления при открытой подпитке, бар/мин
  const feedNetRate = (S) => (S.ev.hvs ? 0 : FEED_RATE) - heatLeak(S) / 60 - (S.heat.drain ? 1 : 0);
  const anyOn = (S, c) => S.pumps.some((p) => p.circ === c && p.on);
  // насос «на закрытую задвижку»: на ЦТП задвижки открыты — значит, перекрыты все камеры
  const deadMsg = (p, ctpOpen) => (ctpOpen ? 'Насос ' + p.id + ' качает в закрытые камеры: во всех ТК перекрыт ввод на дома!' : 'Насос ' + p.id + ' работает на закрытую задвижку!');

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
  }

  function wearRun(p, rateBear, rateSeal) { p.bear = Math.min(100, p.bear + rateBear); p.seal = Math.min(110, p.seal + rateSeal); }

  function circuitHeat(S, season) {
    const H = S.heat;
    const head = headOf(S, 'heat');
    // все дома отсечены в камерах — насосу некуда качать, как на закрытую задвижку
    const ctpOpen = pipeOpen(S, 1) && pipeOpen(S, 2), open = ctpOpen && S.wells.some((w, i) => wellOpen(S, i, 'heat'));
    const air = U.clamp((H.ps - 0.6) / 1.2, 0, 1);
    const q = head * (open ? 1 : 0) * (1 - H.clog / 100 * 0.75) * air;
    H.q += (q - H.q) * 0.3;
    if (H.q < 0.001) H.q = 0;

    const leak = heatLeak(S);
    let dps = -leak / 60;
    if (H.drain) dps -= H.ps * 0.18 + 0.02;
    if (H.auto) { if (H.ps < 3.8) H.autoOn = true; else if (H.ps > 4.2) H.autoOn = false; }
    const feeding = (H.feed || (H.auto && H.autoOn)) && !S.ev.hvs;
    if (feeding) dps += FEED_RATE;
    if (H.feed && H.ps > P_WARN && !H.feedWarn) {
      H.feedWarn = true;
      if (S.speed > 1) S.speed = 1;
      G.Ev.msg('Мысли', 'Манометр отопления ' + H.ps.toFixed(1) + ' бар — пора закрывать подпитку!');
    }
    if (!H.feed || H.ps < P_CLOSE) H.feedWarn = false;
    H.ps = U.clamp(H.ps + dps, 0, 9);

    const sched = tSched(S.tout) + H.corr;
    const maxT = S.tnet - 4 - H.foul * 0.25;
    const flowing = H.q > 0.05;
    const goal = season && flowing ? Math.min(sched, maxT) : 22;
    const k = flowing ? 0.06 : 0.008;
    H.t1 += (goal - H.t1) * k;
    let tin = 0;
    for (const h of S.houses) tin += h.tin;
    tin /= S.houses.length;
    const t2goal = flowing ? tin + (H.t1 - tin) * (0.62 + 0.25 * (1 - Math.min(1, H.q))) : 22;
    H.t2 += (t2goal - H.t2) * k;
    H.p1 = H.ps + (head > 0 && H.ps > 0.3 ? (open ? 1.9 * head * (1 - H.clog / 300) : 0.25 * head) : 0);
    H.p2 = Math.max(0, H.ps - 0.15 * H.q);

    // насос на закрытую задвижку или без воды
    for (const p of circPumps(S, 'heat')) {
      if (!p.on || p.broken) continue;
      if (H.ps < 0.8) {
        wearRun(p, 0.25, 0.15);
        if (!p.dryMsg) {
          p.dryMsg = true;
          G.Ev.alarm('Насос ' + p.id + ' всухую — нет давления в отоплении! ' + (S.ev.hvs ? 'Стоп насос: нет ХВС, подпитать нечем.'
            : 'Стоп насос' + (H.drain ? ', закрой дренаж' : '') + ', подпитка до 4 бар (чек-лист в шкафу).'));
        }
      } else p.dryMsg = false;
      if (!open) {
        wearRun(p, 0.01, 0.04);
        if (!p.deadMsg) { p.deadMsg = true; G.Ev.alarm(deadMsg(p, ctpOpen)); }
      } else p.deadMsg = false;
    }
    // завоздушивание стояков при низком давлении
    if (season && head > 0 && H.ps < 1.6) {
      for (const h of S.houses) if (!h.air && Math.random() < 0.004) h.air = 1;
    }
    // перепрессовка при забытой подпитке
    if (H.blowCd > 0) H.blowCd--;
    if (H.ps > 6.5 && H.blowCd <= 0 && Math.random() < 0.025) {
      H.blowCd = 120;
      G.Ev.blowout();
    }
    if (H.ps < 2 && !H.lowAlarm && (season || anyOn(S, 'heat'))) {
      H.lowAlarm = true;
      G.Ev.alarm('Падение давления в отоплении: ' + H.ps.toFixed(1) + ' бар! Нужна подпитка.');
    } else if (H.ps > 3) H.lowAlarm = false;
  }

  function circuitGvs(S, draw) {
    const W = S.gvs;
    const head = headOf(S, 'gvs');
    const open3 = pipeOpen(S, 3), open4 = pipeOpen(S, 4);
    // порыв на вводе ГВС: давление падает, ВВП не успевает греть такой расход
    const gb = S.ev.burst && S.ev.burst.pipe === 'gvs' ? burstLeakK(S) : 0;
    if (W.drain) W.ps += (0 - W.ps) * 0.2;
    else if (!S.ev.hvs) W.ps += (4.6 - leakOf(S, 'gvs') * 0.4 - gb * 2.2 - W.ps) * 0.15;
    else W.ps = Math.max(0, W.ps - 0.004 - draw * 0.02 - gb * 0.02);
    const loop = S.wells.some((w, i) => wellOpen(S, i, 'gvs'));
    const circ = head * (open3 && open4 && loop ? 1 : 0) * (W.ps > 1 ? 1 : 0);
    W.q += (circ - W.q) * 0.3;
    if (W.q < 0.001) W.q = 0;
    const hasWater = W.ps > 1 && open3;
    const maxT = S.tnet - 3 - W.foul * 0.15;
    const goal = hasWater ? Math.min(W.set, maxT) - gb * 12 : 20;
    W.t3 += (goal - W.t3) * (hasWater ? 0.08 : 0.01);
    const t4goal = hasWater ? W.t3 - (W.q > 0.3 ? 6 : 22) : 20;
    W.t4 += (t4goal - W.t4) * 0.05;
    W.p3 = W.ps + (head > 0 && open3 && open4 ? 0.35 * head : 0);
    W.p4 = Math.max(0, W.ps - W.q * 0.4);
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

  function houses(S, season, h, draw) {
    const H = S.heat, W = S.gvs;
    const gvsOK = W.ps > 1 && pipeOpen(S, 3);
    const night = h < 6 || h >= 23;
    for (let i = 0; i < S.houses.length; i++) {
      const hd = D.HOUSES[i], hs = S.houses[i], wv = S.wells[i].v;
      const heatOn = wellOpen(S, i, 'heat');
      const qh = heatOn ? H.q * hd.dist : 0;
      const t1h = H.t1 - (1 - hd.dist) * 10;
      const tavg = (t1h + H.t2) / 2;
      const kRad = 0.718 * Math.pow(U.clamp(qh, 0, 1.1), 0.35) * (hs.air ? 0.82 : 1);
      const heatIn = kRad * Math.max(0, tavg - hs.tin);
      const loss = hd.kLoss * (hs.tin - S.tout);
      hs.tin += 0.0006 * (heatIn + 3 - loss);

      let tt;
      if (!gvsOK || !wv[2].open) tt = 12;
      else {
        const circOK = W.q > 0.3 && wv[3].open;
        const l = circOK ? 2 + (1 - hd.dist) * 25 : (8 + (1 - hd.dist) * 120) * (1 - 0.6 * draw);
        tt = W.t3 - l;
      }
      hs.ttap += (tt - hs.ttap) * 0.06;

      const cold = season && S.t >= (S.flags.coldGrace || 0) ? Math.max(0, 18.5 - hs.tin) : 0;
      const hot = Math.max(0, hs.tin - 26) * 0.6;
      const noHot = S.ev.hvs || (S.ev.netOff && S.ev.netOff.started) || S.t < (S.flags.hotGrace || 0) ? 0 : Math.max(0, 52 - hs.ttap) / 8 * (night ? 0.3 : 1);
      const cut = (season && !heatOn ? 0.3 : 0) + (wv[2].open && wv[3].open ? 0 : 0.2);
      const bad = cold + hot + noHot + (hs.leak ? 0.5 : 0) + (hs.air ? 0.4 : 0) + cut;
      hs.sat = U.clamp(hs.sat + (bad > 0.05 ? -bad * 0.004 : 0.003), 0, 100);
      G.Ev.complaints(i, cold, hot, noHot, night);
    }
  }

  function pumpsWear(S) {
    for (const p of S.pumps) {
      if (!p.on || p.broken) continue;
      p.hours += 1 / 60;
      p.lube = Math.max(0, p.lube - 0.006);
      wearRun(p, 0.0011 * (p.lube < 25 ? 3 : 1), 0.0016);
      if (p.bear >= 100) G.Ev.pumpBroke(p);
    }
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

  // температура обратной сетевой воды, уходящей на ТЭЦ
  const netReturn = (S) => (heatSeason(S.t) && S.heat.q > 0.05 ? Math.min(S.tnet - 10, S.heat.t2 + 6) : 42);

  // один шаг = одна игровая минута
  function step(S, busy) {
    S.t += 1;
    const t = S.t, h = U.hour(t);
    weather(S, t);
    const season = heatSeason(t);
    const draw = drawProfile(h);
    circuitHeat(S, season);
    circuitGvs(S, draw);
    houses(S, season, h, draw);
    pumpsWear(S);
    valvesWear(S, t);
    if (season) S.heat.clog = Math.min(100, S.heat.clog + 0.0011 * (S.heat.q > 0.1 ? 1 : 0));
    S.heat.foul = Math.min(100, S.heat.foul + (season ? 0.0002 : 0));
    S.gvs.foul = Math.min(100, S.gvs.foul + 0.00038);
    const inLeak = leakOf(S, 'heat') + leakOf(S, 'gvs');
    S.flood = U.clamp(S.flood + inLeak * 8 / 60 - 1.2 / 60, 0, 100);
    needs(S, busy);
    G.Ev.tick(S, season);
  }

  return { step, netReturn, heatLeak, wellOpen, burstLeakK, burstIsolated, feedNetRate, P_LOW, P_CLOSE, P_WARN, P_HIGH, FEED_RATE, seasonal, heatSeason, tSched, drawProfile, pumpEff, headOf, pipeOpen, leakOf, sealLeak,
    valveLeak, flangeLeak, circPumps, anyOn, GLAND };
})();
