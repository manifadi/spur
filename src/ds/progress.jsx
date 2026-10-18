import { Icon } from './Icon.jsx';
import { IconButton } from './IconButton.jsx';
import { Wordmark } from './core.jsx';

/* ---- PathNode ------------------------------------------------------------ */
const TRACK = {
  listen: { bg: 'var(--track-listen)', edge: 'var(--track-listen-shade)' },
  read:   { bg: 'var(--track-read)', edge: 'var(--track-read-shade)' },
  mixed:  { bg: 'var(--track-mixed)', edge: 'var(--track-mixed-shade)' },
};

/** Bogen-Pfad eines Kreissegments (Winkel in Grad, 0 = oben, im Uhrzeigersinn). */
function arcPath(cx, cy, r, a0, a1) {
  const p = (a) => [cx + r * Math.sin((a * Math.PI) / 180), cy - r * Math.cos((a * Math.PI) / 180)];
  const [x0, y0] = p(a0);
  const [x1, y1] = p(a1);
  return `M ${x0} ${y0} A ${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1} ${y1}`;
}

/**
 * Mehrsegment-Ring: ein Bogen pro Teilübung. Geschaffte Segmente voll in der
 * Spurfarbe, offene grau (wie Duolingos Fortschrittsring am Knoten). Bei nur einer Teilübung kein Ring.
 */
function SegmentRing({ total, done, color, size, depth, fresh }) {
  if (!total || total < 2) return null;
  const box = size + 26;
  const c = box / 2;
  const r = size / 2 + 8;
  const gap = total > 2 ? 14 : 18;
  const seg = 360 / total;
  return (
    <svg aria-hidden="true" width={box} height={box} viewBox={`0 0 ${box} ${box}`}
      style={{ position: 'absolute', left: '50%', top: size / 2 + depth / 2, transform: 'translate(-50%, -50%)', overflow: 'visible', pointerEvents: 'none' }}>
      {Array.from({ length: total }, (_, i) => (
        <path key={i} d={arcPath(c, c, r, i * seg + gap / 2, (i + 1) * seg - gap / 2)} fill="none" stroke={i < done ? color : 'var(--surface-locked)'} strokeWidth={6} strokeLinecap="round"
          // Gerade geschaffter Teil: Segment füllt sich nach der Rückkehr zum Pfad sichtbar.
          style={i + 1 === fresh ? { stroke: color, animation: 'spur-seg-fill 700ms var(--ease-out) 500ms both' } : { transition: 'stroke var(--dur-base) var(--ease-out)' }} />
      ))}
    </svg>
  );
}

