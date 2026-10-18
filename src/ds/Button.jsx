import { Icon } from './Icon.jsx';

// Farben je Ton; Form, Druck-Feedback und Zustände stecken in .btn (app.css).
const TONES = {
  primary:   { bg: 'var(--spur-brand)', edge: 'var(--spur-brand-shade)', fg: '#fff' },
  amber:     { bg: 'var(--spur-amber)', edge: 'var(--spur-amber-shade)', fg: 'var(--on-amber)' },
  correct:   { bg: 'var(--spur-green)', edge: 'var(--spur-green-shade)', fg: '#fff' },
  wrong:     { bg: 'var(--spur-coral)', edge: 'var(--spur-coral-shade)', fg: '#fff' },
  listen:    { bg: 'var(--track-listen)', edge: 'var(--track-listen-shade)', fg: '#fff' },
  read:      { bg: 'var(--track-read)', edge: 'var(--track-read-shade)', fg: '#fff' },
  mixed:     { bg: 'var(--spur-brand)', edge: 'var(--spur-brand-shade)', fg: '#fff' },
  secondary: { bg: 'var(--surface-card)', edge: 'var(--border-strong)', fg: 'var(--text-link)', border: 'var(--border-default)' },
  ghost:     { bg: 'transparent', edge: 'transparent', fg: 'var(--text-muted)' },
  // Auf farbigen Flächen (Pfad-Popover): weiß mit farbiger Schrift bzw. halbtransparent.
  inverse:   { bg: '#fff', edge: 'rgba(0,0,0,.2)', fg: 'var(--btn-accent, var(--spur-brand))' },
  glass:     { bg: 'rgba(255,255,255,.18)', edge: 'rgba(0,0,0,.16)', fg: 'var(--btn-accent-fg, #fff)' },
};
const SIZES = {
  sm: { h: 'var(--control-h-sm)', px: 14, fs: 'var(--text-caption)', r: 'var(--radius-sm)', icon: 16 },
  md: { h: 'var(--control-h-md)', px: 18, fs: 'var(--text-label)', r: 'var(--radius-md)', icon: 18 },
  lg: { h: 'var(--control-h-lg)', px: 22, fs: 'var(--text-body)', r: 'var(--radius-lg)', icon: 20 },
};

export function Button({ variant = 'primary', size = 'lg', full = false, icon, iconRight, disabled = false,
  children, onClick, type = 'button', style, className, ...rest }) {
  const t = TONES[variant] || TONES.primary;
  const s = SIZES[size] || SIZES.lg;
  return (
    <button type={type} disabled={disabled} onClick={onClick}
      className={['btn', variant === 'ghost' && 'btn-flat', className].filter(Boolean).join(' ')}
      style={{
        '--btn-bg': t.bg, '--btn-edge': t.edge, '--btn-fg': t.fg, '--btn-line': t.border || 'transparent',
        '--btn-h': s.h, '--btn-px': `${s.px}px`, '--btn-fs': s.fs, '--btn-r': s.r,
        width: full ? '100%' : undefined,
        ...style,
      }} {...rest}>
      {icon && <Icon name={icon} size={s.icon} strokeWidth={2.6} />}
      {children}
      {iconRight && <Icon name={iconRight} size={s.icon} strokeWidth={2.6} />}
    </button>
  );
}
