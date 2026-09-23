import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon.jsx';
import { IconButton } from './IconButton.jsx';
import { Button } from './Button.jsx';
import { Wordmark } from './core.jsx';
import { usePresence } from '../lib/motion.js';

/* ---- Mascot ------------------------------------------------------------ */
const POSES = {
  neutral: 'neutral', listening: 'zuhörend', cheering: 'jubelnd',
  disappointed: 'enttäuscht', proud: 'stolz', sleepy: 'schläfrig', head: 'Kopf',
};
const FILES = {
  neutral: 'miro-neutral.png', listening: 'miro-listening.png', cheering: 'miro-cheering.png',
  disappointed: 'miro-disappointed.png', proud: 'miro-proud.png', sleepy: 'miro-sleepy.png',
  head: 'miro-head-halfprofile.png',
};

/** Miro, der Rabe. Antippen lässt ihn kurz hüpfen (Pop 1 → 1.28 → 1, 600 ms). */
export function Mascot({ pose = 'neutral', size = 120, alt, style, className, interactive = true, ...rest }) {
  const [failed, setFailed] = useState(false);
  const [pop, setPop] = useState(0);
  const label = POSES[pose] || pose;
  useEffect(() => setFailed(false), [pose]);
  const onTap = interactive ? () => setPop((n) => n + 1) : undefined;
  const inner = !failed ? (
    <img src={`assets/mascot/${FILES[pose] || FILES.neutral}`} alt={alt || `Miro, ${label}`} width={size} height={size}
      onError={() => setFailed(true)} draggable={false}
      style={{ width: size, height: size, objectFit: 'contain', display: 'block' }} />
  ) : (
    <span role="img" aria-label={alt || `Miro (${label})`}
      style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
        width: size, height: size, borderRadius: '50%', background: 'var(--surface-sunken)',
        border: '2px dashed var(--spur-lavender-deep)', color: 'var(--spur-indigo)' }}>
      <Wordmark glyphOnly size={size * 0.3} />
      {size >= 72 && (
        <span style={{ font: 'var(--type-overline)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-wide)',
          color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.25, padding: '0 6px' }}>Miro<br />{label}</span>
      )}
    </span>
  );
  return (
    <span onClick={onTap} key={pop} className={[pop ? 'a-pop' : '', className || ''].join(' ').trim() || undefined}
      style={{ display: 'inline-flex', flex: '0 0 auto', cursor: interactive ? 'pointer' : undefined, ...style }} {...rest}>
      {inner}
    </span>
  );
}

/* ---- SpeechBubble ------------------------------------------------------ */
export function SpeechBubble({ tail = 'left', tone = 'default', children, style, ...rest }) {
  const bg = tone === 'lavender' ? 'var(--surface-sunken)' : 'var(--surface-card)';
  const border = tone === 'lavender' ? 'var(--border-brand)' : 'var(--border-default)';
  const tailPos = { left: { left: -9, top: 26 }, right: { right: -9, top: 26 }, bottom: { left: 28, bottom: -9 } }[tail] || { left: -9, top: 26 };
  return (
    <div style={{ position: 'relative', background: bg, border: `2px solid ${border}`, borderRadius: 'var(--radius-lg)',
      padding: '14px 18px', font: 'var(--type-headline)', color: 'var(--text-ink)', ...style }} {...rest}>
      {children}
      <span aria-hidden="true" style={{ position: 'absolute', width: 14, height: 14, background: bg,
        borderLeft: `2px solid ${border}`, borderBottom: `2px solid ${border}`,
        transform: tail === 'right' ? 'rotate(225deg)' : tail === 'bottom' ? 'rotate(-45deg)' : 'rotate(45deg)', ...tailPos }} />
    </div>
  );
}

/* ---- FeedbackPanel ------------------------------------------------------
   correct / wrong wie im Design. "partial" ist eine Ergänzung für "teilweise
   erinnert" (Amber-Töne aus den Tokens), weil die Bewertung drei Stufen hat. */
const PANEL = {
  correct: { bg: 'var(--state-correct-soft)', fg: 'var(--spur-green-shade)', icon: 'check-circle-2', title: 'Gemerkt!', btn: 'correct' },
  partial: { bg: 'var(--accent-xp-soft)', fg: 'var(--badge-amber-fg, #8A5A12)', icon: 'history', title: 'Teilweise gemerkt.', btn: 'amber' },
  wrong:   { bg: 'var(--state-wrong-soft)', fg: 'var(--spur-coral-shade)', icon: 'rotate-ccw', title: 'Beim nächsten Mal sitzt es.', btn: 'wrong' },
};

