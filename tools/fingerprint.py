#!/usr/bin/env python3
"""Отпечаток симуляции: детерминированный прогон игрового года ботом-слесарем, md5 по разделам состояния.

python3 tools/fingerprint.py [root] [--days N] [--dump out.json]

root — корень копии игры (по умолчанию этот репозиторий). Math.random заменён на mulberry32 (seed 12345)
до G.Main.startNew(), requestAnimationFrame выключен — время идёт только через G.Main.advance.
Бот панелей не открывает: держит доверие и потребности, по насосу на контур, подпитку 3,5–4,3 бар,
вызывает аварийку, закрывает заявки (часть — через G.Act, без панелей и мини-игр); лето без отпуска.
Одинаковые хэши у двух копий — поведение симуляции не изменилось. --dump пишет разделы целиком
(и хэш состояния на конец каждого дня — найти первый расходящийся день).
"""
import argparse
import datetime
import hashlib
import json
import os
import sys
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# до скриптов страницы: цикл кадров не запускаем — ни рендера, ни шагов симуляции между вызовами
INIT = "window.requestAnimationFrame = () => 0;"

SETUP = r"""
(() => {
  let a = 12345;
  Math.random = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  window.FP = { msgs: [], tasks: {}, days: [], acts: {} };
  // JSON с упорядоченными ключами: перестановка полей в коде хэш не меняет
  window.canon = (v) => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x)
    ? Object.keys(x).sort().reduce((o, kk) => { o[kk] = x[kk]; return o; }, {}) : x));
  window.fnv = (str) => { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16).padStart(8, '0'); };
  // все сообщения подряд (s.msgs обрезается до 80); звук и тосты — мимо
  G.UI.onMessage = (from, text, urgent) => { FP.msgs.push([G.S.t, from, text, !!urgent]); };
  G.UI.toast = () => {};
  G.Snd.play = () => {};
  G.Main.startNew(); G.UI.closeOverlay(); G.Tut.skip(); G.S.speed = 0;
  // заявки живут сутки после закрытия — снимаем каждый час, чтобы увидеть все
  window.snapTasks = () => { for (const k of G.S.tasks) FP.tasks[k.id] = [k.id, k.type, k.ref === undefined ? null : k.ref, k.circ || null,
    k.done, k.failed, k.created, k.deadline === undefined ? null : k.deadline, k.title, k.doneAt === undefined ? null : k.doneAt]; };
})()
"""

