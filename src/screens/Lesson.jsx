import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store.jsx';
import { Icon } from '../ds/Icon.jsx';
import { Button } from '../ds/Button.jsx';
import { SpeakButton } from '../ds/IconButton.jsx';
import { Badge, Card, TextField } from '../ds/core.jsx';
import { FeedbackPanel, Mascot, Sheet, SpeechBubble } from '../ds/feedback.jsx';
import { LessonHeader } from '../ds/progress.jsx';
import { IntervalStep } from './IntervalStep.jsx';
import { gradeKeyPoints, gradeListen, gradeMatch, gradeSequence } from '../engine/answer.js';
import { commitAnswer, isInfinite, isPartDone, lessonParts, markLessonDone } from '../engine/game.js';
import { XP, INTERVALS, applyGrade } from '../engine/srs.js';
import { dayKey, daysBetween } from '../engine/dates.js';
import { readSeconds } from '../engine/content.js';
import { speakSegments, stopSpeaking } from '../lib/tts.js';
import { dialogSpeakers, deviceSegments, answerSegments, personByName, segmentWeights } from '../lib/voice.js';
import { hasAudio, playItem } from '../lib/audio.js';
import { sounds } from '../lib/sound.js';
import { daysAgoText, numWord } from '../lib/format.js';

const body = { flex: 1, minHeight: 0, overflowY: 'auto', padding: '10px var(--gutter-screen) 16px', display: 'flex', flexDirection: 'column', gap: 16 };
const lockBox = { display: 'flex', alignItems: 'center', gap: 12, background: 'var(--surface-sunken)', border: '2px solid var(--border-default)', borderRadius: 'var(--radius-md)', padding: '12px 14px' };

/** Bildschirm für die Teilübung selbst (nach Hören/Lesen des Originals). */
function exercisePhase(card) {
  return { recall: 'question', retell: 'read-recall', match: 'match', sequence: 'sequence' }[card.kind] || 'question';
}

function firstPhase(entry, card, prev, prevCard) {
  // Neue Gespräche: erst nur zuhören, neue Texte: erst lesen. Danach die Übung.
  // Wiederholungen und weitere Übungen desselben Feldes starten direkt bei der Übung.
  if (entry.showSource) return card.track === 'read' ? 'read-text' : 'listen-audio';
  // Fragen zu einer früheren Geschichte: bei jedem Wechsel der Geschichte erst ein Zwischenscreen.
  if (entry.fromMemory && (!prev || !prev.fromMemory || prevCard?.item.id !== card.item.id)) return 'intro';
  return exercisePhase(card);
}

/** Stabile, aber gemischte Reihenfolge pro Karte (Antwort steht nicht immer an derselben Stelle). */
function seededShuffle(list, seed) {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { h = (h * 1103515245 + 12345) >>> 0; const j = h % (i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

function daysSinceFirst(rec) {
  if (!rec?.first) return 0;
  return daysBetween(dayKey(new Date(rec.first)), dayKey());
}

function LockHint({ children }) {
  return (
    <div className="collapsible kb-collapse">
      <div>
        <div style={lockBox}>
          <span style={{ color: 'var(--text-subtle)', display: 'inline-flex' }}><Icon name="lock" /></span>
          <span style={{ font: 'var(--type-body)', color: 'var(--text-muted)' }}>{children}</span>
        </div>
      </div>
    </div>
  );
}

function CardBadge({ entry, card, seenBefore }) {
  if (entry.mode === 'retry') return <Badge tone={card.track === 'read' ? 'read' : 'listen'} icon="rotate-ccw" style={{ alignSelf: 'flex-start' }}>Zweiter Versuch</Badge>;
  if (card.ex?.followUp && entry.mode !== 'source') return <Badge tone="listen" icon="message-circle" style={{ alignSelf: 'flex-start' }}>Wiedersehen</Badge>;
  if (entry.mode === 'source') return <Badge tone={card.track} icon={card.track === 'read' ? 'book-open' : 'ear'} style={{ alignSelf: 'flex-start' }}>{card.track === 'read' ? 'Nur lesen' : 'Nur hören'}</Badge>;
  if (entry.mode === 'practice' && entry.fromMemory && entry.feld) return <Badge tone={card.track === 'read' ? 'read' : 'listen'} icon="history" style={{ alignSelf: 'flex-start' }}>Aus dem Gedächtnis</Badge>;
  if (entry.mode === 'practice' && entry.feld) return <Badge tone={card.track === 'read' ? 'read' : 'listen'} icon="rotate-ccw" style={{ alignSelf: 'flex-start' }}>Teil nochmal</Badge>;
  if (entry.mode === 'popup') return <Badge tone="amber" icon="sparkles" style={{ alignSelf: 'flex-start' }}>Kurzer Test</Badge>;
  if (entry.mode === 'replay') return <Badge tone={card.track} icon={card.track === 'read' ? 'book-open' : 'ear'} style={{ alignSelf: 'flex-start' }}>{card.track === 'read' ? 'Nochmal lesen' : 'Nochmal hören'}</Badge>;
  if (entry.mode === 'new' && !seenBefore) {
    return card.track === 'read'
      ? <Badge tone="read" icon="book-open" style={{ alignSelf: 'flex-start' }}>Neuer Text</Badge>
      : <Badge tone="listen" icon="ear" style={{ alignSelf: 'flex-start' }}>Neue Karte</Badge>;
  }
  return <Badge tone="amber" icon="history" style={{ alignSelf: 'flex-start' }}>Erinnerst du dich noch?</Badge>;
}

/** "Teil 2 · Frage 1 von 3" (Teil nur, wenn das Level mehrere Teile hat). */
function feldLabel(feld) {
  const q = `Frage ${feld.n} von ${feld.of}`;
  return feld.parts > 1 ? `Teil ${feld.part} · ${q}` : q;
}

function FeldCounter({ feld, style }) {
  return (
    <span aria-live="polite" style={{ font: 'var(--type-label)', fontWeight: 700, color: 'var(--text-muted)', whiteSpace: 'nowrap', ...style }}>
      {feldLabel(feld)}
    </span>
  );
}

/** Badge links, Zähler "Teil X · Frage Y von Z" rechts. */
function ExerciseTop({ entry, card, seenBefore }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
      <CardBadge entry={entry} card={card} seenBefore={seenBefore} />
      {entry.feld && <FeldCounter feld={entry.feld} />}
    </div>
  );
}

/** Überschrift vor dem Original: "Teil 2 von 4 · Der Einzug". */
function PartLine({ entry, card, tone }) {
  if (!entry.feld || entry.feld.parts < 2) return null;
  return (
    <span className="overline" style={{ color: `var(--track-${tone}-shade)` }}>
      Teil {entry.feld.part} von {entry.feld.parts} · {card.item.title}
    </span>
  );
}

/** Dialog als Zitat oder mit Sprechernamen. */
function DialogText({ item }) {
  if (!item.lines) return <p style={{ font: 'var(--type-body-l)', color: 'var(--text-ink)' }}>„{item.text}“</p>;
  return (
    <div className="stack" style={{ gap: 10 }}>
      {item.lines.map((l, i) => (
        <p key={i} style={{ font: 'var(--type-body-l)', color: 'var(--text-ink)' }}>
          <span style={{ fontWeight: 700, color: 'var(--track-listen-shade)' }}>{l.who}: </span>{l.text}
        </p>
      ))}
    </div>
  );
}

/**
 * Vorlesen mit Fehlerzustand (4e). Bevorzugt die mitgelieferten Aufnahmen (eine
 * Stimme pro Figur, Archetyp-Tempo/-Tonhöhe); fehlt eine oder klappt es nicht,
 * liest die Gerätestimme mit dem pitch/rate-Profil der jeweiligen Figur.
 */
function useSpeech(item, auto = false, onQuiz = null) {
  const [playing, setPlaying] = useState(false);
  // Fortschritt 0–1 über alle gespielten Abschnitte, gewichtet nach Textlänge.
  const [progress, setProgress] = useState(0);
  const weights = useRef({ list: [], total: 1 });
  const onProgress = (i, frac) => {
    const { list, total } = weights.current;
    let done = 0;
    for (let k = 0; k < i && k < list.length; k++) done += list[k];
    const v = Math.min(1, (done + (list[i] || 0) * frac) / total);
    setProgress((cur) => (Math.abs(cur - v) > 0.002 || v === 1 ? v : cur));
  };
  // Zwischenfragen: Ohne Handler läuft die Wiedergabe einfach weiter.
  const quizRef = useRef(onQuiz);
  quizRef.current = onQuiz;
  const quiz = (n, resume) => (quizRef.current ? quizRef.current(n, resume) : resume());
  const [error, setError] = useState(false);
  const [who, setWho] = useState(null);
  const stop = useRef(() => {});
  const done = () => { setPlaying(false); setWho(null); };
  const viaDevice = (manual, only) => {
    const segs = deviceSegments(item);
    stop.current = speakSegments(only ? segs.filter((_, i) => only.includes(i)) : segs, {
      onSegment: (w) => setWho(w),
      onProgress,
      onQuiz: quiz,
      onEnd: done,
      onError: () => { done(); if (manual) setError(true); },
    });
  };
  // only: nur diese Abschnitte (z. B. "Stelle anhören"), sonst alles.
  const start = (manual = true, only = null) => {
    stop.current();
    setError(false);
    setPlaying(true);
    const all = segmentWeights(item);
    const list = only ? all.filter((_, i) => only.includes(i)) : all;
    weights.current = { list, total: list.reduce((a, b) => a + b, 0) || 1 };
    setProgress(0);
    if (!hasAudio(item.id)) return viaDevice(manual, only);
    stop.current = playItem(item.id, {
      only,
      onSegment: (w) => setWho(w),
      onProgress,
      onQuiz: quiz,
      onEnd: done,
      onBlocked: done, // Autoplay gesperrt (iOS): Antippen genügt
      onError: () => viaDevice(manual, only),
    });
    return undefined;
  };
  const stopNow = () => { stop.current(); done(); };
  const toggle = () => { if (playing) stopNow(); else start(true); };
  useEffect(() => {
    if (auto) start(false);
    return () => { stop.current(); stopSpeaking(); };
  }, [item.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return { playing, error, who, progress, toggle, start, stop: stopNow, retry: () => start(true) };
}

function TtsError({ onRetry, onShowText }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 16px', borderRadius: 'var(--radius-md)', background: 'var(--surface-sunken)', border: '2px solid var(--border-default)', textAlign: 'left' }}>
      <span style={{ color: 'var(--text-muted)', display: 'inline-flex' }}><Icon name="volume-x" /></span>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
        <span style={{ font: 'var(--type-body)', fontWeight: 700, color: 'var(--text-ink)' }}>Vorlesen klappt gerade nicht.</span>
        <span style={{ font: 'var(--type-body)', color: 'var(--text-muted)' }}>{onShowText ? 'Versuch es nochmal — oder lies das Gespräch ausnahmsweise selbst.' : 'Lies den Text einfach selbst.'}</span>
        <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Button variant="secondary" size="sm" icon="rotate-ccw" onClick={onRetry}>Nochmal versuchen</Button>
          {onShowText && <Button variant="ghost" size="sm" onClick={onShowText}>Text lesen</Button>}
        </span>
      </span>
    </div>
  );
}

/* ---- Figur als Avatar (Initialen), aktiv sprechend = sanftes Atmen ---------- */
const NEUTRAL_TONE = { solid: 'var(--spur-ink-muted)', soft: 'var(--surface-sunken)', shade: 'var(--text-muted)', fg: '#fff' };

/** Rundes Porträt mit Initialen in der Farbe der Figur (unten mit "Kante" wie die Knöpfe). */
export function PersonAvatar({ person, active = false, size = 64, dim = false, pulse = true }) {
  const t = person.tone || NEUTRAL_TONE;
  return (
    <span style={{ position: 'relative', width: size, height: size, flex: '0 0 auto', display: 'inline-flex',
      transform: active ? 'scale(1.06)' : 'scale(1)', transition: 'transform var(--dur-base) var(--ease-bounce)' }}>
      {active && pulse && <span aria-hidden="true" className="rm-static" style={{ position: 'absolute', inset: -8, borderRadius: '50%', border: `3px solid ${t.solid}`, animation: 'spur-speak 900ms var(--ease-sine) infinite alternate' }} />}
      <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: active ? t.solid : t.soft, color: active ? t.fg : t.shade, opacity: dim ? 0.55 : 1,
        boxShadow: `0 ${Math.max(3, Math.round(size / 16))}px 0 ${active ? t.shade : 'var(--border-default)'}`,
        font: 'var(--type-title)', fontSize: Math.round(size * 0.34), letterSpacing: '.02em',
        transition: 'background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out), opacity var(--dur-fast) var(--ease-out)' }}>
        {person.initials}
      </span>
    </span>
  );
}

function SpeakerAvatar({ speaker, active, size, dim }) {
  return (
    <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, width: size + 28 }}>
      <PersonAvatar person={speaker} active={active} size={size} dim={dim} />
      <span style={{ font: 'var(--type-label)', fontWeight: 700, color: active ? 'var(--text-ink)' : 'var(--text-muted)', textAlign: 'center', lineHeight: 1.25 }}>
        {speaker.name}
        {speaker.relation && <span style={{ display: 'block', fontWeight: 500, color: 'var(--text-subtle)' }}>{speaker.relation}</span>}
      </span>
    </span>
  );
}

