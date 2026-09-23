// Entscheidet, ob Miro heute erinnern soll. Wird von der App und vom
// Service Worker genutzt — alles lokal, ohne Push-Server.
import { dayKey } from './dates.js';

const WINDOW_MS = 4 * 60 * 60 * 1000; // nur in den 4 Stunden nach der gewählten Uhrzeit
const WORDS = ['', 'Eine', 'Zwei', 'Drei', 'Vier', 'Fünf', 'Sechs', 'Sieben', 'Acht', 'Neun', 'Zehn', 'Elf', 'Zwölf'];

export function dueCount(state, now = new Date()) {
  const today = dayKey(now);
  return Object.values(state?.cards || {}).filter((r) => r.stage >= 0 && r.due <= today).length;
}

export function reminderDue(state, lastReminderDay, now = new Date()) {
  const time = state?.settings?.reminder;
  if (!time || !state.onboarded) return false;
  const today = dayKey(now);
  if (lastReminderDay === today) return false;
  const p = state.progress || {};
  if (p.doneTodayDay === today && p.doneToday > 0) return false;
  const [h, m] = time.split(':').map(Number);
  const at = new Date(now);
  at.setHours(h, m, 0, 0);
  return now >= at && now - at < WINDOW_MS;
}

/** Text in Miros Stimme — nie mit Schuldgefühl oder Countdown. */
export function reminderText(n) {
  const body = n > 0
    ? `${WORDS[n] || n} ${n === 1 ? 'Karte ist' : 'Karten sind'} fällig. Zwei Minuten reichen.`
    : 'Ein neues Gespräch wartet. Zwei Minuten reichen.';
  return { title: 'Ich hab mir heute zwei Dinge gemerkt.', body };
}
