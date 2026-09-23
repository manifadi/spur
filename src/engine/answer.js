// Antwortprüfung für Freitext (Zuhören): Groß-/Kleinschreibung und Umlaute
// normalisieren, dann Schlüsselwörter mit Levenshtein-Distanz ≤ 1 suchen.
// Eine Frage kann mehrere Details verlangen: `answers` ist eine Liste von
// Gruppen, jede Gruppe eine Liste gleichwertiger Schreibweisen.

export function normalize(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Levenshtein mit Vertauschung benachbarter Buchstaben als einem Schritt ("Jonsa" → "Jonas"). */
export function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev2 = null;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (prev2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) cur[j] = Math.min(cur[j], prev2[j - 2] + 1);
    }
    prev2 = prev;
    prev = cur;
  }
  return prev[b.length];
}

function tokenMatches(token, key) {
  if (token === key) return true;
  // Kurze Wörter und Zahlen müssen exakt stimmen ("30" ≠ "40").
  if (key.length <= 3 || /^\d+$/.test(key)) return false;
  if (levenshtein(token, key) <= 1) return true;
  // Komposita: "Lieferwagen" enthält "wagen", "Bruders" enthält "bruder".
  return key.length >= 5 && token.includes(key);
}

export function matchesKey(normInput, tokens, key) {
  const k = normalize(key);
  if (!k) return false;
  if (k.includes(' ')) {
    if (normInput.includes(k)) return true;
    // Mehrwortige Antworten: jedes Wort muss unscharf vorkommen.
    return k.split(' ').every((part) => tokens.some((t) => tokenMatches(t, part)));
  }
  return tokens.some((t) => tokenMatches(t, k));
}

/** @returns {{grade: 'good'|'partial'|'poor', hits: number, total: number, matched: boolean[]}} */
export function gradeListen(input, answers) {
  const normInput = normalize(input);
  const tokens = normInput.split(' ').filter(Boolean);
  const groups = answers.map((g) => (Array.isArray(g) ? g : [g]));
  const matched = groups.map((g) => g.some((key) => matchesKey(normInput, tokens, key)));
  const hits = matched.filter(Boolean).length;
  const total = groups.length;
  return { grade: gradeFromRatio(hits, total), hits, total, matched };
}

/** Lesen: Selbstbewertung über abgehakte Kernpunkte. */
export function gradeKeyPoints(hits, total) {
  return { grade: gradeFromRatio(hits, total), hits, total };
}

export function gradeFromRatio(hits, total) {
  if (total <= 0) return 'poor';
  const r = hits / total;
  if (r >= 0.75) return 'good';
  if (r >= 0.4) return 'partial';
  return 'poor';
}
