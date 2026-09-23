import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store.jsx';
import { Icon } from '../ds/Icon.jsx';
import { Button } from '../ds/Button.jsx';
import { SpeakButton } from '../ds/IconButton.jsx';
import { Badge, Card, TextField } from '../ds/core.jsx';
import { FeedbackPanel, Mascot, Sheet } from '../ds/feedback.jsx';
import { LessonHeader } from '../ds/progress.jsx';
import { IntervalStep } from './IntervalStep.jsx';
import { gradeKeyPoints, gradeListen, gradeMatch, gradeSequence } from '../engine/answer.js';
import { commitAnswer, isInfinite, markLessonDone } from '../engine/game.js';
import { XP } from '../engine/srs.js';
import { dayKey, daysBetween } from '../engine/dates.js';
import { readSeconds } from '../engine/content.js';
import { speakSegments, stopSpeaking } from '../lib/tts.js';
import { dialogSpeakers, deviceSegments } from '../lib/voice.js';
import { hasAudio, playItem } from '../lib/audio.js';
import { sounds } from '../lib/sound.js';
import { daysAgoText } from '../lib/format.js';

const body = { flex: 1, minHeight: 0, overflowY: 'auto', padding: '10px var(--gutter-screen) 16px', display: 'flex', flexDirection: 'column', gap: 16 };
const lockBox = { display: 'flex', alignItems: 'center', gap: 12, background: 'var(--surface-locked)', borderRadius: 'var(--radius-md)', padding: '14px 16px' };

/** Bildschirm für die Teilübung selbst (nach Hören/Lesen des Originals). */
function exercisePhase(card) {
  return { recall: 'question', retell: 'read-recall', match: 'match', sequence: 'sequence' }[card.kind] || 'question';
}

function firstPhase(entry, card) {
  // Neue Gespräche: erst nur zuhören, neue Texte: erst lesen. Danach die Übung.
  // Wiederholungen und weitere Übungen desselben Feldes starten direkt bei der Übung.
  if (entry.showSource) return card.track === 'read' ? 'read-text' : 'listen-audio';
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
    <div className="kb-hide" style={lockBox}>
      <span style={{ color: 'var(--text-subtle)', display: 'inline-flex' }}><Icon name="lock" /></span>
      <span style={{ font: 'var(--type-body)', color: 'var(--text-muted)' }}>{children}</span>
    </div>
  );
}

function CardBadge({ entry, card, seenBefore }) {
  if (entry.mode === 'retry') return <Badge tone={card.track === 'read' ? 'read' : 'listen'} icon="rotate-ccw" style={{ alignSelf: 'flex-start' }}>Zweiter Versuch</Badge>;
  if (entry.mode === 'popup') return <Badge tone="amber" icon="sparkles" style={{ alignSelf: 'flex-start' }}>Kurzer Test</Badge>;
  if (entry.mode === 'replay') return <Badge tone={card.track} icon={card.track === 'read' ? 'book-open' : 'ear'} style={{ alignSelf: 'flex-start' }}>{card.track === 'read' ? 'Nochmal lesen' : 'Nochmal hören'}</Badge>;
  if (entry.mode === 'new' && !seenBefore) {
    return card.track === 'read'
      ? <Badge tone="read" icon="book-open" style={{ alignSelf: 'flex-start' }}>Neuer Text</Badge>
      : <Badge tone="listen" icon="ear" style={{ alignSelf: 'flex-start' }}>Neue Karte</Badge>;
  }
  return <Badge tone="amber" icon="history" style={{ alignSelf: 'flex-start' }}>Erinnerst du dich noch?</Badge>;
}

