import { useEffect, useMemo } from 'react';
import { useStore } from '../store.jsx';
import { Icon } from '../ds/Icon.jsx';
import { Button } from '../ds/Button.jsx';
import { Badge, Card } from '../ds/core.jsx';
import { Mascot } from '../ds/feedback.jsx';
import { StatTile } from '../ds/progress.jsx';
import { chapterNumber, nextChapterAfter } from '../engine/game.js';
import { addDays, dayKey, weekdayMon } from '../engine/dates.js';
import { prefersReducedMotion, useCountUp, EASE } from '../lib/motion.js';
import { days as daysText } from '../lib/format.js';
import { sounds } from '../lib/sound.js';

const rise = (delay, ms = 320) => ({ animation: `spur-rise ${ms}ms ${EASE.soft} ${delay}ms both` });
const popin = (delay, ms = 420) => ({ animation: `spur-popin ${ms}ms ${EASE.bounce} ${delay}ms both` });
const center = { flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'safe center', textAlign: 'center', padding: 'calc(24px + env(safe-area-inset-top)) var(--gutter-screen) 0', position: 'relative', zIndex: 2 };
const bottom = (delay) => ({ padding: '24px var(--gutter-screen) calc(28px + env(safe-area-inset-bottom))', position: 'relative', zIndex: 2, ...rise(delay) });

/* ---- 3d Federregen ------------------------------------------------------------ */
const FEATHERS = Array.from({ length: 9 }, (_, i) => {
  const r = (n) => (Math.sin(i * 97.3 + n * 13.1) + 1) / 2;
  return {
    size: 20 + Math.round(r(1) * 14),
    outer: { position: 'absolute', top: -40, left: `${(8 + (i / 8) * 80 + (r(2) - 0.5) * 8).toFixed(1)}%`, display: 'inline-flex', color: 'var(--spur-amber)', opacity: 0.9,
      animation: `spur-drop ${Math.round(4200 + r(4) * 1800)}ms linear ${Math.round(r(5) * 2400)}ms both` },
    inner: { display: 'inline-flex', animation: `spur-sway ${Math.round(1100 + r(3) * 600)}ms cubic-bezier(.45,0,.55,1) ${Math.round(-r(6) * 1200)}ms infinite alternate` },
  };
});

/** 3d / 1i Lektionsende. Federregen nur bei 100 % und ohne "Bewegung reduzieren". */
export function SessionEnd({ result, onNext }) {
  const { state } = useStore();
  const p = state.progress;
  const acc = result.total ? Math.round(((result.good + result.partial * 0.5) / result.total) * 100) : 0;
  const perfect = acc === 100 && !prefersReducedMotion();
  const xp = useCountUp(result.xp, { delay: perfect ? 500 : 300, duration: perfect ? 1000 : 900 });
  useEffect(() => { if (state.settings.sounds) sounds.done(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const streakLabel = p.streak > 1 && p.streak >= p.longestStreak ? 'Streak — dein längster' : 'Streak';
  let line;
  if (result.good === result.total) line = result.total === 1 ? 'Die Karte saß.' : `Alle ${result.total} Karten saßen.`;
  else if (result.good === 0) line = 'Heute war es zäh. Genau dafür kommen die Karten wieder — ganz ohne Vorwurf.';
  else line = `${result.good} von ${result.total} Karten saßen. Der Rest kommt bald wieder.`;

  if (perfect) {
    return (
      <div className="screen">
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 1 }} aria-hidden="true">
          {FEATHERS.map((f, i) => (
            <span key={i} style={f.outer}><span style={f.inner}><Icon name="feather" size={f.size} fill="var(--accent-xp-soft)" /></span></span>
          ))}
        </div>
        <div style={center}>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 190, height: 190, flex: '0 0 auto', marginBottom: 10 }}>
            <span style={{ display: 'inline-flex', animation: `spur-jump 760ms ${EASE.jump} 300ms 2 both` }}>
              <Mascot pose="cheering" size={130} />
            </span>
          </div>
          <span className="overline" style={{ color: 'var(--text-muted)', marginBottom: 8, ...rise(400, 300) }}>Lektion geschafft</span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, ...popin(450) }} aria-label={`plus ${result.xp} Federn`}>
            <span style={{ font: 'var(--type-stat)', color: 'var(--spur-amber)', letterSpacing: 'var(--tracking-tight)' }}>+{xp}</span>
            <span style={{ font: 'var(--type-headline)', color: 'var(--text-muted)' }}>Federn</span>
          </div>
          <div className="stack" style={{ gap: 12, width: '100%', marginTop: 28 }}>
            <div style={rise(1300)}><StatTile icon="target" value="100%" label="Alles richtig" tone="correct" /></div>
            <div style={rise(1450)}><StatTile icon="flame" value={daysText(p.streak)} label={streakLabel} tone="amber" /></div>
          </div>
        </div>
        <div style={bottom(1700)}><Button full onClick={onNext}>Weiter</Button></div>
      </div>
    );
  }

  return (
    <div className="screen">
      <div style={center}>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 190, height: 190, flex: '0 0 auto', marginBottom: 10 }}>
          <Mascot pose="proud" size={130} />
        </div>
        <span className="overline" style={{ color: 'var(--text-muted)', marginBottom: 8 }}>Session beendet</span>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }} aria-label={`plus ${result.xp} Federn`}>
          <span style={{ font: 'var(--type-stat)', color: 'var(--spur-amber)', letterSpacing: 'var(--tracking-tight)' }}>+{xp}</span>
          <span style={{ font: 'var(--type-headline)', color: 'var(--text-muted)' }}>Federn</span>
        </div>
        <p style={{ font: 'var(--type-body-l)', color: 'var(--text-muted)', margin: '10px 0 28px', maxWidth: 290 }}>{line}</p>
        <div className="stack" style={{ gap: 12, width: '100%' }}>
          <StatTile icon="target" value={`${acc}%`} label="Genauigkeit" tone="correct" />
          <StatTile icon="flame" value={daysText(p.streak)} label={streakLabel} tone="amber" />
        </div>
      </div>
      <div style={{ padding: '24px var(--gutter-screen) calc(28px + env(safe-area-inset-bottom))' }}><Button full onClick={onNext}>Fertig</Button></div>
    </div>
  );
}

