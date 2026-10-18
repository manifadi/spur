import { Wordmark } from '../ds/core.jsx';

/** 2b App-Start: flaches Grün wie bei Duolingo, Wortmarke mittig, drei weiße Punkte. */
export function Splash() {
  return (
    <div className="screen" style={{ background: 'var(--spur-brand)', alignItems: 'center', justifyContent: 'center' }} aria-label="spur lädt">
      <span className="a-rise"><Wordmark size={46} inverse /></span>
      <div style={{ position: 'absolute', bottom: 'calc(72px + env(safe-area-inset-bottom))', display: 'flex', gap: 7 }}>
        {[0, 160, 320].map((d) => (
          <span key={d} style={{ width: 8, height: 8, borderRadius: '50%', background: '#fff', animation: `spur-dots 1100ms var(--ease-sine) ${d}ms infinite` }} />
        ))}
      </div>
    </div>
  );
}
