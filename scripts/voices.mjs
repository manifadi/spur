// Besetzung für die Vorlese-Audios (edge-tts, neuronale Microsoft-Stimmen).
// Jede Person in einem Dialog bekommt eine eigene, feste Stimme. Zwei Frauen
// (oder zwei Männer) im selben Gespräch klingen deshalb immer verschieden.
//
// Überschreiben pro Dialog im Content möglich:
//   "voices": { "Oma Ilse": { "voice": "de-AT-IngridNeural", "rate": "-10%" } }

export const FEMALE = ['de-DE-SeraphinaMultilingualNeural', 'de-DE-KatjaNeural', 'de-DE-AmalaNeural', 'de-AT-IngridNeural'];
// Florian ist Miros Erzählstimme für die Lesetexte und kommt in Gesprächen nicht vor.
export const MALE = ['de-DE-ConradNeural', 'de-DE-KillianNeural', 'de-AT-JonasNeural', 'de-CH-JanNeural'];

/** Erzählstimme für die Lesetexte ("Miro liest vor"). */
export const NARRATOR = { voice: 'de-DE-FlorianMultilingualNeural', rate: '-6%', pitch: '+0Hz' };

/** Grundtempo für Gespräche: minimal ruhiger als die Standardgeschwindigkeit. */
const BASE = { rate: '-4%', pitch: '+0Hz' };

// Geschlecht der Figuren aus den mitgelieferten Kapiteln. Neue Namen: hier ergänzen
// (oder "Frau …" / "Herr …" / "Oma …" / "Opa …" verwenden, das wird erkannt).
const F = new Set(['Oma Ilse', 'Jana', 'Aylin', 'Kim', 'Marta', 'Lea', 'Tante Vera', 'Pia', 'Carla', 'Nele', 'Sophie', 'Ida']);
const M = new Set(['Leon', 'Tobias', 'Paul', 'Deniz', 'Ben', 'Yusuf', 'Meister Kowalski', 'Azubi Timo', 'Jonte', 'Ole', 'Jakob', 'Emre', 'Kolja']);

// Kleine Eigenheiten, damit Figuren nicht alle gleich klingen.
const STYLE = {
  'Oma Ilse': { voice: 'de-AT-IngridNeural', rate: '-12%', pitch: '-4Hz' },
  'Tante Vera': { rate: '+2%' },
  'Meister Kowalski': { rate: '-6%', pitch: '-3Hz' },
  'Azubi Timo': { rate: '+6%', pitch: '+3Hz' },
  'Frau Albrecht': { rate: '-2%' },
};

export function genderOf(who) {
  if (F.has(who) || /^(Frau|Oma|Tante)\b/.test(who)) return 'f';
  if (M.has(who) || /^(Herr|Opa|Onkel|Meister)\b/.test(who)) return 'm';
  return null;
}

function hashStr(s) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

/** Stimmen für alle Sprecher eines Dialogs, in Reihenfolge des ersten Auftretens. */
export function castDialog(item) {
  const overrides = item.voices || {};
  if (!item.lines) {
    // Einzelne Erzählerin bzw. einzelner Erzähler: abwechslungsreich, aber stabil pro Dialog.
    const all = [...FEMALE, ...MALE];
    return { _: { ...BASE, voice: all[hashStr(item.id) % all.length], ...(overrides._ || {}) } };
  }
  const cast = {};
  // Startpunkt im Stimmen-Pool wechselt pro Dialog, damit nicht jedes Gespräch
  // vom selben "Paar" gesprochen wird.
  let fi = hashStr(item.id) % FEMALE.length;
  let mi = hashStr(item.id + '#') % MALE.length;
  for (const { who } of item.lines) {
    if (cast[who]) continue;
    let g = genderOf(who);
    if (!g) g = hashStr(who) % 2 ? 'f' : 'm';
    const voice = g === 'f' ? FEMALE[fi++ % FEMALE.length] : MALE[mi++ % MALE.length];
    cast[who] = { ...BASE, voice, ...(STYLE[who] || {}), ...(overrides[who] || {}) };
  }
  return cast;
}