/* ---- 3g Streak-Meilenstein ------------------------------------------------------ */
const FLAME_OUTER = [
  'M60 126 C30 126 14 104 18 80 C22 58 40 46 44 20 C58 34 64 48 62 62 C70 56 74 46 74 36 C94 54 106 78 102 96 C98 114 82 126 60 126 Z',
  'M60 126 C30 126 14 104 18 80 C22 58 44 42 52 14 C62 32 66 48 62 62 C70 54 76 44 80 34 C96 54 106 78 102 96 C98 114 82 126 60 126 Z',
  'M60 126 C30 126 14 104 18 80 C22 58 36 48 38 24 C54 36 62 50 62 62 C70 58 72 50 70 40 C92 56 106 78 102 96 C98 114 82 126 60 126 Z',
];
const FLAME_INNER = [
  'M60 122 C45 122 38 110 40 98 C42 86 52 80 54 66 C64 76 74 88 74 100 C74 112 68 122 60 122 Z',
  'M60 122 C45 122 38 110 40 98 C42 86 54 76 60 60 C68 74 74 88 74 100 C74 112 68 122 60 122 Z',
  'M60 122 C45 122 38 110 40 98 C42 86 50 82 50 70 C62 78 74 88 74 100 C74 112 68 122 60 122 Z',
];
const morph = (paths, dur) => (
  <animate attributeName="d" dur={dur} repeatCount="indefinite" calcMode="spline" keyTimes="0;0.33;0.66;1"
    keySplines=".45 0 .55 1;.45 0 .55 1;.45 0 .55 1" values={[paths[0], paths[1], paths[2], paths[0]].join(';')} />
);

const MILESTONE_TEXT = {
  7: 'Eine Woche ohne Lücke. Miro ist beeindruckt.',
  14: 'Zwei Wochen ohne Lücke. So fest sitzt inzwischen auch das Gemerkte.',
  30: 'Ein ganzer Monat. Das Gemerkte hat jetzt Wurzeln.',
  50: '50 Tage. Das ist keine Phase mehr, das ist Gewohnheit.',
  100: '100 Tage am Stück. Miro zieht den Hut — wenn er einen hätte.',
};