export function PathNode({ state = 'locked', track = 'listen', icon, label, ariaLabel, size = 70, segments, bubble, onClick, style, ...rest }) {
  const segmented = segments && segments.total > 1;
  const ringSize = size + (segmented ? 40 : 22);
  const depth = 7;
  const t = TRACK[track] || TRACK.listen;
  const look = {
    done:    { bg: t.bg, edge: t.edge, fg: '#fff', icon: 'check' },
    current: { bg: t.bg, edge: t.edge, fg: '#fff', icon: icon || (track === 'read' ? 'book-open' : track === 'mixed' ? 'shuffle' : 'ear') },
    due:     { bg: 'var(--spur-amber)', edge: 'var(--spur-amber-shade)', fg: 'var(--on-amber)', icon: 'history' },
    locked:  { bg: 'var(--surface-locked)', edge: 'var(--spur-locked)', fg: 'var(--text-subtle)', icon: 'lock' },
  }[state];
  const locked = state === 'locked';
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 8, paddingTop: bubble && state === 'current' ? 30 : 0, ...style }}>
      <span style={{ position: 'relative', display: 'inline-flex', marginBottom: state === 'current' ? (segmented ? 18 : 12) : segmented ? 8 : 0 }}>
      {bubble && state === 'current' && (
        // "Start"-Blase über dem aktuellen Knoten (wie bei Duolingo), wippt sanft.
        <span aria-hidden="true" style={{ position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)', marginBottom: segmented ? 30 : 22, zIndex: 3, pointerEvents: 'none' }}>
          <span className="a-bob rm-static" style={{ position: 'relative', display: 'inline-block', padding: '8px 13px 7px', borderRadius: 12, background: 'var(--surface-card)',
            border: '2px solid var(--border-default)', font: 'var(--type-overline)', fontSize: 14, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 'var(--tracking-wide)',
            color: t.bg, whiteSpace: 'nowrap' }}>
            {bubble}
            <span style={{ position: 'absolute', left: '50%', bottom: -8, width: 12, height: 12, background: 'var(--surface-card)', borderRight: '2px solid var(--border-default)',
              borderBottom: '2px solid var(--border-default)', transform: 'translateX(-50%) rotate(45deg)' }} />
          </span>
        </span>
      )}
      {segmented && <SegmentRing total={segments.total} done={state === 'done' || state === 'due' ? segments.total : segments.done} size={size} depth={depth} fresh={segments.fresh}
        color={locked ? 'var(--spur-locked)' : state === 'due' ? 'var(--spur-amber)' : t.bg} />}
      {state === 'current' && !segmented && (
        // Auswahlring als eigener Kreis, zentriert auf Knoten + Unterkante. Ruhiges "Atmen"
        // nur über transform und opacity (läuft dauerhaft, darf den Main-Thread nicht kosten).
        <svg aria-hidden="true" className="rm-static" width={ringSize} height={ringSize} viewBox={`0 0 ${ringSize} ${ringSize}`}
          style={{ position: 'absolute', left: '50%', top: size / 2 + depth / 2, overflow: 'visible', pointerEvents: 'none', color: t.bg,
            transform: 'translate(-50%, -50%)', animation: 'spur-ring-breathe 1600ms var(--ease-sine) infinite alternate' }}>
          <circle cx={ringSize / 2} cy={ringSize / 2} r={ringSize / 2 - 3} fill="none" stroke="currentColor" strokeWidth={5} />
        </svg>
      )}
      {state === 'due' && (
        <span aria-hidden="true" className="rm-hide" style={{ position: 'absolute', left: 0, top: depth / 2, width: size, height: size, pointerEvents: 'none' }}>
          <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'var(--spur-amber)', animation: `spur-ripple var(--pulse-due) var(--ease-out) infinite` }} />
        </span>
      )}
      <button type="button" onClick={onClick} className="path-node" data-state={state} aria-disabled={locked || undefined}
        aria-label={(ariaLabel || label || state) + (segmented ? `, ${state === 'done' || state === 'due' ? segments.total : segments.done} von ${segments.total} Teilen geschafft` : '')}
        style={{ width: size, height: size, '--node-bg': look.bg, '--node-edge': look.edge, '--node-fg': look.fg, '--node-depth': `${depth}px` }} {...rest}>
        <Icon name={look.icon} size={Math.round(size * 0.44)} strokeWidth={2.8} />
      </button>
      </span>
      {label && <span style={{ font: 'var(--type-label)', fontWeight: 800, color: locked ? 'var(--text-subtle)' : 'var(--text-muted)', maxWidth: 120, textAlign: 'center', background: 'var(--surface-page)', padding: '1px 6px', borderRadius: 6, position: 'relative' }}>{label}</span>}
    </span>
  );
}

/* ---- GoalRing ----------------------------------------------------------- */
export function GoalRing({ value = 0, size = 96, thickness = 10, tone = 'amber', caption, children, style, ...rest }) {
  const color = { amber: 'var(--spur-amber)', brand: 'var(--spur-brand)', correct: 'var(--spur-green)', streak: 'var(--state-streak)' }[tone] || 'var(--spur-amber)';
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, value));
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 6, flex: '0 0 auto', ...style }} {...rest}>
      <span style={{ position: 'relative', width: size, height: size, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width={size} height={size} style={{ position: 'absolute', inset: 0, transform: 'rotate(-90deg)' }} aria-hidden="true">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-locked)" strokeWidth={thickness} />
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={thickness} strokeLinecap="round"
            strokeDasharray={c} strokeDashoffset={c * (1 - pct)} opacity={pct > 0 ? 1 : 0}
            style={{ transition: 'stroke-dashoffset var(--dur-slow) var(--ease-out), stroke var(--dur-fast) var(--ease-out)' }} />
        </svg>
        <span style={{ font: 'var(--type-title)', fontSize: size * 0.28, fontWeight: 'var(--weight-black)', color: 'var(--text-ink)' }}>{children}</span>
      </span>
      {caption && <span style={{ font: 'var(--type-overline)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-wide)', color: 'var(--text-subtle)' }}>{caption}</span>}
    </span>
  );
}

