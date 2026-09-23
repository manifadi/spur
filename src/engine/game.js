import { addDays, dayKey, daysBetween, endOfDay } from './dates.js';
import { applyGrade, isDue, XP } from './srs.js';
import { itemTrack, pathChapters, pathLessons, trackSequence } from './content.js';

export const MAX_HEARTS = 5;
export const HEART_REGEN_MS = 2 * 60 * 60 * 1000;
export const STREAK_MILESTONES = [7, 14, 30, 50, 100, 150, 200, 365];
const REVIEWS_PER_LESSON = 3;
const CHECKPOINT_SIZE = 6;
const PRACTICE_SIZE = 5;

/* ------------------------------------------------------------------------ */
/* Zustand                                                                   */
/* ------------------------------------------------------------------------ */

export function defaultSettings() {
  return { track: 'both', frequency: 'daily', reminder: null, tts: true, sounds: false, theme: 'light', dailyGoal: 3 };
}

export function freshProgress() {
  return {
    xp: 0, streak: 0, longestStreak: 0, lastActiveDay: null, practicedDays: [],
    hearts: MAX_HEARTS, heartsRefillAt: null, infiniteUntil: null,
    doneToday: 0, doneTodayDay: null,
    lessonsDone: {}, chaptersDone: {},
    pendingStreakBroken: null, infiniteSeenDay: null,
    popups: {}, lastPopupDay: null,
  };
}

export const STATE_VERSION = 2;

export function initialState() {
  return { version: STATE_VERSION, onboarded: false, settings: defaultSettings(), progress: freshProgress(), cards: {} };
}

/**
 * Karten-IDs umbenennen, wenn sich der Content umbaut (z. B. Lesetext → "text:retell",
 * geteilte Gespräche). Verlauf und Intervalle wandern mit — nichts geht verloren.
 */
export function migrateCards(cards, renames = {}) {
  let changed = false;
  const out = {};
  for (const [id, rec] of Object.entries(cards)) {
    const to = renames[id];
    if (to && !cards[to]) { out[to] = rec; changed = true; } else out[id] = rec;
  }
  return changed ? out : cards;
}

/** Normalisiert geladenen Zustand und holt Zeitabhängiges nach (Herzen, Tageswechsel, Streak-Lücke). */
export function hydrate(saved, now = new Date(), renames = {}) {
  const base = initialState();
  const s = saved && saved.version >= 1 ? {
    ...base, ...saved,
    version: STATE_VERSION,
    settings: { ...base.settings, ...saved.settings },
    progress: { ...base.progress, ...saved.progress },
    cards: migrateCards(saved.cards || {}, renames),
  } : base;
  return tick(s, now);
}

/** Zeitabhängige Updates: Herzen regenerieren, Tageszähler zurücksetzen, Streak-Lücke erkennen. */
export function tick(state, now = new Date()) {
  let p = regenHearts(state.progress, now);
  const today = dayKey(now);
  if (p.doneTodayDay !== today && p.doneToday) p = { ...p, doneToday: 0, doneTodayDay: today };
  if (p.streak > 0 && p.lastActiveDay && daysBetween(p.lastActiveDay, today) > 1) {
    p = { ...p, pendingStreakBroken: { was: p.streak, longest: p.longestStreak }, streak: 0 };
  }
  if (p.infiniteUntil && new Date(p.infiniteUntil) < now) p = { ...p, infiniteUntil: null };
  return p === state.progress ? state : { ...state, progress: p };
}

export function regenHearts(p, now = new Date()) {
  if (p.hearts >= MAX_HEARTS || !p.heartsRefillAt) {
    return p.hearts >= MAX_HEARTS && p.heartsRefillAt ? { ...p, heartsRefillAt: null } : p;
  }
  let hearts = p.hearts;
  let at = new Date(p.heartsRefillAt).getTime();
  const t = now.getTime();
  while (hearts < MAX_HEARTS && t >= at) { hearts++; at += HEART_REGEN_MS; }
  if (hearts === p.hearts) return p;
  return { ...p, hearts, heartsRefillAt: hearts >= MAX_HEARTS ? null : new Date(at).toISOString() };
}

