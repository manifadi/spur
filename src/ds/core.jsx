import { useState } from 'react';
import { Icon } from './Icon.jsx';

/* ---- Card ------------------------------------------------------------ */
const CARD_TONES = {
  default:  { bg: 'var(--surface-card)', border: 'var(--border-default)' },
  sunken:   { bg: 'var(--surface-sunken)', border: 'var(--border-default)' },
  listen:   { bg: 'var(--track-listen-soft)', border: 'var(--track-listen-soft)' },
  read:     { bg: 'var(--track-read-soft)', border: 'var(--track-read-soft)' },
  mixed:    { bg: 'var(--track-mixed-soft)', border: 'var(--track-mixed-soft)' },
  amber:    { bg: 'var(--accent-xp-soft)', border: 'var(--accent-xp-soft)' },
  brand:    { bg: 'var(--spur-brand)', border: 'var(--spur-brand)' },
};

export function Card({ tone = 'default', padding = 20, radius = 'var(--radius-lg)', elevated = true, children, style, ...rest }) {
  const t = CARD_TONES[tone] || CARD_TONES.default;
  return (
    <div style={{
      background: t.bg, border: `2px solid ${t.border}`, borderRadius: radius, padding,
      color: tone === 'brand' ? '#fff' : 'var(--text-ink)',
      boxShadow: elevated ? 'var(--shadow-card)' : 'none',
      ...style,
    }} {...rest}>{children}</div>
  );
}

/* ---- Badge ----------------------------------------------------------- */
const BADGE_TONES = {
  neutral: { soft: 'var(--surface-sunken)', solid: 'var(--spur-ink)', fg: 'var(--text-muted)' },
  brand:   { soft: 'var(--spur-brand-soft)', solid: 'var(--spur-brand)', fg: 'var(--spur-brand-shade)' },
  mixed:   { soft: 'var(--track-mixed-soft)', solid: 'var(--track-mixed)', fg: 'var(--track-mixed-shade)' },
  amber:   { soft: 'var(--accent-xp-soft)', solid: 'var(--spur-amber)', fg: 'var(--badge-amber-fg)' },
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
      padding: sm ? '4px 8px' : '6px 11px', borderRadius: 'var(--radius-sm)',
      background: solid ? t.solid : t.soft, color: solid ? (tone === 'amber' ? 'var(--on-amber)' : '#fff') : t.fg,
      // Duolingo-Etikett: klein, fett, Großbuchstaben.
      font: 'var(--type-overline)', fontSize: sm ? 11 : 'var(--text-caption)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-wide)',
      ...style,
    }} {...rest}>
      {icon && <Icon name={icon} size={sm ? 12 : 14} strokeWidth={2.6} />}
      {children}
    </span>
  );
}

/* ---- TextField --------------------------------------------------------- */
const FIELD_STATE = {
  // Duolingo: Eingabefeld grau hinterlegt, beim Schreiben weiß mit blauem Rand.
  default: { border: 'var(--border-default)', bg: 'var(--surface-sunken)' },
  focus:   { border: 'var(--select-line)', bg: 'var(--surface-card)' },
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
          transition: 'border-color var(--dur-fast) var(--ease-out), background-color var(--dur-fast) var(--ease-out), max-height var(--dur-base) var(--ease-out)',
        }} {...rest} />
      {hint && <span style={{ font: 'var(--type-label)', fontWeight: 600, color: 'var(--text-muted)' }}>{hint}</span>}
    </label>
  );
}

/* ---- OptionTile -------------------------------------------------------- */
const OPTION_ICON = {
  listen: { fg: 'var(--track-listen)', bg: 'var(--track-listen-soft)' },
  read:   { fg: 'var(--track-read)', bg: 'var(--track-read-soft)' },
  amber:  { fg: 'var(--spur-amber-shade)', bg: 'var(--accent-xp-soft)' },
  brand:  { fg: 'var(--spur-brand)', bg: 'var(--spur-brand-soft)' },
};

/** Auswahl-Kachel (.tile): gewählt in Duolingo-Blau, Druck senkt sie ab. */
export function OptionTile({ icon, title, description, selected = false, tone = 'brand', badge, onSelect, style, ...rest }) {
  const ic = OPTION_ICON[tone] || OPTION_ICON.brand;
  return (
    <button type="button" onClick={onSelect} aria-pressed={selected} className="tile"
      style={{ display: 'flex', alignItems: 'center', gap: 14, width: '100%', minHeight: 72, padding: '14px 16px', borderRadius: 'var(--radius-lg)', ...style }} {...rest}>
      {icon && (
        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 44,
          borderRadius: 'var(--radius-md)', background: selected ? 'var(--surface-card)' : ic.bg, color: ic.fg, flex: '0 0 auto',
          transition: 'background-color var(--dur-fast) var(--ease-out)' }}>
          <Icon name={icon} size={24} strokeWidth={2.4} />
        </span>
      )}
      <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: 1 }}>
        <span style={{ font: 'var(--type-headline)', fontSize: 'var(--text-body-l)', color: selected ? 'var(--select-fg)' : 'var(--text-ink)' }}>{title}</span>
        {description && <span style={{ font: 'var(--type-body)', fontSize: 'var(--text-label)', color: 'var(--text-muted)' }}>{description}</span>}
      </span>
      {badge && <Badge tone="brand" size="sm">{badge}</Badge>}
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
  const ink = inverse ? '#FFFFFF' : 'var(--spur-brand)';
  const glyph = <svg viewBox="0 0 24 24" width={size * 1.05} height={size * 1.05} style={{ color: 'var(--spur-amber)', flex: '0 0 auto' }} aria-hidden="true">{FEATHER_PATHS}</svg>;
  if (glyphOnly) return <span style={{ display: 'inline-flex', ...style }} {...rest}>{glyph}</span>;
  return (
    <span role="img" aria-label="spur" style={{ display: 'inline-flex', alignItems: 'center', gap: size * 0.22, ...style }} {...rest}>
      {glyph}
      <span aria-hidden="true" style={{ font: 'var(--type-title)', fontSize: size, fontWeight: 900, color: ink, letterSpacing: '-.01em', lineHeight: 1 }}>spur</span>
    </span>
  );
}

/* ---- Switch (1j: 54×32, Knopf 26) ------------------------------------- */
export function Switch({ checked, onChange, label }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}
      style={{ position: 'relative', width: 54, height: 32, borderRadius: 999, border: 'none', padding: 3, cursor: 'pointer', flex: '0 0 auto',
        background: checked ? 'var(--spur-dove)' : 'var(--surface-locked)', transition: 'background-color var(--dur-fast) var(--ease-out)' }}>
      <span style={{ position: 'absolute', top: 3, left: 3, width: 26, height: 26, borderRadius: '50%', background: '#fff', boxShadow: '0 2px 0 rgba(0,0,0,.12)',
        transform: `translateX(${checked ? 22 : 0}px)`, transition: 'transform var(--dur-fast) var(--ease-out)' }} />
    </button>
  );
}
