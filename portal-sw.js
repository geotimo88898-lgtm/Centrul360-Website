// Centrul360 portal service worker, minimal on purpose.
//
// 1) Satisfies PWA installability (Chrome/Android requires a registered service worker with
//    a fetch handler before it will offer "Add to Home Screen" / let the app be installed).
//    No caching strategy here, the portal is always fetched fresh, same as the browser tab.
// 2) Shows the Web Push notifications the portal sends (a new lead, other alerts from the automations,
//    api/_lib/push.js); a tap opens the portal on the right section.

self.addEventListener('install', () => { self.skipWaiting(); });
self.addEventListener('activate', (event) => { event.waitUntil(self.clients.claim()); });

self.addEventListener('fetch', () => {
  // Intentionally a no-op passthrough, required for installability, no offline caching.
});

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = { title: 'Centrul360', body: event.data ? event.data.text() : '' }; }
  const title = data.title || 'Centrul360';
  const options = {
    body: data.body || '',
    icon: '/brand_asset/portal/icon-192.png?v=3',
    badge: '/brand_asset/portal/badge-96.png?v=3',
    data: { url: data.url || '/portal' },
    // the same lead twice (e.g. it filled the form again) replaces its notification and rings again;
    // quiet: the same payment, now with the client's name from the desk, replaces the POS line without ringing
    tag: data.tag || undefined,
    renotify: !!data.tag && !data.quiet,
    silent: !!data.quiet,
    vibrate: data.quiet ? undefined : [120, 60, 120], // a silent notification can't vibrate (it would throw)
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/portal';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(new URL(url, self.location.origin).pathname) && 'focus' in client) {
          // an open portal goes to the right section (e.g. Pipeline for a new lead) instead of reloading
          client.postMessage({ type: 'c360:go', url });
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
