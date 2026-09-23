import { useCallback, useEffect, useState } from 'react';
import { StoreProvider, useStore } from './store.jsx';
import { Splash } from './screens/Splash.jsx';
import { Onboarding } from './screens/Onboarding.jsx';
import { Home } from './screens/Home.jsx';
import { Lesson } from './screens/Lesson.jsx';
import { SessionEnd, StreakMilestone, InfinityUnlocked, ChapterDone } from './screens/Celebrations.jsx';
import { AllDone, StreakBroken, HeartsEmpty } from './screens/States.jsx';
import {
  buildLessonSession, buildDueSession, buildCheckpointSession, buildReviewSession, buildVoluntarySession,
  canStartNew, dueCardIds, doneTodayCount, hasAnyProgress, markLessonDone, isMastered, buildPopupSession,
} from './engine/game.js';

/** Hält die App-Höhe über der Bildschirmtastatur (iOS ignoriert interactive-widget). */
function useVisualViewport() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return undefined;
    const set = () => document.documentElement.style.setProperty('--app-h', `${vv.height}px`);
    set();
    vv.addEventListener('resize', set);
    return () => vv.removeEventListener('resize', set);
  }, []);
}

function isAllDone(index, state) {
  return hasAnyProgress(state)
    && doneTodayCount(state.progress) >= state.settings.dailyGoal
    && dueCardIds(index, state).length === 0;
}

function startRoute(index, state) {
  if (!state.onboarded) return { name: 'onboarding' };
  if (state.progress.pendingStreakBroken) return { name: 'streakBroken' };
  if (isAllDone(index, state)) return { name: 'allDone' };
  return { name: 'home' };
}

function Main() {
  const { state, index, update } = useStore();
  const [route, setRoute] = useState(() => startRoute(index, state));
  const [queue, setQueue] = useState([]);

  const go = useCallback((r) => setRoute(r), []);
  const home = useCallback((extra = {}) => setRoute({ name: 'home', ...extra }), []);

  const startSession = useCallback((session) => {
    if (!session.entries.length) {
      // Leerer Checkpoint (z. B. nach Spurwechsel): einfach abhaken.
      if (session.kind === 'checkpoint') update((s) => markLessonDone(index, s, session.lessonId, new Date()));
      home();
      return;
    }
    setRoute({ name: 'lesson', session, key: Date.now() });
  }, [index, update, home]);

  const openNode = useCallback((node) => {
    const now = new Date();
    if (node.lesson.type === 'checkpoint') return startSession(buildCheckpointSession(index, state, node.id, now));
    // Feld mit noch offenen Teilübungen (z. B. neu hinzugekommene): erst die offenen üben.
    const hasOpen = node.cardIds.some((id) => !isMastered(state.cards[id]));
    if (node.status === 'due') return startSession(buildDueSession(index, state, node.id, now));
    if (node.status === 'done' && hasOpen) {
      if (!canStartNew(state.progress, now)) return go({ name: 'heartsEmpty' });
      return startSession(buildLessonSession(index, state, node.id, now));
    }
    if (node.status === 'done') return startSession(buildLessonSession(index, state, node.id, now, 'replay'));
    if (!canStartNew(state.progress, now)) return go({ name: 'heartsEmpty' });
    return startSession(buildLessonSession(index, state, node.id, now));
  }, [index, state, startSession, go]);

  const popupTest = useCallback((chapterId) => startSession(buildPopupSession(index, state, chapterId)), [index, state, startSession]);
  const reviewsOnly = useCallback(() => startSession(buildReviewSession(index, state)), [index, state, startSession]);
  const voluntary = useCallback(() => startSession(buildVoluntarySession(index, state)), [index, state, startSession]);

  /** Nach der Session: Abschluss → Meilenstein → ∞ → Kapitel geschafft → Pfad bzw. "Alles erledigt". */
  const finishSession = useCallback((result) => {
    const q = [{ name: 'summary', result }];
    if (result.kind === 'popup') { setQueue([]); setRoute(q[0]); return; }
    if (result.milestone) {
      q.push({ name: 'milestone', days: result.milestone });
      q.push({ name: 'infinity', days: result.milestone });
    }
    if (result.chapterDone) q.push({ name: 'chapterDone', chapterId: result.chapterDone });
    q.push({ name: 'end', result });
    setQueue(q.slice(1));
    setRoute(q[0]);
  }, []);

  const nextInQueue = useCallback(() => {
    const [head, ...rest] = queue;
    setQueue(rest);
    if (!head) return home();
    if (head.name === 'end') {
      const r = head.result;
      const anim = { lessonDone: r.lessonDone, chapterDone: r.chapterDone, xpFrom: r.xpBefore, streakBump: r.streakUp, key: Date.now() };
      if (r.goalReached && isAllDone(index, state)) return setRoute({ name: 'allDone', anim });
      return home({ anim });
    }
    return setRoute(head);
  }, [queue, home, index, state]);

  let screen;
  switch (route.name) {
    case 'onboarding':
      screen = <Onboarding onDone={() => home()} />;
      break;
    case 'lesson':
      screen = <Lesson key={route.key} session={route.session} onFinish={finishSession} onExit={() => home()} />;
      break;
    case 'summary':
      screen = <SessionEnd result={route.result} onNext={nextInQueue} />;
      break;
    case 'milestone':
      screen = <StreakMilestone days={route.days} onNext={nextInQueue} />;
      break;
    case 'infinity':
      screen = <InfinityUnlocked days={route.days} onNext={nextInQueue} />;
      break;
    case 'chapterDone':
      screen = <ChapterDone chapterId={route.chapterId} onNext={nextInQueue} />;
      break;
    case 'allDone':
      screen = <AllDone anim={route.anim} onVoluntary={voluntary} onPath={() => home(route.anim ? { anim: { ...route.anim, xpFrom: undefined, streakBump: false, key: Date.now() } } : {})} />;
      break;
    case 'streakBroken':
      screen = <StreakBroken onNext={() => { update((s) => ({ ...s, progress: { ...s.progress, pendingStreakBroken: null } })); home(); }} />;
      break;
    case 'heartsEmpty':
      screen = <HeartsEmpty onReviews={reviewsOnly} onPath={() => home()} />;
      break;
    default:
      screen = <Home anim={route.anim} onOpenNode={openNode} onPopupTest={popupTest} />;
  }
  return <div key={route.name + (route.key || '')} className="screen-wrap">{screen}</div>;
}

export default function App() {
  useVisualViewport();
  const [minSplash, setMinSplash] = useState(true);
  useEffect(() => {
    // Splash bis Daten und Schrift da sind, höchstens 1,5 s.
    const t = setTimeout(() => setMinSplash(false), 1500);
    Promise.all([document.fonts?.ready, new Promise((r) => setTimeout(r, 700))]).then(() => { clearTimeout(t); setMinSplash(false); });
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="app">
      <StoreProvider>
        {(state) => (!state || minSplash ? <Splash /> : <Main />)}
      </StoreProvider>
    </div>
  );
}
