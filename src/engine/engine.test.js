import test from 'node:test';
import assert from 'node:assert/strict';
import { loadChapters } from '../../scripts/load-chapters.mjs';
import { buildIndex, pathChapters } from './content.js';
import { applyGrade, nextStage, INTERVALS } from './srs.js';
import { gradeListen, gradeKeyPoints, normalize } from './answer.js';
import { addDays, dayKey } from './dates.js';
import {
  initialState, commitAnswer, buildLessonSession, buildDueSession, buildPath, tick, regenHearts,
  HEART_REGEN_MS, MAX_HEARTS, dueCardIds, buildCheckpointSession, isLessonComplete, lessonSegments,
  schedulePopup, pickPopup, buildPopupSession, hydrate, markLessonDone,
} from './game.js';
import { gradeMatch, gradeSequence } from './answer.js';

const index = buildIndex(loadChapters());
const at = (s) => new Date(s);

test('Intervalle: gut → eine Stufe weiter, kaum etwas → Stufe 0, neu startet bei -1', () => {
  assert.deepEqual(INTERVALS, [1, 2, 4, 8, 16, 30, 60]);
  assert.equal(nextStage(-1, 'good'), 0);
  assert.equal(nextStage(3, 'good'), 4);
  assert.equal(nextStage(6, 'good'), 6);
  assert.equal(nextStage(4, 'poor'), 0);
  assert.equal(nextStage(4, 'partial'), 4);
  const now = at('2026-09-23T10:00:00');
  const r1 = applyGrade(null, 'good', now);
  assert.equal(r1.stage, 0);
  assert.equal(r1.due, '2026-09-24');
  const r2 = applyGrade({ ...r1, stage: 2 }, 'good', now);
  assert.equal(r2.due, addDays('2026-09-23', 8));
});

test('Freiwilliges Üben verschiebt nichts – außer bei "kaum etwas"', () => {
  const now = at('2026-09-23T10:00:00');
  const rec = { stage: 3, due: '2026-10-01', first: 'x', last: 'x', reps: 3, lapses: 0, history: [] };
  assert.equal(applyGrade(rec, 'good', now, { reschedule: false }).stage, 3);
  assert.equal(applyGrade(rec, 'poor', now, { reschedule: false }).stage, 0);
});

test('Antwortprüfung: Umlaute, Tippfehler, Mehrfach-Details', () => {
  assert.equal(normalize('Ihr Bruder Jönas!'), 'ihr bruder joenas');
  assert.equal(gradeListen('ihr bruder jonas', [['Jonas', 'Bruder']]).grade, 'good');
  assert.equal(gradeListen('Jonsa', [['Jonas']]).grade, 'good');
  assert.equal(gradeListen('Ihre Schwester, glaube ich', [['Jonas', 'Bruder']]).grade, 'poor');
  assert.equal(gradeListen('40', [['30', 'dreißig']]).grade, 'poor');
  assert.equal(gradeListen('dreissig', [['30', 'dreißig']]).grade, 'good');
  assert.equal(gradeListen('Lindenweg', [['Lindenweg'], ['14']]).grade, 'partial');
  assert.equal(gradeListen('Lindenweg 14', [['Lindenweg'], ['14']]).grade, 'good');
  assert.equal(gradeKeyPoints(3, 4).grade, 'good');
  assert.equal(gradeKeyPoints(2, 4).grade, 'partial');
  assert.equal(gradeKeyPoints(1, 4).grade, 'poor');
});

test('Pfad: "Beides" verzahnt Zuhören und Lesen, erster Knoten ist current', () => {
  const chs = pathChapters(index, 'both').map((c) => c.track);
  assert.deepEqual(chs.slice(0, 4), ['listen', 'read', 'listen', 'read']);
  const s = initialState();
  const path = buildPath(index, s);
  assert.equal(path[0].nodes[0].status, 'current');
  assert.equal(path[0].nodes[1].status, 'locked');
  assert.equal(path[0].nodes[1].label, 'Bald');
  assert.equal(path[0].nodes[2].label, null);
});