/* ---- Herzen --------------------------------------------------------------- */
/** Alle Herzen einzeln (Hinweis-Screens). */
export function HeartsMeter({ value = 5, max = 5, size = 20, shake = 0, style, ...rest }) {
  return (
    <span key={shake} className={shake ? 'a-shake' : undefined} role="img" aria-label={`Aufmerksamkeit ${value} von ${max}`}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 2, ...style }} {...rest}>
      {Array.from({ length: max }, (_, i) => i < value).map((on, i) => (
        <span key={i} style={{ color: on ? 'var(--state-heart)' : 'var(--surface-locked)', display: 'inline-flex', transition: 'color var(--dur-fast) var(--ease-out)' }}>
          <Icon name="heart" size={size} strokeWidth={2.6} fill="currentColor" />
        </span>
      ))}
    </span>
  );
}

/** Kompakt wie bei Duolingo: ein Herz und die Zahl, beides rot. */
export function HeartCount({ value = 5, size = 22, shake = 0, max = 5, style }) {
  const empty = value <= 0;
  return (
    <span key={shake} className={shake ? 'a-shake' : undefined} role="img" aria-label={`Aufmerksamkeit ${value} von ${max}`}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: empty ? 'var(--text-subtle)' : 'var(--state-heart)', ...style }}>
      <Icon name="heart" size={size} fill="currentColor" strokeWidth={2.4} />
      <span aria-hidden="true" style={{ font: 'var(--type-headline)', fontSize: 18, fontWeight: 900, fontVariantNumeric: 'tabular-nums' }}>{value}</span>
    </span>
  );
}

/** Kompakte ∞-Anzeige (Lektionskopf, 3b). */
export function InfinityHearts() {
  return (
    <span role="img" aria-label="Aufmerksamkeit unendlich" style={{ display: 'flex', alignItems: 'center', gap: 3, color: 'var(--state-heart)' }}>
      <Icon name="heart" size={22} fill="currentColor" strokeWidth={2.4} />
      <Icon name="infinity" size={22} strokeWidth={3} />
    </span>
  );
}

/** ∞ im Pfad-Header (3a). Statisch: ein Endlos-Schimmer würde jedes Frame neu malen. */
export function InfinityPill() {
  return <InfinityHearts />;
}

/* ---- ProgressBar -----------------------------------------------------------
   Duolingo-Balken mit Glanzstreifen. Wächst per clip-path statt width: kein Layout
   pro Frame, und das runde Ende bleibt rund (scaleX würde es stauchen). */
const BAR_TONES = { brand: 'var(--spur-brand)', amber: 'var(--spur-amber)', correct: 'var(--spur-green)',
  listen: 'var(--track-listen)', read: 'var(--track-read)', mixed: 'var(--track-mixed)' };

export function ProgressBar({ value = 0, tone = 'brand', height = 16, label, style, ...rest }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  const rest_ = 100 - pct;
  const move = 'clip-path 520ms var(--ease-out)';
  return (
    <div role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={label || 'Fortschritt'}
      style={{ position: 'relative', width: '100%', height, background: 'var(--surface-locked)', borderRadius: 'var(--radius-pill)', overflow: 'hidden', ...style }} {...rest}>
      <div style={{ position: 'absolute', inset: 0, background: BAR_TONES[tone] || BAR_TONES.brand,
        clipPath: `inset(0 ${rest_}% 0 0 round 999px)`, transition: move }} />
      <div aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, top: Math.max(2, Math.round(height * 0.2)), height: Math.max(2, Math.round(height * 0.24)),
        background: 'rgba(255,255,255,.32)', opacity: pct > 8 ? 1 : 0,
        clipPath: `inset(0 calc(${rest_}% + 8px) 0 8px round 999px)`, transition: `${move}, opacity var(--dur-fast) var(--ease-out)` }} />
    </div>
  );
}

