import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store.jsx';
import { Icon } from '../ds/Icon.jsx';
import { Button } from '../ds/Button.jsx';
import { IconButton, SpeakButton } from '../ds/IconButton.jsx';
import { Badge, Card, TextField } from '../ds/core.jsx';
import { FeedbackPanel, Mascot, Sheet, SpeechBubble } from '../ds/feedback.jsx';
import { LessonHeader } from '../ds/progress.jsx';
import { IntervalStep } from './IntervalStep.jsx';
import { gradeKeyPoints, gradeListen } from '../engine/answer.js';
import { commitAnswer, isInfinite, markLessonDone } from '../engine/game.js';
import { XP } from '../engine/srs.js';
import { dayKey, daysBetween } from '../engine/dates.js';
import { dialogPlainText, readSeconds } from '../engine/content.js';
import { speak, stopSpeaking } from '../lib/tts.js';
import { hasAudio, playItem } from '../lib/audio.js';
import { sounds } from '../lib/sound.js';
import { daysAgoText } from '../lib/format.js';

const body = { flex: 1, minHeight: 0, overflowY: 'auto', padding: '10px var(--gutter-screen) 16px', display: 'flex', flexDirection: 'column', gap: 16 };
const cta = { flex: '0 0 auto', padding: '8px var(--gutter-screen) calc(24px + env(safe-area-inset-bottom))' };
const lockBox = { display: 'flex', alignItems: 'center', gap: 12, background: 'var(--surface-locked)', borderRadius: 'var(--radius-md)', padding: '14px 16px' };

function firstPhase(entry, card) {
  if (card.track === 'read') return entry.showSource ? 'read-text' : 'read-recall';
  return 'question';
}

function daysSinceFirst(rec) {
  if (!rec?.first) return 0;
  return daysBetween(dayKey(new Date(rec.first)), dayKey());
}

function LockHint({ children }) {
  return (
    <div style={lockBox}>
      <span style={{ color: 'var(--text-subtle)', display: 'inline-flex' }}><Icon name="lock" /></span>
      <span style={{ font: 'var(--type-body)', color: 'var(--text-muted)' }}>{children}</span>
    </div>
  );
}

function CardBadge({ entry, card, seenBefore }) {
  if (entry.mode === 'replay') return <Badge tone={card.track} icon={card.track === 'read' ? 'book-open' : 'ear'} style={{ alignSelf: 'flex-start' }}>{card.track === 'read' ? 'Nochmal lesen' : 'Nochmal hören'}</Badge>;
  if (entry.mode === 'new' && !seenBefore) {
    return card.track === 'read'
      ? <Badge tone="read" icon="book-open" style={{ alignSelf: 'flex-start' }}>Neuer Text</Badge>
      : <Badge tone="listen" icon="ear" style={{ alignSelf: 'flex-start' }}>Neue Karte</Badge>;
  }
  return <Badge tone="amber" icon="history" style={{ alignSelf: 'flex-start' }}>Erinnerst du dich noch?</Badge>;
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
 * Vorlesen mit Fehlerzustand (4e). Bevorzugt die mitgelieferten Audios (echte
 * Stimmen, eine pro Person); fehlt eins oder klappt es nicht, liest die Gerätestimme.
 * Automatisch nur, wenn "Miro liest vor" an ist.
 */
function useSpeech(itemId, text, auto) {
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState(false);
  const stop = useRef(() => {});
  const viaDevice = (manual) => {
    stop.current = speak(text, {
      onEnd: () => setPlaying(false),
      onError: () => { setPlaying(false); if (manual) setError(true); },
    });
  };
  const start = (manual = true) => {
    stop.current();
    setError(false);
    setPlaying(true);
    if (!hasAudio(itemId)) return viaDevice(manual);
    stop.current = playItem(itemId, {
      onEnd: () => setPlaying(false),
      onBlocked: () => setPlaying(false), // Autoplay gesperrt (iOS): Lautsprecher antippen genügt
      onError: () => viaDevice(manual),
    });
    return undefined;
  };
  const toggle = () => { if (playing) { stop.current(); setPlaying(false); } else start(true); };
  useEffect(() => {
    if (auto) start(false);
    return () => { stop.current(); stopSpeaking(); };
  }, [itemId]); // eslint-disable-line react-hooks/exhaustive-deps
  return { playing, error, toggle, retry: () => start(true) };
}

function TtsError({ onRetry }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '14px 16px', borderRadius: 'var(--radius-md)', background: 'var(--surface-locked)' }}>
      <span style={{ color: 'var(--text-muted)', display: 'inline-flex' }}><Icon name="volume-x" /></span>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
        <span style={{ font: 'var(--type-body)', fontWeight: 700, color: 'var(--text-ink)' }}>Vorlesen klappt gerade nicht.</span>
        <span style={{ font: 'var(--type-body)', color: 'var(--text-muted)' }}>Lies den Dialog einfach selbst — die Frage kommt trotzdem später.</span>
        <span style={{ display: 'flex' }}><Button variant="secondary" size="sm" icon="rotate-ccw" onClick={onRetry}>Nochmal versuchen</Button></span>
      </span>
    </div>
  );
}

