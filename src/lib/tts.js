// Gerätestimme über die Web Speech API (de-DE). Wird nur genutzt, wenn für einen
// Dialog/Text keine mitgelieferte Aufnahme da ist. Figuren unterscheiden sich über
// pitch/rate ihres Archetyps (zuverlässig in allen Browsern); die Stimmwahl nach
// Geschlecht und Namenshinweis ist nur ein Bonus, weil die Stimmliste je Gerät variiert.

export function ttsSupported() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
}

const FEMALE_NAMES = /anna|petra|helena|katja|hedda|marlene|vicki|amala|seraphina|ingrid|leni|sabine|female|frau/i;
const MALE_NAMES = /markus|stefan|yannick|conrad|killian|florian|hans|jonas|jan|male|mann/i;

function germanVoices() {
  const voices = window.speechSynthesis.getVoices();
  return voices.filter((v) => (v.lang || '').toLowerCase().startsWith('de'));
}

function pickVoice({ gender, hints = [] } = {}) {
  const de = germanVoices();
  if (!de.length) return undefined;
  const byHint = hints.map((h) => de.find((v) => v.name.toLowerCase().includes(h.toLowerCase()))).find(Boolean);
  if (byHint) return byHint;
  const quality = (v) => (/premium|enhanced|natural|neural/i.test(v.name) ? 2 : 0) + (v.localService ? 1 : 0);
  const sorted = [...de].sort((a, b) => quality(b) - quality(a));
  if (gender === 'female') return sorted.find((v) => FEMALE_NAMES.test(v.name)) || sorted[0];
  if (gender === 'male') return sorted.find((v) => MALE_NAMES.test(v.name)) || sorted[0];
  return sorted[0];
}

/**
 * Liest Abschnitte nacheinander, jeden mit eigenem Profil.
 * segments: [{ text, pitch=1, rate=1, gender, hints, gap }]
 * @returns {() => void} Stopp-Funktion
 */
export function speakSegments(segments, { onEnd, onError, onSegment } = {}) {
  if (!ttsSupported() || !segments.length) { onError?.(); return () => {}; }
  const synth = window.speechSynthesis;
  synth.cancel();
  let i = 0;
  let done = false;
  let timer = 0;
  let startTimer = 0;
  const finish = (fn) => { if (done) return; done = true; clearTimeout(timer); clearTimeout(startTimer); fn?.(); };
  const next = () => {
    if (done) return;
    if (i >= segments.length) return finish(onEnd);
    const seg = segments[i++];
    onSegment?.(seg.who ?? null, i - 1);
    const u = new SpeechSynthesisUtterance(seg.text);
    u.lang = 'de-DE';
    // Grundtempo minimal ruhiger; Archetyp-Faktoren darauf, in den erlaubten Grenzen.
    u.rate = Math.min(2, Math.max(0.5, 0.95 * (seg.rate ?? 1)));
    u.pitch = Math.min(2, Math.max(0, seg.pitch ?? 1));
    const voice = pickVoice(seg);
    if (voice) u.voice = voice;
    let started = false;
    // Startet die Wiedergabe gar nicht, gilt das als Fehler (z. B. keine Stimme installiert).
    startTimer = setTimeout(() => { if (!started) { synth.cancel(); finish(onError); } }, 4000);
    u.onstart = () => { started = true; clearTimeout(startTimer); };
    u.onend = () => { timer = setTimeout(next, seg.gap ?? 250); };
    u.onerror = (e) => finish(e.error === 'interrupted' || e.error === 'canceled' ? onEnd : onError);
    synth.speak(u);
  };
  next();
  return () => { finish(onEnd); synth.cancel(); };
}

/** Einfaches Vorlesen eines Textes (Erzählstimme). */
export function speak(text, handlers) {
  return speakSegments([{ text }], handlers);
}

export function stopSpeaking() {
  if (ttsSupported()) window.speechSynthesis.cancel();
}