/* ---- StatTile / StreakPill / XPPill --------------------------------------- */
export function StatTile({ icon, value, label, tone = 'brand', style, ...rest }) {
  const color = { brand: 'var(--spur-brand)', amber: 'var(--spur-amber)', correct: 'var(--spur-green)',
    listen: 'var(--track-listen)', read: 'var(--track-read)' }[tone] || 'var(--spur-brand)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 14, textAlign: 'left',
      background: 'var(--surface-card)', border: '2px solid var(--border-default)', borderRadius: 'var(--radius-lg)', ...style }} {...rest}>
      {icon && <span style={{ color, display: 'inline-flex' }}><Icon name={icon} size={26} strokeWidth={2.4} /></span>}
      <span style={{ display: 'flex', flexDirection: 'column' }}>
        <span style={{ font: 'var(--type-title)', fontSize: 'var(--text-title)', fontWeight: 'var(--weight-black)', color: 'var(--text-ink)' }}>{value}</span>
        <span style={{ font: 'var(--type-label)', fontWeight: 600, color: 'var(--text-muted)' }}>{label}</span>
      </span>
    </div>
  );
}

/** Flamme und Zahl in Orange (Duolingo), grau ohne Streak. */
export function StreakPill({ days = 0, active = true, size = 'md', bump = 0, style, ...rest }) {
  const lg = size === 'lg';
  const color = active ? 'var(--state-streak)' : 'var(--text-subtle)';
  return (
    <span key={bump} className={bump ? 'a-pop' : undefined} aria-label={`Streak ${days} Tage`}
      style={{ display: 'inline-flex', alignItems: 'center', gap: lg ? 8 : 6, color, ...style }} {...rest}>
      <Icon name="flame" size={lg ? 30 : 22} strokeWidth={2.4} fill={active ? 'currentColor' : 'none'} />
      <span aria-hidden="true" style={{ font: 'var(--type-title)', fontSize: lg ? 30 : 18, fontWeight: 900, fontVariantNumeric: 'tabular-nums' }}>{days}</span>
    </span>
  );
}

export function XPPill({ xp = 0, size = 'md', style, ...rest }) {
  const lg = size === 'lg';
  return (
    <span aria-label={`${xp} Federn`} style={{ display: 'inline-flex', alignItems: 'center', gap: lg ? 8 : 5, ...style }} {...rest}>
      <Wordmark glyphOnly size={lg ? 28 : 21} />
      <span aria-hidden="true" style={{ font: 'var(--type-title)', fontSize: lg ? 30 : 18, fontWeight: 900, color: 'var(--spur-amber-shade)', fontVariantNumeric: 'tabular-nums' }}>{xp}</span>
    </span>
  );
}

/* ---- LessonHeader ---------------------------------------------------------- */
/** Wie bei Duolingo: ✕, grüner Fortschrittsbalken, Herz mit Zahl. */
export function LessonHeader({ progress = 0, hearts = 5, infinite = false, heartShake = 0, onClose }) {
  return (
    <header style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 12, padding: 'calc(10px + env(safe-area-inset-top)) var(--gutter-screen) 10px', background: 'var(--surface-page)' }}>
      <IconButton icon="x" label="Übung abbrechen" onClick={onClose} size={40} style={{ marginLeft: -8 }} />
      <ProgressBar value={progress} tone="brand" style={{ flex: 1 }} />
      {infinite ? <InfinityHearts /> : <HeartCount value={hearts} shake={heartShake} />}
    </header>
  );
}