export function isInfinite(p, now = new Date()) {
  return !!p.infiniteUntil && new Date(p.infiniteUntil) >= now;
}

export function canStartNew(p, now = new Date()) {
  return isInfinite(p, now) || p.hearts > 0;
}

export function msToNextHeart(p, now = new Date()) {
  if (!p.heartsRefillAt) return 0;
  return Math.max(0, new Date(p.heartsRefillAt).getTime() - now.getTime());
}

export function doneTodayCount(p, now = new Date()) {
  return p.doneTodayDay === dayKey(now) ? p.doneToday : 0;
}

/* ------------------------------------------------------------------------ */
/* Pfad                                                                      */
/* ------------------------------------------------------------------------ */

export function dueCardIds(index, state, now = new Date()) {
  const today = dayKey(now);
  return Object.entries(state.cards)
    .filter(([id, r]) => index.cards.has(id) && r.stage >= 0 && isDue(r, today))
    .sort((a, b) => (a[1].due < b[1].due ? -1 : a[1].due > b[1].due ? 1 : a[1].stage - b[1].stage))
    .map(([id]) => id);
}

export function daysSinceFirstSeen(state, cardIds, now = new Date()) {
  const firsts = cardIds.map((id) => state.cards[id]?.first).filter(Boolean).sort();
  if (!firsts.length) return 0;
  return daysBetween(dayKey(new Date(firsts[0])), dayKey(now));
}

/** Eine Teilübung gilt als gemeistert, sobald sie einmal (teilweise) richtig beantwortet wurde. */
export function isMastered(rec) {
  return !!rec && (rec.history || []).some((h) => h.g !== 'poor');
}

/** Ein Feld ist erst abgeschlossen, wenn ALLE seine Teilübungen gemeistert sind. */
export function isLessonComplete(index, state, lessonId) {
  if (state.progress.lessonsDone[lessonId]) return true;
  const l = index.lessons.get(lessonId);
  if (!l || l.lesson.type === 'checkpoint') return false;
  return l.cardIds.every((id) => isMastered(state.cards[id]));
}

/** Segmente für den Ring am Knoten: gemeisterte von allen Teilübungen. */
export function lessonSegments(index, state, lessonId) {
  const l = index.lessons.get(lessonId);
  if (!l || l.lesson.type === 'checkpoint') return { total: 1, done: state.progress.lessonsDone[lessonId] ? 1 : 0 };
  return { total: l.cardIds.length, done: l.cardIds.filter((id) => isMastered(state.cards[id])).length };
}

/**
 * Knoten des Pfads mit Zustand: done / due / current / locked.
 * Freigeschaltet ist immer genau die erste noch nicht erledigte Lektion.
 */
export function buildPath(index, state, now = new Date()) {
  const today = dayKey(now);
  const chapters = pathChapters(index, state.settings.track);
  // Je Spur ein eigener aktueller Knoten: Zuhören und Lesen schalten unabhängig frei.
  const currentFound = {};
  let n = 0;
  return chapters.map((chapter, ci) => {
    let firstLockedLabelled = false;
    const nodes = chapter.lessons.map((lesson) => {
      const info = index.lessons.get(lesson.id);
      const done = isLessonComplete(index, state, lesson.id);
      let status;
      if (done) {
        const due = info.cardIds.some((id) => { const r = state.cards[id]; return r && r.stage >= 0 && isDue(r, today); });
        status = due ? 'due' : 'done';
      } else if (!currentFound[info.track]) { status = 'current'; currentFound[info.track] = true; } else status = 'locked';
      let label = lesson.title;
      if (status === 'due') label = `Fällig · ${daysSinceFirstSeen(state, info.cardIds, now)} Tage`;
      if (status === 'locked') { label = firstLockedLabelled ? null : 'Bald'; firstLockedLabelled = true; }
      return { id: lesson.id, n: n++, lesson, chapter, track: info.track, status, label, cardIds: info.cardIds, segments: lessonSegments(index, state, lesson.id) };
    });
    const complete = nodes.every((x) => x.status === 'done' || x.status === 'due');
    return { chapter, number: ci + 1, nodes, complete };
  });
}