const MAX_PLAYS = 2;

/* ---- Spickzettel (nur im Testlevel, /testlevel) ------------------------------------
   Zeigt die Lösung und wie man "teilweise" auslöst. In der echten App ist dev null. */
function DevHint(props) {
  // Im Build fällt der Spickzettel komplett weg.
  return import.meta.env.DEV ? <DevHintInner {...props} /> : null;
}

function DevHintInner({ ex, kind }) {
  const { dev } = useStore();
  if (!dev?.hints || !ex) return null;
  let lines;
  if (kind === 'match') {
    lines = [`Richtig: ${ex.correct.join(' · ')}`, ex.correct.length > 1 ? `Teilweise: nur „${ex.correct[0]}“ wählen` : 'Falsch: etwas anderes wählen'];
  } else if (kind === 'sequence') {
    lines = [`Reihenfolge: ${ex.events.map((e, i) => `${i + 1}. ${e}`).join('  ')}`, 'Teilweise: die ersten zwei richtig, den Rest vertauschen'];
  } else if (kind === 'retell') {
    lines = ['Kernpunkte danach abhaken: alle = gut, etwa die Hälfte = teilweise, keiner = falsch'];
  } else {
    const first = (ex.answers || []).map((g) => g[0]);
    lines = [`Lösung: ${ex.solution}`, first.length > 1 ? `Teilweise: nur „${first[0]}“` : 'Falsch: z. B. „weiß nicht“'];
  }
  return (
    <div style={{ border: '2px dashed var(--spur-amber-shade)', borderRadius: 'var(--radius-md)', background: 'var(--accent-xp-soft)', padding: '8px 12px',
      font: 'var(--type-label)', fontWeight: 600, color: 'var(--text-ink)', display: 'flex', flexDirection: 'column', gap: 2 }}>
      <span className="overline" style={{ color: 'var(--spur-amber-shade)' }}>Test · Spickzettel</span>
      {lines.map((l) => <span key={l}>{l}</span>)}
    </div>
  );
}

/* ---- Zwischenfrage beim Hören --------------------------------------------------
   Das Audio hält an, die Frage fährt von unten hoch. Nach dem Prüfen sieht man kurz,
   ob es richtig war, dann fährt das Sheet wieder hinunter und es geht weiter.
   Zählt nicht für Intervalle, Herzen oder Federn: nur ein Aufmerksamkeits-Check. */
const QUIZ_RESULT = {
  good: { state: 'correct', icon: 'check-circle-2', color: 'var(--spur-green-shade)', title: 'Richtig!', btn: 'correct', wait: 1700 },
  partial: { state: 'partial', icon: 'history', color: 'var(--badge-amber-fg)', title: 'Fast.', btn: 'amber', wait: 3200 },
  poor: { state: 'wrong', icon: 'rotate-ccw', color: 'var(--spur-coral-shade)', title: 'Nicht ganz.', btn: 'wrong', wait: 3200 },
};