export function FeedbackPanel({ state = 'correct', title, detail, source, sourceLabel = 'Im Original', actionLabel = 'Weiter', onAction, extra, style, ...rest }) {
  const p = PANEL[state] || PANEL.correct;
  return (
    <div role="status" aria-live="polite" className="fb-panel" style={{ background: p.bg, borderTopLeftRadius: 'var(--radius-xl)', borderTopRightRadius: 'var(--radius-xl)',
      padding: '20px var(--gutter-screen) calc(24px + env(safe-area-inset-bottom))', boxShadow: 'var(--shadow-sheet)',
      display: 'flex', flexDirection: 'column', gap: 14, ...style }} {...rest}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: p.fg }}>
        <Icon name={p.icon} size={30} strokeWidth={2.4} />
        <span className="fb-title" style={{ font: 'var(--type-title)', fontSize: 'var(--text-title)' }}>{title || p.title}</span>
      </div>
      {detail && <p style={{ font: 'var(--type-body)', fontSize: 'var(--text-body-l)', color: 'var(--text-ink)' }}>{detail}</p>}
      {source && (
        <div className="fb-source" style={{ background: 'var(--surface-card)', border: '2px solid rgba(31,33,48,.06)', borderRadius: 'var(--radius-md)', padding: '12px 14px', maxHeight: '28dvh', overflowY: 'auto' }}>
          <div className="overline" style={{ color: 'var(--text-muted)', marginBottom: 4 }}>{sourceLabel}</div>
          {Array.isArray(source)
            ? <ul style={{ margin: 0, paddingLeft: 18, font: 'var(--type-body)', color: 'var(--text-ink)' }}>{source.map((s) => <li key={s}>{s}</li>)}</ul>
            : <p style={{ font: 'var(--type-body)', color: 'var(--text-ink)' }}>{source}</p>}
        </div>
      )}
      {extra}
      <Button variant={p.btn} full onClick={onAction} autoFocus>{actionLabel}</Button>
    </div>
  );
}

/* ---- Sheet --------------------------------------------------------------
   Scrim blendet ein, Sheet fährt in 320 ms von unten und beim Schließen wieder
   hinunter. Schließen per Scrim, ✕ oder Wisch nach unten. Inhalt scrollt innen.
   Wechselt `contentKey` (Unterseiten), blendet der Inhalt weich über. */
export function Sheet({ open = true, title, onClose, children, footer, closable = true, contentKey }) {
  const [drag, setDrag] = useState(0);
  const start = useRef(null);
  const [shown, leaving] = usePresence(open, 260);
  // Beim Rausfahren den zuletzt gezeigten Inhalt behalten.
  const last = useRef(null);
  if (open) last.current = { title, children, footer };
  useEffect(() => { if (open) setDrag(0); }, [open]);
  useEffect(() => {
    if (!open || !onClose) return;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!shown) return null;
  const view = last.current;
  const onDown = (e) => { start.current = e.clientY; };
  const onMove = (e) => { if (start.current != null) setDrag(Math.max(0, e.clientY - start.current)); };
  // Weggewischt: aus der aktuellen Position weiter nach unten fahren (drag bleibt stehen).
  const onUp = () => { const close = drag > 90 && onClose; start.current = null; if (close) onClose(); else setDrag(0); };
  return (
    <div onClick={closable && !leaving ? onClose : undefined}
      style={{ position: 'absolute', inset: 0, background: 'var(--overlay-scrim)', display: 'flex', alignItems: 'flex-end',
        justifyContent: 'center', zIndex: 40, pointerEvents: leaving ? 'none' : undefined,
        animation: leaving ? 'spur-scrim-out 260ms var(--ease-out-soft) both' : 'spur-scrim-in var(--dur-base) var(--ease-out-soft) both' }}>
      <div role="dialog" aria-modal="true" aria-label={view.title} onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 'var(--screen-max)', maxHeight: 'calc(100% - env(safe-area-inset-top) - 32px)', background: 'var(--surface-card)',
          borderTopLeftRadius: 'var(--radius-xl)', borderTopRightRadius: 'var(--radius-xl)', display: 'flex', flexDirection: 'column',
          boxShadow: 'var(--shadow-sheet)', transform: `translateY(${drag}px)`, transition: start.current == null ? 'transform var(--dur-fast) var(--ease-out-soft)' : 'none',
          animation: leaving ? 'spur-sheet-out 260ms cubic-bezier(.5,0,.75,0) both' : 'spur-sheet-in var(--dur-base) var(--ease-out-soft) both' }}>
        <div onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '18px var(--gutter-screen) 0', touchAction: 'none' }}>
          <span key={contentKey} className={contentKey ? 'a-fade' : undefined} style={{ font: 'var(--type-title)', fontSize: 'var(--text-title)' }}>{view.title}</span>
          {onClose && closable && <IconButton icon="x" label="Schließen" onClick={onClose} size={44} />}
        </div>
        <div key={contentKey} className={contentKey ? 'phase-in' : undefined}
          style={{ overflowY: 'auto', padding: '16px var(--gutter-screen) calc(24px + env(safe-area-inset-bottom))', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {view.children}
          {view.footer}
        </div>
      </div>
    </div>
  );
}
