// Leise Töne per Web Audio, ohne Audiodateien. Standardmäßig aus.
let ctx = null;

function tone(freqs, { dur = 0.12, gap = 0.09, type = 'sine', vol = 0.08 } = {}) {
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    const t0 = ctx.currentTime;
    freqs.forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.value = f;
      const s = t0 + i * gap;
      g.gain.setValueAtTime(0, s);
      g.gain.linearRampToValueAtTime(vol, s + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, s + dur);
      o.connect(g).connect(ctx.destination);
      o.start(s);
      o.stop(s + dur + 0.02);
    });
  } catch { /* kein Audio verfügbar */ }
}

export const sounds = {
  correct: () => tone([660, 880], { dur: 0.16 }),
  partial: () => tone([587, 659], { dur: 0.14 }),
  wrong: () => tone([392, 330], { dur: 0.2, type: 'triangle', vol: 0.06 }),
  done: () => tone([523, 659, 784], { dur: 0.22, gap: 0.12 }),
};
