// Lokale Persistenz in IndexedDB (Fallback: localStorage). Wird auch vom
// Service Worker gelesen, um Erinnerungen ohne Server zu entscheiden.

const DB = 'spur';
const STORE = 'kv';
const KEY = 'state';

function openDb() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('no-idb'));
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(mode, fn) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    t.oncomplete = () => { db.close(); resolve(req && req.result); };
    t.onerror = () => { db.close(); reject(t.error); };
    t.onabort = () => { db.close(); reject(t.error); };
  }));
}

export async function loadState() {
  try {
    return (await tx('readonly', (s) => s.get(KEY))) || null;
  } catch {
    try { return JSON.parse(localStorage.getItem('spur-state') || 'null'); } catch { return null; }
  }
}

export async function saveState(state) {
  try {
    await tx('readwrite', (s) => s.put(state, KEY));
  } catch {
    try { localStorage.setItem('spur-state', JSON.stringify(state)); } catch { /* voll oder gesperrt */ }
  }
}

export async function getItem(key) {
  try { return await tx('readonly', (s) => s.get(key)); } catch { return null; }
}

export async function setItem(key, value) {
  try { await tx('readwrite', (s) => s.put(value, key)); } catch { /* ignore */ }
}

export async function clearState() {
  try { await tx('readwrite', (s) => s.delete(KEY)); } catch { /* ignore */ }
  try { localStorage.removeItem('spur-state'); } catch { /* ignore */ }
}

/** Bittet den Browser, die Daten nicht bei Speicherdruck zu löschen. */
export function requestPersistence() {
  try { navigator.storage?.persist?.(); } catch { /* ignore */ }
}
