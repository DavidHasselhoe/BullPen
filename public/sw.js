// Web push only: no fetch handler, no caching.
// Nothing is cached, so taking over open tabs at once is safe and ships worker fixes without closing every tab.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { /* malformed payload: show the fallback title */ }
  event.waitUntil(
    self.registration.showNotification(data.title || 'BullPen', {
      body: data.body,
      icon: '/icon-192.png',
      badge: '/badge-72.png',
      tag: data.tag,
      data: { url: data.url || '/dashboard' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const raw = (event.notification.data && event.notification.data.url) || '/dashboard';
  let target = new URL(raw, self.location.origin);
  if (target.origin !== self.location.origin) target = new URL('/dashboard', self.location.origin);
  const url = target.href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const open = list.find((c) => new URL(c.url).origin === self.location.origin);
      // navigate() rejects for a tab this worker does not control: open a window instead.
      if (open) return open.focus().then((c) => (c || open).navigate(url)).catch(() => self.clients.openWindow(url));
      return self.clients.openWindow(url);
    }),
  );
});
