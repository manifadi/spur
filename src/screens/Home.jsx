import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store.jsx';
import { Icon } from '../ds/Icon.jsx';
import { Button } from '../ds/Button.jsx';
import { IconButton } from '../ds/IconButton.jsx';
import { Badge, Card } from '../ds/core.jsx';
import { Mascot, SpeechBubble } from '../ds/feedback.jsx';
import { GoalRing, HeartsMeter, InfinityPill, PathNode, StreakPill, XPPill } from '../ds/progress.jsx';
import { SettingsSheet } from './Settings.jsx';
import {
  buildPath, doneTodayCount, dueCardIds, hasAnyProgress, isInfinite, nextLessonAfter, daysSinceFirstSeen, isMastered, pickPopup,
} from '../engine/game.js';
import { dayKey, daysBetween } from '../engine/dates.js';
import { Sheet } from '../ds/feedback.jsx';
import { cap, daysAgoText, numWord } from '../lib/format.js';
import { prefersReducedMotion, useCountUp, EASE } from '../lib/motion.js';

const OFFSETS = [0, 56, 82, 40, -14, -56, -82, -40];
const TRACK_NAME = { listen: 'Zuhören', read: 'Lesen', mixed: 'Gemischt' };

function useNarrow() {
  const [narrow, setNarrow] = useState(() => window.innerWidth < 360);
  useEffect(() => {
    const on = () => setNarrow(window.innerWidth < 360);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return narrow;
}

/* ---- Kopfzeile -------------------------------------------------------------- */
export function PathHeader({ xpFrom, xpDelay = 300, streakBump = false, onMenu }) {
  const { state } = useStore();
  const p = state.progress;
  const infinite = isInfinite(p);
  const [tip, setTip] = useState(false);
  const [bump, setBump] = useState(0);
  const xp = useCountUp(p.xp, { from: xpFrom ?? p.xp, delay: xpDelay, run: xpFrom != null && xpFrom !== p.xp });
  useEffect(() => {
    if (!streakBump) return undefined;
    const t = setTimeout(() => setBump(1), 400);
    return () => clearTimeout(t);
  }, [streakBump]);
  useEffect(() => {
    if (!tip) return undefined;
    const t = setTimeout(() => setTip(false), 4000);
    return () => clearTimeout(t);
  }, [tip]);
  return (
    <header className="path-header">
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, minWidth: 0 }}>
        <StreakPill days={p.streak} active={p.streak > 0} bump={bump} />
        <XPPill xp={xp} />
        {infinite ? <InfinityPill onClick={() => setTip((t) => !t)} /> : <HeartsMeter value={p.hearts} size={18} />}
      </div>
      <IconButton icon="menu" label="Menü" size={44} onClick={onMenu} />
      {tip && (
        <div role="tooltip" className="a-rise" style={{ position: 'absolute', top: 'calc(60px + env(safe-area-inset-top))', left: 110, width: 'min(230px, calc(100% - 110px - var(--gutter-screen)))', background: '#1F2130', color: '#fff',
          borderRadius: 'var(--radius-md)', padding: '12px 14px', boxShadow: 'var(--shadow-raised)', animationDuration: '200ms' }}>
          <span style={{ display: 'block', font: 'var(--type-headline)', fontSize: 'var(--text-body)', marginBottom: 2 }}>Unendlich bis Mitternacht</span>
          <span style={{ display: 'block', font: 'var(--type-label)', fontWeight: 500, color: 'rgba(255,255,255,.75)' }}>Belohnung für {p.streak} Tage am Stück. Fehler kosten heute nichts.</span>
        </div>
      )}
    </header>
  );
}

/* ---- Texte ----------------------------------------------------------------- */
function bubbleText(index, state) {
  const p = state.progress;
  if (!hasAnyProgress(state)) {
    return state.settings.track === 'read'
      ? 'Fang hier an. Der erste Text dauert zwei Minuten.'
      : 'Fang hier an. Das erste Gespräch dauert zwei Minuten.';
  }
  if (isInfinite(p)) return 'Heute kannst du nichts verlieren. Guter Tag für was Schweres.';
  const due = dueCardIds(index, state).length;
  if (due > 0) return `${cap(numWord(due))} ${due === 1 ? 'Karte ist' : 'Karten sind'} heute fällig. Kein Stress.`;
  if (doneTodayCount(p) >= state.settings.dailyGoal) return 'Tagesziel geschafft. Alles Weitere ist Zugabe.';
  return 'Heute ist nichts fällig. Zeit für was Neues.';
}