/** Badge links, Zähler "Frage X von Y" (bezogen auf die Teilübungen des Feldes) rechts. */
function ExerciseTop({ entry, card, seenBefore }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
      <CardBadge entry={entry} card={card} seenBefore={seenBefore} />
      {entry.feld && (
        <span aria-live="polite" style={{ font: 'var(--type-label)', fontWeight: 700, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
          Frage {entry.feld.n} von {entry.feld.of}
        </span>
      )}
    </div>
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
function useSpeech(item, auto = false) {
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState(false);
  const [who, setWho] = useState(null);
  const stop = useRef(() => {});
  const done = () => { setPlaying(false); setWho(null); };
  const viaDevice = (manual) => {
    stop.current = speakSegments(deviceSegments(item), {
      onSegment: (w) => setWho(w),
      onEnd: done,
      onError: () => { done(); if (manual) setError(true); },
    });
  };
  const start = (manual = true) => {
    stop.current();
    setError(false);
    setPlaying(true);
    if (!hasAudio(item.id)) return viaDevice(manual);
    stop.current = playItem(item.id, {
      onSegment: (w) => setWho(w),
      onEnd: done,
      onBlocked: done, // Autoplay gesperrt (iOS): Antippen genügt
      onError: () => viaDevice(manual),
    });
    return undefined;
  };
  const stopNow = () => { stop.current(); done(); };
  const toggle = () => { if (playing) stopNow(); else start(true); };
  useEffect(() => {
    if (auto) start(false);
    return () => { stop.current(); stopSpeaking(); };
  }, [item.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return { playing, error, who, toggle, start, stop: stopNow, retry: () => start(true) };
}

function TtsError({ onRetry, onShowText }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 16px', borderRadius: 'var(--radius-md)', background: 'var(--surface-locked)', textAlign: 'left' }}>
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
function SpeakerAvatar({ speaker, active, size }) {
  return (
    <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, width: size + 24 }}>
      <span style={{ position: 'relative', width: size, height: size }}>
        {active && <span aria-hidden="true" className="rm-static" style={{ position: 'absolute', inset: -8, borderRadius: '50%', border: '3px solid var(--track-listen)', animation: 'spur-speak 900ms var(--ease-sine) infinite alternate' }} />}
        <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: active ? 'var(--track-listen)' : 'var(--track-listen-soft)', color: active ? '#fff' : 'var(--track-listen-shade)',
          font: 'var(--type-title)', fontSize: Math.round(size * 0.34), transition: 'background var(--dur-fast) var(--ease-out-soft), color var(--dur-fast) var(--ease-out-soft)' }}>
          {speaker.initials}
        </span>
      </span>
      <span style={{ font: 'var(--type-label)', fontWeight: 700, color: active ? 'var(--text-ink)' : 'var(--text-muted)', textAlign: 'center', lineHeight: 1.25 }}>
        {speaker.name}
        {speaker.relation && <span style={{ display: 'block', fontWeight: 500, color: 'var(--text-subtle)' }}>{speaker.relation}</span>}
      </span>
    </span>
  );
}

const MAX_PLAYS = 2;

/* ---- Schritt 1: Nur zuhören (neue Karten) ------------------------------------
   Kein Text, keine Frage — nur die Stimmen. Höchstens zwei Wiedergaben, "Weiter"
   erst nach der ersten. Bei fälligen Wiederholungen gibt es diesen Schritt nicht. */
function ListenOnly({ entry, card, onNext }) {
  const speech = useSpeech(card.item);
  const [plays, setPlays] = useState(0);
  const [heard, setHeard] = useState(false);
  const [showText, setShowText] = useState(false);
  const speakers = dialogSpeakers(card.item);
  const wasPlaying = useRef(false);
  useEffect(() => {
    if (wasPlaying.current && !speech.playing) setHeard(true);
    wasPlaying.current = speech.playing;
  }, [speech.playing]);
  const left = MAX_PLAYS - plays;
  const play = () => {
    if (speech.playing) { speech.stop(); return; }
    if (left <= 0) return;
    setPlays((n) => n + 1);
    speech.start(true);
  };
  const activeName = speech.playing ? (speech.who || (speakers.length === 1 ? speakers[0].name : null)) : null;
  const size = speakers.length > 2 ? 64 : speakers.length === 2 ? 76 : 96;
  return (
    <>
      <div style={{ ...body, alignItems: 'center', textAlign: 'center', justifyContent: 'safe center', gap: 'clamp(12px, 3dvh, 22px)' }}>
        <span style={{ alignSelf: 'flex-start' }}><CardBadge entry={entry} card={card} /></span>
        <div className="stack" style={{ gap: 6, alignItems: 'center' }}>
          <h2 style={{ font: 'var(--type-title)' }}>Hör genau hin.</h2>
          <p style={{ font: 'var(--type-body)', color: 'var(--text-muted)', maxWidth: 300 }}>Die Fragen kommen danach. Den Text siehst du nicht — nur die Stimmen zählen.</p>
        </div>
        {speakers.length ? (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, flexWrap: 'wrap' }}>
            {speakers.map((sp) => <SpeakerAvatar key={sp.id} speaker={sp} size={size} active={activeName === sp.name} />)}
          </div>
        ) : (
          <span className={speech.playing ? 'a-bob' : undefined}><Mascot pose="listening" size={110} /></span>
        )}
        {speech.error && !showText && <TtsError onRetry={() => { speech.retry(); }} onShowText={() => { setShowText(true); setHeard(true); }} />}
        {showText && (
          <Card tone="listen" padding={16} elevated={false} style={{ textAlign: 'left', width: '100%' }}><DialogText item={card.item} /></Card>
        )}
        <div className="stack" style={{ alignItems: 'center', gap: 10 }}>
          <button type="button" onClick={play} disabled={!speech.playing && left <= 0}
            aria-label={speech.playing ? 'Wiedergabe stoppen' : 'Gespräch abspielen'}
            style={{ width: 84, height: 84, borderRadius: '50%', border: 'none', cursor: !speech.playing && left <= 0 ? 'not-allowed' : 'pointer',
              background: !speech.playing && left <= 0 ? 'var(--surface-locked)' : 'var(--track-listen)',
              color: !speech.playing && left <= 0 ? 'var(--text-subtle)' : '#fff',
              boxShadow: !speech.playing && left <= 0 ? 'none' : '0 6px 0 var(--track-listen-shade)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
            {speech.playing
              ? [0, 140, 280, 420].map((d) => <span key={d} className="rm-static" style={{ width: 5, height: 16, borderRadius: 999, background: '#fff', animation: `spur-eq 700ms ease-in-out ${d}ms infinite` }} />)
              : <Icon name={plays > 0 ? 'rotate-ccw' : 'play'} size={36} strokeWidth={2.4} fill={plays > 0 ? 'none' : 'currentColor'} />}
          </button>
          <span aria-live="polite" style={{ font: 'var(--type-label)', fontWeight: 600, color: 'var(--text-muted)' }}>
            {plays === 0 ? `Du kannst es ${MAX_PLAYS}× hören.` : left > 0 ? `${plays} von ${MAX_PLAYS} Wiedergaben` : 'Beide Wiedergaben genutzt.'}
          </span>
        </div>
      </div>
      <div className="lesson-cta"><Button variant="listen" full disabled={!heard || speech.playing} onClick={() => { speech.stop(); onNext(); }}>Weiter zu den Fragen</Button></div>
    </>
  );
}

/* ---- 1d Frage (Zuhören und Lesen, neu wie fällig) ------------------------- */
function contextLine(entry, card, rec) {
  const d = daysSinceFirst(rec);
  const when = entry.mode === 'new' && !rec ? 'von eben' : d > 0 ? daysAgoText(d) : 'von heute';
  if (card.track === 'read') return `Aus dem Text „${card.item.topic}“, ${d > 0 && !(entry.mode === 'new' && !rec) ? 'gelesen ' + daysAgoText(d) : 'gerade gelesen'}.`;
  return `Aus dem Gespräch ${when}.`;
}

function RecallQuestion({ entry, card, rec, answer, setAnswer, onCheck }) {
  const read = card.track === 'read';
  return (
    <>
      <div style={{ ...body, gap: 18 }}>
        <ExerciseTop entry={entry} card={card} seenBefore={entry.mode !== 'new'} />
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <Mascot pose={read ? 'neutral' : 'listening'} size={64} className="kb-hide" />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 2 }}>
            <h2 style={{ font: 'var(--type-title)', textWrap: 'pretty' }}>{card.question.prompt}</h2>
            <p style={{ font: 'var(--type-body)', color: 'var(--text-muted)' }}>{contextLine(entry, card, rec)}</p>
          </div>
        </div>
        <LockHint>{read ? 'Das Buch bleibt zu — antworte aus dem Kopf.' : 'Der Originaltext bleibt aus — das ist der Sinn der Sache.'}</LockHint>
        <TextField value={answer} onChange={(e) => setAnswer(e.target.value)} rows={4} placeholder="Schreib auf, woran du dich erinnerst …" hint="Stichworte reichen." />
      </div>
      <div className="lesson-cta"><Button variant={read ? 'read' : 'primary'} full disabled={!answer.trim()} onClick={onCheck}>Prüfen</Button></div>
    </>
  );
}

