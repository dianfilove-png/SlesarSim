// Состояние игры, новая игра, сохранение
'use strict';

G.St = (() => {
  const KEY = 'slesarsim_save_v1';

  // тепловая камера: 4 задвижки на ответвлении к дому (Т1–Т4), годами не тронутые — могут закиснуть
  function newWell() {
    return { revAt: -1, fixAt: null, v: [0, 1, 2, 3].map(() => ({ open: true, stuck: false, broken: false, lastOp: -Math.round(120 + Math.random() * 300) * 1440 })) };
  }
  // старые сохранения: до камер дом отсекала аварийка флагом cutoff
  function migrate(S) {
    if (!S.wells) {
      S.wells = G.D.HOUSES.map(() => newWell());
      const B = S.ev && S.ev.burst;
      if (B) {
        B.pipe = B.pipe || 'heat';
        if (B.isolated) { B.arrived = true; G.D.WELL_PIPES.heat.forEach((k) => { S.wells[B.house].v[k].open = false; }); }
      }
    }
    if (S.well === undefined) S.well = 0;
    S.houses.forEach((h) => { delete h.cutoff; });
    return S;
  }

  function newGame() {
    const D = G.D;
    const S = {
      v: 1,
      t: 7 * 60, // 1 октября, 07:00
      speed: 1,
      scene: 'home',
      house: 1,
      well: 0,
      px: 1070,
      wx: { dev: 0, snap: null, snow: false },
      tout: 8, tnet: 75,
      ev: { netDrop: null, power: null, hvs: null, burst: null, inspect: null },
      p: {
        energy: 85, hunger: 70, health: 90, mood: 60, money: 6500, xp: 0, trust: 60,
        inv: { sandwich: 2, doshirak: 2, coffee: 3, grease: 2, gasket: 2, wd40: 2 },
        tools: {}, home: {}, sleepingSince: null,
      },
      heat: { ps: 4.1, drain: false, feed: false, auto: false, autoOn: false, q: 0.9, t1: 52, t2: 40, p1: 6, p2: 4, corr: 0,
        foul: 22, clog: 38, lowAlarm: false, flushedAt: -1, cleanedAt: -1, blowCd: 0 },
      gvs: { ps: 4.6, drain: false, q: 0.9, t3: 60, t4: 54, p3: 4.9, p4: 4.4, set: 62, foul: 40, lowAlarm: false, flushedAt: -1 },
      pumps: [
        { id: 'Н1', circ: 'heat', on: true, broken: false, bear: 34, seal: 22, lube: 45, hours: 8400 },
        { id: 'Н2', circ: 'heat', on: false, broken: false, bear: 15, seal: 12, lube: 70, hours: 6100 },
        { id: 'Н3', circ: 'gvs', on: true, broken: false, bear: 58, seal: 68, lube: 18, hours: 11200 },
        { id: 'Н4', circ: 'gvs', on: false, broken: false, bear: 22, seal: 15, lube: 65, hours: 5300 },
      ],
      valves: [
        { id: 'Зд1', pipe: 1, outer: false, cond: 82, gland: 0, packing: 3, flange: 0 },
        { id: 'Зд2', pipe: 1, outer: true, cond: 64, gland: 0, packing: 2, flange: 0 },
        { id: 'Зд3', pipe: 2, outer: true, cond: 77, gland: 0, packing: 3, flange: 0 },
        { id: 'Зд4', pipe: 2, outer: false, cond: 90, gland: 0, packing: 3, flange: 0 },
        { id: 'Зд5', pipe: 3, outer: false, cond: 38, gland: 2, packing: 0, flange: 0 },
        { id: 'Зд6', pipe: 3, outer: true, cond: 71, gland: 0, packing: 3, flange: 0 },
        { id: 'Зд7', pipe: 4, outer: true, cond: 58, gland: 0, packing: 2, flange: 0 },
        { id: 'Зд8', pipe: 4, outer: false, cond: 85, gland: 0, packing: 3, flange: 0 },
      ],
      houses: D.HOUSES.map((h) => ({ id: h.id, tin: 21 + Math.random(), ttap: 58, sat: 62 + Math.random() * 10,
        air: 0, leak: 0, last: {} })),
      wells: D.HOUSES.map(() => newWell()),
      flood: 0,
      tasks: [],
      msgs: [],
      orders: [],
      sklad: { month: 9, spent: 0, lastDay: -1 },
      journal: { lastObhod: -1, entries: [] },
      flags: { late: -1, obhodChecked: -1, seasonEnd: false, seasonStart: true, hints: {} },
      stats: { repairs: 0, tasksDone: 0, tasksFailed: 0, complaints: 0, earned: 0, shocks: 0 },
      nextId: 1,
      tut: { step: 0, done: false, flags: {}, t2: 0 },
      over: null,
    };
    S.valves.forEach((v) => { v.open = true; v.stuck = false; v.lastOp = -20000; v.replacedAt = -1; });
    S.pumps.forEach((p) => { p.serviced = -1; });
    return S;
  }

  function save(S) {
    try { localStorage.setItem(KEY, JSON.stringify(S)); return true; } catch (e) { return false; }
  }
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return null;
      const S = JSON.parse(raw);
      if (!S || S.v !== 1) return null;
      return migrate(S);
    } catch (e) { return null; }
  }
  function hasSave() { try { return !!localStorage.getItem(KEY); } catch (e) { return false; } }
  function wipe() { try { localStorage.removeItem(KEY); } catch (e) { /* пусто */ } }

  return { newGame, save, load, hasSave, wipe };
})();
