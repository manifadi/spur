// Besetzung für die Vorlese-Audios (edge-tts, neuronale Microsoft-Stimmen).
//
// Grundlage ist die Welt (src/content/world.json): Jede Figur hat einen
// Persönlichkeits-Archetyp. Der bestimmt Tempo und Tonhöhe. Die Stimme selbst
// kommt aus voiceProfile.edgeVoice oder wird stabil pro Figur aus dem Pool gewählt,
// damit wiederkehrende Figuren überall gleich klingen. Zwei Figuren im selben
// Gespräch bekommen nie dieselbe Stimme.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildWorld, voiceOf, edgeParams, speakersOf } from '../src/engine/world.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
export const WORLD = buildWorld(JSON.parse(readFileSync(join(root, 'src/content/world.json'), 'utf8')));

export const FEMALE = ['de-DE-SeraphinaMultilingualNeural', 'de-DE-KatjaNeural', 'de-DE-AmalaNeural', 'de-AT-IngridNeural', 'de-CH-LeniNeural'];
// Florian ist Miros Erzählstimme für die Lesetexte und kommt in Gesprächen nicht vor.
export const MALE = ['de-DE-ConradNeural', 'de-DE-KillianNeural', 'de-AT-JonasNeural', 'de-CH-JanNeural'];

/** Erzählstimme für die Lesetexte ("Miro liest vor"). */
export const NARRATOR = { voice: 'de-DE-FlorianMultilingualNeural', rate: '-6%', pitch: '+0Hz' };

function hashStr(s) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

/** Stimme + edge-Parameter für alle Sprecher eines Dialogs: { [who | '_']: {voice, rate, pitch} }. */
export function castDialog(item) {
  const cast = {};
  const used = new Set();
  for (const ch of speakersOf(WORLD, item)) {
    const v = voiceOf(WORLD, ch);
    const pool = v.gender === 'male' ? MALE : v.gender === 'female' ? FEMALE : [...FEMALE, ...MALE];
    let voice = v.edgeVoice;
    if (!voice || used.has(voice)) {
      const start = hashStr(ch.id);
      for (let i = 0; i < pool.length; i++) {
        const cand = pool[(start + i) % pool.length];
        if (!used.has(cand)) { voice = cand; break; }
      }
    }
    used.add(voice);
    cast[item.lines ? ch.name : '_'] = { voice, ...edgeParams(v), ...(item.voices?.[ch.name] || {}) };
  }
  return cast;
}
