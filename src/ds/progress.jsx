import { useState } from 'react';
import { Icon } from './Icon.jsx';
import { IconButton } from './IconButton.jsx';
import { Wordmark } from './core.jsx';

/* ---- PathNode ------------------------------------------------------------ */
const TRACK = {
  listen: { bg: 'var(--track-listen)', edge: 'var(--track-listen-shade)' },
  read:   { bg: 'var(--track-read)', edge: 'var(--track-read-shade)' },
  mixed:  { bg: 'var(--spur-indigo)', edge: 'var(--spur-indigo-shade)' },
};

export function PathNode({ state = 'locked', track = 'listen', icon, label, ariaLabel, size = 68, onClick, style, ...rest }) {
  const [down, setDown] = useState(false);
  const t = TRACK[track] || TRACK.listen;
  const look = {
    done:    { bg: t.bg, edge: t.edge, fg: '#fff', icon: 'check' },
    current: { bg: t.bg, edge: t.edge, fg: '#fff', icon: icon || (track === 'read' ? 'book-open' : track === 'mixed' ? 'shuffle' : 'ear') },
    due:     { bg: 'var(--spur-amber)', edge: 'var(--spur-amber-shade)', fg: '#2B1C06', icon: 'history' },
    locked:  { bg: 'var(--surface-locked)', edge: 'var(--spur-locked)', fg: 'var(--text-subtle)', icon: 'lock' },
  }[state];
  const interactive = state !== 'locked';
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 8, ...style }}>
      <span style={{ position: 'relative', display: 'inline-flex', marginBottom: state === 'current' ? 12 : 0 }}>
      {state === 'current' && (
        // Auswahlring als eigener Kreis, zentriert auf Knoten + 6-px-Unterkante,
        // damit der Knoten mittig sitzt und nicht unten am Ring aufliegt.
        <span aria-hidden="true" style={{ position: 'absolute', left: '50%', top: size / 2 + 3, width: size + 22, height: size + 22,
          transform: 'translate(-50%, -50%)', borderRadius: '50%', border: `3px solid ${t.bg}`, pointerEvents: 'none' }} />
      )}
      <button type="button" disabled={!interactive} onClick={onClick} aria-label={ariaLabel || label || state}
        onPointerDown={() => setDown(true)} onPointerUp={() => setDown(false)} onPointerLeave={() => setDown(false)} onPointerCancel={() => setDown(false)}
        className={state === 'due' ? 'rm-static' : undefined}
        style={{
          position: 'relative', width: size, height: size, borderRadius: '50%', border: 'none', padding: 0,
          background: look.bg, color: look.fg,
          boxShadow: `0 ${down ? 2 : 6}px 0 ${look.edge}` + (state === 'due' ? ', var(--glow-due)' : ''),
          transform: `translateY(${down ? 3 : 0}px)`, cursor: interactive ? 'pointer' : 'not-allowed',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          animation: state === 'due' ? 'spur-pulse var(--pulse-due) var(--ease-in-out-soft) infinite' : 'none',
          transition: 'transform var(--dur-instant) var(--ease-out-soft), box-shadow var(--dur-instant) var(--ease-out-soft)',
        }} {...rest}>
        <Icon name={look.icon} size={Math.round(size * 0.42)} strokeWidth={2.4} />
      </button>
      </span>
      {label && <span style={{ font: 'var(--type-label)', fontWeight: 700, color: state === 'locked' ? 'var(--text-subtle)' : 'var(--text-muted)', maxWidth: 120, textAlign: 'center', background: 'var(--surface-page)', padding: '1px 6px', borderRadius: 6, position: 'relative' }}>{label}</span>}
    </span>
  );
}

/* ---- GoalRing ----------------------------------------------------------- */
export function GoalRing({ value = 0, size = 96, thickness = 10, tone = 'amber', caption, children, style, ...rest }) {
  const color = { amber: 'var(--spur-amber)', indigo: 'var(--spur-indigo)', correct: 'var(--spur-green)' }[tone] || 'var(--spur-amber)';
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
            style={{ transition: 'stroke-dashoffset var(--dur-slow) var(--ease-out-soft), stroke var(--dur-fast) var(--ease-out-soft)' }} />
        </svg>
        <span style={{ font: 'var(--type-title)', fontSize: size * 0.28, fontWeight: 'var(--weight-bold)', color: 'var(--text-ink)' }}>{children}</span>
      </span>
      {caption && <span style={{ font: 'var(--type-label)', fontWeight: 500, color: 'var(--text-muted)' }}>{caption}</span>}
    </span>
  );
}

/* ---- HeartsMeter / ∞ ------------------------------------------------------ */
export function HeartsMeter({ value = 5, max = 5, size = 20, shake = 0, style, ...rest }) {
  return (
    <span key={shake} className={shake ? 'a-shake' : undefined} role="img" aria-label={`Aufmerksamkeit ${value} von ${max}`}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 2, ...style }} {...rest}>
      {Array.from({ length: max }, (_, i) => i < value).map((on, i) => (
        <span key={i} style={{ color: on ? 'var(--state-heart)' : 'var(--spur-locked)', display: 'inline-flex', transition: 'color var(--dur-fast) var(--ease-out-soft)' }}>
          <Icon name="heart" size={size} strokeWidth={on ? 2.6 : 2} fill={on ? 'currentColor' : 'none'} />
        </span>
      ))}
    </span>
  );
}

/** Kompakte ∞-Anzeige (Lektionskopf, 3b). */
export function InfinityHearts() {
  return (
    <span role="img" aria-label="Aufmerksamkeit unendlich" style={{ display: 'flex', alignItems: 'center', gap: 3, color: 'var(--state-heart)' }}>
      <Icon name="heart" size={18} fill="currentColor" strokeWidth={2.6} />
      <Icon name="infinity" size={20} strokeWidth={2.6} />
    </span>
  );
}

