import { useState } from 'react';
import { Icon } from './Icon.jsx';

/* ---- Card ------------------------------------------------------------ */
const CARD_TONES = {
  default:  { bg: 'var(--surface-card)', border: 'var(--border-default)' },
  lavender: { bg: 'var(--surface-sunken)', border: 'var(--border-brand)' },
  listen:   { bg: 'var(--track-listen-soft)', border: 'var(--track-listen-soft)' },
  read:     { bg: 'var(--track-read-soft)', border: 'var(--track-read-soft)' },
  mixed:    { bg: 'var(--surface-sunken)', border: 'var(--surface-sunken)' },
  amber:    { bg: 'var(--accent-xp-soft)', border: 'var(--accent-xp-soft)' },
  indigo:   { bg: 'var(--spur-indigo)', border: 'var(--spur-indigo)' },
};

export function Card({ tone = 'default', padding = 20, radius = 'var(--radius-lg)', elevated = true, children, style, ...rest }) {
  const t = CARD_TONES[tone] || CARD_TONES.default;
  return (
    <div style={{
      background: t.bg, border: `2px solid ${t.border}`, borderRadius: radius, padding,
      color: tone === 'indigo' ? 'var(--text-inverse)' : 'var(--text-ink)',
      boxShadow: elevated ? 'var(--shadow-card)' : 'none',
      transition: 'transform var(--dur-fast) var(--ease-out-soft), box-shadow var(--dur-fast) var(--ease-out-soft)',
      ...style,
    }} {...rest}>{children}</div>
  );
}

/* ---- Badge ----------------------------------------------------------- */
const BADGE_TONES = {
  neutral: { soft: 'var(--surface-sunken)', solid: 'var(--spur-ink)', fg: 'var(--text-brand)' },
  indigo:  { soft: 'var(--spur-lavender)', solid: 'var(--spur-indigo)', fg: 'var(--spur-indigo)' },
  mixed:   { soft: 'var(--spur-lavender)', solid: 'var(--spur-indigo)', fg: 'var(--spur-indigo)' },
  amber:   { soft: 'var(--accent-xp-soft)', solid: 'var(--spur-amber)', fg: 'var(--badge-amber-fg, #8A5A12)' },
  correct: { soft: 'var(--state-correct-soft)', solid: 'var(--spur-green)', fg: 'var(--spur-green-shade)' },
  wrong:   { soft: 'var(--state-wrong-soft)', solid: 'var(--spur-coral)', fg: 'var(--spur-coral-shade)' },
  listen:  { soft: 'var(--track-listen-soft)', solid: 'var(--track-listen)', fg: 'var(--track-listen-shade)' },
  read:    { soft: 'var(--track-read-soft)', solid: 'var(--track-read)', fg: 'var(--track-read-shade)' },
};

export function Badge({ tone = 'neutral', variant = 'soft', icon, children, size = 'md', style, ...rest }) {
  const t = BADGE_TONES[tone] || BADGE_TONES.neutral;
  const solid = variant === 'solid';
  const sm = size === 'sm';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, flex: '0 0 auto',
      padding: sm ? '3px 8px' : '5px 12px', borderRadius: 'var(--radius-pill)',
      background: solid ? t.solid : t.soft, color: solid ? (tone === 'amber' ? '#2B1C06' : '#fff') : t.fg,
      font: 'var(--type-label)', fontSize: sm ? 'var(--text-caption)' : 'var(--text-label)',
      ...style,
    }} {...rest}>
      {icon && <Icon name={icon} size={sm ? 12 : 14} />}
      {children}
    </span>
  );
}

/* ---- TextField --------------------------------------------------------- */
const FIELD_STATE = {
  default: { border: 'var(--border-default)', bg: 'var(--surface-card)' },
  focus:   { border: 'var(--spur-indigo)', bg: 'var(--surface-card)' },
  correct: { border: 'var(--spur-green)', bg: 'var(--state-correct-soft)' },
  partial: { border: 'var(--spur-amber)', bg: 'var(--accent-xp-soft)' },
  wrong:   { border: 'var(--spur-coral)', bg: 'var(--state-wrong-soft)' },
};

export function TextField({ value, onChange, placeholder, label, hint, state = 'default', rows = 4, disabled, autoFocus, style, ...rest }) {
  const [focused, setFocused] = useState(false);
  const s = FIELD_STATE[state === 'default' && focused ? 'focus' : state] || FIELD_STATE.default;
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%', ...style }}>
      {label && <span style={{ font: 'var(--type-label)', color: 'var(--text-muted)' }}>{label}</span>}
      <textarea rows={rows} value={value} onChange={onChange} placeholder={placeholder} readOnly={disabled}
        autoFocus={autoFocus} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        aria-label={label || placeholder}
        style={{
          width: '100%', padding: '14px 16px', font: 'var(--type-body)', fontSize: 'var(--text-body-l)',
          lineHeight: 'var(--leading-relaxed)', color: 'var(--text-ink)', background: s.bg,
          border: `2px solid ${s.border}`, borderRadius: 'var(--radius-md)', outline: 'none', resize: 'none',
          transition: 'border-color var(--dur-fast) var(--ease-out-soft), background var(--dur-fast) var(--ease-out-soft), max-height var(--dur-base) var(--ease-out-soft)',
        }} {...rest} />
      {hint && <span style={{ font: 'var(--type-label)', fontWeight: 500, color: 'var(--text-muted)' }}>{hint}</span>}
    </label>
  );
}