export function currentLessonIds(index, state) {
  const out = {};
  for (const id of pathLessons(index, state.settings.track)) {
    const t = index.lessons.get(id).track;
    if (!out[t] && !isLessonComplete(index, state, id)) out[t] = id;
  }
  return out;
}

export function hasAnyProgress(state) {
  return Object.keys(state.cards).length > 0;
}

/* ------------------------------------------------------------------------ */
/* Sessions                                                                  */
/* ------------------------------------------------------------------------ */
// Entry: { cardId, mode: 'new'|'review'|'practice'|'replay', showSource }
//  new      neue Karte, zählt fürs Scheduling, kostet bei "kaum etwas" ein Herz
//  review   fällige Wiederholung — nie mit Originaltext, kostet nie ein Herz
//  practice freiwillig, nicht fällig — ohne Originaltext, verschiebt nichts
//  replay   "Nochmal hören/lesen" einer erledigten Lektion, mit Original

/** Verzahnt zwei Listen abwechselnd (Interleaving der Spuren). */
export function interleave(a, b) {
  const out = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== undefined) out.push(a[i]);
    if (b[i] !== undefined) out.push(b[i]);
  }
  return out;
}

function byTrack(index, ids) {
  const listen = ids.filter((id) => index.cards.get(id).track === 'listen');
  const read = ids.filter((id) => index.cards.get(id).track === 'read');
  return interleave(listen, read);
}

function reviewEntry(state, id, today) {
  const r = state.cards[id];
  return { cardId: id, mode: r && r.stage >= 0 && isDue(r, today) ? 'review' : 'practice', showSource: false };
}

/**
 * Feld-Session: alle noch nicht gemeisterten Teilübungen des Feldes, der Reihe nach.
 * Das Original (Gespräch hören / Text lesen) kommt nur vor der ersten Übung eines
 * Items, das noch nie präsentiert wurde. Danach folgen bis zu 3 fällige Wiederholungen
 * (bevorzugt aus der anderen Spur — Interleaving, ohne Einfluss aufs Scheduling).
 * Jede Feld-Übung trägt { feld: { n, of } } für die Anzeige "Frage X von Y".
 */
export function buildLessonSession(index, state, lessonId, now = new Date(), mode = 'new') {
  const info = index.lessons.get(lessonId);
  const today = dayKey(now);
  const feld = [];
  for (const item of info.lesson.items) {
    const ids = cardIdsOfItemIn(info, item);
    const open = mode === 'replay' ? ids : ids.filter((id) => !isMastered(state.cards[id]));
    const presented = ids.some((id) => state.cards[id]);
    open.forEach((id, i) => feld.push({ cardId: id, mode, showSource: i === 0 && (mode === 'replay' || !presented) }));
  }
  feld.forEach((e, i) => { e.feld = { n: i + 1, of: feld.length }; });
  const otherTrack = info.track === 'listen' ? 'read' : 'listen';
  const due = mode === 'replay' ? [] : dueCardIds(index, state, now).filter((id) => !info.cardIds.includes(id));
  const reviews = [...due.filter((id) => index.cards.get(id).track === otherTrack), ...due.filter((id) => index.cards.get(id).track !== otherTrack)]
    .slice(0, REVIEWS_PER_LESSON).map((id) => reviewEntry(state, id, today));
  return { kind: mode === 'replay' ? 'replay' : 'lesson', lessonId, entries: [...feld, ...reviews] };
}

