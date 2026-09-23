import { useEffect, useState } from 'react';
import { useStore } from '../store.jsx';
import { Button } from '../ds/Button.jsx';
import { OptionTile } from '../ds/core.jsx';
import { Mascot } from '../ds/feedback.jsx';
import { ProgressBar } from '../ds/progress.jsx';
import { requestNotificationPermission, registerBackgroundReminder } from '../lib/reminders.js';

const GOAL_BY_FREQ = { daily: 3, three: 5, flex: 1 };

function Dots({ step }) {
  return (
    <div style={{ display: 'flex', gap: 6, marginBottom: 28 }} aria-label={`Schritt ${step + 1} von 4`}>
      {[0, 1, 2, 3].map((i) => (
        <span key={i} style={{ width: 34, height: 6, borderRadius: 999, background: i <= step ? 'var(--spur-indigo)' : 'var(--spur-lavender-deep)', transition: 'background var(--dur-fast) var(--ease-out-soft)' }} />
      ))}
    </div>
  );
}

const h1 = { font: 'var(--weight-semibold) 32px/1.18 var(--font-display)', color: 'var(--text-ink)', margin: '0 0 6px', textWrap: 'pretty' };
const sub = { font: 'var(--type-body)', color: 'var(--text-muted)', margin: '0 0 24px' };
const page = { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflowY: 'auto', padding: 'calc(28px + env(safe-area-inset-top)) var(--gutter-screen) calc(24px + env(safe-area-inset-bottom))' };