function QuizBody({ quiz, sound, onDone }) {
  const [answer, setAnswer] = useState('');
  const [grade, setGrade] = useState(null);
  const box = useRef(null);
  const r = grade && QUIZ_RESULT[grade];
  // Fokus erst, wenn das Sheet oben ist (sonst springt die Animation mit der Tastatur).
  useEffect(() => {
    const t = setTimeout(() => box.current?.querySelector('textarea')?.focus({ preventScroll: true }), 360);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    if (!r) return undefined;
    const t = setTimeout(onDone, r.wait);
    return () => clearTimeout(t);
  }, [grade]); // eslint-disable-line react-hooks/exhaustive-deps
  const check = (skip = false) => {
    if (grade) return;
    const g = skip ? 'poor' : gradeListen(answer, quiz.answers).grade;
    document.activeElement?.blur?.();
    setGrade(g);
    if (sound) sounds[g]?.();
    if (g === 'good' && navigator.vibrate) try { navigator.vibrate(12); } catch { /* ignore */ }
  };
  return (
    <div ref={box} className="stack" style={{ gap: 14 }}>
      <h3 style={{ font: 'var(--type-headline)', color: 'var(--text-ink)', textWrap: 'pretty' }}>{quiz.prompt}</h3>
      {!grade && <DevHint ex={quiz} kind="recall" />}
      <TextField value={answer} onChange={(e) => setAnswer(e.target.value)} rows={2} state={r ? r.state : 'default'} disabled={!!grade}
        placeholder="Kurz aus dem Kopf …" enterKeyHint="done"
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (answer.trim()) check(); } }} />
      {r ? (
        <div key="result" className="a-fade stack" style={{ gap: 12 }} role="status" aria-live="polite">
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: r.color, font: 'var(--type-headline)' }}>
            <Icon name={r.icon} size={24} strokeWidth={2.4} />{r.title}
          </span>
          {grade !== 'good' && <p style={{ font: 'var(--type-body)', fontSize: 'var(--text-body-l)', color: 'var(--text-ink)', marginTop: -4 }}>Gesucht war: {quiz.solution}</p>}
          <Button variant={r.btn} full icon="play" onClick={onDone}>Weiter hören</Button>
        </div>
      ) : (
        <div key="ask" className="stack" style={{ gap: 4 }}>
          <Button full disabled={!answer.trim()} onClick={() => check()}>Prüfen</Button>
          <Button variant="ghost" size="md" full onClick={() => check(true)}>Weiß ich nicht</Button>
        </div>
      )}
    </div>
  );
}

/* ---- Play-Knopf mit Fortschrittsring ---------------------------------------------- */
function PlayButton({ playing, paused, disabled, again, progress, showRing, onClick, size = 88 }) {
  const ring = size + 22;
  const r = ring / 2 - 4;
  const c = 2 * Math.PI * r;
  return (
    <span style={{ position: 'relative', width: ring, height: ring, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>
      <svg aria-hidden="true" width={ring} height={ring} style={{ position: 'absolute', inset: 0, transform: 'rotate(-90deg)', opacity: showRing ? 1 : 0, transition: 'opacity var(--dur-base) var(--ease-out)' }}>
        <circle cx={ring / 2} cy={ring / 2} r={r} fill="none" stroke="var(--surface-locked)" strokeWidth={6} />
        <circle cx={ring / 2} cy={ring / 2} r={r} fill="none" stroke="var(--track-listen)" strokeWidth={6} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - progress)} opacity={progress > 0.005 ? 1 : 0} />
      </svg>
      {/* Großer blauer Lautsprecher-Knopf wie bei Duolingo; Drücken senkt ihn um seine Kante (.btn). */}
      <button type="button" onClick={onClick} disabled={disabled} className="btn btn-icon"
        aria-label={playing ? 'Wiedergabe stoppen' : again ? 'Nochmal abspielen' : 'Gespräch abspielen'}
        style={{ '--btn-bg': 'var(--track-listen)', '--btn-edge': 'var(--track-listen-shade)', '--btn-fg': '#fff', '--btn-r': '50%', '--edge-depth': '6px',
          width: size, height: size, marginTop: -6, gap: 4 }}>
        <span key={playing ? (paused ? 'pause' : 'eq') : again ? 'again' : 'play'} className="a-fade" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          {playing && paused
            ? <Icon name="pause" size={34} strokeWidth={2.4} fill="currentColor" />
            : playing
            ? [0, 140, 280, 420].map((d) => <span key={d} className="rm-static eq-bar" style={{ width: 5, height: 16, background: '#fff', animationDelay: `${d}ms` }} />)
            : <Icon name={again ? 'rotate-ccw' : 'play'} size={34} strokeWidth={2.6} fill={again ? 'none' : 'currentColor'} style={again ? undefined : { marginLeft: 4 }} />}
        </span>
      </button>
    </span>
  );
}

/* ---- Schritt 1: Nur zuhören (neue Karten) ------------------------------------
   Kein Text, keine Frage — nur die Stimmen. Höchstens zwei Wiedergaben, "Weiter"
   erst nach der ersten. Bei fälligen Wiederholungen gibt es diesen Schritt nicht. */
function ListenOnly({ entry, card, onNext, sourceOnly = false }) {
  const { state } = useStore();
  const sound = state.settings.sounds;
  // "Nur hören": ohne Zwischenfragen, beliebig oft.
  const quizzes = sourceOnly ? [] : card.item.popQuiz || [];
  const maxPlays = sourceOnly ? Infinity : MAX_PLAYS;
  const [pop, setPop] = useState(null); // { n, resume } während eine Zwischenfrage offen ist
  const answered = useRef(new Set()); // beim zweiten Hören nicht nochmal fragen
  const speech = useSpeech(card.item, false, (n, resume) => {
    if (!quizzes[n] || answered.current.has(n)) { resume(); return; }
    if (sound) sounds.pop();
    setPop({ n, resume });
  });
  const closeQuiz = () => {
    if (!pop) return;
    answered.current.add(pop.n);
    const { resume } = pop;
    setPop(null);
    // Erst weiterspielen, wenn das Sheet unten ist.
    setTimeout(resume, 320);
  };
  const [plays, setPlays] = useState(0);
  const [heard, setHeard] = useState(false);
  const [showText, setShowText] = useState(false);
  const speakers = dialogSpeakers(card.item);
  const wasPlaying = useRef(false);
  useEffect(() => {
    if (wasPlaying.current && !speech.playing) setHeard(true);
    wasPlaying.current = speech.playing;
  }, [speech.playing]);
  const left = maxPlays - plays;
  const play = () => {
    if (speech.playing) { speech.stop(); return; }
    if (left <= 0) return;
    setPlays((n) => n + 1);
    speech.start(true);
  };
  const activeName = speech.playing && !pop ? (speech.who || (speakers.length === 1 ? speakers[0].name : null)) : null;
  const size = speakers.length > 2 ? 64 : speakers.length === 2 ? 80 : 96;
  const lead = sourceOnly
    ? 'Keine Fragen, keine Wertung. So oft du magst.'
    : `${quizzes.length > 1 ? `Zwischendurch kommen ${numWord(quizzes.length)} kurze Fragen.` : quizzes.length ? 'Zwischendurch kommt eine kurze Frage.' : 'Die Fragen kommen danach.'} Den Text siehst du nicht — nur die Stimmen zählen.`;
  return (
    <>
      <div style={{ ...body, gap: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <CardBadge entry={entry} card={card} />
          {!sourceOnly && quizzes.length > 0 && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, font: 'var(--type-label)', fontWeight: 700, color: 'var(--text-muted)' }}>
              <Icon name="zap" size={15} />{quizzes.length === 1 ? '1 Zwischenfrage' : `${quizzes.length} Zwischenfragen`}
            </span>
          )}
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'safe center', textAlign: 'center', gap: 'clamp(16px, 3.4dvh, 30px)', padding: '12px 0 4px' }}>
          <div className="stack" style={{ gap: 6, alignItems: 'center' }}>
            <PartLine entry={entry} card={card} tone="listen" />
            <h2 style={{ font: 'var(--type-title)' }}>{sourceOnly ? 'Einfach zuhören.' : 'Hör genau hin.'}</h2>
            <p style={{ font: 'var(--type-body)', color: 'var(--text-muted)', maxWidth: 310 }}>{lead}</p>
          </div>
          {speakers.length ? (
            <div style={{ display: 'flex', justifyContent: 'center', gap: speakers.length > 2 ? 4 : 14, flexWrap: 'wrap' }}>
              {speakers.map((sp) => <SpeakerAvatar key={sp.id} speaker={sp} size={size} active={activeName === sp.name} dim={!!activeName && activeName !== sp.name} />)}
            </div>
          ) : (
            <span className={speech.playing ? 'a-bob' : undefined}><Mascot pose="listening" size={110} /></span>
          )}
          {speech.error && !showText && <div className="a-fade" style={{ width: '100%' }}><TtsError onRetry={() => { speech.retry(); }} onShowText={() => { setShowText(true); setHeard(true); }} /></div>}
          {showText && (
            <Card tone="listen" padding={16} elevated={false} className="a-fade" style={{ textAlign: 'left', width: '100%' }}><DialogText item={card.item} /></Card>
          )}
          <div className="stack" style={{ alignItems: 'center', gap: 8 }}>
            <PlayButton playing={speech.playing} paused={!!pop} disabled={!speech.playing && left <= 0} again={plays > 0}
              progress={speech.progress} showRing={plays > 0} onClick={play} />
            <span aria-live="polite" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, font: 'var(--type-label)', fontWeight: 600, color: 'var(--text-muted)' }}>
              {!sourceOnly && (
                <span aria-hidden="true" style={{ display: 'inline-flex', gap: 4 }}>
                  {Array.from({ length: MAX_PLAYS }, (_, i) => (
                    <span key={i} style={{ width: 8, height: 8, borderRadius: '50%', background: i < left ? 'var(--track-listen)' : 'var(--surface-locked)', transition: 'background var(--dur-base) var(--ease-out)' }} />
                  ))}
                </span>
              )}
              {sourceOnly ? (plays === 0 ? 'Antippen zum Abspielen.' : 'Nochmal? Einfach antippen.')
                : plays === 0 ? `Du kannst es ${MAX_PLAYS}× hören.` : left > 0 ? `Noch ${left}× hören` : 'Beide Wiedergaben genutzt.'}
            </span>
          </div>
        </div>
      </div>
      <div className="lesson-cta">
        {sourceOnly
          ? <Button full onClick={() => { speech.stop(); onNext(); }}>Fertig</Button>
          : <Button full disabled={!heard || speech.playing} onClick={() => { speech.stop(); onNext(); }}>Weiter zu den Fragen</Button>}
      </div>
      <Sheet open={!!pop} title="Kurze Zwischenfrage" closable={false}>
        {pop && <QuizBody key={pop.n} quiz={quizzes[pop.n]} sound={sound} onDone={closeQuiz} />}
      </Sheet>
    </>
  );
}

