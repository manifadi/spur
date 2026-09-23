// Content-Schema (erweiterbar: neues Kapitel = neue JSON-Datei in src/content/chapters/).
//
// Chapter  { id, order, title, track: 'listen'|'read'|'mixed', difficulty, lessons: Lesson[] }
// Lesson   { id, title, items: Item[] }  |  { id, type: 'checkpoint', title }
// Item     Dialog { id, type: 'dialog', title, text | lines[{who,text}], questions[{id, prompt, answers[[..]], solution, quote}] }
//          Text   { id, type: 'text', title, topic, paragraphs[], keyPoints[] }
//
// Jede Frage eines Dialogs ist eine eigene Karte (id "item:frage"), jeder Text eine Karte.

export function cardIdsOfItem(item) {
  if (item.type === 'dialog') return item.questions.map((q) => `${item.id}:${q.id}`);
  return [item.id];
}

export function itemTrack(item) {
  return item.type === 'dialog' ? 'listen' : 'read';
}

export function lessonTrack(lesson, chapter) {
  // Checkpoints gehören zur Spur ihres Kapitels (Zuhören und Lesen laufen getrennt).
  if (lesson.type === 'checkpoint') return chapter?.track === 'read' || chapter?.track === 'listen' ? chapter.track : 'mixed';
  const tracks = new Set((lesson.items || []).map(itemTrack));
  if (tracks.size === 1) return [...tracks][0];
  return chapter?.track === 'mixed' || tracks.size > 1 ? 'mixed' : chapter.track;
}

export function buildIndex(chapters) {
  const sorted = [...chapters].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const lessons = new Map();
  const cards = new Map();
  const items = new Map();
  for (const chapter of sorted) {
    for (const lesson of chapter.lessons) {
      const cardIds = [];
      for (const item of lesson.items || []) {
        items.set(item.id, { item, lesson, chapter });
        if (item.type === 'dialog') {
          item.questions.forEach((q, qi) => {
            const id = `${item.id}:${q.id}`;
            cards.set(id, { id, track: 'listen', item, question: q, qIndex: qi, lesson, chapter });
            cardIds.push(id);
          });
        } else {
          cards.set(item.id, { id: item.id, track: 'read', item, lesson, chapter });
          cardIds.push(item.id);
        }
      }
      lessons.set(lesson.id, { lesson, chapter, cardIds, track: lessonTrack(lesson, chapter) });
    }
  }
  return { chapters: sorted, lessons, cards, items };
}

/**
 * Kapitelreihenfolge für die gewählte Spur. Bei "Beides" werden Zuhören- und
 * Lesen-Kapitel abwechselnd verzahnt (Interleaving), gemischte Kapitel folgen
 * an ihrer Position in der Reihenfolge.
 */
export function pathChapters(index, track) {
  const listen = index.chapters.filter((c) => c.track === 'listen');
  const read = index.chapters.filter((c) => c.track === 'read');
  const mixed = index.chapters.filter((c) => c.track === 'mixed');
  if (track === 'listen') return listen;
  if (track === 'read') return read;
  const out = [];
  for (let i = 0; i < Math.max(listen.length, read.length); i++) {
    if (listen[i]) out.push(listen[i]);
    if (read[i]) out.push(read[i]);
  }
  return [...out, ...mixed];
}

export function pathLessons(index, track) {
  return pathChapters(index, track).flatMap((c) => c.lessons.map((l) => l.id));
}

/**
 * Freischalt-Reihenfolge einer Spur. Zuhören und Lesen haben jeweils eine eigene
 * Reihenfolge und einen eigenen "aktuellen" Knoten; sie blockieren sich nie gegenseitig.
 */
export function trackSequence(index, trackPref, lessonId) {
  const t = index.lessons.get(lessonId).track;
  return pathLessons(index, trackPref).filter((id) => index.lessons.get(id).track === t);
}

/** Geschätzte Lesedauer in Sekunden: aufmerksames Lesen zum Behalten, ca. 100 Wörter pro Minute, auf 10 s gerundet. */
export function readSeconds(item) {
  const words = item.paragraphs.join(' ').split(/\s+/).length;
  return Math.max(10, Math.round((words / 100) * 60 / 10) * 10);
}

export function dialogPlainText(item) {
  if (item.lines) return item.lines.map((l) => `${l.who}: ${l.text}`).join(' ');
  return item.text;
}

/** Prüft Inhalte auf Schemafehler (npm run check:content). */
export function validateChapters(chapters) {
  const errors = [];
  const ids = new Set();
  const seen = (id, where) => { if (ids.has(id)) errors.push(`Doppelte id "${id}" (${where})`); ids.add(id); };
  for (const c of chapters) {
    if (!c.id || !c.title || !['listen', 'read', 'mixed'].includes(c.track)) errors.push(`Kapitel ${c.id}: id/title/track fehlt`);
    seen(c.id, 'Kapitel');
    if (!Array.isArray(c.lessons) || !c.lessons.length) errors.push(`Kapitel ${c.id}: keine Lektionen`);
    for (const l of c.lessons || []) {
      seen(l.id, `Lektion in ${c.id}`);
      if (l.type === 'checkpoint') continue;
      if (!l.items?.length) errors.push(`Lektion ${l.id}: keine Items`);
      for (const it of l.items || []) {
        seen(it.id, `Item in ${l.id}`);
        if (it.type === 'dialog') {
          if (!it.text && !it.lines?.length) errors.push(`Dialog ${it.id}: text oder lines fehlt`);
          if (!it.questions?.length) errors.push(`Dialog ${it.id}: keine Fragen`);
          for (const q of it.questions || []) {
            if (!q.id || !q.prompt || !q.answers?.length || !q.solution) errors.push(`Frage ${it.id}:${q.id}: prompt/answers/solution fehlt`);
          }
        } else if (it.type === 'text') {
          if (!it.paragraphs?.length || !it.keyPoints?.length || !it.topic) errors.push(`Text ${it.id}: paragraphs/keyPoints/topic fehlt`);
        } else errors.push(`Item ${it.id}: unbekannter type "${it.type}"`);
      }
    }
  }
  return errors;
}
