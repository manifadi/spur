import { addDays, dayKey } from './dates.js';

/**
 * Spaced Repetition nach der Ebbinghausschen Vergessenskurve: gestufte
 * Intervalle in Tagen. "Gut erinnert" → eine Stufe weiter, "kaum etwas" →
 * zurück auf Stufe 0, "teilweise" → Stufe bleibt (gleicher Abstand noch einmal).
 * Neue Karten haben Stufe -1 und sind sofort fällig.
 */
export const INTERVALS = [1, 2, 4, 8, 16, 30, 60];
export const MAX_STAGE = INTERVALS.length - 1;
export const NEW_STAGE = -1;

export const GRADES = { good: 'good', partial: 'partial', poor: 'poor' };

/** Federn: Teilnahme wird nie mit 0 belohnt. */
export const XP = { good: 10, partial: 5, poor: 2 };

export function nextStage(stage, grade) {
  if (grade === 'good') return Math.min(stage + 1, MAX_STAGE);
  if (grade === 'partial') return Math.max(stage, 0);
  return 0;
}

export function isNew(record) {
  return !record || record.stage === NEW_STAGE;
}

export function isDue(record, today = dayKey()) {
  if (!record) return false;
  if (record.stage === NEW_STAGE) return true;
  return record.due <= today;
}

/**
 * Wendet eine Bewertung an. `reschedule: false` protokolliert nur (freiwilliges
 * Üben einer noch nicht fälligen Karte) — außer bei "kaum etwas": dass etwas
 * vergessen wurde, ist eine echte Information und setzt die Karte zurück.
 */
export function applyGrade(record, grade, now = new Date(), { reschedule = true } = {}) {
  const today = dayKey(now);
  const at = now.toISOString();
  const prev = record || { stage: NEW_STAGE, due: today, first: null, last: null, reps: 0, lapses: 0, history: [] };
  const history = [...(prev.history || []), { at, g: grade }].slice(-20);
  const base = {
    ...prev,
    first: prev.first || at,
    last: at,
    reps: prev.reps + 1,
    lapses: prev.lapses + (grade === 'poor' && prev.stage >= 0 ? 1 : 0),
    history,
  };
  if (!reschedule && grade !== 'poor') return base;
  const stage = nextStage(prev.stage, grade);
  return { ...base, stage, due: addDays(today, INTERVALS[stage]) };
}
