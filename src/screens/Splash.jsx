import { Wordmark } from '../ds/core.jsx';

/** 2b App-Start: flaches Indigo, Wortmarke mittig, drei Amber-Punkte. */
export function Splash() {
  return (
    <div className="screen" style={{ background: '#3730A5', alignItems: 'center', justifyContent: 'center' }} aria-label="spur lädt">
      <span className="a-rise"><Wordmark size={42} inverse /></span>
      <div style={{ position: 'absolute', bottom: 'calc(72px + env(safe-area-inset-bottom))', display: 'flex', gap: 7 }}>
        {[0, 160, 320].map((d) => (
          <span key={d} style={{ width: 7, height: 7, borderRadius: '50%', background: '#E8A33D', animation: `spur-dots 1100ms ease-in-out ${d}ms infinite` }} />
        ))}
      </div>
    </div>
  );
}
