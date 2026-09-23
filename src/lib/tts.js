// Vorlesen über die Web Speech API, Stimme de-DE. Läuft komplett lokal im Browser.

export function ttsSupported() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
}

function pickVoice() {
  const voices = window.speechSynthesis.getVoices();
  return voices.find((v) => v.lang === 'de-DE' && v.localService && /premium|enhanced|natural/i.test(v.name))
    || voices.find((v) => v.lang === 'de-DE' && v.localService)
    || voices.find((v) => v.lang === 'de-DE')
    || voices.find((v) => (v.lang || '').startsWith('de'));
}

/** Startet das Vorlesen. Gibt eine Stopp-Funktion zurück. */
export function speak(text, { onEnd, onError } = {}) {
  if (!ttsSupported()) { onError?.(); return () => {}; }
  const synth = window.speechSynthesis;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'de-DE';
  u.rate = 0.95;
  const voice = pickVoice();
  if (voice) u.voice = voice;
  let started = false;
  let done = false;
  const finish = (fn) => { if (done) return; done = true; clearTimeout(timer); fn?.(); };
  // Startet die Wiedergabe nicht, gilt das als Fehler (z. B. keine Stimme installiert).
  const timer = setTimeout(() => { if (!started) { synth.cancel(); finish(onError); } }, 4000);
  u.onstart = () => { started = true; };
  u.onend = () => finish(onEnd);
  u.onerror = (e) => finish(e.error === 'interrupted' || e.error === 'canceled' ? onEnd : onError);
  synth.speak(u);
  return () => { finish(onEnd); synth.cancel(); };
}

export function stopSpeaking() {
  if (ttsSupported()) window.speechSynthesis.cancel();
}