function nodeInfo(node, state) {
  const now = new Date();
  const teil = (k) => `${k} ${k === 1 ? 'Teilübung' : 'Teilübungen'}`;
  const n = node.cardIds.length;
  const t = node.track;
  if (node.lesson.type === 'checkpoint') {
    const done = node.status === 'done';
    return { title: 'Checkpoint', meta: done ? 'Gemischte Wiederholung · erledigt' : 'Gemischte Wiederholung · bis zu 6 Karten', cta: done ? 'Nochmal üben' : 'Los geht’s', variant: 'primary' };
  }
  const open = node.cardIds.filter((id) => !isMastered(state.cards[id])).length;
  if (node.status === 'done' && open > 0) {
    return { title: node.lesson.title, meta: `${n - open} von ${teil(n)} geschafft`, cta: 'Weitermachen', variant: t === 'mixed' ? 'primary' : t };
  }
  if (node.status === 'done') {
    const at = state.progress.lessonsDone[node.id];
    const d = at ? daysBetween(dayKey(new Date(at)), dayKey(now)) : daysSinceFirstSeen(state, node.cardIds, now);
    return { title: node.lesson.title, meta: `${teil(n)} · abgeschlossen ${daysAgoText(d)}`, cta: t === 'read' ? 'Nochmal lesen' : 'Nochmal hören', variant: t === 'mixed' ? 'primary' : t };
  }
  if (node.status === 'due') {
    const today = dayKey(now);
    const due = node.cardIds.filter((id) => { const r = state.cards[id]; return r && r.stage >= 0 && r.due <= today; }).length;
    const d = daysSinceFirstSeen(state, node.cardIds, now);
    if (t === 'read') return { title: 'Fällige Wiedergabe', meta: `${teil(due)} · gelesen ${daysAgoText(d)}`, cta: 'Wiedergeben', variant: 'read' };
    return { title: 'Fällige Wiederholung', meta: `${teil(due)} · zuletzt ${daysAgoText(d)}`, cta: 'Wiederholen', variant: 'listen' };
  }
  const started = open < n;
  const cta = started ? 'Weitermachen' : 'Los geht’s';
  if (t === 'read') return { title: node.lesson.title, meta: `${started ? 'Noch ' : '1 Text · '}${teil(open)} · ca. ${Math.max(2, open + 1)} Minuten`, cta, variant: 'read' };
  return { title: node.lesson.title, meta: `${started ? 'Noch ' : '1 Gespräch · '}${teil(open)} · ca. ${Math.max(1, Math.round(open * 0.8 + 1))} Minuten`, cta, variant: t === 'mixed' ? 'primary' : t };
}

/* ---- Kapitel-Banner --------------------------------------------------------- */
function ChapterBanner({ group }) {
  const { chapter, number, complete } = group;
  if (complete) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: 14, borderRadius: 'var(--radius-lg)', background: 'var(--spur-amber)', boxShadow: 'var(--shadow-edge-amber)' }}>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span className="overline" style={{ color: '#2B1C06' }}>Kapitel {number} · geschafft</span>
          <span style={{ font: 'var(--type-headline)', color: '#2B1C06' }}>{chapter.title}</span>
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40, borderRadius: '50%', background: '#fff', color: 'var(--spur-amber-shade)', flex: '0 0 auto' }}>
          <Icon name="check" strokeWidth={3} />
        </span>
      </div>
    );
  }
  const tone = chapter.track;
  const shade = tone === 'read' ? 'var(--track-read-shade)' : tone === 'listen' ? 'var(--track-listen-shade)' : 'var(--spur-indigo)';
  return (
    <Card tone={tone} padding={14} elevated={false} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span className="overline" style={{ color: shade }}>Kapitel {number}</span>
        <span style={{ font: 'var(--type-headline)', color: 'var(--text-ink)' }}>{chapter.title}</span>
      </span>
      <Badge tone={tone} variant="solid" size="sm">{TRACK_NAME[tone]}</Badge>
    </Card>
  );
}

