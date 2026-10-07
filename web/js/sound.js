// Простые синтезированные звуки (WebAudio)
'use strict';

G.Snd = (() => {
  let ctx = null, on = true;
  try { on = localStorage.getItem('slesarsim_snd') !== '0'; } catch (e) { /* пусто */ }
  function ac() {
    if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ctx = null; } }
    if (ctx && ctx.state === 'suspended') ctx.resume();
    return ctx;
  }
  function tone(freq, t0, len, type, vol, slide) {
    const c = ctx;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, c.currentTime + t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, c.currentTime + t0 + len);
    g.gain.setValueAtTime(0.0001, c.currentTime + t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.15, c.currentTime + t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + t0 + len);
    o.connect(g); g.connect(c.destination);
    o.start(c.currentTime + t0); o.stop(c.currentTime + t0 + len + 0.05);
  }
  function play(name) {
    if (!on || !ac()) return;
    switch (name) {
      case 'ring': for (let i = 0; i < 3; i++) { tone(880, i * 0.3, 0.12, 'square', 0.06); tone(1100, i * 0.3 + 0.13, 0.12, 'square', 0.06); } break;
      case 'clank': tone(420 + Math.random() * 200, 0, 0.09, 'triangle', 0.12, 180); break;
      case 'bad': tone(200, 0, 0.25, 'sawtooth', 0.08, 90); break;
      case 'good': tone(660, 0, 0.1, 'sine', 0.12); tone(880, 0.1, 0.16, 'sine', 0.12); break;
      case 'zap': for (let i = 0; i < 6; i++) tone(90 + Math.random() * 900, i * 0.04, 0.05, 'sawtooth', 0.12); break;
      case 'click': tone(1200, 0, 0.03, 'square', 0.04); break;
      default: break;
    }
  }
  function toggle() { on = !on; try { localStorage.setItem('slesarsim_snd', on ? '1' : '0'); } catch (e) { /* пусто */ } return on; }
  return { play, toggle, isOn: () => on, unlock: ac };
})();
