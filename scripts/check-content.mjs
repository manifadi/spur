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
  if (card.track !== 'listen') continue;
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
const count = (t) => [...index.cards.values()].filter((c) => c.track === t).length;
console.log(`${chapters.length} Kapitel · ${index.lessons.size} Lektionen · ${count('listen')} Zuhören-Karten · ${count('read')} Lesen-Karten`);
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log('Inhalte ok.');