test('Feld-Session: Original nur vor der ersten Übung, Zähler "Frage X von Y"', () => {
  const s = initialState();
  const session = buildLessonSession(index, s, 'z1-umzug');
  assert.equal(session.entries[0].cardId, 'z1-umzug-d:q1');
  assert.equal(session.entries[0].showSource, true);
  assert.ok(session.entries.slice(1).every((e) => !e.showSource));
  assert.equal(session.entries.length, 3);
  assert.deepEqual(session.entries.map((e) => e.feld), [{ n: 1, of: 3 }, { n: 2, of: 3 }, { n: 3, of: 3 }]);
});

test('Feld erst abgeschlossen, wenn ALLE Teilübungen gemeistert sind; Segmente zählen mit', () => {
  const now = at('2026-09-23T10:00:00');
  let s = initialState();
  const ids = index.lessons.get('z1-kaffeekueche').cardIds;
  assert.equal(ids.length, 4);
  let r;
  for (const id of ids.slice(0, 3)) r = commitAnswer(index, (s = r ? r.state : s), { cardId: id, mode: 'new' }, 'good', now);
  s = commitAnswer(index, r.state, { cardId: ids[3], mode: 'new' }, 'poor', now).state;
  assert.equal(isLessonComplete(index, s, 'z1-kaffeekueche'), false);
  assert.deepEqual(lessonSegments(index, s, 'z1-kaffeekueche'), { total: 4, done: 3 });
  // Zweiter Versuch in derselben Session meistert das Segment, ohne das Intervall zu ändern
  const before = s.cards[ids[3]].due;
  r = commitAnswer(index, s, { cardId: ids[3], mode: 'retry' }, 'good', now);
  assert.equal(r.state.cards[ids[3]].due, before);
  assert.equal(r.events.lessonDone, 'z1-kaffeekueche');
  // Nicht gemeisterte Übungen kommen beim nächsten Öffnen wieder, ohne erneutes Anhören
  const again = buildLessonSession(index, s, 'z1-kaffeekueche', now);
  assert.equal(again.entries.filter((e) => e.feld).length, 1);
  assert.equal(again.entries[0].showSource, false);
});

test('Auswahl und Reihenfolge werden bewertet', () => {
  assert.equal(gradeMatch(['a'], ['a']).grade, 'good');
  assert.equal(gradeMatch(['a', 'x'], ['a', 'b']).grade, 'poor');
  assert.equal(gradeMatch(['a'], ['a', 'b']).grade, 'partial');
  assert.equal(gradeSequence(['a', 'b', 'c'], ['a', 'b', 'c']).grade, 'good');
  assert.equal(gradeSequence(['a', 'c', 'b', 'd'], ['a', 'b', 'c', 'd']).grade, 'partial');
  assert.equal(gradeSequence(['c', 'a', 'b'], ['a', 'b', 'c']).grade, 'poor');
});

test('Pop-ups: ~60 % Chance, 3–5 Tage, höchstens eines pro Tag, Rest verschiebt sich', () => {
  const now = at('2026-09-23T10:00:00');
  const seq = (...v) => { let i = 0; return () => v[i++ % v.length]; };
  assert.deepEqual(schedulePopup({}, 'lesen-1', now, seq(0.7)), {}); // 40 %: bewusst kein Pop-up
  const p = schedulePopup({}, 'lesen-1', now, seq(0.1, 0.5));
  const due = new Date(p['lesen-1'].dueAt) - now;
  assert.ok(due >= 3 * 86400000 && due <= 5 * 86400000);
  // Zwei fällige Geschichten am selben Tag: eine wird gezeigt, die andere wandert 3–5 Tage weiter
  let s = initialState();
  for (const id of index.lessons.get('l1-kraehen').cardIds) s = commitAnswer(index, s, { cardId: id, mode: 'new' }, 'good', now).state;
  for (const id of index.lessons.get('z1-umzug').cardIds) s = commitAnswer(index, s, { cardId: id, mode: 'new' }, 'good', now).state;
  const past = new Date(now.getTime() - 1000).toISOString();
  s = { ...s, progress: { ...s.progress, popups: { 'lesen-1': { dueAt: past }, 'zuhoeren-1': { dueAt: past } } } };
  const r = pickPopup(index, s, now, seq(0, 0.5));
  assert.equal(r.chapterId, 'lesen-1');
  assert.ok(new Date(r.state.progress.popups['zuhoeren-1'].dueAt) - now >= 3 * 86400000);
  assert.equal(pickPopup(index, r.state, now).chapterId, null); // nicht zweimal am selben Tag
  // Kurztest: höchstens 3 Übungen aus der Geschichte, beeinflusst keine Intervalle
  const test = buildPopupSession(index, r.state, 'lesen-1', seq(0.3));
  assert.ok(test.entries.length >= 1 && test.entries.length <= 3);
  const card = test.entries[0].cardId;
  const after = commitAnswer(index, r.state, test.entries[0], 'good', now).state;
  assert.equal(after.cards[card].due, r.state.cards[card].due);
  assert.equal(after.progress.streak, r.state.progress.streak);
  assert.equal(after.progress.xp, r.state.progress.xp + 10);
});