# бот раз в час: прямые правки состояния + не больше одного действия G.Act (только когда не занят)
BOT = r"""
window.bot = () => {
  const s = G.S, U = G.U, D = G.D, A = G.Act, Ev = G.Ev, Sim = G.Sim;
  const P = s.p, H = s.heat, E = s.ev, B = E.burst, h = U.hour(s.t), day = U.day(s.t), wd = U.isWorkday(s.t), season = Sim.heatSeason(s.t);
  const open = s.tasks.filter((k) => !k.done && !k.failed);
  const first = (type, ok) => open.find((k) => k.type === type && (!ok || ok(k)));
  // не увольняют, сыт и бодр; в рабочее время — на ЦТП
  P.trust = 60; P.energy = 90; P.hunger = 90; P.health = 95;
  s.scene = wd && h >= 8 && h < 17 ? 'ctp' : 'street';
  // обход в 9:00 рабочего дня — замечания как в Act.obhod, без отчёта на экране
  if (wd && h === 9 && s.journal.lastObhod !== day) {
    const f = [];
    s.valves.forEach((v, i) => { if (v.flange) f.push({ k: 'flange', i }); else if (v.gland) f.push({ k: 'gland', i }); if (v.cond < 30 || v.broken) f.push({ k: 'old', i }); });
    s.pumps.forEach((p, i) => { if (p.lube < 30) f.push({ k: 'lube', i }); if (p.bear >= 65 && !p.broken) f.push({ k: 'bear', i }); if (p.seal >= 75) f.push({ k: 'seal', i }); });
    if (H.clog >= 60) f.push({ k: 'clog' });
    if (H.foul >= 60) f.push({ k: 'foul', c: 'heat' });
    if (s.gvs.foul >= 62) f.push({ k: 'foul', c: 'gvs' });
    if (s.flood > 20) f.push({ k: 'flood' });
    Object.assign(s.journal, { findings: f, lastObhod: day, lastObhodT: s.t });
    s.journal.entries.unshift({ t: s.t, text: f.map((x) => x.k + (x.i === undefined ? '' : x.i) + (x.c || '')).join(',') || '-' });
    if (s.journal.entries.length > 20) s.journal.entries.length = 20;
    Ev.xp(5);
  }
  // ремонты по заявкам — сразу, без мини-игр
  for (const k of open) {
    const p = s.pumps[k.ref], v = s.valves[k.ref];
    switch (k.type) {
      case 'bearings': case 'pumpFix': Object.assign(p, { bear: 5, broken: false, lube: 100 }); break;
      case 'pumpSeal': p.seal = 5; break;
      case 'pumpRev': Object.assign(p, { bear: 5, seal: 5, lube: 100, serviced: s.t }); break;
      case 'replaceValve': Object.assign(v, { cond: 100, gland: 0, packing: 3, flange: 0, broken: false, stuck: false, replacedAt: s.t, lastOp: s.t }); break;
      case 'fixGland': if (v.flange) v.flange = 0; else if (v.gland && !v.packing) { v.gland = 0; v.packing = 3; } break;
      case 'cleanFilter': H.clog = 5; H.cleanedAt = s.t; break;
      case 'flush': s[k.circ].foul = 5; s[k.circ].flushedAt = s.t; break;
      case 'pressTest': if (!season) H.pressOkAt = s.t; break;
      case 'leak': if (!A.has('clamp')) s.houses[k.ref].leak = 0; break;
      case 'lube': if (!A.has('grease')) p.lube = 100; break;
      case 'readiness':
        H.pressOkAt = s.t; H.clog = Math.min(H.clog, 5); H.foul = Math.min(H.foul, 5);
        s.valves.forEach((x) => { if (x.pipe <= 2) { x.gland = 0; x.flange = 0; if (x.cond < 40 || x.broken) Object.assign(x, { cond: 100, broken: false, replacedAt: s.t }); } });
        s.pumps.forEach((x) => { if (x.circ === 'heat') Object.assign(x, { bear: Math.min(x.bear, 20), seal: Math.min(x.seal, 20), broken: false }); });
        break;
      default: break;
    }
  }
  s.pumps.forEach((p) => { if (p.lube < 10) p.lube = 100; });
  // насосы: отопление только в сезон, без ХВС ГВС стоит, по понедельникам — на резерв, по одному на контур
  if (E.hvs) s.pumps.forEach((p) => { if (p.circ === 'gvs') p.on = false; });
  if (!season) s.pumps.forEach((p) => { if (p.circ === 'heat') p.on = false; });
  const sw = first('switchPumps');
  if (sw && !E.power) sw.was.forEach((i) => {
    const p = s.pumps[i], r = s.pumps.find((x, j) => x.circ === p.circ && !x.broken && !sw.was.includes(j));
    if (r && (p.circ === 'gvs' ? !E.hvs : season)) { p.on = false; r.on = true; }
  });
  if (!E.power) ['heat', 'gvs'].forEach((c) => {
    if (c === 'heat' ? !season : E.hvs) return;
    if (!s.pumps.some((p) => p.circ === c && p.on)) { const p = s.pumps.find((x) => x.circ === c && !x.broken); if (p) p.on = true; }
  });
  // подпитка 3,5–4,3 бар (пока открыта — шаги по минуте, см. DAY); график — по самому холодному и жаркому дому
  if (H.ps < 3.5) H.feed = true; else if (H.ps > 4.3) H.feed = false;
  if (U.mod(s.t) % 180 === 0) {
    const tins = s.houses.map((x) => x.tin);
    if (Math.min(...tins) < 19.8 && H.corr < 12) H.corr += 1; else if (Math.max(...tins) > 24.5 && H.corr > -12) H.corr -= 1;
  }
  const act = (name, f) => { FP.acts[name] = (FP.acts[name] || 0) + 1; f(); return true; };
  // склад: заявка по понедельникам в 10:00
  if (wd && h === 10 && U.date(s.t).wd === 1) act('order', () => A.order({ gasket: 2, grease: 1, wd40: 1, clamp: 2, packing: 1 }));

  // ---- одно действие в час, если руки свободны
  if (G.busy) return;
  const W = D.WELL_PIPES;
  // задвижка в камере в положение want: закисла — WD-40, иначе крутим штурвал
  const turn = (i, n, want) => {
    const v = s.wells[i].v[n];
    if (v.open === want || v.broken) return false;
    if (v.stuck) return A.has('wd40') && act('wellUnstick', () => A.wellUnstick(i, n, 'wd'));
    if (want && A.wellLock(i, n)) return false;
    return act('wellToggle', () => A.wellToggle(i, n));
  };
  let k;
  if (B && B.called === null) return act('callBrigade', () => A.callBrigade());
  if (B && !B.arrived) for (const n of W[B.pipe]) if (turn(B.house, n, false)) return;
  for (const x of open) if (x.type === 'wellOpen') for (const n of W[x.circ]) if (turn(x.ref, n, true)) return;
  if ((k = first('leak')) && A.has('clamp')) return act('clampLeak', () => A.clampLeak(k.ref));
  if ((k = first('air'))) return act('bleedAir', () => A.bleedAir(k.ref));
  if ((k = first('lube')) && A.has('grease')) return act('pumpLube', () => A.pumpLube(k.ref));
  if ((k = first('fixGland', (x) => s.valves[x.ref].gland && s.valves[x.ref].packing > 0))) return act('valveTighten', () => A.valveTighten(k.ref));
  if ((k = first('meter'))) return act('meter', () => A.meter(k.ref));
  if ((k = first('wellRev'))) {
    const from = k.from === undefined ? k.created : k.from;
    for (let i = 0; i < s.wells.length; i++) {
      const w = s.wells[i];
      if (w.revAt > from || (B && B.house === i)) continue;
      const n = w.v.findIndex((v) => v.stuck && !v.broken);
      if (n >= 0) { if (A.has('wd40')) return act('wellUnstick', () => A.wellUnstick(i, n, 'wd')); continue; }
      for (let m = 0; m < 4; m++) if (turn(i, m, true)) return;
      return act('wellRevise', () => A.wellRevise(i));
    }
  }
  // камеры без порыва держим открытыми
  for (let i = 0; i < s.wells.length; i++) if (!(B && B.house === i)) for (let n = 0; n < 4; n++) if (turn(i, n, true)) return;
  if ((k = first('job'))) return act('job', () => A.job(k.id));
};
"""

