// Deutsche Zahlwörter für kurze Sätze ("Drei Karten sind heute fällig.").
const WORDS = ['null', 'eine', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun', 'zehn', 'elf', 'zwölf'];

export function numWord(n) {
  return n >= 0 && n < WORDS.length ? WORDS[n] : String(n);
}

export function cap(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function cards(n) {
  return n === 1 ? 'Karte' : 'Karten';
}

export function days(n) {
  return `${n} ${n === 1 ? 'Tag' : 'Tage'}`;
}

/** "1 Stunde 48 Minuten" */
export function formatDuration(ms) {
  const total = Math.max(0, Math.ceil(ms / 60000));
  if (total <= 0) return 'gleich';
  const h = Math.floor(total / 60);
  const m = total % 60;
  const hs = h ? `${h} ${h === 1 ? 'Stunde' : 'Stunden'}` : '';
  const ms_ = m ? `${m} ${m === 1 ? 'Minute' : 'Minuten'}` : '';
  return [hs, ms_].filter(Boolean).join(' ');
}

export function daysAgoText(n) {
  if (n <= 0) return 'heute';
  if (n === 1) return 'gestern';
  return `vor ${n} Tagen`;
}
