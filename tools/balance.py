#!/usr/bin/env python3
"""Баланс: «идеальный слесарь»-бот проходит отопительный сезон, считаем жалобы и доверие."""
import os
import sys
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
URL = 'file://' + os.path.join(ROOT, 'web', 'index.html')

BOT = """
(() => {
  const s = G.S, U = G.U, h = U.hour(s.t), day = U.day(s.t);
  s.p.energy = 90; s.p.hunger = 90; s.p.health = 95; s.p.mood = 60;
  const work = U.isWorkday(s.t) && h >= 8 && h < 17;
  s.scene = work ? 'ctp' : 'street';
  if (U.isWorkday(s.t) && h >= 9 && s.journal.lastObhod !== day) { s.journal.lastObhod = day; s.journal.lastObhodT = s.t; s.journal.findings = []; }
  const H = s.heat;
  if (!s.ev.power) ['heat','gvs'].forEach(c => { if (!s.pumps.some(p => p.circ === c && p.on)) { const p = s.pumps.find(p => p.circ === c && !p.broken); if (p) p.on = true; } });
  if (H.ps < 3.5) H.feed = true; if (H.ps > 4.3) H.feed = false;
  s.pumps.forEach(p => { if (p.lube < 30) p.lube = 100; if (p.bear > 65) { p.bear = 5; p.broken = false; } if (p.seal > 70) p.seal = 5; });
  s.valves.forEach(v => { v.gland = 0; v.flange = 0; v.stuck = false; v.open = true; });
  if (H.clog > 55) H.clog = 0; if (s.gvs.foul > 65) s.gvs.foul = 5; if (H.foul > 65) H.foul = 5;
  s.houses.forEach(x => { x.air = 0; x.leak = 0; });
  s.tasks.forEach(k => { if (!k.done && !k.failed && (k.type === 'meter' || k.type === 'job')) k.doneFlag = true; });
  if (s.ev.burst && s.ev.burst.called === null) s.ev.burst.called = s.t;
  const tins = s.houses.map(x => x.tin);
  if (U.mod(s.t) % 180 === 0) { if (Math.min(...tins) < 19.8 && H.corr < 12) H.corr += 1; else if (Math.max(...tins) > 24.5 && H.corr > -12) H.corr -= 1; }
  return Math.min(...tins);
})()
"""


def main():
    days = int(sys.argv[1]) if len(sys.argv) > 1 else 226
    with sync_playwright() as p:
        b = p.chromium.launch()
        page = b.new_page(viewport={'width': 844, 'height': 390})
        errs = []
        page.on('pageerror', lambda e: errs.append(str(e)))
        page.goto(URL)
        page.wait_for_timeout(300)
        page.evaluate("G.Main.startNew(); G.UI.closeOverlay(); G.UI.toast=()=>{}; G.S.speed=0; window.cnt={}; G.UI.onMessage=(f,t)=>{ const k=f.split(',')[0]+': '+t.slice(0,50); cnt[k]=(cnt[k]||0)+1; }; 0")
        mins = []
        for d in range(days):
            lo = 99
            for hh in range(24):
                lo = min(lo, page.evaluate(BOT))
                page.evaluate("G.Main.advance(60)")
            mins.append(lo)
            if d % 15 == 0 or d == days - 1:
                r = page.evaluate("""(() => { const s=G.S; return [G.U.dateStr(s.t), s.tout.toFixed(0), s.heat.t1.toFixed(0), s.heat.corr, s.gvs.t3.toFixed(0),
                  s.houses.map(h=>h.tin.toFixed(1)+'/'+Math.round(h.sat)).join(' '), 'trust', s.p.trust.toFixed(0), 'money', s.p.money, 'compl', s.stats.complaints,
                  'fail', s.stats.tasksFailed, s.over] })()""")
                print(d, r, 'minTin', round(lo, 1))
            if page.evaluate("!!G.S.over"):
                print('GAME OVER at day', d)
                break
        print(page.evaluate("""(() => { const s=G.S, f={}, d={}; s.tasks.forEach(k=>{ if(k.failed) f[k.type]=(f[k.type]||0)+1; if(k.done) d[k.type]=(d[k.type]||0)+1; });
          return {failedRecent:f, doneRecent:d, stats:s.stats, money:s.p.money, xp:s.p.xp, rank:G.Ev.rankIdx()+3}; })()"""))
        if os.environ.get('MSGS'):
            for k, v in sorted(page.evaluate("cnt").items(), key=lambda x: -x[1]):
                if os.environ.get('MSGS') not in k and os.environ.get('MSGS') != '1': continue
                print(v, k)
        print('errors:', errs)
        b.close()


if __name__ == '__main__':
    main()
