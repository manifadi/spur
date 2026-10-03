// Spielt die mitgelieferten Vorlese-Audios (public/audio, erzeugt mit `npm run audio`)
// nacheinander ab — mit kurzen Pausen zwischen Sprecherwechseln bzw. Absätzen.
// Die Dateien liegen im Offline-Cache; es gibt keinen Netzwerkzugriff nach außen.
import AUDIO from '../content/audio.json';

export function hasAudio(itemId) {
  return !!AUDIO[itemId];
}

/**
 * @returns {() => void} Stopp-Funktion
 * onBlocked: Browser verbietet Autoplay ohne Antippen (iOS) — kein Fehler, nur nicht gestartet.
 * onQuiz(n, resume): Nach einem Abschnitt mit Zwischenfrage hält die Wiedergabe an,
 * bis resume() aufgerufen wird.
 */
export function playItem(itemId, { onEnd, onError, onBlocked, onSegment, onQuiz } = {}) {
  const segments = AUDIO[itemId]?.segments || [];
  const audio = new Audio();
  audio.preload = 'auto';
  let i = 0;
  let stopped = false;
  let timer = 0;
  const finish = (fn) => { if (stopped) return; stopped = true; clearTimeout(timer); audio.pause(); audio.removeAttribute('src'); fn?.(); };

  const next = () => {
    if (stopped) return;
    if (i >= segments.length) return finish(onEnd);
    const seg = segments[i++];
    onSegment?.(seg.who ?? null, i - 1);
    audio.src = seg.file;
    // Nächsten Abschnitt schon vorladen, damit zwischen den Sprechern nichts hängt.
    if (segments[i]) { const pre = new Audio(); pre.preload = 'auto'; pre.src = segments[i].file; }
    audio.play().catch((e) => {
      if (e?.name === 'NotAllowedError' && i === 1) finish(onBlocked);
      else if (e?.name !== 'AbortError') finish(onError);
    });
  };
  audio.onended = () => {
    const seg = segments[i - 1];
    const go = () => { if (!stopped) timer = setTimeout(next, i < segments.length ? seg?.gap ?? 300 : 0); };
    if (seg?.quiz != null && onQuiz) onQuiz(seg.quiz, go);
    else go();
  };
  audio.onerror = () => finish(onError);
  next();
  return () => finish(onEnd);
}
