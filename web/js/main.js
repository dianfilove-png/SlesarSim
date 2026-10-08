// Главный цикл, ввод, переходы между сценами
'use strict';

G.Main = (() => {
  const U = G.U, D = G.D, R = G.R;
  const SPEEDS = [0, 1, 5, 20];
  const P = {
    dir: 1, walking: false, ctpX: 160, ctpTo: null, homeX: 500,
    get home() { return G.S.p.home; }, get tools() { return G.S.p.tools; },
  };
  let walk = null, follow = true, started = false;
  let acc = 0, walkMin = 0, last = 0, lastSave = 0;
  G.busy = null;

  // ---------- игра
  function startNew() {
    G.St.wipe();
    G.S = G.St.newGame();
    G.busy = null; walk = null; acc = 0;
    started = true;
    G.Ev.startGame();
    enter('home');
    G.UI.intro();
    save(true);
  }
  function cont() {
    const s = G.St.load();
    if (!s) { startNew(); return; }
    G.S = s;
    G.busy = null; walk = null;
    started = true;
    G.UI.closeOverlay();
    enter(s.scene, true);
  }
  function save(force) {
    if (!started || !G.S || G.S.over) return;
    const now = performance.now();
    if (!force && now - lastSave < 5000) return;
    lastSave = now;
    G.St.save(G.S);
  }
  function gameOver(reason) {
    G.S.over = reason;
    G.busy = null;
    G.MG.close();
    G.UI.closePanel();
    G.St.wipe();
    G.UI.gameOver(reason);
  }

  // ---------- сцены
  function enter(scene, quiet) {
    const s = G.S;
    walk = null;
    s.scene = scene;
    G.UI.closePanel();
    if (scene === 'ctp') { P.ctpX = 160; P.ctpTo = null; R.cam.ctp = 0; }
    if (scene === 'street') { follow = true; R.cam.street = s.px - R.LW / 2; }
    if (scene === 'home') P.homeX = 600;
    G.UI.dirty = true;
    if (!quiet) G.UI.hint(scene);
    if (scene === 'shop') G.UI.panelShop();
    if (scene === 'house') G.UI.panelBasement(s.house);
    if (scene === 'well') G.UI.panelWell(s.well);
  }
  function exit() {
    const s = G.S;
    if (s.scene === 'street') return;
    const pos = { shop: D.PLACES.shop.door, ctp: D.PLACES.ctp.door, home: D.HOUSES[0].x + 60, house: D.HOUSES[s.house].x + D.HOUSES[s.house].w / 2, well: D.wellX(s.well) };
    s.px = pos[s.scene];
    advance(2);
    enter('street');
  }
  function goTo(x, cb) {
    const s = G.S;
    if (s.scene !== 'street' || G.busy) return;
    G.UI.closePanel(); // уходим — панель люка или дома не тащим за собой
    walk = { to: U.clamp(x, 20, D.STREET_W - 20), cb };
    follow = true;
  }
  function goPlace(name) {
    if (G.S.scene !== 'street') return;
    goTo(D.PLACES[name].door, () => enter(name));
  }
  function goHome() {
    if (G.S.scene !== 'street') return;
    goTo(D.HOUSES[0].x + 60, () => enter('home'));
  }

  // ---------- время
  function startBusy(label, min, opts, done) {
    G.busy = { label, total: min, left: min, kind: opts.kind || 'work', work: opts.work || 0, regen: opts.regen,
      interruptible: !!opts.interruptible, done };
    G.UI.hidePanelForBusy();
    G.UI.dirty = true;
  }
  function finishBusy() {
    const b = G.busy;
    G.busy = null;
    G.UI.dirty = true;
    if (b && b.done) b.done();
  }
  function wake() {
    if (G.busy && G.busy.kind === 'sleep') { G.busy = null; G.UI.dirty = true; G.UI.toast('Проснулся'); }
  }
  function urgent() {
    if (G.busy && G.busy.interruptible) { G.busy = null; G.UI.dirty = true; G.UI.toast('Тебя разбудил звонок!', 'bad'); }
    if (G.S && G.S.speed > 1) G.S.speed = 1;
    G.UI.ring();
  }
  function forceSleep(min, text) {
    G.UI.toast(text, 'bad');
    G.MG.close();
    startBusy('Без сознания…', min, { kind: 'sleep', regen: 0.2 }, null);
  }
  function stepOnce() {
    const s = G.S;
    if (!s || s.over) return;
    G.Sim.step(s, G.busy);
    const Pp = s.p;
    if (Pp.health <= 0) { G.busy = null; G.MG.close(); G.UI.closePanel(); G.Ev.hospital(); enter('home'); }
    else if (Pp.energy <= 0 && !(G.busy && G.busy.kind === 'sleep')) G.Ev.passOut();
    if (G.busy) { G.busy.left--; if (G.busy.left <= 0) finishBusy(); }
    if (U.mod(s.t) % 60 === 0) save();
  }
  function advance(n) { for (let i = 0; i < n && G.S && !G.S.over; i++) stepOnce(); }

  // ---------- ввод
  let down = null;
  function camOf() { const s = G.S; return s.scene === 'street' ? R.cam.street : R.cam.ctp; }
  function onDown(e) {
    G.Snd.unlock();
    if (!started) return;
    down = { x: e.clientX, y: e.clientY, cam: camOf(), moved: false };
  }
  function onMove(e) {
    if (!down || !G.S) return;
    const dx = (e.clientX - down.x) / R.scale;
    if (Math.abs(dx) > 10 || Math.abs(e.clientY - down.y) > 14) down.moved = true;
    if (!down.moved) return;
    if (G.S.scene === 'street') { R.cam.street = down.cam - dx; follow = false; }
    else if (G.S.scene === 'ctp') { R.stopCam(); R.cam.ctp = down.cam - dx; }
  }
  function onUp(e) {
    const d = down;
    down = null;
    if (d && !d.moved) tap(e.clientX, e.clientY);
  }
  function tap(cx, cy) {
    const s = G.S;
    if (!started || !s || s.over || G.busy) return;
    const l = R.toLogical(cx, cy);
    if (l.y < R.hudH()) return;
    const id = R.hitTest(l.x, l.y);
    if (!id) return;
    const [kind, a] = id.split(':');
    const n = Number(a);
    const UI = G.UI;
    if (s.scene === 'street') {
      if (kind === 'shop') goPlace('shop');
      else if (kind === 'ctp') goPlace('ctp');
      else if (kind === 'house') { const hd = D.HOUSES[n]; UI.closePanel(); goTo(hd.x + hd.w / 2, () => UI.panelHouse(n)); }
      else if (kind === 'well') { UI.closePanel(); goTo(D.wellX(n), () => UI.panelHatch(n)); }
      else if (kind === 'ground') { UI.closePanel(); goTo(l.x + R.cam.street); }
      return;
    }
    if (s.scene === 'ctp') {
      P.ctpTo = U.clamp(l.x + R.cam.ctp, 60, R.CT.W - 80);
      const map = {
        door: () => exit(), valve: () => UI.panelValve(n), pump: () => UI.panelPump(n), hx: () => UI.panelHX(a), filter: () => UI.panelFilter(),
        drain: () => UI.panelDrain(a), feed: () => UI.panelFeed(), gauge: () => UI.panelGauge(n), cabinet: () => UI.panelCabinet(),
        desk: () => UI.panelDesk(), box: () => UI.panelBox(), net: () => UI.panelNet(), hvs: () => UI.panelHvs(),
      };
      if (map[kind]) {
        map[kind]();
        // объект оказался под панелью — сдвигаем камеру, чтобы его было видно слева
        const pw = UI.panelOpen() ? document.getElementById('panel').offsetWidth : 0;
        if (pw && cx > window.innerWidth - pw - 30) R.focusCtp(l.x + R.cam.ctp, 0.22);
      }
      return;
    }
    if (s.scene === 'home') {
      P.homeX = U.clamp(l.x - (R.LW - 960) / 2, 150, 800);
      UI.panelHome(kind);
      return;
    }
    if (s.scene === 'shop') { if (kind === 'door') exit(); else UI.panelShop(); return; }
    if (s.scene === 'house') { if (kind === 'exit') exit(); else UI.panelBasement(s.house); }
    if (s.scene === 'well') { if (kind === 'exit') exit(); else UI.panelWell(s.well, kind === 'wv' ? n : undefined); }
  }

  // ---------- цикл
  function loop(now) {
    try { frameStep(now); } catch (e) { if (window.console) console.error(e); }
    requestAnimationFrame(loop);
  }
  function frameStep(now) {
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    const s = G.S;
    if (started && s && !s.over) {
      if (walk && !G.busy) {
        const dx = walk.to - s.px, st = 340 * dt;
        if (Math.abs(dx) <= st) {
          s.px = walk.to; walkMin += Math.abs(dx) / 70;
          const cb = walk.cb; walk = null;
          if (cb) cb();
        } else { s.px += Math.sign(dx) * st; P.dir = Math.sign(dx); walkMin += st / 70; }
        while (walkMin >= 1) { stepOnce(); walkMin -= 1; }
      }
      if (s.scene === 'street') {
        P.walking = !!walk;
        if (follow) R.cam.street += (s.px - R.LW / 2 - R.cam.street) * Math.min(1, dt * 4);
      } else if (s.scene === 'ctp') {
        P.walking = false;
        if (P.ctpTo !== null) {
          const dx = P.ctpTo - P.ctpX, st = 420 * dt;
          if (Math.abs(dx) <= st) { P.ctpX = P.ctpTo; P.ctpTo = null; } else { P.ctpX += Math.sign(dx) * st; P.dir = Math.sign(dx); P.walking = true; }
        }
      }
      let rate = 0;
      if (G.busy) rate = Math.max(15, G.busy.total / (G.busy.kind === 'sleep' ? 4 : 3.5));
      else if (!G.UI.isModal()) rate = SPEEDS[s.speed];
      acc += dt * rate;
      let k = Math.floor(acc);
      acc -= k;
      k = Math.min(k, 500);
      for (let i = 0; i < k && !G.S.over; i++) stepOnce();
      if (!rate) acc = 0;
    }
    if (started && G.S) R.frame(G.S, P, dt);
    G.UI.tick(dt);
  }

  function back() {
    if (G.MG.isOpen()) { G.MG.close(); G.UI.toast('Работа брошена'); return true; }
    if (G.UI.overlayOpen()) {
      if (started && G.S && !G.S.over) { G.UI.closeOverlay(); return true; }
      return false;
    }
    if (G.UI.panelOpen()) { G.UI.closePanel(); return true; }
    if (started && G.S && G.S.scene !== 'street' && !G.busy) { exit(); return true; }
    G.UI.menu();
    return true;
  }

  function boot() {
    const cv = document.getElementById('cv');
    R.init(cv);
    G.UI.init();
    cv.addEventListener('pointerdown', onDown);
    cv.addEventListener('pointermove', onMove);
    cv.addEventListener('pointerup', onUp);
    cv.addEventListener('pointercancel', () => { down = null; });
    // тап по канвасу открывает панель прямо под пальцем — «хвостовой» click после касания не должен нажать в ней кнопку
    // пустой click-слушатель: для «подстройки касания» Chromium канвас тоже кликабельный, и тап у края не уводит в соседнюю кнопку
    cv.addEventListener('click', () => {});
    let downCv = false;
    document.addEventListener('pointerdown', (e) => { downCv = e.target === cv; }, true);
    document.addEventListener('click', (e) => { if (e.isTrusted && downCv && e.target !== cv) { e.stopImmediatePropagation(); e.preventDefault(); } downCv = false; }, true);
    window.addEventListener('resize', () => R.resize());
    document.addEventListener('visibilitychange', () => { if (document.hidden) save(true); });
    window.onAndroidPause = () => save(true);
    window.onAndroidBack = back;
    document.addEventListener('contextmenu', (e) => e.preventDefault());
    G.UI.menu();
    requestAnimationFrame((t) => { last = t; loop(t); });
  }

  window.addEventListener('load', boot);
  return { startNew, cont, save, gameOver, enter, exit, goTo, goPlace, goHome, startBusy, wake, urgent, forceSleep, advance, back,
    get started() { return started; }, P };
})();