/* ---- detail_match: Antwort-Chips -------------------------------------------- */
function MatchExercise({ entry, card, rec, onCheck }) {
  const ex = card.ex;
  const multi = ex.correct.length > 1;
  const options = seededShuffle(ex.options, card.id);
  const [sel, setSel] = useState([]);
  const toggle = (o) => setSel((cur) => (cur.includes(o) ? cur.filter((x) => x !== o) : multi ? [...cur, o] : [o]));
  const tone = card.track === 'read' ? 'read' : 'listen';
  return (
    <>
      <div style={{ ...body, gap: 18 }}>
        <ExerciseTop entry={entry} card={card} seenBefore={entry.mode !== 'new'} />
        <div className="stack" style={{ gap: 6 }}>
          <h2 style={{ font: 'var(--type-title)', textWrap: 'pretty' }}>{ex.prompt}</h2>
          <p style={{ font: 'var(--type-body)', color: 'var(--text-muted)' }}>{contextLine(entry, card, rec)} {multi ? 'Mehrere Antworten sind richtig.' : 'Eine Antwort ist richtig.'}</p>
        </div>
        <div role="group" aria-label="Antworten" style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          {options.map((o) => {
            const on = sel.includes(o);
            return (
              <button key={o} type="button" aria-pressed={on} onClick={() => toggle(o)}
                style={{ padding: '12px 16px', minHeight: 48, borderRadius: 'var(--radius-md)', cursor: 'pointer', textAlign: 'left',
                  font: 'var(--type-body)', fontSize: 'var(--text-body-l)', fontWeight: 600,
                  border: `2px solid ${on ? `var(--track-${tone})` : 'var(--border-default)'}`,
                  background: on ? `var(--track-${tone}-soft)` : 'var(--surface-card)', color: 'var(--text-ink)',
                  boxShadow: on ? `0 3px 0 var(--track-${tone})` : '0 3px 0 var(--border-default)',
                  transition: 'background var(--dur-fast) var(--ease-out-soft), border-color var(--dur-fast) var(--ease-out-soft)' }}>
                {o}
              </button>
            );
          })}
        </div>
      </div>
      <div className="lesson-cta"><Button variant={tone === 'read' ? 'read' : 'primary'} full disabled={!sel.length} onClick={() => onCheck({ ...gradeMatch(sel, ex.correct), selected: sel })}>Prüfen</Button></div>
    </>
  );
}