/** ∞-Pille im Pfad-Header (3a) mit wanderndem Glanz. */
export function InfinityPill({ onClick }) {
  return (
    <button type="button" onClick={onClick} aria-label="Aufmerksamkeit unendlich" className="rm-static"
      style={{ display: 'flex', alignItems: 'center', gap: 4, height: 32, padding: '0 10px 0 8px', borderRadius: 999,
        border: '2px solid var(--spur-amber)', cursor: 'pointer', color: 'var(--state-heart)',
        background: 'linear-gradient(100deg,var(--accent-xp-soft) 30%,var(--surface-card) 50%,var(--accent-xp-soft) 70%)',
        backgroundSize: '220% 100%', animation: 'spur-shimmer 2800ms linear infinite' }}>
      <Icon name="heart" size={18} fill="currentColor" strokeWidth={2.6} />
      <Icon name="infinity" size={20} strokeWidth={2.6} />
    </button>
  );
}

/* ---- ProgressBar ----------------------------------------------------------- */
const BAR_TONES = { indigo: 'var(--spur-indigo)', amber: 'var(--spur-amber)', correct: 'var(--spur-green)',
  listen: 'var(--track-listen)', read: 'var(--track-read)', mixed: 'var(--spur-indigo)' };

export function ProgressBar({ value = 0, tone = 'indigo', height = 16, label, style, ...rest }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={label || 'Fortschritt'}
      style={{ width: '100%', height, background: 'var(--surface-locked)', borderRadius: 'var(--radius-pill)', overflow: 'hidden', ...style }} {...rest}>
      <div style={{ width: pct + '%', height: '100%', background: BAR_TONES[tone] || BAR_TONES.indigo,
        borderRadius: 'var(--radius-pill)', position: 'relative', transition: 'width var(--dur-base) var(--ease-out-soft)' }}>
        <span style={{ position: 'absolute', left: 6, right: 6, top: Math.max(2, height * 0.18), height: Math.max(2, height * 0.16),
          borderRadius: 'var(--radius-pill)', background: 'rgba(255,255,255,.35)', display: pct > 8 ? 'block' : 'none' }} />
      </div>
    </div>
  );
}

/* ---- StatTile / StreakPill / XPPill --------------------------------------- */
export function StatTile({ icon, value, label, tone = 'indigo', style, ...rest }) {
  const color = { indigo: 'var(--spur-indigo)', amber: 'var(--spur-amber)', correct: 'var(--spur-green)',
    listen: 'var(--track-listen)', read: 'var(--track-read)' }[tone] || 'var(--spur-indigo)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 14, textAlign: 'left',
      background: 'var(--surface-card)', border: '2px solid var(--border-default)', borderRadius: 'var(--radius-md)', ...style }} {...rest}>
      {icon && <span style={{ color, display: 'inline-flex' }}><Icon name={icon} size={24} /></span>}
      <span style={{ display: 'flex', flexDirection: 'column' }}>
        <span style={{ font: 'var(--type-title)', fontSize: 'var(--text-title)', fontWeight: 'var(--weight-bold)', color: 'var(--text-ink)' }}>{value}</span>
        <span style={{ font: 'var(--type-label)', fontWeight: 500, color: 'var(--text-muted)' }}>{label}</span>
      </span>
    </div>
  );
}

export function StreakPill({ days = 0, active = true, size = 'md', bump = 0, style, ...rest }) {
  const lg = size === 'lg';
  return (
    <span key={bump} className={bump ? 'a-pop' : undefined} aria-label={`Streak ${days} Tage`}
      style={{ display: 'inline-flex', alignItems: 'center', gap: lg ? 8 : 5, color: active ? 'var(--state-streak)' : 'var(--text-subtle)', ...style }} {...rest}>
      <Icon name="flame" size={lg ? 28 : 20} strokeWidth={2.4} />
      <span aria-hidden="true" style={{ font: 'var(--type-title)', fontSize: lg ? 28 : 'var(--text-body-l)', fontWeight: 'var(--weight-bold)',
        color: active ? 'var(--text-ink)' : 'var(--text-subtle)' }}>{days}</span>
    </span>
  );
}

export function XPPill({ xp = 0, size = 'md', style, ...rest }) {
  const lg = size === 'lg';
  return (
    <span aria-label={`${xp} Federn`} style={{ display: 'inline-flex', alignItems: 'center', gap: lg ? 8 : 5, ...style }} {...rest}>
      <Wordmark glyphOnly size={lg ? 26 : 19} />
      <span aria-hidden="true" style={{ font: 'var(--type-title)', fontSize: lg ? 28 : 'var(--text-body-l)', fontWeight: 'var(--weight-bold)', color: 'var(--text-ink)', fontVariantNumeric: 'tabular-nums' }}>{xp}</span>
    </span>
  );
}

/* ---- LessonHeader ---------------------------------------------------------- */
export function LessonHeader({ progress = 0, tone = 'listen', hearts = 5, infinite = false, heartShake = 0, onClose }) {
  return (
    <header style={{ flex: '0 0 auto', display: 'flex', alignItems: 'center', gap: 12, padding: 'calc(10px + env(safe-area-inset-top)) var(--gutter-screen) 10px', background: 'var(--surface-page)' }}>
      <IconButton icon="x" label="Übung abbrechen" onClick={onClose} size={44} />
      <ProgressBar value={progress} tone={tone} style={{ flex: 1 }} />
      {infinite ? <InfinityHearts /> : <HeartsMeter value={hearts} size={18} shake={heartShake} />}
    </header>
  );
}
