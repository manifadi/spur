// Welt + Stimmprofile für die App: Figuren eines Dialogs und die Abschnitte für
// die Gerätestimme (Fallback, wenn keine Aufnahme da ist).
import WORLD_DATA from '../content/world.json';
import { buildWorld, voiceOf, speakersOf, initials } from '../engine/world.js';
import { audioParts } from '../engine/content.js';
import { normalize } from '../engine/answer.js';

export const WORLD = buildWorld(WORLD_DATA);

export function dialogSpeakers(item) {
  return speakersOf(WORLD, item).map((c) => ({ id: c.id, name: c.name, relation: c.relationToUser || null, initials: initials(c.name), personality: c.personality }));
}

/** Abschnitte für speakSegments: je Zeile das Profil der sprechenden Figur. */
export function deviceSegments(item) {
  if (item.type === 'text') return [{ text: `${item.title}.`, gap: 500 }, ...item.paragraphs.map((p) => ({ text: p, gap: 400 }))];
  const prof = (c) => { const v = voiceOf(WORLD, c); return { pitch: v.pitch, rate: v.rate, gender: v.gender, hints: v.voiceNameHints }; };
  const solo = WORLD.byId.get(item.characterId);
  return audioParts(item).map((p) => (item.lines
    ? { ...p, gap: 350, ...prof(WORLD.byName.get(p.who)) }
    : { ...p, who: solo?.name || null, gap: 250, ...prof(solo) }));
}

/**
 * Abschnitte (Indizes wie in audio.json / audioParts), in denen die Antwort auf eine Frage
 * steckt: gefunden über das hinterlegte Zitat. Ohne Zitat (z. B. Reihenfolge) das ganze Gespräch.
 */
export function answerSegments(item, ex) {
  const parts = audioParts(item);
  const all = parts.map((_, i) => i);
  const quote = normalize((ex?.quote || '').replace(/[„“"…]|\.\.\./g, ' '));
  if (!quote) return all;
  const words = quote.split(' ').filter(Boolean);
  // Längstes Anfangsstück des Zitats, das in einem Abschnitt vorkommt.
  for (let n = Math.min(words.length, 8); n >= Math.min(3, words.length); n--) {
    const probe = words.slice(0, n).join(' ');
    const i = parts.findIndex((p) => normalize(p.text).includes(probe));
    if (i < 0) continue;
    // Kurze Antwortzeilen ("Fünfzehn Euro.") ergeben erst mit der Frage davor einen Sinn.
    return i > 0 && parts[i].text.split(/\s+/).length < 8 ? [i - 1, i] : [i];
  }
  return all;
}
