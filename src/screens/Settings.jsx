import { useEffect, useState } from 'react';
import { useStore } from '../store.jsx';
import { Icon } from '../ds/Icon.jsx';
import { Button } from '../ds/Button.jsx';
import { OptionTile, Switch } from '../ds/core.jsx';
import { Sheet } from '../ds/feedback.jsx';
import { notificationsSupported, requestNotificationPermission, registerBackgroundReminder } from '../lib/reminders.js';
import { ttsSupported } from '../lib/tts.js';

const TIMES = [
  { v: '08:00', label: '08:00 — morgens' },
  { v: '12:30', label: '12:30 — Mittagspause' },
  { v: '18:00', label: '18:00 — Feierabend' },
  { v: '19:30', label: '19:30 — nach dem Essen' },
  { v: '21:00', label: '21:00 — vor dem Schlafen' },
];
const GOALS = [
  { v: 1, title: '1 Karte', description: 'Locker — hält den Streak' },
  { v: 3, title: '3 Karten', description: 'Normal — etwa 5 Minuten', badge: 'Empfohlen' },
  { v: 5, title: '5 Karten', description: 'Ehrgeizig — etwa 9 Minuten' },
  { v: 8, title: '8 Karten', description: 'Viel — nur an guten Tagen' },
];
const TRACKS = [
  { v: 'listen', title: 'Zuhören', description: 'Beiläufige Details aus Gesprächen behalten', icon: 'ear', tone: 'listen' },
  { v: 'read', title: 'Lesen', description: 'Texte aus dem Kopf wiedergeben', icon: 'book-open', tone: 'read' },
  { v: 'both', title: 'Beides', description: 'Im Wechsel, ein Pfad', icon: 'sparkles', tone: 'indigo' },
];

const row = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 56, padding: '12px 0', background: 'none', border: 'none', borderBottom: '1px solid var(--border-default)', cursor: 'pointer', textAlign: 'left', width: '100%', color: 'var(--text-ink)' };
const rowLabel = { font: 'var(--type-body)', fontSize: 'var(--text-body-l)', color: 'var(--text-ink)' };
const rowValue = { display: 'flex', alignItems: 'center', gap: 6, font: 'var(--type-body)', color: 'var(--text-muted)' };

function isDark(theme) {
  return theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
}