/* ---- OptionTile -------------------------------------------------------- */
export function OptionTile({ icon, title, description, selected = false, tone = 'indigo', badge, onSelect, style, ...rest }) {
  const accent = tone === 'listen' ? 'var(--track-listen)' : tone === 'read' ? 'var(--track-read)' : 'var(--spur-indigo)';
  const softBg = tone === 'listen' ? 'var(--track-listen-soft)' : tone === 'read' ? 'var(--track-read-soft)' : 'var(--spur-lavender)';
  return (
    <button type="button" onClick={onSelect} aria-pressed={selected}
      style={{
        display: 'flex', alignItems: 'center', gap: 14, width: '100%', minHeight: 72, padding: '14px 16px',
        textAlign: 'left', background: selected ? softBg : 'var(--surface-card)',
        border: `2px solid ${selected ? accent : 'var(--border-default)'}`, borderRadius: 'var(--radius-lg)',
        boxShadow: selected ? `0 4px 0 ${accent}` : '0 4px 0 var(--border-default)', cursor: 'pointer',
        transition: 'all var(--dur-fast) var(--ease-out-soft)', ...style,
      }} {...rest}>
      {icon && (
        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 44,
          borderRadius: 'var(--radius-md)', background: selected ? 'var(--surface-card)' : softBg, color: accent, flex: '0 0 auto',
          transition: 'background var(--dur-fast) var(--ease-out-soft)' }}>
          <Icon name={icon} size={24} />
        </span>
      )}
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: 1 }}>
        <span style={{ font: 'var(--type-headline)', fontSize: 'var(--text-body-l)', color: 'var(--text-ink)' }}>{title}</span>
        {description && <span style={{ font: 'var(--type-body)', fontSize: 'var(--text-label)', color: 'var(--text-muted)' }}>{description}</span>}
      </span>
      {badge && <Badge tone="indigo" size="sm">{badge}</Badge>}
    </button>
  );
}

/* ---- Wordmark ---------------------------------------------------------- */
export const FEATHER_PATHS = (
  <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2.5c4.6 3 6 7.6 3.6 12.1-1.4 2.6-3.6 4.4-6.6 6.4-3-2-5.2-3.8-6.6-6.4C.1 10.1 1.5 5.5 6 2.5" />
    <path d="M9 21V6.2" /><path d="M9 11.2l3.9-2.6" /><path d="M9 15.4l3.1-2.1" />
    <path d="M9 11.2L5.1 8.6" /><path d="M9 15.4l-3.1-2.1" />
  </g>
);

export function Wordmark({ size = 32, inverse = false, glyphOnly = false, style, ...rest }) {
  const ink = inverse ? '#FFFFFF' : 'var(--spur-indigo)';
  const glyph = <svg viewBox="0 0 24 24" width={size * 1.05} height={size * 1.05} style={{ color: 'var(--spur-amber)', flex: '0 0 auto' }} aria-hidden="true">{FEATHER_PATHS}</svg>;
  if (glyphOnly) return <span style={{ display: 'inline-flex', ...style }} {...rest}>{glyph}</span>;
  return (
    <span role="img" aria-label="spur" style={{ display: 'inline-flex', alignItems: 'center', gap: size * 0.22, ...style }} {...rest}>
      {glyph}
      <span aria-hidden="true" style={{ font: 'var(--type-title)', fontSize: size, fontWeight: 700, color: ink, letterSpacing: '.01em', lineHeight: 1 }}>spur</span>
    </span>
  );
}

/* ---- Switch (1j: 54×32, Knopf 26) ------------------------------------- */
export function Switch({ checked, onChange, label }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}
      style={{ position: 'relative', width: 54, height: 32, borderRadius: 999, border: 'none', padding: 3, cursor: 'pointer', flex: '0 0 auto',
        background: checked ? 'var(--spur-indigo)' : 'var(--spur-locked)', transition: 'background var(--dur-fast) var(--ease-out-soft)' }}>
      <span style={{ position: 'absolute', top: 3, left: 3, width: 26, height: 26, borderRadius: '50%', background: '#fff',
        transform: `translateX(${checked ? 22 : 0}px)`, transition: 'transform var(--dur-fast) var(--ease-out-soft)' }} />
    </button>
  );
}
