// Отрисовка сцен на canvas: улица квартала, ЦТП, квартира, магазин, подвал
'use strict';

G.R = (() => {
  const U = G.U, D = G.D;
  let cv, ctx, dpr = 1, scale = 1, LW = 960, LH = 540;
  const cam = { street: 900, ctp: 0 };
  let hits = [];
  let anim = 0;
  let tx = 0, ty = 0; // мир -> экран (логические px)
  const FONT = 'Roboto, Arial, sans-serif';

  // ---------- базовое
  function init(c) { cv = c; ctx = cv.getContext('2d'); resize(); }
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = window.innerWidth, H = window.innerHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    scale = Math.min(W / 960, H / 540);
    LW = W / scale; LH = H / scale;
  }
  const toLogical = (cx, cy) => ({ x: cx / scale, y: cy / scale });
  const hudH = () => 40 / scale;
  function addHit(id, x, y, w, h) { hits.push({ id, x: x + tx, y: y + ty, w, h }); }
  function hitTest(lx, ly) {
    for (let i = hits.length - 1; i >= 0; i--) {
      const r = hits[i];
      if (lx >= r.x && lx <= r.x + r.w && ly >= r.y && ly <= r.y + r.h) return r.id;
    }
    return null;
  }
  const hex = (c) => { if (c[0] !== '#') return c.slice(c.indexOf('(') + 1, -1).split(',').map(Number); const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const mix = (a, b, k) => { const x = hex(a), y = hex(b); k = U.clamp(k, 0, 1); return 'rgb(' + x.map((v, i) => Math.round(v + (y[i] - v) * k)).join(',') + ')'; };
  const rr = (x, y, w, h, r) => { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); };
  const rect = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
  const circle = (x, y, r, c) => { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = c; ctx.fill(); };
  function text(s, x, y, size, color, align, bold, shadow) {
    ctx.font = (bold === false ? '' : 'bold ') + size + 'px ' + FONT;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'middle';
    if (shadow !== false) { ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.fillText(s, x + 1, y + 1.5); }
    ctx.fillStyle = color || '#fff';
    ctx.fillText(s, x, y);
  }
  function tag(s, x, y, bg, fg, size) {
    size = size || 13;
    ctx.font = 'bold ' + size + 'px ' + FONT;
    const w = ctx.measureText(s).width + 10;
    rr(x - w / 2, y - size * 0.75, w, size * 1.5, 4);
    ctx.fillStyle = bg; ctx.fill();
    text(s, x, y + 0.5, size, fg || '#fff', 'center', true, false);
    return w;
  }

  // ---------- время суток и погода
  const dayLen = (doy) => 12.25 + 5.25 * Math.cos(2 * Math.PI * (doy - 172) / 365);
  function daylight(t) {
    const d = U.date(t), h = U.hour(t), len = dayLen(d.doy);
    const rise = 12.6 - len / 2, set = 12.6 + len / 2;
    return Math.min(U.clamp((h - rise + 0.6) / 1.2, 0, 1), U.clamp((set + 0.6 - h) / 1.2, 0, 1));
  }
  const snowCover = (s) => G.Sim.seasonal(U.date(s.t).doy) < 0.8 && s.tout < 3;
  const snowing = (s) => s.wx.prec && s.tout < 0.5;
  const raining = (s) => s.wx.prec && s.tout >= 0.5;
  function skyGrad(y0, y1, L, s) {
    const over = s.wx.prec ? 0.6 : 0;
    const top = mix(mix('#0a1128', '#5fa5df', L), '#8d99a6', over * L);
    let bot = mix(mix('#1d2c4e', '#cfe6f5', L), '#c9d0d6', over * L);
    if (L > 0.05 && L < 0.8) bot = mix(bot, '#f0a060', (1 - Math.abs(L - 0.4) / 0.4) * 0.45);
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, top); g.addColorStop(1, bot);
    return g;
  }
  function precip(s, x0, y0, w, h) {
    if (!snowing(s) && !raining(s)) return;
    const n = snowing(s) ? 90 : 120;
    ctx.save();
    ctx.beginPath(); ctx.rect(x0, y0, w, h); ctx.clip();
    for (let i = 0; i < n; i++) {
      const sp = snowing(s) ? 25 + U.hash(i, 3) * 30 : 260 + U.hash(i, 3) * 120;
      const x = x0 + ((U.hash(i, 1) * w + anim * (snowing(s) ? 12 * Math.sin(i + anim) : -40)) % w + w) % w;
      const y = y0 + ((U.hash(i, 2) * h + anim * sp) % h);
      if (snowing(s)) circle(x, y, 1.6 + U.hash(i, 4) * 1.6, 'rgba(255,255,255,.85)');
      else { ctx.strokeStyle = 'rgba(190,210,235,.55)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 3, y + 12); ctx.stroke(); }
    }
    ctx.restore();
  }

  // ---------- человечек-слесарь
  function drawMan(x, y, dir, phase, sc, pose) {
    sc = sc || 1;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale((dir || 1) * sc, sc);
    const sw = Math.sin(phase || 0) * 9;
    ctx.lineCap = 'round';
    // ноги
    ctx.strokeStyle = '#1f3a66'; ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(-3, -32); ctx.lineTo(-3 + sw * 0.6, -4); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(3, -32); ctx.lineTo(3 - sw * 0.6, -4); ctx.stroke();
    rect(-7 + sw * 0.6, -5, 9, 5, '#222'); rect(-1 - sw * 0.6, -5, 9, 5, '#222');
    // туловище (спецовка)
    rr(-10, -62, 20, 33, 5); ctx.fillStyle = '#2f62ad'; ctx.fill();
    rect(-10, -45, 20, 3, '#f0a020');
    // руки
    ctx.strokeStyle = '#2f62ad'; ctx.lineWidth = 6;
    const a = pose === 'work' ? -0.9 : sw * 0.05;
    ctx.beginPath(); ctx.moveTo(6, -58); ctx.lineTo(6 + Math.sin(a + 0.3) * 18, -58 + Math.cos(a + 0.3) * 18); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-6, -58); ctx.lineTo(-6 - Math.sin(-sw * 0.05 + 0.2) * 16, -58 + Math.cos(0.2) * 18); ctx.stroke();
    circle(6 + Math.sin(a + 0.3) * 19, -58 + Math.cos(a + 0.3) * 19, 3, '#efc09a');
    // голова
    circle(0, -71, 8, '#efc09a');
    circle(3.5, -72, 1.2, '#222');
    // кепка
    ctx.beginPath(); ctx.arc(0, -73, 8.5, Math.PI, 0); ctx.fillStyle = '#e07b16'; ctx.fill();
    rect(2, -74, 11, 3, '#c2650f');
    // усы — классика
    rect(1, -67.5, 7, 2, '#5a3a22');
    ctx.restore();
  }

  // ================= УЛИЦА =================
  function tempColor(t, base) {
    const k = U.clamp((t - 18) / 60, 0, 1);
    return mix('#5c6f86', base, 0.25 + k * 0.75);
  }
  function drawTree(x, gy, season, seed) {
    rect(x - 4, gy - 60, 8, 60, '#4a3423');
    ctx.strokeStyle = '#4a3423'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x, gy - 45); ctx.lineTo(x - 18, gy - 75); ctx.moveTo(x, gy - 50); ctx.lineTo(x + 16, gy - 80); ctx.stroke();
    if (season === 'winter') {
      ctx.strokeStyle = '#5a4433'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x - 18, gy - 75); ctx.lineTo(x - 26, gy - 92); ctx.moveTo(x + 16, gy - 80); ctx.lineTo(x + 22, gy - 98); ctx.moveTo(x, gy - 58); ctx.lineTo(x + 2, gy - 100); ctx.stroke();
      return;
    }
    const col = season === 'autumn' ? ['#c9761e', '#a8531a', '#d9a23a'] : season === 'spring' ? ['#7fbf4f', '#5e9e3a', '#9bd065'] : ['#3f7f3a', '#2f6a2c', '#4f9446'];
    for (let i = 0; i < 6; i++) circle(x + (U.hash(seed, i) - 0.5) * 50, gy - 80 - U.hash(seed, i, 1) * 35, 16 + U.hash(seed, i, 2) * 10, col[i % 3]);
  }
  function drawHouseBlock(hd, hs, gy, L, lights, snow, s) {
    const x = hd.x, w = hd.w, fh = 27, fl = hd.floors;
    const top = gy - fl * fh - 12;
    const body = { brick: '#a65a3c', brick2: '#9c5f45', panel: '#c9c3b5', panel2: '#b9c3c7', new: '#d8cfbd' }[hd.style];
    rect(x, top, w, gy - top, body);
    if (hd.style.startsWith('brick')) {
      ctx.strokeStyle = 'rgba(0,0,0,.08)'; ctx.lineWidth = 1;
      for (let yy = top + 6; yy < gy; yy += 6) { ctx.beginPath(); ctx.moveTo(x, yy); ctx.lineTo(x + w, yy); ctx.stroke(); }
    } else {
      ctx.strokeStyle = 'rgba(0,0,0,.12)'; ctx.lineWidth = 1;
      for (let f = 0; f <= fl; f++) { ctx.beginPath(); ctx.moveTo(x, gy - 12 - f * fh); ctx.lineTo(x + w, gy - 12 - f * fh); ctx.stroke(); }
      for (let c = 1; c < 4; c++) { ctx.beginPath(); ctx.moveTo(x + c * w / 4, top); ctx.lineTo(x + c * w / 4, gy); ctx.stroke(); }
    }
    if (hd.style === 'new') rect(x, top, w, 8, '#8a4b3a');
    rect(x - 3, top - 6, w + 6, 7, snow ? '#f2f5f8' : '#5d5a55');
    const cols = Math.floor((w - 16) / 29);
    const gap = (w - cols * 18) / (cols + 1);
    const night = 1 - L;
    const hourBlock = Math.floor(s.t / 90);
    for (let f = 0; f < fl; f++) {
      for (let c = 0; c < cols; c++) {
        const wx = x + gap + c * (18 + gap), wy = gy - 12 - (f + 1) * fh + 6;
        const lit = night > 0.25 && U.hash(hd.id * 31 + f, c, hourBlock) < (U.hour(s.t) > 0.5 && U.hour(s.t) < 5.5 ? 0.12 : 0.55);
        rect(wx, wy, 18, 16, mix('#2a3b52', '#8fb2cf', L * 0.8));
        rect(wx, wy + 7, 18, 1.5, 'rgba(255,255,255,.25)');
        if (lit) lights.push([wx, wy, 18, 16, U.hash(hd.id, f, c) < 0.3 ? '#ffe7a8' : '#ffd27a']);
      }
    }
    // подъезды
    const ents = w > 235 ? 3 : 2;
    for (let e = 0; e < ents; e++) {
      const ex = x + (e + 0.5) * w / ents - 11;
      rect(ex - 5, gy - 34, 32, 4, '#5b5f66');
      rect(ex, gy - 30, 22, 30, '#5a4636');
      rect(ex + 16, gy - 16, 3, 3, '#c9b37a');
      if (night > 0.3) lights.push([ex + 6, gy - 40, 10, 5, '#fff3c0']);
    }
    // табличка
    rr(x + 6, gy - 58, 26, 18, 3); ctx.fillStyle = '#1d4f91'; ctx.fill();
    text(String(hd.id), x + 19, gy - 49, 13, '#fff', 'center', true, false);
    // пузырь состояния
    const bx = x + w / 2, by = top - 30;
    const season = G.Sim.heatSeason(s.t);
    const lbl = (season ? U.deg1(hs.tin) + '  ' : '') + 'ГВС ' + U.deg(hs.ttap);
    ctx.font = 'bold 13px ' + FONT;
    const bw = ctx.measureText(lbl).width + 22;
    rr(bx - bw / 2, by - 13, bw, 24, 7); ctx.fillStyle = 'rgba(14,20,30,.82)'; ctx.fill();
    circle(bx - bw / 2 + 10, by - 1, 4.5, hs.sat > 60 ? '#5cd65c' : hs.sat > 35 ? '#f0c040' : '#f05040');
    text(lbl, bx + 5, by - 1, 13, (season && hs.tin < 18.5) || hs.ttap < 50 ? '#ff9a8a' : '#e8f0ff', 'center', true, false);
    const tasks = G.S.tasks.filter((k) => !k.done && !k.failed && k.ref === hd.id - 1 && ['heat', 'hot', 'overheat', 'air', 'leak', 'meter', 'job', 'burst'].includes(k.type));
    if (tasks.length) {
      const yy = by - 30 + Math.sin(anim * 5) * 3;
      circle(bx, yy, 11, '#f0a020');
      text('!', bx, yy + 1, 16, '#1a1205', 'center', true, false);
    }
    if (hd.mine) text('мой дом', x + w - 8, gy - 49, 11, '#ffe7a8', 'right', true);
    addHit('house:' + (hd.id - 1), x, top - 44, w, gy - top + 44);
  }
  function drawCTPBuilding(gy, L, lights, snow, s) {
    const p = D.PLACES.ctp, x = p.x, w = p.w, top = gy - 118;
    rect(x, top, w, 118, '#9b4a32');
    ctx.strokeStyle = 'rgba(0,0,0,.12)'; ctx.lineWidth = 1;
    for (let yy = top + 6; yy < gy; yy += 6) { ctx.beginPath(); ctx.moveTo(x, yy); ctx.lineTo(x + w, yy); ctx.stroke(); }
    rect(x - 4, top - 6, w + 8, 8, snow ? '#f2f5f8' : '#555');
    for (let i = 0; i < 4; i++) { rect(x + 14 + i * 54, top + 16, 34, 18, mix('#26303c', '#8fb2cf', L * 0.6)); ctx.strokeStyle = '#ddd'; ctx.strokeRect(x + 14 + i * 54, top + 16, 34, 18); }
    if (1 - L > 0.3) for (let i = 0; i < 4; i++) lights.push([x + 14 + i * 54, top + 16, 34, 18, '#e8f4ff']);
    const dx = p.door - 22;
    rect(dx, gy - 62, 44, 62, '#56606c');
    rect(dx + 3, gy - 59, 38, 56, '#68737f');
    rect(dx + 33, gy - 32, 4, 8, '#222');
    rr(dx - 16, gy - 92, 76, 22, 3); ctx.fillStyle = '#e8e2d0'; ctx.fill();
    text('ЦТП-7', dx + 22, gy - 81, 14, '#1d4f91', 'center', true, false);
    rect(x + w - 40, top - 40, 12, 36, '#6b6b6b');
    if (s.heat.t1 > 55 && G.Sim.heatSeason(s.t)) {
      for (let i = 0; i < 4; i++) {
        const k = ((anim * 0.5 + i / 4) % 1);
        circle(x + w - 34 + Math.sin(anim + i) * 6, top - 44 - k * 40, 6 + k * 10, 'rgba(235,240,245,' + (0.35 * (1 - k)) + ')');
      }
    }
    if (1 - L > 0.3) lights.push([p.door - 6, gy - 104, 12, 6, '#fff3c0']);
    if (s.ev.inspect) { // машина начальника
      const cx = x + w + 6;
      rr(cx, gy - 24, 64, 18, 6); ctx.fillStyle = '#e8e8e8'; ctx.fill();
      rr(cx + 12, gy - 36, 36, 14, 5); ctx.fillStyle = '#d0d0d0'; ctx.fill();
      circle(cx + 14, gy - 5, 6, '#222'); circle(cx + 50, gy - 5, 6, '#222');
    }
    addHit('ctp', x, top, w, 118);
  }
  function drawShop(gy, L, lights, snow, s) {
    const p = D.PLACES.shop, x = p.x, w = p.w, top = gy - 105;
    rect(x, top, w, 105, '#d9cfb4');
    rect(x - 4, top - 6, w + 8, 8, snow ? '#f2f5f8' : '#6a5f4f');
    rr(x + 10, top + 8, w - 20, 24, 3); ctx.fillStyle = '#b3261e'; ctx.fill();
    text('ПРОДУКТЫ · ХОЗТОВАРЫ', x + w / 2, top + 20, 13, '#fff', 'center', true, false);
    const open = G.Act.shopOpen();
    rect(x + 14, top + 42, 100, 50, open ? '#f6e6a8' : '#2c3644');
    if (open && 1 - L > 0.2) lights.push([x + 14, top + 42, 100, 50, '#ffe9a6']);
    for (let i = 0; i < 5; i++) rect(x + 20 + i * 19, top + 70, 12, 22, ['#c33', '#36c', '#3a3', '#fc3', '#c6c'][i]);
    rect(p.door - 18, gy - 64, 36, 64, '#4d5a68');
    rect(p.door - 14, gy - 60, 28, 40, open ? '#cfe4f0' : '#2c3644');
    text(open ? 'ОТКРЫТО' : 'ЗАКРЫТО', p.door, gy - 72, 10, open ? '#2e7d32' : '#b3261e', 'center', true, false);
    addHit('shop', x, top, w, 105);
  }
  function drawStreetPipes(gy, s) {
    const x0 = D.PLACES.ctp.door, x1 = D.HOUSES[4].x + D.HOUSES[4].w / 2 + 20;
    const cy = gy + 30;
    rect(x0 - 30, cy - 10, x1 - x0 + 50, 62, '#6b6a66');
    rect(x0 - 26, cy - 6, x1 - x0 + 42, 54, '#2f2c28');
    const H = s.heat, W = s.gvs;
    // магистраль теплосети от ТЭЦ — входит в ЦТП слева
    const nx = D.PLACES.ctp.x + 30, tRet = G.Sim.netReturn(s);
    rect(-30, cy + 2, nx + 40, 30, '#6b6a66'); rect(-26, cy + 6, nx + 32, 22, '#2f2c28');
    [[cy + 12, '#8e1b1b', s.tnet, 1], [cy + 22, '#1b2f70', tRet, -1]].forEach(([y, c, t, dir], k) => {
      ctx.strokeStyle = tempColor(t, c); ctx.lineWidth = 7; ctx.lineCap = 'butt';
      ctx.beginPath(); ctx.moveTo(-26, y); ctx.lineTo(nx + 6 + k * 12, y); ctx.lineTo(nx + 6 + k * 12, gy); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 2; ctx.setLineDash([6, 22]); ctx.lineDashOffset = -dir * anim * 30;
      ctx.beginPath(); ctx.moveTo(-26, y); ctx.lineTo(nx, y); ctx.stroke(); ctx.setLineDash([]);
    });
    tag('магистраль от ТЭЦ → ' + U.deg(s.tnet) + ' / ' + U.deg(tRet), 300, cy - 4, '#3a1414', '#ffd36b', 10);
    const ps = [[1, H.t1, H.q, 1], [2, H.t2, H.q, -1], [3, W.t3, W.ps > 1 ? 0.6 + W.q * 0.4 : 0, 1], [4, W.t4, W.q, -1]];
    ps.forEach(([pipe, t, q, dir], k) => {
      const y = cy + 2 + k * 12;
      ctx.strokeStyle = tempColor(t, D.PIPES[pipe].color);
      ctx.lineWidth = 8; ctx.lineCap = 'butt';
      ctx.beginPath(); ctx.moveTo(x0 - 10, y); ctx.lineTo(x1, y); ctx.stroke();
      if (q > 0.05) {
        ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 2;
        ctx.setLineDash([6, 22]); ctx.lineDashOffset = -dir * anim * 40 * q;
        ctx.beginPath(); ctx.moveTo(x0 - 10, y); ctx.lineTo(x1, y); ctx.stroke();
        ctx.setLineDash([]);
      }
      D.HOUSES.forEach((hd) => {
        const bx = hd.x + 30 + k * 9;
        ctx.strokeStyle = tempColor(t, D.PIPES[pipe].color); ctx.lineWidth = 5;
        ctx.beginPath(); ctx.moveTo(bx, y); ctx.lineTo(bx, gy); ctx.stroke();
      });
      ctx.lineWidth = 6; ctx.strokeStyle = tempColor(t, D.PIPES[pipe].color);
      ctx.beginPath(); ctx.moveTo(x0 - 10 + k * 8 - 12, y); ctx.lineTo(x0 - 10 + k * 8 - 12, gy); ctx.stroke();
      tag(D.PIPES[pipe].name + ' ' + U.deg(t), x0 + 70, y, D.PIPES[pipe].color, '#fff', 10);
    });
    if (s.ev.burst) {
      const hd = D.HOUSES[s.ev.burst.house];
      const bx = hd.x - 30;
      const big = !s.ev.burst.isolated;
      for (let i = 0; i < (big ? 9 : 3); i++) {
        const k = ((anim * 0.6 + i / 9) % 1);
        circle(bx + Math.sin(anim * 2 + i) * 14, gy - k * (big ? 140 : 50), 10 + k * 26, 'rgba(240,244,248,' + (0.5 * (1 - k)) + ')');
      }
      if (s.ev.burst.called !== null) {
        rect(bx - 40, gy - 20, 70, 20, '#d32f2f'); rect(bx - 34, gy - 32, 30, 14, '#e0e0e0');
        text('АВАРИЙНАЯ', bx - 5, gy - 10, 9, '#fff', 'center', true, false);
      }
    }
  }
  function drawStreet(s, P) {
    const L = daylight(s.t);
    const gy = LH - 118;
    const camX = cam.street = U.clamp(cam.street, 0, Math.max(0, D.STREET_W - LW));
    tx = -camX; ty = 0;
    ctx.fillStyle = skyGrad(0, gy, L, s); ctx.fillRect(0, 0, LW, gy);
    const h = U.hour(s.t);
    if (L > 0.05) { const sx = LW * U.clamp((h - 6) / 14, 0, 1); circle(sx, 80 + Math.abs(h - 13) * 10, 18, s.wx.prec ? 'rgba(255,255,230,.35)' : '#fff3b0'); }
    else circle(LW * 0.75, 90, 12, '#e8ecf5');
    // дальний план
    ctx.fillStyle = mix('#1b2433', '#8a9bb0', L * 0.7);
    for (let i = 0; i < 24; i++) {
      const bx = i * 140 - camX * 0.3, bh = 60 + U.hash(i, 9) * 110;
      ctx.fillRect(bx, gy - bh, 100, bh);
    }
    const snow = snowCover(s);
    const d = U.date(s.t);
    const season = snow || d.m === 11 || d.m <= 2 ? 'winter' : d.m >= 8 && d.m <= 10 ? 'autumn' : d.m === 3 || d.m === 4 ? 'spring' : 'summer';
    ctx.save(); ctx.translate(tx, 0);
    const lights = [];
    [330, 610, 905, 1220, 1530, 1840, 2150, 2450].forEach((x, i) => drawTree(x, gy, season, i));
    drawShop(gy, L, lights, snow, s);
    drawCTPBuilding(gy, L, lights, snow, s);
    D.HOUSES.forEach((hd, i) => drawHouseBlock(hd, s.houses[i], gy, L, lights, snow, s));
    [300, 625, 930, 1245, 1555, 1865, 2175].forEach((x) => { rect(x - 2, gy - 120, 4, 120, '#3b3f45'); rect(x - 2, gy - 120, 22, 4, '#3b3f45'); if (1 - L > 0.3) lights.push([x + 12, gy - 117, 10, 5, '#ffe9a6', 1]); });
    // тротуар и земля
    rect(-20, gy, D.STREET_W + 40, 16, snow ? '#e9eef2' : '#6c6c6c');
    const sg = ctx.createLinearGradient(0, gy + 16, 0, LH);
    sg.addColorStop(0, '#5a4532'); sg.addColorStop(1, '#2c2219');
    ctx.fillStyle = sg; ctx.fillRect(-20, gy + 16, D.STREET_W + 40, LH - gy);
    drawStreetPipes(gy, s);
    drawMan(s.px, gy + 13, P.dir, P.walking ? anim * 12 : 0, 0.78);
    ctx.restore();
    // ночь
    if (L < 1) { ctx.fillStyle = 'rgba(8,12,30,' + ((1 - L) * 0.5) + ')'; ctx.fillRect(0, 0, LW, LH); }
    ctx.save(); ctx.translate(tx, 0);
    for (const l of lights) {
      ctx.fillStyle = l[4]; ctx.fillRect(l[0], l[1], l[2], l[3]);
      if (l[5]) { const g = ctx.createRadialGradient(l[0] + 5, l[1] + 2, 2, l[0] + 5, l[1] + 40, 70); g.addColorStop(0, 'rgba(255,230,160,.35)'); g.addColorStop(1, 'rgba(255,230,160,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(l[0] + 5, l[1]); ctx.lineTo(l[0] - 40, gy + 10); ctx.lineTo(l[0] + 50, gy + 10); ctx.fill(); }
    }
    ctx.restore();
    precip(s, 0, 0, LW, gy + 16);
    addHit('ground', -10000, gy - 300, 30000, 400);
    // переместим «землю» в начало списка, чтобы здания имели приоритет
    const g = hits.pop(); hits.unshift(g);
  }

  // ================= ЦТП =================
  const CT = {
    W: 1450, Y: { 1: 110, 2: 210, 3: 330, 4: 440 }, Y2b: 262, Y4b: 388,
    vx: { inner: 690, outer: 1300 }, px: 910, floor: 505,
    x0: 598, x1: 1430, br0: 840, br1: 980, wall: 1420, gx: 1344, fx: 1090, dx: 1230, feedX: 770, hvsX: 650,
    netS: 375, netR: 425,
  };
  CT.valveX = (v) => (v.outer ? CT.vx.outer : CT.vx.inner);
  CT.pumpPos = (i) => [[CT.px, CT.Y[2], -1], [CT.px, CT.Y2b, 1], [CT.px, CT.Y[4], 1], [CT.px, CT.Y4b, -1]][i];

  function pipeSeg(x0, y0, x1, y1, color, t, w) {
    w = w || 14;
    const c = tempColor(t, color);
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#151a20'; ctx.lineWidth = w + 3;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    ctx.strokeStyle = c; ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.22)'; ctx.lineWidth = 3;
    const ox = y0 === y1 ? 0 : -w / 4, oy = y0 === y1 ? -w / 4 : 0;
    ctx.beginPath(); ctx.moveTo(x0 + ox, y0 + oy); ctx.lineTo(x1 + ox, y1 + oy); ctx.stroke();
  }
  function flowMarks(pts, q, dir) {
    if (q < 0.04) return;
    ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
    ctx.setLineDash([5, 26]); ctx.lineDashOffset = -dir * anim * 60 * q;
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.stroke(); ctx.setLineDash([]);
  }
  function drips(x, y, n, hot) {
    for (let i = 0; i < n; i++) {
      const k = ((anim * 1.4 + i / n) % 1);
      circle(x + (i % 2) * 3, y + k * 50, 2.2, 'rgba(120,180,255,.9)');
    }
    if (hot) for (let i = 0; i < 3; i++) { const k = ((anim * 0.7 + i / 3) % 1); circle(x + Math.sin(anim * 3 + i) * 5, y - k * 30, 4 + k * 8, 'rgba(240,244,248,' + 0.4 * (1 - k) + ')'); }
  }
  function drawValve(v, i, s) {
    const x = CT.valveX(v), y = CT.Y[v.pipe];
    const t = v.pipe === 1 ? s.heat.t1 : v.pipe === 2 ? s.heat.t2 : v.pipe === 3 ? s.gvs.t3 : s.gvs.t4;
    rect(x - 20, y - 17, 6, 34, '#474c55'); rect(x + 14, y - 17, 6, 34, '#474c55');
    rr(x - 14, y - 13, 28, 26, 5); ctx.fillStyle = v.replacedAt > 0 && s.t - v.replacedAt < 30 * 1440 ? '#4c6a8a' : '#3d434c'; ctx.fill();
    rect(x - 6, y - 35, 12, 22, '#4a5059');
    rect(x - 9, y - 37, 18, 5, '#2f343b');
    const stemTop = v.open ? y - 66 : y - 50;
    ctx.strokeStyle = '#b8bec6'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x, y - 37); ctx.lineTo(x, stemTop); ctx.stroke();
    ctx.save(); ctx.translate(x, y - 48);
    ctx.beginPath(); ctx.ellipse(0, 0, 18, 5, 0, 0, Math.PI * 2);
    ctx.strokeStyle = v.broken ? '#666' : '#c0392b'; ctx.lineWidth = 4; ctx.stroke();
    ctx.restore();
    for (let k = 0; k < 3; k++) { circle(x - 17, y - 11 + k * 11, 1.8, '#9aa'); circle(x + 17, y - 11 + k * 11, 1.8, '#9aa'); }
    tag(v.id, x, y + 27, v.open ? '#2e7d32' : '#b3261e', '#fff', 12);
    if (v.stuck || v.broken) { circle(x + 22, y - 48, 8, '#f0a020'); text('!', x + 22, y - 47, 12, '#1a1205', 'center', true, false); }
    if (v.gland) drips(x + 6, y - 34, v.gland + 1, t > 60 && v.gland > 1);
    if (v.flange) drips(x + (v.outer ? 18 : -18), y + 16, v.flange > 1 ? 6 : 3, t > 60);
    addHit('valve:' + i, x - 26, y - 70, 52, 108);
  }
  function drawPump(p, i, s) {
    const [x, y, up] = CT.pumpPos(i);
    const run = p.on && !p.broken;
    const jit = run && p.bear > 70 ? Math.sin(anim * 60) * (p.bear - 70) / 12 : 0;
    ctx.save(); ctx.translate(jit, 0);
    const my = up < 0 ? y - 40 : y + 18;
    rr(x - 15, my, 30, 22, 4); ctx.fillStyle = p.broken ? '#6b4a40' : '#4f8a5b'; ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 1;
    for (let k = 1; k < 5; k++) { ctx.beginPath(); ctx.moveTo(x - 15, my + k * 4.4); ctx.lineTo(x + 15, my + k * 4.4); ctx.stroke(); }
    rect(x - 9, up < 0 ? my - 4 : my + 22, 18, 4, '#3c6e47');
    rect(x - 6, up < 0 ? y - 19 : y + 14, 12, 5, '#555c66');
    circle(x, y, 18, '#3d6e9e');
    circle(x, y, 12, '#335d86');
    if (run) {
      ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 2;
      const a = anim * 14;
      ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * 11, y + Math.sin(a) * 11); ctx.lineTo(x - Math.cos(a) * 11, y - Math.sin(a) * 11); ctx.stroke();
    }
    ctx.restore();
    const lampC = p.broken ? (Math.sin(anim * 8) > 0 ? '#ff3b30' : '#661510') : run ? '#4cff5c' : '#555';
    circle(x + 30, y - 8, 5, lampC);
    text(p.id, x + 38, y - 8, 13, '#fff', 'left', true);
    if (p.seal >= 75) drips(x - 4, y + 18, p.seal >= 100 ? 7 : 2, (p.circ === 'heat' ? s.heat.t2 : s.gvs.t4) > 55 && p.seal >= 100);
    addHit('pump:' + i, x - 30, (up < 0 ? y - 46 : y - 22), 80, 70);
  }
  function drawGauge(pipe, x, y, t, p, q) {
    circle(x, y, 15, '#222');
    circle(x, y, 13, '#f2efe6');
    const a = Math.PI * 0.75 + U.clamp(p / 10, 0, 1) * Math.PI * 1.5;
    ctx.strokeStyle = '#c62828'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * 11, y + Math.sin(a) * 11); ctx.stroke();
    circle(x, y, 2, '#222');
    rect(x - 1.5, y + 14, 3, 12, '#444');
    rr(x + 17, y - 17, 58, 32, 4); ctx.fillStyle = 'rgba(10,14,20,.85)'; ctx.fill();
    text(U.deg(t) + 'C', x + 46, y - 8, 12, t > 50 ? '#ffb199' : '#9fd0ff', 'center', true, false);
    text(p.toFixed(1) + ' бар', x + 46, y + 7, 11, p > 6.5 || p < 2 ? '#ff6b5b' : '#e8f0ff', 'center', true, false);
    addHit('gauge:' + pipe, x - 18, y - 20, 100, 44);
  }
  function drawHX(x, y0, y1, label, foul, id) {
    rect(x - 4, y0 - 6, 78, 8, '#26476e');
    rect(x - 4, y1 - 2, 78, 8, '#26476e');
    rect(x, y0, 10, y1 - y0, '#2c4a6e'); rect(x + 60, y0, 10, y1 - y0, '#2c4a6e');
    for (let k = 0; k < 16; k++) rect(x + 12 + k * 3, y0 + 4, 2, y1 - y0 - 8, k % 2 ? mix('#9aa4ae', '#8a6a3a', foul / 100) : '#c4ccd4');
    ctx.strokeStyle = '#aab'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x - 2, y0 + 10); ctx.lineTo(x + 72, y0 + 10); ctx.moveTo(x - 2, y1 - 10); ctx.lineTo(x + 72, y1 - 10); ctx.stroke();
    text(label, x + 35, y1 + 16, 12, '#fff', 'center', true);
    addHit(id, x - 6, y0 - 8, 84, y1 - y0 + 30);
  }
  // водо-водяной подогреватель ГВС: две горизонтальные секции «труба в трубе» с калачом
  function drawVVP(Wg, tp) {
    const xl = 470, xr = 598, y3 = CT.Y[3], y4 = CT.Y[4];
    const shell = mix('#5d6f84', '#8a6a3a', Wg.foul / 140);
    pipeSeg(462, y3, 462, y4, D.PIPES[3].color, (tp[3] + tp[4]) / 2, 12);
    pipeSeg(462, y3, xl, y3, D.PIPES[3].color, tp[3], 12);
    pipeSeg(462, y4, xl, y4, D.PIPES[4].color, tp[4], 12);
    [y3, y4].forEach((y) => {
      rr(xl, y - 15, xr - xl, 30, 13); ctx.fillStyle = shell; ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(xl + 10, y - 8); ctx.lineTo(xr - 10, y - 8); ctx.stroke();
      rect(xl - 2, y - 18, 7, 36, '#3a4654'); rect(xr - 5, y - 18, 7, 36, '#3a4654');
    });
    text('ВВП ГВС', (xl + xr) / 2, 372, 13, '#fff', 'center', true);
    text('водо-водяной', (xl + xr) / 2, 389, 10, '#e8f0ff', 'center', true);
    text('подогреватель', (xl + xr) / 2, 401, 10, '#e8f0ff', 'center', true);
    addHit('hx:gvs', xl - 14, y3 - 22, xr - xl + 22, y4 - y3 + 44);
  }
  function smallValve(x, y, open, label, id, vertical) {
    ctx.save(); ctx.translate(x, y); if (vertical) ctx.rotate(Math.PI / 2);
    ctx.beginPath(); ctx.moveTo(-9, -7); ctx.lineTo(9, 7); ctx.lineTo(9, -7); ctx.lineTo(-9, 7); ctx.closePath();
    ctx.fillStyle = open ? '#2e7d32' : '#b3261e'; ctx.fill();
    ctx.restore();
    rect(x - 1.5, y - 16, 3, 9, '#999'); rect(x - 8, y - 18, 16, 3, open ? '#2e7d32' : '#b3261e');
    if (label) text(label, x - 14, y, 11, '#fff', 'right', true);
    addHit(id, x - 24, y - 26, 60, 46);
  }
  function drawCTP(s, P) {
    const W = CT.W;
    const camX = cam.ctp = LW >= W ? -(LW - W) / 2 : U.clamp(cam.ctp, 0, W - LW);
    tx = -camX; ty = Math.max(0, (LH - 540) / 2);
    // фон
    rect(0, 0, LW, LH, '#cfcabb');
    ctx.save(); ctx.translate(tx, ty);
    rect(-400, -200, W + 800, 450, '#cfcabb');
    rect(-400, 250, W + 800, 255, '#46706a');
    rect(-400, 248, W + 800, 4, '#2f4f4a');
    for (let k = 0; k < 8; k++) circle(140 + k * 177, 60 + U.hash(k, 5) * 120, 18 + U.hash(k, 6) * 26, 'rgba(120,110,80,.08)');
    const fg = ctx.createLinearGradient(0, CT.floor, 0, CT.floor + 80);
    fg.addColorStop(0, '#7b7a74'); fg.addColorStop(1, '#5d5c57');
    ctx.fillStyle = fg; ctx.fillRect(-400, CT.floor, W + 800, LH);
    ctx.strokeStyle = 'rgba(0,0,0,.15)';
    for (let k = -4; k < 30; k++) { ctx.beginPath(); ctx.moveTo(k * 60, CT.floor); ctx.lineTo(k * 60 - 30, CT.floor + 60); ctx.stroke(); }
    // лампы
    [300, 760, 1200].forEach((x) => { rect(x - 50, 52, 100, 8, '#ddd'); rect(x - 46, 60, 92, 4, '#fffbe8');
      const g = ctx.createLinearGradient(0, 60, 0, 300); g.addColorStop(0, 'rgba(255,250,220,.18)'); g.addColorStop(1, 'rgba(255,250,220,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x - 46, 64); ctx.lineTo(x + 46, 64); ctx.lineTo(x + 140, 300); ctx.lineTo(x - 140, 300); ctx.fill(); });
    // стена справа
    rect(CT.wall, -200, 60, LH + 400, '#8b4a34');
    ctx.strokeStyle = 'rgba(0,0,0,.2)';
    for (let yy = -200; yy < LH + 200; yy += 10) { ctx.beginPath(); ctx.moveTo(CT.wall, yy); ctx.lineTo(CT.wall + 60, yy); ctx.stroke(); }
    // ---- пост
    rect(30, 345, 72, 160, '#5d6b78'); rect(34, 349, 64, 152, '#6e7d8b'); rect(86, 420, 6, 14, '#222');
    rr(36, 318, 60, 20, 3); ctx.fillStyle = '#1b5e20'; ctx.fill(); text('ВЫХОД', 66, 328, 12, '#fff', 'center', true, false);
    addHit('door', 28, 315, 80, 192);
    rect(120, 430, 86, 75, '#8a6236'); rect(124, 434, 78, 67, '#9c7142');
    text('ЗИП', 163, 468, 16, '#5a3a1a', 'center', true, false);
    rect(130, 405, 50, 25, '#6b8fa8'); rect(150, 388, 34, 18, '#b7a07a');
    addHit('box', 116, 384, 96, 122);
    rect(215, 440, 110, 8, '#6d4c2f'); rect(222, 448, 6, 57, '#5a3d25'); rect(312, 448, 6, 57, '#5a3d25');
    rect(236, 430, 40, 10, '#1d4f91'); rect(256, 430, 1.5, 10, '#fff');
    rr(285, 418, 20, 22, 4); ctx.fillStyle = '#ccc'; ctx.fill(); rect(303, 424, 6, 3, '#aaa');
    rect(330, 455, 26, 6, '#4a3a2a'); rect(352, 420, 5, 85, '#4a3a2a');
    text('Журнал', 268, 418, 11, '#fff', 'center', true);
    addHit('desk', 210, 405, 150, 100);
    // шкаф управления
    rect(130, 150, 110, 180, '#8f979f'); rect(134, 154, 102, 172, '#a7aeb5');
    rect(146, 166, 78, 26, '#0e1a12');
    const sched = G.Sim.tSched(s.tout) + s.heat.corr;
    text('Т1→' + Math.round(sched) + '°', 185, 179, 13, '#5cff7a', 'center', true, false);
    s.pumps.forEach((p, k) => { circle(155 + k * 20, 210, 6, p.broken ? '#ff3b30' : p.on ? '#4cff5c' : '#3b3b3b'); text(p.id, 155 + k * 20, 226, 9, '#222', 'center', true, false); });
    rect(225, 240, 5, 20, '#555');
    text(s.ev.power ? 'НЕТ НАПРЯЖЕНИЯ' : 'ЩУ ЦТП-7', 185, 300, 10, s.ev.power ? '#b3261e' : '#333', 'center', true, false);
    addHit('cabinet', 126, 146, 118, 188);
    rr(258, 150, 60, 80, 2); ctx.fillStyle = '#efe9d8'; ctx.fill();
    text('ГРАФИК', 288, 160, 9, '#333', 'center', true, false);
    ctx.strokeStyle = '#c62828'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(264, 222); ctx.quadraticCurveTo(290, 200, 312, 172); ctx.stroke();
    // ---- ввод теплосети от ТЭЦ (первичный контур)
    const H = s.heat, Wg = s.gvs;
    const season = G.Sim.heatSeason(s.t);
    const tRet = G.Sim.netReturn(s);
    const NS = '#8e1b1b', NR = '#1b2f70';
    const qh = season ? H.q : 0, qg = Wg.ps > 1 ? 0.6 : 0;
    rect(CT.netS - 30, CT.floor, CT.netR - CT.netS + 60, 12, '#3a3936');
    pipeSeg(CT.netS, CT.floor + 6, CT.netS, 300, NS, s.tnet, 11);
    pipeSeg(CT.netS, 300, CT.netS, 100, NS, s.tnet, 11);
    pipeSeg(CT.netS, 100, 516, 100, NS, s.tnet, 11);
    pipeSeg(CT.netS, 300, 505, 300, NS, s.tnet, 9);
    pipeSeg(505, 300, 505, 316, NS, s.tnet, 9);
    pipeSeg(516, 220, CT.netR, 220, NR, tRet, 11);
    pipeSeg(505, 456, 505, 478, NR, tRet, 9);
    pipeSeg(505, 478, CT.netR, 478, NR, tRet, 9);
    pipeSeg(CT.netR, 220, CT.netR, CT.floor + 6, NR, tRet, 11);
    flowMarks([[CT.netS, CT.floor], [CT.netS, 100], [516, 100]], Math.max(qh, qg), 1);
    flowMarks([[516, 220], [CT.netR, 220], [CT.netR, CT.floor]], qh, 1);
    flowMarks([[CT.netS, 300], [505, 300], [505, 316]], qg, 1);
    flowMarks([[505, 456], [505, 478], [CT.netR, 478]], qg, 1);
    rr(458, 90, 26, 20, 3); ctx.fillStyle = '#2a5d9a'; ctx.fill(); text('РТ', 471, 100, 9, '#fff', 'center', true, false);
    rr(430, 290, 26, 20, 3); ctx.fillStyle = '#2a5d9a'; ctx.fill(); text('РТ', 443, 300, 9, '#fff', 'center', true, false);
    tag('подача ' + U.deg(s.tnet), CT.netS - 4, 200, NS, '#fff', 10);
    tag('обратка ' + U.deg(tRet), CT.netR + 8, 256, NR, '#fff', 10);
    tag('ВВОД ОТ ТЭЦ ↑', (CT.netS + CT.netR) / 2 + 10, 76, s.ev.netDrop ? '#b3261e' : '#222', '#ffd36b', 12);
    addHit('net', CT.netS - 34, 84, CT.netR - CT.netS + 68, CT.floor - 70);
    // ---- ХВС из водопровода: врезка в обратку ГВС (Т4) и подпитка отопления
    const HC = '#3fa9d6';
    ctx.strokeStyle = HC; ctx.lineWidth = 6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(CT.hvsX, 492); ctx.lineTo(CT.feedX, 492); ctx.lineTo(CT.feedX, CT.Y[2]); ctx.stroke();
    pipeSeg(CT.hvsX, CT.floor + 6, CT.hvsX, CT.Y[4], HC, 30, 9);
    flowMarks([[CT.hvsX, CT.floor], [CT.hvsX, CT.Y[4]]], s.ev.hvs ? 0 : 0.5, 1);
    rr(CT.hvsX - 10, 462, 20, 16, 3); ctx.fillStyle = '#e8e4da'; ctx.fill(); circle(CT.hvsX, 470, 5, '#1d4f91');
    text('ХВС ↑', CT.hvsX - 14, 464, 11, s.ev.hvs ? '#ff8a80' : '#bfefff', 'right', true);
    addHit('hvs', CT.hvsX - 16, 450, 70, 58);
    // ---- главные трубы
    const tp = { 1: H.t1, 2: H.t2, 3: Wg.t3, 4: Wg.t4 };
    for (let p = 1; p <= 4; p++) pipeSeg(CT.x0, CT.Y[p], CT.x1, CT.Y[p], D.PIPES[p].color, tp[p]);
    pipeSeg(CT.br0, CT.Y[2], CT.br0, CT.Y2b, D.PIPES[2].color, tp[2]); pipeSeg(CT.br0, CT.Y2b, CT.br1, CT.Y2b, D.PIPES[2].color, tp[2]); pipeSeg(CT.br1, CT.Y2b, CT.br1, CT.Y[2], D.PIPES[2].color, tp[2]);
    pipeSeg(CT.br0, CT.Y[4], CT.br0, CT.Y4b, D.PIPES[4].color, tp[4]); pipeSeg(CT.br0, CT.Y4b, CT.br1, CT.Y4b, D.PIPES[4].color, tp[4]); pipeSeg(CT.br1, CT.Y4b, CT.br1, CT.Y[4], D.PIPES[4].color, tp[4]);
    circle(CT.hvsX, CT.Y[4], 8, HC);
    const gq = Wg.ps > 1 && G.Sim.pipeOpen(s, 3) ? Math.max(Wg.q, 0.35) : 0;
    flowMarks([[CT.x0, CT.Y[1]], [CT.x1, CT.Y[1]]], H.q, 1);
    flowMarks([[CT.x1, CT.Y[2]], [CT.x0, CT.Y[2]]], H.q, 1);
    flowMarks([[CT.x0, CT.Y[3]], [CT.x1, CT.Y[3]]], gq, 1);
    flowMarks([[CT.x1, CT.Y[4]], [CT.x0, CT.Y[4]]], Wg.q, 1);
    for (let p = 1; p <= 4; p++) tag(D.PIPES[p].name, CT.x0 + 22, CT.Y[p] - 16, D.PIPES[p].color, '#fff', 12);
    text('← Н1/Н2 качают Т2', CT.br0 - 10, CT.Y2b + 2, 11, '#fff', 'right', true);
    text('← Н3/Н4 качают Т4', CT.br0 - 10, CT.Y4b - 2, 11, '#fff', 'right', true);
    // грязевик
    const fx = CT.fx;
    rr(fx - 18, CT.Y[2] + 4, 36, 80, 6); ctx.fillStyle = '#6d757e'; ctx.fill();
    rect(fx - 22, CT.Y[2] + 80, 44, 8, '#555b62');
    text('Грязевик', fx, CT.Y[2] + 100, 11, '#fff', 'center', true);
    addHit('filter', fx - 30, CT.Y[2] - 10, 60, 120);
    // теплообменник отопления (пластинчатый) и ВВП ГВС (секционный)
    drawHX(520, 88, 232, 'ТО отопления', H.foul, 'hx:heat');
    drawVVP(Wg, tp);
    // подпитка, дренажи
    smallValve(CT.feedX, 292, H.feed || (H.auto && H.autoOn), '', 'feed', true);
    text(H.auto ? 'Подпитка (авто)' : 'Подпитка из ХВС', CT.feedX + 14, 292, 11, '#fff', 'left', true);
    if (H.auto) { rr(CT.feedX - 14, 300, 28, 16, 3); ctx.fillStyle = '#c9a227'; ctx.fill(); text('РД', CT.feedX, 308, 9, '#222', 'center', true, false); }
    const dx = CT.dx;
    ctx.strokeStyle = '#2b2f35'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(dx, 252); ctx.bezierCurveTo(dx + 30, 300, dx + 20, 420, dx, 500); ctx.stroke();
    pipeSeg(dx, CT.Y[2], dx, 248, D.PIPES[2].color, tp[2], 7);
    smallValve(dx, 236, H.drain, 'Дренаж отопл.', 'drain:heat', true);
    pipeSeg(dx, CT.Y[4], dx, 488, D.PIPES[4].color, tp[4], 7);
    smallValve(dx, 474, Wg.drain, 'Дренаж ГВС', 'drain:gvs', true);
    rect(dx - 15, 500, 30, 6, '#222');
    if (H.drain && H.ps > 0.05) drips(dx, 255, 6); if (Wg.drain && Wg.ps > 0.05) drips(dx, 492, 6);
    // насосы и задвижки
    s.pumps.forEach((p, i) => drawPump(p, i, s));
    s.valves.forEach((v, i) => drawValve(v, i, s));
    // манометры
    drawGauge(1, CT.gx, CT.Y[1] - 32, H.t1, H.p1);
    drawGauge(2, CT.gx, CT.Y[2] - 32, H.t2, H.p2);
    drawGauge(3, CT.gx, CT.Y[3] - 32, Wg.t3, Wg.p3);
    drawGauge(4, CT.gx, CT.Y[4] - 32, Wg.t4, Wg.p4);
    // вода на полу
    if (s.flood > 1) {
      ctx.fillStyle = 'rgba(90,150,220,' + U.clamp(0.15 + s.flood / 200, 0, 0.55) + ')';
      ctx.beginPath(); ctx.ellipse(930, CT.floor + 14, 80 + s.flood * 5, 6 + s.flood * 0.12, 0, 0, Math.PI * 2); ctx.fill();
    }
    // плакат при ремонте и начальник
    if (s.ev.inspect && s.ev.inspect.at - s.t < 5) drawMan(200, CT.floor + 22, 1, 0, 1.4);
    drawMan(P.ctpX, CT.floor + 20, P.dir, P.walking ? anim * 12 : 0, 1.3, G.busy && G.busy.kind !== 'sleep' ? 'work' : null);
    if (G.busy && G.busy.kind === 'sleep') text('Z z z', P.ctpX + 10, CT.floor - 70 + Math.sin(anim * 2) * 4, 18, '#fff', 'left', true);
    ctx.restore();
  }

  // ================= КВАРТИРА =================
  function boxView() { tx = (LW - 960) / 2; ty = Math.max(0, (LH - 540) / 2); }
  function drawHome(s, P) {
    boxView();
    rect(0, 0, LW, LH, '#d9c9a3');
    ctx.save(); ctx.translate(tx, ty);
    for (let x = -400; x < 1400; x += 24) rect(x, -200, 10, 680, '#d1bf95');
    rect(-400, 470, 1800, LH, '#7d4f2e');
    for (let x = -400; x < 1400; x += 70) rect(x, 470, 2, LH, '#6a4126');
    rect(-400, 462, 1800, 10, '#5d3a20');
    // дверь
    rect(20, 228, 86, 242, '#7b5434'); rect(28, 236, 70, 226, '#8f6640'); circle(88, 360, 4, '#d4b25a');
    text('Выход', 63, 215, 12, '#5a3a1a', 'center', true, false);
    addHit('door', 16, 200, 96, 272);
    // ковёр и кровать
    rect(140, 160, 200, 170, '#8e2a2a'); rect(148, 168, 184, 154, '#a83a2e');
    for (let k = 0; k < 4; k++) for (let j = 0; j < 3; j++) { ctx.save(); ctx.translate(178 + k * 42, 200 + j * 46); ctx.rotate(Math.PI / 4); rect(-10, -10, 20, 20, k % 2 ? '#e3b44a' : '#2a4f7a'); ctx.restore(); }
    rect(120, 400, 230, 50, '#6b4a2f'); rect(120, 360, 16, 110, '#5a3d25'); rect(334, 380, 16, 90, '#5a3d25');
    rr(140, 382, 196, 26, 6); ctx.fillStyle = '#e8e4dc'; ctx.fill();
    rr(150, 368, 60, 22, 8); ctx.fillStyle = '#f5f2ea'; ctx.fill();
    const sleeping = G.busy && G.busy.kind === 'sleep';
    rr(200, 376, 136, 34, 6); ctx.fillStyle = '#4f6fa8'; ctx.fill();
    if (sleeping) { circle(186, 375, 10, '#efc09a'); text('Z z z', 210, 340 + Math.sin(anim * 2) * 5, 22, '#334', 'left', true, false); }
    addHit('bed', 116, 340, 240, 132);
    // окно
    const L = daylight(s.t);
    ctx.save(); ctx.beginPath(); ctx.rect(380, 130, 180, 190); ctx.clip();
    ctx.fillStyle = skyGrad(130, 320, L, s); ctx.fillRect(380, 130, 180, 190);
    for (let k = 0; k < 3; k++) rect(392 + k * 58, 300 - 60 - U.hash(k, 2) * 60, 40, 200, mix('#1b2433', '#8a9bb0', L * 0.7));
    if (snowCover(s)) rect(380, 300, 180, 20, '#e9eef2');
    ctx.restore();
    precip(s, 380, 130, 180, 190);
    ctx.strokeStyle = '#f4f1ea'; ctx.lineWidth = 8; ctx.strokeRect(380, 130, 180, 190);
    ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(470, 130); ctx.lineTo(470, 320); ctx.moveTo(380, 200); ctx.lineTo(560, 200); ctx.stroke();
    rect(366, 118, 30, 210, '#c9a86a'); rect(544, 118, 30, 210, '#c9a86a');
    rect(370, 322, 200, 8, '#f4f1ea');
    addHit('window', 380, 130, 180, 190);
    // батарея
    const hs = s.houses[0];
    const rt = (s.heat.t1 + s.heat.t2) / 2 * (s.heat.q > 0.05 ? 1 : 0.5);
    for (let k = 0; k < 10; k++) { rr(398 + k * 15, 342, 12, 56, 4); ctx.fillStyle = mix('#8f9aa6', '#d98a6a', (rt - 25) / 50); ctx.fill(); }
    if (rt > 45) for (let k = 0; k < 3; k++) { const kk = (anim * 0.3 + k / 3) % 1; ctx.strokeStyle = 'rgba(255,255,255,' + 0.25 * (1 - kk) + ')'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(420 + k * 50, 338 - kk * 30); ctx.quadraticCurveTo(428 + k * 50, 330 - kk * 30, 420 + k * 50, 320 - kk * 30); ctx.stroke(); }
    text('В комнате ' + U.deg1(hs.tin), 470, 108, 13, '#3a2a1a', 'center', true, false);
    addHit('radiator', 392, 336, 160, 82);
    // ванная
    rect(588, 236, 76, 234, '#efece4'); rect(594, 242, 64, 222, '#f8f6f0'); circle(650, 360, 4, '#bbb');
    rr(600, 256, 52, 22, 3); ctx.fillStyle = '#3a6ea5'; ctx.fill(); text('ВАННАЯ', 626, 267, 10, '#fff', 'center', true, false);
    addHit('bath', 584, 232, 84, 240);
    // холодильник и плита
    rr(680, 246, 84, 224, 10); ctx.fillStyle = '#f2f2ee'; ctx.fill(); rect(680, 330, 84, 3, '#ccc');
    rect(750, 270, 5, 40, '#aaa'); rect(750, 350, 5, 50, '#aaa'); text('ЗИЛ', 722, 260, 10, '#b3261e', 'center', true, false);
    rect(770, 368, 70, 102, '#e8e6df'); rect(770, 362, 70, 8, '#cfcac0');
    circle(788, 364, 7, '#333'); circle(822, 364, 7, '#333');
    rr(806, 338, 26, 24, 6); ctx.fillStyle = '#c0392b'; ctx.fill();
    addHit('fridge', 676, 240, 168, 232);
    // телевизор и полка
    rect(850, 400, 96, 70, '#5a3d25');
    if (P.home.bigtv) { rect(842, 300, 112, 72, '#111'); rect(846, 304, 104, 64, G.busy && /телевизор/.test(G.busy.label) ? mix('#2a6ab0', '#9ad', Math.abs(Math.sin(anim * 3))) : '#1d2630'); rect(894, 372, 8, 28, '#222'); }
    else { rr(858, 322, 80, 78, 8); ctx.fillStyle = '#4b3a2a'; ctx.fill(); rr(866, 330, 60, 56, 10); ctx.fillStyle = G.busy && /телевизор/.test(G.busy.label) ? mix('#2a6ab0', '#9ad', Math.abs(Math.sin(anim * 3))) : '#26303a'; ctx.fill(); }
    addHit('tv', 840, 296, 116, 176);
    rect(846, 222, 100, 8, '#6b4a2f');
    if (P.tools.book) { rect(860, 196, 14, 26, '#1d4f91'); rect(876, 200, 12, 22, '#2e7d32'); rect(890, 194, 16, 28, '#b3261e'); }
    else rect(866, 206, 30, 16, '#c9b98f');
    addHit('shelf', 840, 186, 116, 50);
    if (P.home.coffeemaker) { rr(700, 214, 36, 32, 4); ctx.fillStyle = '#333'; ctx.fill(); }
    if (P.home.car) text('Ключи от «Нивы» на гвоздике', 63, 190, 10, '#5a3a1a', 'center', true, false);
    if (!sleeping) drawMan(P.homeX || 500, 490, P.dir, 0, 2.5);
    ctx.restore();
  }

  // ================= МАГАЗИН =================
  function drawShopIn(s, P) {
    boxView();
    rect(0, 0, LW, LH, '#ddd6c4');
    ctx.save(); ctx.translate(tx, ty);
    for (let x = -400; x < 1400; x += 40) for (let y = -200; y < 470; y += 40) { ctx.strokeStyle = 'rgba(0,0,0,.06)'; ctx.strokeRect(x, y, 40, 40); }
    rect(-400, 470, 1800, LH, '#8b8579');
    rr(300, 70, 360, 40, 4); ctx.fillStyle = '#b3261e'; ctx.fill();
    text('ПРОДУКТЫ · ХОЗТОВАРЫ', 480, 90, 20, '#fff', 'center', true, false);
    for (let r = 0; r < 3; r++) {
      rect(150, 160 + r * 70, 660, 8, '#7a5a3a');
      for (let k = 0; k < 22; k++) {
        const x = 156 + k * 30, h = 26 + U.hash(k, r) * 30;
        const food = k < 11;
        rect(x, 160 + r * 70 - h, 22, h, food ? ['#e53935', '#fdd835', '#43a047', '#1e88e5', '#fb8c00'][(k + r) % 5] : ['#78909c', '#8d6e63', '#b0bec5', '#c62828'][(k + r) % 4]);
        if (!food && (k + r) % 4 === 3) { ctx.beginPath(); ctx.ellipse(x + 11, 160 + r * 70 - h - 4, 10, 3, 0, 0, Math.PI * 2); ctx.strokeStyle = '#c0392b'; ctx.lineWidth = 3; ctx.stroke(); }
      }
    }
    circle(480, 318, 16, '#efc09a'); circle(480, 300, 11, '#8a5a2a'); rect(462, 334, 36, 46, '#c94f6d'); rect(468, 344, 24, 36, '#fff');
    rect(260, 380, 440, 90, '#9c7142'); rect(260, 380, 440, 10, '#c8a070');
    rr(600, 350, 60, 32, 4); ctx.fillStyle = '#444'; ctx.fill(); rect(610, 356, 40, 12, '#7cfc9a');
    text('Касса', 630, 400, 12, '#fff', 'center', true);
    addHit('counter', 256, 290, 450, 182);
    rect(30, 260, 80, 210, '#4d5a68'); rect(36, 266, 68, 150, '#cfe4f0');
    text('Выход', 70, 246, 12, '#333', 'center', true, false);
    addHit('door', 26, 236, 90, 236);
    drawMan(560, 518, -1, 0, 2.2);
    ctx.restore();
  }

  // ================= ПОДВАЛ =================
  function drawBasement(s, P) {
    boxView();
    rect(0, 0, LW, LH, '#3e4144');
    const i = s.house, hs = s.houses[i], hd = D.HOUSES[i];
    ctx.save(); ctx.translate(tx, ty);
    for (let k = 0; k < 40; k++) circle(U.hash(k, i) * 960, U.hash(k, 7) * 460, 10 + U.hash(k, 8) * 30, 'rgba(0,0,0,.08)');
    rect(-400, 480, 1800, LH, '#2f2d29');
    const g = ctx.createRadialGradient(480, 70, 10, 480, 200, 420);
    g.addColorStop(0, 'rgba(255,240,190,.28)'); g.addColorStop(1, 'rgba(255,240,190,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 960, 540);
    rect(478, 40, 4, 20, '#222'); circle(480, 66, 8, '#fff6c8');
    const H = s.heat, W = s.gvs;
    const t1 = H.t1 - (1 - hd.dist) * 10;
    const tt = [t1, H.t2, hs.ttap, hs.ttap - 5];
    const ys = [200, 245, 290, 335];
    for (let p = 1; p <= 4; p++) {
      const y = ys[p - 1];
      pipeSeg(-20, y, 640 + p * 25, y, D.PIPES[p].color, tt[p - 1], 12);
      pipeSeg(640 + p * 25, y, 640 + p * 25, -20, D.PIPES[p].color, tt[p - 1], 12);
      tag(D.PIPES[p].name + ' ' + U.deg(tt[p - 1]), 70, y - 16, D.PIPES[p].color, '#fff', 11);
      rr(196, y - 10, 22, 20, 3); ctx.fillStyle = '#3d434c'; ctx.fill();
      circle(330, y - 22, 10, '#f2efe6'); rect(329, y - 12, 2, 6, '#444');
    }
    rr(380, 120, 90, 60, 4); ctx.fillStyle = '#eceae2'; ctx.fill();
    rect(392, 132, 66, 18, '#1a2a1a'); text(String(Math.floor(1234 + s.t / 50)) + ' Гкал', 425, 141, 10, '#7cfc9a', 'center', true, false);
    text('Узел учёта', 425, 166, 10, '#333', 'center', true, false);
    addHit('node', 60, 100, 560, 260);
    if (hs.leak) {
      for (let k = 0; k < 12; k++) { const kk = (anim * 1.5 + k / 12) % 1; circle(690 + kk * 60 * Math.cos(k), 270 + kk * 200, 3, 'rgba(130,180,240,.8)'); }
      ctx.fillStyle = 'rgba(80,130,200,.4)'; ctx.beginPath(); ctx.ellipse(600, 492, 260, 14, 0, 0, Math.PI * 2); ctx.fill();
    }
    rect(830, 250, 100, 230, '#5b5246'); rect(840, 260, 80, 220, '#d8c88a');
    text('Выход', 880, 236, 12, '#ddd', 'center', true, false);
    addHit('exit', 826, 220, 110, 262);
    text(hd.name + ' · подвал', 480, 430, 18, '#ddd', 'center', true);
    drawMan(720, 508, 1, 0, 2.4);
    ctx.restore();
  }

  // ---------- кадр
  function frame(s, P, dt) {
    anim += dt;
    hits = [];
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
    ctx.clearRect(0, 0, LW, LH);
    switch (s.scene) {
      case 'street': drawStreet(s, P); break;
      case 'ctp': drawCTP(s, P); break;
      case 'home': drawHome(s, P); break;
      case 'shop': drawShopIn(s, P); break;
      case 'house': drawBasement(s, P); break;
      default: break;
    }
  }

  return { init, resize, frame, hitTest, toLogical, cam, CT, get LW() { return LW; }, get LH() { return LH; }, get scale() { return scale; }, hudH, drawMan };
})();