export function StreakMilestone({ days, onNext }) {
  const { state } = useStore();
  const reduced = prefersReducedMotion();
  const week = useMemo(() => {
    const today = dayKey();
    const monday = addDays(today, -weekdayMon(today));
    const practiced = new Set(state.progress.practicedDays || []);
    return ['M', 'D', 'M', 'D', 'F', 'S', 'S'].map((d, i) => {
      const key = addDays(monday, i);
      return { d, key, today: key === today, done: key !== today && practiced.has(key) };
    });
  }, [state.progress.practicedDays]);
  return (
    <div className="screen" style={{ alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '0 var(--gutter-screen)' }}>
      <div style={{ ...center, padding: 'calc(24px + env(safe-area-inset-top)) 0 0', width: '100%' }}>
        <span style={{ display: 'inline-flex', color: 'var(--state-streak)', ...popin(0, 520) }}>
          <span className="rm-static" style={{ display: 'inline-flex', width: 120, height: 132, transformOrigin: '50% 100%', animation: 'spur-flicker 1400ms ease-in-out 600ms infinite, spur-glow 1800ms ease-in-out 600ms infinite' }}>
            <svg width="120" height="132" viewBox="0 0 120 132" aria-hidden="true">
              <path d={FLAME_OUTER[0]} fill="var(--state-streak)">{!reduced && morph(FLAME_OUTER, '1.6s')}</path>
              <path d={FLAME_INNER[0]} fill="var(--accent-xp-soft)">{!reduced && morph(FLAME_INNER, '1.2s')}</path>
            </svg>
          </span>
        </span>
        <div style={{ position: 'relative', height: 88, overflow: 'hidden', marginTop: 14, width: 180 }} aria-label={`${days} Tage am Stück`}>
          <span style={{ position: 'absolute', inset: 0, font: 'var(--weight-bold) 80px/88px var(--font-display)', color: 'var(--text-ink)', animation: `spur-outup 360ms cubic-bezier(.55,0,.6,1) 800ms both` }}>{days - 1}</span>
          <span style={{ position: 'absolute', inset: 0, font: 'var(--weight-bold) 80px/88px var(--font-display)', color: 'var(--text-ink)', animation: `spur-inup 420ms ${EASE.bounce} 900ms both` }}>{days}</span>
        </div>
        <span style={{ font: 'var(--type-headline)', color: 'var(--text-muted)', marginTop: 2 }}>Tage am Stück</span>
        <div style={{ display: 'flex', gap: 8, marginTop: 30 }}>
          {week.map((w) => (
            <span key={w.key} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <span style={{ position: 'relative', width: 38, height: 38, borderRadius: '50%', background: 'var(--surface-locked)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {w.done && <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'var(--state-streak)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}><Icon name="check" size={18} strokeWidth={3} /></span>}
                {w.today && <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'var(--state-streak)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', ...popin(1300, 460) }}><Icon name="flame" size={18} fill="currentColor" /></span>}
              </span>
              <span style={{ font: 'var(--type-label)', fontWeight: 700, color: 'var(--text-subtle)' }}>{w.d}</span>
            </span>
          ))}
        </div>
        <p style={{ font: 'var(--type-body-l)', color: 'var(--text-muted)', margin: '26px 0 0', maxWidth: 290, ...rise(1700) }}>
          {MILESTONE_TEXT[days] || `${days} Tage am Stück. Schön, dass du dranbleibst.`}
        </p>
      </div>
      <div style={{ ...bottom(1900), width: '100%', padding: '24px 0 calc(28px + env(safe-area-inset-bottom))' }}><Button full onClick={onNext}>Weiter</Button></div>
    </div>
  );
}

/* ---- 3c ∞ freigeschaltet --------------------------------------------------------- */
export function InfinityUnlocked({ days, onNext }) {
  return (
    <div className="screen" style={{ padding: '0 var(--gutter-screen)' }}>
      <div style={{ ...center, padding: 'calc(24px + env(safe-area-inset-top)) 0 0' }}>
        <div style={{ position: 'relative', width: 200, height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: '0 0 auto' }}>
          <div className="rm-hide" style={{ position: 'absolute', display: 'flex', gap: 8, color: 'var(--state-heart)', animation: 'spur-squeeze 520ms cubic-bezier(.55,0,.8,.3) 700ms both' }}>
            {[0, 1, 2, 3, 4].map((i) => <Icon key={i} name="heart" size={32} fill="currentColor" />)}
          </div>
          <span className="rm-hide" style={{ position: 'absolute', width: 150, height: 150, borderRadius: '50%', border: '6px solid var(--spur-amber)', animation: `spur-burst 700ms ${EASE.soft} 1350ms both` }} />
          <span style={{ position: 'absolute', width: 170, height: 170, borderRadius: '50%', background: 'var(--accent-xp-soft)', ...popin(1250, 500) }} />
          <span style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--state-heart)', ...popin(1300, 560) }}>
            <Icon name="heart" size={112} fill="currentColor" />
            <span style={{ position: 'absolute', top: 34, color: '#fff', display: 'inline-flex' }}><Icon name="infinity" size={40} strokeWidth={3} /></span>
          </span>
        </div>
        <div className="stack" style={{ alignItems: 'center', gap: 8, marginTop: 24, ...rise(1850) }}>
          <span className="overline" style={{ color: 'var(--badge-amber-fg, var(--spur-amber-shade))' }}>{days} Tage am Stück</span>
          <h2 style={{ font: 'var(--type-title)', textWrap: 'pretty' }}>Heute hast du unendlich Aufmerksamkeit.</h2>
          <p style={{ font: 'var(--type-body-l)', color: 'var(--text-muted)', maxWidth: 290 }}>Bis Mitternacht kosten Fehler kein Herz. Miro passt auf.</p>
        </div>
      </div>
      <div style={{ ...bottom(2150), padding: '24px 0 calc(28px + env(safe-area-inset-bottom))' }}><Button full onClick={onNext}>Weiter</Button></div>
    </div>
  );
}