/* ---- Knoten mit Überblendung (3e) ------------------------------------------ */
function NodeView({ node, from, delay, onTap, nodeRef }) {
  const common = { track: node.track === 'mixed' ? 'mixed' : node.track, icon: node.lesson.type === 'checkpoint' ? 'target' : undefined };
  const label = node.lesson.type === 'checkpoint' && node.status !== 'locked' ? 'Checkpoint' : node.label;
  const tap = node.status === 'locked' ? undefined : (e) => { e.stopPropagation(); onTap(node); };
  const aria = `${node.lesson.title}${node.status === 'locked' ? ', gesperrt' : node.status === 'due' ? ', fällig' : node.status === 'done' ? ', erledigt' : ''}`;
  if (!from || from === node.status) {
    return <span ref={nodeRef}><PathNode {...common} state={node.status} segments={node.segments} label={label} ariaLabel={aria} onClick={tap} /></span>;
  }
  return (
    <span ref={nodeRef} style={{ position: 'relative', display: 'inline-flex', flexDirection: 'column', alignItems: 'center' }}>
      <span style={{ position: 'absolute', top: 0, animation: `spur-fadeout 600ms cubic-bezier(.45,.05,.35,1) ${delay}ms both`, pointerEvents: 'none' }}>
        <PathNode {...common} state={from} segments={node.segments} />
      </span>
      <span style={{ animation: `spur-softin 600ms ${EASE.soft} ${delay}ms both` }}>
        <PathNode {...common} state={node.status} segments={node.segments} label={label} ariaLabel={aria} onClick={tap} />
      </span>
    </span>
  );
}

/* ---- Home / Pfad ------------------------------------------------------------ */
/** Pop-ups höchstens einmal pro App-Start prüfen (StrictMode ruft Effekte doppelt auf). */
let popupCheckedAt = 0;

