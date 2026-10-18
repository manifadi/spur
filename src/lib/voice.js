// Welt + Stimmprofile für die App: Figuren eines Dialogs und die Abschnitte für
// die Gerätestimme (Fallback, wenn keine Aufnahme da ist).
import WORLD_DATA from '../content/world.json';
import { buildWorld, voiceOf, speakersOf, initials } from '../engine/world.js';
import { audioParts } from '../engine/content.js';
import { normalize } from '../engine/answer.js';

export const WORLD = buildWorld(WORLD_DATA);

/**
 * Feste Farbe je Figur (aus den Token-Farben), damit man Stimmen auch optisch auseinanderhält:
 * "Wer hat was gesagt?" Im selben Gespräch bekommen zwei Figuren nie dieselbe Farbe.
 */
const TONES = [
  { solid: 'var(--spur-dove)', soft: 'var(--spur-dove-soft)', shade: 'var(--spur-dove-shade)', fg: '#fff' },
  { solid: 'var(--spur-terracotta)', soft: 'var(--spur-terracotta-soft)', shade: 'var(--spur-terracotta-shade)', fg: '#fff' },
  { solid: 'var(--spur-green)', soft: 'var(--spur-green-soft)', shade: 'var(--spur-green-shade)', fg: '#fff' },
  { solid: 'var(--spur-humpback)', soft: 'var(--spur-humpback-soft)', shade: 'var(--spur-humpback-shade)', fg: '#fff' },
  { solid: 'var(--spur-coral)', soft: 'var(--spur-coral-soft)', shade: 'var(--spur-coral-shade)', fg: '#fff' },
  { solid: 'var(--spur-fox)', soft: 'var(--spur-fox-soft)', shade: 'var(--spur-fox-shade)', fg: '#fff' },
];
const toneIndex = (id) => { let h = 0; for (const c of String(id)) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h % TONES.length; };

export function personTone(id) {
  return TONES[toneIndex(id)];
}

/** Figur aus der Welt (über Namen) oder eine nur erwähnte Person ("Nora"). */
export function personByName(name) {
  const c = WORLD.byName.get(name);
  if (c) return { id: c.id, name: c.name, relation: c.relationToUser || null, initials: initials(c.name), tone: personTone(c.id) };
  return { id: name, name, relation: null, initials: initials(name), tone: null };
}

export function dialogSpeakers(item) {
  const used = new Set();
  return speakersOf(WORLD, item).map((c) => {
    let t = toneIndex(c.id);
    while (used.has(t) && used.size < TONES.length) t = (t + 1) % TONES.length;
    used.add(t);
    return { id: c.id, name: c.name, relation: c.relationToUser || null, initials: initials(c.name), personality: c.personality, tone: TONES[t] };
  });
}

/** Gewicht je Vorlese-Abschnitt (Textlänge), für einen gleichmäßigen Fortschrittsring. */
export function segmentWeights(item) {
  return deviceSegments(item).map((s) => Math.max(1, s.text.length));
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
