// Leise Töne per Web Audio, ohne Audiodateien. Jeder Ton ist ein kleiner Akkord aus Sinus und
// Dreieck mit weicher Hüllkurve (klingt runder als ein nackter Piepton). Standardmäßig an,
// in den Einstellungen abschaltbar.
let ctx = null;

function audioCtx() {
  ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
  // iOS startet den Kontext angehalten; nach einer Berührung lässt er sich fortsetzen.
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

/**
 * notes: [{ f, at, dur, vol?, type?, slide? }] – Frequenz in Hz, Start/Dauer in Sekunden.
 * slide: Zielfrequenz, zu der der Ton während seiner Dauer gleitet.
 */
function play(notes) {
  try {
    const c = audioCtx();
    const t0 = c.currentTime + 0.01;
    const master = c.createGain();
    master.gain.value = 0.9;
    master.connect(c.destination);
    for (const n of notes) {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = n.type || 'sine';
      const s = t0 + n.at;
      o.frequency.setValueAtTime(n.f, s);
      if (n.slide) o.frequency.exponentialRampToValueAtTime(n.slide, s + n.dur);
      const vol = n.vol ?? 0.07;
      g.gain.setValueAtTime(0, s);
      g.gain.linearRampToValueAtTime(vol, s + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, s + n.dur);
      o.connect(g).connect(master);
      o.start(s);
      o.stop(s + n.dur + 0.03);
    }
  } catch { /* kein Audio verfügbar */ }
}

/** Ton mit leiser Oktave darüber (Glanz). */
const bright = (f, at, dur, vol = 0.07) => [
  { f, at, dur, vol, type: 'triangle' },
  { f: f * 2, at, dur: dur * 0.8, vol: vol * 0.25 },
];

export const sounds = {
  // Zwei helle Töne aufwärts, wie ein kleines "Ding-Ding".
  correct: () => play([...bright(784, 0, 0.18), ...bright(1175, 0.09, 0.3)]),
  // Freundlich, aber ohne Auflösung nach oben.
  partial: () => play([...bright(659, 0, 0.16, 0.06), ...bright(740, 0.1, 0.24, 0.06)]),
  // Weiches, tiefes "Bopp" statt eines Fehlertons.
  wrong: () => play([{ f: 220, slide: 150, at: 0, dur: 0.22, vol: 0.1 }, { f: 330, slide: 220, at: 0, dur: 0.14, vol: 0.03, type: 'triangle' }]),
  // Kurze Tonleiter nach oben für "geschafft".
  done: () => play([523, 659, 784, 1047].flatMap((f, i) => bright(f, i * 0.09, i === 3 ? 0.5 : 0.18, 0.06))),
  // Kleine Fanfare (Tagesziel, Streak).
  fanfare: () => play([...bright(523, 0, 0.14, 0.06), ...bright(659, 0.12, 0.14, 0.06), ...bright(784, 0.24, 0.14, 0.06), ...bright(1047, 0.38, 0.6, 0.07), { f: 659, at: 0.38, dur: 0.6, vol: 0.03, type: 'triangle' }]),
  // Sehr leises Tippen beim Auswählen.
  select: () => play([{ f: 1320, at: 0, dur: 0.045, vol: 0.035 }]),
  // Zwischenfrage taucht auf.
  pop: () => play([{ f: 660, slide: 990, at: 0, dur: 0.12, vol: 0.05, type: 'triangle' }]),
};
