// Общие утилиты, календарь
'use strict';
window.G = window.G || {};

G.U = (() => {
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, k) => a + (b - a) * k;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const rint = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
  const chance = (p) => Math.random() < p;
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const randn = () => {
    let u = 0, v = 0;
    while (!u) u = Math.random();
    while (!v) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  // детерминированный «шум» для окон и т.п.
  const hash = (a, b = 0, c = 0) => {
    let h = (a * 374761393 + b * 668265263 + c * 2147483647) | 0;
    h = (h ^ (h >>> 13)) * 1274126177;
    h = h ^ (h >>> 16);
    return ((h >>> 0) % 10000) / 10000;
  };
  const pad2 = (n) => (n < 10 ? '0' : '') + n;
  const plural = (n, one, few, many) => {
    n = Math.abs(n) % 100;
    const n1 = n % 10;
    if (n > 10 && n < 20) return many;
    if (n1 > 1 && n1 < 5) return few;
    if (n1 === 1) return one;
    return many;
  };
  const money = (n) => {
    const s = String(Math.round(Math.abs(n))).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
    return (n < 0 ? '−' : '') + s + ' ₽';
  };
  const dur = (min) => {
    min = Math.max(0, Math.round(min));
    if (min < 60) return min + ' мин';
    const h = Math.floor(min / 60), m = min % 60;
    if (h >= 48) return Math.round(h / 24) + ' ' + plural(Math.round(h / 24), 'день', 'дня', 'дней');
    return h + ' ч' + (m ? ' ' + m + ' мин' : '');
  };
  const deg = (v) => (v < 0 ? '−' : '') + Math.abs(v).toFixed(0) + '°';
  const deg1 = (v) => (v < 0 ? '−' : '') + Math.abs(v).toFixed(1) + '°';

  // ---- календарь: t = игровые минуты от 1 октября 2026, 00:00
  const START = { y: 2026, m: 9, d: 1 };
  const MON = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  const MON_S = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  const WD = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
  const WD_FULL = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
  const cache = {};
  const dateOfDay = (day) => {
    if (cache[day]) return cache[day];
    const d = new Date(Date.UTC(START.y, START.m, START.d + day));
    const start = Date.UTC(d.getUTCFullYear(), 0, 1);
    const r = {
      y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate(), wd: d.getUTCDay(),
      doy: Math.floor((d.getTime() - start) / 86400000) + 1,
    };
    cache[day] = r;
    return r;
  };
  const day = (t) => Math.floor(t / 1440);
  const mod = (t) => ((t % 1440) + 1440) % 1440;
  const hour = (t) => mod(t) / 60;
  const date = (t) => dateOfDay(day(t));
  const clock = (t) => pad2(Math.floor(mod(t) / 60)) + ':' + pad2(Math.floor(mod(t) % 60));
  const dateStr = (t) => { const d = date(t); return WD[d.wd] + ', ' + d.d + ' ' + MON_S[d.m]; };
  const dateLong = (t) => { const d = date(t); return d.d + ' ' + MON[d.m] + ' ' + d.y + ', ' + WD_FULL[d.wd]; };
  // нерабочие праздничные дни (м-д)
  const HOLIDAYS = ['1-1', '1-2', '1-3', '1-4', '1-5', '1-6', '1-7', '1-8', '2-23', '3-8', '5-1', '5-9', '6-12', '11-4'];
  const isHoliday = (t) => { const d = date(t); return HOLIDAYS.includes((d.m + 1) + '-' + d.d); };
  const isWorkday = (t) => { const d = date(t); return d.wd >= 1 && d.wd <= 5 && !isHoliday(t); };
  // абсолютное время следующего наступления часа h (минуты от полуночи)
  const nextAt = (t, minuteOfDay) => {
    let r = day(t) * 1440 + minuteOfDay;
    if (r <= t) r += 1440;
    return r;
  };

  return { clamp, lerp, rnd, rint, chance, pick, randn, hash, pad2, plural, money, dur, deg, deg1,
    MON, MON_S, WD, day, mod, hour, date, clock, dateStr, dateLong, isWorkday, isHoliday, nextAt };
})();