test('Kapitelabschluss plant Pop-up; Migration alter Karten-IDs verliert nichts', () => {
  const now = at('2026-09-23T10:00:00');
  let s = initialState();
  for (const l of index.chapters.find((c) => c.id === 'lesen-1').lessons) s = { ...s, progress: { ...s.progress, lessonsDone: { ...s.progress.lessonsDone, [l.id]: 'x' } } };
  const ev = {};
  s = markLessonDone(index, s, 'l1-oktopus', now, ev, () => 0.1);
  assert.equal(ev.chapterDone, 'lesen-1');
  assert.ok(s.progress.popups['lesen-1']);
  const old = { version: 1, onboarded: true, settings: {}, progress: {}, cards: { 'l1-kraehen-t': { stage: 3, due: '2026-10-01', history: [{ g: 'good' }] } } };
  const h = hydrate(old, now, { 'l1-kraehen-t': 'l1-kraehen-t:retell' });
  assert.equal(h.cards['l1-kraehen-t:retell'].stage, 3);
  assert.equal(h.version, 2);
});

test('Herzen: nur neue Karten kosten eins, Wiederholungen nie; Regeneration alle 2 h', () => {
  const now = at('2026-09-23T10:00:00');
  let s = initialState();
  let r = commitAnswer(index, s, { cardId: 'z1-umzug-d:q1', mode: 'new' }, 'poor', now);
  assert.equal(r.state.progress.hearts, MAX_HEARTS - 1);
  assert.ok(r.events.heartLost);
  r = commitAnswer(index, r.state, { cardId: 'z1-umzug-d:q1', mode: 'review' }, 'poor', now);
  assert.equal(r.state.progress.hearts, MAX_HEARTS - 1);
  const p = regenHearts(r.state.progress, new Date(now.getTime() + HEART_REGEN_MS + 1000));
  assert.equal(p.hearts, MAX_HEARTS);
  assert.equal(p.heartsRefillAt, null);
});

test('Federn und Streak', () => {
  const d1 = at('2026-09-23T10:00:00');
  let s = initialState();
  let r = commitAnswer(index, s, { cardId: 'z1-umzug-d:q1', mode: 'new' }, 'good', d1);
  assert.equal(r.state.progress.xp, 10);
  assert.equal(r.state.progress.streak, 1);
  r = commitAnswer(index, r.state, { cardId: 'z1-umzug-d:q2', mode: 'new' }, 'partial', d1);
  assert.equal(r.state.progress.xp, 15);
  assert.equal(r.state.progress.streak, 1);
  r = commitAnswer(index, r.state, { cardId: 'z1-umzug-d:q3', mode: 'new' }, 'poor', at('2026-09-24T09:00:00'));
  assert.equal(r.state.progress.xp, 17);
  assert.equal(r.state.progress.streak, 2);
  // Lücke → Streak-Pause wird erkannt, längster Streak bleibt
  const later = tick(r.state, at('2026-09-27T09:00:00'));
  assert.equal(later.progress.streak, 0);
  assert.equal(later.progress.longestStreak, 2);
  assert.deepEqual(later.progress.pendingStreakBroken, { was: 2, longest: 2 });
});