function cardIdsOfItemIn(info, item) {
  return info.cardIds.filter((id) => id.startsWith(item.id + ':'));
}

/** Fällige Wiederholung eines Knotens, gemischt mit ein, zwei fälligen Karten der anderen Spur. */
export function buildDueSession(index, state, lessonId, now = new Date()) {
  const info = index.lessons.get(lessonId);
  const today = dayKey(now);
  const due = dueCardIds(index, state, now);
  const own = due.filter((id) => info.cardIds.includes(id));
  const other = due.filter((id) => !info.cardIds.includes(id) && index.cards.get(id).track !== info.track).slice(0, 2);
  const entries = interleave(own, other).map((id) => reviewEntry(state, id, today));
  return { kind: 'due', lessonId, entries };
}

function seenCards(index, state, filter = () => true) {
  return Object.entries(state.cards)
    .filter(([id, r]) => index.cards.has(id) && r.stage >= 0 && filter(id))
    .sort((a, b) => (a[1].due < b[1].due ? -1 : a[1].due > b[1].due ? 1 : a[1].stage - b[1].stage))
    .map(([id]) => id);
}

/** Checkpoint: gemischte Wiederholung aus allem, was bis hier gelernt wurde. */
export function buildCheckpointSession(index, state, lessonId, now = new Date()) {
  const today = dayKey(now);
  // Checkpoint wiederholt nur die eigene Spur, alles bis hierher.
  const order = trackSequence(index, state.settings.track, lessonId);
  const upto = new Set(order.slice(0, order.indexOf(lessonId)));
  const ids = seenCards(index, state, (id) => upto.has(index.cards.get(id).lesson.id)).slice(0, CHECKPOINT_SIZE * 2);
  const entries = byTrack(index, ids).slice(0, CHECKPOINT_SIZE).map((id) => reviewEntry(state, id, today));
  return { kind: 'checkpoint', lessonId, entries };
}

/** "Nur Wiederholungen üben": alle fälligen Karten; ist nichts fällig, freiwillig die nächsten. */
export function buildReviewSession(index, state, now = new Date()) {
  const today = dayKey(now);
  let ids = dueCardIds(index, state, now);
  if (!ids.length) ids = seenCards(index, state).slice(0, PRACTICE_SIZE);
  return { kind: 'reviews', lessonId: null, entries: byTrack(index, ids).map((id) => reviewEntry(state, id, today)) };
}

/** "Freiwillige Runde": ein paar bereits gelernte Karten, ohne Zwang. */
export function buildVoluntarySession(index, state, now = new Date()) {
  const today = dayKey(now);
  const ids = byTrack(index, seenCards(index, state).slice(0, PRACTICE_SIZE * 2)).slice(0, PRACTICE_SIZE);
  return { kind: 'voluntary', lessonId: null, entries: ids.map((id) => reviewEntry(state, id, today)) };
}

/* ------------------------------------------------------------------------ */
/* Bewertung übernehmen                                                      */
/* ------------------------------------------------------------------------ */

/**
 * Übernimmt das Ergebnis einer Karte. Gibt den neuen Zustand und die Ereignisse
 * zurück (Herz verloren, Streak erhöht, Meilenstein, Lektion/Kapitel fertig).
 */