/* ---- 1c Zuhören, neue Karte ----------------------------------------------- */
function ListenNew({ entry, card, answer, setAnswer, onCheck, tts }) {
  const speech = useSpeech(card.item.id, dialogPlainText(card.item), tts);
  return (
    <>
      <div style={body}>
        <CardBadge entry={entry} card={card} />
        {speech.error ? <TtsError onRetry={speech.retry} /> : (
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <Mascot pose="listening" size={78} />
            <SpeechBubble tail="left" style={{ flex: 1 }}>Hör einmal zu. Ich frage später nach — nicht sofort.</SpeechBubble>
          </div>
        )}
        <Card tone="listen" padding={16} elevated={false} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          {tts && <SpeakButton playing={speech.playing} onClick={speech.toggle} label="Dialog vorlesen" />}
          <DialogText item={card.item} />
        </Card>
        <h3 style={{ font: 'var(--type-headline)', margin: '4px 0 0' }}>{card.question.prompt}</h3>
        <TextField value={answer} onChange={(e) => setAnswer(e.target.value)} rows={3} placeholder="Schreib auf, woran du dich erinnerst …" hint="Stichworte reichen." />
      </div>
      <div style={cta}><Button full disabled={!answer.trim()} onClick={onCheck}>Prüfen</Button></div>
    </>
  );
}

/* ---- 1d Zuhören, fällige Wiederholung (auch Folgefragen) ------------------- */
function ListenRecall({ entry, card, rec, answer, setAnswer, onCheck }) {
  const d = daysSinceFirst(rec);
  const from = entry.mode === 'new' ? 'Aus dem Gespräch von eben.' : d > 0 ? `Aus dem Gespräch ${daysAgoText(d)}.` : 'Aus dem Gespräch von heute.';
  return (
    <>
      <div style={{ ...body, gap: 18 }}>
        <CardBadge entry={entry} card={card} seenBefore={entry.mode !== 'new'} />
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <Mascot pose="listening" size={64} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 2 }}>
            <h2 style={{ font: 'var(--type-title)', textWrap: 'pretty' }}>{card.question.prompt}</h2>
            <p style={{ font: 'var(--type-body)', color: 'var(--text-muted)' }}>{from}</p>
          </div>
        </div>
        <LockHint>Der Originaltext bleibt aus — das ist der Sinn der Sache.</LockHint>
        <TextField value={answer} onChange={(e) => setAnswer(e.target.value)} rows={4} placeholder="Schreib auf, woran du dich erinnerst …" hint="Stichworte reichen." />
      </div>
      <div style={cta}><Button full disabled={!answer.trim()} onClick={onCheck}>Prüfen</Button></div>
    </>
  );
}

/* ---- 1e Lesen, neuer Text -------------------------------------------------- */
function ReadText({ entry, card, onClose, tts }) {
  const item = card.item;
  const speech = useSpeech(item.id, `${item.title}. ${item.paragraphs.join(' ')}`, false);
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
      <div style={cta}><Button variant="read" full icon="book" onClick={() => { stopSpeaking(); onClose(); }}>Buch zuklappen &amp; wiedergeben</Button></div>
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
        <CardBadge entry={entry} card={card} seenBefore={!entry.showSource && entry.mode !== 'new'} />
        <div className="stack" style={{ gap: 6 }}>
          <span className="overline" style={{ color: 'var(--track-read-shade)' }}>Thema</span>
          <h2 style={{ font: 'var(--type-title)' }}>{item.topic}</h2>
          <p style={{ font: 'var(--type-body)', color: 'var(--text-muted)' }}>{meta}</p>
        </div>
        <LockHint>Das Buch bleibt zu. Erzähl es frei.</LockHint>
        <TextField value={answer} onChange={(e) => setAnswer(e.target.value)} rows={7} placeholder="Erzähl den Text so, wie du ihn jemandem erklären würdest …" hint="Reihenfolge ist egal." />
      </div>
      <div style={cta}><Button variant="read" full disabled={!answer.trim()} onClick={onCompare}>Mit Kernpunkten vergleichen</Button></div>
    </>
  );
}