export function Home({ anim, onOpenNode, onPopupTest }) {
  const { state, index } = useStore();
  const narrow = useNarrow();
  const reduced = prefersReducedMotion();
  const groups = useMemo(() => buildPath(index, state), [index, state]);
  const nodes = useMemo(() => groups.flatMap((g) => g.nodes), [groups]);
  const [selected, setSelected] = useState(null);
  const [settings, setSettings] = useState(false);
  const [toast, setToast] = useState(null);
  const [geo, setGeo] = useState(null);
  const scrollRef = useRef(null);
  const wrapRef = useRef(null);
  const nodeEls = useRef(new Map());
  const sectionEls = useRef(new Map());
  const [sticky, setSticky] = useState(null);
  const [targetVisible, setTargetVisible] = useState(true);
  const [popup, setPopup] = useState(null);
  const { update } = useStore();

  // Welche Knoten werden gerade animiert (Rückkehr nach abgeschlossener Lektion)?
  const animState = useMemo(() => {
    if (!anim?.lessonDone || reduced) return null;
    const i = nodes.findIndex((x) => x.id === anim.lessonDone);
    if (i < 0) return null;
    // Nächster Knoten derselben Spur (Zuhören und Lesen schalten getrennt frei).
    const nextLesson = nextLessonAfter(index, state, anim.lessonDone);
    const next = nextLesson && nodes.find((x) => x.id === nextLesson.lesson.id && x.status === 'current');
    return { doneId: anim.lessonDone, nextId: next?.id || null, fromIdx: i };
  }, [anim, nodes, reduced]); // eslint-disable-line react-hooks/exhaustive-deps

  // Miro sitzt am gerade freigeschalteten Knoten, sonst am ersten aktuellen.
  const current = (animState?.nextId && nodes.find((x) => x.id === animState.nextId)) || nodes.find((x) => x.status === 'current');
  const scale = narrow ? 0.8 : 1;
  const offsetOf = (node) => OFFSETS[node.n % OFFSETS.length] * scale;

  // Positionen der Knoten messen → Verbindungslinien und Miro.
  useLayoutEffect(() => {
    const measure = () => {
      const wrap = wrapRef.current;
      if (!wrap) return;
      const wr = wrap.getBoundingClientRect();
      const pos = new Map();
      nodeEls.current.forEach((el, id) => {
        const btn = el?.querySelector('button');
        if (!btn) return;
        const r = btn.getBoundingClientRect();
        pos.set(id, { x: r.left - wr.left + r.width / 2, y: r.top - wr.top + r.height / 2 });
      });
      setGeo({ pos, w: wr.width, h: wrap.scrollHeight });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, [groups, narrow]);

  // Beim Öffnen zum aktuellen (bzw. gerade animierten) Knoten scrollen.
  useLayoutEffect(() => {
    if (!geo || !scrollRef.current) return;
    const target = animState?.doneId || current?.id;
    const p = target && geo.pos.get(target);
    if (p && !scrollRef.current.dataset.scrolled) {
      scrollRef.current.scrollTop = Math.max(0, p.y - scrollRef.current.clientHeight * 0.38);
      scrollRef.current.dataset.scrolled = '1';
    }
  }, [geo]); // eslint-disable-line react-hooks/exhaustive-deps

  // Toast "„…“ ist freigeschaltet" nach der Pfad-Animation.
  useEffect(() => {
    if (!anim?.lessonDone) return undefined;
    const next = nextLessonAfter(index, state, anim.lessonDone);
    if (!next) return undefined;
    const text = anim.chapterDone ? `„${next.chapter.title}“ ist freigeschaltet` : `„${next.lesson.title}“ ist freigeschaltet`;
    const t1 = setTimeout(() => setToast(text), reduced ? 300 : 3000);
    const t2 = setTimeout(() => setToast(null), reduced ? 3300 : 6500);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [anim?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sticky Kapitel-Leiste: Welches Kapitel liegt gerade oben im Sichtbereich?
  // IntersectionObserver auf die Kapitel-Abschnitte mit einem schmalen Band unter der Leiste.
  useEffect(() => {
    const root = scrollRef.current;
    if (!root || typeof IntersectionObserver === 'undefined') return undefined;
    const inBand = new Set();
    const order = groups.map((g) => g.chapter.id);
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        const id = e.target.dataset.chapter;
        if (e.isIntersecting) inBand.add(id); else inBand.delete(id);
      }
      setSticky(order.find((id) => inBand.has(id)) || null);
    }, { root, rootMargin: `-44px 0px -${Math.max(0, root.clientHeight - 46)}px 0px`, threshold: 0 });
    sectionEls.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, [groups]);

  // "Zur aktuellen Position": nächster fälliger bzw. unerledigter Knoten.
  const target = nodes.find((x) => x.status === 'due') || nodes.find((x) => x.status === 'current');
  useEffect(() => {
    const root = scrollRef.current;
    const el = target && nodeEls.current.get(target.id);
    if (!root || !el || typeof IntersectionObserver === 'undefined') { setTargetVisible(true); return undefined; }
    const io = new IntersectionObserver(([e]) => setTargetVisible(e.isIntersecting), { root, rootMargin: '-48px 0px 0px 0px', threshold: 0.4 });
    io.observe(el);
    return () => io.disconnect();
  }, [target?.id, geo]); // eslint-disable-line react-hooks/exhaustive-deps
  const scrollToTarget = () => {
    const el = target && nodeEls.current.get(target.id);
    el?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
  };

  // Zufällige Erinnerungs-Pop-ups: beim Öffnen des Pfads, höchstens eins pro Tag.
  useEffect(() => {
    const t = setTimeout(() => {
      if (Date.now() - popupCheckedAt < 60000) return;
      popupCheckedAt = Date.now();
      const r = pickPopup(index, state);
      if (!r.chapterId) return;
      update(() => r.state);
      setPopup(r.chapterId);
    }, anim?.lessonDone ? 5000 : 1200);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const p = state.progress;
  const goal = state.settings.dailyGoal;
  const done = doneTodayCount(p);

  // Verbindungslinien von Knotenmitte zu Knotenmitte (nur innerhalb eines Kapitels).
  const lines = [];
  if (geo) {
    for (const g of groups) {
      for (let i = 0; i + 1 < g.nodes.length; i++) {
        const a = geo.pos.get(g.nodes[i].id);
        const b = geo.pos.get(g.nodes[i + 1].id);
        if (!a || !b) continue;
        const dy = b.y - a.y;
        const d = `M${a.x} ${a.y} C ${a.x} ${a.y + dy * 0.55}, ${b.x} ${b.y - dy * 0.55}, ${b.x} ${b.y}`;
        const reached = g.nodes[i + 1].status !== 'locked';
        const animated = animState && g.nodes[i].id === animState.doneId && g.nodes[i + 1].id === animState.nextId;
        lines.push({ key: g.nodes[i].id, d, reached: reached && !animated, animated });
      }
    }
  }

  // Miro sitzt neben dem aktuellen Knoten; nach einer Lektion gleitet er vom vorigen herüber.
  let miro = null;
  if (geo && current) {
    const c = geo.pos.get(current.id);
    if (c) {
      const side = offsetOf(current) > 30 ? -1 : 1;
      const x = c.x + side * 82 - 36;
      const y = c.y - 45;
      let glide = null;
      if (animState?.nextId === current.id) {
        const prev = nodes[animState.fromIdx];
        const pp = geo.pos.get(prev.id);
        if (pp) {
          const ps = offsetOf(prev) > 30 ? -1 : 1;
          glide = { '--glide-x': `${pp.x + ps * 82 - 36 - x}px`, '--glide-y': `${pp.y - 45 - y}px`, animation: `spur-glide 1300ms ${EASE.sine} 1500ms both` };
        }
      }
      miro = { x, y, glide };
    }
  }

  const info = selected ? nodeInfo(selected, state) : null;

  return (
    <div className="screen">
      <PathHeader xpFrom={anim?.xpFrom} xpDelay={animState ? 3000 : 300} streakBump={anim?.streakBump} onMenu={() => { setSelected(null); setSettings(true); }} />

      <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
      {sticky && (() => {
        const g = groups.find((x) => x.chapter.id === sticky);
        const tone = g.chapter.track;
        const soft = tone === 'read' ? 'var(--track-read-soft)' : tone === 'listen' ? 'var(--track-listen-soft)' : 'var(--surface-sunken)';
        const shade = tone === 'read' ? 'var(--track-read-shade)' : tone === 'listen' ? 'var(--track-listen-shade)' : 'var(--spur-indigo)';
        return (
          <button type="button" key={sticky} className="a-rise" onClick={() => sectionEls.current.get(sticky)?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' })}
            aria-label={`Kapitel ${g.number}: ${g.chapter.title}, ${TRACK_NAME[tone]}`}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
              height: 44, padding: '0 var(--gutter-screen)', border: 'none', borderBottom: '2px solid var(--border-default)', background: soft, cursor: 'pointer',
              animationDuration: '200ms', textAlign: 'left' }}>
            <span style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 0 }}>
              <span className="overline" style={{ color: shade, flex: '0 0 auto' }}>Kapitel {g.number}</span>
              <span style={{ font: 'var(--type-body)', fontWeight: 700, color: 'var(--text-ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{g.chapter.title}</span>
            </span>
            <Badge tone={tone} variant="solid" size="sm">{TRACK_NAME[tone]}</Badge>
          </button>
        );
      })()}
      <div ref={scrollRef} className="screen-body" style={{ position: 'absolute', inset: 0, paddingBottom: 140 }} onClick={() => selected && setSelected(null)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px var(--gutter-screen) 6px' }}>
          <GoalRing value={done / goal} size={64} thickness={8} caption="Tagesziel" tone={done >= goal ? 'correct' : 'amber'}>{done}/{goal}</GoalRing>
          <SpeechBubble tail="left" tone="lavender" style={{ flex: 1 }}>{bubbleText(index, state)}</SpeechBubble>
        </div>

        <div ref={wrapRef} style={{ position: 'relative' }}>
          {geo && (
            <svg width={geo.w} height={geo.h} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: 'none' }} aria-hidden="true">
              {lines.map((s) => (
                <g key={s.key}>
                  <path d={s.d} fill="none" stroke={s.reached ? 'var(--spur-lavender-deep)' : 'var(--surface-locked)'} strokeWidth="6" strokeLinecap="round" />
                  {s.animated && (
                    <path d={s.d} fill="none" stroke="var(--spur-lavender-deep)" strokeWidth="6" strokeLinecap="round" pathLength="100"
                      strokeDasharray="100" strokeDashoffset="100" style={{ animation: 'spur-draw 900ms cubic-bezier(.45,.05,.35,1) 1200ms forwards' }} />
                  )}
                </g>
              ))}
            </svg>
          )}

          {groups.map((g) => (
            <section key={g.chapter.id} aria-label={`Kapitel ${g.number}: ${g.chapter.title}`} data-chapter={g.chapter.id}
              ref={(el) => { if (el) sectionEls.current.set(g.chapter.id, el); else sectionEls.current.delete(g.chapter.id); }}>
              <div style={{ margin: '24px var(--gutter-screen) 0', position: 'relative' }}>
                <ChapterBanner group={g} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--node-gap)', marginTop: 28 }}>
                {g.nodes.map((node) => (
                  <div key={node.id} style={{ position: 'relative', transform: `translateX(${offsetOf(node)}px)` }}>
                    <NodeView node={node}
                      from={animState?.doneId === node.id ? 'current' : animState?.nextId === node.id ? 'locked' : null}
                      delay={animState?.doneId === node.id ? 500 : 2400}
                      onTap={(n) => setSelected(n)}
                      nodeRef={(el) => { if (el) nodeEls.current.set(node.id, el); else nodeEls.current.delete(node.id); }} />
                  </div>
                ))}
              </div>
            </section>
          ))}

          {miro && (
            <div style={{ position: 'absolute', left: miro.x, top: miro.y, zIndex: 2, ...(miro.glide || {}) }} className={miro.glide ? 'rm-static' : undefined}>
              <Mascot pose={animState ? 'cheering' : 'neutral'} size={72} />
            </div>
          )}
        </div>

        {!current && (
          <div style={{ margin: '32px var(--gutter-screen) 0', textAlign: 'center' }}>
            <p style={{ font: 'var(--type-body-l)', color: 'var(--text-muted)' }}>Alle Kapitel sind geschafft. Die Wiederholungen laufen weiter, so lange du magst.</p>
          </div>
        )}
      </div>
      </div>

      {!targetVisible && !selected && target && (
        <button type="button" onClick={scrollToTarget} aria-label="Zur aktuellen Position" className="a-popin"
          style={{ position: 'absolute', right: 'var(--gutter-screen)', bottom: 'calc(24px + env(safe-area-inset-bottom))', zIndex: 15,
            width: 56, height: 56, borderRadius: '50%', border: '2px solid var(--border-default)', background: 'var(--surface-card)',
            color: target.status === 'due' ? 'var(--spur-amber-shade)' : `var(--track-${target.track === 'read' ? 'read' : 'listen'})`,
            boxShadow: '0 4px 0 var(--border-strong), var(--shadow-raised)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="target" size={26} strokeWidth={2.4} />
        </button>
      )}

      {selected && info && (
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '0 var(--gutter-screen) calc(20px + env(safe-area-inset-bottom))', zIndex: 20 }} className="a-rise">
          <div role="dialog" aria-label={info.title} style={{ background: 'var(--surface-card)', border: '2px solid var(--border-default)', borderRadius: 'var(--radius-xl)', boxShadow: 'var(--shadow-raised)', padding: 18 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                <span style={{ font: 'var(--type-headline)', color: 'var(--text-ink)' }}>{info.title}</span>
                <span style={{ font: 'var(--type-label)', fontWeight: 500, color: 'var(--text-muted)' }}>{info.meta}</span>
              </span>
              <IconButton icon="x" label="Schließen" size={44} onClick={() => setSelected(null)} />
            </div>
            <Button variant={info.variant} full autoFocus onClick={() => { const n = selected; setSelected(null); onOpenNode(n); }}>{info.cta}</Button>
          </div>
        </div>
      )}

      {toast && (
        <div className="toast a-rise" role="status" style={{ animationDuration: '480ms' }}>
          <Icon name="unlock" />
          <span>{toast}</span>
        </div>
      )}

      <SettingsSheet open={settings} onClose={() => setSettings(false)} />

      {popup && (() => {
        const ch = index.chapters.find((c) => c.id === popup);
        const read = ch.track === 'read';
        return (
          <Sheet title="Kurz gefragt" onClose={() => setPopup(null)}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: -4 }}>
              <Mascot pose="head" size={64} />
              <div className="stack" style={{ gap: 4 }}>
                <p style={{ font: 'var(--type-headline)', color: 'var(--text-ink)' }}>{read ? `Weißt du noch, was in „${ch.title}“ stand?` : `Weißt du noch, worum es in „${ch.title}“ ging?`}</p>
                <p style={{ font: 'var(--type-body)', color: 'var(--text-muted)' }}>Drei Fragen, ganz ohne Folgen. Für Federn, wenn es sitzt.</p>
              </div>
            </div>
            <div className="stack" style={{ gap: 10 }}>
              <Button full icon="sparkles" onClick={() => { setPopup(null); onPopupTest(popup); }}>Kurzer Test</Button>
              <Button variant="ghost" size="md" full onClick={() => setPopup(null)}>Nicht jetzt</Button>
            </div>
          </Sheet>
        );
      })()}
    </div>
  );
}