export function commitAnswer(index, state, entry, grade, now = new Date()) {
  const today = dayKey(now);
  const events = { xp: XP[grade], heartLost: false, streakUp: false, milestone: null, lessonDone: null, chapterDone: null, prevStage: null, newStage: null, goalReached: false };
  let cards = state.cards;
  let p = { ...state.progress };
  const rec = cards[entry.cardId];
  events.prevStage = rec ? rec.stage : -1;

  if (entry.mode === 'retry' || entry.mode === 'popup') {
    // Zweiter Versuch im Feld / Kurztest aus dem Pop-up: nur protokollieren, Intervalle bleiben.
    if (rec) cards = { ...cards, [entry.cardId]: { ...rec, history: [...(rec.history || []), { at: now.toISOString(), g: grade, m: entry.mode }].slice(-20) } };
    events.newStage = rec ? rec.stage : null;
  } else if (entry.mode !== 'replay') {
    const reschedule = entry.mode === 'new' || entry.mode === 'review';
    const next = applyGrade(rec, grade, now, { reschedule });
    cards = { ...cards, [entry.cardId]: next };
    events.newStage = next.stage;
  }

  // Pop-up-Kurztest: kleine Bonus-Federn, sonst keinerlei Einfluss (kein Streak, kein Tagesziel).
  if (entry.mode === 'popup') {
    events.xp = XP[grade];
    return { state: { ...state, cards, progress: { ...p, xp: p.xp + XP[grade] } }, events };
  }

  if (entry.mode === 'new' && grade === 'poor' && !isInfinite(p, now)) {
    if (p.hearts > 0) {
      if (p.hearts >= MAX_HEARTS || !p.heartsRefillAt) p.heartsRefillAt = new Date(now.getTime() + HEART_REGEN_MS).toISOString();
      p.hearts -= 1;
      events.heartLost = true;
    }
  }

  // Federn, Tagesziel, Streak (einmal pro Kalendertag mit mindestens einer Karte)
  p.xp += XP[grade];
  const before = p.doneTodayDay === today ? p.doneToday : 0;
  p.doneToday = before + 1;
  p.doneTodayDay = today;
  if (before < state.settings.dailyGoal && p.doneToday >= state.settings.dailyGoal) events.goalReached = true;
  if (p.lastActiveDay !== today) {
    const gap = p.lastActiveDay ? daysBetween(p.lastActiveDay, today) : null;
    p.streak = gap === 1 ? p.streak + 1 : 1;
    p.lastActiveDay = today;
    p.longestStreak = Math.max(p.longestStreak, p.streak);
    p.practicedDays = [...(p.practicedDays || []), today].slice(-21);
    p.pendingStreakBroken = null;
    events.streakUp = true;
    if (STREAK_MILESTONES.includes(p.streak)) {
      events.milestone = p.streak;
      p.infiniteUntil = endOfDay(now).toISOString();
    }
  }

  let next = { ...state, cards, progress: p };

  // Lektion & Kapitel abschließen
  const card = index.cards.get(entry.cardId);
  if (entry.mode === 'new' || entry.mode === 'retry') {
    const lid = card.lesson.id;
    if (!next.progress.lessonsDone[lid] && isLessonComplete(index, next, lid)) {
      next = markLessonDone(index, next, lid, now, events);
    }
  }
  return { state: next, events };
}

export function markLessonDone(index, state, lessonId, now, events = {}, rng = Math.random) {
  const p = { ...state.progress, lessonsDone: { ...state.progress.lessonsDone, [lessonId]: now.toISOString() } };
  events.lessonDone = lessonId;
  const chapter = index.lessons.get(lessonId).chapter;
  if (chapter.lessons.every((l) => p.lessonsDone[l.id]) && !p.chaptersDone[chapter.id]) {
    p.chaptersDone = { ...p.chaptersDone, [chapter.id]: now.toISOString() };
    events.chapterDone = chapter.id;
    p.popups = schedulePopup(p.popups || {}, chapter.id, now, rng);
  }
  return { ...state, progress: p };
}

/* ------------------------------------------------------------------------ */
/* Zufällige Erinnerungs-Pop-ups (unabhängig vom Pfad-Scheduling)            */
/* ------------------------------------------------------------------------ */

export const POPUP_CHANCE = 0.6;
const DAY_MS = 86400000;

