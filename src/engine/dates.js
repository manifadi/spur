// Kalendertage immer in Ortszeit als 'YYYY-MM-DD' — Streak und Fälligkeit
// hängen am Kalendertag, nicht an 24-Stunden-Fenstern.

const pad = (n) => String(n).padStart(2, '0');

export function dayKey(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function fromKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(key, n) {
  const d = fromKey(key);
  d.setDate(d.getDate() + n);
  return dayKey(d);
}

/** Ganze Kalendertage von a nach b (b − a). */
export function daysBetween(a, b) {
  return Math.round((fromKey(b) - fromKey(a)) / 86400000);
}

export function endOfDay(date = new Date()) {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

/** Wochentag-Index Montag = 0 … Sonntag = 6. */
export function weekdayMon(key) {
  return (fromKey(key).getDay() + 6) % 7;
}