/* ---- Zwischenscreen vor Fragen zu einer früheren Geschichte ------------------ */
function StoryIntro({ entries, pos, card, rec, cards, onNext }) {
  const item = card.item;
  const read = card.track === 'read';
  const lesson = card.lesson;
  const partN = lesson.items.indexOf(item) + 1;
  let count = 0;
  for (let i = pos; i < entries.length && cards.get(entries[i].cardId)?.item.id === item.id; i++) count++;
  const d = daysSinceFirst(rec);
  const when = !rec ? '' : d > 0 ? `${read ? 'gelesen' : 'gehört'} ${daysAgoText(d)}` : `heute ${read ? 'gelesen' : 'gehört'}`;
  const speakers = read ? [] : dialogSpeakers(item);
  const tone = read ? 'read' : 'listen';
  return (
    <>
      <div style={{ ...body, alignItems: 'center', textAlign: 'center', justifyContent: 'safe center', gap: 'clamp(14px, 3dvh, 22px)' }}>
        {speakers.length ? (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, flexWrap: 'wrap' }} className="a-rise">
            {speakers.map((sp) => <SpeakerAvatar key={sp.id} speaker={sp} size={speakers.length > 2 ? 56 : 68} active={false} />)}
          </div>
        ) : <Mascot pose={read ? 'neutral' : 'listening'} size={110} />}
        <div className="stack" style={{ gap: 8, alignItems: 'center', maxWidth: 320 }}>
          <span className="overline" style={{ color: `var(--track-${tone}-shade)` }}>
            {lesson.items.length > 1 ? `Teil ${partN} · ${item.title}` : item.title}
          </span>
          <h2 style={{ font: 'var(--type-title)', textWrap: 'balance' }}>
            Prüfen wir, was du noch {read ? 'aus' : 'von'} „{lesson.title}“ weißt.
          </h2>
          <p style={{ font: 'var(--type-body)', color: 'var(--text-muted)' }}>
            {[when, `${count} ${count === 1 ? 'Frage' : 'Fragen'}`].filter(Boolean).join(' · ')}
          </p>
        </div>
        {!read && (
          <div style={{ ...lockBox, textAlign: 'left', maxWidth: 360 }}>
            <span style={{ color: 'var(--track-listen-shade)', display: 'inline-flex' }}><Icon name="ear" /></span>
            <span style={{ font: 'var(--type-body)', color: 'var(--text-muted)' }}>Hängt es? Bei jeder Frage kannst du die passende Stelle nochmal anhören. Dann zählt es als „mit Hilfe“.</span>
          </div>
        )}
      </div>
      <div className="lesson-cta"><Button full onClick={onNext}>Los geht’s</Button></div>
    </>
  );
}

/* ---- "Stelle anhören": spielt nur die Zeile(n), in denen die Antwort steckt ----- */
function HelpListen({ card, used, onUse }) {
  const speech = useSpeech(card.item);
  const only = answerSegments(card.item, card.ex);
  const whole = only.length > 2;
  const play = () => {
    if (speech.playing) { speech.stop(); return; }
    onUse();
    speech.start(true, only);
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
      <Button variant="secondary" size="sm" icon={speech.playing ? undefined : 'ear'} onClick={play}
        aria-label={speech.playing ? 'Wiedergabe stoppen' : whole ? 'Gespräch nochmal anhören' : 'Stelle nochmal anhören'}>
        {speech.playing
          ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              {[0, 140, 280].map((d) => <span key={d} className="rm-static eq-bar" style={{ width: 4, height: 12, background: 'currentColor', animationDelay: `${d}ms` }} />)}
              <span style={{ marginLeft: 6 }}>Stopp</span>
            </span>
          : whole ? 'Gespräch nochmal anhören' : 'Stelle nochmal anhören'}
      </Button>
      <span aria-live="polite" style={{ font: 'var(--type-label)', fontWeight: 500, color: used ? 'var(--badge-amber-fg, var(--spur-amber-shade))' : 'var(--text-subtle)' }}>
        {used ? 'Mit Hilfe: zählt als teilweise.' : 'Zählt dann als „mit Hilfe“.'}
      </span>
      {speech.error && <span style={{ font: 'var(--type-label)', color: 'var(--text-muted)' }}>Vorlesen klappt gerade nicht.</span>}
    </div>
  );
}

/* ---- 1d Frage (Zuhören und Lesen, neu wie fällig) ------------------------- */
function contextLine(entry, card, rec) {
  const d = daysSinceFirst(rec);
  const when = entry.mode === 'new' && !rec ? 'von eben' : d > 0 ? daysAgoText(d) : 'von heute';
  if (card.track === 'read') return `Aus dem Text „${card.item.topic}“, ${d > 0 && !(entry.mode === 'new' && !rec) ? 'gelesen ' + daysAgoText(d) : 'gerade gelesen'}.`;
  return `Aus dem Gespräch ${when}.`;
}

function RecallQuestion({ entry, card, rec, answer, setAnswer, onCheck, onSkip, help, showLock }) {
  const read = card.track === 'read';
  return (
    <>
      <div style={{ ...body, gap: 18 }}>
        <ExerciseTop entry={entry} card={card} seenBefore={entry.mode !== 'new'} />
        {/* Wie bei Duolingo: Die Figur stellt die Frage in einer Sprechblase. */}
        <div className="kb-shrink stack" style={{ gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
            <Mascot pose={read ? 'neutral' : 'listening'} size={72} className="kb-mascot" />
            <SpeechBubble tail="left" style={{ flex: 1, marginBottom: 6, padding: '12px 16px' }}>
              <h2 style={{ font: 'var(--type-headline)', fontWeight: 800, textWrap: 'pretty' }}>{card.question.prompt}</h2>
            </SpeechBubble>
          </div>
          <p style={{ font: 'var(--type-body)', color: 'var(--text-muted)' }}>{contextLine(entry, card, rec)}</p>
        </div>
        <DevHint ex={card.ex} kind="recall" />
        {help || (showLock && <LockHint>{read ? 'Das Buch bleibt zu — antworte aus dem Kopf.' : 'Der Originaltext bleibt aus — das ist der Sinn der Sache.'}</LockHint>)}
        <TextField value={answer} onChange={(e) => setAnswer(e.target.value)} rows={3} placeholder="Schreib auf, woran du dich erinnerst …" hint="Stichworte reichen." enterKeyHint="done"
          // Enter prüft (kurze Antworten), Umschalt+Enter macht eine neue Zeile.
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); if (answer.trim()) onCheck(); } }} />
      </div>
      <div className="lesson-cta" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <Button full disabled={!answer.trim()} onClick={onCheck}>Prüfen</Button>
        <Button variant="ghost" size="md" full onClick={onSkip}>Weiß ich nicht mehr</Button>
      </div>
    </>
  );
}