/** Zufälliger Zeitpunkt 3–5 Tage nach `from` (echte Streuung, auch über die Tageszeit). */
export function popupDelay(from, rng = Math.random) {
  return new Date(from.getTime() + (3 + rng() * 2) * DAY_MS).toISOString();
}

/** Bei Abschluss: mit ~60 % Wahrscheinlichkeit wird die Geschichte/Feld-Gruppe pop-up-fähig. */
export function schedulePopup(popups, chapterId, now, rng = Math.random) {
  if (popups[chapterId] || rng() >= POPUP_CHANCE) return popups;
  return { ...popups, [chapterId]: { dueAt: popupDelay(now, rng) } };
}

/**
 * Beim Öffnen des Pfads: höchstens ein Pop-up pro Tag. Sind mehrere fällig, wird eines
 * zufällig gewählt, die anderen wandern erneut 3–5 Tage in die Zukunft.
 * @returns {{ state, chapterId: string|null }}
 */
export function pickPopup(index, state, now = new Date(), rng = Math.random) {
  const p = state.progress;
  const today = dayKey(now);
  if (p.lastPopupDay === today) return { state, chapterId: null };
  const due = Object.entries(p.popups || {}).filter(([id, v]) => new Date(v.dueAt) <= now && hasPopupPool(index, state, id)).map(([id]) => id);
  if (!due.length) return { state, chapterId: null };
  const chapterId = due[Math.floor(rng() * due.length)];
  const popups = { ...p.popups };
  delete popups[chapterId];
  for (const id of due) if (id !== chapterId) popups[id] = { dueAt: popupDelay(now, rng) };
  return { state: { ...state, progress: { ...p, popups, lastPopupDay: today } }, chapterId };
}

function popupPool(index, state, chapterId) {
  const ch = index.chapters.find((c) => c.id === chapterId);
  if (!ch) return [];
  return ch.lessons.flatMap((l) => index.lessons.get(l.id)?.cardIds || []).filter((id) => state.cards[id]);
}

function hasPopupPool(index, state, chapterId) {
  return popupPool(index, state, chapterId).length > 0;
}

/** Kurzer Test: 3 zufällige Übungen aus dem gesamten Fragenpool der Geschichte. */
export function buildPopupSession(index, state, chapterId, rng = Math.random) {
  const pool = popupPool(index, state, chapterId);
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const entries = pool.slice(0, 3).map((id, i, a) => ({ cardId: id, mode: 'popup', showSource: false, feld: { n: i + 1, of: a.length } }));
  return { kind: 'popup', lessonId: null, chapterId, entries };
}

/** Nächste Lektion nach `lessonId` im Pfad (für die "… ist freigeschaltet"-Meldung). */
export function nextLessonAfter(index, state, lessonId) {
  const order = trackSequence(index, state.settings.track, lessonId);
  const i = order.indexOf(lessonId);
  return i >= 0 && i + 1 < order.length ? index.lessons.get(order[i + 1]) : null;
}

export function nextChapterAfter(index, state, chapterId) {
  const chs = pathChapters(index, state.settings.track);
  const i = chs.findIndex((c) => c.id === chapterId);
  return i >= 0 ? chs[i + 1] || null : null;
}

export function chapterNumber(index, state, chapterId) {
  return pathChapters(index, state.settings.track).findIndex((c) => c.id === chapterId) + 1;
}

/** Ab wann welche Karten wieder fällig sind (für "Die nächsten Karten werden morgen fällig"). */
export function nextDueDay(index, state, now = new Date()) {
  const today = dayKey(now);
  const days = Object.entries(state.cards).filter(([id, r]) => index.cards.has(id) && r.stage >= 0 && r.due > today).map(([, r]) => r.due).sort();
  if (!days.length) return null;
  const day = days[0];
  return { day, count: days.filter((d) => d === day).length, inDays: daysBetween(today, day) };
}

export function trackOfCard(index, id) {
  return itemTrack(index.cards.get(id).item);
}

export { addDays };
