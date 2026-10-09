// Мини-игры: болты фланца (крест-накрест) и технологическая карта
'use strict';

G.MG = (() => {
  const U = G.U, D = G.D;
  let root = null, gen = 0; // gen — номер открытой мини-игры: отложенные шаги брошенной работы не выполняются
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };
  function open() {
    root = document.getElementById('mg');
    gen++;
    root.innerHTML = '';
    root.classList.remove('hidden');
    G.UI.closePanel(true);
    return root;
  }
  function close() { gen++; if (root) { root.classList.add('hidden'); root.innerHTML = ''; } }
  const isOpen = () => root && !root.classList.contains('hidden');
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  // ---------- болты
  function bolts(opts, done) {
    const r = open(), my = gen;
    const ratchet = G.S.p.tools.ratchet;
    const N = 8;
    const B = [];
    for (let i = 0; i < N; i++) {
      const rusty = Math.random() < U.clamp(opts.rust || 0.2, 0.05, 0.6);
      B.push({ hp: Math.ceil((rusty ? 4 : 2) / (ratchet ? 2 : 1)), rusty, st: 'in', spin: 0 });
    }
    let phase = 'out', seq = [], mistakes = 0;
    const box = el('div', 'mg-box');
    const left = el('div', 'mg-left');
    const fl = el('div', 'flange');
    fl.appendChild(el('div', 'hole'));
    const btns = B.map((b, i) => {
      const a = (-90 + i * 45) * Math.PI / 180;
      const e = el('button', 'bolt');
      e.style.left = (50 + 38 * Math.cos(a)) + '%';
      e.style.top = (50 + 38 * Math.sin(a)) + '%';
      e.addEventListener('pointerdown', (ev) => { ev.preventDefault(); tap(i); });
      fl.appendChild(e);
      return e;
    });
    left.appendChild(fl);
    const right = el('div', 'mg-right');
    right.appendChild(el('h3', '', opts.title));
    const ph = el('p', 'mg-phase'), hint = el('p', 'mg-hint'), stat = el('p', 'mg-stat');
    const row = el('div', 'mg-btns');
    right.append(ph, hint, stat, row);
    box.append(left, right);
    r.appendChild(box);

    function draw() {
      B.forEach((b, i) => {
        const e = btns[i];
        e.className = 'bolt ' + b.st + (b.rusty && b.st === 'in' ? ' rusty' : '');
        e.style.transform = 'translate(-50%,-50%) rotate(' + b.spin + 'deg)';
      });
      row.innerHTML = '';
      if (phase === 'out') {
        ph.textContent = 'Шаг 1: открутить 8 болтов';
        hint.textContent = 'Тапай по болтам. Ржавые (рыжие) идут туго' + (ratchet ? '. С трещоткой — быстрее.' : '.');
        stat.textContent = 'Осталось: ' + B.filter((b) => b.st === 'in').length;
        if (B.some((b) => b.rusty && b.st === 'in') && G.Act.has('wd40')) {
          const w = el('button', 'btn', 'Побрызгать WD-40');
          w.onclick = () => { G.Act.take('wd40'); B.forEach((b) => { if (b.rusty) { b.rusty = false; b.hp = Math.max(1, b.hp - 2); } }); G.Main.advance(2); draw(); };
          row.appendChild(w);
        }
        const c = el('button', 'btn ghost', 'Бросить');
        c.onclick = () => { close(); G.UI.toast('Работа брошена'); };
        row.appendChild(c);
      } else if (phase === 'swap') {
        ph.textContent = opts.swap;
        hint.textContent = '';
        stat.textContent = '';
      } else {
        ph.textContent = 'Шаг 2: затянуть болты';
        hint.textContent = 'Тяни КРЕСТ-НАКРЕСТ: после каждого болта — противоположный, следующую пару — под 90°. Иначе фланец перекосит и потечёт.';
        stat.textContent = 'Затянуто: ' + seq.length + ' из 8' + (mistakes ? ' · перекосов: ' + mistakes : '');
      }
    }
    function tap(i) {
      const b = B[i];
      if (phase === 'out') {
        if (b.st !== 'in') return;
        b.hp--; b.spin -= 60;
        G.Main.advance(1);
        G.Snd.play('clank');
        if (b.hp <= 0) b.st = 'out';
        if (B.every((x) => x.st === 'out')) {
          phase = 'swap';
          draw();
          setTimeout(() => {
            if (gen !== my) return;
            G.Main.advance(G.Act.dur(opts.swapMin));
            B.forEach((x) => { x.st = 'loose'; x.spin = 0; });
            phase = 'in';
            draw();
          }, 1100);
        }
        draw();
      } else if (phase === 'in') {
        if (b.st !== 'loose') return;
        const step = seq.length;
        let ok = true;
        if (step % 2 === 1) ok = i === (seq[step - 1] + 4) % 8;
        else if (step === 2) ok = ((i - seq[0] + 8) % 4) === 2;
        if (!ok) {
          mistakes++;
          btns[i].classList.add('err');
          G.UI.toast('Перекос! Тяни крест-накрест', 'bad');
          G.Snd.play('bad');
        } else G.Snd.play('clank');
        seq.push(i);
        b.st = 'tight'; b.spin = 90;
        G.Main.advance(1);
        draw();
        if (seq.length === N) {
          const q = Math.max(0, 100 - mistakes * 22);
          setTimeout(() => {
            if (gen !== my) return;
            close();
            G.UI.toast('Качество сборки: ' + q + '%', q >= 70 ? 'good' : 'bad');
            done(q);
          }, 500);
        }
      }
    }
    draw();
  }

  // ---------- технологическая карта
  const FUNNY = {
    'Постучать по корпусу кувалдой': 'Бум! Легче не стало.',
    'Позвонить Петровичу посоветоваться': 'Петрович: «Ты слесарь или кто? Делай по техкарте!»',
    'Залить всё герметиком': 'Герметик тут не поможет.',
    'Покурить и подумать': 'Подумал. Пять минут как не бывало.',
    'Включить насос проверить, крутится ли': 'Не время для пуска — всё разобрано!',
  };
  function proc(key, done) {
    const P = D.PROCS[key];
    const r = open();
    let idx = 0, mistakes = 0;
    const safety = P.steps[0].indexOf('автомат') >= 0;
    const box = el('div', 'mg-box proc');
    const left = el('div', 'mg-left list');
    const right = el('div', 'mg-right');
    box.append(left, right);
    r.appendChild(box);
    function draw() {
      left.innerHTML = '';
      left.appendChild(el('h3', '', P.title));
      P.steps.slice(0, idx).forEach((s, i) => left.appendChild(el('div', 'step done', (i + 1) + '. ' + s)));
      if (idx < P.steps.length) left.appendChild(el('div', 'step next', (idx + 1) + '. ?'));
      right.innerHTML = '';
      right.appendChild(el('p', 'mg-phase', 'Что делаем дальше?'));
      right.appendChild(el('p', 'mg-stat', 'Ошибок: ' + mistakes));
      const opts = [P.steps[idx]];
      const rest = shuffle(P.steps.slice(idx + 1)).slice(0, 2);
      opts.push(...rest);
      opts.push(U.pick(D.DECOYS));
      const col = el('div', 'mg-opts');
      shuffle(opts).forEach((o) => {
        const b = el('button', 'btn opt', o);
        b.onclick = () => choose(o);
        col.appendChild(b);
      });
      right.appendChild(col);
      const c = el('button', 'btn ghost', 'Бросить работу');
      c.onclick = () => { close(); G.UI.toast('Работа брошена'); };
      right.appendChild(c);
    }
    function choose(o) {
      if (o === P.steps[idx]) {
        G.Main.advance(G.Act.dur(P.stepMin));
        G.Snd.play('clank');
        idx++;
        if (idx >= P.steps.length) {
          const q = Math.max(30, 100 - mistakes * 15);
          close();
          G.UI.toast('Готово! Качество работы: ' + q + '%', q >= 70 ? 'good' : '');
          done(q);
          return;
        }
      } else if (FUNNY[o]) {
        mistakes++;
        G.Main.advance(5);
        G.UI.toast(FUNNY[o], 'bad');
      } else if (safety && idx === 0) {
        mistakes += 2;
        const s = G.S;
        s.p.health = Math.max(0, s.p.health - 25);
        G.Ev.mood(-10); G.Ev.trust(-2);
        s.stats.shocks++;
        G.Snd.play('zap');
        G.UI.toast('УДАР ТОКОМ! Сначала обесточь и вывеси плакат!', 'bad');
        G.UI.flash();
        if (s.p.health <= 0) { close(); return; }
      } else {
        mistakes++;
        G.Main.advance(10);
        G.Snd.play('bad');
        G.UI.toast('Не по порядку! Пришлось переделывать.', 'bad');
      }
      draw();
    }
    draw();
  }

  return { bolts, proc, isOpen, close };
})();
