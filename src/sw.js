/* Service Worker: cacht alle Assets für die Offline-Nutzung und zeigt die
   tägliche Erinnerung lokal an (Periodic Background Sync, wo verfügbar). */
import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching';
import { registerRoute, NavigationRoute } from 'workbox-routing';
import { loadState, getItem, setItem } from './engine/storage.js';
import { reminderDue, reminderText, dueCount } from './engine/reminder.js';
import { dayKey } from './engine/dates.js';

self.skipWaiting();
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')));

async function maybeRemind() {
  const state = await loadState();
  const last = await getItem('lastReminderDay');
  const now = new Date();
  if (!reminderDue(state, last, now)) return;
  const clients = await self.clients.matchAll({ type: 'window' });
  if (clients.some((c) => c.visibilityState === 'visible')) return;
  const { title, body } = reminderText(dueCount(state, now));
  await setItem('lastReminderDay', dayKey(now));
  await self.registration.showNotification(title, { body, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: 'spur-reminder', lang: 'de' });
}

self.addEventListener('periodicsync', (e) => {
  if (e.tag === 'spur-reminder') e.waitUntil(maybeRemind());
});

self.addEventListener('message', (e) => {
  if (e.data === 'spur-check-reminder') e.waitUntil?.(maybeRemind());
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    const c = list[0];
    return c ? c.focus() : self.clients.openWindow('./');
  }));
});