/* ---- sequence_events: Ereignisse in Reihenfolge antippen --------------------- */
function SequenceExercise({ entry, card, rec, onCheck }) {
  const ex = card.ex;
  let shuffled = seededShuffle(ex.events, card.id);
  if (shuffled.every((e, i) => e === ex.events[i])) shuffled = [...shuffled.slice(1), shuffled[0]];
  const [order, setOrder] = useState([]);
  const tap = (e) => setOrder((cur) => (cur.includes(e) ? cur.filter((x) => x !== e) : [...cur, e]));
  const tone = card.track === 'read' ? 'read' : 'listen';
  const done = order.length === ex.events.length;
  return (
    <>
      <div style={{ ...body, gap: 18 }}>
        <ExerciseTop entry={entry} card={card} seenBefore={entry.mode !== 'new'} />
        <div className="stack" style={{ gap: 6 }}>
          <h2 style={{ font: 'var(--type-title)', textWrap: 'pretty' }}>{ex.prompt}</h2>
          <p style={{ font: 'var(--type-body)', color: 'var(--text-muted)' }}>Tipp die Ereignisse der Reihe nach an. Nochmal tippen nimmt eins zurück.</p>
        </div>
        <div className="stack" style={{ gap: 10 }}>
          {shuffled.map((e) => {
            const n = order.indexOf(e);
            const on = n >= 0;
            return (
              <button key={e} type="button" onClick={() => tap(e)} aria-label={on ? `${e}, Position ${n + 1}` : e}
                style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '12px 14px', minHeight: 56, cursor: 'pointer', textAlign: 'left',
                  borderRadius: 'var(--radius-md)', border: `2px solid ${on ? `var(--track-${tone})` : 'var(--border-default)'}`,
                  background: on ? `var(--track-${tone}-soft)` : 'var(--surface-card)', color: 'var(--text-ink)',
                  transition: 'background var(--dur-fast) var(--ease-out-soft), border-color var(--dur-fast) var(--ease-out-soft)' }}>
                <span style={{ width: 30, height: 30, borderRadius: '50%', flex: '0 0 auto', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  font: 'var(--type-label)', fontWeight: 700, background: on ? `var(--track-${tone})` : 'var(--surface-locked)', color: on ? '#fff' : 'var(--text-subtle)',
                  transition: 'background var(--dur-fast) var(--ease-out-soft)' }}>
                  {on ? n + 1 : ''}
                </span>
                <span style={{ font: 'var(--type-body)', fontSize: 'var(--text-body-l)' }}>{e}</span>
              </button>
            );
          })}
        </div>
        {order.length > 0 && <button type="button" onClick={() => setOrder([])} style={{ alignSelf: 'flex-start', background: 'none', border: 'none', cursor: 'pointer', font: 'var(--type-label)', color: 'var(--text-link)', padding: '4px 0' }}>Neu anfangen</button>}
      </div>
      <div className="lesson-cta"><Button variant={tone === 'read' ? 'read' : 'primary'} full disabled={!done} onClick={() => onCheck({ ...gradeSequence(order, ex.events), order })}>Prüfen</Button></div>
    </>
  );
}