/* ---- detail_match: Antwort-Chips -------------------------------------------- */
/* ---- Wiedersehen: Du triffst die Person ein paar Tage später. Worauf sprichst du sie an? ---- */
function FollowUpExercise({ entry, card, onCheck, help, sound }) {
  const ex = card.ex;
  const options = seededShuffle(ex.options, card.id);
  const [sel, setSel] = useState(null);
  const person = personByName(ex.meet || dialogSpeakers(card.item)[0]?.name || '');
  const t = person.tone || { solid: 'var(--track-listen)', soft: 'var(--track-listen-soft)', shade: 'var(--track-listen-shade)' };
  return (
    <>
      <div style={{ ...body, gap: 18 }}>
        <ExerciseTop entry={entry} card={card} seenBefore={entry.mode !== 'new'} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span className="a-popin" style={{ display: 'inline-flex', animationDelay: '80ms' }}><PersonAvatar person={person} size={60} active pulse={false} /></span>
          <div className="stack" style={{ gap: 2, minWidth: 0 }}>
            <span style={{ font: 'var(--type-headline)', color: 'var(--text-ink)' }}>{person.name}</span>
            {person.relation && <span style={{ font: 'var(--type-label)', fontWeight: 500, color: 'var(--text-muted)' }}>{person.relation}</span>}
          </div>
        </div>
        <div className="stack" style={{ gap: 6 }}>
          <h2 style={{ font: 'var(--type-title)', textWrap: 'pretty' }}>{ex.prompt}</h2>
          <p style={{ font: 'var(--type-body)', color: 'var(--text-muted)' }}>Nur eine Frage passt zu dem, was erzählt wurde.</p>
        </div>
        {help}
        <DevHint ex={ex} kind="match" />
        <div role="radiogroup" aria-label="Was du sagst" className="stack" style={{ gap: 10 }}>
          {options.map((o, i) => {
            const on = sel === o;
            return (
              <span key={o} className="a-rise" style={{ alignSelf: 'flex-end', maxWidth: '92%', display: 'flex', animationDelay: `${80 + i * 40}ms` }}>
                <button type="button" role="radio" aria-checked={on} onClick={() => { setSel(o); if (sound) sounds.select(); }} className="tile"
                  style={{ padding: '12px 16px', borderRadius: '18px 18px 6px 18px', font: 'var(--type-body)', fontSize: 'var(--text-body-l)', fontWeight: 700, lineHeight: 1.35,
                    ...(on ? { '--tile-bg': t.soft, '--tile-line': t.solid, '--tile-fg': 'var(--text-ink)' } : null) }}>
                  {o}
                </button>
              </span>
            );
          })}
        </div>
      </div>
      <div className="lesson-cta"><Button full disabled={!sel} onClick={() => onCheck({ ...gradeMatch([sel], ex.correct), selected: [sel] })}>Ansprechen</Button></div>
    </>
  );
}

function MatchExercise({ entry, card, rec, onCheck, help, sound }) {
  const ex = card.ex;
  const multi = ex.correct.length > 1;
  const options = seededShuffle(ex.options, card.id);
  const [sel, setSel] = useState([]);
  const toggle = (o) => { setSel((cur) => (cur.includes(o) ? cur.filter((x) => x !== o) : multi ? [...cur, o] : [o])); if (sound) sounds.select(); };
  return (
    <>
      <div style={{ ...body, gap: 18 }}>
        <ExerciseTop entry={entry} card={card} seenBefore={entry.mode !== 'new'} />
        <div className="stack" style={{ gap: 6 }}>
          <h2 style={{ font: 'var(--type-title)', textWrap: 'pretty' }}>{ex.prompt}</h2>
          <p style={{ font: 'var(--type-body)', color: 'var(--text-muted)' }}>{contextLine(entry, card, rec)} {multi ? 'Mehrere Antworten sind richtig.' : 'Eine Antwort ist richtig.'}</p>
        </div>
        {help}
        <DevHint ex={ex} kind="match" />
        <div role="group" aria-label="Antworten" style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {options.map((o) => {
            const on = sel.includes(o);
            return (
              <button key={o} type="button" aria-pressed={on} onClick={() => toggle(o)} className="tile"
                style={{ padding: '12px 16px', minHeight: 50, font: 'var(--type-body)', fontSize: 'var(--text-body-l)', fontWeight: 700 }}>
                {o}
              </button>
            );
          })}
        </div>
      </div>
      <div className="lesson-cta"><Button full disabled={!sel.length} onClick={() => onCheck({ ...gradeMatch(sel, ex.correct), selected: sel })}>Prüfen</Button></div>
    </>
  );
}

/* ---- sequence_events: Ereignisse in Reihenfolge antippen --------------------- */
function SequenceExercise({ entry, card, rec, onCheck, help, sound }) {
  const ex = card.ex;
  let shuffled = seededShuffle(ex.events, card.id);
  if (shuffled.every((e, i) => e === ex.events[i])) shuffled = [...shuffled.slice(1), shuffled[0]];
  const [order, setOrder] = useState([]);
  const tap = (e) => { setOrder((cur) => (cur.includes(e) ? cur.filter((x) => x !== e) : [...cur, e])); if (sound) sounds.select(); };
  const done = order.length === ex.events.length;
  return (
    <>
      <div style={{ ...body, gap: 18 }}>
        <ExerciseTop entry={entry} card={card} seenBefore={entry.mode !== 'new'} />
        <div className="stack" style={{ gap: 6 }}>
          <h2 style={{ font: 'var(--type-title)', textWrap: 'pretty' }}>{ex.prompt}</h2>
          <p style={{ font: 'var(--type-body)', color: 'var(--text-muted)' }}>Tipp die Ereignisse der Reihe nach an. Nochmal tippen nimmt eins zurück.</p>
        </div>
        {help}
        <DevHint ex={ex} kind="sequence" />
        <div className="stack" style={{ gap: 10 }}>
          {shuffled.map((e) => {
            const n = order.indexOf(e);
            const on = n >= 0;
            return (
              <button key={e} type="button" onClick={() => tap(e)} aria-label={on ? `${e}, Position ${n + 1}` : e} aria-pressed={on} className="tile"
                style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '12px 14px', minHeight: 56 }}>
                <span style={{ width: 30, height: 30, borderRadius: '50%', flex: '0 0 auto', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  font: 'var(--type-label)', fontWeight: 900, background: on ? 'var(--select-fg)' : 'var(--surface-locked)', color: on ? '#fff' : 'var(--text-subtle)',
                  transition: 'background-color var(--dur-fast) var(--ease-out)' }}>
                  {on ? n + 1 : ''}
                </span>
                <span style={{ font: 'var(--type-body)', fontSize: 'var(--text-body-l)', fontWeight: 700 }}>{e}</span>
              </button>
            );
          })}
        </div>
        {order.length > 0 && <button type="button" className="a-fade" onClick={() => setOrder([])} style={{ alignSelf: 'flex-start', background: 'none', border: 'none', cursor: 'pointer', font: 'var(--type-label)', color: 'var(--text-link)', padding: '4px 0' }}>Neu anfangen</button>}
      </div>
      <div className="lesson-cta"><Button full disabled={!done} onClick={() => onCheck({ ...gradeSequence(order, ex.events), order })}>Prüfen</Button></div>
    </>
  );
}

/* ---- 1e Lesen, neuer Text -------------------------------------------------- */
function ReadText({ entry, card, onClose, tts, sourceOnly = false }) {
  const item = card.item;
  const speech = useSpeech(item);
  return (
    <>
      <div style={{ ...body, gap: 14 }}>
        <CardBadge entry={entry} card={card} />
        <PartLine entry={entry} card={card} tone="read" />
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <h2 style={{ font: 'var(--type-title)', textWrap: 'pretty' }}>{item.title}</h2>
          {tts && <SpeakButton playing={speech.playing} onClick={speech.toggle} size={44} label="Text vorlesen" />}
        </div>
        <span style={{ font: 'var(--type-label)', fontWeight: 500, color: 'var(--text-subtle)' }}>Sachtext · etwa {readSeconds(item)} Sekunden</span>
        {speech.error && <div className="a-fade"><TtsError onRetry={speech.retry} /></div>}
        <Card padding={20} style={{ maxWidth: 'var(--content-max)' }}>
          {item.paragraphs.map((p, i) => <p key={i} style={{ font: 'var(--type-body-l)', margin: i < item.paragraphs.length - 1 ? '0 0 14px' : 0 }}>{p}</p>)}
        </Card>
      </div>
      <div className="lesson-cta">
        {sourceOnly
          ? <Button full onClick={() => { stopSpeaking(); onClose(); }}>Fertig</Button>
          : <Button full icon="book" onClick={() => { stopSpeaking(); onClose(); }}>Buch zuklappen &amp; wiedergeben</Button>}
      </div>
    </>
  );
}

/* ---- 1f Lesen, Wiedergabe --------------------------------------------------- */
function ReadRecall({ entry, card, rec, answer, setAnswer, onCompare }) {
  const item = card.item;
  const d = daysSinceFirst(rec);
  const n = item.keyPoints.length;
  const meta = entry.mode === 'new' || entry.showSource ? `Gerade gelesen · ${n} Kernpunkte hinterlegt` : `Gelesen ${daysAgoText(d)} · ${n} Kernpunkte hinterlegt`;
  return (
    <>
      <div style={{ ...body, gap: 18 }}>
        <ExerciseTop entry={entry} card={card} seenBefore={!entry.showSource && entry.mode !== 'new'} />
        <div className="stack kb-shrink" style={{ gap: 6 }}>
          <span className="overline" style={{ color: 'var(--track-read-shade)' }}>Thema</span>
          <h2 style={{ font: 'var(--type-title)' }}>{item.topic}</h2>
          <p style={{ font: 'var(--type-body)', color: 'var(--text-muted)' }}>{meta}</p>
        </div>
        <DevHint ex={{}} kind="retell" />
        <LockHint>Das Buch bleibt zu. Erzähl es frei.</LockHint>
        <TextField value={answer} onChange={(e) => setAnswer(e.target.value)} rows={7} placeholder="Erzähl den Text so, wie du ihn jemandem erklären würdest …" hint="Reihenfolge ist egal." />
      </div>
      <div className="lesson-cta"><Button full disabled={!answer.trim()} onClick={onCompare}>Mit Kernpunkten vergleichen</Button></div>
    </>
  );
}

