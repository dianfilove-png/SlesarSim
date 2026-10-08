// Интерфейс: HUD, панели оборудования, телефон, магазин, меню
'use strict';

G.UI = (() => {
  const U = G.U, D = G.D;
  const A = () => G.Act;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let cur = null, resume = false, lastScene = null, lastActKey = '', hudAcc = 1, liveAcc = 0, lastTouch = 0, pressing = false, orderDraft = {};
  const api = { dirty: true };

  // ---------- конструкторы
  function h(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; }
  function btn(parent, label, onClick, o) {
    o = o || {};
    const b = h('button', 'btn ' + (o.cls || ''));
    b.innerHTML = esc(label) + (o.sub ? '<small>' + esc(o.sub) + '</small>' : '');
    if (o.disabled) b.disabled = true;
    b.onclick = () => { G.Snd.play('click'); onClick(); };
    parent.appendChild(b);
    return b;
  }
  function kv(parent, k, v, cls) {
    const r = h('div', 'kv', '<span>' + esc(k) + '</span><span class="' + (cls || '') + '">' + esc(v) + '</span>');
    parent.appendChild(r);
  }
  const para = (parent, t, small) => parent.appendChild(h('p', 'ptext' + (small ? ' small' : ''), esc(t)));
  const sect = (parent, t) => parent.appendChild(h('div', 'sect', esc(t)));
  function meter(parent, v, color) {
    const m = h('div', 'meter', '<u style="width:' + U.clamp(v, 0, 100) + '%;background:' + color + '"></u>');
    parent.appendChild(m);
  }
  const reqSub = (r, okText) => (r.length ? 'Нужно: ' + r.join('; ') : okText);
  const dur = (m) => U.dur(A().dur(m));

  // ---------- панель
  // live: панель оборудования — игра идёт, значения обновляются; иначе пауза
  function panel(title, build, live) {
    cur = { title, build, live: !!live };
    resume = false;
    render();
    $('panel').classList.remove('hidden');
  }
  function render() {
    if (!cur) return;
    $('p-title').textContent = typeof cur.title === 'function' ? cur.title() : cur.title;
    const body = $('p-body');
    const st = body.scrollTop;
    body.innerHTML = '';
    cur.build(body);
    body.scrollTop = st;
  }
  function reopen() {
    if (!cur) return;
    const vis = !$('panel').classList.contains('hidden');
    if (vis || resume) { resume = false; render(); $('panel').classList.remove('hidden'); }
  }
  function closePanel(keep) {
    const vis = !$('panel').classList.contains('hidden');
    $('panel').classList.add('hidden');
    if (keep) resume = vis || resume; else { cur = null; resume = false; }
  }
  function hidePanelForBusy() { closePanel(true); }
  const panelOpen = () => !$('panel').classList.contains('hidden');
  const overlayOpen = () => !$('overlay').classList.contains('hidden');
  const isModal = () => overlayOpen() || G.MG.isOpen() || (panelOpen() && !(cur && cur.live));

  // ---------- тосты
  function toast(text, cls, html, ms) {
    const box = $('toasts');
    const t = h('div', 'toast ' + (cls || ''));
    if (html) t.innerHTML = html; else t.textContent = text;
    box.appendChild(t);
    while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => t.remove(), ms || 4500);
    if (cls === 'good') G.Snd.play('good');
  }
  function onMessage(from, text, urgent) {
    const short = text.length > 120 ? text.slice(0, 115).replace(/\s+\S*$/, '') + '… (в телефоне)' : text;
    toast('', 'msg', '<b>' + esc(from) + ':</b> ' + esc(short), urgent ? 8000 : 6000);
    if (urgent) { G.Snd.play('ring'); G.Main.urgent(); }
    api.dirty = true;
  }
  const say = (who, text) => toast('', 'msg', '<b>' + esc(who) + ':</b> ' + esc(text), 6000);
  function flash() { const f = $('flash'); f.classList.add('on'); setTimeout(() => f.classList.remove('on'), 60); }

  // ---------- HUD
  const BARS = [['energy', 'Бодрость'], ['hunger', 'Сытость'], ['health', 'Здоровье'], ['mood', 'Настроение']];
  function buildHud() {
    const bars = $('h-bars');
    bars.innerHTML = '';
    BARS.forEach(([k, l]) => { const b = h('div', 'bar', '<b>' + l + '</b><i><u id="bar-' + k + '"></u></i>'); bars.appendChild(b); });
    const sp = $('speed');
    sp.innerHTML = '';
    ['❚❚', '×1', '×5', '×20'].forEach((l, i) => {
      const b = h('button', '', l);
      b.onclick = () => { if (G.S) { G.S.speed = i; G.Snd.play('click'); hud(); } };
      sp.appendChild(b);
    });
    $('b-phone').onclick = () => { G.Snd.unlock(); $('b-phone').classList.remove('ring'); phone(); };
    $('b-menu').onclick = () => menu();
    $('p-close').onclick = () => closePanel();
    document.querySelector('#busy .b-wake').onclick = () => G.Main.wake();
  }
  function hud() {
    const s = G.S;
    if (!s) return;
    const P = s.p;
    $('h-date').textContent = U.dateStr(s.t) + ' · ' + U.clock(s.t);
    const wx = (s.wx.prec ? (s.tout < 0.5 ? ' снег' : ' дождь') : '') + (U.isWorkday(s.t) ? '' : ' · выходной');
    $('h-wx').textContent = 'Улица ' + U.deg(s.tout) + wx;
    BARS.forEach(([k]) => {
      const e = $('bar-' + k), v = P[k];
      e.style.width = v + '%';
      e.style.background = v > 50 ? '#4caf50' : v > 25 ? '#f0b030' : '#e53935';
    });
    $('h-money').textContent = U.money(P.money);
    $('h-trust').textContent = 'Доверие ' + Math.round(P.trust) + ' · ' + D.RANKS[G.Ev.rankIdx()].r + ' разр.';
    const unread = s.msgs.filter((m) => !m.read).length;
    $('ph-badge').textContent = unread ? String(unread) : '';
    [...$('speed').children].forEach((b, i) => b.classList.toggle('on', i === s.speed));
    const names = { street: 'Квартал', ctp: 'ЦТП-7', home: 'Дом №1, кв. 12 — моя квартира', shop: 'Магазин «Продукты · Хозтовары»', house: D.HOUSES[s.house].name + ' — подвал' };
    $('loc').textContent = names[s.scene] + (isModal() && !G.busy ? ' · пауза' : '');
    actbar();
    const b = G.busy;
    const bz = $('busy');
    if (b) {
      bz.classList.remove('hidden');
      bz.querySelector('.b-label').textContent = b.label;
      bz.querySelector('.b-bar i').style.width = (100 * (1 - b.left / b.total)) + '%';
      bz.querySelector('.b-time').textContent = 'Осталось ' + U.dur(b.left);
      bz.querySelector('.b-wake').classList.toggle('hidden', b.kind !== 'sleep' || !b.interruptible);
    } else bz.classList.add('hidden');
  }
  function actbar() {
    const s = G.S;
    const key = s.scene + '|' + (G.busy ? 1 : 0);
    if (key === lastActKey && !api.dirty) return;
    lastActKey = key;
    api.dirty = false;
    const bar = $('actbar');
    bar.innerHTML = '';
    zonebar();
    if (G.busy) return;
    const add = (l, f, main) => { const b = h('button', main ? 'main' : '', esc(l)); b.onclick = () => { G.Snd.unlock(); G.Snd.play('click'); f(); }; bar.appendChild(b); };
    const M = G.Main;
    if (s.scene === 'street') {
      add('Домой', () => M.goHome());
      add('ЦТП', () => M.goPlace('ctp'), true);
      add('Магазин', () => M.goPlace('shop'));
    } else if (s.scene === 'ctp') {
      add('Обход', () => panelDesk(), true);
      add('Шкаф', () => panelCabinet());
      add('Ящик', () => panelBox());
      add('На улицу', () => M.exit());
    } else if (s.scene === 'home') {
      add('Спать', () => panelHome('bed'));
      add('Еда', () => panelHome('fridge'));
      add('На улицу', () => M.exit(), true);
    } else if (s.scene === 'shop') {
      add('Купить', () => panelShop(), true);
      add('На улицу', () => M.exit());
    } else if (s.scene === 'house') {
      add('Действия', () => panelBasement(s.house), true);
      add('На улицу', () => M.exit());
    }
  }
  // ---------- зоны ЦТП и список оборудования
  const ZONES = [['Пост', 180], ['Ввод·ТО', 470], ['Насосы', 910], ['Выход', 1290]];
  function zonebar() {
    const z = $('zonebar');
    z.innerHTML = '';
    const on = G.S.scene === 'ctp' && !G.busy;
    z.classList.toggle('hidden', !on);
    if (!on) return;
    ZONES.forEach(([l, x]) => {
      const b = h('button', '', esc(l));
      b.dataset.x = x;
      b.onclick = () => { G.Snd.play('click'); G.R.focusCtp(x); };
      z.appendChild(b);
    });
    const L = h('button', 'list', '≡');
    L.setAttribute('aria-label', 'Всё оборудование');
    L.onclick = () => { G.Snd.play('click'); panelEquip(); };
    z.appendChild(L);
  }
  function zoneHighlight() {
    if (!G.S || G.S.scene !== 'ctp') return;
    const c = G.R.cam.ctp + G.R.LW / 2;
    let best = null, bd = 1e9;
    [...$('zonebar').children].forEach((b) => { if (!b.dataset.x) return; const d = Math.abs(Number(b.dataset.x) - c); if (d < bd) { bd = d; best = b; } });
    [...$('zonebar').children].forEach((b) => b.classList.toggle('on', b === best));
  }
  function openObj(id) {
    const [x] = G.R.objPos(id);
    G.R.focusCtp(x, 0.22);
    G.Main.P.ctpTo = U.clamp(x, 60, G.R.CT.W - 80);
    const [k, a] = id.split(':');
    const n = Number(a);
    const map = { pump: () => panelPump(n), valve: () => panelValve(n), feed: panelFeed, drain: () => panelDrain(a), filter: panelFilter,
      hx: () => panelHX(a), net: panelNet, hvs: panelHvs, gauge: () => panelGauge(n), cabinet: panelCabinet, desk: panelDesk, box: panelBox };
    map[k]();
  }
  function panelEquip() {
    const s = G.S;
    panel('Оборудование ЦТП', (b) => {
      const H = s.heat, W = s.gvs;
      kv(b, 'Отопление', H.ps.toFixed(1) + ' бар · Т1 ' + U.deg(H.t1) + ' · расход ' + Math.round(H.q * 100) + '%', H.q > 0.5 ? 'ok' : G.Sim.heatSeason(s.t) ? 'bad' : 'warn');
      kv(b, 'ГВС', W.ps.toFixed(1) + ' бар · Т3 ' + U.deg(W.t3) + ' · циркуляция ' + (W.q > 0.3 ? 'есть' : 'нет'), W.q > 0.3 && W.ps > 1 ? 'ok' : 'bad');
      const nbad = checklist('heat').concat(checklist('gvs')).filter((x) => !x.ok).length;
      btn(b, 'Чек-лист пуска (шкаф)' + (nbad ? ' — не готово: ' + nbad : ' — всё ✔'), () => openObj('cabinet'), { cls: nbad ? 'warn' : '' });
      const grid = (title, items) => {
        sect(b, title);
        const g = h('div', 'eq');
        items.forEach(([id, label, st]) => {
          const e = h('button', 'btn ' + (st === 'bad' ? 'bad' : st === 'ok' ? 'okb' : ''), esc(label));
          e.onclick = () => { G.Snd.play('click'); openObj(id); };
          g.appendChild(e);
        });
        b.appendChild(g);
      };
      grid('Насосы', s.pumps.map((p, i) => {
        const bad = p.broken || p.seal >= 75 || (p.on && p.bear >= 75);
        return ['pump:' + i, p.id + ' · ' + (p.circ === 'heat' ? 'отопл.' : 'ГВС') + ' · ' + (p.broken ? 'АВАРИЯ' : p.on ? 'работает' : 'стоит') +
          (p.seal >= 75 ? ' · течь' : '') + (p.on && p.bear >= 75 ? ' · шум' : ''), bad ? 'bad' : p.on ? 'ok' : ''];
      }));
      grid('Задвижки', s.valves.map((v, i) => {
        const bad = v.gland || v.flange || v.stuck || v.broken;
        return ['valve:' + i, v.id + ' · ' + D.PIPES[v.pipe].name + ' · ' + (v.open ? 'откр.' : 'ЗАКР.') + (v.gland || v.flange ? ' · течь' : '') + (v.stuck || v.broken ? ' · клин' : ''), bad ? 'bad' : v.open ? 'ok' : ''];
      }));
      grid('Прочее', [
        ['feed', 'Подпитка · ' + (H.feed ? 'ОТКРЫТА' : 'закрыта'), H.feed ? 'bad' : ''],
        ['drain:heat', 'Дренаж отопл. · ' + (H.drain ? 'ОТКРЫТ' : 'закрыт'), H.drain ? 'bad' : ''],
        ['drain:gvs', 'Дренаж ГВС · ' + (W.drain ? 'ОТКРЫТ' : 'закрыт'), W.drain ? 'bad' : ''],
        ['filter', 'Грязевик · ' + (H.clog < 30 ? 'чистый' : H.clog < 60 ? 'шлам' : 'забит'), H.clog >= 60 ? 'bad' : ''],
        ['hx:heat', 'ТО отопления', H.foul >= 60 ? 'bad' : ''],
        ['hx:gvs', 'ВВП ГВС', W.foul >= 62 ? 'bad' : ''],
        ['net', 'Ввод от ТЭЦ · ' + U.deg(s.tnet), s.ev.netDrop ? 'bad' : ''],
        ['hvs', 'Ввод ХВС', s.ev.hvs ? 'bad' : ''],
        ['desk', 'Стол и журнал', ''],
        ['box', 'Ящик ЗИП', ''],
      ]);
    }, true);
  }

  function tick(dt) {
    hudAcc += dt;
    if (hudAcc > 0.2) { hudAcc = 0; hud(); zoneHighlight(); if (G.Tut) G.Tut.tick(); }
    liveAcc += dt;
    if (liveAcc > 0.8) {
      liveAcc = 0;
      if (cur && cur.live && panelOpen() && !G.busy && !pressing && performance.now() - lastTouch > 1500) render();
    }
  }
  function ring() { $('b-phone').classList.add('ring'); }

  // ================= ЦТП: панели оборудования
  const inv = (id) => A().inv(id);
  function stateWord(v, cls) { return [v, cls]; }
  function panelPump(i) {
    const s = G.S;
    panel(() => 'Насос ' + s.pumps[i].id, (b) => {
      const p = s.pumps[i];
      para(b, (p.circ === 'heat' ? 'Циркуляционный насос отопления на обратке Т2' : 'Циркуляционный насос ГВС на Т4') + (i % 2 ? ', резервная линия.' : ', основная линия.'), true);
      kv(b, 'Состояние', p.broken ? 'АВАРИЯ' : p.on ? 'работает' : 'остановлен', p.broken ? 'bad' : p.on ? 'ok' : '');
      kv(b, 'Наработка', Math.round(p.hours) + ' ч');
      const noise = p.broken ? 'заклинил' : !p.on ? '— (стоит)' : p.bear < 50 ? 'ровный гул' : p.bear < 75 ? 'посторонний шум' : 'скрежет и вибрация!';
      kv(b, 'На слух', noise, p.broken || p.bear >= 75 ? 'bad' : p.bear >= 50 ? 'warn' : 'ok');
      if (s.p.tools.vibro) kv(b, 'Виброметр', (1.2 + p.bear * 0.09).toFixed(1) + ' мм/с · подшипники ' + Math.round(p.bear) + '% · уплотнение ' + Math.round(Math.min(100, p.seal)) + '%', p.bear >= 65 ? 'warn' : 'ok');
      if (s.p.tools.pyrometer && p.on) { const tb = 35 + p.bear * 0.35 + (p.lube < 25 ? 18 : 0); kv(b, 'Пирометр: подшипник', Math.round(tb) + '°C', tb > 70 ? 'bad' : tb > 55 ? 'warn' : 'ok'); }
      kv(b, 'Смазка подшипников', p.lube > 60 ? 'свежая' : p.lube > 25 ? 'нормально' : 'сухо — смазать!', p.lube > 60 ? 'ok' : p.lube > 25 ? '' : 'bad');
      kv(b, 'Уплотнение вала', p.seal >= 100 ? 'течёт струёй!' : p.seal >= 75 ? 'подкапывает' : 'сухо', p.seal >= 100 ? 'bad' : p.seal >= 75 ? 'warn' : 'ok');
      if (!p.on && !p.broken) {
        sect(b, 'Перед пуском ' + (p.circ === 'heat' ? 'отопления' : 'ГВС'));
        drawChecklist(b, p.circ, true);
      }
      sect(b, 'Действия');
      if (p.on) btn(b, 'Остановить насос', () => A().pumpStop(i), { sub: '1 мин' });
      else btn(b, 'Запустить насос', () => A().pumpStart(i), startOpts(p));
      btn(b, 'Смазать подшипники', () => A().pumpLube(i), { cls: inv('grease') ? '' : 'warn', sub: 'Литол-24 (есть ' + inv('grease') + ' порц.) · ' + dur(10) + ' · можно на ходу' });
      const rb = (p.on ? ['остановить насос'] : []).concat(A().needItems([['bearing', 2], ['grease', 1]]));
      btn(b, 'Заменить подшипники', () => A().pumpBearings(i), { cls: rb.length ? 'warn' : '', sub: reqSub(rb, 'Подшипник ×2 + смазка · около ' + dur(90)) });
      const rs = (p.on ? ['остановить насос'] : []).concat(A().needItems([['seal', 1]]));
      btn(b, 'Заменить торцевое уплотнение', () => A().pumpSeal(i), { cls: rs.length ? 'warn' : '', sub: reqSub(rs, 'Торцевое уплотнение · около ' + dur(72)) });
      para(b, 'Совет: перед ремонтом запусти соседний насос, тогда контур не встанет.', true);
    }, true);
  }
  function panelValve(i) {
    const s = G.S;
    panel(() => 'Задвижка ' + s.valves[i].id, (b) => {
      const v = s.valves[i];
      const pi = D.PIPES[v.pipe];
      para(b, pi.full + (v.outer ? ', выходная (на границе с кварталом)' : ', внутренняя (у оборудования)') + '. Стальная клиновая, Ду100.', true);
      kv(b, 'Положение', (v.open ? 'ОТКРЫТА' : 'ЗАКРЫТА') + (v.broken ? ' · шпиндель сорван' : v.stuck ? ' · закисла' : ''), v.broken || v.stuck ? 'bad' : v.open ? 'ok' : 'warn');
      kv(b, 'Состояние', v.cond > 80 ? 'отличное' : v.cond > 55 ? 'хорошее' : v.cond > 30 ? 'изношена' : 'плохое', v.cond > 55 ? 'ok' : v.cond > 30 ? 'warn' : 'bad');
      kv(b, 'Сальник', ['сухо', 'подкапывает', 'течёт', 'хлещет'][v.gland] + ' · запас подтяжки ' + '●'.repeat(v.packing) + '○'.repeat(3 - v.packing), v.gland ? (v.gland > 1 ? 'bad' : 'warn') : 'ok');
      kv(b, 'Фланцы', v.flange > 1 ? 'сорвало прокладку!' : v.flange ? 'потеют' : 'сухо', v.flange ? 'bad' : 'ok');
      sect(b, 'Действия');
      if (v.stuck && !v.broken) {
        btn(b, 'WD-40 и расходить штурвал', () => A().valveUnstick(i, 'wd'), { cls: inv('wd40') ? 'main' : 'warn', sub: 'WD-40 (есть ' + inv('wd40') + ') · ' + dur(15) + ' · шанс высокий' });
        btn(b, 'Газовым ключом с трубой', () => A().valveUnstick(i, 'force'), { cls: 'danger', sub: dur(10) + ' · можно сорвать шпиндель!' });
      } else if (!v.broken) btn(b, v.open ? 'Закрыть задвижку' : 'Открыть задвижку', () => A().valveToggle(i), { cls: v.open ? '' : 'main', sub: dur(5) + ' · старые задвижки могут закиснуть' });
      if (v.gland) btn(b, 'Подтянуть сальник', () => A().valveTighten(i), { cls: v.packing ? '' : 'warn', sub: v.packing ? dur(10) + ' · гаечным ключом' : 'Набивка выработана' });
      const c = pi.circ;
      const rp = A().dryReasons(c).concat(A().needItems([['packing', 1]]));
      btn(b, 'Перенабить сальник', () => A().valveRepack(i), { cls: rp.length ? 'warn' : '', sub: reqSub(rp, 'Набивка АП-31 · около ' + dur(40)) });
      const iso = A().isoReasons(v);
      if (v.flange) {
        const rg = iso.concat(A().needItems([['gasket', 2]]));
        btn(b, 'Заменить прокладки фланцев', () => A().valveRegasket(i), { cls: rg.length ? 'warn' : '', sub: reqSub(rg, 'Прокладка ×2 · мини-игра «болты»') });
      }
      const rr = iso.concat(A().needItems([['valve', 1], ['gasket', 2]]));
      btn(b, 'Заменить задвижку', () => A().valveReplace(i), { cls: rr.length ? 'warn' : 'main', sub: reqSub(rr, 'Задвижка + прокладка ×2 · мини-игра «болты»') });
      para(b, c === 'heat'
        ? 'Чтобы снять задвижку: насосы отопления стоп → закрыть вторую задвижку на этой трубе → открыть «Дренаж отопл.» и дождаться 0 бар. После — открыть задвижки, закрыть дренаж, подпиткой поднять до ~4 бар и запустить насос (чек-лист — в шкафу).'
        : 'Чтобы снять задвижку: насосы ГВС стоп → закрыть вторую задвижку на этой трубе → открыть «Дренаж ГВС» (внизу справа) и дождаться 0 бар. Отопление не трогать! После — открыть задвижки, закрыть дренаж (ГВС наполнится сам) и запустить насос.', true);
    }, true);
  }
  function panelHX(c) {
    const s = G.S;
    panel(c === 'heat' ? 'Теплообменник отопления' : 'ВВП ГВС (подогреватель)', (b) => {
      const C = s[c];
      para(b, c === 'heat' ? 'Пластинчатый ТО: горячая вода с ТЭЦ (слева, ввод из пола) греет воду квартального контура отопления: обратка Т2 входит, подача Т1 выходит. Сетевая вода к жильцам не попадает.' : 'Водо-водяной подогреватель (ВВП), две секции. Внутри труб — водопроводная вода: обратка ГВС Т4 вместе с подмешанной холодной водой (ХВС) входит в нижнюю секцию, нагретая выходит из верхней — это подача ГВС Т3. Между трубами — горячая сетевая вода с ТЭЦ.', true);
      kv(b, 'Сеть, подача', U.deg(s.tnet) + 'C' + (s.ev.netDrop ? ' (авария на ТЭЦ!)' : ''), s.ev.netDrop ? 'bad' : '');
      if (c === 'heat') {
        const sched = G.Sim.tSched(s.tout);
        kv(b, 'По графику при ' + U.deg(s.tout), U.deg(sched) + 'C' + (C.corr ? ' (коррекция ' + (C.corr > 0 ? '+' : '') + C.corr + '°)' : ''));
        kv(b, 'Т1 фактически', U.deg(C.t1) + 'C', C.t1 < sched + C.corr - 5 && G.Sim.heatSeason(s.t) ? 'warn' : 'ok');
      } else {
        kv(b, 'Уставка ГВС', C.set + '°C');
        kv(b, 'Т3 фактически', U.deg(C.t3) + 'C', C.t3 < 58 ? 'warn' : 'ok');
      }
      const f = C.foul;
      kv(b, 'Пластины', f < 30 ? 'чистые' : f < 55 ? 'небольшой налёт' : f < 75 ? 'заросли' : 'сильно заросли накипью', f < 55 ? 'ok' : f < 75 ? 'warn' : 'bad');
      kv(b, 'Потолок нагрева', U.deg(s.tnet - (c === 'heat' ? 4 + f * 0.25 : 3 + f * 0.15)) + 'C');
      sect(b, 'Действия');
      const r = A().dryReasons(c).concat(A().needItems([['reagent', 1]]));
      btn(b, 'Промыть реагентом', () => A().flush(c), { cls: r.length ? 'warn' : 'main', sub: reqSub(r, 'Реагент · около ' + dur(180)) });
      if (c === 'heat') {
        const row = h('div', 'row2');
        btn(row, '−2° к графику', () => A().corr(-2));
        btn(row, '+2° к графику', () => A().corr(2));
        b.appendChild(row);
      } else {
        const row = h('div', 'row2');
        btn(row, 'Уставка −1°', () => A().gvsSet(-1));
        btn(row, 'Уставка +1°', () => A().gvsSet(1));
        b.appendChild(row);
        para(b, 'По СанПиН горячая вода у потребителя — не ниже 60°C и не выше 75°C.', true);
      }
    }, true);
  }
  function panelFilter() {
    const s = G.S;
    panel('Грязевик (фильтр на Т2)', (b) => {
      const c = s.heat.clog;
      para(b, 'Ловит окалину, песок и прочий мусор из квартальной системы перед насосами.', true);
      kv(b, 'Перепад давления', (0.05 + c * 0.012).toFixed(2) + ' бар', c > 60 ? 'bad' : c > 35 ? 'warn' : 'ok');
      kv(b, 'Засор', c < 30 ? 'чистый' : c < 60 ? 'есть шлам' : 'забит — расход падает!', c < 30 ? 'ok' : c < 60 ? 'warn' : 'bad');
      sect(b, 'Действия');
      const r = A().dryReasons('heat').concat(A().needItems([['gasket', 1]]));
      btn(b, 'Почистить грязевик', () => A().cleanFilter(), { cls: r.length ? 'warn' : 'main', sub: reqSub(r, 'Прокладка ×1 · около ' + dur(40)) });
    }, true);
  }
  function panelDrain(c) {
    const s = G.S;
    panel('Дренаж ' + A().circName(c), (b) => {
      const C = s[c];
      para(b, 'Спускной вентиль в трап. Через него сбрасывают давление и сливают воду перед ремонтом.', true);
      kv(b, 'Вентиль', C.drain ? 'ОТКРЫТ' : 'закрыт', C.drain ? 'warn' : 'ok');
      kv(b, 'Давление в контуре', C.ps.toFixed(2) + ' бар');
      btn(b, C.drain ? 'Закрыть дренаж' : 'Открыть дренаж', () => A().drain(c), { cls: 'main', sub: dur(2) });
      if (c === 'gvs') para(b, 'ГВС после закрытия дренажа наполнится сам — от водопровода.', true);
      else para(b, 'Отопление после ремонта нужно заполнить подпиткой до ~4 бар.', true);
    }, true);
  }
  function panelFeed() {
    const s = G.S;
    panel('Подпитка отопления', (b) => {
      const H = s.heat;
      para(b, 'Кран с холодного водопровода в обратку Т2. Восполняет утечки. Держи статику 3.5–4.5 бар. Выше 6.5 — сорвёт прокладки!', true);
      kv(b, 'Давление (статика)', H.ps.toFixed(2) + ' бар', H.ps > 6 || H.ps < 2 ? 'bad' : H.ps < G.Sim.P_LOW || H.ps > G.Sim.P_HIGH ? 'warn' : 'ok');
      kv(b, 'Кран подпитки', H.feed ? 'ОТКРЫТ' : 'закрыт', H.feed ? 'warn' : '');
      const Sm = G.Sim, rate = Sm.feedNetRate(s);
      if (H.feed && H.ps < Sm.P_CLOSE) kv(b, 'До ' + Sm.P_CLOSE + ' бар', H.drain ? 'не наберётся — открыт дренаж!' : s.ev.hvs ? 'не наберётся — нет ХВС'
        : rate <= 0 ? 'не растёт — течь больше подпитки!' : '≈ ' + U.dur((Sm.P_CLOSE - H.ps) / rate), rate > 0 ? 'warn' : 'bad');
      if (H.feed && H.ps >= Sm.P_CLOSE) kv(b, 'Давление набрано', 'закрой подпитку!', 'bad');
      if (H.auto) kv(b, 'Регулятор РД-3М', H.autoOn ? 'подпитывает' : 'держит 3.8–4.2 бар', 'ok');
      btn(b, H.feed ? 'Закрыть подпитку' : 'Открыть подпитку', () => A().feed(), { cls: 'main', sub: dur(1) + ' · около +0.06 бар/мин' });
      pressBtn(b);
      if (!H.auto) btn(b, 'Установить регулятор подпитки', () => A().installReg(), { cls: inv('regulator') ? '' : 'warn', sub: inv('regulator') ? 'около ' + dur(75) : 'Нужен регулятор РД-3М (склад, с 4-го разряда)' });
      if (H.feed) para(b, s.speed ? 'Пока панель открыта, время идёт — манометр растёт на глазах.' : 'Игра на паузе (❚❚) — нажми ×1 или ×5, иначе давление не растёт.', true);
    }, true);
  }
  function panelGauge(pipe) {
    const s = G.S;
    panel(D.PIPES[pipe].full, (b) => {
      const H = s.heat, W = s.gvs;
      const t = [0, H.t1, H.t2, W.t3, W.t4][pipe], p = [0, H.p1, H.p2, W.p3, W.p4][pipe];
      kv(b, 'Температура', U.deg1(t) + 'C');
      kv(b, 'Давление', p.toFixed(2) + ' бар', p > 6.5 || p < 2 ? 'bad' : 'ok');
      if (pipe <= 2) {
        kv(b, 'Расход', H.q > 0.8 ? 'нормальный' : H.q > 0.3 ? 'понижен' : H.q > 0.02 ? 'еле идёт' : 'нет циркуляции', H.q > 0.8 ? 'ok' : H.q > 0.3 ? 'warn' : 'bad');
        kv(b, 'Перепад Т1−Т2', (H.p1 - H.p2).toFixed(2) + ' бар');
      } else {
        kv(b, 'Циркуляция', W.q > 0.3 ? 'есть' : 'нет', W.q > 0.3 ? 'ok' : 'warn');
      }
      para(b, pipe === 1 ? 'Горячая вода в батареи квартала. Её температура зависит от погоды (график).' :
        pipe === 2 ? 'Остывшая вода из батарей возвращается на ЦТП, через грязевик и насосы — в теплообменник.' :
        pipe === 3 ? 'Горячая вода в краны жильцов, должна быть 60–75°C.' : 'Циркуляция: вода из стояков возвращается, чтобы в кранах не остывала. Без неё на дальних домах вода еле тёплая.', true);
    }, true);
  }
  function panelNet() {
    const s = G.S;
    panel('Ввод теплосети от ТЭЦ', (b) => {
      para(b, 'Две трубы из пола — магистраль от ТЭЦ. Подача (тёмно-красная) несёт горячую сетевую воду, обратка (тёмно-синяя) возвращает остывшую на ТЭЦ. Через регуляторы РТ сетевая вода идёт в ТО отопления и в ВВП ГВС и греет их, сама в дома не попадает.', true);
      kv(b, 'Подача от ТЭЦ', U.deg(s.tnet) + 'C · ' + (s.ev.netDrop ? '6.1' : '7.8') + ' бар', s.ev.netDrop ? 'bad' : 'ok');
      kv(b, 'Обратка на ТЭЦ', U.deg(G.Sim.netReturn(s)) + 'C · 4.2 бар');
      kv(b, 'Температурный график ТЭЦ', '150/70 (излом 70°C)');
      if (s.ev.netDrop) kv(b, 'Авария на магистрали', 'температура снижена на ' + s.ev.netDrop.delta + '°', 'bad');
      para(b, 'Летом отопление отключено: сетевая вода идёт только на ВВП ГВС. Вводные задвижки — хозяйство теплосети, слесарю ЦТП их трогать не положено.', true);
    }, true);
  }
  function panelHvs() {
    const s = G.S;
    panel('Ввод холодной воды (ХВС)', (b) => {
      para(b, 'Водопровод из пола через водомер. ХВС врезана в обратку ГВС Т4 перед ВВП: жильцы разбирают горячую воду — её место занимает холодная, которая греется в ВВП. Отдельная линия идёт на подпитку отопления (кран у Т2).', true);
      kv(b, 'Холодная вода', s.ev.hvs ? 'ОТКЛЮЧЕНА водоканалом' : 'есть, ~4.6 бар', s.ev.hvs ? 'bad' : 'ok');
      kv(b, 'Давление ГВС', s.gvs.ps.toFixed(1) + ' бар');
      kv(b, 'Подпитка отопления', s.heat.feed ? 'открыта' : 'закрыта', s.heat.feed ? 'warn' : '');
    }, true);
  }
  function panelCabinet() {
    const s = G.S;
    if (G.Tut) G.Tut.flag('cabinet');
    panel('Шкаф управления ЩУ', (b) => {
      kv(b, 'Электропитание', s.ev.power ? 'НЕТ НАПРЯЖЕНИЯ' : 'есть', s.ev.power ? 'bad' : 'ok');
      if (!G.Sim.heatSeason(s.t)) {
        sect(b, 'Летние работы');
        const ok = (s.heat.pressOkAt || -1) > (s.flags.summerFrom || 0);
        kv(b, 'Акт опрессовки', ok ? 'подписан' : 'нет', ok ? 'ok' : 'warn');
        const iss = G.Ev.readinessIssues(s);
        kv(b, 'Готовность к зиме', iss.length ? 'замечаний: ' + iss.length : 'всё готово', iss.length ? 'warn' : 'ok');
        const plan = G.Ev.openTasks().filter((k) => k.plan).length;
        if (plan) kv(b, 'Летний план', 'осталось задач: ' + plan + ' (до 31 августа)', 'warn');
        iss.slice(0, 6).forEach((x) => para(b, '• ' + x, true));
        pressBtn(b);
      }
      sect(b, 'Пуск отопления — по порядку');
      drawChecklist(b, 'heat');
      sect(b, 'Пуск ГВС — по порядку');
      drawChecklist(b, 'gvs');
      sect(b, 'Насосы');
      s.pumps.forEach((p, i) => {
        const st = p.broken ? 'АВАРИЯ' : p.on ? 'работает' : 'стоит';
        btn(b, p.id + ' (' + (p.circ === 'heat' ? 'отопление' : 'ГВС') + ') — ' + st, () => (p.on ? A().pumpStop(i) : A().pumpStart(i)),
          p.on ? { sub: 'нажми — остановить' } : p.broken ? { cls: 'danger', sub: 'нужен ремонт' } : startOpts(p));
      });
      sect(b, 'Регулятор отопления (погодный)');
      const sched = G.Sim.tSched(s.tout);
      kv(b, 'Улица', U.deg1(s.tout) + 'C');
      kv(b, 'Т1 по графику', U.deg(sched) + ' + коррекция ' + (s.heat.corr > 0 ? '+' : '') + s.heat.corr + '° = ' + U.deg(sched + s.heat.corr));
      const r1 = h('div', 'row2');
      btn(r1, '−2°', () => A().corr(-2)); btn(r1, '+2°', () => A().corr(2));
      b.appendChild(r1);
      para(b, 'Жалобы на холод — подними коррекцию. На жару — опусти. Самый дальний и старый дом мёрзнет первым.', true);
      sect(b, 'Регулятор ГВС');
      kv(b, 'Уставка Т3', s.gvs.set + '°C');
      const r2 = h('div', 'row2');
      btn(r2, '−1°', () => A().gvsSet(-1)); btn(r2, '+1°', () => A().gvsSet(1));
      b.appendChild(r2);
    }, true);
  }

  function pressBtn(b) {
    if (G.Sim.heatSeason(G.S.t)) return;
    const r = A().pressReasons(), signed = (G.S.heat.pressOkAt || -1) > (G.S.flags.summerFrom || 0);
    btn(b, 'Опрессовка отопления (гидроиспытания)', () => A().pressTest(), { cls: r.length ? 'warn' : signed ? 'ghost' : 'main', sub: reqSub(r, (signed ? 'акт уже подписан · ' : '') + '7,5 бар, 10 минут · около ' + dur(48)) });
  }
  function pressReport(ok, drop, defects) {
    panel('Гидравлические испытания', (b) => {
      kv(b, 'Давление испытания', '7,5 бар (1,25 рабочего)');
      kv(b, 'Падение за 10 минут', drop.toFixed(2) + ' бар', drop <= 0.2 ? 'ok' : 'bad');
      kv(b, 'Результат', ok ? 'ВЫДЕРЖАЛА — акт подписан' : 'НЕ ВЫДЕРЖАЛА', ok ? 'ok' : 'bad');
      if (!ok) {
        sect(b, 'Дефекты');
        defects.forEach((x) => para(b, '• ' + x));
        para(b, 'Устрани течи (сальники, прокладки, уплотнения, старые задвижки) и повтори испытания.', true);
      }
    });
  }

  // ---------- чек-лист пуска контура (что мешает воде пойти)
  function checklist(c) {
    const s = G.S, C = s[c];
    const pumps = s.pumps.filter((p) => p.circ === c);
    const vs = (pipe) => s.valves.filter((v) => v.pipe === pipe);
    const closed = (pipe) => vs(pipe).filter((v) => !v.open);
    const L = [];
    L.push({ t: 'Напряжение на ЦТП', ok: !s.ev.power, how: 'ждать, пока дадут свет' });
    L.push({ t: 'Дренаж ' + A().circName(c) + ' закрыт', ok: !C.drain, how: 'закрыть вентиль «Дренаж ' + (c === 'heat' ? 'отопл.' : 'ГВС') + '» справа' });
    (c === 'heat' ? [1, 2] : [3, 4]).forEach((pp) => {
      const cl = closed(pp);
      const how = cl.map((v) => (v.broken ? v.id + ' — шпиндель сорван, менять' : v.stuck ? v.id + ' закисла — расходить'
        : 'открыть ' + v.id + (v.outer ? ' (справа у стены)' : ''))).join('; ');
      L.push({ t: 'Задвижки ' + D.PIPES[pp].name + ' (' + vs(pp).map((v) => v.id).join(', ') + ') открыты', ok: !cl.length, how });
    });
    if (c === 'heat') {
      const Sm = G.Sim, low = C.ps < Sm.P_LOW, high = C.ps > Sm.P_HIGH;
      const feeding = C.feed || (C.auto && C.autoOn);
      const rising = feeding && Sm.feedNetRate(s) > 0;
      L.push({ t: 'Давление ' + Sm.P_LOW + '–' + Sm.P_HIGH + ' бар (сейчас ' + C.ps.toFixed(1) + ')', ok: !low && !high, wait: low && rising,
        how: high ? 'много — ненадолго открыть дренаж' : C.drain ? 'сначала закрой дренаж' : s.ev.hvs ? 'нет холодной воды — подпитать нечем'
          : feeding && !rising ? 'течь больше подпитки — ищи утечку' : C.auto && C.autoOn ? 'регулятор подпитывает — жди' : C.feed ? 'идёт подпитка — жди' : 'открыть подпитку (кран у Т2)' });
      if (!C.auto || C.feed) L.push({ t: 'Подпитка закрыта', ok: !C.feed, wait: C.feed && C.ps < Sm.P_CLOSE && rising,
        how: C.ps >= Sm.P_CLOSE ? 'закрыть кран подпитки!' : rising ? 'закроешь на ~' + Sm.P_CLOSE + ' бар' : 'давление не растёт — закрой, разберись' });
    } else {
      L.push({ t: 'Холодная вода в квартале', ok: !s.ev.hvs, how: 'водоканал отключил — ждать' });
      L.push({ t: 'Давление ГВС (сейчас ' + C.ps.toFixed(1) + ')', ok: C.ps >= 3, wait: !C.drain && !s.ev.hvs && C.ps < 3, how: C.drain ? 'закрыть дренаж — наполнится само' : 'наполняется само — жди' });
    }
    const run = pumps.some((p) => p.on && !p.broken);
    L.push({ t: 'Насос ' + pumps.map((p) => p.id).join(' или ') + ' работает', ok: run, pump: true,
      how: pumps.every((p) => p.broken) ? 'оба в аварии — ремонт' : 'запустить (когда всё выше ✔)' });
    return L;
  }
  function drawChecklist(b, c, noPump) {
    checklist(c).filter((x) => !(noPump && x.pump)).forEach((x) => kv(b, (x.ok ? '✔ ' : x.wait ? '… ' : '✘ ') + x.t, x.ok ? 'да' : x.how, x.ok ? 'ok' : x.wait ? 'warn' : 'bad'));
  }
  // кнопка пуска: оранжевая, только если перед пуском всё ✔
  function startOpts(p) {
    const s = G.S;
    if (p.broken) return { cls: 'warn', sub: 'Сначала ремонт' };
    const bad = checklist(p.circ).filter((x) => !x.ok && !x.pump);
    if (!bad.length) return { cls: 'main', sub: 'нажми — запустить · 1 мин' };
    return { cls: 'warn', sub: (s[p.circ].ps < 1 ? 'Давления нет — будет сухой ход! ' : '') + 'Сначала: ' + bad.map((x) => x.t.replace(/ \(сейчас.*\)/, '')).join('; ') };
  }
  function panelDesk() {
    const s = G.S;
    panel('Пост: стол и журнал', (b) => {
      const today = s.journal.lastObhod === U.day(s.t);
      btn(b, today ? 'Обход сегодня сделан — повторить' : 'Сделать обход и заполнить журнал', () => A().obhod(), { cls: today ? '' : 'main', sub: dur(35) + ' · обязательно каждый рабочий день' });
      sect(b, 'Чайник');
      ['doshirak', 'coffee'].forEach((id) => { if (inv(id)) btn(b, (id === 'coffee' ? 'Выпить кофе' : 'Заварить лапшу') + ' (есть ' + inv(id) + ')', () => A().eat(id), { sub: D.ITEMS[id].desc }); });
      if (!inv('doshirak') && !inv('coffee')) para(b, 'Ни лапши, ни кофе. Купи в магазине.', true);
      btn(b, 'Вздремнуть на топчане (1 ч)', () => A().sleep('nap'), { sub: 'Если застукает начальник — будет неловко' });
      sect(b, 'Журнал обхода');
      if (!s.journal.entries.length) para(b, 'Пусто.', true);
      s.journal.entries.slice(0, 6).forEach((e) => para(b, U.dateStr(e.t) + ' ' + U.clock(e.t) + ' — ' + e.text, true));
    }, true);
  }
  function invList(b, eatable) {
    const P = G.S.p;
    const ids = Object.keys(P.inv).filter((id) => P.inv[id] > 0);
    if (!ids.length) para(b, 'Пусто.', true);
    ids.forEach((id) => {
      const it = D.ITEMS[id];
      const n = P.inv[id];
      if (eatable && it.kind === 'food') btn(b, it.name + ' — ' + n + (it.uses ? ' порц.' : ' шт.'), () => A().eat(id), { sub: it.desc });
      else kv(b, it.name, n + (it.uses ? ' порц.' : ' шт.'));
    });
  }
  function panelBox() {
    const s = G.S;
    panel('Ящик ЗИП и карманы', (b) => {
      sect(b, 'Запчасти и расходники');
      const P = s.p;
      const parts = Object.keys(P.inv).filter((id) => D.ITEMS[id].kind === 'part');
      if (!parts.length) para(b, 'Пусто. Закажи на складе через телефон или купи в магазине.', true);
      parts.forEach((id) => kv(b, D.ITEMS[id].name, P.inv[id] + (D.ITEMS[id].uses ? ' порц.' : ' шт.')));
      sect(b, 'Еда');
      const food = Object.keys(P.inv).filter((id) => D.ITEMS[id].kind === 'food');
      if (!food.length) para(b, 'Нет еды.', true);
      food.forEach((id) => btn(b, D.ITEMS[id].name + ' — ' + P.inv[id], () => A().eat(id), { sub: D.ITEMS[id].desc }));
      sect(b, 'Инструмент');
      const tools = Object.keys(P.tools);
      para(b, 'Ключи, газовый ключ, отвёртки' + (tools.length ? ', ' + tools.map((id) => D.ITEMS[id].name.toLowerCase()).join(', ') : '') + '.', true);
      if (s.orders.length) { sect(b, 'Ждём со склада'); s.orders.forEach((o) => para(b, U.dateStr(o.arrive) + ' 9:00 — ' + Object.keys(o.items).map((id) => D.ITEMS[id].name + ' ×' + o.items[id]).join(', '), true)); }
    });
  }

  // ================= квартира
  function panelHome(what) {
    const s = G.S, P = s.p;
    if (what === 'door') {
      return panel('Прихожая', (b) => {
        btn(b, 'Выйти на улицу', () => G.Main.exit(), { cls: 'main' });
        if (P.home.car) btn(b, 'Поехать на рыбалку на «Ниве»', () => A().fishing(), { sub: '5 ч · только в выходные · настроение +30' });
      });
    }
    if (what === 'bed') {
      return panel('Кровать', (b) => {
        btn(b, 'Спать до 7:00', () => A().sleep('night'), { cls: 'main', sub: 'Срочный звонок разбудит' + (P.home.mattress ? ' · ортопедический матрас' : '') });
        btn(b, 'Вздремнуть 2 часа', () => A().sleep('short'));
      });
    }
    if (what === 'fridge') {
      return panel('Кухня', (b) => {
        if (P.home.coffeemaker) btn(b, 'Кофе из кофемашины', () => A().machineCoffee(), { sub: 'Бодрость +25' });
        invList(b, true);
        para(b, 'Пельмени варятся только дома. Лапшу и кофе можно заварить и на ЦТП.', true);
      });
    }
    if (what === 'tv') return panel('Телевизор', (b) => { btn(b, 'Смотреть телевизор (1 ч)', () => A().tv(), { cls: 'main', sub: 'Настроение +' + (P.home.bigtv ? 20 : 10) }); });
    if (what === 'bath') return panel('Ванная', (b) => { kv(b, 'Горячая вода в кране', U.deg(s.houses[0].ttap) + 'C', s.houses[0].ttap >= 50 ? 'ok' : 'bad'); btn(b, 'Принять душ', () => A().shower(), { cls: 'main', sub: dur(15) }); para(b, 'Ты живёшь в доме №1 — твой же ЦТП греет тебе воду.', true); });
    if (what === 'shelf') return panel('Книжная полка', (b) => {
      if (P.tools.book) btn(b, 'Читать справочник (1 ч)', () => A().read(), { cls: 'main', sub: '+14 опыта · не больше 2 раз в день' });
      else para(b, 'Полка пустая. «Справочник слесаря-теплотехника» продаётся в магазине — чтение даёт опыт для разряда.');
    });
    if (what === 'radiator' || what === 'window') return panel(what === 'radiator' ? 'Батарея' : 'Окно', (b) => {
      kv(b, 'В комнате', U.deg1(s.houses[0].tin) + 'C');
      kv(b, 'Батарея', U.deg((s.heat.t1 + s.heat.t2) / 2) + 'C');
      kv(b, 'На улице', U.deg1(s.tout) + 'C');
      if (s.wx.snap) kv(b, 'Прогноз', s.wx.snap.delta < 0 ? 'держится мороз' : 'оттепель');
    }, true);
  }

  // ================= дома квартала
  function houseInfo(b, i) {
    const s = G.S, hs = s.houses[i], hd = D.HOUSES[i];
    para(b, hd.floors + ' этажей, ' + hd.apts + ' квартир.', true);
    if (G.Sim.heatSeason(s.t)) kv(b, 'В квартирах', U.deg1(hs.tin) + 'C', hs.tin < 18.5 ? 'bad' : hs.tin > 25.5 ? 'warn' : 'ok');
    kv(b, 'Горячая вода', U.deg(hs.ttap) + 'C', hs.ttap < 50 ? 'bad' : hs.ttap < 58 ? 'warn' : 'ok');
    kv(b, 'Настроение жильцов', Math.round(hs.sat) + '%', hs.sat > 60 ? 'ok' : hs.sat > 35 ? 'warn' : 'bad');
    meter(b, hs.sat, hs.sat > 60 ? '#4caf50' : hs.sat > 35 ? '#f0b030' : '#e53935');
    const tasks = s.tasks.filter((k) => !k.done && !k.failed && k.ref === i && ['heat', 'hot', 'overheat', 'air', 'leak', 'meter', 'job', 'burst'].includes(k.type));
    if (tasks.length) { sect(b, 'Заявки по дому'); tasks.forEach((k) => taskCard(b, k)); }
  }
  function panelHouse(i) {
    const s = G.S;
    panel(D.HOUSES[i].name, (b) => {
      houseInfo(b, i);
      sect(b, 'Действия');
      if (s.ev.burst && s.ev.burst.house === i && s.ev.burst.called === null) btn(b, 'Вызвать аварийную бригаду на порыв!', () => A().callBrigade(), { cls: 'danger', sub: dur(5) });
      if (D.HOUSES[i].mine) btn(b, 'Подняться домой, кв. 12', () => G.Main.enter('home'), { cls: 'main' });
      btn(b, 'Спуститься в подвал (узел ввода)', () => { s.house = i; G.Main.enter('house'); }, { cls: D.HOUSES[i].mine ? '' : 'main' });
      btn(b, 'Поговорить с жильцами у подъезда', () => A().talk(i), { sub: dur(10) });
      s.tasks.filter((k) => k.type === 'job' && k.ref === i && !k.done && !k.failed).forEach((k) => btn(b, 'Шабашка: кв. ' + k.apt + ' — ' + k.job, () => A().job(k.id), { sub: U.money(k.money) + ' · ' + dur(k.min) }));
    }, true);
  }
  function panelBasement(i) {
    const s = G.S;
    panel(D.HOUSES[i].name + ' — подвал', (b) => {
      const hs = s.houses[i];
      houseInfo(b, i);
      sect(b, 'Работы');
      btn(b, 'Спустить воздух на верхних этажах', () => A().bleedAir(i), { cls: hs.air ? 'main' : '', sub: (hs.air ? 'Жильцы жалуются: стояки холодные. ' : '') + dur(25) });
      if (hs.leak) btn(b, 'Наложить хомут на стояк', () => A().clampLeak(i), { cls: inv('clamp') ? 'main' : 'warn', sub: 'Хомут ремонтный (есть ' + inv('clamp') + ') · ' + dur(30) });
      if (G.Ev.openTask('meter', i)) btn(b, 'Снять показания теплосчётчика', () => A().meter(i), { cls: 'main', sub: dur(10) });
      s.tasks.filter((k) => k.type === 'job' && k.ref === i && !k.done && !k.failed).forEach((k) => btn(b, 'Шабашка: кв. ' + k.apt + ' — ' + k.job, () => A().job(k.id), { sub: U.money(k.money) + ' · ' + dur(k.min) }));
      if (s.ev.burst && s.ev.burst.house === i && s.ev.burst.called === null) btn(b, 'Вызвать аварийную бригаду на порыв!', () => A().callBrigade(), { cls: 'danger' });
      btn(b, 'Выйти на улицу', () => G.Main.exit(), { cls: 'ghost' });
    }, true);
  }

  // ================= магазин
  function panelShop() {
    const s = G.S, P = s.p;
    panel('Магазин', (b) => {
      if (!A().shopOpen()) { para(b, 'Закрыто. Часы работы 8:00–22:00.'); return; }
      kv(b, 'В кармане', U.money(P.money));
      const cats = [['food', 'Продукты'], ['part', 'Сантехника и расходники'], ['tool', 'Инструмент'], ['home', 'Для дома и души']];
      cats.forEach(([k, l]) => {
        sect(b, l);
        D.SHOP_ORDER.filter((id) => D.ITEMS[id].kind === k).forEach((id) => {
          const it = D.ITEMS[id];
          const owned = (k === 'tool' && P.tools[id]) || (k === 'home' && P.home[id]);
          const n = P.inv[id] || 0;
          btn(b, it.name + ' — ' + U.money(it.price) + (owned ? ' (есть)' : n ? ' (есть ' + n + ')' : ''), () => A().buy(id),
            { disabled: !!owned, cls: P.money < it.price && !owned ? 'warn' : '', sub: it.desc });
        });
      });
    });
  }

  // ================= телефон
  function taskCard(b, k) {
    const s = G.S;
    const left = k.deadline ? k.deadline - s.t : null;
    const c = h('div', 'task' + (k.done ? ' done' : k.failed ? ' failed' : ''));
    const when = k.done ? 'выполнено' : k.failed ? 'просрочено' : left !== null ? 'осталось ' + U.dur(left) : '';
    c.innerHTML = '<h4>' + esc(k.title) + '<em class="' + (left !== null && left < 90 && !k.done && !k.failed ? 'hot' : '') + '">' + esc(when) + '</em></h4><p>' + esc(k.desc || '') +
      (k.money && !k.done ? ' <b>' + U.money(k.money) + '</b>' : '') + '</p>';
    b.appendChild(c);
    if (k.type === 'burst' && !k.done && !k.failed && s.ev.burst && s.ev.burst.called === null) btn(b, 'Позвонить в аварийную службу', () => A().callBrigade(), { cls: 'danger' });
  }
  function phone(tab) {
    tab = tab || 'tasks';
    const s = G.S;
    if (!s) return;
    if (G.Tut) { G.Tut.flag('phone'); if (tab === 'sklad') G.Tut.flag('sklad'); }
    panel('Телефон', (b) => {
      const tabs = h('div', 'tabs');
      const unread = s.msgs.filter((m) => !m.read).length;
      [['tasks', 'Заявки (' + G.Ev.openTasks().length + ')'], ['msgs', 'Сообщения' + (unread ? ' •' + unread : '')], ['sklad', 'Склад'], ['me', 'Я']].forEach(([k, l]) => {
        const t = h('button', k === tab ? 'on' : '', esc(l));
        t.onclick = () => phone(k);
        tabs.appendChild(t);
      });
      b.appendChild(tabs);
      if (tab === 'tasks') {
        const open = G.Ev.openTasks().sort((x, y) => (x.deadline || 1e12) - (y.deadline || 1e12));
        if (!open.length) para(b, 'Открытых заявок нет. Можно и чаю попить.');
        open.forEach((k) => taskCard(b, k));
        const old = s.tasks.filter((k) => k.done || k.failed).slice(-6).reverse();
        if (old.length) { sect(b, 'Недавно'); old.forEach((k) => taskCard(b, k)); }
      } else if (tab === 'msgs') {
        s.msgs.slice(0, 40).forEach((m) => {
          const e = h('div', 'msg' + (m.read ? '' : ' unread'), '<b>' + esc(m.from) + '</b><i>' + U.dateStr(m.t) + ' ' + U.clock(m.t) + '</i><br>' + esc(m.text));
          b.appendChild(e);
        });
        s.msgs.forEach((m) => { m.read = true; });
        $('b-phone').classList.remove('ring');
      } else if (tab === 'sklad') skladTab(b);
      else meTab(b);
    });
  }
  function skladTab(b) {
    const s = G.S;
    para(b, 'Запчасти со склада управляющей компании — бесплатно, но привезут на ЦТП к 9:00 следующего дня. Одна заявка в день, лимит ' + U.money(D.SKLAD_LIMIT) + ' в месяц.', true);
    kv(b, 'Использовано в этом месяце', U.money(s.sklad.spent) + ' из ' + U.money(D.SKLAD_LIMIT));
    let sum = 0;
    const rank = G.Ev.rankIdx() + 3;
    Object.keys(D.ITEMS).filter((id) => D.ITEMS[id].sklad).forEach((id) => {
      const it = D.ITEMS[id];
      const locked = it.minRank && rank < it.minRank;
      const n = orderDraft[id] || 0;
      sum += n * it.price;
      const row = h('div', 'qty');
      row.innerHTML = '<span>' + esc(it.name) + (locked ? ' (с ' + it.minRank + '-го разряда)' : '') + '<br><small style="color:#9fb0c4">' + U.money(it.price) + ' · в ящике: ' + inv(id) + '</small></span>';
      const minus = h('button', '', '−'), plus = h('button', '', '+'), q = h('b', '', String(n));
      minus.onclick = () => { orderDraft[id] = Math.max(0, n - 1); render(); };
      plus.onclick = () => { if (!locked) { orderDraft[id] = Math.min(9, n + 1); render(); } };
      if (locked) plus.disabled = true;
      row.append(minus, q, plus);
      b.appendChild(row);
    });
    kv(b, 'Сумма заявки', U.money(sum), s.sklad.spent + sum > D.SKLAD_LIMIT ? 'bad' : '');
    btn(b, 'Отправить заявку на склад', () => {
      const items = {};
      for (const id in orderDraft) if (orderDraft[id] > 0) items[id] = orderDraft[id];
      const before = s.orders.length;
      A().order(items);
      if (s.orders.length > before) orderDraft = {};
      render();
    }, { cls: 'main', disabled: s.sklad.lastDay === U.day(s.t) });
    if (s.sklad.lastDay === U.day(s.t)) para(b, 'Сегодня заявка уже отправлена.', true);
    if (s.orders.length) { sect(b, 'В пути'); s.orders.forEach((o) => para(b, U.dateStr(o.arrive) + ', 9:00 — ' + Object.keys(o.items).map((id) => D.ITEMS[id].name + ' ×' + o.items[id]).join(', '), true)); }
  }
  function meTab(b) {
    const s = G.S, P = s.p;
    const ri = G.Ev.rankIdx(), rk = D.RANKS[ri], nx = D.RANKS[ri + 1];
    sect(b, 'Слесарь Коля Палкин');
    kv(b, 'Разряд', rk.r + '-й');
    kv(b, 'Опыт', P.xp + (nx ? ' / ' + nx.xp + ' до ' + nx.r + '-го' : ' (максимум)'));
    if (nx) meter(b, (P.xp - rk.xp) / (nx.xp - rk.xp) * 100, '#f0a020');
    kv(b, 'Оклад', U.money(rk.salary) + ' / мес');
    kv(b, 'Доверие начальства', Math.round(P.trust) + ' / 100', P.trust > 60 ? 'ok' : P.trust > 30 ? 'warn' : 'bad');
    meter(b, P.trust, P.trust > 60 ? '#4caf50' : P.trust > 30 ? '#f0b030' : '#e53935');
    para(b, 'Аванс 20-го, зарплата 5-го. Премия — при доверии от 55. Доверие 0 — увольнение.', true);
    sect(b, 'Статистика');
    kv(b, 'Дней на ЦТП', String(U.day(s.t) + 1));
    kv(b, 'Ремонтов', String(s.stats.repairs));
    kv(b, 'Заявок выполнено / просрочено', s.stats.tasksDone + ' / ' + s.stats.tasksFailed);
    kv(b, 'Жалоб от жильцов', String(s.stats.complaints));
    kv(b, 'Заработано', U.money(s.stats.earned));
    if (s.stats.shocks) kv(b, 'Ударов током', String(s.stats.shocks), 'bad');
    if (s.ev.burst && s.ev.burst.called === null) btn(b, 'Позвонить в аварийную службу (порыв)', () => A().callBrigade(), { cls: 'danger' });
    const d = U.date(s.t);
    if ((d.m === 5 || d.m === 6 || (d.m === 7 && d.d <= 15)) && P.vacYear !== d.y) {
      sect(b, 'Отпуск');
      btn(b, 'Уйти в отпуск на 2 недели', () => A().vacation(), { sub: 'Отпускные ' + U.money(D.RANKS[ri].salary * 0.45) + ' · настроение +40 · на ЦТП подменит Михалыч' });
    }
  }

  function obhodReport(list) {
    panel('Обход выполнен', (b) => {
      para(b, 'Показания записаны в журнал. Начальник прочитает его утром и, если что, выдаст заявки.');
      sect(b, 'Замечания');
      if (!list.length) para(b, 'Замечаний нет. Красота!');
      list.forEach((t) => para(b, '• ' + t));
    });
  }

  // ================= оверлеи
  function overlay(html) {
    const o = $('overlay');
    o.innerHTML = html;
    o.classList.remove('hidden');
    return o;
  }
  const closeOverlay = () => $('overlay').classList.add('hidden');
  function menu() {
    const running = !!G.S && !G.S.over;
    const o = overlay('<div class="ov"><div class="logo"><h1>СЛЕСАРЬ<br>ЦТП</h1><p>симулятор жизни слесаря</p></div><div class="menu" id="m-list"></div></div>');
    const list = o.querySelector('#m-list');
    if (running) btn(list, 'Продолжить', () => { closeOverlay(); }, { cls: 'main' });
    else if (G.St.hasSave()) btn(list, 'Продолжить', () => { G.Main.cont(); }, { cls: 'main' });
    let sure = !(running || G.St.hasSave());
    const nb = btn(list, 'Новая игра', () => {
      if (!sure) { sure = true; nb.innerHTML = 'Точно заново?<small>Текущее сохранение пропадёт. Нажми ещё раз.</small>'; nb.classList.add('danger'); return; }
      G.Main.startNew();
    }, { cls: sure ? 'main' : '' });
    btn(list, 'Как играть', () => help());
    btn(list, 'Звук: ' + (G.Snd.isOn() ? 'вкл' : 'выкл'), () => { G.Snd.toggle(); menu(); });
  }
  function help() {
    const o = overlay('<div class="ov text"><h2>Как играть</h2>' +
      '<p>Ты — слесарь центрального теплового пункта ЦТП-7. Он греет и снабжает горячей водой пять домов квартала по четырём трубам:</p><ul>' +
      '<li><b style="color:#e0402f">Т1</b> — подача отопления, <b style="color:#2f7fe0">Т2</b> — обратка отопления;</li>' +
      '<li><b style="color:#f08c1a">Т3</b> — горячая вода в краны, <b style="color:#9b45c9">Т4</b> — её циркуляция.</li></ul>' +
      '<p><b>ЦТП.</b> Тапай по насосам, задвижкам, теплообменникам, манометрам — откроется панель с состоянием и работами. Свайпом можно двигать помещение. Каждый рабочий день делай <b>обход</b> (стол с журналом): начальник читает журнал и выдаёт заявки.</p>' +
      '<p><b>Замена задвижки:</b> остановить насосы контура → закрыть вторую задвижку на той же трубе → открыть дренаж, дождаться 0 бар → открутить болты, поставить новую, затянуть крест-накрест → открыть задвижки, закрыть дренаж, подпиткой поднять давление до ~4 бар (ГВС наполнится сам) → запустить насос.</p>' +
      '<p><b>Пуск отопления</b> (если стоит): закрыть «Дренаж отопл.» → открыть задвижки Зд1–Зд4 → открыть подпитку и ждать ~4 бар (время должно идти, ×5 ускорит) → закрыть подпитку → запустить Н1 или Н2. В шкафу управления есть чек-лист: что мешает — красным.</p>' +
      '<p><b>Насосы</b> работают парами: рабочий и резервный. Смазывай подшипники, меняй уплотнения, следи за шумом. При ремонте по техкарте сначала обесточь — иначе удар током.</p>' +
      '<p><b>Квартал.</b> Над домами — температура в квартирах и горячей воды. Если холодно — жильцы звонят. Регулятор в шкафу управления позволяет поднять или опустить график.</p>' +
      '<p><b>Жизнь.</b> Ешь, спи, отдыхай. Зарплата 5-го и 20-го. Запчасти бесплатно со склада (через телефон, к утру) или сразу в магазине за свои. Шабашки у жильцов — подработка.</p>' +
      '<p><b>Лето</b> (после 15 мая): ремонтная кампания по плану начальника — опрессовка отопления, ревизия насосов, грязевик. В июне теплосеть отключает горячую воду на 10 дней. Можно взять отпуск (Телефон → Я). 1 сентября — комиссия по готовности, 1 октября — пуск отопления.</p>' +
      '<p><b>Цель</b> — продержаться до конца отопительного сезона 15 мая и не лишиться доверия начальства. Время: кнопки ❚❚ / ×1 / ×5 / ×20.</p>' +
      '<div id="h-ok"></div></div>');
    btn(o.querySelector('#h-ok'), 'Понятно', () => (G.S ? closeOverlay() : menu()), { cls: 'main' });
  }
  function intro() {
    const o = overlay('<div class="ov text"><h2>1 октября. Первая смена.</h2>' +
      '<p>Тебя зовут Коля Палкин, слесарь 3-го разряда. Сегодня тебе вручили ключи от <b>ЦТП-7</b> — центрального теплового пункта, который греет и поит горячей водой целый квартал: пять домов, больше шестисот квартир.</p>' +
      '<p>Из ЦТП в землю уходят четыре трубы. Если они остынут — телефон не замолчит. Следи за насосами, меняй задвижки, не забывай есть и спать.</p>' +
      '<p>Начальник уже написал тебе. Открой <b>Телефон</b>, а потом иди на ЦТП — он рядом, через дорогу от магазина.</p><div id="i-ok"></div></div>');
    btn(o.querySelector('#i-ok'), 'Начать смену', () => { closeOverlay(); }, { cls: 'main' });
  }
  function victory() {
    const s = G.S;
    const o = overlay('<div class="ov text"><h2>Отопительный сезон закрыт!</h2><p>Ты продержался всю зиму. Квартал в тепле, начальство довольно.</p><ul>' +
      '<li>Разряд: ' + D.RANKS[G.Ev.rankIdx()].r + '-й</li><li>Ремонтов: ' + s.stats.repairs + '</li><li>Заявок выполнено: ' + s.stats.tasksDone + '</li><li>Жалоб: ' + s.stats.complaints + '</li><li>Заработано: ' + U.money(s.stats.earned) + '</li></ul>' +
      '<p>Можно играть дальше: летом ремонты, осенью новый сезон.</p><div id="v-ok"></div></div>');
    btn(o.querySelector('#v-ok'), 'Играть дальше', () => closeOverlay(), { cls: 'main' });
  }
  function gameOver(reason) {
    const s = G.S;
    const o = overlay('<div class="ov text"><h2>' + (reason === 'fired' ? 'Уволен!' : 'Конец') + '</h2>' +
      '<p>' + (reason === 'fired' ? 'Петрович положил на стол приказ: «По статье. За систематические нарушения». Квартал будет греть кто-то другой.' : '') + '</p><ul>' +
      '<li>Продержался дней: ' + (U.day(s.t) + 1) + '</li><li>Ремонтов: ' + s.stats.repairs + '</li><li>Жалоб: ' + s.stats.complaints + '</li></ul><div id="g-ok"></div></div>');
    btn(o.querySelector('#g-ok'), 'Новая игра', () => G.Main.startNew(), { cls: 'main' });
  }

  const HINTS = {
    street: 'Это твой квартал. Тапни по зданию — пойдёшь туда. Над домами: температура в квартирах и горячей воды. Свайп — прокрутка. Под землёй видно 4 трубы.',
    ctp: 'Твой ЦТП. Тапай по насосам, задвижкам, манометрам. Красная — Т1, синяя — Т2 (отопление), оранжевая — Т3, фиолетовая — Т4 (ГВС). «Шкаф» — чек-лист пуска. Свайп двигает помещение.',
    home: 'Квартира. Кровать — сон, кухня — еда, телевизор — настроение. Батарея греется от твоего же ЦТП.',
    shop: 'Магазин: еда, запчасти, инструмент. Запчасти бесплатно — через склад в телефоне, но привезут только к утру.',
    house: 'Подвал дома: узел ввода. Здесь спускают воздух, ставят хомуты, снимают показания.',
  };
  function hint(scene) {
    const s = G.S;
    if (s.flags.hints[scene] || (G.Tut && G.Tut.active())) return;
    s.flags.hints[scene] = true;
    toast(HINTS[scene], '', null, 9000);
  }

  function init() {
    buildHud();
    const touch = () => { lastTouch = performance.now(); };
    $('panel').addEventListener('pointerdown', () => { touch(); pressing = true; }, true);
    const release = () => { if (pressing) touch(); pressing = false; };
    document.addEventListener('pointerup', release, true);
    document.addEventListener('pointercancel', release, true);
    $('p-body').addEventListener('scroll', touch, { passive: true });
  }

  return Object.assign(api, { init, hud, tick, toast, onMessage, say, flash, ring, panel, reopen, closePanel, hidePanelForBusy, isModal,
    panelOpen, overlayOpen, closeOverlay, panelPump, panelValve, panelHX, panelNet, panelHvs, panelEquip, openObj, checklist, pressReport, panelFilter, panelDrain, panelFeed, panelGauge, panelCabinet,
    panelDesk, panelBox, panelHome, panelHouse, panelBasement, panelShop, phone, obhodReport, menu, help, intro, victory, gameOver, hint });
})();
