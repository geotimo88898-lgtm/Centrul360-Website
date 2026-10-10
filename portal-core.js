// Centrul360 portal — core: loads /api/portal-data, routes between sections (with #hash deep links),
// keeps the live nav badges, and owns the avatar menu (accent theme, menu rail, logout).
// Every section's UI lives in its own module (portal-dashboard.js, portal-calendar.js, …) and
// registers itself with K.section(); this file only wires them together.
(function () {
  'use strict';
  const K = window.K;
  const { icon, esc } = K;

  // Treatment categories (same keys as api/portal-sale.js VALID_CATEGORIES).
  K.cats = {
    'epilare-laser': 'Epilare laser', 'hifu': 'HIFU full face', 'liposonix': 'Liposonix', 'ems-tonifiere': 'EMS tonifiere',
    'radiofrecventa': 'Radiofrecvență (RF Sculpt)', 'microneedling': 'Microneedling', 'tratament-facial': 'Tratament facial',
    'celulita': 'Celulită', 'detox-drenaj': 'Detox / drenaj', 'retail': 'Produs retail / home-care', 'altele': 'Altele',
  };
  K.roleLabel = (r) => ({ cosmetician: 'Cosmeticiană', receptie: 'Recepție', admin: 'Admin' }[r] || r);

  // Old links / bookmarks keep working.
  const ALIASES = { incasare: ['incasari', 'incasari:new'], fise: ['resurse', 'resurse:fise'], calendar: ['programari'], echipa: ['angajati'], sarcini: ['automatizari'] };

  let DATA = null, first = true;
  const app = document.getElementById('app');

  async function load(quiet) {
    try {
      DATA = await K.api('/api/portal-data');
    } catch (e) {
      if (e.code === 'auth') return;
      if (!quiet) document.getElementById('loadingScreen').textContent = 'Eroare la încărcarea portalului. Reîncarcă pagina.';
      return;
    }
    window.C360_CTX = { isAdmin: !!DATA.isAdmin, me: DATA.me, categories: K.cats };
    document.getElementById('whoName').textContent = DATA.me.name;
    // Owner: just "Admin". Staff: their role + location under the name.
    const whoLoc = document.getElementById('whoLocation');
    whoLoc.textContent = DATA.isAdmin ? '' : K.roleLabel(DATA.me.role) + (DATA.me.location && DATA.me.location !== '—' ? ' · ' + DATA.me.location : '');
    whoLoc.hidden = !whoLoc.textContent;
    document.querySelectorAll('.admin-only').forEach((el) => el.classList.toggle('hidden', !DATA.isAdmin));
    // Role-shaped navigation: reception works the pipeline + tasks, cosmeticians see their own
    // clients and commission, the owner sees everything except a personal commission screen.
    const role = DATA.isAdmin ? 'admin' : DATA.me.role;
    document.documentElement.setAttribute('data-role', role);
    const sub = document.querySelector('.brand .brand-sub');
    if (sub) sub.textContent = DATA.isAdmin ? 'Admin' : 'Echipă';
    document.querySelectorAll('[data-roles]').forEach((el) => el.classList.toggle('hidden', !el.dataset.roles.split(',').includes(role)));
    K.setData(DATA);
    badges();
    if (first) {
      first = false;
      document.getElementById('loadingScreen').classList.add('hidden');
      app.classList.remove('hidden');
      route(location.hash.slice(1) || 'panou', true);
    }
  }
  const frontDesk = () => !!DATA && (DATA.isAdmin || DATA.me.role === 'receptie');
  K.frontDesk = frontDesk;
  K.on('reload', () => load(true));
  K.reload = () => load(true);

  // ------------------------------------------------------------------ navigation
  function allowed(tab) {
    const b = document.querySelector('#tabsNav button[data-tab="' + tab + '"]');
    return !!(b && !b.classList.contains('hidden'));
  }
  // Creative is one panel with several pages (its own app, shown inside); `creativeRoute` is the page.
  let creativeRoute = '/';
  const creativeHash = (r) => 'creative' + (r && r !== '/' ? r : '');
  function markNav(tab) {
    document.querySelectorAll('#tabsNav button[data-tab]').forEach((b) => b.classList.toggle('active',
      b.dataset.tab === tab && (!b.dataset.route || b.dataset.route === creativeRoute)));
  }
  function activate(tab, sub) {
    if (!allowed(tab)) tab = 'panou';
    if (tab === 'creative') creativeRoute = /^\/[a-z-]*$/.test(sub || '') ? sub : (sub === undefined ? creativeRoute : '/');
    markNav(tab);
    document.querySelectorAll('main > .panel').forEach((p) => p.classList.toggle('active', p.id === 'panel-' + tab));
    const main = document.querySelector('main');
    main.classList.toggle('wide', tab === 'creative');
    main.classList.toggle('pl-full', tab === 'pipeline');
    main.classList.toggle('k-wide', tab !== 'creative' && tab !== 'pipeline');
    const hash = tab === 'creative' ? creativeHash(creativeRoute) : tab;
    if (location.hash.slice(1) !== hash) history.replaceState(null, '', location.pathname + location.search + '#' + hash);
    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
    if (tab === 'pipeline' && window.C360Pipeline) window.C360Pipeline.open();
    else if (tab === 'creative') loadCreative();
    else K.show(tab);
  }
  function route(hash, initial) {
    const [name, arg] = String(hash || '').split('/');
    if (name === 'creative') { activate('creative', '/' + (arg || '')); return; }
    const alias = ALIASES[name];
    activate(alias ? alias[0] : name);
    if (alias && alias[1]) setTimeout(() => K.emit(alias[1], arg || null), initial ? 400 : 200);
  }
  document.getElementById('tabsNav').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-tab]');
    if (b) activate(b.dataset.tab, b.dataset.route);
  });
  window.addEventListener('hashchange', () => {
    const h = location.hash.slice(1);
    const here = document.querySelector('#panel-creative.active') ? creativeHash(creativeRoute) : (document.querySelector('main > .panel.active') || {}).id;
    if (h && h !== here && 'panel-' + h !== here) route(h);
  });

  // Section shortcuts from anywhere: Alt+1..9 follow the visible nav order.
  document.addEventListener('keydown', (e) => {
    if (!e.altKey || e.ctrlKey || e.metaKey || !/^[1-9]$/.test(e.key)) return;
    const visible = Array.from(document.querySelectorAll('#tabsNav button[data-tab]')).filter((b) => !b.classList.contains('hidden'));
    const b = visible[Number(e.key) - 1];
    if (b) { e.preventDefault(); activate(b.dataset.tab, b.dataset.route); }
  });

  // ------------------------------------------------------------------ nav badges
  async function badges() {
    if (!DATA) return;
    if (DATA.isAdmin && DATA.admin) K.badge('aprobari', DATA.admin.pendingSales.length, 'hot');
    if (!frontDesk()) return; // cosmeticians: no pipeline / task queue
    try {
      const t = await K.api('/api/portal-automation-tasks');
      K.badge('automatizari', (t.tasks || []).length);
      K.emit('tasks', t.tasks || []);
    } catch (e) { /* badge only */ }
    try {
      const j = await K.leads();
      leadBadge(j);
    } catch (e) { /* badge only */ }
  }
  function leadBadge(j) {
    const n = (j.leads || []).filter((l) => (l.kind === 'open' || l.kind === 'booked') && (l.followUpState === 'overdue' || l.neverContacted)).length;
    K.badge('pipeline', n, 'hot');
  }
  K.on('leads', leadBadge);
  K.on('tasks:changed', badges);
  // Keep badges fresh in the background (cheap: two small requests every 2 minutes).
  setInterval(() => { if (!document.hidden && DATA && frontDesk()) { K.leads(true).catch(() => {}); K.api('/api/portal-automation-tasks').then((t) => { K.badge('automatizari', (t.tasks || []).length); K.emit('tasks', t.tasks || []); }).catch(() => {}); } }, 120000);

  // ------------------------------------------------------------------ creative (admin)
  // First open: single sign-on straight onto the chosen page; the frame stays hidden behind a
  // skeleton until it has painted. After that the portal menu just tells the app which page to show.
  let creativeReady = false;
  let creativePending = null; // message to deliver once the app has loaded
  const creativePost = (m) => {
    const frame = document.getElementById('creativeFrame');
    if (creativeReady && frame.contentWindow) frame.contentWindow.postMessage(m, location.origin);
    else creativePending = m;
  };
  async function loadCreative() {
    const frame = document.getElementById('creativeFrame');
    const msg = document.getElementById('creativeMsg');
    if (frame.dataset.started) { if (creativeReady) creativePost({ type: 'c360:navigate', route: creativeRoute }); return; }
    frame.dataset.started = '1';
    msg.classList.remove('hidden', 'is-error');
    msg.innerHTML = '<div class="cr-skel"><i></i><i></i><div>' + '<b></b>'.repeat(6) + '</div></div>';
    try {
      const d = await K.api('/api/portal-creative-sso?next=' + encodeURIComponent(creativeRoute));
      frame.addEventListener('load', () => {
        creativeReady = true;
        frame.classList.remove('hidden');
        msg.classList.add('hidden');
        if (creativePending) { const m = creativePending; creativePending = null; creativePost(m); }
      }, { once: true });
      frame.src = d.url;
    } catch (err) {
      delete frame.dataset.started;
      msg.classList.add('is-error');
      msg.textContent = 'Nu am putut deschide Creative. Reîncearcă.';
    }
  }
  // The app reports in-app navigation so the menu highlight and the URL follow it.
  window.addEventListener('message', (e) => {
    if (e.origin !== location.origin || !e.data || e.data.type !== 'c360:route' || typeof e.data.route !== 'string') return;
    if (!/^\/[a-z-]*$/.test(e.data.route)) return;
    creativeRoute = e.data.route;
    if (!document.querySelector('#panel-creative.active')) return;
    markNav('creative');
    const hash = creativeHash(creativeRoute);
    if (location.hash.slice(1) !== hash) history.replaceState(null, '', location.pathname + location.search + '#' + hash);
  });
  // Command palette → "Comandă creative noi": open the order form inside Creative.
  window.addEventListener('c360:creative-new', () => creativePost({ type: 'c360:new-request' }));

  // ------------------------------------------------------------------ avatar menu
  const ACCENTS = [
    ['violet', 'Violet', '#6a4dff', '#8b5cf6'], ['ocean', 'Ocean', '#2563eb', '#3b82f6'], ['emerald', 'Smarald', '#059669', '#10b981'],
    ['sunset', 'Apus', '#ea580c', '#f97316'], ['mono', 'Monocrom', '#18181b', '#71717a'],
  ];
  let menu = null;
  function openMenu(anchor) {
    if (menu) { closeMenu(); return; }
    const cur = document.documentElement.getAttribute('data-accent') || 'violet';
    menu = document.createElement('div');
    menu.className = 'k-menu';
    menu.innerHTML =
      '<div class="k-menu-head">' + K.avatar(DATA ? DATA.me.name : '?', 38) + '<div><b>' + esc(DATA ? DATA.me.name : '') + '</b><small>' + esc(document.getElementById('whoLocation').textContent || 'Administrator · acces complet') + '</small></div></div>' +
      '<div class="k-menu-label">Culoare accent</div><div class="k-swatches">' +
      ACCENTS.map(([k, label, a, b]) => '<button type="button" title="' + label + '" data-accent="' + k + '" class="' + (k === cur ? 'is-on' : '') + '" style="--a:' + a + ';--b:' + b + '"></button>').join('') + '</div>' +
      '<button type="button" class="k-menu-item" data-act="rail">' + icon('layers') + 'Strânge / extinde meniul<kbd>Ctrl B</kbd></button>' +
      '<button type="button" class="k-menu-item" data-act="search">' + icon('search') + 'Caută orice<kbd>Ctrl K</kbd></button>' +
      '<button type="button" class="k-menu-item" data-act="logout">' + icon('power') + 'Deconectare</button>';
    document.body.appendChild(menu);
    const r = anchor.getBoundingClientRect();
    menu.style.top = (r.bottom + 8) + 'px';
    menu.style.right = Math.max(8, window.innerWidth - r.right) + 'px';
    requestAnimationFrame(() => menu.classList.add('is-open'));
    menu.addEventListener('click', (e) => {
      const sw = e.target.closest('[data-accent]');
      if (sw) {
        const k = sw.dataset.accent;
        if (k === 'violet') document.documentElement.removeAttribute('data-accent'); else document.documentElement.setAttribute('data-accent', k);
        try { localStorage.setItem('c360_accent', k); } catch (err) { /* private mode */ }
        menu.querySelectorAll('[data-accent]').forEach((x) => x.classList.toggle('is-on', x === sw));
        return;
      }
      const act = e.target.closest('[data-act]');
      if (!act) return;
      closeMenu();
      if (act.dataset.act === 'rail') document.querySelector('.c360-rail-toggle') && document.querySelector('.c360-rail-toggle').click();
      if (act.dataset.act === 'search') document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true }));
      if (act.dataset.act === 'logout') logout();
    });
  }
  function closeMenu() { if (!menu) return; const m = menu; menu = null; m.classList.remove('is-open'); setTimeout(() => m.remove(), 200); }
  document.addEventListener('click', (e) => {
    const av = e.target.closest('.c360-avatar');
    if (av) { e.stopPropagation(); openMenu(av); return; }
    if (menu && !e.target.closest('.k-menu')) closeMenu();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && menu) closeMenu(); });

  async function logout() {
    try { await fetch('/api/portal-logout', { method: 'POST' }); } catch (e) { /* leaving anyway */ }
    location.href = '/portal-login';
  }
  document.getElementById('logoutBtn').addEventListener('click', logout);

  load(false);
})();