/* ---- 2d Kernpunkte abhaken -------------------------------------------------- */
function KeyPoints({ entry, card, answer, checks, setChecks, onDone }) {
  const pts = card.item.keyPoints;
  const hits = checks.filter(Boolean).length;
  const enough = gradeKeyPoints(hits, pts.length).grade === 'good';
  return (
    <>
      <div style={body}>
        {entry.feld && <FeldCounter feld={entry.feld} style={{ alignSelf: 'flex-end' }} />}
        <div className="stack" style={{ gap: 4 }}>
          <h2 style={{ font: 'var(--type-title)' }}>Was hast du getroffen?</h2>
          <p style={{ font: 'var(--type-body)', color: 'var(--text-muted)' }}>Tipp an, was in deiner Wiedergabe vorkam. Du bewertest dich selbst.</p>
        </div>
        <Card tone="sunken" padding={16} elevated={false}>
          <span className="overline" style={{ color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Deine Wiedergabe</span>
          <p style={{ font: 'var(--type-body)', whiteSpace: 'pre-wrap' }}>{answer}</p>
        </Card>
        <span className="overline" style={{ color: 'var(--track-read-shade)' }}>Kernpunkte</span>
        <div className="stack" style={{ gap: 10 }}>
          {pts.map((kp, i) => (
            <button key={kp} type="button" role="checkbox" aria-checked={!!checks[i]} onClick={() => setChecks((c) => { const n = [...c]; n[i] = !n[i]; return n; })} className="tile"
              style={{ display: 'flex', alignItems: 'flex-start', gap: 12, width: '100%', padding: '14px 16px',
                ...(checks[i] ? { '--tile-bg': 'var(--state-correct-soft)', '--tile-line': 'var(--spur-green)', '--tile-fg': 'var(--text-ink)' } : null) }}>
              <span style={{ color: checks[i] ? 'var(--spur-green)' : 'var(--spur-locked)', display: 'inline-flex', transition: 'color var(--dur-fast) var(--ease-out)' }}>
                <Icon name={checks[i] ? 'check-circle-2' : 'circle'} />
              </span>
              <span style={{ font: 'var(--type-body)', fontSize: 'var(--text-body-l)', color: 'var(--text-ink)' }}>{kp}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="lesson-cta" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <span aria-live="polite" style={{ font: 'var(--type-label)', fontWeight: 500, color: 'var(--text-muted)', textAlign: 'center' }}>
          {hits} von {pts.length} getroffen{enough ? ' — reicht für „gemerkt“.' : '.'}
        </span>
        <Button full onClick={onDone}>Weiter</Button>
      </div>
    </>
  );
}

/* ---- 1g / 1h Feedback --------------------------------------------------------- */
// Abwechslung im Feedback-Titel (stabil je Karte, damit er beim erneuten Rendern nicht springt).
const PRAISE = { correct: ['Gemerkt!', 'Genau!', 'Sitzt!', 'Stark!', 'Richtig!'], wrong: ['Beim nächsten Mal sitzt es.', 'Knapp daneben.', 'Das kommt wieder.'] };
const pickTitle = (list, seed) => { let h = 0; for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0; return list[h % list.length]; };

function Feedback({ entry, card, rec, answer, result, combo, infiniteSaved, onOverride, onNext }) {
  const grade = result.override ? 'good' : result.grade;
  const kind = card.kind;
  // Richtig, aber mit nachgehörter Stelle: gelb, zählt wie teilweise.
  const helpedRight = result.helped && result.rawGrade === 'good';
  const state = grade === 'good' ? 'correct' : grade === 'partial' ? 'partial' : 'wrong';
  const d = daysSinceFirst(rec);
  const after = entry.mode === 'review' && d > 0 ? ` — nach ${d} ${d === 1 ? 'Tag' : 'Tagen'}.` : '.';
  let detail;
  let source = null;
  let sourceLabel = 'Im Original';
  let title = helpedRight ? 'Richtig, mit Hilfe.' : state === 'correct' ? pickTitle(PRAISE.correct, card.id) : state === 'wrong' ? pickTitle(PRAISE.wrong, card.id) : undefined;
  const followUp = !!card.ex?.followUp;
  if (followUp) {
    const who = card.ex.meet || 'Die Person';
    if (helpedRight) detail = 'Du hast die Stelle nachgehört. Das zählt als teilweise gemerkt.';
    else if (grade === 'good') { title = 'Gutes Gespräch!'; detail = `${who} freut sich, dass du daran gedacht hast${after}`; }
    else { title = 'Das wurde so nicht erzählt.'; detail = `Besser: „${card.ex.correct[0]}“`; }
    source = card.ex.quote;
    sourceLabel = 'Erzählt wurde';
  } else if (kind === 'retell') {
    const missing = card.item.keyPoints.filter((_, i) => !result.checks[i]);
    detail = grade === 'good'
      ? `${result.hits} von ${result.total} Kernpunkten${after}`
      : grade === 'partial' ? `${result.hits} von ${result.total} Kernpunkten. Die fehlenden kommen wieder.` : `${result.hits} von ${result.total} Kernpunkten.`;
    if (grade !== 'good' && missing.length) { source = missing; sourceLabel = 'Fehlte noch'; }
  } else if (helpedRight) {
    detail = 'Du hast die Stelle nachgehört. Das zählt als teilweise gemerkt — nächstes Mal klappt es aus dem Kopf.';
  } else if (kind === 'match') {
    const ex = card.ex;
    detail = grade === 'good' ? `Genau das war es${after}` : `Richtig wäre: ${ex.correct.join(' · ')}`;
    if (grade !== 'good' && ex.quote) source = ex.quote;
  } else if (kind === 'sequence') {
    detail = grade === 'good' ? `Richtige Reihenfolge${after}` : `${result.hits} von ${result.total} an der richtigen Stelle.`;
    if (grade !== 'good') { source = card.ex.events.map((e, i) => `${i + 1}. ${e}`); sourceLabel = 'So war es'; }
  } else {
    const q = card.question;
    detail = grade === 'good' ? `Genau das war es${after}` : grade === 'partial' ? `Ein Teil saß. Gesucht war: ${q.solution}` : `Gesucht war: ${q.solution}`;
    if (grade !== 'good' && q.quote) source = q.quote;
  }
  const read = kind === 'retell';
  const heading = kind === 'retell' ? card.item.topic : card.question.prompt;
  // Wann die Karte wiederkommt (nur bei Karten, deren Intervall sich ändert).
  let nextTime = null;
  if (entry.mode === 'new' || entry.mode === 'review') {
    const days = INTERVALS[applyGrade(rec, grade, new Date()).stage];
    nextTime = days === 1 ? 'morgen' : `in ${days} Tagen`;
  }
  const mark = (ok) => (ok && helpedRight
    ? { border: '2px solid var(--spur-amber)', background: 'var(--accent-xp-soft)' }
    : { border: `2px solid ${ok ? 'var(--spur-green)' : 'var(--spur-coral)'}`, background: ok ? 'var(--state-correct-soft)' : 'var(--state-wrong-soft)' });
  let yourAnswer;
  if (kind === 'match') {
    yourAnswer = (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }} aria-label="Deine Auswahl">
        {result.selected.map((o) => (
          <span key={o} style={{ padding: '10px 14px', borderRadius: 'var(--radius-md)', font: 'var(--type-body)', fontWeight: 600, color: 'var(--text-ink)', ...mark(card.ex.correct.includes(o)) }}>{o}</span>
        ))}
      </div>
    );
  } else if (kind === 'sequence') {
    yourAnswer = (
      <div className="stack" style={{ gap: 8 }} aria-label="Deine Reihenfolge">
        {result.order.map((e, i) => (
          <span key={e} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '10px 14px', borderRadius: 'var(--radius-md)', font: 'var(--type-body)', color: 'var(--text-ink)', ...mark(card.ex.events[i] === e) }}>
            <b>{i + 1}.</b>{e}
          </span>
        ))}
      </div>
    );
  } else {
    yourAnswer = <TextField value={answer} state={state} rows={read ? 4 : 2} disabled label={read ? 'Deine Wiedergabe' : undefined} placeholder={answer ? undefined : 'Weiß ich nicht mehr.'} />;
  }
  const pose = grade === 'good' ? 'cheering' : grade === 'partial' ? 'neutral' : 'disappointed';
  return (
    <>
      <div style={body}>
        <ExerciseTop entry={entry} card={card} seenBefore={entry.mode !== 'new'} />
        <h2 style={{ font: 'var(--type-title)', textWrap: 'pretty' }}>{heading}</h2>
        {yourAnswer}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
          <Badge tone="amber" variant="solid" icon="feather" style={{ alignSelf: 'flex-start', animation: 'spur-popin 420ms var(--ease-bounce) 200ms both' }}>+{XP[grade]} Federn</Badge>
          {nextTime && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, font: 'var(--type-label)', fontWeight: 600, color: 'var(--text-muted)', animation: 'spur-rise 320ms var(--ease-out) 320ms both' }}>
              <Icon name="calendar" size={15} />Nächstes Mal: {nextTime}
            </span>
          )}
          {combo >= 3 && grade === 'good' && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px 8px 10px', borderRadius: 999, background: 'var(--accent-xp-soft)', color: 'var(--badge-amber-fg, var(--spur-amber-shade))', font: 'var(--type-label)', fontWeight: 700, animation: 'spur-popin 460ms var(--ease-bounce) 400ms both' }}>
                <Icon name="flame" size={18} fill="currentColor" />{combo} richtig in Folge
              </span>
              <span style={{ display: 'flex', gap: 4, animation: 'spur-rise 320ms var(--ease-out) 600ms both' }}>
                {[0, 1, 2].map((i) => <span key={i} style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--spur-amber)', animation: i === 2 ? 'spur-popin 420ms var(--ease-bounce) 700ms both' : undefined }} />)}
              </span>
            </span>
          )}
        </div>
        {infiniteSaved && (
          <span style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px 8px 10px', borderRadius: 999, background: 'var(--accent-xp-soft)', color: 'var(--badge-amber-fg, var(--spur-amber-shade))', font: 'var(--type-label)', fontWeight: 700, animation: 'spur-popin 420ms var(--ease-bounce) 500ms both' }}>
            <Icon name="shield" size={18} />Kein Herz verloren — heute unendlich
          </span>
        )}
        {kind === 'recall' && result.grade !== 'good' && !result.helped && !result.skipped && (
          <button type="button" onClick={onOverride}
            style={{ alignSelf: 'flex-start', background: 'none', border: 'none', padding: '6px 0', cursor: 'pointer', font: 'var(--type-label)', color: 'var(--text-link)', textDecoration: result.override ? 'none' : 'underline', textUnderlineOffset: 3 }}>
            {result.override ? 'Zählt als gemerkt.' : 'Meine Antwort meinte dasselbe — als gemerkt zählen'}
          </button>
        )}
      </div>
      <div style={{ flex: '0 0 auto', position: 'relative', animation: 'spur-sheet-in 300ms var(--ease-drawer) both' }}>
        <div className="fb-mascot" style={{ display: 'flex', justifyContent: 'center', marginBottom: -14, position: 'relative', zIndex: 2 }}>
          <span key={pose} style={{ display: 'inline-flex', animation: 'spur-popin 460ms var(--ease-bounce) both' }}><Mascot pose={pose} size={96} /></span>
        </div>
        <FeedbackPanel state={state} title={title} detail={detail} source={source} sourceLabel={sourceLabel} onAction={onNext} />
      </div>
    </>
  );
}

