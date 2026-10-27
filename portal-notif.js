// Centrul360 portal - notifications (the bell, top right). For everyone: new leads and other alerts
// sent by the automations ("Anunță echipa"). For the team also one short line for every decision
// about them (a request approved or rejected, whatever its kind: leave, overtime day, commission;
// overtime paid) and live bonus reminders (reached, or close, with the days left).
// They come with /api/portal-data (data.notifications); what was already seen is remembered on
// this device (stored ones by time, live bonus ones by id). A new lead also pops up at once while
// the portal is open, and every notification reaches the phone (Web Push, portal-sw.js) once they are on
// for that device: the nudge on top of the portal on phones, or Notificări → "Pornește pe acest dispozitiv".
// On phones the nudge also gets the app: Android downloads the Centrul360 app (android-app/, built by
// GitHub Actions); iPhone puts the portal on the Home Screen (Web Push on iPhone works only from there).
(function () {
  'use strict';
  const K = window.K;
  const { esc, icon } = K;
  const IC = { leave: 'calendar', time: 'clock', commission: 'percent', paid: 'wallet', bonus: 'trophy', lead: 'userPlus', alert: 'bell', booking: 'calendar', money: 'wallet', report: 'trend' };
  const ALERT_KINDS = ['lead', 'alert', 'booking', 'money', 'report'];
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
  const android = () => /Android/.test(navigator.userAgent);
  const APK = 'https://github.com/geotimo88898-lgtm/Centrul360-Website/releases/download/android/centrul360.apk';
  // inside the Android app (it opens the portal with its own referrer) or the Home Screen app
  const inApp = () => { try { if (sessionStorage.getItem('c360_app')) return true; } catch (e) { /* private mode */ } return standalone(); };
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
  async function pushOn(quiet) {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') throw new Error('denied');
    const { key: k } = await K.api('/api/portal-account', { action: 'push_key' });
    const reg = await swReady();
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(k) });
    await K.api('/api/portal-account', { action: 'push_on', sub: sub.toJSON(), device: deviceName() });
    if (!quiet) K.api('/api/portal-account', { action: 'push_test', device: deviceName() }).catch(() => {});
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
    } else if (st.perm === 'granted') {
      // on (or allowed and only the subscription missing: made now, without asking): one quiet line, with the way off
      if (!st.sub) { box.hidden = true; box.innerHTML = ''; pushOn(true).catch(() => {}); return; }
      box.hidden = false;
      box.innerHTML = '<p class="nt-push-on">' + icon('bell') + '<span>Notificările sunt pornite pe acest dispozitiv.</span><button type="button" class="k-btn is-ghost is-sm" data-push="off">Oprește</button></p>';
      box.querySelector('[data-push="off"]').addEventListener('click', (ev) => K.busy(ev.currentTarget, async () => {
        try {
          const endpoint = st.sub.endpoint;
          await st.sub.unsubscribe();
          await K.api('/api/portal-account', { action: 'push_off', endpoint });
          K.ui().toast('Notificările sunt oprite pe acest dispozitiv.', 'info');
        } catch (e) { K.ui().toast('Nu am putut opri notificările. Încearcă din nou.', 'error'); }
        paintPush(box);
      }));
      return;
    } else {
      h = '<p>' + icon('bell') + '<span>Leadurile noi, bonusurile și răspunsurile, pe ecran, chiar și cu portalul închis.</span></p><button type="button" class="k-btn is-primary is-sm" data-push="on">' + icon('bell') + 'Pornește pe acest dispozitiv</button>';
    }
    box.hidden = false;
    box.innerHTML = h;
    box.querySelectorAll('[data-push]').forEach((b) => b.addEventListener('click', () => K.busy(b, async () => {
      try {
        await pushOn();
        K.ui().toast('Gata. Notificările sunt pornite pe acest dispozitiv.', 'success');
      } catch (e) { K.ui().toast(e.message === 'denied' ? 'Ai refuzat notificările. Le poți porni din setările telefonului.' : 'Nu am putut porni notificările. Încearcă din nou.', 'error'); }
      paintPush(box); nudge();
    })));
  }

  // ------------------------------------------------------------------ phones: install the app, turn notifications on
  // A small card on top of every section until this phone gets the notifications; "×" hides it 3 days.
  const phone = () => (window.matchMedia && window.matchMedia('(max-width: 820px)').matches) || /Android|iPhone|iPad/.test(navigator.userAgent);
  const NUDGE_KEY = 'c360_push_nudge';
  const nudgeLater = () => { try { return Number(localStorage.getItem(NUDGE_KEY) || 0) > Date.now(); } catch (e) { return false; } };
  const NUDGE = {
    ios: ['Instalează aplicația', 'Ca să primești notificările pe iPhone.', 'Cum'],
    push: ['Notificări pe telefon', 'Leaduri noi, bonusuri, răspunsuri.', 'Pornește'],
    android: ['Aplicația Centrul360', 'Leaduri și mesaje pe telefon, ca orice aplicație.', 'Instalează'],
  };
  let nudging = false;
  async function nudge() {
    const main = document.querySelector('main');
    if (!main || !K.data || nudging) return;
    nudging = true;
    try {
      const st = await pushState();
      const on = st.supported && st.perm === 'granted';
      let what = '';
      if (phone() && !nudgeLater()) {
        if (iOS() && !standalone()) what = 'ios';
        else if (android() && !inApp()) what = 'android';
        else if (!on && st.supported && st.perm !== 'denied') what = 'push';
      }
      let el = document.querySelector('.nt-nudge');
      if (!what) { if (el) el.remove(); return; }
      if (el && el.dataset.what === what) return;
      if (!el) { el = document.createElement('div'); el.className = 'nt-nudge'; main.prepend(el); }
      el.dataset.what = what;
      const [t, sub, go] = NUDGE[what];
      el.innerHTML = '<span class="nt-nudge-ic">' + icon(what === 'push' ? 'bell' : 'download') + '</span><div class="nt-nudge-txt"><b>' + t + '</b><span>' + sub + '</span></div>' +
        '<button type="button" class="k-btn is-primary is-sm" data-nudge>' + go + '</button><button type="button" class="k-icon-btn" data-nudge-x aria-label="Mai târziu">' + icon('x') + '</button>';
      el.querySelector('[data-nudge-x]').addEventListener('click', () => { try { localStorage.setItem(NUDGE_KEY, String(Date.now() + 3 * 864e5)); } catch (e) { /* private mode */ } el.remove(); });
      const b = el.querySelector('[data-nudge]');
      b.addEventListener('click', () => K.busy(b, async () => {
        if (what === 'ios') return iosSteps();
        if (what === 'android') return androidSteps();
        try { await pushOn(); K.ui().toast('Gata. Notificările sunt pornite pe acest dispozitiv.', 'success'); } catch (e) { K.ui().toast(e.message === 'denied' ? 'Ai refuzat notificările. Le poți porni din setările telefonului.' : 'Nu am putut porni notificările. Încearcă din nou.', 'error'); }
        el.dataset.what = ''; nudging = false; nudge();
      }));
    } finally { nudging = false; }
  }
  // Android: the app is downloaded from the portal (not from Google Play), so the phone asks once to allow it
  function androidSteps() {
    const step = (n, ic, html) => '<li><span class="nt-step-n">' + n + '</span><span class="nt-step-ic">' + icon(ic) + '</span><span>' + html + '</span></li>';
    K.drawer({
      title: 'Aplicația pe Android', icon: 'download', width: 440,
      body: '<a class="k-btn is-primary nt-apk" href="' + APK + '">' + icon('download') + 'Descarcă aplicația Centrul360</a>' +
        '<ol class="nt-steps">' +
        step(1, 'download', 'Apasă <b>Descarcă</b>, apoi deschide fișierul <b>centrul360.apk</b> din notificări sau din Descărcări.') +
        step(2, 'shield', 'Telefonul întreabă dacă permiți instalarea: apasă <b>Setări</b> → <b>Permite din această sursă</b>, apoi <b>Instalează</b>.') +
        step(3, 'bell', 'Deschide <b>Centrul360</b> de pe ecran, intră în cont și apasă <b>Pornește</b> la notificări.') +
        '</ol>',
    });
  }
  // iPhone: Web Push works only for the portal added to the Home Screen (iOS 16.4+)
  function iosSteps() {
    const step = (n, ic, html) => '<li><span class="nt-step-n">' + n + '</span><span class="nt-step-ic">' + icon(ic) + '</span><span>' + html + '</span></li>';
    K.drawer({
      title: 'Aplicația pe iPhone', icon: 'download', width: 440,
      body: '<ol class="nt-steps">' +
        step(1, 'share', 'În Safari, apasă <b>Distribuie</b> (pătratul cu săgeata în sus), jos pe ecran.') +
        step(2, 'plus', 'Alege <b>Adaugă pe ecranul principal</b>, apoi <b>Adaugă</b>.') +
        step(3, 'bell', 'Deschide <b>Centrul360</b> de pe ecran, intră în cont și apasă <b>Pornește</b> la notificări.') +
        '</ol>',
    });
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
      subtitle: admin ? 'Leaduri, programări, încasări și raportul zilei.' : 'Leaduri noi, bonusuri și răspunsurile la cererile tale, pe scurt.',
      body: '<div class="nt-push" data-push-box><span class="k-skel" style="height:40px"></span></div>' +
        (list.length ? (alerts.length ? '<h4 class="nt-h">' + icon('userPlus') + (admin ? 'Leaduri, programări, încasări' : 'Leaduri și alerte') + '</h4><div class="nt-list">' + alerts.map(row).join('') + '</div>' : '') +
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
    K.emit('notif:fresh', fresh); // the owners' layer cheers for money, a booking, a lead (portal-delight.js)
    fresh.slice(-3).forEach((n) => K.ui().toast(n.title + (n.text ? ' · ' + n.text : ''), n.tone === 'bad' ? 'error' : n.tone === 'good' ? 'success' : 'info'));
    // portal open in a background tab, no phone notifications on this device: the browser shows it
    if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
      const st = await pushState();
      if (st.supported && !st.sub) {
        try { const reg = await swReady(); fresh.slice(-3).forEach((n) => reg.showNotification(n.title, { body: n.text || '', icon: '/brand_asset/portal/icon-192.png?v=3', tag: 'c360-' + n.id, data: { url: '/#' + (n.go || 'pipeline') } })); } catch (e) { /* no worker */ }
      }
    }
  }

  // a tap on a phone notification while the portal is open: go to its section
  if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', (e) => {
    const d = e.data || {};
    const sec = d.type === 'c360:go' ? String(d.url || '').split('#')[1] : '';
    if (sec) K.go(sec);
  });

  K.on('data', () => { mountBell(); paintBadge(); popNew(); nudge(); });
  K.openNotifications = open;
})();
