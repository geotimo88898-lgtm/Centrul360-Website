// Centrul360 portal service worker, minimal on purpose.
//
// 1) Satisfies PWA installability (Chrome/Android requires a registered service worker with
//    a fetch handler before it will offer "Add to Home Screen" / let the app be installed).
//    The portal's own files are kept on the device and refreshed in the background (below); pages and data are not.
// 2) Shows the Web Push notifications the portal sends (a new lead, other alerts from the automations,
//    api/_lib/push.js); a tap opens the portal on the right section.

self.addEventListener('install', () => { self.skipWaiting(); });
self.addEventListener('activate', (event) => { event.waitUntil(self.clients.claim()); });

// The portal's own files (scripts, styles, pictures, fonts) come from this device at once and are refreshed in the
// background (the owner, 5.11: "flash speed"); a new version of the portal empties this cache (portal-core.js
// seeBuild), so the next reload has the new files. Pages and /api always go to the network.
const STATIC = 'c360-static-v1';
const MINE = /^\/(portal-[\w-]+\.(?:js|css)|vendor\/|brand_asset\/|game\/)/;
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || !MINE.test(url.pathname) || url.pathname === '/portal-sw.js' || req.headers.get('range')) return;
  event.respondWith(caches.open(STATIC).then((cache) => cache.match(req).then((hit) => {
    const net = fetch(req).then((res) => { if (res && res.status === 200 && res.type === 'basic') cache.put(req, res.clone()).catch(() => {}); return res; });
    if (hit) { event.waitUntil(net.catch(() => {})); return hit; }
    return net;
  })));
});

// The portal lives on admin.centrul360.com / staff.centrul360.com (at /). A phone that turned the notifications on
// back when the portal was also on www.centrul360.com still gets them through that site's worker: its taps go to admin.
const home = (u) => (/(^|\.)centrul360\.com$/.test(self.location.hostname) && !/^(admin|staff)\./.test(self.location.hostname) && u.charAt(0) === '/' ? 'https://admin.centrul360.com' + u : u);

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { data = { title: 'Centrul360', body: event.data ? event.data.text() : '' }; }
  const title = data.title || 'Centrul360';
  const options = {
    body: data.body || '',
    icon: '/brand_asset/portal/icon-192.png?v=3',
    badge: '/brand_asset/portal/badge-96.png?v=3',
    data: { url: home(data.url || '/') },
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
  const url = (event.notification.data && event.notification.data.url) || home('/');
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
