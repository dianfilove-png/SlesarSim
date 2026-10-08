#!/usr/bin/env python3
"""Прогон игры в headless Chromium: скриншоты сцен + долгая симуляция без ошибок.

python3 tools/scenarios.py [out_dir]
"""
import os
import sys
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, 'shots')
os.makedirs(OUT, exist_ok=True)
URL = 'file://' + os.path.join(ROOT, 'web', 'index.html')

errors = []


def shot(page, name, keep_toasts=False):
    page.wait_for_timeout(350)
    if not keep_toasts:
        page.evaluate("document.getElementById('toasts').innerHTML=''")
    page.screenshot(path=os.path.join(OUT, name + '.png'))


def main():
    exe = '/opt/pw-browsers/chromium' if os.path.exists('/opt/pw-browsers/chromium') else None
    with sync_playwright() as p:
        kw = {'args': ['--autoplay-policy=no-user-gesture-required']}
        try:
            b = p.chromium.launch(**kw)
        except Exception:
            b = p.chromium.launch(executable_path=exe, **kw)
        ctx = b.new_context(viewport={'width': 844, 'height': 390}, device_scale_factor=2, has_touch=True)
        page = ctx.new_page()
        page.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))
        page.on('console', lambda m: errors.append('console: ' + m.text) if m.type == 'error' else None)
        page.goto(URL)
        page.wait_for_timeout(500)
        shot(page, '00_menu')
        page.get_by_text('Новая игра').click()
        shot(page, '01_intro')
        page.get_by_text('Начать смену').click()
        shot(page, '02_home', True)
        page.evaluate("G.UI.phone('tasks')")
        shot(page, '03_phone')
        page.evaluate("G.UI.closePanel(); G.Main.exit()")
        page.wait_for_timeout(800)
        shot(page, '04_street')
        page.evaluate("G.Main.enter('ctp')")
        shot(page, '05_ctp')
        page.evaluate("G.R.cam.ctp = 400")
        shot(page, '06_ctp_right')
        page.evaluate("G.UI.panelValve(4)")
        shot(page, '07_valve')
        page.evaluate("G.UI.panelPump(2)")
        shot(page, '08_pump')
        # мини-игра болтов
        page.evaluate("G.S.p.inv.valve=1; G.S.p.inv.gasket=4; G.S.pumps.forEach(p=>p.on=false); G.S.valves[5].open=false; G.S.gvs.drain=true; G.Main.advance(30)")
        page.evaluate("G.Act.valveReplace(4)")
        shot(page, '09_bolts')
        for i in range(8):
            for _ in range(4):
                page.evaluate(f"document.querySelectorAll('.bolt')[{i}] && document.querySelectorAll('.bolt')[{i}].dispatchEvent(new PointerEvent('pointerdown'))")
        page.wait_for_timeout(1500)
        shot(page, '10_bolts_tighten')
        for i in [0, 4, 2, 6, 1, 5, 3, 7]:
            page.evaluate(f"document.querySelectorAll('.bolt')[{i}].dispatchEvent(new PointerEvent('pointerdown'))")
        page.wait_for_timeout(800)
        r = page.evaluate("JSON.stringify(G.S.valves[4])")
        print('valve after replace:', r)
        page.evaluate("G.S.p.inv.bearing=2; G.Act.pumpBearings(2)")
        shot(page, '11_proc')
        page.evaluate("G.MG.close(); G.Main.enter('shop')")
        shot(page, '12_shop')
        page.evaluate("G.S.house=2; G.Main.enter('house')")
        shot(page, '13_basement')
        # тепловая камера: порыв у дома №3, люк, спуск, перекрытие ввода
        page.evaluate("G.UI.closePanel(); G.S.ev.burst={house:2,pipe:'heat',at:G.S.t,called:null,arrived:false,fixAt:null}; G.S.px=G.D.wellX(2); G.Main.enter('street'); G.R.cam.street=G.D.wellX(2)-400")
        page.wait_for_timeout(500)
        page.evaluate("G.UI.panelHatch(2)")
        shot(page, '13a_hatch')
        page.evaluate("G.UI.closePanel(); G.S.p.health=90; G.Act.wellDown(2); G.Main.advance(5)")
        shot(page, '13b_well_steam', True)
        hp = page.evaluate("G.S.p.health")
        assert hp < 90, 'ожог в камере с порывом не сработал'
        page.evaluate("G.S.wells[2].v.forEach(v=>{v.stuck=false; v.lastOp=G.S.t}); G.Act.wellToggle(2,0); G.Main.advance(8); G.Act.wellToggle(2,1); G.Main.advance(8)")
        iso = page.evaluate("[G.Sim.burstIsolated(G.S), G.S.wells[2].v.map(v=>v.open), G.Sim.heatLeak(G.S).toFixed(2)]")
        print('well isolate:', iso)
        assert iso[0], 'порыв не отсечён задвижками камеры'
        page.evaluate("G.UI.panelWell(2)")
        shot(page, '13c_well_panel')
        page.evaluate("G.S.ev.burst.called=G.S.t; G.Main.advance(45)")
        assert page.evaluate("G.S.ev.burst.arrived && G.S.ev.burst.fixAt - G.S.t > 200"), 'бригада не приехала'
        page.evaluate("G.Main.advance(310)")
        tk = page.evaluate("[!G.S.ev.burst, G.S.tasks.filter(k=>k.type==='wellOpen'&&!k.done&&!k.failed).length]")
        print('after repair:', tk)
        assert tk == [True, 1], 'нет задачи открыть задвижки после ремонта'
        page.evaluate("G.UI.closePanel(); G.Act.wellToggle(2,0); G.Main.advance(8); G.Act.wellToggle(2,1); G.Main.advance(8)")
        assert page.evaluate("G.S.tasks.some(k=>k.type==='wellOpen'&&k.done)"), 'задача открыть задвижки не закрылась'
        page.evaluate("G.UI.closePanel(); G.Main.exit()")
        page.wait_for_timeout(500)
        shot(page, '13d_street_wells')
        page.evaluate("G.S.heat.ps=4.1")
        # долгая симуляция: 30 дней
        page.evaluate("G.UI.closePanel(); G.S.valves.forEach(v=>{v.open=true}); G.S.gvs.drain=false; G.S.pumps[0].on=true; G.S.pumps[2].on=true;")
        for d in range(30):
            page.evaluate("G.Main.advance(1440)")
        st = page.evaluate("""(() => { const s=G.S; return {t:G.U.dateStr(s.t), tout:s.tout.toFixed(1), heat:{t1:s.heat.t1.toFixed(1),ps:s.heat.ps.toFixed(2),q:s.heat.q.toFixed(2)},
            gvs:{t3:s.gvs.t3.toFixed(1),q:s.gvs.q.toFixed(2)}, houses:s.houses.map(h=>[h.tin.toFixed(1),h.ttap.toFixed(0),Math.round(h.sat)]),
            trust:s.p.trust.toFixed(1), money:s.p.money, tasks:s.tasks.filter(k=>!k.done&&!k.failed).map(k=>k.title), over:s.over, stats:s.stats} })()""")
        print('after 30 days:', st)
        page.evaluate("G.UI.closeOverlay(); G.Main.enter('street')")
        page.evaluate("G.S.t = G.S.t - G.U.mod(G.S.t) + 22*60; G.Main.advance(1)")
        shot(page, '14_street_night')
        b.close()
    if errors:
        print('ERRORS:')
        for e in errors:
            print(' ', e)
        sys.exit(1)
    print('OK, screenshots in', OUT)


if __name__ == '__main__':
    main()
