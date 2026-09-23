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
  buildPath, doneTodayCount, dueCardIds, hasAnyProgress, isInfinite, nextLessonAfter, daysSinceFirstSeen,
} from '../engine/game.js';
import { dayKey, daysBetween } from '../engine/dates.js';
import { isNew } from '../engine/srs.js';
import { cap, cards, daysAgoText, numWord } from '../lib/format.js';
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
        <div role="tooltip" className="a-rise" style={{ position: 'absolute', top: 'calc(60px + env(safe-area-inset-top))', left: 110, width: 230, background: '#1F2130', color: '#fff',
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
  const n = node.cardIds.length;
  const t = node.track;
  if (node.lesson.type === 'checkpoint') {
    const done = node.status === 'done';
    return { title: 'Checkpoint', meta: done ? 'Gemischte Wiederholung · erledigt' : 'Gemischte Wiederholung · bis zu 6 Karten', cta: done ? 'Nochmal üben' : 'Los geht’s', variant: 'primary' };
  }
  if (node.status === 'done') {
    const at = state.progress.lessonsDone[node.id];
    const d = at ? daysBetween(dayKey(new Date(at)), dayKey(now)) : daysSinceFirstSeen(state, node.cardIds, now);
    return { title: node.lesson.title, meta: `${n} ${cards(n)} · abgeschlossen ${daysAgoText(d)}`, cta: t === 'read' ? 'Nochmal lesen' : 'Nochmal hören', variant: t === 'mixed' ? 'primary' : t };
  }
  if (node.status === 'due') {
    const today = dayKey(now);
    const due = node.cardIds.filter((id) => { const r = state.cards[id]; return r && r.stage >= 0 && r.due <= today; }).length;
    const d = daysSinceFirstSeen(state, node.cardIds, now);
    if (t === 'read') return { title: 'Fällige Wiedergabe', meta: `${due} Text · gelesen ${daysAgoText(d)}`, cta: 'Wiedergeben', variant: 'read' };
    return { title: 'Fällige Wiederholung', meta: `${due} ${cards(due)} · zuletzt ${daysAgoText(d)}`, cta: 'Wiederholen', variant: 'listen' };
  }
  const open = node.cardIds.filter((id) => isNew(state.cards[id])).length;
  if (t === 'read') return { title: node.lesson.title, meta: `1 neuer Text · ca. 2 Minuten`, cta: 'Los geht’s', variant: 'read' };
  return { title: node.lesson.title, meta: `${open} neue ${cards(open)} · ca. ${Math.max(1, Math.round(open * 0.8))} Minuten`, cta: 'Los geht’s', variant: t === 'mixed' ? 'primary' : t };
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
  const common = { track: node.track, icon: node.lesson.type === 'checkpoint' ? 'target' : undefined };
  const label = node.lesson.type === 'checkpoint' && node.status !== 'locked' ? 'Checkpoint' : node.label;
  const tap = node.status === 'locked' ? undefined : (e) => { e.stopPropagation(); onTap(node); };
  const aria = `${node.lesson.title}${node.status === 'locked' ? ', gesperrt' : node.status === 'due' ? ', fällig' : node.status === 'done' ? ', erledigt' : ''}`;
  if (!from || from === node.status) {
    return <span ref={nodeRef}><PathNode {...common} state={node.status} label={label} ariaLabel={aria} onClick={tap} /></span>;
  }
  return (
    <span ref={nodeRef} style={{ position: 'relative', display: 'inline-flex', flexDirection: 'column', alignItems: 'center' }}>
      <span style={{ position: 'absolute', top: 0, animation: `spur-fadeout 600ms cubic-bezier(.45,.05,.35,1) ${delay}ms both`, pointerEvents: 'none' }}>
        <PathNode {...common} state={from} />
      </span>
      <span style={{ animation: `spur-softin 600ms ${EASE.soft} ${delay}ms both` }}>
        <PathNode {...common} state={node.status} label={label} ariaLabel={aria} onClick={tap} />
      </span>
    </span>
  );
}

/* ---- Home / Pfad ------------------------------------------------------------ */
export function Home({ anim, onOpenNode }) {
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

  // Welche Knoten werden gerade animiert (Rückkehr nach abgeschlossener Lektion)?
  const animState = useMemo(() => {
    if (!anim?.lessonDone || reduced) return null;
    const i = nodes.findIndex((x) => x.id === anim.lessonDone);
    if (i < 0) return null;
    const next = nodes[i + 1] && nodes[i + 1].status === 'current' ? nodes[i + 1] : null;
    return { doneId: anim.lessonDone, nextId: next?.id || null, fromIdx: i };
  }, [anim, nodes, reduced]);

  const current = nodes.find((x) => x.status === 'current');
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

  const p = state.progress;
  const goal = state.settings.dailyGoal;
  const done = doneTodayCount(p);

  // Verbindungslinien von Knotenmitte zu Knotenmitte (nur innerhalb eines Kapitels).
  const segments = [];
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
        segments.push({ key: g.nodes[i].id, d, reached: reached && !animated, animated });
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

      <div ref={scrollRef} className="screen-body" style={{ paddingBottom: 140 }} onClick={() => selected && setSelected(null)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px var(--gutter-screen) 6px' }}>
          <GoalRing value={done / goal} size={64} thickness={8} caption="Tagesziel" tone={done >= goal ? 'correct' : 'amber'}>{done}/{goal}</GoalRing>
          <SpeechBubble tail="left" tone="lavender" style={{ flex: 1 }}>{bubbleText(index, state)}</SpeechBubble>
        </div>

        <div ref={wrapRef} style={{ position: 'relative' }}>
          {geo && (
            <svg width={geo.w} height={geo.h} style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible', pointerEvents: 'none' }} aria-hidden="true">
              {segments.map((s) => (
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
            <section key={g.chapter.id} aria-label={`Kapitel ${g.number}: ${g.chapter.title}`}>
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
    </div>
  );
}