/* ---- 1e Lesen, neuer Text -------------------------------------------------- */
function ReadText({ entry, card, onClose, tts }) {
  const item = card.item;
  const speech = useSpeech(item);
  return (
    <>
      <div style={{ ...body, gap: 14 }}>
        <CardBadge entry={entry} card={card} />
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <h2 style={{ font: 'var(--type-title)', textWrap: 'pretty' }}>{item.title}</h2>
          {tts && <SpeakButton playing={speech.playing} onClick={speech.toggle} size={44} label="Text vorlesen" />}
        </div>
        <span style={{ font: 'var(--type-label)', fontWeight: 500, color: 'var(--text-subtle)' }}>Sachtext · etwa {readSeconds(item)} Sekunden</span>
        {speech.error && <TtsError onRetry={speech.retry} />}
        <Card padding={20} style={{ maxWidth: 'var(--content-max)' }}>
          {item.paragraphs.map((p, i) => <p key={i} style={{ font: 'var(--type-body-l)', margin: i < item.paragraphs.length - 1 ? '0 0 14px' : 0 }}>{p}</p>)}
        </Card>
      </div>
      <div className="lesson-cta"><Button variant="read" full icon="book" onClick={() => { stopSpeaking(); onClose(); }}>Buch zuklappen &amp; wiedergeben</Button></div>
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
        <div className="stack" style={{ gap: 6 }}>
          <span className="overline" style={{ color: 'var(--track-read-shade)' }}>Thema</span>
          <h2 style={{ font: 'var(--type-title)' }}>{item.topic}</h2>
          <p style={{ font: 'var(--type-body)', color: 'var(--text-muted)' }}>{meta}</p>
        </div>
        <LockHint>Das Buch bleibt zu. Erzähl es frei.</LockHint>
        <TextField value={answer} onChange={(e) => setAnswer(e.target.value)} rows={7} placeholder="Erzähl den Text so, wie du ihn jemandem erklären würdest …" hint="Reihenfolge ist egal." />
      </div>
      <div className="lesson-cta"><Button variant="read" full disabled={!answer.trim()} onClick={onCompare}>Mit Kernpunkten vergleichen</Button></div>
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
        {entry.feld && <span style={{ alignSelf: 'flex-end', font: 'var(--type-label)', fontWeight: 700, color: 'var(--text-muted)' }}>Frage {entry.feld.n} von {entry.feld.of}</span>}
        <div className="stack" style={{ gap: 4 }}>
          <h2 style={{ font: 'var(--type-title)' }}>Was hast du getroffen?</h2>
          <p style={{ font: 'var(--type-body)', color: 'var(--text-muted)' }}>Tipp an, was in deiner Wiedergabe vorkam. Du bewertest dich selbst.</p>
        </div>
        <Card tone="lavender" padding={16} elevated={false}>
          <span className="overline" style={{ color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>Deine Wiedergabe</span>
          <p style={{ font: 'var(--type-body)', whiteSpace: 'pre-wrap' }}>{answer}</p>
        </Card>
        <span className="overline" style={{ color: 'var(--track-read-shade)' }}>Kernpunkte</span>
        <div className="stack" style={{ gap: 10 }}>
          {pts.map((kp, i) => (
            <button key={kp} type="button" role="checkbox" aria-checked={!!checks[i]} onClick={() => setChecks((c) => { const n = [...c]; n[i] = !n[i]; return n; })}
              style={{ display: 'flex', alignItems: 'flex-start', gap: 12, width: '100%', padding: '14px 16px', background: checks[i] ? 'var(--state-correct-soft)' : 'var(--surface-card)',
                border: `2px solid ${checks[i] ? 'var(--spur-green)' : 'var(--border-default)'}`, borderRadius: 'var(--radius-md)', cursor: 'pointer', textAlign: 'left',
                transition: 'background var(--dur-fast) var(--ease-out-soft), border-color var(--dur-fast) var(--ease-out-soft)' }}>
              <span style={{ color: checks[i] ? 'var(--spur-green)' : 'var(--spur-locked)', display: 'inline-flex', transition: 'color var(--dur-fast) var(--ease-out-soft)' }}>
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
        <Button variant="read" full onClick={onDone}>Weiter</Button>
      </div>
    </>
  );
}

/* ---- 1g / 1h Feedback --------------------------------------------------------- */
function Feedback({ entry, card, rec, answer, result, combo, infiniteSaved, onOverride, onNext }) {
  const grade = result.override ? 'good' : result.grade;
  const kind = card.kind;
  const state = grade === 'good' ? 'correct' : grade === 'partial' ? 'partial' : 'wrong';
  const d = daysSinceFirst(rec);
  const after = entry.mode === 'review' && d > 0 ? ` — nach ${d} ${d === 1 ? 'Tag' : 'Tagen'}.` : '.';
  let detail;
  let source = null;
  let sourceLabel = 'Im Original';
  if (kind === 'retell') {
    const missing = card.item.keyPoints.filter((_, i) => !result.checks[i]);
    detail = grade === 'good'
      ? `${result.hits} von ${result.total} Kernpunkten${after}`
      : grade === 'partial' ? `${result.hits} von ${result.total} Kernpunkten. Die fehlenden kommen wieder.` : `${result.hits} von ${result.total} Kernpunkten.`;
    if (grade !== 'good' && missing.length) { source = missing; sourceLabel = 'Fehlte noch'; }
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
  const title = kind === 'retell' ? card.item.topic : card.question.prompt;
  const mark = (ok) => ({ border: `2px solid ${ok ? 'var(--spur-green)' : 'var(--spur-coral)'}`, background: ok ? 'var(--state-correct-soft)' : 'var(--state-wrong-soft)' });
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
    yourAnswer = <TextField value={answer} state={state} rows={read ? 4 : 2} disabled label={read ? 'Deine Wiedergabe' : undefined} />;
  }
  const pose = grade === 'good' ? 'cheering' : grade === 'partial' ? 'neutral' : 'disappointed';
  return (
    <>
      <div style={body}>
        <ExerciseTop entry={entry} card={card} seenBefore={entry.mode !== 'new'} />
        <h2 style={{ font: 'var(--type-title)', textWrap: 'pretty' }}>{title}</h2>
        {yourAnswer}
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
          <Badge tone="amber" variant="solid" icon="feather" style={{ alignSelf: 'flex-start', animation: 'spur-popin 420ms cubic-bezier(.34,1.56,.64,1) 200ms both' }}>+{XP[grade]} Federn</Badge>
          {combo >= 3 && grade === 'good' && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px 8px 10px', borderRadius: 999, background: 'var(--accent-xp-soft)', color: 'var(--badge-amber-fg, var(--spur-amber-shade))', font: 'var(--type-label)', fontWeight: 700, animation: 'spur-popin 460ms cubic-bezier(.34,1.56,.64,1) 400ms both' }}>
                <Icon name="flame" size={18} fill="currentColor" />{combo} richtig in Folge
              </span>
              <span style={{ display: 'flex', gap: 4, animation: 'spur-rise 320ms cubic-bezier(.22,.8,.3,1) 600ms both' }}>
                {[0, 1, 2].map((i) => <span key={i} style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--spur-amber)', animation: i === 2 ? 'spur-popin 420ms cubic-bezier(.34,1.56,.64,1) 700ms both' : undefined }} />)}
              </span>
            </span>
          )}
        </div>
        {infiniteSaved && (
          <span style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px 8px 10px', borderRadius: 999, background: 'var(--accent-xp-soft)', color: 'var(--badge-amber-fg, var(--spur-amber-shade))', font: 'var(--type-label)', fontWeight: 700, animation: 'spur-popin 420ms cubic-bezier(.34,1.56,.64,1) 500ms both' }}>
            <Icon name="shield" size={18} />Kein Herz verloren — heute unendlich
          </span>
        )}
        {kind === 'recall' && result.grade !== 'good' && (
          <button type="button" onClick={onOverride}
            style={{ alignSelf: 'flex-start', background: 'none', border: 'none', padding: '6px 0', cursor: 'pointer', font: 'var(--type-label)', color: 'var(--text-link)', textDecoration: result.override ? 'none' : 'underline', textUnderlineOffset: 3 }}>
            {result.override ? 'Zählt als gemerkt.' : 'Meine Antwort meinte dasselbe — als gemerkt zählen'}
          </button>
        )}
      </div>
      <div style={{ flex: '0 0 auto', position: 'relative' }}>
        <div className="fb-mascot" style={{ display: 'flex', justifyContent: 'center', marginBottom: -14, position: 'relative', zIndex: 2 }}>
          <span key={pose} style={{ display: 'inline-flex', animation: 'spur-popin 460ms cubic-bezier(.34,1.56,.64,1) both' }}><Mascot pose={pose} size={96} /></span>
        </div>
        <FeedbackPanel state={state} detail={detail} source={source} sourceLabel={sourceLabel} onAction={onNext} />
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
  const [phase, setPhase] = useState(() => firstPhase(entry, card));
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

  const showFeedback = (r) => {
    setResult(r);
    setPhase('feedback');
    committed.current = false;
    if (r.grade === 'poor' && entry.mode === 'new' && !infinite && state.progress.hearts > 0) setShake((n) => n + 1);
    if (s.sounds) sounds[r.grade]?.();
    if (r.grade === 'good' && navigator.vibrate) try { navigator.vibrate(12); } catch { /* ignore */ }
  };

  const check = () => showFeedback(gradeListen(answer, card.question.answers));

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
    onFinish({ ...stats.current, ...agg.current, kind: session.kind });
  };

  const advance = (after) => {
    let list = entriesRef.current;
    // Aufmerksamkeit aufgebraucht: neue Karten fallen weg, Wiederholungen bleiben.
    if (after && after.progress.hearts <= 0 && !isInfinite(after.progress)) {
      list = [...list.slice(0, pos + 1), ...list.slice(pos + 1).filter((e) => e.mode !== 'new')];
      setEntries(list);
    }
    if (pos + 1 >= list.length) return finish();
    const next = list[pos + 1];
    setPos(pos + 1);
    setAnswer('');
    setChecks([]);
    setResult(null);
    setIntervalInfo(null);
    setPhase(firstPhase(next, index.cards.get(next.cardId)));
    return undefined;
  };

  const next = () => {
    const c = commit();
    // Nicht gemeisterte Feld-Übung: ein zweiter Versuch am Ende der Runde (ohne Herz, ohne Intervall-Änderung).
    if (c && c.grade === 'poor' && entry.feld && entry.mode === 'new') {
      setEntries((cur) => [...cur, { cardId: entry.cardId, mode: 'retry', showSource: false, feld: { ...entry.feld, n: entry.feld.n } }]);
    }
    if (c && entry.mode === 'review' && c.grade === 'good' && c.events.prevStage >= 0) {
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
        if (p.doneTodayDay === dayKey()) p.doneToday = Math.max(0, p.doneToday - snap.answered);
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

  let view;
  if (phase === 'listen-audio') {
    view = <ListenOnly entry={entry} card={card} onNext={() => setPhase(exercisePhase(card))} />;
  } else if (phase === 'question') {
    view = <RecallQuestion entry={entry} card={card} rec={rec} answer={answer} setAnswer={setAnswer} onCheck={check} />;
  } else if (phase === 'match') {
    view = <MatchExercise key={entry.cardId + pos} entry={entry} card={card} rec={rec} onCheck={showFeedback} />;
  } else if (phase === 'sequence') {
    view = <SequenceExercise key={entry.cardId + pos} entry={entry} card={card} rec={rec} onCheck={showFeedback} />;
  } else if (phase === 'read-text') {
    view = <ReadText entry={entry} card={card} tts={s.tts} onClose={() => setPhase(exercisePhase(card))} />;
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
      {phase !== 'interval' && (
        <LessonHeader progress={progress} tone={tone} hearts={Math.max(0, shownHearts)} infinite={infinite} heartShake={shake} onClose={() => setAbort(true)} />
      )}
      {view}
      <Sheet open={abort} title="Session abbrechen?" onClose={() => setAbort(false)}>
        <p style={{ font: 'var(--type-body-l)', color: 'var(--text-muted)', marginTop: -4 }}>
          {feldBefore.current
            ? 'Das Feld zählt dann noch nicht. Beim nächsten Mal fängst du es von vorn an — ohne Vorwurf.'
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