test('7-Tage-Streak schaltet unendliche Aufmerksamkeit bis Mitternacht frei', () => {
  let s = initialState();
  let events;
  for (let d = 0; d < 7; d++) {
    const now = new Date(2026, 8, 1 + d, 12);
    ({ state: s, events } = commitAnswer(index, s, { cardId: 'z1-umzug-d:q1', mode: 'review' }, 'good', now));
  }
  assert.equal(events.milestone, 7);
  assert.equal(new Date(s.progress.infiniteUntil).getHours(), 23);
  const r = commitAnswer(index, s, { cardId: 'z1-umzug-d:q2', mode: 'new' }, 'poor', new Date(2026, 8, 7, 13));
  assert.equal(r.state.progress.hearts, MAX_HEARTS);
});

test('Lektion fertig → nächster Knoten current, Karten werden fällig und erscheinen als due', () => {
  const d1 = at('2026-09-23T10:00:00');
  let s = initialState();
  let events;
  for (const id of index.lessons.get('z1-kaffeekueche').cardIds) ({ state: s, events } = commitAnswer(index, s, { cardId: id, mode: 'new' }, 'good', d1));
  assert.equal(events.lessonDone, 'z1-kaffeekueche');
  let path = buildPath(index, s, d1);
  assert.equal(path[0].nodes[0].status, 'done');
  assert.equal(path[0].nodes[1].status, 'current');
  const d2 = at('2026-09-24T10:00:00');
  path = buildPath(index, s, d2);
  assert.equal(path[0].nodes[0].status, 'due');
  assert.equal(dueCardIds(index, s, d2).length, 4);
  const due = buildDueSession(index, s, 'z1-kaffeekueche', d2);
  assert.ok(due.entries.every((e) => e.mode === 'review' && !e.showSource));
  // Neue Lektion mischt fällige Wiederholungen ein (Interleaving)
  const next = buildLessonSession(index, s, 'z1-umzug', d2);
  assert.ok(next.entries.some((e) => e.mode === 'review'));
  assert.equal(dayKey(d2), '2026-09-24');
});

test('Checkpoint wählt bereits gelernte Karten', () => {
  const d1 = at('2026-09-23T10:00:00');
  let s = { ...initialState(), settings: { ...initialState().settings, track: 'listen' } };
  for (const q of ['q1', 'q2', 'q3']) s = commitAnswer(index, s, { cardId: `z1-kaffeekueche-d:${q}`, mode: 'new' }, 'good', d1).state;
  const cp = buildCheckpointSession(index, s, 'z3-checkpoint', d1);
  assert.equal(cp.entries.length, 3);
  assert.ok(cp.entries.every((e) => !e.showSource));
});

test('Getrenntes Scheduling: Zuhören und Lesen haben je einen eigenen aktuellen Knoten', () => {
  const d1 = at('2026-09-23T10:00:00');
  let s = initialState();
  let path = buildPath(index, s, d1);
  const current = path.flatMap((g) => g.nodes).filter((n) => n.status === 'current').map((n) => `${n.track}:${n.id}`);
  assert.deepEqual(current, ['listen:z1-kaffeekueche', 'read:l1-kraehen']);
  // Zwei Zuhör-Lektionen erledigen: Lesen bleibt unberührt bei der ersten Lektion.
  for (const l of ['z1-kaffeekueche', 'z1-umzug']) for (const id of index.lessons.get(l).cardIds) s = commitAnswer(index, s, { cardId: id, mode: 'new' }, 'good', d1).state;
  path = buildPath(index, s, d1);
  const cur = Object.fromEntries(path.flatMap((g) => g.nodes).filter((n) => n.status === 'current').map((n) => [n.track, n.id]));
  assert.deepEqual(cur, { listen: 'z1-paket', read: 'l1-kraehen' });
  // Checkpoints gehören zur Spur ihres Kapitels
  assert.equal(index.lessons.get('z3-checkpoint').track, 'listen');
  assert.equal(index.lessons.get('l3-checkpoint').track, 'read');
});
