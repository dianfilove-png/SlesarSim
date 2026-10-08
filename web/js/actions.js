// Действия героя: работы на ЦТП, быт, магазин, склад
'use strict';

G.Act = (() => {
  const U = G.U, D = G.D, Sim = G.Sim, Ev = G.Ev;
  const inv = (id) => G.S.p.inv[id] || 0;
  const has = (id, n = 1) => inv(id) >= n;
  const take = (id, n = 1) => { const P = G.S.p; P.inv[id] = (P.inv[id] || 0) - n; if (P.inv[id] <= 0) delete P.inv[id]; };
  const tool = (id) => !!G.S.p.tools[id];
  const speed = () => D.RANKS[Ev.rankIdx()].speed * (G.S.p.energy < 15 ? 1.3 : 1);
  const dur = (min) => Math.max(1, Math.round(min * speed()));
  const toast = (t, c) => G.UI.toast(t, c);
  const circName = (c) => (c === 'heat' ? 'отопления' : 'ГВС');
  const after = () => { G.UI.reopen(); };

  function busy(label, min, opts, done) {
    G.Main.startBusy(label, dur(min), opts || {}, () => { done && done(); after(); });
  }

  // ---------- проверки
  const drainText = (c, C) => (C.drain ? 'дождаться 0 бар на дренаже (сейчас ' : 'открыть «Дренаж ' + (c === 'heat' ? 'отопл.' : 'ГВС') + '» и дождаться 0 бар (сейчас ') + C.ps.toFixed(1) + ')';
  function isoReasons(v) {
    const s = G.S, c = D.PIPES[v.pipe].circ, r = [];
    if (Sim.anyOn(s, c)) r.push('остановить насосы ' + circName(c));
    const other = s.valves.find((o) => o.pipe === v.pipe && o !== v);
    if (other.open) r.push('закрыть задвижку ' + other.id + ' на этой же трубе');
    if (s[c].ps > 0.3) r.push(drainText(c, s[c]));
    return r;
  }
  function dryReasons(c) {
    const s = G.S, r = [];
    if (Sim.anyOn(s, c)) r.push('остановить насосы ' + circName(c));
    if (s[c].ps > 0.5) r.push(drainText(c, s[c]));
    return r;
  }
  function needItems(list) {
    const r = [];
    for (const [id, n] of list) if (!has(id, n)) r.push(D.ITEMS[id].name + (n > 1 ? ' ×' + n : '') + ' (есть ' + inv(id) + ')');
    return r;
  }

  // ---------- задвижки
  function valveToggle(i) {
    const s = G.S, v = s.valves[i];
    if (v.broken) return toast('Шпиндель сорван — задвижку только менять', 'bad');
    if (v.stuck) return toast('Задвижка закисла и не проворачивается', 'bad');
    const closing = v.open;
    busy((closing ? 'Закрываю ' : 'Открываю ') + v.id + ' — крутить штурвал…', 5, { work: 0.05 }, () => {
      const idle = s.t - v.lastOp;
      const p = 0.02 + (v.cond < 50 ? (50 - v.cond) / 100 : 0) + (idle > 60 * 1440 ? 0.15 : 0);
      if (Math.random() < p) {
        v.stuck = true;
        toast('Задвижка ' + v.id + ' закисла — штурвал ни в какую!', 'bad');
        return;
      }
      v.open = !v.open;
      v.lastOp = s.t;
      if (!v.gland && v.cond < 60 && Math.random() < 0.06) v.gland = 1;
      toast(v.id + (v.open ? ' открыта' : ' закрыта'));
    });
  }
  function valveUnstick(i, method) {
    const s = G.S, v = s.valves[i];
    if (method === 'wd') {
      if (!has('wd40')) return toast('Нет WD-40', 'bad');
      take('wd40');
      busy('Брызгаю WD-40 и расхаживаю штурвал', 15, { work: 0.08 }, () => {
        if (Math.random() < 0.7 + Ev.rankIdx() * 0.05) { v.stuck = false; v.lastOp = s.t; toast('Пошла родимая! ' + v.id + ' снова крутится.', 'good'); Ev.xp(5); }
        else toast('Не идёт. Дай смазке впитаться и попробуй ещё.', 'bad');
      });
    } else {
      busy('Тяну штурвал газовым ключом с трубой', 10, { work: 0.2 }, () => {
        const r = Math.random();
        if (r < 0.5) { v.stuck = false; v.lastOp = s.t; toast('Сорвал с места! ' + v.id + ' крутится.', 'good'); }
        else if (r < 0.66) { v.broken = true; v.cond = 3; toast('Хрясь! Сорвал шпиндель ' + v.id + '. Теперь только замена.', 'bad'); Ev.mood(-6); }
        else toast('Не поддаётся…', 'bad');
      });
    }
  }
  function valveTighten(i) {
    const v = G.S.valves[i];
    if (!v.gland) return toast('Сальник сухой, тянуть нечего');
    if (v.packing <= 0) return toast('Набивка выработана — подтягивать нечего. Перенабей сальник или меняй задвижку.', 'bad');
    busy('Подтягиваю сальник ' + v.id, 10, { work: 0.04 }, () => {
      v.gland = 0; v.packing--;
      Ev.xp(3);
      toast('Сальник ' + v.id + ' подтянут. Запас подтяжки: ' + v.packing, 'good');
    });
  }
  function valveRepack(i) {
    const s = G.S, v = s.valves[i], c = D.PIPES[v.pipe].circ;
    const r = dryReasons(c).concat(needItems([['packing', 1]]));
    if (r.length) return toast('Сначала: ' + r.join('; '), 'bad');
    G.MG.proc('repack', (q) => {
      take('packing');
      v.packing = 3; v.gland = q < 60 && Math.random() < 0.5 ? 1 : 0;
      s.stats.repairs++;
      Ev.xp(15);
      toast('Сальник ' + v.id + ' перенабит.', 'good');
      after();
    });
  }
  function valveReplace(i) {
    const s = G.S, v = s.valves[i];
    const r = isoReasons(v).concat(needItems([['valve', 1], ['gasket', 2]]));
    if (r.length) return toast('Сначала: ' + r.join('; '), 'bad');
    G.MG.bolts({ title: 'Замена задвижки ' + v.id, swap: 'Снимаю старую задвижку, ставлю новую на свежие прокладки…', swapMin: 20, rust: 0.5 - v.cond / 250 }, (q) => {
      take('valve'); take('gasket', 2);
      Object.assign(v, { cond: 100, gland: 0, packing: 3, stuck: false, broken: false, open: false, replacedAt: s.t, lastOp: s.t,
        flange: Math.random() < (100 - q) / 100 * 0.8 ? 1 : 0 });
      s.stats.repairs++;
      Ev.xp(40); Ev.mood(6);
      toast('Новая задвижка ' + v.id + ' стоит (ЗАКРЫТА). Не забудь открыть задвижки, закрыть дренаж и поднять давление!', q >= 70 ? 'good' : '');
      if (v.flange) G.Ev.msg('Мысли', 'Что-то фланец ' + v.id + ' потеет… Перекосил при затяжке?');
      after();
    });
  }
  function valveRegasket(i) {
    const s = G.S, v = s.valves[i];
    const r = isoReasons(v).concat(needItems([['gasket', 2]]));
    if (r.length) return toast('Сначала: ' + r.join('; '), 'bad');
    G.MG.bolts({ title: 'Замена прокладок ' + v.id, swap: 'Выбиваю старые прокладки, ставлю новые…', swapMin: 10, rust: 0.4 - v.cond / 300 }, (q) => {
      take('gasket', 2);
      v.flange = Math.random() < (100 - q) / 100 * 0.8 ? 1 : 0;
      s.stats.repairs++;
      Ev.xp(20);
      toast(v.flange ? 'Фланец всё равно потеет — перекос.' : 'Прокладки ' + v.id + ' заменены, сухо.', v.flange ? 'bad' : 'good');
      after();
    });
  }

  // ---------- насосы
  function pumpStart(i) {
    const s = G.S, p = s.pumps[i];
    if (s.ev.power) return toast('Нет напряжения на ЦТП!', 'bad');
    if (p.broken) return toast('Насос ' + p.id + ' в аварии — сначала ремонт', 'bad');
    busy('Пуск насоса ' + p.id, 1, {}, () => {
      p.on = true;
      toast('Насос ' + p.id + ' запущен');
      if (s[p.circ].ps < 1) toast('Внимание: в контуре нет давления — насос будет работать всухую!', 'bad');
    });
  }
  function pumpStop(i) {
    const p = G.S.pumps[i];
    busy('Останов насоса ' + p.id, 1, {}, () => { p.on = false; toast('Насос ' + p.id + ' остановлен'); });
  }
  function pumpLube(i) {
    const p = G.S.pumps[i];
    if (!has('grease')) return toast('Нет смазки Литол-24', 'bad');
    busy('Набиваю смазку в подшипники ' + p.id, 10, { work: 0.04 }, () => {
      take('grease');
      p.lube = 100;
      Ev.xp(4);
      toast('Подшипники ' + p.id + ' смазаны', 'good');
    });
  }
  function pumpBearings(i) {
    const s = G.S, p = s.pumps[i];
    const r = (p.on ? ['остановить насос'] : []).concat(needItems([['bearing', 2], ['grease', 1]]));
    if (r.length) return toast('Сначала: ' + r.join('; '), 'bad');
    G.MG.proc('bearings', (q) => {
      take('bearing', 2); take('grease');
      p.bear = Math.round((100 - q) * 0.12); p.broken = false; p.lube = 100; p.serviced = s.t;
      s.stats.repairs++;
      Ev.xp(35); Ev.mood(5);
      toast('Подшипники насоса ' + p.id + ' заменены. Можно запускать.', 'good');
      after();
    }, { pump: p });
  }
  function pumpSeal(i) {
    const s = G.S, p = s.pumps[i];
    const r = (p.on ? ['остановить насос'] : []).concat(needItems([['seal', 1]]));
    if (r.length) return toast('Сначала: ' + r.join('; '), 'bad');
    G.MG.proc('seal', (q) => {
      take('seal');
      p.seal = Math.round((100 - q) * 0.1); p.serviced = s.t;
      s.stats.repairs++;
      Ev.xp(30); Ev.mood(4);
      toast('Торцевое уплотнение ' + p.id + ' заменено. Сухо!', 'good');
      after();
    }, { pump: p });
  }

  // ---------- контуры
  function drain(c) {
    const C = G.S[c];
    busy((C.drain ? 'Закрываю' : 'Открываю') + ' дренаж ' + circName(c), 2, {}, () => {
      C.drain = !C.drain;
      toast('Дренаж ' + circName(c) + (C.drain ? ' открыт — вода уходит в трап' : ' закрыт'));
    });
  }
  function feed() {
    const H = G.S.heat;
    if (G.S.ev.hvs && !H.feed) return toast('Холодной воды нет — подпитывать нечем', 'bad');
    busy((H.feed ? 'Закрываю' : 'Открываю') + ' подпитку', 1, {}, () => {
      H.feed = !H.feed;
      toast(H.feed ? 'Подпитка открыта. Следи за манометром — выше 6 бар опасно!' : 'Подпитка закрыта');
    });
  }
  function corr(d) { const H = G.S.heat; H.corr = U.clamp(H.corr + d, -15, 15); G.UI.reopen(); }
  function gvsSet(d) { const W = G.S.gvs; W.set = U.clamp(W.set + d, 55, 72); G.UI.reopen(); }
  function cleanFilter() {
    const s = G.S;
    const r = dryReasons('heat').concat(needItems([['gasket', 1]]));
    if (r.length) return toast('Сначала: ' + r.join('; '), 'bad');
    G.MG.proc('filter', (q) => {
      take('gasket');
      s.heat.clog = Math.round((100 - q) * 0.1); s.heat.cleanedAt = s.t;
      s.stats.repairs++;
      Ev.xp(25);
      toast('Грязевик чистый. Ведро шлама и пара гаек оттуда!', 'good');
      after();
    });
  }
  function flush(c) {
    const s = G.S;
    const r = dryReasons(c).concat(needItems([['reagent', 1]]));
    if (r.length) return toast('Сначала: ' + r.join('; '), 'bad');
    G.MG.proc('flush', (q) => {
      take('reagent');
      s[c].foul = Math.max(0, s[c].foul - 85 * q / 100); s[c].flushedAt = s.t;
      s.stats.repairs++;
      Ev.xp(40);
      toast('Теплообменник ' + circName(c) + ' промыт.', 'good');
      after();
    });
  }
  function installReg() {
    if (!has('regulator')) return toast('Нужен регулятор подпитки (склад, с 4-го разряда)', 'bad');
    G.MG.proc('regulator', () => {
      take('regulator');
      G.S.heat.auto = true; G.S.heat.feed = false;
      Ev.xp(30);
      toast('Регулятор подпитки стоит — давление в отоплении теперь держится само.', 'good');
      after();
    });
  }

  // ---------- лето: опрессовка и отпуск
  function pressReasons() {
    const s = G.S, H = s.heat, r = [];
    if (Sim.heatSeason(s.t)) r.push('отопительный сезон — испытания только летом');
    if (Sim.anyOn(s, 'heat')) r.push('остановить насосы отопления');
    const cl = s.valves.filter((v) => v.pipe <= 2 && !v.open);
    if (cl.length) r.push('открыть ' + cl.map((v) => v.id).join(', '));
    if (H.drain) r.push('закрыть дренаж отопления');
    if (H.ps < 3) r.push('заполнить систему подпиткой (сейчас ' + H.ps.toFixed(1) + ' бар)');
    return r;
  }
  function pressTest() {
    const r = pressReasons();
    if (r.length) return toast('Сначала: ' + r.join('; '), 'bad');
    G.MG.proc('press', () => {
      const s = G.S, defects = [];
      s.valves.forEach((v) => {
        if (v.pipe > 2) return;
        if (v.gland) defects.push('течь по сальнику ' + v.id);
        if (v.flange) defects.push('течь по фланцу ' + v.id);
        else if (v.cond < 40) { v.flange = 1; defects.push('не выдержал фланец ' + v.id + ' — задвижка старая'); }
      });
      s.pumps.forEach((p) => { if (p.circ === 'heat' && p.seal >= 60) { p.seal = Math.max(p.seal, 76); defects.push('потекло уплотнение насоса ' + p.id); } });
      s.houses.forEach((h, i) => { if (h.leak) defects.push('течь стояка в подвале ' + D.HOUSES[i].name.replace('Дом', 'дома')); });
      const drop = 0.04 + defects.length * 0.18 + Math.random() * 0.04;
      const ok = !defects.length, first = !((s.heat.pressOkAt || -1) > (s.flags.summerFrom || 0));
      if (ok) {
        s.heat.pressOkAt = s.t;
        if (first) {
          s.stats.repairs++;
          Ev.xp(40); Ev.mood(8);
          Ev.msg(Ev.BOSS, 'Акт гидравлических испытаний подписан: 7,5 бар, падение ' + drop.toFixed(2) + ' бар за 10 минут. Молодец!');
        }
      } else { if (first) Ev.xp(10); Ev.mood(-4); }
      s.heat.ps = 4.1;
      G.UI.pressReport(ok, drop, defects);
    });
  }
  function vacation() {
    const s = G.S, d = U.date(s.t), P = s.p;
    if (!(d.m === 5 || d.m === 6 || (d.m === 7 && d.d <= 15))) return toast('Отпуск дают летом: с 1 июня по 15 августа', 'bad');
    if (P.vacYear === d.y) return toast('В этом году отпуск уже был', 'bad');
    if (P.trust < 40) return toast('Петрович: «Какой отпуск? Сначала порядок наведи!»', 'bad');
    const pay = Math.round(D.RANKS[Ev.rankIdx()].salary * 0.45);
    P.vacYear = d.y;
    P.money += pay; s.stats.earned += pay;
    Ev.skipTime(14 * 1440);
    P.energy = 100; P.hunger = 80; P.health = Math.min(100, P.health + 25);
    Ev.mood(40);
    G.Main.enter('home');
    Ev.msg('Отпуск', 'Две недели на даче: рыбалка, баня, огород. Отдохнул! Отпускные: ' + U.money(pay) + '. На ЦТП подменял Михалыч.', true);
  }

  // ---------- обход
  function findingText(x) {
    const s = G.S;
    switch (x.k) {
      case 'gland': return 'Течь по сальнику задвижки ' + s.valves[x.i].id;
      case 'flange': return 'Течь по фланцу задвижки ' + s.valves[x.i].id;
      case 'old': return 'Задвижка ' + s.valves[x.i].id + ' в плохом состоянии';
      case 'lube': return 'Насос ' + s.pumps[x.i].id + ': подшипники без смазки';
      case 'bear': return 'Насос ' + s.pumps[x.i].id + ': шум и вибрация подшипников';
      case 'seal': return 'Насос ' + s.pumps[x.i].id + ': течь по валу';
      case 'clog': return 'Грязевик забит, большой перепад';
      case 'foul': return (x.c === 'heat' ? 'ТО отопления' : 'ВВП ГВС') + ' зарос накипью';
      case 'flood': return 'Вода на полу';
      default: return '?';
    }
  }
  function obhod() {
    if (G.S.scene !== 'ctp') return;
    busy('Обход ЦТП: осмотр, показания, запись в журнал', 35, { work: 0.03 }, () => {
      const s = G.S, f = [];
      s.valves.forEach((v, i) => {
        if (v.flange) f.push({ k: 'flange', i }); else if (v.gland) f.push({ k: 'gland', i });
        if (v.cond < 30 || v.broken) f.push({ k: 'old', i });
      });
      s.pumps.forEach((p, i) => {
        if (p.lube < 30) f.push({ k: 'lube', i });
        if (p.bear >= 65 && !p.broken) f.push({ k: 'bear', i });
        if (p.seal >= 75) f.push({ k: 'seal', i });
      });
      if (s.heat.clog >= 60) f.push({ k: 'clog' });
      if (s.heat.foul >= 60) f.push({ k: 'foul', c: 'heat' });
      if (s.gvs.foul >= 62) f.push({ k: 'foul', c: 'gvs' });
      if (s.flood > 20) f.push({ k: 'flood' });
      const H = s.heat, W = s.gvs;
      const text = 'Т1 ' + U.deg(H.t1) + '/' + H.p1.toFixed(1) + ' бар; Т2 ' + U.deg(H.t2) + '/' + H.p2.toFixed(1) +
        '; Т3 ' + U.deg(W.t3) + '/' + W.p3.toFixed(1) + '; Т4 ' + U.deg(W.t4) + '/' + W.p4.toFixed(1) +
        '. ' + (f.length ? 'Замечания: ' + f.map(findingText).join('; ') + '.' : 'Замечаний нет.');
      s.journal.findings = f;
      s.journal.lastObhod = U.day(s.t);
      s.journal.lastObhodT = s.t;
      s.journal.entries.unshift({ t: s.t, text });
      if (s.journal.entries.length > 20) s.journal.entries.length = 20;
      Ev.xp(5);
      G.UI.obhodReport(f.map(findingText));
    });
  }

  // ---------- быт
  function eat(id) {
    const s = G.S, it = D.ITEMS[id], P = s.p;
    if (!has(id)) return;
    if (it.where === 'home' && s.scene !== 'home') return toast('Это готовить дома', 'bad');
    if (it.where === 'kettle' && s.scene !== 'home' && s.scene !== 'ctp') return toast('Нужен чайник — дома или на ЦТП', 'bad');
    busy(id === 'coffee' ? 'Пью кофе' : 'Ем: ' + it.name, id === 'pelmeni' ? 20 : 10, {}, () => {
      take(id);
      if (it.food) P.hunger = Math.min(100, P.hunger + it.food);
      if (it.energy) P.energy = Math.min(100, P.energy + it.energy);
      if (it.health) P.health = Math.min(100, P.health + it.health);
      if (it.mood) Ev.mood(it.mood);
    });
  }
  function machineCoffee() {
    const P = G.S.p;
    if (G.S.t - (P.lastCoffee || -1e9) < 240) return toast('Хватит кофе, сердце не казённое', 'bad');
    busy('Кофемашина жужжит…', 5, {}, () => { P.lastCoffee = G.S.t; P.energy = Math.min(100, P.energy + 25); Ev.mood(2); });
  }
  function sleep(mode) {
    const s = G.S;
    let min;
    if (mode === 'night') min = U.nextAt(s.t, 7 * 60) - s.t;
    else if (mode === 'nap') min = 60;
    else min = 120;
    const regen = mode === 'nap' ? 0.15 : undefined;
    G.Main.startBusy(mode === 'night' ? 'Сплю… (до 7:00)' : 'Дремлю…', min, { kind: 'sleep', regen, interruptible: true }, () => {
      if (mode === 'night') Ev.mood(3);
      after();
    });
  }
  function tv() {
    const P = G.S.p;
    busy('Смотрю телевизор', 60, {}, () => { Ev.mood(P.home.bigtv ? 20 : 10); });
  }
  function shower() {
    const s = G.S, tt = s.houses[0].ttap;
    busy('Принимаю душ', 15, {}, () => {
      if (tt >= 50) { Ev.mood(7); s.p.health = Math.min(100, s.p.health + 2); toast('Хорошо! Горячая вода ' + U.deg(tt) + '.', 'good'); }
      else { Ev.mood(-6); toast('Брр! Из крана ' + U.deg(tt) + '. Сапожник без сапог…', 'bad'); }
    });
  }
  function read() {
    const P = G.S.p;
    if ((P.readToday || 0) >= 2) return toast('Голова уже не варит. Завтра почитаешь.', 'bad');
    busy('Читаю справочник по теплотехнике', 60, { work: 0.03 }, () => { P.readToday = (P.readToday || 0) + 1; Ev.xp(14); Ev.mood(-2); toast('+14 опыта', 'good'); });
  }
  function fishing() {
    const d = U.date(G.S.t);
    if (U.isWorkday(G.S.t)) return toast('Рыбалка — только в выходные', 'bad');
    if (d.m >= 11 || d.m <= 1) { /* зимняя рыбалка тоже норм */ }
    busy('На «Ниве» на рыбалку', 300, { work: 0.02 }, () => { Ev.mood(30); G.S.p.hunger -= 10; toast('Поймал трёх окуней. Душа отдохнула!', 'good'); });
  }

  // ---------- дома квартала
  function bleedAir(i) {
    const hs = G.S.houses[i];
    busy('Поднимаюсь на верхние этажи, спускаю воздух кранами Маевского', 25, { work: 0.06 }, () => {
      if (hs.air) { hs.air = 0; Ev.xp(5); toast('Воздух спущен, стояки зашумели водой', 'good'); }
      else toast('Воздуха нет — батареи полные');
    });
  }
  function clampLeak(i) {
    const hs = G.S.houses[i];
    if (!has('clamp')) return toast('Нужен ремонтный хомут', 'bad');
    busy('Ставлю хомут на стояк в подвале', 30, { work: 0.08 }, () => { take('clamp'); hs.leak = 0; Ev.xp(5); toast('Хомут стоит, течь устранена', 'good'); });
  }
  function meter(i) {
    const k = Ev.openTask('meter', i);
    if (!k) return toast('Показания уже сняты');
    busy('Снимаю показания теплосчётчика', 10, {}, () => { k.doneFlag = true; });
  }
  function job(id) {
    const k = G.S.tasks.find((x) => x.id === id);
    if (!k || k.done || k.failed) return;
    busy('Шабашка: ' + k.job, k.min, { work: 0.05 }, () => { k.doneFlag = true; Ev.mood(3); });
  }
  function callBrigade() {
    const B = G.S.ev.burst;
    if (!B || B.called !== null) return toast('Аварийка уже вызвана');
    busy('Звоню в аварийную службу', 5, {}, () => {
      B.called = G.S.t;
      G.Ev.msg('Аварийная служба', 'Принято, бригада выезжает. Будем минут через сорок.');
    });
  }
  function talk(i) {
    const hs = G.S.houses[i];
    busy('Разговариваю с жильцами у подъезда', 10, {}, () => {
      let t;
      if (hs.sat > 75) { t = '«Спасибо, сынок, тепло у нас, вода горячая!»'; Ev.mood(4); }
      else if (hs.sat > 50) t = '«Да вроде нормально всё. Только вот трубы гудят иногда.»';
      else if (hs.sat > 25) { t = '«Безобразие! То холодно, то воды нет. В управляющую будем писать!»'; Ev.mood(-3); }
      else { t = '«Ах ты ж бездельник! Мы уже в прокуратуру написали!»'; Ev.mood(-6); }
      G.UI.say(D.HOUSES[i].name, t);
    });
  }

  // ---------- тепловые камеры перед домами
  const TK = (i) => 'ТК-' + (i + 1);
  const WPIPE = ['Т1', 'Т2', 'Т3', 'Т4'];
  // шанс закиснуть: задвижки в камерах годами не трогают
  const wellStickP = (v) => 0.04 + U.clamp((G.S.t - v.lastOp) / 1440 - 30, 0, 300) / 1000;
  function wellDown(i) {
    const s = G.S, B = s.ev.burst;
    busy('Поддеваю люк крюком, спускаюсь в камеру ' + TK(i), 4, { work: 0.04 }, () => {
      s.well = i;
      G.Main.enter('well');
      if (B && B.house === i && !Sim.burstIsolated(s)) {
        s.p.health = Math.max(1, s.p.health - 8); Ev.mood(-4);
        toast('Внизу пар и кипяток по щиколотку — ошпарился! Закрывай ' + (B.pipe === 'heat' ? 'Т1 и Т2' : 'Т3 и Т4') + ' и наверх.', 'bad');
      }
    });
  }
  // после закрытия задвижки: порыв на этом вводе отсечён?
  function checkIsolated(i) {
    const s = G.S, B = s.ev.burst;
    if (!B || B.house !== i || !Sim.burstIsolated(s)) return;
    toast('Порыв отсечён — вода больше не уходит!', 'good');
    if (!B.arrived && !B.selfIso) {
      B.selfIso = true;
      Ev.xp(15); Ev.trust(2); Ev.mood(5);
      Ev.msg(Ev.ODS, 'Слесарь сам перекрыл ввод в камере ' + TK(i) + ' — молодец, оперативно!' + (B.called === null ? ' Бригаду-то вызвал?' : ''));
    }
  }
  function wellToggle(i, k) {
    const s = G.S, v = s.wells[i].v[k];
    if (v.broken) return toast('Шпиндель сорван — эту задвижку заменят подрядчики', 'bad');
    if (v.stuck) return toast('Задвижка закисла и не проворачивается', 'bad');
    const closing = v.open;
    busy((closing ? 'Закрываю ' : 'Открываю ') + WPIPE[k] + ' в ' + TK(i) + ' — тесно, штурвал тугой…', 6, { work: 0.07 }, () => {
      if (Math.random() < wellStickP(v)) {
        v.stuck = true;
        toast('Задвижка ' + WPIPE[k] + ' закисла — штурвал ни в какую! Нужна WD-40.', 'bad');
        return;
      }
      v.open = !v.open;
      v.lastOp = s.t;
      toast(WPIPE[k] + ' на ' + D.HOUSES[i].name.replace('Дом', 'дом') + (v.open ? ' открыта' : ' закрыта'));
      if (!v.open) checkIsolated(i);
    });
  }
  function wellUnstick(i, k, method) {
    const s = G.S, w = s.wells[i], v = w.v[k];
    if (method === 'wd') {
      if (!has('wd40')) return toast('Нет WD-40', 'bad');
      take('wd40');
      busy('Брызгаю WD-40 на шпиндель и расхаживаю штурвал', 15, { work: 0.08 }, () => {
        if (Math.random() < 0.7 + Ev.rankIdx() * 0.05) { v.stuck = false; v.lastOp = s.t; toast('Пошла! ' + WPIPE[k] + ' в ' + TK(i) + ' крутится.', 'good'); Ev.xp(5); }
        else toast('Не идёт. Дай смазке впитаться и попробуй ещё.', 'bad');
      });
    } else {
      busy('Тяну штурвал газовым ключом с трубой', 10, { work: 0.2 }, () => {
        const r = Math.random();
        if (r < 0.5) { v.stuck = false; v.lastOp = s.t; toast('Сорвал с места! ' + WPIPE[k] + ' крутится.', 'good'); }
        else if (r < 0.66) {
          v.broken = true; v.stuck = false;
          if (w.fixAt === null) w.fixAt = U.nextAt(s.t + 12 * 60, 14 * 60);
          Ev.mood(-6);
          toast('Хрясь! Сорвал шпиндель ' + WPIPE[k] + '.', 'bad');
          Ev.msg(Ev.BOSS, 'Сорвал шпиндель в ' + TK(i) + '? Вызову подрядчиков, заменят ' + U.dateStr(w.fixAt) + ' к ' + U.clock(w.fixAt) + '.');
        } else toast('Не поддаётся…', 'bad');
      });
    }
  }
  // ревизия: закрыть и открыть каждую задвижку, чтобы не закисали
  function wellRevise(i) {
    const s = G.S, w = s.wells[i];
    if (w.v.some((v) => !v.open)) return toast('Сначала открой все задвижки — ревизия на работающей камере', 'bad');
    busy('Ревизия ' + TK(i) + ': расхаживаю задвижки, смазываю шпиндели', 25, { work: 0.08 }, () => {
      const bad = [];
      w.v.forEach((v, k) => {
        if (v.broken) { bad.push(WPIPE[k] + ' — сорван шпиндель'); return; }
        if (v.stuck) { bad.push(WPIPE[k] + ' — закисла'); return; }
        if (Math.random() < wellStickP(v) * 0.4) { v.stuck = true; bad.push(WPIPE[k] + ' — закисла'); return; }
        v.lastOp = s.t;
      });
      if (!bad.length) { w.revAt = s.t; Ev.xp(8); toast('Ревизия ' + TK(i) + ': все четыре задвижки ходят. Записал в журнал.', 'good'); }
      else toast('Ревизия ' + TK(i) + ' не закончена: ' + bad.join(', ') + '.', 'bad');
    });
  }

  // ---------- магазин и склад
  function shopOpen() { const h = U.hour(G.S.t); return h >= 8 && h < 22; }
  function buy(id) {
    const P = G.S.p, it = D.ITEMS[id];
    if (!shopOpen()) return toast('Магазин закрыт (8:00–22:00)', 'bad');
    if (P.money < it.price) return toast('Не хватает денег', 'bad');
    if ((it.kind === 'tool' && P.tools[id]) || (it.kind === 'home' && P.home[id])) return;
    P.money -= it.price;
    if (it.kind === 'tool') P.tools[id] = true;
    else if (it.kind === 'home') { P.home[id] = true; Ev.mood(it.price >= 100000 ? 40 : 10); if (id === 'car') G.Ev.msg('Мысли', 'Своя «Нива»! Теперь по выходным — на рыбалку.'); }
    else P.inv[id] = (P.inv[id] || 0) + (it.uses || 1);
    G.UI.toast('Куплено: ' + it.name, 'good');
    G.UI.reopen();
  }
  function orderArrive() { return U.nextAt(G.S.t + 60, 9 * 60); }
  function order(items) {
    const s = G.S;
    const day = U.day(s.t);
    if (s.sklad.lastDay === day) return toast('Склад принимает одну заявку в день', 'bad');
    let sum = 0, n = 0;
    for (const id in items) { sum += D.ITEMS[id].price * items[id]; n += items[id]; }
    if (!n) return toast('Пустая заявка');
    if (s.sklad.spent + sum > D.SKLAD_LIMIT) return toast('Превышен лимит склада на месяц', 'bad');
    s.sklad.spent += sum;
    s.sklad.lastDay = day;
    s.orders.push({ items, arrive: orderArrive() });
    G.Ev.msg('Склад УК', 'Заявка принята, привезём на ЦТП-7 к 9:00 (' + U.dateStr(orderArrive()) + ').');
    G.UI.reopen();
  }

  return { inv, has, tool, dur, isoReasons, dryReasons, needItems, valveToggle, valveUnstick, valveTighten, valveRepack,
    valveReplace, valveRegasket, pumpStart, pumpStop, pumpLube, pumpBearings, pumpSeal, drain, feed, corr, gvsSet,
    cleanFilter, flush, installReg, obhod, eat, machineCoffee, sleep, tv, shower, read, fishing, bleedAir, clampLeak,
    meter, job, callBrigade, talk, wellDown, wellToggle, wellUnstick, wellRevise, wellStickP, shopOpen, buy, order, circName, take, pressReasons, pressTest, vacation };
})();