/* ---- 4b Kapitel geschafft --------------------------------------------------------- */
const TRACK_NAME = { listen: 'Zuhören', read: 'Lesen', mixed: 'Gemischt' };

export function ChapterDone({ chapterId, onNext }) {
  const { state, index } = useStore();
  const chapter = index.chapters.find((c) => c.id === chapterId);
  const num = chapterNumber(index, state, chapterId);
  const next = nextChapterAfter(index, state, chapterId);
  const lessons = chapter.lessons.filter((l) => l.type !== 'checkpoint').length;
  const cardsN = chapter.lessons.reduce((n, l) => n + (index.lessons.get(l.id)?.cardIds.length || 0), 0);
  const tone = chapter.track;
  const shade = tone === 'read' ? 'var(--track-read-shade)' : tone === 'listen' ? 'var(--track-listen-shade)' : 'var(--spur-indigo)';
  const soft = tone === 'read' ? 'var(--track-read-soft)' : tone === 'listen' ? 'var(--track-listen-soft)' : 'var(--surface-sunken)';
  const words = ['Null', 'Eine', 'Zwei', 'Drei', 'Vier', 'Fünf', 'Sechs', 'Sieben', 'Acht'];
  return (
    <div className="screen">
      <div style={center}>
        <span style={{ display: 'inline-flex', animation: `spur-jump 760ms ${EASE.jump} 900ms 1 both` }}><Mascot pose="proud" size={130} /></span>
        <div style={{ position: 'relative', width: '100%', height: 84, marginTop: 22 }}>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '0 16px', borderRadius: 'var(--radius-lg)', background: soft, textAlign: 'left', animation: `spur-fadeout 320ms ${EASE.soft} 500ms both` }}>
            <span className="stack" style={{ gap: 2 }}>
              <span className="overline" style={{ color: shade }}>Kapitel {num}</span>
              <span style={{ font: 'var(--type-headline)' }}>{chapter.title}</span>
            </span>
            <Badge tone={tone} variant="solid" size="sm">{TRACK_NAME[tone]}</Badge>
          </div>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '0 16px', borderRadius: 'var(--radius-lg)', background: 'var(--spur-amber)', boxShadow: 'var(--shadow-edge-amber)', textAlign: 'left', animation: `spur-softin 420ms ${EASE.bounce} 500ms both` }}>
            <span className="stack" style={{ gap: 2 }}>
              <span className="overline" style={{ color: '#2B1C06' }}>Kapitel {num} · geschafft</span>
              <span style={{ font: 'var(--type-headline)', color: '#2B1C06' }}>{chapter.title}</span>
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 40, height: 40, borderRadius: '50%', background: '#fff', color: 'var(--spur-amber-shade)' }}><Icon name="check" strokeWidth={3} /></span>
          </div>
        </div>
        <h2 style={{ font: 'var(--type-title)', margin: '24px 0 6px', textWrap: 'pretty', ...rise(1100) }}>{words[lessons] || lessons} Lektionen, {cardsN} Karten im Gedächtnis.</h2>
        <p style={{ font: 'var(--type-body-l)', color: 'var(--text-muted)', maxWidth: 300, ...rise(1200) }}>Die Karten kommen weiter wieder, auch wenn du schon im nächsten Kapitel bist.</p>
        {next && (
          <div style={{ width: '100%', marginTop: 24, ...rise(1400) }}>
            <Card tone={next.track} padding={14} elevated={false} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <span className="stack" style={{ gap: 2, textAlign: 'left' }}>
                <span className="overline" style={{ color: next.track === 'read' ? 'var(--track-read-shade)' : next.track === 'listen' ? 'var(--track-listen-shade)' : 'var(--spur-indigo)' }}>Als Nächstes · Kapitel {num + 1}</span>
                <span style={{ font: 'var(--type-headline)' }}>{next.title}</span>
              </span>
              <Icon name="unlock" />
            </Card>
          </div>
        )}
      </div>
      <div style={bottom(1600)}><Button full onClick={onNext}>{next ? `Weiter zu Kapitel ${num + 1}` : 'Zum Pfad'}</Button></div>
    </div>
  );
}
