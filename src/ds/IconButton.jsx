import { Icon } from './Icon.jsx';

const LOOK = {
  ghost: { bg: 'transparent', fg: 'var(--text-subtle)', edge: 'transparent' },
  soft:  { bg: 'var(--track-listen-soft)', fg: 'var(--track-listen-shade)', edge: 'transparent' },
  solid: { bg: 'var(--spur-brand)', fg: '#fff', edge: 'var(--spur-brand-shade)' },
  outline: { bg: 'var(--surface-card)', fg: 'var(--text-link)', edge: 'var(--border-strong)', line: 'var(--border-default)' },
};

export function IconButton({ icon, label, variant = 'ghost', size = 44, shape = 'circle', onClick, disabled, style, className, ...rest }) {
  const l = LOOK[variant] || LOOK.ghost;
  const flat = l.edge === 'transparent';
  return (
    <button type="button" aria-label={label} disabled={disabled} onClick={onClick}
      className={['btn', 'btn-icon', flat && 'btn-flat', className].filter(Boolean).join(' ')}
      style={{
        '--btn-bg': l.bg, '--btn-edge': l.edge, '--btn-fg': l.fg, '--btn-line': l.line || 'transparent',
        '--btn-r': shape === 'circle' ? '50%' : 'var(--radius-md)',
        width: size, height: size, ...style,
      }} {...rest}>
      <Icon name={icon} size={Math.round(size * 0.5)} strokeWidth={2.6} />
    </button>
  );
}

/** Vorlese-Knopf: Lautsprecher, während der Wiedergabe vier Equalizer-Balken. */
export function SpeakButton({ playing, onClick, size = 48, label = 'Vorlesen' }) {
  if (!playing) return <IconButton icon="volume-2" label={label} variant="soft" size={size} onClick={onClick} className="a-fade" />;
  return (
    <button type="button" onClick={onClick} aria-label="Vorlesen stoppen" className="btn btn-icon btn-flat a-fade"
      style={{ '--btn-bg': 'var(--track-listen-soft)', '--btn-r': '50%', width: size, height: size, alignItems: 'flex-end', gap: 4, paddingBottom: Math.round(size * 0.27) }}>
      {[0, 140, 280, 420].map((d) => (
        <span key={d} className="rm-static eq-bar" style={{ width: 4, height: 14, background: 'var(--track-listen)', transformOrigin: '50% 100%', animationDelay: `${d}ms` }} />
      ))}
    </button>
  );
}
