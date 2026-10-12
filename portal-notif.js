// Centrul360 portal - notifications (the bell, top right). For everyone: new leads and other alerts
// sent by the automations ("Anunță echipa"). For the team also one short line for every decision
// about them (a request approved or rejected, whatever its kind: leave, overtime day, commission;
// overtime paid) and live bonus reminders (reached, or close, with the days left).
// They come with /api/portal-data (data.notifications); what was already seen is remembered on
// this device (stored ones by time, live bonus ones by id). A new lead also pops up at once while
// the portal is open, and reaches the phone (Web Push, portal-sw.js) once notifications are on
// for that device: Notificări → "Pornește pe acest dispozitiv".
(function () {
  'use strict';
  const K = window.K;
  const { esc, icon } = K;
  const IC = { leave: 'calendar', time: 'clock', commission: 'percent', paid: 'wallet', bonus: 'trophy', lead: 'userPlus', alert: 'bell' };
  const ALERT_KINDS = ['lead', 'alert'];
  let btn = null;

  const me = () => (K.data && K.data.me && K.data.me.id) || '';
  const key = () => 'c360_notif_' + me();
  function seen() { try { return Object.assign({ at: '', ids: [] }, JSON.parse(localStorage.getItem(key()) || '{}')); } catch (e) { return { at: '', ids: [] }; } }
  function markAll(list) {
    const s = { at: new Date().toISOString(), ids: list.filter((n) => n.live).map((n) => n.id).slice(0, 100) };
    try { localStorage.setItem(key(), JSON.stringify(s)); } catch (e) { /* private mode */ }
  }
  const items = () => (K.data && K.data.notifications) || [];
  const isNew = (n, s) => (n.live ? !s.ids.includes(n.id) : String(n.at) > s.at);
  const unread = () => { const s = seen(); return items().filter((n) => isNew(n, s)).length; };

  function mountBell() {
    if (btn || !K.data) return;
    const right = document.querySelector('header.topbar > div:last-child');
    if (!right) return;
    btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'c360-bell';
    btn.setAttribute('aria-label', 'Notificări');
    btn.innerHTML = icon('bell') + '<span class="c360-bell-n" hidden></span>';
    const search = right.querySelector('.c360-search-btn');
    right.insertBefore(btn, search ? search.nextSibling : right.firstChild);
    btn.addEventListener('click', open);
  }
  function paintBadge() {
    if (!btn) return;
    const n = unread(), b = btn.querySelector('.c360-bell-n');
    b.hidden = !n; b.textContent = n > 9 ? '9+' : String(n);
    btn.classList.toggle('has-new', !!n);
    btn.setAttribute('aria-label', n ? 'Notificări, ' + n + ' noi' : 'Notificări');
  }

  // ------------------------------------------------------------------ phone notifications (Web Push)
  const iOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent);
  const standalone = () => window.navigator.standalone === true || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
  function swReady() {
    return Promise.race([navigator.serviceWorker.ready, new Promise((_, no) => setTimeout(() => no(new Error('sw')), 4000))]);
  }
  async function pushState() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return { supported: false };
    try {
      const reg = await swReady();
      const sub = await reg.pushManager.getSubscription();
      return { supported: true, perm: Notification.permission, sub };
    } catch (e) { return { supported: false }; }
  }
  function keyBytes(b64) {
    const pad = '='.repeat((4 - (b64.length % 4)) % 4);
    const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(raw, (c) => c.charCodeAt(0));
  }
  function deviceName() {
    const ua = navigator.userAgent;
    const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : 'Dispozitiv';
    const br = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : '';
    return os + (br ? ' · ' + br : '');
  }
  async function pushOn() {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') throw new Error('denied');
    const { key: k } = await K.api('/api/portal-account', { action: 'push_key' });
    const reg = await swReady();
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(k) });
    await K.api('/api/portal-account', { action: 'push_on', sub: sub.toJSON(), device: deviceName() });
  }
  async function pushOff(sub) {
    try { await K.api('/api/portal-account', { action: 'push_off', endpoint: sub.endpoint }); } catch (e) { /* the device stops anyway */ }
    await sub.unsubscribe();
  }
  async function paintPush(box) {
    const st = await pushState();
    let h;
    if (!st.supported) {
      h = iOS() && !standalone()
        ? '<p>' + icon('info') + '<span>Pe iPhone: în Safari apasă <b>Distribuie → Adaugă pe ecranul principal</b>, deschide portalul de acolo și pornește notificările aici.</span></p>'
        : '<p>' + icon('info') + '<span>Browserul acesta nu primește notificări. Pe telefon, folosește Chrome (Android) sau portalul adăugat pe ecranul principal (iPhone).</span></p>';
    } else if (st.perm === 'denied') {
      h = '<p>' + icon('alert') + '<span>Notificările sunt blocate pentru portal. Le pornești din setările browserului (iconița de lângă adresă → Notificări → Permite), apoi revii aici.</span></p>';
    } else if (st.sub && st.perm === 'granted') {
      h = '<p class="is-on">' + icon('checkCircle') + '<span><b>Pornite pe acest dispozitiv.</b> Leadurile noi apar pe ecran chiar dacă portalul e închis.</span></p><button type="button" class="k-btn is-sm" data-push="off">Oprește aici</button>';
    } else {
      h = '<p>' + icon('bell') + '<span>Primește leadurile noi pe ecran, chiar și cu portalul închis.</span></p><button type="button" class="k-btn is-primary is-sm" data-push="on">' + icon('bell') + 'Pornește pe acest dispozitiv</button>';
    }
    box.innerHTML = h;
    const b = box.querySelector('[data-push]');
    if (b) b.addEventListener('click', () => K.busy(b, async () => {
      try {
        if (b.dataset.push === 'on') { await pushOn(); K.ui().toast('Gata. Notificările vin și pe acest dispozitiv.', 'success'); }
        else { await pushOff(st.sub); K.ui().toast('Notificările s-au oprit pe acest dispozitiv.', 'success'); }
      } catch (e) { K.ui().toast(e.message === 'denied' ? 'Ai refuzat notificările. Le poți porni din setările browserului.' : 'Nu am putut porni notificările. Încearcă din nou.', 'error'); }
      paintPush(box);
    }));
  }

  function open() {
    const list = items(), s = seen();
    const row = (n) => '<button type="button" class="nt-item is-' + esc(n.tone || 'info') + (isNew(n, s) ? ' is-new' : '') + '"' + (n.go ? ' data-go-to="' + esc(n.go) + '"' : '') + '>' +
      '<span class="nt-ic">' + icon(IC[n.kind] || 'bell') + '</span>' +
      '<span class="nt-body"><b>' + esc(n.title) + '</b>' + (n.text ? '<span>' + esc(n.text) + '</span>' : '') + '<small>' + (n.live ? 'luna aceasta' : esc(K.ago(n.at))) + '</small></span></button>';
    const alerts = list.filter((n) => ALERT_KINDS.includes(n.kind)), live = list.filter((n) => n.live), past = list.filter((n) => !n.live && !ALERT_KINDS.includes(n.kind));
    const admin = K.data && K.data.isAdmin;
    const d = K.drawer({
      title: 'Notificări', icon: 'bell', width: 460,
      subtitle: admin ? 'Leadurile noi și alertele din automatizări.' : 'Leaduri noi, bonusuri și răspunsurile la cererile tale, pe scurt.',
      body: '<div class="nt-push" data-push-box><span class="k-skel" style="height:40px"></span></div>' +
        (list.length ? (alerts.length ? '<h4 class="nt-h">' + icon('userPlus') + 'Leaduri și alerte</h4><div class="nt-list">' + alerts.map(row).join('') + '</div>' : '') +
          (live.length ? '<h4 class="nt-h">' + icon('trophy') + 'Bonusuri</h4><div class="nt-list">' + live.map(row).join('') + '</div>' : '') +
          (past.length ? '<h4 class="nt-h">' + icon('bell') + 'Răspunsuri la cereri</h4><div class="nt-list">' + past.map(row).join('') + '</div>' : '')
        : K.empty('bell', 'Nicio notificare', admin ? 'Aici apar leadurile noi, imediat ce intră.' : 'Aici apar leadurile noi și răspunsurile la cererile tale.')),
      onMount(el) {
        paintPush(el.querySelector('[data-push-box]'));
        el.querySelector('.k-dbody').addEventListener('click', (e) => {
          const go = e.target.closest('[data-go-to]');
          if (go) { d.close(); K.go(go.dataset.goTo); }
        });
      },
    });
    markAll(list);
    paintBadge();
  }

  // ------------------------------------------------------------------ a new lead pops up at once
  // (only what arrived after this page was opened; the phone gets it through Web Push)
  let since = null;
  async function popNew() {
    const list = items().filter((n) => ALERT_KINDS.includes(n.kind) && !n.live);
    const newest = list.reduce((m, n) => (String(n.at) > m ? String(n.at) : m), '');
    if (since === null) { since = newest || new Date().toISOString(); return; }
    const fresh = list.filter((n) => String(n.at) > since).sort((a, b) => (a.at < b.at ? -1 : 1));
    if (!fresh.length) return;
    since = newest;
    fresh.slice(-3).forEach((n) => K.ui().toast(n.title + (n.text ? ' · ' + n.text : ''), 'success'));
    // portal open in a background tab, no phone notifications on this device: the browser shows it
    if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
      const st = await pushState();
      if (st.supported && !st.sub) {
        try { const reg = await swReady(); fresh.slice(-3).forEach((n) => reg.showNotification(n.title, { body: n.text || '', icon: '/brand_asset/portal/icon-192.png', tag: 'c360-' + n.id, data: { url: '/portal#' + (n.go || 'pipeline') } })); } catch (e) { /* no worker */ }
      }
    }
  }

  // a tap on a phone notification while the portal is open: go to its section
  if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', (e) => {
    const d = e.data || {};
    const sec = d.type === 'c360:go' ? String(d.url || '').split('#')[1] : '';
    if (sec) K.go(sec);
  });

  K.on('data', () => { mountBell(); paintBadge(); popNew(); });
  K.openNotifications = open;
})();
