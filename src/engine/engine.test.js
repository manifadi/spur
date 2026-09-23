import test from 'node:test';
import assert from 'node:assert/strict';
import { loadChapters } from '../../scripts/load-chapters.mjs';
import { buildIndex, pathChapters } from './content.js';
import { applyGrade, nextStage, INTERVALS } from './srs.js';
import { gradeListen, gradeKeyPoints, normalize } from './answer.js';
import { addDays, dayKey } from './dates.js';
import {
  initialState, commitAnswer, buildLessonSession, buildDueSession, buildPath, tick, regenHearts,
  HEART_REGEN_MS, MAX_HEARTS, dueCardIds, buildCheckpointSession,
} from './game.js';

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

test('Neue Lektion: Folgefragen kommen später und ohne Originaltext', () => {
  const s = initialState();
  const session = buildLessonSession(index, s, 'z1-umzug');
  assert.equal(session.entries[0].cardId, 'z1-umzug-d:q1');
  assert.equal(session.entries[0].showSource, true);
  assert.ok(session.entries.slice(1).every((e) => !e.showSource));
  assert.equal(session.entries.length, 3);
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
  for (const q of ['q1', 'q2', 'q3']) ({ state: s, events } = commitAnswer(index, s, { cardId: `z1-kaffeekueche-d:${q}`, mode: 'new' }, 'good', d1));
  assert.equal(events.lessonDone, 'z1-kaffeekueche');
  let path = buildPath(index, s, d1);
  assert.equal(path[0].nodes[0].status, 'done');
  assert.equal(path[0].nodes[1].status, 'current');
  const d2 = at('2026-09-24T10:00:00');
  path = buildPath(index, s, d2);
  assert.equal(path[0].nodes[0].status, 'due');
  assert.equal(dueCardIds(index, s, d2).length, 3);
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
