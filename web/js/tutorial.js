// Интерактивное обучение: первая смена и первая замена задвижки
'use strict';

G.Tut = (() => {
  const U = G.U;
  const $ = (id) => document.getElementById(id);
  const findBtn = (root, text) => {
    const r = typeof root === 'string' ? document.querySelector(root) : root;
    if (!r) return null;
    return [...r.querySelectorAll('button')].find((b) => b.textContent.indexOf(text) >= 0) || null;
  };
  const panelOpen = () => !$('panel').classList.contains('hidden');
  const ptitle = () => $('p-title').textContent;
  const gvsOn = (s) => s.pumps.some((p) => p.circ === 'gvs' && p.on);
  const replaced = (s) => s.valves[4].replacedAt > (s.tut.t2 || 0);
  // цель-стрелка на канвасе ЦТП: центр объекта (стрелка рисуется над ним)
  const at = (id) => { const p = G.R.objPos(id); return { scene: 'ctp', x: p[0], y: p[1] - 14 }; };
  const nearZone = (x) => G.R.LW >= G.R.CT.W || Math.abs(G.R.cam.ctp + G.R.LW / 2 - x) < 220;

  const STEPS = [
    { id: 'phone', text: 'Начальник прислал задания. Открой <b>телефон</b> — кнопка «Тел» вверху.',
      dom: () => $('b-phone'), done: (s) => s.tut.flags.phone || s.scene !== 'home' },
    { id: 'out', text: 'Прочитал? Закрой телефон (✕) и выходи на работу: <b>«На улицу»</b>.',
      dom: () => (panelOpen() ? $('p-close') : findBtn('#actbar', 'На улицу')), done: (s) => s.scene !== 'home' },
    { id: 'goctp', text: 'ЦТП-7 — кирпичное здание у магазина. Жми <b>«ЦТП»</b> или тапни по нему.',
      dom: () => findBtn('#actbar', 'ЦТП'), world: () => ({ scene: 'street', x: G.D.PLACES.ctp.door, y: G.R.LH - 118 - 112 }),
      done: (s) => s.scene === 'ctp' },
    { id: 'cab', text: 'Это твой ЦТП. Слева — ввод от ТЭЦ, ТО отопления и ВВП ГВС, в центре — насосы, справа — задвижки на квартал. Открой <b>«Шкаф»</b>: там насосы, регулятор и чек-лист пуска.',
      dom: () => findBtn('#actbar', 'Шкаф'), done: (s) => s.tut.flags.cabinet },
    { id: 'zones', text: 'Помещение шире экрана: свайпай или жми зоны справа внизу, <b>«≡»</b> — список всего оборудования. Закрой шкаф и нажми зону <b>«Насосы»</b>.',
      dom: () => (panelOpen() ? $('p-close') : findBtn('#zonebar', 'Насосы')), done: (s) => s.scene === 'ctp' && !panelOpen() && nearZone(910) },
    { id: 'lube', text: 'Насос <b>Н3</b> (горячая вода, нижний ряд) гудит — подшипники сухие. Тапни по нему и нажми «Смазать подшипники».',
      world: () => at('pump:2'), dom: () => (panelOpen() && /Н3/.test(ptitle()) ? findBtn('#p-body', 'Смазать') : null),
      done: (s) => s.pumps[2].lube >= 80 },
    { id: 'obhod', text: 'Каждый рабочий день — <b>обход</b>: осмотр и запись в журнал. Иначе начальник лишит премии. Нажми «Обход» → «Сделать обход».',
      dom: () => (panelOpen() && /Пост/.test(ptitle()) ? findBtn('#p-body', 'обход') : findBtn('#actbar', 'Обход')),
      done: (s) => s.journal.lastObhod === U.day(s.t) },
    { id: 'order', text: 'Задвижка <b>Зд5</b> течёт — нужна новая. Телефон → вкладка <b>«Склад»</b> → «+» у «Задвижка 30с41нж» → «Отправить заявку». Бесплатно, привезут к 9:00.',
      dom: () => {
        if (!panelOpen() || ptitle() !== 'Телефон') return $('b-phone');
        const tab = findBtn('#p-body .tabs', 'Склад');
        if (tab && !tab.classList.contains('on')) return tab;
        const row = document.querySelector('#p-body .qty[data-item="valve"]');
        if (row && row.querySelector('b').textContent === '0') return row.lastChild;
        return findBtn('#p-body', 'Отправить заявку');
      },
      done: (s) => (s.p.inv.valve || 0) > 0 || s.orders.some((o) => o.items.valve) || s.valves[4].replacedAt > 0 },
    { id: 'wait', text: 'Отлично! Пока ждёшь задвижку — живи: ешь, спи, отвечай на жалобы (Телефон → Заявки). Когда привезут — покажу замену.',
      ack: 'Понятно', done: (s) => s.tut.flags.ack_wait },
    { id: 'waitValve', hidden: true, done: (s) => (s.p.inv.valve || 0) > 0 || s.valves[4].replacedAt > 0,
      next: (s) => (s.valves[4].replacedAt > 0 ? 'fin' : 'r_go') },
    { id: 'r_go', text: 'Задвижку привезли! Меняем <b>Зд5</b> на Т3 — это горячая вода, отопление не трогаем. Иди на ЦТП.',
      dom: () => findBtn('#actbar', 'ЦТП') || findBtn('#actbar', 'На улицу'), done: (s) => s.scene === 'ctp' },
    { id: 'r_pumps', text: 'Шаг 1 из 6. Останови насосы ГВС: <b>Н3</b> (и Н4, если работает). На работающем контуре задвижку не снять.',
      world: (s) => at('pump:' + (s.pumps[3].on && !s.pumps[2].on ? 3 : 2)), done: (s) => !gvsOn(s) || replaced(s) },
    { id: 'r_close', text: 'Шаг 2 из 6. Закрой вторую задвижку на Т3 — <b>Зд6</b> справа у стены, иначе вода пойдёт обратно из квартала.',
      world: () => at('valve:5'), done: (s) => !s.valves[5].open || replaced(s) },
    { id: 'r_drain', text: 'Шаг 3 из 6. Открой <b>«Дренаж ГВС»</b> (внизу справа) и дождись 0 бар. Сейчас в ГВС: ',
      live: (s) => '<b>' + s.gvs.ps.toFixed(1) + ' бар</b>', world: () => at('drain:gvs'),
      done: (s) => (s.gvs.drain && s.gvs.ps < 0.3) || replaced(s) },
    { id: 'r_replace', text: 'Шаг 4 из 6. Тапни по <b>Зд5</b> → «Заменить задвижку». Болты откручивай все, а затягивай <b>крест-накрест</b>: следующий — напротив предыдущего.',
      world: () => at('valve:4'), done: (s) => replaced(s) },
    { id: 'r_restore', text: 'Шаг 5 из 6. Возвращаем: закрой «Дренаж ГВС», открой <b>Зд5</b> и <b>Зд6</b>. ГВС наполнится от водопровода сама.',
      world: (s) => (s.gvs.drain ? at('drain:gvs') : !s.valves[4].open ? at('valve:4') : at('valve:5')),
      done: (s) => !s.gvs.drain && s.valves[4].open && s.valves[5].open },
    { id: 'r_start', text: 'Шаг 6 из 6. Запусти насос <b>Н3</b> — циркуляция пошла, у жильцов снова горячая вода!',
      world: () => at('pump:2'), done: (s) => s.gvs.q > 0.3 && s.gvs.ps > 3 },
    { id: 'fin', text: 'Обучение пройдено! Шпаргалка: «Шкаф» — чек-лист пуска, «≡» — всё оборудование, «Обход» — каждый рабочий день. Удачи, слесарь!',
      ack: 'Удачи!', done: (s) => s.tut.flags.ack_fin },
  ];
  const idx = (id) => STEPS.findIndex((x) => x.id === id);

  let shown = null, lastScene = null, hl = null;
  const active = () => { const s = G.S; return !!(s && s.tut && !s.tut.done && !s.over); };
  const step = () => (active() ? STEPS[G.S.tut.step] || null : null);
  const visible = () => {
    const st = step();
    // в подвале и камере шагов обучения нет — пузырь не закрывает задвижки
    return !!(st && !st.hidden && G.S.scene !== 'well' && G.S.scene !== 'house' && !G.busy && !G.MG.isOpen() && $('overlay').classList.contains('hidden'));
  };

  function setHl(el) {
    if (hl === el) return;
    if (hl) hl.classList.remove('tut-hl');
    hl = el || null;
    if (hl) {
      hl.classList.add('tut-hl');
      if (hl.closest('#p-body')) hl.scrollIntoView({ block: 'nearest' });
    }
  }
  function hide() {
    const t = $('toasts');
    t.style.top = ''; t.style.left = ''; t.style.right = '';
    $('zonebar').classList.remove('tut-off');
    $('tut').classList.add('hidden');
    document.body.classList.remove('tut-on');
    setHl(null);
  }
  function buildBubble(st) {
    const box = $('tut');
    const btns = box.querySelector('.t-btns');
    btns.innerHTML = '';
    const add = (label, cls, f) => { const b = document.createElement('button'); b.className = cls; b.textContent = label; b.onclick = () => { G.Snd.play('click'); f(); }; btns.appendChild(b); };
    add('Пропустить обучение', '', () => skip());
    if (st.ack) add(st.ack, 'main', () => { flag('ack_' + st.id); tick(); });
    else add('Дальше ›', '', () => { flag('skip_' + st.id); tick(); });
  }

  function tick() {
    const s = G.S;
    if (!active()) { if (shown !== null) { shown = null; hide(); } return; }
    for (let guard = 0; guard < 40; guard++) {
      const st = STEPS[s.tut.step];
      if (!st) { s.tut.done = true; hide(); return; }
      if (st.done(s) || s.tut.flags['skip_' + st.id]) {
        s.tut.step = st.next ? idx(st.next(s)) : s.tut.step + 1;
        const nx = STEPS[s.tut.step];
        if (nx && nx.id === 'r_go') s.tut.t2 = s.t;
        continue;
      }
      break;
    }
    const st = STEPS[s.tut.step];
    if (!st) return;
    const changed = shown !== st.id;
    if (changed || lastScene !== s.scene) {
      const w = st.world && st.world(s);
      if (w && w.scene === 'ctp' && s.scene === 'ctp') G.R.focusCtp(w.x, 0.22);
    }
    lastScene = s.scene;
    if (changed) { shown = st.id; buildBubble(st); }
    if (!visible()) { hide(); return; }
    $('tut').querySelector('.t-text').innerHTML = st.text + (st.live ? st.live(s) : '');
    $('tut').classList.remove('hidden');
    document.body.classList.add('tut-on');
    const el = st.dom ? st.dom(s) : null;
    setHl(el);
    place(el, st.world && st.world(s));
  }
  // пузырь — сверху или снизу, подальше от цели; тосты — под пузырём, но по другую сторону от цели
  function place(el, w) {
    const box = $('tut'), toasts = $('toasts'), R = G.R;
    let tx = null, ty = null;
    if (el) { const r = el.getBoundingClientRect(); tx = (r.left + r.right) / 2; ty = (r.top + r.bottom) / 2; }
    else if (w && w.scene === G.S.scene) {
      ty = (w.y + 14 + (w.scene === 'ctp' ? Math.max(0, (R.LH - 540) / 2) : 0)) * R.scale;
      tx = (w.x - (w.scene === 'ctp' ? R.cam.ctp : w.scene === 'street' ? R.cam.street : 0)) * R.scale;
    }
    const top = ty !== null && ty > window.innerHeight * 0.45;
    box.classList.toggle('top', top);
    const away = top && tx !== null && tx < window.innerWidth / 2;
    toasts.style.top = top ? (box.offsetTop + box.offsetHeight + 6) + 'px' : '';
    toasts.style.left = away ? 'auto' : '';
    toasts.style.right = away ? '8px' : '';
    // цель под кнопками зон — прячем их, пока шаг не пройден
    const z = $('zonebar').getBoundingClientRect();
    $('zonebar').classList.toggle('tut-off', !el && tx !== null && ty + 22 > z.top - 4 && tx + 40 > z.left && tx - 40 < z.right);
  }
  function worldTarget() {
    const st = step();
    if (!st || !st.world || !visible()) return null;
    return st.world(G.S);
  }
  function flag(name) { if (active()) G.S.tut.flags[name] = true; }
  function skip() { if (G.S && G.S.tut) { G.S.tut.done = true; G.S.tut.skipped = true; } shown = null; hide(); }

  return { tick, worldTarget, flag, skip, active, STEPS };
})();
