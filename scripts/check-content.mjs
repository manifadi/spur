// Prüft alle Kapitel auf Schemafehler: npm run check:content
import { loadChapters } from './load-chapters.mjs';
import { validateChapters, buildIndex } from '../src/engine/content.js';
import { gradeListen } from '../src/engine/answer.js';
import { buildWorld } from '../src/engine/world.js';
import { readFileSync } from 'node:fs';

const chapters = loadChapters();
const errors = validateChapters(chapters);
const index = buildIndex(chapters);
// Jede Musterlösung muss von der eigenen Antwortprüfung als richtig erkannt werden.
for (const card of index.cards.values()) {
  if (card.kind !== 'recall') continue;
  const r = gradeListen(card.question.solution, card.question.answers);
  if (r.grade !== 'good') errors.push(`Musterlösung von ${card.id} wird nicht erkannt: "${card.question.solution}"`);
}
// Welt: jede Figur mit gültigem Archetyp, jeder Dialog mit bekannter Figur/Orten.
const world = buildWorld(JSON.parse(readFileSync(new URL('../src/content/world.json', import.meta.url), 'utf8')));
for (const c of world.characters) if (!world.archetypes[c.personality]) errors.push(`Figur ${c.id}: unbekannter Archetyp "${c.personality}"`);
for (const { item } of index.items.values()) {
  if (item.type !== 'dialog') continue;
  if (!world.byId.has(item.characterId)) errors.push(`Dialog ${item.id}: characterId "${item.characterId}" fehlt in world.json`);
  for (const l of item.lines || []) if (!world.byName.has(l.who)) errors.push(`Dialog ${item.id}: Figur "${l.who}" fehlt in world.json`);
  for (const id of item.worldRefs?.charactersReferenced || []) if (!world.byId.has(id)) errors.push(`Dialog ${item.id}: worldRefs-Figur "${id}" unbekannt`);
  for (const id of item.worldRefs?.locationsReferenced || []) if (!world.locations.has(id)) errors.push(`Dialog ${item.id}: worldRefs-Ort "${id}" unbekannt`);
}
const count = (f) => [...index.cards.values()].filter(f).length;
const felder = [...index.lessons.values()].filter((l) => l.lesson.type !== 'checkpoint');
const words = (it) => (it.type === 'text' ? it.paragraphs.join(' ') : it.text || it.lines.map((l) => l.text).join(' ')).split(/\s+/).length;
const perFeld = felder.map((l) => l.cardIds.length).reduce((m, n) => ({ ...m, [n]: (m[n] || 0) + 1 }), {});
console.log(`${chapters.length} Kapitel · ${felder.length} Felder · ${index.cards.size} Teilübungen`);
console.log(`  Typen: ${count((c) => c.kind === 'recall')} Freitext · ${count((c) => c.kind === 'retell')} Nacherzählen · ${count((c) => c.kind === 'sequence')} Reihenfolge · ${count((c) => c.kind === 'match')} Auswahl`);
console.log(`  Teilübungen pro Feld: ${Object.entries(perFeld).map(([k, v]) => `${k}×${v}`).join(', ')}`);
const w = [...index.items.values()].map(({ item }) => words(item));
console.log(`  Wörter pro Dialog/Text: ${Math.min(...w)}–${Math.max(...w)} (Schnitt ${Math.round(w.reduce((a, b) => a + b) / w.length)})`);
// Jede Musterreihenfolge/Auswahl muss konsistent sein
for (const c of index.cards.values()) {
  if (c.kind === 'sequence' && new Set(c.ex.events).size !== c.ex.events.length) errors.push(`${c.id}: doppelte events`);
}
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log('Inhalte ok.');
