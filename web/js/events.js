// События, заявки, сообщения, календарь работы
'use strict';

G.Ev = (() => {
  const U = G.U, D = G.D;
  const BOSS = 'Петрович (мастер участка)';
  const ODS = 'Диспетчер ОДС';

  // [опыт, доверие]
  const REWARD = {
    obhod: [10, 1], lube: [15, 2], replaceValve: [60, 5], fixGland: [20, 2], switchPumps: [15, 2],
    cleanFilter: [40, 3], flush: [60, 4], heat: [15, 2], overheat: [12, 1], hot: [15, 2], air: [15, 1],
    leak: [20, 2], meter: [8, 1], job: [10, 0], pumpFix: [40, 3], restart: [10, 1], burst: [30, 3],
    bearings: [35, 3], pumpSeal: [30, 3], heatOff: [5, 1], pressTest: [50, 4], pumpRev: [35, 3], readiness: [30, 4], heatStart: [30, 3],
    wellOpen: [10, 1], wellRev: [40, 3],
  };
  const TK = (i) => 'ТК-' + (i + 1);
  const before = (i) => D.HOUSES[i].name.replace('Дом', 'домом');
  const pipesOf = (c) => (c === 'heat' ? 'Т1 и Т2' : 'Т3 и Т4');
  // ---------- лето: готовность к сезону
  function readinessIssues(s) {
    const r = [];
    if (!((s.heat.pressOkAt || -1) > (s.flags.summerFrom || 0))) r.push('нет акта гидравлических испытаний (опрессовки)');
    s.valves.filter((v) => v.pipe <= 2).forEach((v) => {
      if (v.broken || v.cond < 40) r.push('задвижка ' + v.id + ' изношена — менять');
      else if (v.gland || v.flange) r.push('течь на задвижке ' + v.id);
    });
    s.pumps.filter((p) => p.circ === 'heat').forEach((p) => {
      if (p.broken || p.bear >= 60) r.push('насос ' + p.id + ': подшипники');
      if (p.seal >= 70) r.push('насос ' + p.id + ': уплотнение');
    });
    if (s.heat.clog >= 40) r.push('грязевик не почищен');
    if (s.heat.foul >= 50) r.push('ТО отопления не промыт');
    return r;
  }
  // абсолютное время ближайшей даты (месяц 0..11, число, час)
  function tOf(s, month, day, hour) {
    let dd = U.day(s.t);
    for (let i = 0; i < 400; i++, dd++) { const x = U.date(dd * 1440); if (x.m === month && x.d === day) return dd * 1440 + hour * 60; }
    return s.t + 30 * 1440;
  }
  function summerPlan(s) {
    const dl = tOf(s, 7, 31, 18), from = s.flags.summerFrom || 0;
    const made = [];
    const add = (o) => { addTask(Object.assign({ deadline: dl, plan: true }, o)); made.push(o.title); };
    // что уже сделано после закрытия сезона — в план не попадает
    if (!((s.heat.pressOkAt || -1) > from)) add({ type: 'pressTest', title: 'Опрессовка отопления', desc: 'Гидравлические испытания системы отопления на 7,5 бар. Кнопка — в шкафу или у подпитки (насосы стоят, задвижки открыты, система заполнена).' });
    [0, 1].forEach((i) => { if (!((s.pumps[i].serviced || -1) > from)) add({ type: 'pumpRev', ref: i, title: 'Ревизия насоса ' + s.pumps[i].id, desc: 'Заменить подшипники или уплотнение насоса ' + s.pumps[i].id + ' — перебрать перед зимой.' }); });
    if (!openTask('cleanFilter') && !((s.heat.cleanedAt || -1) > from)) add({ type: 'cleanFilter', title: 'Почистить грязевик', desc: 'Перед сезоном грязевик должен быть чистым.' });
    if (!s.wells.every((w) => w.revAt > from) && !openTask('wellRev')) add({ type: 'wellRev', from, title: 'Ревизия тепловых камер', desc: 'Спуститься в камеры ТК-1…ТК-5 (люки перед домами) и расходить задвижки, чтобы при порыве не закисли. Закисшие — WD-40.' });
    if (s.heat.foul >= 35 && !openFlush('heat')) add({ type: 'flush', circ: 'heat', title: 'Промыть ТО отопления', desc: 'Промыть пластинчатый теплообменник отопления реагентом.' });
    // задвижки, которые к 1 сентября износятся ниже нормы комиссии (40%)
    s.valves.filter((v) => v.pipe <= 2 && (v.cond < 60 || v.broken)).forEach((v) => {
      const i = s.valves.indexOf(v);
      if (!openTask('replaceValve', i)) add({ type: 'replaceValve', ref: i, title: 'Заменить задвижку ' + v.id, desc: 'Задвижка ' + v.id + ' изношена (' + Math.round(v.cond) + '%) — заменить летом, пока отопление стоит. Склад — не больше лимита в месяц.' });
    });
    msg(BOSS, (made.length ? 'План летнего ремонта до 31 августа: ' + made.join('; ') + '.' : 'Летний план: всё уже сделано — молодец!') + ' Первого сентября — комиссия по готовности к зиме!', true);
  }
  function commission(s) {
    const r = readinessIssues(s);
    if (!r.length) {
      s.p.money += 10000; s.stats.earned += 10000; trust(6); mood(10);
      msg('Комиссия по готовности', 'Паспорт готовности ЦТП-7 к отопительному сезону подписан! Премия 10 000 ₽.', true);
    } else {
      trust(-6); mood(-6);
      msg('Комиссия по готовности', 'Паспорт не подписан. Замечания: ' + r.join('; ') + '. Устранить до 20 сентября!', true);
      if (!openTask('readiness')) addTask({ type: 'readiness', title: 'Устранить замечания комиссии', desc: r.join('; ') + '.', deadline: tOf(s, 8, 20, 18) });
    }
  }

  const FAIL = { heat: 4, overheat: 2, hot: 4, air: 2, leak: 3, meter: 2, job: 0, obhod: 0, restart: 3, burst: 6, switchPumps: 2, lube: 3, wellOpen: 3, wellRev: 3 };
  const EMERGENCY = ['heat', 'hot', 'pumpFix', 'restart', 'burst', 'leak'];

  const sustained = (k, ok) => {
    if (!ok) { k.goodSince = null; return false; }
    if (k.goodSince === null) k.goodSince = G.S.t;
    return G.S.t - k.goodSince >= 30;
  };
  const CHECK = {
    obhod: (k, s) => s.journal.lastObhodT >= k.created,
    lube: (k, s) => s.pumps[k.ref].lube >= 80,
    bearings: (k, s) => s.pumps[k.ref].bear < 30 && !s.pumps[k.ref].broken,
    pumpSeal: (k, s) => s.pumps[k.ref].seal < 30,
    replaceValve: (k, s) => s.valves[k.ref].replacedAt >= k.created,
    fixGland: (k, s) => s.valves[k.ref].gland === 0 && !s.valves[k.ref].flange,
    switchPumps: (k, s) => k.was.every((i) => !s.pumps[i].on) && k.was.every((i) => s.pumps.some((p) => p.circ === s.pumps[i].circ && p.on)),
    cleanFilter: (k, s) => s.heat.cleanedAt >= k.created,
    flush: (k, s) => s[k.circ].flushedAt >= k.created,
    heat: (k, s) => sustained(k, s.houses[k.ref].tin >= 19.5),
    overheat: (k, s) => sustained(k, s.houses[k.ref].tin <= 25),
    hot: (k, s) => sustained(k, s.houses[k.ref].ttap >= 53),
    air: (k, s) => s.houses[k.ref].air === 0,
    leak: (k, s) => s.houses[k.ref].leak === 0,
    meter: (k) => !!k.doneFlag,
    job: (k) => !!k.doneFlag,
    pumpFix: (k, s) => !s.pumps[k.ref].broken,
    restart: (k, s) => (!G.Sim.heatSeason(s.t) || s.heat.q > 0.5) && s.gvs.q > 0.3,
    burst: (k, s) => !s.ev.burst || s.ev.burst.called !== null,
    heatOff: (k, s) => !s.pumps.some((p) => p.circ === 'heat' && p.on),
    pressTest: (k, s) => (s.heat.pressOkAt || -1) >= k.created,
    pumpRev: (k, s) => (s.pumps[k.ref].serviced || -1) >= k.created,
    readiness: (k, s) => readinessIssues(s).length === 0,
    heatStart: (k, s) => s.heat.q > 0.5 && s.heat.t1 > 38,
    wellOpen: (k, s) => G.Sim.wellOpen(s, k.ref, k.circ),
    wellRev: (k, s) => s.wells.every((w) => w.revAt > (k.from === undefined ? k.created : k.from)),
  };

  function msg(from, text, urgent) {
    const s = G.S;
    s.msgs.unshift({ t: s.t, from, text, read: false, urgent: !!urgent });
    if (s.msgs.length > 80) s.msgs.length = 80;
    if (G.UI) G.UI.onMessage(from, text, !!urgent);
  }
  const alarm = (text) => msg(ODS, text, true);

  function addTask(o) {
    const s = G.S;
    const rw = REWARD[o.type] || [10, 1];
    const k = Object.assign({ id: s.nextId++, created: s.t, done: false, failed: false, goodSince: null,
      xp: rw[0], trust: rw[1], money: 0, excuse: !!(s.ev.netDrop || s.ev.hvs || s.ev.power) }, o);
    s.tasks.push(k);
    if (G.UI) G.UI.dirty = true;
    return k;
  }
  const openTask = (type, ref) => G.S.tasks.find((k) => !k.done && !k.failed && k.type === type && (ref === undefined || k.ref === ref));
  const openFlush = (c) => G.S.tasks.find((k) => !k.done && !k.failed && k.type === 'flush' && k.circ === c);
  const openTasks = () => G.S.tasks.filter((k) => !k.done && !k.failed);

  function xp(n) {
    const s = G.S, P = s.p;
    const before = rankIdx();
    P.xp += Math.round(n * (P.mood < 20 ? 0.5 : 1));
    const after = rankIdx();
    if (after > before) {
      P.mood = Math.min(100, P.mood + 20);
      msg(BOSS, 'Поздравляю! Комиссия присвоила тебе ' + D.RANKS[after].r + '-й разряд. Оклад теперь ' +
        U.money(D.RANKS[after].salary) + '.' + (after === 1 ? ' И на складе теперь можно взять регулятор подпитки.' : ''), true);
    }
  }
  function rankIdx() {
    const x = G.S.p.xp;
    let r = 0;
    D.RANKS.forEach((k, i) => { if (x >= k.xp) r = i; });
    return r;
  }
  function trust(delta) {
    const P = G.S.p;
    P.trust = U.clamp(P.trust + delta, 0, 100);
    if (P.trust <= 0 && !G.S.over) G.Main.gameOver('fired');
  }
  function mood(delta) { G.S.p.mood = U.clamp(G.S.p.mood + delta, 0, 100); }

  function complete(k, s) {
    k.done = true;
    k.doneAt = s.t;
    xp(k.xp);
    if (k.trust) trust(k.trust);
    let money = k.money || 0;
    const h = U.hour(s.t);
    if ((h < 6 || h >= 22) && EMERGENCY.includes(k.type)) money += 700;
    if (money) { s.p.money += money; s.stats.earned += money; s.stats.earnBy = s.stats.earnBy || {}; s.stats.earnBy[k.type] = (s.stats.earnBy[k.type] || 0) + money; }
    mood(2);
    s.stats.tasksDone++;
    G.UI && G.UI.toast('✔ ' + k.title + ' — выполнено (+' + k.xp + ' опыта' + (money ? ', +' + U.money(money) : '') + ')', 'good');
  }
  function fail(k, s) {
    k.failed = true;
    k.doneAt = s.t;
    const pen = k.excuse ? 1 : (FAIL[k.type] !== undefined ? FAIL[k.type] : 5);
    if (pen) trust(-pen);
    mood(-4);
    s.stats.tasksFailed++;
    s.stats.failBy = s.stats.failBy || {};
    s.stats.failBy[k.type] = (s.stats.failBy[k.type] || 0) + 1;
    if (k.type === 'job') msg(k.who || 'Жилец', 'Ну и не надо, другого мастера найду.');
    else if (pen) msg(BOSS, 'Заявка «' + k.title + '» просрочена. Жильцы жалуются в управляющую компанию, мне выговор!');
    if (k.type === 'burst' && s.ev.burst && s.ev.burst.called === null) {
      s.ev.burst.called = s.t;
      msg(ODS, 'Аварийную бригаду на порыв вызвали сами. Почему слесарь не сообщил?!');
    }
    // новый порыв на этой же трубе — открывать нельзя, бригада копает
    const B = s.ev.burst;
    if (k.type === 'wellOpen' && !(B && B.house === k.ref && B.pipe === k.circ)) {
      D.WELL_PIPES[k.circ].forEach((n) => Object.assign(s.wells[k.ref].v[n], { open: true, stuck: false, broken: false, lastOp: s.t }));
      msg(BOSS, 'Михалыч открыл за тебя задвижки в ' + TK(k.ref) + ' — дом без ' + (k.circ === 'heat' ? 'тепла' : 'горячей воды') + ' сидел!');
    }
  }

  function checkTasks(s) {
    for (const k of s.tasks) {
      if (k.done || k.failed) continue;
      const f = CHECK[k.type];
      if (f && f(k, s)) complete(k, s);
      else if (k.deadline && s.t > k.deadline) fail(k, s);
    }
  }

  const COMPL = {
    heat: (hs) => ({ title: 'Холодно', text: 'Батареи еле тёплые, дома ' + U.deg1(hs.tin) + '! Сколько можно мёрзнуть?', dl: 240 }),
    overheat: (hs) => ({ title: 'Жарко', text: 'Жарища ' + U.deg1(hs.tin) + ', окна нараспашку! Убавьте отопление!', dl: 360 }),
    hot: (hs) => ({ title: 'Нет горячей воды', text: hs.ttap < 25 ? 'Горячей воды нет вообще! Как мыться?' : 'Из крана горячей воды течёт еле тёплая, ' + U.deg(hs.ttap) + '!', dl: 240 }),
    air: () => ({ title: 'Завоздушило', text: 'На верхних этажах стояки холодные, в батареях булькает. Спустите воздух!', dl: 1440 }),
  };
  function complain(i, type) {
    const s = G.S, hs = s.houses[i], hd = D.HOUSES[i];
    hs.last[type] = s.t;
    const c = COMPL[type](hs);
    const who = U.pick(D.NAMES);
    const apt = U.rint(1, hd.apts);
    msg(who + ', ' + hd.name + ', кв. ' + apt, c.text, type !== 'air');
    // дом отсечён на время ремонта порыва — жильцов предупредили, спрос мягче
    const ex = s.ev.burst && s.ev.burst.house === i ? { excuse: true } : {};
    addTask(Object.assign({ type, ref: i, title: c.title + ': ' + hd.name, desc: c.text, deadline: s.t + c.dl, who }, ex));
    s.stats.complaints++;
  }
  function complaints(i, cold, hot, noHot, night) {
    const s = G.S, hs = s.houses[i];
    const f = night ? 0.15 : 1;
    const ready = (type) => !openTask(type, i) && s.t - (hs.last[type] || -1e9) > 360;
    if (cold > 0.3 && ready('heat') && Math.random() < cold * 0.0015 * f) complain(i, 'heat');
    else if (hot > 0.3 && ready('overheat') && Math.random() < hot * 0.0012 * f) complain(i, 'overheat');
    else if (noHot > 0.3 && ready('hot') && Math.random() < noHot * 0.0015 * f) complain(i, 'hot');
    else if (hs.air && ready('air') && Math.random() < 0.0015 * f) complain(i, 'air');
  }

  function pumpBroke(p) {
    const s = G.S;
    p.bear = 100; p.broken = true; p.on = false;
    trust(-2);
    const i = s.pumps.indexOf(p);
    alarm('Авария насоса ' + p.id + ': заклинило подшипник! Запусти резервный насос.');
    if (!openTask('pumpFix', i)) addTask({ type: 'pumpFix', ref: i, title: 'Отремонтировать насос ' + p.id, desc: 'Заменить подшипники аварийного насоса.', deadline: s.t + 3 * 1440 });
  }
  function blowout() {
    const s = G.S;
    const vs = s.valves.filter((v) => v.pipe <= 2 && !v.flange);
    if (!vs.length) return;
    const v = U.pick(vs);
    v.flange = 2;
    trust(-3);
    alarm('Давление в отоплении ' + s.heat.ps.toFixed(1) + ' бар — сорвало прокладку на фланце задвижки ' + v.id + '! Закрой подпитку!');
    addTask({ type: 'fixGland', ref: s.valves.indexOf(v), title: 'Сменить прокладки ' + v.id, desc: 'После перепрессовки течёт фланец задвижки ' + v.id + '.', deadline: s.t + 1440 });
  }

  function passOut() {
    if (G.busy && G.busy.kind === 'sleep') return;
    const s = G.S;
    if (U.isWorkday(s.t) && U.hour(s.t) >= 8 && U.hour(s.t) < 17 && s.scene !== 'home') trust(-2);
    mood(-8);
    G.Main.forceSleep(240, 'Силы кончились — ты отключился прямо здесь…');
  }
  function hospital() {
    const s = G.S, P = s.p;
    skipTime(3 * 1440);
    P.health = 65; P.hunger = 70; P.energy = 80; P.mood = 30;
    P.money -= 4000;
    trust(-5);
    s.scene = 'home';
    msg('Поликлиника №3', 'Три дня на больничном. Лекарства обошлись в 4 000 ₽. Питайся и высыпайся!', true);
    msg(BOSS, 'Пока ты болел, на ЦТП подменял Михалыч. Выздоравливай.');
  }

  // пропуск времени (больничный, отпуск): мир стоит, сроки задач сдвигаются (кроме летнего плана), зарплата приходит
  function skipTime(mins) {
    const s = G.S, t0 = s.t;
    s.t += mins;
    for (const k of s.tasks) if (k.deadline && !k.plan) k.deadline += mins;
    s.ev.inspect = null;
    for (let dd = U.day(t0); dd <= U.day(s.t); dd++) {
      const at = dd * 1440 + 10 * 60, x = U.date(at);
      if ((x.d === 5 || x.d === 20) && at > t0 && at <= s.t) payday(x.d);
    }
  }

  function payday(dd) {
    const s = G.S, P = s.p;
    const sal = D.RANKS[rankIdx()].salary;
    let sum, text;
    if (dd === 20) { sum = Math.round(sal * 0.4); text = 'Аванс: ' + U.money(sum) + '.'; }
    else if (U.day(s.t) < 10) return;
    else {
      const prem = P.trust >= 75 ? 0.25 : P.trust >= 55 ? 0.12 : 0;
      const ps = Math.round(sal * prem);
      sum = Math.round(sal * 0.6) + ps;
      text = 'Зарплата: ' + U.money(sum) + (ps ? ' (в т.ч. премия ' + U.money(ps) + ')' : ' (премии нет — доверие начальства низкое)') + '.';
    }
    P.money += sum;
    s.stats.earned += sum;
    mood(10);
    msg('Бухгалтерия УК', text, true);
  }

  function inspectionResult() {
    const s = G.S;
    s.ev.inspect = null;
    let pen = 0;
    const notes = [];
    if (s.scene !== 'ctp') { pen += 4; notes.push('приехал — а слесаря на месте нет'); }
    if (s.flood > 25) { pen += 3; notes.push('на полу лужи'); }
    let leaks = 0;
    s.valves.forEach((v) => { if (v.gland >= 2 || v.flange) leaks++; });
    s.pumps.forEach((p) => { if (p.seal >= 75) leaks++; if (p.broken) pen += 2; });
    if (leaks) { pen += Math.min(4, leaks); notes.push('течи: ' + leaks); }
    if (s.journal.lastObhod !== U.day(s.t)) { pen += 2; notes.push('журнал обхода не заполнен'); }
    if (!pen) {
      trust(4);
      s.p.money += 2000;
      s.stats.earned += 2000;
      msg(BOSS, 'Проверка: порядок! Молодец. Выпишу премию 2 000 ₽.', true);
    } else {
      trust(-pen);
      msg(BOSS, 'Проверка: ' + notes.join(', ') + '. Недоволен! (доверие −' + pen + ')', true);
    }
  }

  function bossFromJournal(s) {
    const f = s.journal.findings || [];
    if (s.journal.lastObhod < U.day(s.t) - 1) return;
    let made = 0;
    for (const x of f) {
      if (made >= 2) break;
      let o = null;
      if (x.k === 'gland' || x.k === 'flange') {
        const v = s.valves[x.i];
        if ((v.gland || v.flange) && !openTask('fixGland', x.i) && !openTask('replaceValve', x.i))
          o = { type: 'fixGland', ref: x.i, title: 'Устранить течь ' + v.id, desc: 'По журналу: течь на задвижке ' + v.id + '. Подтяни/перенабей сальник или смени прокладки.', deadline: s.t + 4 * 1440 };
      } else if (x.k === 'old') {
        if (!openTask('replaceValve', x.i)) o = { type: 'replaceValve', ref: x.i, title: 'Заменить задвижку ' + s.valves[x.i].id, desc: 'Задвижка ' + s.valves[x.i].id + ' дышит на ладан. Заказать на складе и заменить.', deadline: s.t + 10 * 1440 };
      } else if (x.k === 'lube') {
        if (!openTask('lube', x.i)) o = { type: 'lube', ref: x.i, title: 'Смазать насос ' + s.pumps[x.i].id, desc: 'Подшипники насоса ' + s.pumps[x.i].id + ' без смазки.', deadline: s.t + 3 * 1440 };
      } else if (x.k === 'bear') {
        if (!openTask('bearings', x.i) && !openTask('pumpFix', x.i)) o = { type: 'bearings', ref: x.i, title: 'Подшипники насоса ' + s.pumps[x.i].id, desc: 'Насос ' + s.pumps[x.i].id + ' шумит — заменить подшипники, пока не заклинило.', deadline: s.t + 6 * 1440 };
      } else if (x.k === 'seal') {
        if (!openTask('pumpSeal', x.i)) o = { type: 'pumpSeal', ref: x.i, title: 'Уплотнение насоса ' + s.pumps[x.i].id, desc: 'Течёт по валу насоса ' + s.pumps[x.i].id + '. Заменить торцевое уплотнение.', deadline: s.t + 5 * 1440 };
      } else if (x.k === 'clog') {
        if (!openTask('cleanFilter')) o = { type: 'cleanFilter', title: 'Почистить грязевик', desc: 'Перепад на грязевике большой — забит. Почистить (контур нужно остановить и сдренировать).', deadline: s.t + 5 * 1440 };
      } else if (x.k === 'foul') {
        if (!openFlush(x.c)) o = { type: 'flush', circ: x.c, title: 'Промыть ' + (x.c === 'heat' ? 'ТО отопления' : 'ВВП ГВС'), desc: (x.c === 'heat' ? 'Теплообменник' : 'Подогреватель ГВС') + ' зарос, не держит температуру. Промыть реагентом.', deadline: s.t + 7 * 1440 };
      }
      if (o) { addTask(o); made++; msg(BOSS, 'Прочитал журнал. ' + o.desc); }
    }
  }

  function startGame() {
    const s = G.S;
    msg(BOSS, 'Здорово! С сегодняшнего дня ЦТП-7 — твоё хозяйство. На тебе квартал: пять домов и четыре трубы — Т1/Т2 отопление, Т3/Т4 горячая вода. Рабочий день с 8:00, каждый день — обход и запись в журнал.');
    msg(BOSS, 'Задвижка Зд5 на Т3 течёт по сальнику, набивка вся вышла. Закажи новую задвижку через телефон на складе — привезут утром — и меняй. Т3 — это горячая вода, отопление не трогай! Остановить насосы ГВС (Н3, Н4), закрыть вторую задвижку на Т3 (Зд6) и открыть «Дренаж ГВС».');
    addTask({ type: 'obhod', title: 'Обход ЦТП', desc: 'Сделать обход оборудования и записать в журнал (стол на посту).', deadline: 17 * 60 });
    addTask({ type: 'lube', ref: 2, title: 'Смазать насос Н3', desc: 'Насос ГВС Н3 гудит — подшипники сухие. Смажь Литолом.', deadline: s.t + 3 * 1440 });
    addTask({ type: 'replaceValve', ref: 4, title: 'Заменить задвижку Зд5', desc: 'Т3, задвижка Зд5 течёт. Заказать на складе и заменить.', deadline: s.t + 6 * 1440 });
    s.msgs.forEach((m) => { m.read = false; });
  }

  // ---------- случайные и плановые события
  const per = (perDay, windowMin) => Math.random() < perDay / (windowMin || 1440);

  function tick(s, season) {
    const t = s.t, m = U.mod(t), d = U.date(t), wd = U.isWorkday(t), day = U.day(t);
    checkTasks(s);
    const E = s.ev;
    if (E.netDrop && t >= E.netDrop.until) { E.netDrop = null; msg(ODS, 'ТЭЦ восстановила температуру в сети.'); }
    if (E.power && t >= E.power.until) {
      E.power = null;
      alarm('Напряжение на ЦТП-7 восстановлено. Насосы стоят — запусти их!');
      if (!openTask('restart')) addTask({ type: 'restart', title: 'Запустить насосы после отключения', desc: 'После отключения света насосы сами не запускаются.', deadline: t + 120, excuse: false });
    }
    if (E.hvs && t >= E.hvs.until) { E.hvs = null; msg(ODS, 'Водоканал подал холодную воду, ГВС восстанавливается.'); }
    if (E.netOff) {
      if (!E.netOff.started && t >= E.netOff.from) { E.netOff.started = true; msg('Теплосеть', 'Начались испытания магистрали — горячей воды в квартале нет 10 дней. Жильцы в курсе.', true); }
      if (t >= E.netOff.until) { E.netOff = null; s.flags.hotGrace = t + 150; msg('Теплосеть', 'Испытания окончены, сетевую воду дали. Проверь ГВС: насос, задвижки, температура.', true); }
    }
    if (E.burst) {
      const B = E.burst, tk = TK(B.house), iso = G.Sim.burstIsolated(s);
      // аварийка перекрывает ответвление сама — теми же задвижками в камере перед домом
      const close = () => D.WELL_PIPES[B.pipe].forEach((n) => Object.assign(s.wells[B.house].v[n], { open: false, stuck: false, broken: false, lastOp: t }));
      if (B.called !== null && !B.arrived && t >= B.called + 40) {
        B.arrived = true;
        B.fixAt = t + (iso ? 300 : 360);
        if (!iso) close();
        msg('Аварийная бригада', iso ? 'Приехали. Задвижки в камере ' + tk + ' уже закрыты — молодец, слесарь! Копаем, часов пять.'
          : 'Спустились в камеру ' + tk + ' перед ' + before(B.house) + ', перекрыли ' + pipesOf(B.pipe) + '. Копаем, часов шесть.' + (B.pipe === 'heat' ? ' Подпитай систему!' : ''), true);
      } else if (B.arrived && !iso) {
        close(); trust(-3);
        msg('Аварийная бригада', 'Кто открыл задвижки в ' + tk + '?! Нас в котловане кипятком окатило! Закрыли обратно.', true);
      }
      if (B.arrived && t >= B.fixAt) {
        E.burst = null;
        msg('Аварийная бригада', 'Порыв заварили, яму засыпали. Задвижки в камере ' + tk + ' оставили закрытыми — спустись и открой ' + pipesOf(B.pipe) + (B.pipe === 'heat' ? ', потом проверь давление в отоплении.' : '.'), true);
        if (!G.S.tasks.some((k) => k.type === 'wellOpen' && !k.done && !k.failed && k.ref === B.house && k.circ === B.pipe)) addTask({ type: 'wellOpen', ref: B.house, circ: B.pipe, title: 'Открыть задвижки в ' + tk, desc: 'Порыв устранён. Спуститься в камеру ' + tk + ' (люк на тротуаре перед ' + before(B.house) + ') и открыть ' + pipesOf(B.pipe) + ' — дом сидит без ' + (B.pipe === 'heat' ? 'отопления' : 'горячей воды') + '.', deadline: t + 180, excuse: false });
      }
    }
    // сорванный шпиндель в камере меняют подрядчики
    s.wells.forEach((w, i) => {
      if (w.fixAt === null || t < w.fixAt) return;
      w.fixAt = null;
      w.v.forEach((v) => { if (v.broken) Object.assign(v, { broken: false, stuck: false, lastOp: t }); });
      msg(BOSS, 'Подрядчики заменили задвижку в камере ' + TK(i) + '. Положение оставили как было — проверь.');
    });
    if (E.inspect && t >= E.inspect.at) inspectionResult();
    if (s.wx.snap && t >= s.wx.snap.until) s.wx.snap = null;

    // ---- плановые
    if (m === 8 * 60 + 15 && wd && s.flags.late !== day && s.scene === 'home') {
      s.flags.late = day; trust(-2); mood(-3);
      msg(BOSS, 'Ты где?! Рабочий день с восьми. Опоздание — пишу в табель.', true);
    }
    if (m === 17 * 60 && wd && s.journal.lastObhod !== day && s.flags.obhodChecked !== day) {
      s.flags.obhodChecked = day; trust(-3);
      msg(BOSS, 'Журнал обхода сегодня пустой. Порядок есть порядок — минус к премии.');
    }
    if (m === 9 * 60) {
      for (const o of s.orders) if (!o.done && o.arrive <= t) {
        o.done = true;
        for (const id in o.items) s.p.inv[id] = (s.p.inv[id] || 0) + o.items[id] * (D.ITEMS[id].uses || 1);
        msg('Склад УК', 'Заказ доставлен на ЦТП-7: ' + Object.keys(o.items).map((id) => D.ITEMS[id].name + ' ×' + o.items[id]).join(', ') + '.');
      }
      s.orders = s.orders.filter((o) => !o.done);
      if (wd) bossFromJournal(s);
      if (d.wd === 1 && wd && !openTask('switchPumps')) {
        const was = s.pumps.map((p, i) => (p.on ? i : -1)).filter((i) => i >= 0);
        if (was.length) addTask({ type: 'switchPumps', was, title: 'Перейти на резервные насосы', desc: 'Еженедельно: остановить работающие насосы и запустить резервные, чтобы износ был равномерным.', deadline: t + 2 * 1440 - 60 * 16 });
      }
      if (d.d === 23) {
        D.HOUSES.forEach((h, i) => addTask({ type: 'meter', ref: i, title: 'Показания теплосчётчика: ' + h.name, desc: 'Снять показания узла учёта в подвале.', deadline: t + 3 * 1440 }));
        msg(BOSS, 'Двадцать третье — снимаем показания теплосчётчиков во всех домах. Три дня тебе.');
      }
      if (d.m === 8 && d.d === 25) msg(BOSS, 'Через неделю отопительный сезон. Проверь насосы и задвижки!');
    }
    // ---- сезонные: по дате, а не по минуте — чтобы больничный или отпуск их не перескочили
    if (m >= 9 * 60) {
      if (d.m === 9 && d.d <= 3 && d.y > 2026 && s.flags.startYear !== d.y) {
        s.flags.startYear = d.y;
        msg(BOSS, 'Приказ: начинаем отопительный сезон! Запускай отопление ' + (m < 12 * 60 ? 'до вечера' : 'как можно скорее') + ': задвижки, давление ~4 бар, насос. Чек-лист — в шкафу.', true);
        s.flags.seasonEnd = false;
        s.flags.coldGrace = t + 48 * 60; // квартиры за лето остыли — жильцы знают, что отопление пускают, двое суток терпят
        if (!openTask('heatStart')) addTask({ type: 'heatStart', title: 'Пуск отопления', desc: 'Запустить отопление квартала: открыть задвижки Т1/Т2, подпитать до ~4 бар, запустить Н1 или Н2.', deadline: t + 9 * 60 });
        U.pick([[0, 2, 4], [1, 3], [0, 3, 4], [2, 4]]).forEach((i) => { s.houses[i].air = 1; });
      }
      if ((d.m === 4 && d.d >= 18 || d.m === 5) && s.flags.seasonEnd && s.flags.planYear !== d.y) { s.flags.planYear = d.y; summerPlan(s); }
      if (d.m === 5 && !E.netOff && s.flags.netOffYear !== d.y) {
        s.flags.netOffYear = d.y;
        const from = t + U.rint(2, 19) * 1440;
        E.netOff = { from, until: from + 10 * 1440, started: false };
        msg('Теплосеть', 'Плановые гидравлические испытания магистрали: с ' + U.dateStr(from) + ' горячей воды не будет 10 дней. Лучшее время перебрать ВВП и насосы ГВС.');
      }
    }
    if (m === 10 * 60 && (d.d === 5 || d.d === 20)) payday(d.d);
    if (m >= 10 * 60 && d.m === 8 && d.d <= 5 && d.y > 2026 && s.flags.commYear !== d.y) { s.flags.commYear = d.y; commission(s); }
    if (m === 0) {
      let avg = 0;
      s.houses.forEach((h) => { avg += h.sat; });
      avg /= s.houses.length;
      trust(U.clamp((avg - 55) / 20, -2, 2));
      s.tasks = s.tasks.filter((k) => !(k.done || k.failed) || t - k.doneAt < 1440);
      s.p.readToday = 0;
      if (d.m !== s.sklad.month) { s.sklad.month = d.m; s.sklad.spent = 0; }
    }
    if (!s.flags.seasonEnd && (d.m === 4 && (d.d > 15 || (d.d === 15 && m >= 12 * 60)) || (d.m > 4 && d.m < 9))) {
      s.flags.seasonEnd = true;
      s.flags.summerFrom = t;
      s.flags.coldGrace = tOf(s, 9, 3, 9); // осенью до пуска отопления на холод не жалуются
      s.p.money += 15000;
      msg(BOSS, 'Отопительный сезон закрыт! Держи премию 15 000 ₽. Останови насосы отопления — летом ремонтная кампания, план пришлю.', true);
      if (!openTask('heatOff')) addTask({ type: 'heatOff', title: 'Остановить отопление', desc: 'Сезон закрыт: остановить насосы отопления Н1/Н2.', deadline: t + 2 * 1440 });
      G.UI && G.UI.victory();
    }

    // ---- случайные
    if (season && (d.m >= 10 || d.m <= 2) && !s.wx.snap && per(0.07)) {
      const delta = -U.rint(9, 15);
      s.wx.snap = { delta, until: t + U.rint(2, 5) * 1440 };
      msg('Гидрометцентр', 'Идёт резкое похолодание: ночью до ' + U.deg(G.Sim.seasonal(d.doy) - 3 + delta) + '. Проверьте отопление!');
    } else if (season && (d.m === 11 || d.m <= 1) && !s.wx.snap && per(0.03)) {
      s.wx.snap = { delta: U.rint(6, 10), until: t + U.rint(2, 4) * 1440 };
      msg('Гидрометцентр', 'Оттепель! Днём до ' + U.deg(G.Sim.seasonal(d.doy) + 3 + s.wx.snap.delta) + '. Возможен перетоп в домах.');
    }
    if (season && !E.netDrop && per(0.025)) {
      E.netDrop = { until: t + U.rint(240, 600), delta: U.rint(15, 30) };
      msg(ODS, 'Авария на магистрали ТЭЦ: температура в сети снижена на ' + E.netDrop.delta + '°. Держитесь.', true);
    }
    if (!E.power && per(0.02)) {
      E.power = { until: t + U.rint(30, 150) };
      s.pumps.forEach((p) => { p.on = false; });
      alarm('На ЦТП-7 пропало напряжение! Все насосы встали.');
    }
    if (!E.hvs && per(0.012)) {
      E.hvs = { until: t + U.rint(120, 360) };
      msg(ODS, 'Водоканал отключил холодную воду в квартале — горячей тоже не будет. Подпитка отопления невозможна.', true);
    }
    // порыв на вводе в дом: отопление — только в сезон, ГВС — круглый год (кроме летнего отключения)
    const heatBurst = season && per(0.012);
    if (!E.burst && (heatBurst || (!(E.netOff && E.netOff.started) && per(0.005)))) {
      const i = U.rint(0, 4), pipe = heatBurst ? 'heat' : 'gvs', hn = D.HOUSES[i].name.replace('Дом', 'дома');
      E.burst = { house: i, pipe, at: t, called: null, arrived: false, fixAt: null };
      msg(U.pick(D.NAMES) + ', ' + D.HOUSES[i].name, pipe === 'heat' ? 'Возле нашего дома из-под земли валит пар! Порыв!' : 'У нас перед домом из-под асфальта бьёт горячая вода, всё в пару! Порыв!', true);
      addTask({ type: 'burst', ref: i, title: (pipe === 'heat' ? 'Порыв теплотрассы у ' : 'Порыв ГВС у ') + hn,
        desc: 'Вызвать аварийную бригаду (у дома или по телефону). Чтобы не терять воду — спуститься в камеру ' + TK(i) + ' (люк перед домом) и закрыть ' + pipesOf(pipe) + ' на ответвлении. ' +
          (pipe === 'heat' ? 'Следить за давлением — подпитка!' : 'Пока хлещет — в квартале падает давление и температура горячей воды.'), deadline: t + 120 });
    }
    if (wd && m >= 9 * 60 && m <= 15 * 60 && !E.inspect && s.flags.lastInspect !== day && per(0.12, 360)) {
      s.flags.lastInspect = day;
      E.inspect = { at: t + 60 };
      msg(BOSS, 'Через час заеду на ЦТП с проверкой. Чтоб всё блестело и журнал был заполнен!', true);
    }
    if (m >= 9 * 60 && m <= 20 * 60 && per(0.3, 660) && s.tasks.filter((k) => k.type === 'job' && !k.done && !k.failed).length < 2) {
      const i = U.rint(0, 4), hd = D.HOUSES[i], job = U.pick(D.JOBS);
      const pay = Math.round(U.rnd(job.pay[0], job.pay[1]) / 100) * 100;
      const who = U.pick(D.NAMES);
      const apt = U.rint(1, hd.apts);
      msg(who, 'Добрый день! ' + hd.name + ', кв. ' + apt + '. Можете ' + job.text + '? Заплачу ' + U.money(pay) + '.');
      addTask({ type: 'job', ref: i, apt, job: job.text, min: job.min, money: pay, who, title: 'Шабашка: ' + hd.name + ', кв. ' + apt, desc: job.text[0].toUpperCase() + job.text.slice(1) + '. Оплата ' + U.money(pay) + '.', deadline: t + 2 * 1440 });
    }
    if (per(0.05)) {
      const free = s.houses.filter((h) => !h.leak);
      if (free.length) {
        const hs = U.pick(free), i = s.houses.indexOf(hs);
        hs.leak = 1;
        msg('Старшая по дому, ' + D.HOUSES[i].name, 'В подвале течёт стояк, воды уже по щиколотку!', true);
        addTask({ type: 'leak', ref: i, title: 'Течь в подвале: ' + D.HOUSES[i].name, desc: 'Наложить ремонтный хомут на стояк в подвале.', deadline: t + 480 });
      }
    }
    if (season && per(0.08)) { const hs = U.pick(s.houses); hs.air = 1; }
    if (m >= 18 * 60 && m <= 22 * 60 && per(0.06, 240)) {
      const f = U.pick([
        ['Мама', 'Сынок, ты поел? Шапку надевай, холодно!', 3],
        ['Колян', 'В субботу в гараж приходи, шашлыки!', 2],
        ['Сестра', 'Как ты там? Племянник спрашивает, когда в гости придёшь.', 3],
        ['Петрович', 'Нормально работаешь. Так держать.', 4],
        ['Сосед дядя Миша', 'Слышь, сантехник, у тебя ключа на 32 не будет?', 0],
      ]);
      msg(f[0], f[1]);
      mood(f[2]);
    }
  }

  return { readinessIssues, msg, alarm, addTask, openTask, openTasks, xp, trust, mood, rankIdx, complaints, pumpBroke, blowout, passOut,
    hospital, skipTime, startGame, tick, BOSS, ODS };
})();