/* ---- Lektion ------------------------------------------------------------------ */
export function Lesson({ session, onFinish, onExit }) {
  const { state, index, update } = useStore();
  const [entries, setEntriesState] = useState(session.entries);
  const entriesRef = useRef(session.entries);
  const setEntries = (v) => { const nextList = typeof v === 'function' ? v(entriesRef.current) : v; entriesRef.current = nextList; setEntriesState(nextList); };
  const [pos, setPos] = useState(0);
  const entry = entries[pos];
  const card = index.cards.get(entry.cardId);
  const phaseAt = (list, i) => firstPhase(list[i], index.cards.get(list[i].cardId), list[i - 1], list[i - 1] && index.cards.get(list[i - 1].cardId));
  const [phase, setPhase] = useState(() => phaseAt(session.entries, 0));
  // "Stelle anhören" benutzt: richtig zählt dann nur als teilweise (gelb).
  const [helped, setHelped] = useState(false);
  const [answer, setAnswer] = useState('');
  const [checks, setChecks] = useState([]);
  const [result, setResult] = useState(null);
  const [interval, setIntervalInfo] = useState(null);
  const [combo, setCombo] = useState(0);
  const [shake, setShake] = useState(0);
  const [abort, setAbort] = useState(false);
  const stats = useRef({ good: 0, partial: 0, poor: 0, xp: 0, total: 0 });
  const agg = useRef({ milestone: null, lessonDone: null, chapterDone: null, goalReached: false, streakUp: false, xpBefore: state.progress.xp });
  const committed = useRef(false);
  const lastAfter = useRef(null);
  // Die große Intervall-Animation nur bei der ersten richtigen Wiederholung einer Runde;
  // danach steht "Nächstes Mal: in X Tagen" direkt im Feedback.
  const intervalShown = useRef(false);
  const startedAt = useRef(Date.now());
  // Der Hinweis "Der Originaltext bleibt aus" nur bei der ersten Freitext-Frage der Runde.
  const firstRecall = entries.findIndex((e) => index.cards.get(e.cardId).kind === 'recall');
  const partBefore = useRef(null);
  if (partBefore.current == null) {
    const part = session.part ? lessonParts(index, session.lessonId)[session.part - 1] : null;
    partBefore.current = part ? { part, done: isPartDone(state, part) } : false;
  }
  // Stand des Feldes vor der Session: Wer ein neues Feld abbricht, fängt es beim nächsten Mal von vorn an.
  const feldBefore = useRef(null);
  if (!feldBefore.current) {
    const lesson = session.kind === 'lesson' ? index.lessons.get(session.lessonId) : null;
    feldBefore.current = lesson && {
      cards: Object.fromEntries(lesson.cardIds.map((id) => [id, state.cards[id]])),
      lessonDone: state.progress.lessonsDone[session.lessonId],
      chapterId: lesson.chapter.id,
      chapterDone: state.progress.chaptersDone[lesson.chapter.id],
      popup: state.progress.popups?.[lesson.chapter.id],
      xp: 0,
      answered: 0,
    };
  }

  const s = state.settings;
  const infinite = isInfinite(state.progress);
  const rec = state.cards[entry.cardId];
  const pendingLoss = phase === 'feedback' && result && !result.override && result.grade === 'poor' && entry.mode === 'new' && !infinite && state.progress.hearts > 0;
  const shownHearts = state.progress.hearts - (pendingLoss ? 1 : 0);
  const tone = card.track;
  const progress = (pos + (phase === 'feedback' || phase === 'interval' ? 1 : 0)) / entries.length;

  const showFeedback = (raw) => {
    const r = helped ? { ...raw, rawGrade: raw.grade, helped: true, grade: raw.grade === 'good' ? 'partial' : raw.grade } : raw;
    setResult(r);
    setPhase('feedback');
    committed.current = false;
    if (r.grade === 'poor' && entry.mode === 'new' && !infinite && state.progress.hearts > 0) setShake((n) => n + 1);
    if (s.sounds) sounds[r.grade]?.();
    if (navigator.vibrate) try { navigator.vibrate(r.grade === 'good' ? 12 : r.grade === 'poor' ? [18, 60, 18] : 0); } catch { /* ignore */ }
  };

  const check = () => showFeedback(gradeListen(answer, card.question.answers));
  const skip = () => { setAnswer(''); showFeedback({ grade: 'poor', hits: 0, total: card.question.answers.length, matched: [], skipped: true }); };

  const keyPointsDone = () => {
    const hits = checks.filter(Boolean).length;
    showFeedback({ ...gradeKeyPoints(hits, card.item.keyPoints.length), checks: [...checks] });
  };

  /** Ergebnis übernehmen (einmalig), Ereignisse sammeln. */
  const commit = () => {
    if (committed.current || !result) return null;
    committed.current = true;
    const grade = result.override ? 'good' : result.grade;
    const now = new Date();
    const { events, state: after } = commitAnswer(index, state, entry, grade, now);
    lastAfter.current = after;
    update((cur) => commitAnswer(index, cur, entry, grade, now).state);
    const st = stats.current;
    st.xp += events.xp;
    if (feldBefore.current && entry.feld) { feldBefore.current.xp += events.xp; feldBefore.current.answered += 1; }
    // Zweite Versuche zählen nicht als eigene Karte in der Auswertung.
    if (entry.mode !== 'retry') { st.total += 1; st[grade] += 1; }
    const a = agg.current;
    a.milestone = a.milestone || events.milestone;
    a.lessonDone = a.lessonDone || events.lessonDone;
    a.chapterDone = a.chapterDone || events.chapterDone;
    a.goalReached = a.goalReached || events.goalReached;
    a.streakUp = a.streakUp || events.streakUp;
    setCombo((c) => (grade === 'good' ? c + 1 : 0));
    return { grade, events, after };
  };

  const finish = () => {
    if (session.kind === 'checkpoint') {
      const ev = {};
      update((cur) => markLessonDone(index, cur, session.lessonId, new Date(), ev));
      agg.current.lessonDone = agg.current.lessonDone || (state.progress.lessonsDone[session.lessonId] ? null : session.lessonId);
      const chapter = index.lessons.get(session.lessonId).chapter;
      const allDone = chapter.lessons.every((l) => l.id === session.lessonId || state.progress.lessonsDone[l.id]);
      if (allDone && !state.progress.chaptersDone[chapter.id]) agg.current.chapterDone = chapter.id;
    }
    // Teil geschafft → auf dem Pfad füllt sich das nächste Ringsegment.
    const pb = partBefore.current;
    const partDone = pb && !pb.done && lastAfter.current && isPartDone(lastAfter.current, pb.part)
      ? { lessonId: session.lessonId, n: session.part, of: session.parts } : null;
    onFinish({ ...stats.current, ...agg.current, partDone, kind: session.kind, ms: Date.now() - startedAt.current, streak: (lastAfter.current || state).progress.streak });
  };

  const advance = (after) => {
    let list = entriesRef.current;
    // Aufmerksamkeit aufgebraucht: neue Karten fallen weg, Wiederholungen bleiben.
    if (after && after.progress.hearts <= 0 && !isInfinite(after.progress)) {
      list = [...list.slice(0, pos + 1), ...list.slice(pos + 1).filter((e) => e.mode !== 'new')];
      setEntries(list);
    }
    if (pos + 1 >= list.length) return finish();
    setPos(pos + 1);
    setAnswer('');
    setChecks([]);
    setResult(null);
    setHelped(false);
    setIntervalInfo(null);
    setPhase(phaseAt(list, pos + 1));
    return undefined;
  };

  const next = () => {
    const c = commit();
    // Nicht gemeisterte Feld-Übung: ein zweiter Versuch am Ende der Runde (ohne Herz, ohne Intervall-Änderung).
    if (c && c.grade === 'poor' && entry.feld && entry.mode === 'new') {
      setEntries((cur) => [...cur, { cardId: entry.cardId, mode: 'retry', showSource: false, feld: { ...entry.feld, n: entry.feld.n } }]);
    }
    if (c && entry.mode === 'review' && c.grade === 'good' && c.events.prevStage >= 0 && !intervalShown.current) {
      intervalShown.current = true;
      setIntervalInfo({ from: c.events.prevStage, to: c.events.newStage, after: c.after });
      setPhase('interval');
      return;
    }
    advance(c?.after);
  };

  /**
   * Abbrechen zählt die gerade offene Übung nicht. Bei einem neuen Feld wird dessen
   * Fortschritt aus dieser Session komplett zurückgenommen (Karten, Abschluss, Federn),
   * damit es beim nächsten Öffnen samt Original neu startet. Verlorene Herzen bleiben.
   */
  const quit = () => {
    stopSpeaking();
    const snap = feldBefore.current;
    if (snap) {
      update((cur) => {
        const cards = { ...cur.cards };
        for (const [id, rec] of Object.entries(snap.cards)) { if (rec) cards[id] = rec; else delete cards[id]; }
        const p = { ...cur.progress, xp: Math.max(0, cur.progress.xp - snap.xp) };
        if (p.doneTodayDay === dayKey()) { p.doneToday = Math.max(0, p.doneToday - snap.answered); p.xpToday = Math.max(0, (p.xpToday || 0) - snap.xp); }
        p.lessonsDone = { ...p.lessonsDone };
        if (snap.lessonDone) p.lessonsDone[session.lessonId] = snap.lessonDone; else delete p.lessonsDone[session.lessonId];
        p.chaptersDone = { ...p.chaptersDone };
        if (snap.chapterDone) p.chaptersDone[snap.chapterId] = snap.chapterDone; else delete p.chaptersDone[snap.chapterId];
        p.popups = { ...(p.popups || {}) };
        if (snap.popup) p.popups[snap.chapterId] = snap.popup; else delete p.popups[snap.chapterId];
        return { ...cur, cards, progress: p };
      });
    }
    onExit();
  };

  // "Nur hören/lesen": nach dem Original ist die Session vorbei.
  const sourceOnly = entry.mode === 'source';
  const afterSource = () => (sourceOnly ? onExit() : setPhase(exercisePhase(card)));
  const help = entry.fromMemory && card.track === 'listen'
    ? <HelpListen key={`help-${pos}`} card={card} used={helped} onUse={() => setHelped(true)} />
    : null;

  let view;
  if (phase === 'intro') {
    view = <StoryIntro entries={entries} pos={pos} card={card} rec={rec} cards={index.cards} onNext={() => setPhase(exercisePhase(card))} />;
  } else if (phase === 'listen-audio') {
    view = <ListenOnly entry={entry} card={card} sourceOnly={sourceOnly} onNext={afterSource} />;
  } else if (phase === 'question') {
    view = <RecallQuestion entry={entry} card={card} rec={rec} answer={answer} setAnswer={setAnswer} onCheck={check} onSkip={skip} help={help} showLock={pos === firstRecall} />;
  } else if (phase === 'match' && card.ex.followUp) {
    view = <FollowUpExercise key={entry.cardId + pos} entry={entry} card={card} onCheck={showFeedback} help={help} sound={s.sounds} />;
  } else if (phase === 'match') {
    view = <MatchExercise key={entry.cardId + pos} entry={entry} card={card} rec={rec} onCheck={showFeedback} help={help} sound={s.sounds} />;
  } else if (phase === 'sequence') {
    view = <SequenceExercise key={entry.cardId + pos} entry={entry} card={card} rec={rec} onCheck={showFeedback} help={help} sound={s.sounds} />;
  } else if (phase === 'read-text') {
    view = <ReadText entry={entry} card={card} tts={s.tts} sourceOnly={sourceOnly} onClose={afterSource} />;
  } else if (phase === 'read-recall') {
    view = <ReadRecall entry={entry} card={card} rec={rec} answer={answer} setAnswer={setAnswer} onCompare={() => { setChecks(card.item.keyPoints.map(() => false)); setPhase('keypoints'); }} />;
  } else if (phase === 'keypoints') {
    view = <KeyPoints entry={entry} card={card} answer={answer} checks={checks} setChecks={setChecks} onDone={keyPointsDone} />;
  } else if (phase === 'feedback') {
    view = (
      <Feedback entry={entry} card={card} rec={rec} answer={answer} result={result} combo={result.override || result.grade === 'good' ? combo + 1 : 0}
        infiniteSaved={infinite && entry.mode === 'new' && result.grade === 'poor' && !result.override}
        onOverride={() => setResult((r) => ({ ...r, override: !r.override }))} onNext={next} />
    );
  } else if (phase === 'interval') {
    view = <IntervalStep card={card} from={interval.from} to={interval.to} onNext={() => advance(interval.after)} />;
  }

  return (
    <div className="screen">
      {/* Kopfzeile klappt vor dem Intervall-Schritt weich weg, statt zu verschwinden. */}
      <div className={`collapsible${phase === 'interval' ? ' is-collapsed' : ''}`} aria-hidden={phase === 'interval' || undefined}>
        <div>
          <LessonHeader progress={progress} tone={tone} hearts={Math.max(0, shownHearts)} infinite={infinite} heartShake={shake} onClose={() => (sourceOnly ? quit() : setAbort(true))} />
        </div>
      </div>
      {/* Jeder Schritt (Hören, Frage, Feedback …) blendet sanft ein. */}
      <div key={`${pos}-${phase}`} className="phase-in" style={{ position: 'relative', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {view}
      </div>
      <Sheet open={abort} title="Session abbrechen?" onClose={() => setAbort(false)}>
        <p style={{ font: 'var(--type-body-l)', color: 'var(--text-muted)', marginTop: -4 }}>
          {feldBefore.current
            ? (session.parts > 1
              ? `Teil ${session.part} zählt dann noch nicht. Beim nächsten Mal fängst du ihn von vorn an — ohne Vorwurf.`
              : 'Das Level zählt dann noch nicht. Beim nächsten Mal fängst du es von vorn an — ohne Vorwurf.')
            : 'Die offene Karte zählt nicht. Was du davor abgeschlossen hast, bleibt gezählt — der Rest kommt wieder.'}
        </p>
        <div className="stack" style={{ gap: 10 }}>
          <Button full onClick={() => setAbort(false)}>Weitermachen</Button>
          <Button variant="ghost" size="md" full onClick={quit}>Abbrechen</Button>
        </div>
      </Sheet>
    </div>
  );
}
