// Testlevel: http://localhost:5173/testlevel (nur mit `npm run dev`).
//
// Eigene Mini-App mit eigenem Spielstand (IndexedDB-Schlüssel "test-state"), der echte
// Fortschritt bleibt unberührt. Inhalte sind echte Gespräche/Texte (mit ihren Audios), neu
// zusammengestellt, damit alles einmal vorkommt: Zwischenfragen, Monolog, Gespräch mit zwei
// Stimmen, Freitext mit Teilpunkten, Auswahl, Reihenfolge, Lesetext mit Nacherzählen,
// Checkpoint. Über das 🧪-Menü springt man direkt in jede Situation.
//
// main.jsx lädt diese Datei nur im Dev-Server; im Build (Vercel) fällt sie komplett weg.
import { useState } from 'react';
import App from '../App.jsx';
import { CHAPTERS } from '../content/index.js';
import { buildIndex } from '../engine/content.js';
import { initialState, freshProgress, tick, HEART_REGEN_MS } from '../engine/game.js';
import { addDays, dayKey } from '../engine/dates.js';
import { useStore } from '../store.jsx';
import { Sheet } from '../ds/feedback.jsx';
import { Button } from '../ds/Button.jsx';

const ITEMS = Object.fromEntries(CHAPTERS.flatMap((c) => c.lessons.flatMap((l) => l.items || [])).map((i) => [i.id, i]));
const pick = (...ids) => ids.map((id) => ITEMS[id]).filter(Boolean);

export const TEST_CHAPTERS = [
  {
    id: 'test-hoeren', order: 0, title: 'Test: Zuhören', track: 'listen', difficulty: 0,
    lessons: [
      // Gespräch mit 2 Stimmen (Reihenfolge-Frage), Freitext mit Teilpunkten ("Wann fliegen?"),
      // Auswahl mit mehreren richtigen, Monolog mit 2 Zwischenfragen.
      { id: 'test-gespraeche', title: 'Alles einmal', items: pick('q1-flohmarkt-d', 'z3-urlaub-d', 'z6-auto-d', 'z1-umzug-d2') },
      { id: 'test-streit', title: 'Streitgespräch', items: pick('z6-buero-d', 'z6-buero-d2', 'z6-buero-d3') },
      { id: 'test-checkpoint', type: 'checkpoint', title: 'Checkpoint' },
    ],
  },
  {
    id: 'test-lesen', order: 0, title: 'Test: Lesen', track: 'read', difficulty: 0,
    lessons: [{ id: 'test-texte', title: 'Lesetexte', items: pick('l1-kraehen-t', 'l1-bienen-t', 'l1-oktopus-t') }],
  },
];
const INDEX = buildIndex(TEST_CHAPTERS);
const KEY = 'test-state';

/* ---- Szenarien ---------------------------------------------------------------- */
const iso = (daysAgo) => new Date(Date.now() - daysAgo * 86400000).toISOString();
const today = () => dayKey(new Date());

function fresh() {
  const s = initialState();
  return { ...s, onboarded: true, settings: { ...s.settings, track: 'both', dailyGoal: 3, sounds: true }, progress: freshProgress() };
}

/** Karten als gemeistert markieren; due: Tage ab heute (0 = heute fällig). */
function learned(s, lessonIds, due, { except = [] } = {}) {
  const cards = { ...s.cards };
  const lessonsDone = { ...s.progress.lessonsDone };
  for (const lid of lessonIds) {
    const info = INDEX.lessons.get(lid);
    for (const id of info.cardIds) {
      if (except.includes(id)) continue;
      cards[id] = { stage: 2, due: addDays(today(), due), first: iso(4), last: iso(4), reps: 3, lapses: 0, history: [{ at: iso(4), g: 'good', m: 'new' }] };
    }
    if (!info.cardIds.some((id) => except.includes(id))) lessonsDone[lid] = iso(4);
  }
  return { ...s, cards, progress: { ...s.progress, lessonsDone } };
}

const ALL_LEVELS = ['test-gespraeche', 'test-streit', 'test-texte'];

