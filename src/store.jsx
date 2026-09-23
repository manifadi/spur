import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { loadState, saveState, clearState, requestPersistence } from './engine/storage.js';
import { hydrate, tick, initialState, freshProgress } from './engine/game.js';
import { INDEX } from './content/index.js';
import MIGRATIONS from './content/migrations.json';
import { checkReminder } from './lib/reminders.js';

const Ctx = createContext(null);

let themeFadeTimer = 0;

function applyTheme(theme) {
  const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  const root = document.documentElement;
  if (root.hasAttribute('data-theme') !== dark) {
    // Farben gleiten beim Umschalten über, statt hart zu wechseln (nur beim echten Wechsel).
    root.classList.add('theme-fade');
    clearTimeout(themeFadeTimer);
    themeFadeTimer = setTimeout(() => root.classList.remove('theme-fade'), 450);
  }
  document.documentElement.toggleAttribute('data-theme', false);
  if (dark) document.documentElement.setAttribute('data-theme', 'dark');
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', dark ? '#14151F' : '#3730A5');
  try { localStorage.setItem('spur-theme', theme); } catch { /* ignore */ }
}

export function StoreProvider({ children }) {
  const [state, setState] = useState(null);
  const saveTimer = useRef(0);
  const latest = useRef(null);

  useEffect(() => {
    let alive = true;
    loadState().then((saved) => { if (alive) setState(hydrate(saved, new Date(), MIGRATIONS.renames)); });
    requestPersistence();
    return () => { alive = false; };
  }, []);

  // Persistieren (gebündelt) und beim Verlassen sofort sichern.
  useEffect(() => {
    if (!state) return undefined;
    latest.current = state;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveState(state), 150);
    return undefined;
  }, [state]);

  useEffect(() => {
    const flush = () => {
      if (latest.current) saveState(latest.current);
      if (document.visibilityState === 'visible') setState((s) => (s ? tick(s) : s));
    };
    document.addEventListener('visibilitychange', flush);
    window.addEventListener('pagehide', flush);
    const id = setInterval(() => {
      setState((s) => (s ? tick(s) : s));
      if (latest.current) checkReminder(latest.current);
    }, 30000);
    return () => { document.removeEventListener('visibilitychange', flush); window.removeEventListener('pagehide', flush); clearInterval(id); };
  }, []);

  useEffect(() => {
    if (!state) return undefined;
    applyTheme(state.settings.theme);
    if (state.settings.theme !== 'system') return undefined;
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const on = () => applyTheme('system');
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, [state?.settings.theme]);

  const update = useCallback((fn) => setState((s) => fn(s)), []);
  const setSettings = useCallback((patch) => setState((s) => ({ ...s, settings: { ...s.settings, ...patch } })), []);

  /** "Fortschritt zurücksetzen" löscht alles außer den Einstellungen. */
  const resetProgress = useCallback(async () => {
    await clearState();
    setState((s) => ({ ...initialState(), onboarded: true, settings: s.settings, progress: freshProgress() }));
  }, []);

  if (!state) return children(null);
  return <Ctx.Provider value={{ state, index: INDEX, update, setSettings, resetProgress }}>{children(state)}</Ctx.Provider>;
}

export function useStore() {
  return useContext(Ctx);
}
