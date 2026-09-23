import { useEffect, useState } from 'react';
import { useStore } from '../store.jsx';
import { Button } from '../ds/Button.jsx';
import { Mascot } from '../ds/feedback.jsx';
import { GoalRing, HeartsMeter, StatTile, StreakPill } from '../ds/progress.jsx';
import { PathHeader } from './Home.jsx';
import { SettingsSheet } from './Settings.jsx';
import { doneTodayCount, msToNextHeart, nextDueDay } from '../engine/game.js';
import { cap, days, formatDuration, numWord } from '../lib/format.js';

const center = { flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'safe center', textAlign: 'center', padding: '16px var(--gutter-screen)' };
const h2 = { font: 'var(--type-title)', margin: '22px 0 8px', textWrap: 'pretty' };
const lead = { font: 'var(--type-body-l)', color: 'var(--text-muted)', maxWidth: 290 };
const foot = { padding: '0 var(--gutter-screen) calc(28px + env(safe-area-inset-bottom))', display: 'flex', flexDirection: 'column', gap: 10 };

/** 2c Alles erledigt: Tagesziel voll, nichts mehr fällig. */
export function AllDone({ onVoluntary, onPath, anim }) {
  const { state, index } = useStore();
  const [menu, setMenu] = useState(false);
  const goal = state.settings.dailyGoal;
  const done = doneTodayCount(state.progress);
  const next = nextDueDay(index, state);
  let text = 'Neue Karten warten auf dem Pfad, wenn du magst. Miro legt sich solange hin.';
  if (next) {
    const when = next.inDays === 1 ? 'morgen' : next.inDays === 2 ? 'übermorgen' : `in ${next.inDays} Tagen`;
    text = `Die nächsten ${next.count === 1 ? 'Karte wird' : `${numWord(next.count)} Karten werden`} ${when} fällig. Miro legt sich solange hin.`;
    if (next.count === 1) text = `Die nächste Karte wird ${when} fällig. Miro legt sich solange hin.`;
  }
  return (
    <div className="screen">
      <PathHeader xpFrom={anim?.xpFrom} streakBump={anim?.streakBump} onMenu={() => setMenu(true)} />
      <div style={center}>
        <Mascot pose="sleepy" size={130} />
        <h2 style={h2}>Für heute ist alles gemerkt.</h2>
        <p style={{ ...lead, margin: '0 0 26px' }}>{text}</p>
        <GoalRing value={1} size={64} thickness={8} tone="correct" caption="Tagesziel">{done}/{goal}</GoalRing>
      </div>
      <div style={foot}>
        <Button variant="secondary" full onClick={onVoluntary}>Freiwillige Runde</Button>
        <Button variant="ghost" size="md" full onClick={onPath}>Zum Pfad</Button>
      </div>
      <SettingsSheet open={menu} onClose={() => setMenu(false)} />
    </div>
  );
}

/** 4d Streak gerissen — einmalig nach einer Lücke, ohne Vorwurf. */
export function StreakBroken({ onNext }) {
  const { state } = useStore();
  const longest = state.progress.pendingStreakBroken?.longest || state.progress.longestStreak;
  return (
    <div className="screen">
      <div style={{ ...center, paddingTop: 'calc(24px + env(safe-area-inset-top))' }}>
        <Mascot pose="sleepy" size={130} />
        <div style={{ marginTop: 22 }}><StreakPill days={0} active={false} size="lg" /></div>
        <h2 style={{ ...h2, margin: '18px 0 8px' }}>Gestern war Pause. Macht nichts.</h2>
        <p style={{ ...lead, margin: '0 0 24px', maxWidth: 300 }}>Deine Karten sind noch alle da. Nur die Zählung fängt neu an.</p>
        <div style={{ width: '100%' }}>
          <StatTile icon="trophy" value={days(longest)} label="Dein längster Streak bleibt stehen" tone="amber" />
        </div>
      </div>
      <div style={{ ...foot, paddingTop: 24 }}><Button full onClick={onNext}>Heute wieder anfangen</Button></div>
    </div>
  );
}

/** 2f Aufmerksamkeit aufgebraucht: Wiederholungen gehen immer. */
export function HeartsEmpty({ onReviews, onPath }) {
  const { state } = useStore();
  const [menu, setMenu] = useState(false);
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), 20000);
    return () => clearInterval(id);
  }, []);
  const p = state.progress;
  const wait = msToNextHeart(p);
  const text = p.hearts > 0
    ? 'Ein Herz ist wieder da. Neue Karten gehen wieder.'
    : `Ein Herz kommt in ${formatDuration(wait)} zurück. Wiederholungen kosten keins — die gehen immer.`;
  return (
    <div className="screen">
      <PathHeader onMenu={() => setMenu(true)} />
      <div style={center}>
        <Mascot pose="disappointed" size={130} />
        <h2 style={h2}>{p.hearts > 0 ? cap('weiter geht’s.') : 'Deine Aufmerksamkeit ist alle.'}</h2>
        <p aria-live="polite" style={{ ...lead, margin: '0 0 20px' }}>{text}</p>
        <HeartsMeter value={p.hearts} size={28} />
      </div>
      <div style={foot}>
        <Button full onClick={onReviews}>Nur Wiederholungen üben</Button>
        <Button variant="ghost" size="md" full onClick={onPath}>Zurück zum Pfad</Button>
      </div>
      <SettingsSheet open={menu} onClose={() => setMenu(false)} />
    </div>
  );
}
