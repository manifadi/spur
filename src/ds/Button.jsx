import { useState } from 'react';
import { Icon } from './Icon.jsx';

const TONES = {
  primary:   { bg: 'var(--spur-indigo)', edge: 'var(--spur-indigo-shade)', fg: '#fff' },
  amber:     { bg: 'var(--spur-amber)', edge: 'var(--spur-amber-shade)', fg: '#2B1C06' },
  correct:   { bg: 'var(--spur-green)', edge: 'var(--spur-green-shade)', fg: '#fff' },
  wrong:     { bg: 'var(--spur-coral)', edge: 'var(--spur-coral-shade)', fg: '#fff' },
  listen:    { bg: 'var(--track-listen)', edge: 'var(--track-listen-shade)', fg: '#fff' },
  read:      { bg: 'var(--track-read)', edge: 'var(--track-read-shade)', fg: '#fff' },
  mixed:     { bg: 'var(--spur-indigo)', edge: 'var(--spur-indigo-shade)', fg: '#fff' },
  secondary: { bg: 'var(--surface-card)', edge: 'var(--border-strong)', fg: 'var(--text-brand)', border: '2px solid var(--border-default)' },
  ghost:     { bg: 'transparent', edge: 'transparent', fg: 'var(--text-muted)' },
};
const SIZES = {
  sm: { h: 'var(--control-h-sm)', px: 16, fs: 'var(--text-label)', r: 'var(--radius-sm)', icon: 16 },
  md: { h: 'var(--control-h-md)', px: 20, fs: 'var(--text-body)', r: 'var(--radius-md)', icon: 18 },
  lg: { h: 'var(--control-h-lg)', px: 24, fs: 'var(--text-body-l)', r: '16px', icon: 20 },
};

export function Button({ variant = 'primary', size = 'lg', full = false, icon, iconRight, disabled = false,
  children, onClick, type = 'button', style, ...rest }) {
  const [down, setDown] = useState(false);
  const t = TONES[variant] || TONES.primary;
  const s = SIZES[size] || SIZES.lg;
  const flat = variant === 'ghost' || disabled;
  const depth = flat ? 0 : (down ? 2 : 4);
  return (
    <button type={type} disabled={disabled} onClick={onClick} className="spur-press"
      onPointerDown={() => setDown(true)} onPointerUp={() => setDown(false)} onPointerLeave={() => setDown(false)} onPointerCancel={() => setDown(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 10,
        width: full ? '100%' : undefined, minHeight: s.h, padding: `0 ${s.px}px`,
        font: 'var(--type-button)', fontSize: s.fs, letterSpacing: '.01em',
        background: disabled ? 'var(--surface-locked)' : t.bg,
        color: disabled ? 'var(--text-subtle)' : t.fg,
        border: t.border || '2px solid transparent', borderRadius: s.r,
        boxShadow: depth ? `0 ${depth}px 0 ${t.edge}` : 'none',
        transform: `translateY(${flat ? 0 : (down ? 2 : 0)}px)`,
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'transform var(--dur-instant) var(--ease-out-soft), box-shadow var(--dur-fast) var(--ease-out-soft), background var(--dur-fast) var(--ease-out-soft), color var(--dur-fast) var(--ease-out-soft)',
        ...style,
      }} {...rest}>
      {icon && <Icon name={icon} size={s.icon} />}
      {children}
      {iconRight && <Icon name={iconRight} size={s.icon} />}
    </button>
  );
}
