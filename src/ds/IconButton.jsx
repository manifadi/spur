import { useState } from 'react';
import { Icon } from './Icon.jsx';

const LOOK = {
  ghost: { bg: 'transparent', fg: 'var(--text-muted)', edge: 'transparent', border: 'none' },
  soft:  { bg: 'var(--surface-sunken)', fg: 'var(--text-brand)', edge: 'transparent', border: 'none' },
  solid: { bg: 'var(--spur-indigo)', fg: '#fff', edge: 'var(--spur-indigo-shade)', border: 'none' },
  outline: { bg: 'var(--surface-card)', fg: 'var(--text-brand)', edge: 'var(--border-strong)', border: '2px solid var(--border-default)' },
};

export function IconButton({ icon, label, variant = 'ghost', size = 44, shape = 'circle', onClick, disabled, style, className, ...rest }) {
  const [down, setDown] = useState(false);
  const l = LOOK[variant] || LOOK.ghost;
  const depth = l.edge === 'transparent' ? 0 : (down ? 2 : 4);
  return (
    <button type="button" aria-label={label} disabled={disabled} onClick={onClick} className={className ? `spur-press ${className}` : 'spur-press'}
      onPointerDown={() => setDown(true)} onPointerUp={() => setDown(false)} onPointerLeave={() => setDown(false)} onPointerCancel={() => setDown(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto',
        width: size, height: size, padding: 0, background: l.bg, color: l.fg, border: l.border,
        borderRadius: shape === 'circle' ? '50%' : 'var(--radius-md)',
        boxShadow: depth ? `0 ${depth}px 0 ${l.edge}` : 'none',
        transform: `translateY(${depth && down ? 2 : 0}px) scale(${!depth && down ? 'var(--press-scale)' : 1})`,
        opacity: disabled ? .45 : 1, cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'transform var(--dur-instant) var(--ease-out-soft), background var(--dur-fast) var(--ease-out-soft)',
        ...style,
      }} {...rest}>
      <Icon name={icon} size={Math.round(size * 0.5)} />
    </button>
  );
}

/** Vorlese-Knopf: Lautsprecher, während der Wiedergabe vier Equalizer-Balken. */
export function SpeakButton({ playing, onClick, size = 48, label = 'Vorlesen' }) {
  if (!playing) return <IconButton icon="volume-2" label={label} variant="soft" size={size} onClick={onClick} className="a-fade" />;
  return (
    <button type="button" onClick={onClick} aria-label="Vorlesen stoppen" className="a-fade"
      style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 4, width: size, height: size, flex: '0 0 auto',
        borderRadius: '50%', border: 'none', background: 'var(--spur-lavender)', cursor: 'pointer', paddingBottom: Math.round(size * 0.27) }}>
      {[0, 140, 280, 420].map((d) => (
        <span key={d} className="rm-static" style={{ width: 4, height: 14, borderRadius: 999, background: 'var(--spur-indigo)',
          animation: `spur-eq 700ms ease-in-out ${d}ms infinite` }} />
      ))}
    </button>
  );
}
