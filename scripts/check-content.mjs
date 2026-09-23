// Prüft alle Kapitel auf Schemafehler: npm run check:content
import { loadChapters } from './load-chapters.mjs';
import { validateChapters, buildIndex } from '../src/engine/content.js';
import { gradeListen } from '../src/engine/answer.js';

const chapters = loadChapters();
const errors = validateChapters(chapters);
const index = buildIndex(chapters);
// Jede Musterlösung muss von der eigenen Antwortprüfung als richtig erkannt werden.
for (const card of index.cards.values()) {
  if (card.track !== 'listen') continue;
  const r = gradeListen(card.question.solution, card.question.answers);
  if (r.grade !== 'good') errors.push(`Musterlösung von ${card.id} wird nicht erkannt: "${card.question.solution}"`);
}
const count = (t) => [...index.cards.values()].filter((c) => c.track === t).length;
console.log(`${chapters.length} Kapitel · ${index.lessons.size} Lektionen · ${count('listen')} Zuhören-Karten · ${count('read')} Lesen-Karten`);
if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
console.log('Inhalte ok.');
