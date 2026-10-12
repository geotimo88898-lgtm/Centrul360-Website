// Centrul360 portal service worker, minimal on purpose.
//
// 1) Satisfies PWA installability (Chrome/Android requires a registered service worker with
//    a fetch handler before it will offer "Add to Home Screen" / let the app be installed).
//    No caching strategy here, the portal is always fetched fresh, same as the browser tab.
// 2) Push notification handlers are wired and ready, but INACTIVE until the portal starts
//    creating push subscriptions (a later step: VAPID keys + a subscribe endpoint + the
//    browser's permission prompt + server code that sends a push on real events, new
//    appointment, lead, approval needed, etc.). Until then, no push ever arrives here.

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
    icon: '/brand_asset/portal/icon-192.png',
    badge: '/brand_asset/portal/icon-192.png',
    data: { url: data.url || '/portal' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/portal';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(new URL(url, self.location.origin).pathname) && 'focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