/** 1a Onboarding in 4 Schritten: Spur · Häufigkeit · Erinnerung · Pfad wird gebaut. */
export function Onboarding({ onDone }) {
  const { update } = useStore();
  const [step, setStep] = useState(0);
  const [track, setTrack] = useState(null);
  const [freq, setFreq] = useState(null);
  const [time, setTime] = useState('19:30');
  const [reminder, setReminder] = useState(null);
  const [loader, setLoader] = useState(0);

  useEffect(() => {
    if (step !== 3) return undefined;
    const t0 = performance.now();
    let raf;
    const tick = () => {
      const p = Math.min(1, (performance.now() - t0) / 2400);
      setLoader(p);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [step]);

  const askReminder = async () => {
    const perm = await requestNotificationPermission();
    setReminder(perm === 'denied' ? null : time);
    if (perm === 'granted') registerBackgroundReminder();
    setStep(3);
  };

  const finish = () => {
    update((s) => ({
      ...s,
      onboarded: true,
      settings: { ...s.settings, track, frequency: freq, reminder, dailyGoal: GOAL_BY_FREQ[freq] || 3 },
    }));
    onDone();
  };

  const done = loader >= 1;
  // Danach direkt weiter zum Pfad; "Los geht’s" überspringt die kurze Pause.
  useEffect(() => {
    if (!done) return undefined;
    const t = setTimeout(finish, 1400);
    return () => clearTimeout(t);
  }, [done]); // eslint-disable-line react-hooks/exhaustive-deps
  const status = done ? 'Dein Pfad steht.' : loader > 0.6 ? 'Intervalle gesetzt …' : loader > 0.3 ? 'Karten sortiert …' : 'Kapitel angelegt …';

  return (
    <div className="screen">
      {step === 0 && (
        <div style={page}>
          <Dots step={0} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <Mascot pose="head" size={64} />
            <span style={{ font: 'var(--type-body)', color: 'var(--text-muted)' }}>Ich bin Miro. Ich merk mir alles.</span>
          </div>
          <h1 style={h1}>Was möchtest du trainieren?</h1>
          <p style={sub}>Du kannst das später jederzeit ändern.</p>
          <div className="stack" style={{ gap: 12 }} role="radiogroup">
            <OptionTile icon="ear" tone="listen" title="Zuhören" description="Beiläufige Details aus Gesprächen behalten" selected={track === 'listen'} onSelect={() => setTrack('listen')} />
            <OptionTile icon="book-open" tone="read" title="Lesen" description="Texte aus dem Kopf wiedergeben" selected={track === 'read'} onSelect={() => setTrack('read')} />
            <OptionTile icon="sparkles" tone="indigo" title="Beides" description="Im Wechsel, ein Pfad" selected={track === 'both'} onSelect={() => setTrack('both')} />
          </div>
          <div style={{ flex: 1, minHeight: 24 }} />
          <Button full disabled={!track} onClick={() => setStep(1)}>Weiter</Button>
        </div>
      )}

      {step === 1 && (
        <div style={page}>
          <Dots step={1} />
          <h1 style={h1}>Wie oft willst du üben?</h1>
          <p style={sub}>Danach richtet sich, wie viele Karten pro Tag fällig werden.</p>
          <div className="stack" style={{ gap: 12 }} role="radiogroup">
            <OptionTile icon="clock" title="Täglich 5 Minuten" description="Eine kurze Session, meist abends" selected={freq === 'daily'} onSelect={() => setFreq('daily')} />
            <OptionTile icon="calendar" title="3× pro Woche" description="Mo, Mi, Fr — mit Puffer" selected={freq === 'three'} onSelect={() => setFreq('three')} />
            <OptionTile icon="shuffle" title="Flexibel" description="Ich komme, wenn ich Zeit habe" selected={freq === 'flex'} onSelect={() => setFreq('flex')} />
          </div>
          <div style={{ flex: 1, minHeight: 24 }} />
          <div className="stack" style={{ gap: 8 }}>
            <Button full disabled={!freq} onClick={() => setStep(2)}>Weiter</Button>
            <Button full variant="ghost" size="md" onClick={() => setStep(0)}>Zurück</Button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div style={page}>
          <Dots step={2} />
          <div style={{ display: 'flex', justifyContent: 'center', margin: '8px 0 20px' }}>
            <Mascot pose="sleepy" size={96} />
          </div>
          <h1 style={h1}>Soll Miro dich abends erinnern?</h1>
          <p style={sub}>Eine Nachricht am Tag, zu deiner Uhrzeit. Nie mehr.</p>
          <div style={{ display: 'flex', gap: 8 }} role="radiogroup" aria-label="Uhrzeit">
            {['18:00', '19:30', '21:00'].map((v) => (
              <button key={v} type="button" role="radio" aria-checked={time === v} onClick={() => setTime(v)}
                style={{ flex: 1, minHeight: 48, borderRadius: 'var(--radius-md)', cursor: 'pointer', font: 'var(--type-button)',
                  border: `2px solid ${time === v ? 'var(--spur-indigo)' : 'var(--border-default)'}`,
                  background: time === v ? 'var(--spur-lavender)' : 'var(--surface-card)', color: time === v ? 'var(--spur-indigo)' : 'var(--text-ink)',
                  transition: 'background var(--dur-fast) var(--ease-out-soft), border-color var(--dur-fast) var(--ease-out-soft)' }}>{v}</button>
            ))}
          </div>
          <div style={{ flex: 1, minHeight: 24 }} />
          <div className="stack" style={{ gap: 8 }}>
            <Button full icon="bell" onClick={askReminder}>Ja, erinner mich</Button>
            <Button full variant="ghost" size="md" onClick={() => { setReminder(null); setStep(3); }}>Später</Button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div style={{ ...page, alignItems: 'center', justifyContent: 'safe center', textAlign: 'center', gap: 4 }}>
          <img src="assets/illustrations/miro-sorting-cards.png" alt="Miro sortiert Karten" width={210} height={210}
            onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }}
            className="a-bob rm-static" style={{ width: 210, height: 210, objectFit: 'contain' }} />
          <h2 style={{ font: 'var(--type-title)', margin: '18px 0 6px', textWrap: 'pretty' }}>Dein Trainingspfad wird gebaut …</h2>
          <p style={{ font: 'var(--type-body)', color: 'var(--text-muted)', margin: '0 0 26px', maxWidth: 280 }}>Ich lege die Intervalle an: 1 · 2 · 4 · 8 · 16 · 30 · 60 Tage.</p>
          <ProgressBar value={loader} tone="indigo" label="Pfad wird gebaut" />
          <p aria-live="polite" style={{ font: 'var(--type-label)', fontWeight: 500, color: 'var(--text-subtle)', margin: '14px 0 0' }}>{status}</p>
          <div style={{ flex: '0 0 40px' }} />
          <div style={{ width: '100%', minHeight: 56 }}>
            {done && <div className="a-rise"><Button full onClick={finish}>Los geht’s</Button></div>}
          </div>
        </div>
      )}
    </div>
  );
}
