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
 */
export function playItem(itemId, { onEnd, onError, onBlocked } = {}) {
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
    audio.src = seg.file;
    // Nächsten Abschnitt schon vorladen, damit zwischen den Sprechern nichts hängt.
    if (segments[i]) { const pre = new Audio(); pre.preload = 'auto'; pre.src = segments[i].file; }
    audio.play().catch((e) => {
      if (e?.name === 'NotAllowedError' && i === 1) finish(onBlocked);
      else if (e?.name !== 'AbortError') finish(onError);
    });
  };
  audio.onended = () => {
    const gap = segments[i - 1]?.gap ?? 300;
    timer = setTimeout(next, i < segments.length ? gap : 0);
  };
  audio.onerror = () => finish(onError);
  next();
  return () => finish(onEnd);
}