# сутки: бот раз в час, затем advance(60); пока открыта подпитка — по минуте, закрываем выше 4,3 бар
DAY = r"""
(() => {
  const s = G.S;
  for (let hh = 0; hh < 24 && !s.over; hh++) {
    bot();
    for (let m = 0; m < 60;) {
      if (s.heat.feed) { G.Main.advance(1); m++; if (s.heat.ps > 4.3) s.heat.feed = false; }
      else { G.Main.advance(60 - m); m = 60; }
    }
    snapTasks();
  }
  FP.days.push(fnv(canon(s)));
  return !!s.over;
})()
"""

RESULT = r"""
(() => {
  const s = G.S, c = canon;
  snapTasks();
  const tasks = Object.values(FP.tasks).sort((a, b) => a[0] - b[0]);
  return {
    sections: {
      heat: c(s.heat), gvs: c(s.gvs), pumps: c(s.pumps), valves: c(s.valves), houses: c(s.houses), wells: c(s.wells),
      p: c(s.p), stats: c(s.stats), tasks: c(tasks), msgs: c(FP.msgs), flags: c(s.flags), journal: c(s.journal),
      orders: c(s.orders), ev: c(s.ev),
      misc: c({ t: s.t, flood: s.flood, wx: s.wx, tout: s.tout, tnet: s.tnet, nextId: s.nextId, sklad: s.sklad, over: s.over }),
      daily: c(FP.days),
    },
    t: s.t,
    info: { msgs: FP.msgs.length, tasks: tasks.length, done: tasks.filter((k) => k[4]).length, failed: tasks.filter((k) => k[5]).length,
      trust: s.p.trust, money: s.p.money, xp: s.p.xp, complaints: s.stats.complaints, over: s.over },
    acts: FP.acts,
  };
})()
"""


def run(root, days):
    url = 'file://' + os.path.join(os.path.abspath(root), 'web', 'index.html')
    errors = []
    with sync_playwright() as p:
        try:
            b = p.chromium.launch()
        except Exception:
            b = p.chromium.launch(executable_path='/opt/pw-browsers/chromium')
        page = b.new_page(viewport={'width': 844, 'height': 390})
        page.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))
        page.on('console', lambda m: errors.append('console: ' + m.text) if m.type == 'error' else None)
        page.add_init_script(INIT)
        page.goto(url)
        page.wait_for_function('window.G && G.Main && G.Main.P')
        page.evaluate(SETUP)
        page.evaluate(BOT)
        for _ in range(days):
            if page.evaluate(DAY):
                break
        r = page.evaluate(RESULT)
        b.close()
    return r, errors


def main():
    ap = argparse.ArgumentParser(description='Отпечаток симуляции за игровой год')
    ap.add_argument('root', nargs='?', default=ROOT)
    ap.add_argument('--days', type=int, default=365)
    ap.add_argument('--dump', help='записать разделы целиком в JSON')
    a = ap.parse_args()
    r, errors = run(a.root, a.days)
    md5 = lambda x: hashlib.md5(x.encode('utf-8')).hexdigest()
    sec = r['sections']
    lines = ['%-8s %s' % (k, md5(v)) for k, v in sec.items()]
    for ln in lines:
        print(ln)
    print('%-8s %s' % ('TOTAL', md5('\n'.join(lines))))
    # t — игровые минуты от 1 октября 2026, 00:00 (как в G.U); дату считаем здесь, без API игры
    print('date    ', (datetime.datetime(2026, 10, 1) + datetime.timedelta(minutes=r['t'])).strftime('%Y-%m-%d %H:%M'), '(t=%d)' % r['t'])
    print('info    ', json.dumps(r['info'], ensure_ascii=False))
    print('acts    ', json.dumps(r['acts'], ensure_ascii=False, sort_keys=True))
    if a.dump:
        with open(a.dump, 'w') as f:
            json.dump({k: json.loads(v) for k, v in sec.items()}, f, ensure_ascii=False, indent=1)
    if errors:
        print('ERRORS:')
        for e in errors:
            print(' ', e)
        sys.exit(1)


if __name__ == '__main__':
    main()