/** 1j Einstellungen als Bottom-Sheet über dem Pfad, mit 2g / 2h / 2i als Unterseiten. */
export function SettingsSheet({ open, onClose }) {
  const { state, setSettings, resetProgress } = useStore();
  const s = state.settings;
  const [view, setView] = useState('main');
  const [goal, setGoal] = useState(s.dailyGoal);
  const [permNote, setPermNote] = useState(null);
  useEffect(() => { if (open) { setView('main'); setGoal(s.dailyGoal); setPermNote(null); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const back = () => setView('main');

  if (view === 'goal') {
    return (
      <Sheet open={open} contentKey={view} title="Tagesziel" onClose={back}>
        <p style={{ font: 'var(--type-body)', color: 'var(--text-muted)', marginTop: -8 }}>Fällige Wiederholungen zählen immer mit — auch über dem Ziel.</p>
        <div className="stack" style={{ gap: 10 }} role="radiogroup">
          {GOALS.map((g) => <OptionTile key={g.v} icon="feather" title={g.title} description={g.description} badge={g.badge} selected={goal === g.v} onSelect={() => setGoal(g.v)} />)}
        </div>
        <Button full onClick={() => { setSettings({ dailyGoal: goal }); back(); }}>Übernehmen</Button>
      </Sheet>
    );
  }

  if (view === 'reminder') {
    const pick = async (v) => {
      if (v) {
        const perm = await requestNotificationPermission();
        if (perm === 'denied') setPermNote('Mitteilungen sind für spur gerade blockiert. Du kannst sie in den Geräte-Einstellungen erlauben.');
        else if (perm === 'unsupported') setPermNote('Dieses Gerät erlaubt spur hier keine Mitteilungen. Auf dem iPhone klappt es erst, wenn spur zum Home-Bildschirm hinzugefügt ist.');
        else { setPermNote(null); registerBackgroundReminder(); }
      } else setPermNote(null);
      setSettings({ reminder: v });
    };
    return (
      <Sheet open={open} contentKey={view} title="Erinnerungszeit" onClose={back}>
        <p style={{ font: 'var(--type-body)', color: 'var(--text-muted)', marginTop: -8 }}>Miro meldet sich einmal am Tag. Mehr nicht.</p>
        <div className="stack" role="radiogroup">
          {TIMES.map((t) => (
            <button key={t.v} type="button" role="radio" aria-checked={s.reminder === t.v} onClick={() => pick(t.v)} style={row}>
              <span style={rowLabel}>{t.label}</span>
              {s.reminder === t.v && <span style={{ color: 'var(--spur-indigo)', display: 'inline-flex' }}><Icon name="check" /></span>}
            </button>
          ))}
          <button type="button" role="radio" aria-checked={!s.reminder} onClick={() => pick(null)} style={{ ...row, borderBottom: 'none' }}>
            <span style={{ ...rowLabel, color: 'var(--text-muted)' }}>Gar nicht erinnern</span>
            {!s.reminder && <span style={{ color: 'var(--spur-indigo)', display: 'inline-flex' }}><Icon name="check" /></span>}
          </button>
        </div>
        {permNote && <p role="status" style={{ font: 'var(--type-label)', fontWeight: 500, color: 'var(--spur-coral-shade)' }}>{permNote}</p>}
        <p style={{ font: 'var(--type-label)', fontWeight: 500, color: 'var(--text-subtle)' }}>
          Die Erinnerung kommt direkt von deinem Gerät, ohne Server. Ob und wann sie erscheint, entscheidet dein Betriebssystem — am ehesten, wenn spur installiert ist.
        </p>
      </Sheet>
    );
  }

  if (view === 'track') {
    return (
      <Sheet open={open} contentKey={view} title="Training" onClose={back}>
        <p style={{ font: 'var(--type-body)', color: 'var(--text-muted)', marginTop: -8 }}>Deine Karten und ihre Intervalle bleiben erhalten.</p>
        <div className="stack" style={{ gap: 10 }} role="radiogroup">
          {TRACKS.map((t) => <OptionTile key={t.v} icon={t.icon} tone={t.tone} title={t.title} description={t.description} selected={s.track === t.v} onSelect={() => setSettings({ track: t.v })} />)}
        </div>
        <Button full onClick={back}>Fertig</Button>
      </Sheet>
    );
  }

  if (view === 'reset') {
    const streak = state.progress.streak;
    return (
      <Sheet open={open} contentKey={view} title="Wirklich zurücksetzen?" onClose={back}>
        <p style={{ font: 'var(--type-body-l)', color: 'var(--text-ink)', marginTop: -8 }}>
          {streak > 1 ? `Alle Karten, ihre Intervalle und dein Streak von ${streak} Tagen verschwinden.` : 'Alle Karten und ihre Intervalle verschwinden.'} Der Pfad fängt wieder bei Kapitel 1 an.
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--state-wrong-soft)', borderRadius: 'var(--radius-md)', padding: '14px 16px' }}>
          <span style={{ color: 'var(--spur-coral-shade)', display: 'inline-flex' }}><Icon name="alert-triangle" /></span>
          <span style={{ font: 'var(--type-body)', color: 'var(--spur-coral-shade)' }}>Das lässt sich nicht rückgängig machen.</span>
        </div>
        <div className="stack" style={{ gap: 10 }}>
          <Button variant="wrong" full onClick={async () => { await resetProgress(); onClose(); }}>Ja, alles zurücksetzen</Button>
          <Button variant="ghost" size="md" full onClick={back}>Doch nicht</Button>
        </div>
      </Sheet>
    );
  }

  const trackLabel = TRACKS.find((t) => t.v === s.track)?.title;
  return (
    <Sheet open={open} contentKey={view} title="Einstellungen" onClose={onClose}>
      <div className="stack" style={{ marginTop: -4 }}>
        <button type="button" style={row} onClick={() => setView('track')}>
          <span style={rowLabel}>Training</span>
          <span style={rowValue}>{trackLabel}<Icon name="chevron-right" /></span>
        </button>
        <button type="button" style={row} onClick={() => setView('goal')}>
          <span style={rowLabel}>Tagesziel</span>
          <span style={rowValue}>{s.dailyGoal} {s.dailyGoal === 1 ? 'Karte' : 'Karten'}<Icon name="chevron-right" /></span>
        </button>
        {notificationsSupported() && (
          <button type="button" style={row} onClick={() => setView('reminder')}>
            <span style={rowLabel}>Erinnerungszeit</span>
            <span style={rowValue}>{s.reminder || 'Aus'}<Icon name="chevron-right" /></span>
          </button>
        )}
        {ttsSupported() && (
          <div style={{ ...row, cursor: 'default' }}>
            <span style={rowLabel}>Miro liest vor</span>
            <Switch checked={s.tts} label="Miro liest vor" onChange={(v) => setSettings({ tts: v })} />
          </div>
        )}
        <div style={{ ...row, cursor: 'default' }}>
          <span style={rowLabel}>Töne</span>
          <Switch checked={s.sounds} label="Töne" onChange={(v) => setSettings({ sounds: v })} />
        </div>
        <div style={{ ...row, cursor: 'default' }}>
          <span style={rowLabel}>Dark Mode</span>
          <Switch checked={isDark(s.theme)} label="Dark Mode" onChange={(v) => setSettings({ theme: v ? 'dark' : 'light' })} />
        </div>
        <button type="button" onClick={() => setView('reset')}
          style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 56, padding: '14px 0 6px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', width: '100%', color: 'var(--spur-coral)', font: 'var(--type-body)', fontSize: 'var(--text-body-l)' }}>
          <Icon name="rotate-ccw" />
          Fortschritt zurücksetzen
        </button>
        <span style={{ font: 'var(--type-label)', fontWeight: 500, color: 'var(--text-subtle)', paddingTop: 10 }}>spur 1.0 · Alles bleibt auf diesem Gerät.</span>
      </div>
    </Sheet>
  );
}
