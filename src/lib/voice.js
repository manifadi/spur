// Welt + Stimmprofile für die App: Figuren eines Dialogs und die Abschnitte für
// die Gerätestimme (Fallback, wenn keine Aufnahme da ist).
import WORLD_DATA from '../content/world.json';
import { buildWorld, voiceOf, speakersOf, initials } from '../engine/world.js';
import { audioParts } from '../engine/content.js';

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