const SCENARIOS = [
  { id: 'neu', title: 'Neu anfangen', desc: 'Nichts gelernt. Hören mit Zwischenfragen, alle Fragetypen, richtig/teilweise/falsch, zweiter Versuch, Herz verlieren, Teil-Ring.',
    make: () => fresh() },
  { id: 'faellig', title: 'Alles fällig', desc: 'Alle Level erledigt und heute fällig: Zwischenscreen „Prüfen wir …“, „Stelle anhören“ (gelb), Intervall-Schritt nach richtiger Wiederholung.',
    make: () => learned(fresh(), ALL_LEVELS, 0) },
  { id: 'erledigt', title: 'Alles erledigt, nichts fällig', desc: 'Antippen eines Levels zeigt die Auswahl: Teil wählen → Hören + Fragen / Nur Fragen / Nur hören.',
    make: () => learned(fresh(), ALL_LEVELS, 5) },
  { id: 'kapitel', title: 'Kurz vor Kapitelende', desc: 'Nur der letzte Teil vom Streitgespräch fehlt: Teil geschafft → Level fertig → Checkpoint frei.',
    make: () => learned(learned(fresh(), ['test-gespraeche', 'test-texte'], 5), ['test-streit'], 5, { except: INDEX.lessons.get('test-streit').cardIds.filter((id) => id.startsWith('z6-buero-d3')) }) },
  { id: 'popup', title: 'Pop-up-Test', desc: 'Kapitel erledigt, Pop-up „Kurz gefragt“ ist fällig und erscheint beim Öffnen des Pfads.',
    make: () => {
      const s = learned(fresh(), ALL_LEVELS, 5);
      return { ...s, progress: { ...s.progress, lessonsDone: { ...s.progress.lessonsDone, 'test-checkpoint': iso(4) }, chaptersDone: { 'test-hoeren': iso(4) }, popups: { 'test-hoeren': { dueAt: iso(1) } }, lastPopupDay: null } };
    } },
  { id: 'tagesziel', title: 'Tagesziel geschafft', desc: '„Für heute ist alles gemerkt“ mit freiwilliger Runde.',
    make: () => {
      const s = learned(fresh(), ALL_LEVELS, 5);
      return { ...s, progress: { ...s.progress, doneToday: 3, doneTodayDay: today(), lastActiveDay: today(), streak: 1, longestStreak: 1 } };
    } },
  { id: 'herzen', title: 'Herzen leer', desc: 'Neues Level antippen → „Keine Aufmerksamkeit mehr“, Wiederholungen gehen trotzdem.',
    make: () => {
      const s = learned(fresh(), ['test-gespraeche'], 0);
      return { ...s, progress: { ...s.progress, hearts: 0, heartsRefillAt: new Date(Date.now() + HEART_REGEN_MS).toISOString() } };
    } },
  { id: 'meilenstein', title: 'Streak-Meilenstein', desc: 'Streak steht auf 6 (gestern geübt). Eine Frage beantworten → 7-Tage-Feier und unendliche Aufmerksamkeit.',
    make: () => {
      const s = fresh();
      return { ...s, progress: { ...s.progress, streak: 6, longestStreak: 6, lastActiveDay: addDays(today(), -1) } };
    } },
  { id: 'gerissen', title: 'Streak gerissen', desc: 'Letzte Übung vor 3 Tagen: „Gestern war Pause. Macht nichts.“',
    make: () => {
      const s = learned(fresh(), ['test-gespraeche'], 0);
      return { ...s, progress: { ...s.progress, streak: 5, longestStreak: 9, lastActiveDay: addDays(today(), -3) } };
    } },
  { id: 'onboarding', title: 'Onboarding', desc: 'Erster Start der App.', make: () => initialState() },
];

/* ---- Test-Menü ------------------------------------------------------------------ */
function DevPanel({ restart }) {
  const { update, dev } = useStore();
  const { hints, setHints } = dev;
  const [open, setOpen] = useState(false);
  const apply = (sc) => {
    update(() => tick(sc.make()));
    setOpen(false);
    restart();
  };
  return (
    <>
      {!open && <button type="button" onClick={() => setOpen(true)} aria-label="Test-Menü"
        style={{ position: 'absolute', left: 10, bottom: 'calc(96px + env(safe-area-inset-bottom))', zIndex: 35, width: 44, height: 44, borderRadius: '50%',
          border: '2px dashed var(--spur-amber-shade)', background: 'var(--accent-xp-soft)', fontSize: 20, cursor: 'pointer', boxShadow: 'var(--shadow-raised)' }}>
        🧪
      </button>}
      <Sheet open={open} title="Testlevel" onClose={() => setOpen(false)}>
        <p style={{ font: 'var(--type-body)', color: 'var(--text-muted)', marginTop: -6 }}>
          Eigener Spielstand, dein echter Fortschritt bleibt unberührt. Nur im Dev-Server, nie im Deployment.
        </p>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, font: 'var(--type-body)', fontWeight: 600, cursor: 'pointer' }}>
          <input type="checkbox" checked={hints} onChange={(e) => setHints(e.target.checked)} style={{ width: 20, height: 20 }} />
          Spickzettel bei Fragen (Lösung, wie „teilweise“ geht)
        </label>
        <div className="stack" style={{ gap: 10 }}>
          {SCENARIOS.map((sc) => (
            <button key={sc.id} type="button" onClick={() => apply(sc)}
              style={{ display: 'flex', flexDirection: 'column', gap: 2, textAlign: 'left', padding: '12px 14px', borderRadius: 'var(--radius-md)', cursor: 'pointer',
                border: '2px solid var(--border-default)', background: 'var(--surface-card)', color: 'var(--text-ink)' }}>
              <span style={{ font: 'var(--type-body)', fontWeight: 700 }}>{sc.title}</span>
              <span style={{ font: 'var(--type-label)', fontWeight: 500, color: 'var(--text-muted)' }}>{sc.desc}</span>
            </button>
          ))}
        </div>
        <Button variant="ghost" size="md" full onClick={() => { window.location.href = '/'; }}>Zur echten App</Button>
      </Sheet>
    </>
  );
}

export function TestApp() {
  const [hints, setHints] = useState(() => { try { return localStorage.getItem('spur-test-hints') !== '0'; } catch { return true; } });
  const toggle = (v) => { setHints(v); try { localStorage.setItem('spur-test-hints', v ? '1' : '0'); } catch { /* egal */ } };
  return (
    <App index={INDEX} storageKey={KEY} dev={{ hints, setHints: toggle }} initial={fresh} DevPanel={DevPanel} />
  );
}
