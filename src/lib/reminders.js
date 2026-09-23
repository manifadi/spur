// Erinnerungen ohne Server: Die App prüft minütlich, solange sie offen oder im
// Hintergrund ist; installierte PWAs auf Chromium nutzen zusätzlich Periodic
// Background Sync. Zuverlässige Zustellung auf allen Geräten gibt es so nicht —
// die Einstellungen versprechen das deshalb auch nicht.
import { getItem, setItem } from '../engine/storage.js';
import { reminderDue, reminderText, dueCount } from '../engine/reminder.js';
import { dayKey } from '../engine/dates.js';

export function notificationsSupported() {
  return typeof window !== 'undefined' && 'Notification' in window && 'serviceWorker' in navigator;
}

export async function requestNotificationPermission() {
  if (!notificationsSupported()) return 'unsupported';
  if (Notification.permission !== 'default') return Notification.permission;
  try { return await Notification.requestPermission(); } catch { return 'denied'; }
}

export async function registerBackgroundReminder() {
  try {
    const reg = await navigator.serviceWorker?.ready;
    if (!reg || !('periodicSync' in reg)) return;
    const status = await navigator.permissions.query({ name: 'periodic-background-sync' });
    if (status.state === 'granted') await reg.periodicSync.register('spur-reminder', { minInterval: 60 * 60 * 1000 });
  } catch { /* nicht unterstützt */ }
}

export async function checkReminder(state) {
  if (!notificationsSupported() || Notification.permission !== 'granted') return;
  if (document.visibilityState === 'visible') return; // App ist offen, keine Mitteilung nötig
  const now = new Date();
  const last = await getItem('lastReminderDay');
  if (!reminderDue(state, last, now)) return;
  const reg = await navigator.serviceWorker?.ready;
  if (!reg) return;
  const { title, body } = reminderText(dueCount(state, now));
  await setItem('lastReminderDay', dayKey(now));
  await reg.showNotification(title, { body, icon: 'icons/icon-192.png', tag: 'spur-reminder', lang: 'de' });
}