/* ---- 2d Kernpunkte abhaken -------------------------------------------------- */
function KeyPoints({ card, answer, checks, setChecks, onDone }) {
  const pts = card.item.keyPoints;
  const hits = checks.filter(Boolean).length;
  const enough = gradeKeyPoints(hits, pts.length).grade === 'good';
  return (
    <>
      <div style={body}>
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
      <div style={{ ...cta, display: 'flex', flexDirection: 'column', gap: 10 }}>
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
  const read = card.track === 'read';
  const state = grade === 'good' ? 'correct' : grade === 'partial' ? 'partial' : 'wrong';
  const d = daysSinceFirst(rec);
  const after = entry.mode === 'review' && d > 0 ? ` — nach ${d} ${d === 1 ? 'Tag' : 'Tagen'}.` : '.';
  let detail;
  let source = null;
  let sourceLabel = 'Im Original';
  if (read) {
    const missing = card.item.keyPoints.filter((_, i) => !result.checks[i]);
    detail = grade === 'good'
      ? `${result.hits} von ${result.total} Kernpunkten${after}`
      : grade === 'partial' ? `${result.hits} von ${result.total} Kernpunkten. Die fehlenden kommen wieder.` : `${result.hits} von ${result.total} Kernpunkten.`;
    if (grade !== 'good' && missing.length) { source = missing; sourceLabel = 'Fehlte noch'; }
  } else {
    const q = card.question;
    detail = grade === 'good' ? `Genau das war es${after}` : grade === 'partial' ? `Ein Teil saß. Gesucht war: ${q.solution}` : `Gesucht war: ${q.solution}`;
    if (grade !== 'good' && q.quote) source = q.quote;
  }
  const pose = grade === 'good' ? 'cheering' : grade === 'partial' ? 'neutral' : 'disappointed';
  return (
    <>
      <div style={body}>
        <CardBadge entry={entry} card={card} seenBefore={entry.mode !== 'new'} />
        <h2 style={{ font: 'var(--type-title)', textWrap: 'pretty' }}>{read ? card.item.topic : card.question.prompt}</h2>
        <TextField value={answer} state={state} rows={read ? 4 : 2} disabled label={read ? 'Deine Wiedergabe' : undefined} />
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
        {!read && result.grade !== 'good' && (
          <button type="button" onClick={onOverride}
            style={{ alignSelf: 'flex-start', background: 'none', border: 'none', padding: '6px 0', cursor: 'pointer', font: 'var(--type-label)', color: 'var(--text-link)', textDecoration: result.override ? 'none' : 'underline', textUnderlineOffset: 3 }}>
            {result.override ? 'Zählt als gemerkt.' : 'Meine Antwort meinte dasselbe — als gemerkt zählen'}
          </button>
        )}
      </div>
      <div style={{ flex: '0 0 auto', position: 'relative' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: -14, position: 'relative', zIndex: 2 }}>
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
  const [entries, setEntries] = useState(session.entries);
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
    st.total += 1; st[grade] += 1; st.xp += events.xp;
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
    let list = entries;
    // Aufmerksamkeit aufgebraucht: neue Karten fallen weg, Wiederholungen bleiben.
    if (after && after.progress.hearts <= 0 && !isInfinite(after.progress)) {
      list = [...entries.slice(0, pos + 1), ...entries.slice(pos + 1).filter((e) => e.mode !== 'new')];
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
    if (c && entry.mode === 'review' && c.grade === 'good' && c.events.prevStage >= 0) {
      setIntervalInfo({ from: c.events.prevStage, to: c.events.newStage, after: c.after });
      setPhase('interval');
      return;
    }
    advance(c?.after);
  };

  const quit = () => {
    if (phase === 'feedback') commit();
    stopSpeaking();
    onExit();
  };

  let view;
  if (phase === 'question') {
    view = entry.showSource
      ? <ListenNew entry={entry} card={card} answer={answer} setAnswer={setAnswer} onCheck={check} tts={s.tts} />
      : <ListenRecall entry={entry} card={card} rec={rec} answer={answer} setAnswer={setAnswer} onCheck={check} />;
  } else if (phase === 'read-text') {
    view = <ReadText entry={entry} card={card} tts={s.tts} onClose={() => setPhase('read-recall')} />;
  } else if (phase === 'read-recall') {
    view = <ReadRecall entry={entry} card={card} rec={rec} answer={answer} setAnswer={setAnswer} onCompare={() => { setChecks(card.item.keyPoints.map(() => false)); setPhase('keypoints'); }} />;
  } else if (phase === 'keypoints') {
    view = <KeyPoints card={card} answer={answer} checks={checks} setChecks={setChecks} onDone={keyPointsDone} />;
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
        <p style={{ font: 'var(--type-body-l)', color: 'var(--text-muted)', marginTop: -4 }}>Was du bis hier beantwortet hast, bleibt gezählt. Die restlichen Karten kommen morgen wieder — ohne Vorwurf.</p>
        <div className="stack" style={{ gap: 10 }}>
          <Button full onClick={() => setAbort(false)}>Weitermachen</Button>
          <Button variant="ghost" size="md" full onClick={quit}>Abbrechen</Button>
        </div>
      </Sheet>
    </div>
  );
}
