import { useLayoutEffect, useRef, useState } from 'react';
import { Icon } from '../ds/Icon.jsx';
import { Button } from '../ds/Button.jsx';
import { Badge } from '../ds/core.jsx';
import { INTERVALS } from '../engine/srs.js';

/** 3f Karte gemerkt: Karte dreht sich zu "Gemerkt" und wandert ins nächste Intervall. */
export function IntervalStep({ card, from, to, onNext }) {
  const rowRef = useRef(null);
  const cardRef = useRef(null);
  const [dx, setDx] = useState(0);
  const [dy, setDy] = useState(233);
  useLayoutEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    const r = row.getBoundingClientRect();
    const slot = 18 + (to * (r.width - 36)) / (INTERVALS.length - 1);
    setDx(slot - r.width / 2);
    // Abstand hängt von der Displayhöhe ab: Karte fliegt genau in den Kreis der Stufe.
    const c = cardRef.current?.getBoundingClientRect();
    if (c) setDy(r.top + 18 - (c.top + c.height / 2));
  }, [to]);
  const days = INTERVALS[to];
  const title = card.track === 'read' ? card.item.topic : card.question.prompt;
  const same = from === to;
  return (
    <div className="screen">
      <div style={{ padding: 'calc(clamp(16px, 5dvh, 40px) + env(safe-area-inset-top)) var(--gutter-screen) 0', textAlign: 'center' }}>
        <span className="overline" style={{ color: 'var(--text-muted)' }}>Wiederholung richtig</span>
        <h2 style={{ font: 'var(--type-title)', margin: '6px 0 0', textWrap: 'pretty' }}>
          {same ? 'Gut gemerkt — der größte Abstand hält.' : 'Gut gemerkt — der Abstand verdoppelt sich.'}
        </h2>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'safe center', padding: '0 24px', minHeight: 0 }}>
        <div ref={cardRef} className="rm-fade" style={{ position: 'relative', width: 220, height: 150, flex: '0 0 auto', perspective: 900,
          '--file-x': `${dx}px`, '--file-y': `${dy}px`, animation: 'spur-file 640ms cubic-bezier(.55,0,.6,1) 1500ms both' }}>
          <div className="rm-static" style={{ position: 'relative', width: '100%', height: '100%', transformStyle: 'preserve-3d', animation: 'spur-flip 520ms cubic-bezier(.45,0,.35,1) 600ms both' }}>
            <div style={{ position: 'absolute', inset: 0, backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', background: 'var(--surface-card)', border: '2px solid var(--border-default)',
              borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-raised)', padding: 16, display: 'flex', flexDirection: 'column', gap: 10, textAlign: 'left', overflow: 'hidden' }}>
              <Badge tone={card.track} icon={card.track === 'read' ? 'book-open' : 'ear'} size="sm" style={{ alignSelf: 'flex-start' }}>{card.lesson.title}</Badge>
              <span style={{ font: 'var(--type-headline)', color: 'var(--text-ink)' }}>{title}</span>
            </div>
            <div style={{ position: 'absolute', inset: 0, backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', transform: 'rotateY(180deg)', background: 'var(--spur-green)',
              borderRadius: 'var(--radius-lg)', boxShadow: '0 6px 0 var(--spur-green-shade)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color: '#fff' }}>
              <Icon name="check" size={40} strokeWidth={3} />
              <span style={{ font: 'var(--type-headline)' }}>Gemerkt</span>
            </div>
          </div>
        </div>
        <div style={{ flex: '0 1 140px', minHeight: 36 }} />
        <div ref={rowRef} style={{ width: '100%', display: 'flex', justifyContent: 'space-between' }} role="img" aria-label={`Intervall-Stufen, jetzt ${days} Tage`}>
          {INTERVALS.map((d, i) => (
            <span key={d} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, width: 36 }}>
              <span style={{ position: 'relative', width: 36, height: 36, borderRadius: '50%', background: 'var(--spur-lavender)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {i === from && !same && <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'var(--spur-lavender-deep)', animation: 'spur-fadeout 300ms ease 1900ms both' }} />}
                {i === to && (
                  <>
                    <span className="rm-hide" style={{ position: 'absolute', inset: -8, borderRadius: '50%', border: '4px solid var(--spur-indigo)', animation: 'spur-burst 700ms cubic-bezier(.22,.8,.3,1) 2150ms both' }} />
                    <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'var(--spur-indigo)', animation: 'spur-popin 420ms cubic-bezier(.34,1.56,.64,1) 2100ms both' }} />
                  </>
                )}
              </span>
              <span style={{ font: 'var(--type-label)', fontWeight: 700, color: i === to ? 'var(--spur-indigo)' : 'var(--text-muted)' }}>{d}</span>
            </span>
          ))}
        </div>
        <div aria-live="polite" style={{ marginTop: 24, textAlign: 'center', animation: 'spur-rise 320ms cubic-bezier(.22,.8,.3,1) 2350ms both' }}>
          <span style={{ font: 'var(--type-headline)', color: 'var(--text-ink)' }}>Nächstes Mal in {days} Tagen</span>
          <span style={{ display: 'block', font: 'var(--type-label)', fontWeight: 500, color: 'var(--text-subtle)', marginTop: 4 }}>Tage bis zur nächsten Frage</span>
        </div>
      </div>
      <div style={{ padding: '16px var(--gutter-screen) calc(24px + env(safe-area-inset-bottom))' }}>
        <Button full onClick={onNext} autoFocus>Weiter</Button>
      </div>
    </div>
  );
}
