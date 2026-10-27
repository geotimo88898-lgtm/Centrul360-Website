// Centrul360 portal, core: loads /api/portal-data, routes between sections (with #hash deep links),
// keeps the live nav badges, and owns the avatar menu (accent theme, menu rail, logout).
// Every section's UI lives in its own module (portal-dashboard.js, portal-calendar.js, …) and
// registers itself with K.section(); this file only wires them together.
(function () {
  'use strict';
  const K = window.K;
  const { icon, esc } = K;

  // Treatment categories: the clinic works with three (api/_lib/cats.js). An appointment or a
  // payment can have several. Older rows with finer keys map onto the three for display.
  K.cats = { 'epilare-laser': 'Epilare laser', 'faciale': 'Tratamente faciale', 'corporale': 'Tratamente corporale' };
  const LEGACY_CATS = {
    hifu: 'faciale', microneedling: 'faciale', 'tratament-facial': 'faciale', liposonix: 'corporale', 'ems-tonifiere': 'corporale',
    radiofrecventa: 'corporale', celulita: 'corporale', 'detox-drenaj': 'corporale', retail: 'corporale', altele: 'corporale',
  };
  K.catKey = (k) => (K.cats[k] ? k : LEGACY_CATS[k] || '');
  K.catsOf = (row) => {
    const list = row && row.categories && row.categories.length ? row.categories : row && row.category ? [row.category] : [];
    const out = [];
    list.forEach((k) => { const n = K.catKey(k); if (n && !out.includes(n)) out.push(n); });
    return out;
  };
  K.catLabel = (row) => K.catsOf(row).map((k) => K.cats[k]).join(' + ');
  // Multi-select category chips (tap to toggle) bound to a hidden input with comma-separated keys.
  K.catPicker = (selected) => {
    const sel = (selected || []).filter((k) => K.cats[k]);
    return '<div class="k-catpick" data-catpick>' + Object.keys(K.cats).map((k) =>
      '<button type="button" data-cat="' + k + '" class="' + (sel.includes(k) ? 'is-on' : '') + '" aria-pressed="' + sel.includes(k) + '"><i>' + K.icon('check') + '</i>' + K.esc(K.cats[k]) + '</button>').join('') +
      '<input type="hidden" name="categories" value="' + sel.join(',') + '"></div>';
  };
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-catpick] [data-cat]');
    if (!b) return;
    const box = b.closest('[data-catpick]');
    b.classList.toggle('is-on');
    b.setAttribute('aria-pressed', b.classList.contains('is-on'));
    const input = box.querySelector('input[name=categories]');
    input.value = Array.from(box.querySelectorAll('[data-cat].is-on')).map((x) => x.dataset.cat).join(',');
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  K.roleLabel = (r) => ({ cosmetician: 'Cosmeticiană', receptie: 'Recepție', admin: 'Admin' }[r] || r);
  // Commission on an upsell: value - 60% costs, then 10% of the profit (same as api/_lib/cats.js).
  const costShare = () => (K.data && K.data.costShare != null ? K.data.costShare : 60);
  const upRate = () => (K.data && K.data.upsellRate) || 10;
  K.profitOf = (v) => Math.round((Number(v) || 0) * (100 - costShare())) / 100;
  K.commissionOf = (v) => Math.round((Number(v) || 0) * (100 - costShare()) / 100 * upRate()) / 100;
  K.commissionRule = () => ({ cost: costShare(), rate: upRate() });

  // Old links / bookmarks keep working.
  const ALIASES = { incasare: ['incasari', 'incasari:new'], fise: ['traininguri', 'academy:print'], resurse: ['traininguri'], setari: ['integrari'], formulare: ['integrari', 'integrari:forms'], calendar: ['programari'], echipa: ['angajati'], sarcini: ['automatizari'], contacts: ['contacte'] };

  let DATA = null, first = true;
  let rev = null, pendingRemote = false; // live-sync revision (see "live sync" below)
  const app = document.getElementById('app');

  async function load(quiet) {
    // Baseline revision first, so a save that lands while this loads still triggers a refresh.
    if (rev === null) { try { const p = await K.api('/api/portal-pulse'); rev = p.rev; seeBuild(p.build); } catch (e) { /* first pulse sets it */ } }
    try {
      DATA = await K.api('/api/portal-data');
    } catch (e) {
      if (e.code === 'auth') return;
      if (!quiet) {
        const ls = document.getElementById('loadingScreen');
        ls.classList.add('is-error');
        ls.innerHTML = '<div class="c360-load-err"><b>Nu am putut încărca portalul.</b><button type="button" class="k-btn is-primary" id="retryLoad">Încearcă din nou</button></div>';
        document.getElementById('retryLoad').addEventListener('click', () => { ls.classList.remove('is-error'); ls.textContent = 'Se încarcă portalul...'; load(false); });
      }
      return;
    }
    if (routeHost()) return;
    previewBar();
    window.C360_CTX = { isAdmin: !!DATA.isAdmin, me: DATA.me, categories: K.cats };
    document.getElementById('whoName').textContent = DATA.me.name;
    // profile photo (Contul meu) on the round avatar, top right
    const av = document.querySelector('.c360-avatar');
    if (av) { av.classList.toggle('has-photo', !!DATA.me.photo); av.style.backgroundImage = DATA.me.photo ? 'url("' + DATA.me.photo + '")' : ''; }
    // Owner: just "Admin". Staff: their role + location under the name.
    const whoLoc = document.getElementById('whoLocation');
    whoLoc.textContent = DATA.isAdmin ? '' : K.roleLabel(DATA.me.role) + (DATA.me.location && DATA.me.location !== '-' ? ' · ' + DATA.me.location : '');
    whoLoc.hidden = !whoLoc.textContent;
    document.querySelectorAll('.admin-only').forEach((el) => el.classList.toggle('hidden', !DATA.isAdmin));
    // Role-shaped navigation: reception works the pipeline + tasks, cosmeticians see their own
    // clients and commission, the owner sees everything except a personal commission screen.
    const role = DATA.isAdmin ? 'admin' : DATA.me.role;
    document.documentElement.setAttribute('data-role', role);
    document.documentElement.classList.toggle('c360-admin', !!DATA.isAdmin); // the owners' layer (portal-delight.css / .js)
    const sub = document.querySelector('.brand .brand-sub');
    if (sub) sub.textContent = DATA.isAdmin ? 'Admin' : 'Echipă';
    document.querySelectorAll('[data-roles]').forEach((el) => el.classList.toggle('hidden', !el.dataset.roles.split(',').includes(role)));
    K.setData(DATA);
    badges();
    if (DATA.live) connectLive(DATA.live);
    if (first) {
      first = false;
      document.getElementById('loadingScreen').classList.add('hidden');
      app.classList.remove('hidden');
      if (K.applyPrefs) K.applyPrefs(DATA.me.prefs);
      route(location.hash.slice(1) || (DATA.me.prefs && DATA.me.prefs.startPage) || 'panou', true);
    }
  }
  // ------------------------------------------------------------------ domains
  // The owner works on admin.centrul360.com, the team on staff.centrul360.com (same app, one
  // shared sign-in). Whoever lands on the other one is moved over, keeping the page they asked for.
  // Not inside the phone app (Android app or iPhone Home Screen): it lives on admin.centrul360.com, and
  // another domain would open as a web page (with the address bar) instead of the app.
  const inPhoneApp = () => {
    try { if (sessionStorage.getItem('c360_app')) return true; } catch (e) { /* private mode */ }
    return window.navigator.standalone === true || !!(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
  };
  function routeHost() {
    if (DATA.impersonating || inPhoneApp()) return false;
    const h = location.hostname;
    const to = h === 'admin.centrul360.com' && !DATA.isAdmin ? 'staff' : h === 'staff.centrul360.com' && DATA.isAdmin ? 'admin' : '';
    if (!to) return false;
    location.replace('https://' + to + '.centrul360.com/' + location.hash);
    return true;
  }

  // ------------------------------------------------------------------ account preview
  // Admin → Echipa → "Intră în cont": the portal exactly as that person sees it, read-only.
  function previewBar() {
    let bar = document.getElementById('previewBar');
    document.documentElement.classList.toggle('is-previewing', !!DATA.impersonating);
    if (!DATA.impersonating) { if (bar) bar.remove(); return; }
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'previewBar';
      bar.className = 'k-preview-bar';
      document.querySelector('header.topbar').after(bar);
    }
    bar.innerHTML = icon('eye') + '<span>Vezi portalul ca <b>' + esc(DATA.me.name) + '</b> · ' + esc(K.roleLabel(DATA.me.role)) +
      '<em> - exact ce vede, doar pentru privit</em></span><button type="button" class="k-btn is-sm" data-stop>' + icon('undo') + 'Înapoi la Admin</button>';
    bar.querySelector('[data-stop]').addEventListener('click', async (e) => {
      e.currentTarget.disabled = true;
      try { await K.api('/api/portal-impersonate', {}, { method: 'DELETE' }); } catch (err) { /* back to login at worst */ }
      history.replaceState(null, '', '/#angajati');
      location.reload();
    });
  }
  K.previewAs = async (id) => {
    try { await K.api('/api/portal-impersonate', { employeeId: id }); history.replaceState(null, '', '/#panou'); location.reload(); }
    catch (err) { K.ui().toast(K.errText(err, 'Nu am putut deschide contul.'), 'error'); }
  };

  // ------------------------------------------------------------------ live sync
  // Every save anywhere bumps a revision on the server; each open portal checks it every few
  // seconds and refreshes what's on screen when it moves, never while someone is mid-edit.
  // (the drawer's panel stays in the page once opened, so only an open one counts)
  const busyEditing = () => (K.typing(document.activeElement) && !document.activeElement.closest('.mx-compose')) || !!document.querySelector('.k-drawer-root.is-open .k-drawer, .c360-dialog-root, .pl-stage-root, .k-menu');
  // A live refresh never moves the page: while the sections repaint (a list can be empty for a moment)
  // the page keeps its height and the scroll stays where it was. Scrolling by hand takes over.
  let lastInput = 0, hold = null;
  ['wheel', 'touchstart', 'touchmove', 'keydown', 'pointerdown'].forEach((ev) => addEventListener(ev, () => { lastInput = Date.now(); }, { passive: true, capture: true }));
  function holdScroll() {
    const main = document.querySelector('main');
    if (!main || window.scrollY < 2) return;
    if (hold) { clearTimeout(hold.t); removeEventListener('scroll', hold.keep); }
    const y = window.scrollY, from = Date.now();
    const mine = () => lastInput > from - 600; // the person is scrolling (or just was)
    main.style.minHeight = main.offsetHeight + 'px';
    const keep = () => {
      if (mine() || Math.abs(window.scrollY - y) <= 1) return;
      const de = document.documentElement;
      de.style.scrollBehavior = 'auto'; // a jump back, not a smooth glide
      window.scrollTo(0, y);
      de.style.scrollBehavior = '';
    };
    addEventListener('scroll', keep, { passive: true });
    hold = { keep, t: setTimeout(() => { removeEventListener('scroll', keep); keep(); main.style.minHeight = ''; hold = null; }, 2500) };
  }
  // ------------------------------------------------------------------ pull to refresh (phones)
  // At the top of a page: pull down past the header and let go once the circle turns accent. Everything on
  // screen loads again: the portal's data, the pipeline, the open page's own list (K.emit('pull') for the
  // pages that read elsewhere, e.g. Reclame from Meta).
  async function refreshAll() {
    // a new version of the portal is out: the pull loads it (the whole page, not just the data)
    try { const p = await K.api('/api/portal-pulse'); seeBuild(p.build); } catch (e) { /* the data still refreshes */ }
    if (newCode(true)) return new Promise(() => {}); // the page is reloading
    const jobs = [load(true)];
    if (frontDesk()) jobs.push(K.leads(true).catch(() => {}));
    K.emit('remote');
    K.emit('pull');
    await Promise.race([Promise.all(jobs), new Promise((r) => setTimeout(r, 8000))]);
  }
  (function pullToRefresh() {
    if (!window.matchMedia || !matchMedia('(pointer: coarse)').matches) return;
    document.documentElement.classList.add('c360-pull');
    const el = document.createElement('div');
    el.className = 'c360-ptr';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = '<span>' + icon('refresh') + '</span>';
    document.body.appendChild(el);
    const MAX = 110, ARM = 72;
    let y0 = null, d = 0, busy = false;
    const set = (px, armed) => {
      el.style.transform = 'translate(-50%,' + Math.round(px - 52) + 'px)';
      el.style.opacity = String(Math.min(1, px / 40));
      el.classList.toggle('is-armed', !!armed);
      el.classList.toggle('is-pulling', px > 0);
    };
    // where it starts: right under the header
    const place = () => { const h = document.querySelector('header.topbar'); el.style.top = (h ? Math.max(0, h.getBoundingClientRect().bottom) : 0) + 'px'; };
    const blocked = (t) => K.drawerOpen || !!document.querySelector('.fb-root, .c360-dialog-root, .k-menu, .pl-stage-root, .c360-palette-root') ||
      !!(t && t.closest && t.closest('.mx-tbody, .mx-thread, input, textarea, select, [contenteditable="true"], .k-drawer-root'));
    // a list that scrolls on its own and isn't at its top keeps the gesture
    const innerScrolled = (t) => { for (let n = t; n && n !== document.body && n !== document.documentElement; n = n.parentElement) { if (n.scrollTop > 0 && n.scrollHeight > n.clientHeight + 2) return true; } return false; };
    addEventListener('touchstart', (e) => {
      y0 = null;
      if (busy || e.touches.length !== 1 || window.scrollY > 0 || blocked(e.target) || innerScrolled(e.target)) return;
      y0 = e.touches[0].clientY; d = 0;
      el.classList.remove('is-back');
      place();
    }, { passive: true });
    addEventListener('touchmove', (e) => {
      if (y0 == null) return;
      const dy = e.touches[0].clientY - y0;
      if (dy <= 0 || window.scrollY > 0) { if (d) { d = 0; set(0, false); } return; }
      d = Math.min(MAX, dy * 0.55);
      set(d, d >= ARM);
    }, { passive: true });
    const end = async () => {
      if (y0 == null) return;
      y0 = null;
      el.classList.add('is-back');
      if (d < ARM) { d = 0; set(0, false); return; }
      busy = true;
      if (navigator.vibrate) try { navigator.vibrate(10); } catch (x) { /* not allowed */ }
      el.classList.add('is-spin');
      set(ARM - 8, true);
      try { await refreshAll(); } finally {
        setTimeout(() => { busy = false; el.classList.remove('is-spin'); d = 0; set(0, false); }, 300);
      }
    };
    addEventListener('touchend', end, { passive: true });
    addEventListener('touchcancel', end, { passive: true });
  })();

  // ------------------------------------------------------------------ a new version of the portal
  // The portal is one page that stays open (a tab, the phone app in the background) and only its data
  // refreshes; new code would wait for a full reload. Each deploy has its own id (the pulse says it): when it
  // changes, the portal reloads itself at a moment that loses nothing: when it comes back to the screen, on
  // pull to refresh, or after 10 minutes without a touch; never over an open drawer or text being typed.
  let build = null, updateReady = false;
  const openedAt = Date.now();
  function seeBuild(b) {
    if (!b) return;
    if (build === null) build = b;
    else if (b !== build) updateReady = true;
  }
  function newCode(now) {
    if (!updateReady || busyEditing()) return false;
    if (!now && Date.now() - Math.max(lastInput, openedAt) < 10 * 60e3) return false;
    updateReady = false;
    location.reload();
    return true;
  }
  K.newCode = () => updateReady;
  function applyRemote() {
    if (busyEditing()) { pendingRemote = true; return; }
    pendingRemote = false;
    holdScroll();
    load(true);
    if (frontDesk()) K.leads(true).catch(() => {});
    K.emit('remote');
  }
  let hiddenPulse = 0;
  async function pulse() {
    if (!DATA) return;
    // a portal in a background tab: the front desk still hears about new leads (every 30 s, for the
    // bell and the alert); everyone else catches up when the tab is back
    if (document.hidden) {
      if (!frontDesk() || Date.now() - hiddenPulse < 30e3) return;
      hiddenPulse = Date.now();
    }
    try {
      const p = await K.api('/api/portal-pulse');
      seeBuild(p.build);
      if (newCode(false)) return;
      if (rev !== null && p.rev !== rev) applyRemote();
      else if (pendingRemote) applyRemote();
      rev = p.rev;
    } catch (e) { /* next tick */ }
  }
  // ------------------------------------------------------------------ instant sync (Supabase Realtime)
  // A save anywhere is announced on a broadcast channel (api/_lib/live.js): every open portal refreshes right away
  // instead of waiting for its next check. The check stays as the safety net: every 20 s while the channel is up,
  // every 3 s when it isn't. Only "the data changed" travels there; the data itself comes from this server.
  let live = null, liveUp = false, liveTimer = 0, pulseTimer = 0;
  const loadScript = (src) => new Promise((ok, no) => { const s = document.createElement('script'); s.src = src; s.async = true; s.onload = ok; s.onerror = no; document.head.appendChild(s); });
  async function connectLive(cfg) {
    if (!cfg || !cfg.url || live) return;
    live = 'starting';
    try {
      if (!window.supabase) await loadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.58.0/dist/umd/supabase.min.js');
      const client = window.supabase.createClient(cfg.url, cfg.anonKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
      live = client.channel(cfg.channel, { config: { broadcast: { self: true } } })
        .on('broadcast', { event: 'rev' }, (m) => onLive(m && m.payload))
        .on('broadcast', { event: 'ping' }, (m) => K.emit('live:ping', m && m.payload))
        .subscribe((st) => {
          const up = st === 'SUBSCRIBED';
          if (up === liveUp) return;
          liveUp = up;
          K.emit('live:status', up);
          if (up) pulse(); // anything missed while it was connecting
          schedulePulse();
        });
    } catch (e) { live = null; }
  }
  K.liveUp = () => liveUp;
  function onLive(p) {
    if (!p || !p.rev || p.rev === rev) return;
    clearTimeout(liveTimer);
    // one save writes a few documents in a row: one refresh for all of them
    liveTimer = setTimeout(() => { rev = p.rev; applyRemote(); }, 120);
  }
  function schedulePulse() {
    clearTimeout(pulseTimer);
    pulseTimer = setTimeout(async () => { await pulse(); schedulePulse(); }, liveUp ? 20000 : 3000);
  }
  schedulePulse();
  // a refresh held back while she was editing goes as soon as she's done (the drawer closed, the field left)
  setInterval(() => { if (pendingRemote && DATA && !busyEditing()) applyRemote(); }, 700);
  document.addEventListener('visibilitychange', async () => {
    if (document.hidden) return;
    // back on screen (the phone app reopened, the tab picked again): a new version loads right away
    if (DATA) { try { seeBuild((await K.api('/api/portal-pulse')).build); } catch (e) { /* the pulse below tries again */ } }
    if (newCode(true)) return;
    pulse();
  });

  const frontDesk = () => !!DATA && (DATA.isAdmin || DATA.me.role === 'receptie');
  K.frontDesk = frontDesk;
  K.on('reload', () => load(true));
  K.reload = () => load(true);

  // ------------------------------------------------------------------ navigation
  // A section can sit in two places of the menu (Traininguri: staff group / admin group)
  // it's allowed if any of its buttons is visible for this account.
  function allowed(tab) {
    return Array.from(document.querySelectorAll('#tabsNav button[data-tab="' + tab + '"]')).some((b) => !b.classList.contains('hidden'));
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
    K.pageNav(); // a slow page gets the turning mark (a fast one, nothing)
    if (tab === 'creative') creativeRoute = /^\/[a-z-]*$/.test(sub || '') ? sub : (sub === undefined ? creativeRoute : '/');
    markNav(tab);
    document.querySelectorAll('main > .panel').forEach((p) => p.classList.toggle('active', p.id === 'panel-' + tab));
    const main = document.querySelector('main');
    main.classList.toggle('wide', tab === 'creative');
    main.classList.toggle('pl-full', tab === 'pipeline');
    main.classList.toggle('ad-full', tab === 'reclame');
    main.classList.toggle('k-wide', tab !== 'creative' && tab !== 'pipeline' && tab !== 'reclame');
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
    K.badge('mesaje', DATA.waUnread || 0); // conversations with unread client messages
    if (DATA.isAdmin && DATA.admin) K.badge('aprobari', DATA.admin.pendingSales.length + (DATA.admin.pendingTime || 0) + (DATA.admin.pendingLeave || 0), 'hot');
    if (!frontDesk()) return; // cosmeticians: no pipeline badge / task queue
    if (DATA.me.role === 'receptie') { // Sarcini is the receptionist's own list
      try {
        const t = await K.api('/api/portal-automation-tasks');
        K.badge('automatizari', (t.tasks || []).length);
        K.emit('tasks', t.tasks || []);
      } catch (e) { /* badge only */ }
    }
    try {
      const j = await K.leads();
      leadBadge(j);
    } catch (e) { /* badge only */ }
  }
  // the Pipeline count = the people in the call queue (late call-backs, never called, call-backs due
  // today), in the city picked in the Pipeline (the same list "Coada de apeluri" opens)
  function leadBadge(j) {
    let city = '';
    try { const v = localStorage.getItem('c360_pl_city_' + (DATA && DATA.me ? DATA.me.id : '')) || ''; if (v === 'Timișoara' || v === 'Arad') city = v; } catch (e) { /* both cities */ }
    const n = (j.leads || []).filter((l) => (l.kind === 'open' || l.kind === 'booked') && (!city || l.location === city) &&
      (l.followUpState === 'overdue' || l.neverContacted || l.followUpState === 'today')).length;
    K.badge('pipeline', n, 'hot');
  }
  K.on('leads', leadBadge);
  K.on('tasks:changed', badges);
  // Keep badges fresh in the background (cheap: two small requests every 2 minutes).
  setInterval(() => {
    if (document.hidden || !DATA || !frontDesk()) return;
    K.leads(true).catch(() => {});
    if (DATA.me.role === 'receptie') K.api('/api/portal-automation-tasks').then((t) => { K.badge('automatizari', (t.tasks || []).length); K.emit('tasks', t.tasks || []); }).catch(() => {});
  }, 120000);

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
    // still loading: the page asked for is queued (the latest wins) and shown as soon as the app listens
    if (frame.dataset.started) { creativePost({ type: 'c360:navigate', route: creativeRoute }); return; }
    frame.dataset.started = '1';
    msg.classList.remove('hidden', 'is-error');
    msg.innerHTML = '<div class="cr-skel"><i></i><i></i><div>' + '<b></b>'.repeat(6) + '</div></div>';
    const ready = K.pageWait(); // the cover stays until Creative's own app has loaded
    try {
      const d = await K.api('/api/portal-creative-sso?next=' + encodeURIComponent(creativeRoute));
      frame.addEventListener('load', () => {
        ready();
        frame.classList.remove('hidden');
        msg.classList.add('hidden');
        // ready = when the app reports its page (it listens by then); an older app that never does
        // still gets its messages a moment later
        setTimeout(() => { if (!creativeReady) { creativeReady = true; if (creativePending) { const m = creativePending; creativePending = null; creativePost(m); } } }, 3000);
      }, { once: true });
      frame.src = d.url;
    } catch (err) {
      ready();
      delete frame.dataset.started;
      msg.classList.add('is-error');
      msg.textContent = 'Nu am putut deschide Creative. Reîncearcă.';
    }
  }
  // The app reports in-app navigation so the menu highlight and the URL follow it.
  window.addEventListener('message', (e) => {
    if (e.origin !== location.origin || !e.data || e.data.type !== 'c360:route' || typeof e.data.route !== 'string') return;
    if (!/^\/[a-z-]*$/.test(e.data.route)) return;
    // The app speaks only once it listens: that's when a page asked meanwhile can be delivered
    // (the frame's "load" can come before the app is ready, and the message would be lost).
    if (!creativeReady) creativeReady = true;
    if (creativePending) {
      const m = creativePending; creativePending = null; creativePost(m);
      if (m.type === 'c360:navigate') return; // the page asked for is on its way: keep its menu item lit
    }
    creativeRoute = e.data.route;
    if (!document.querySelector('#panel-creative.active')) return;
    markNav('creative');
    const hash = creativeHash(creativeRoute);
    if (location.hash.slice(1) !== hash) history.replaceState(null, '', location.pathname + location.search + '#' + hash);
  });
  // Command palette → "Comandă creative noi": open the order form inside Creative.
  window.addEventListener('c360:creative-new', () => creativePost({ type: 'c360:new-request' }));

  // ------------------------------------------------------------------ avatar menu
  let menu = null;
  const phone = () => window.matchMedia('(max-width:720px)').matches; // no side rail, no keyboard
  function openMenu(anchor) {
    if (menu) { closeMenu(); return; }
    menu = document.createElement('div');
    menu.className = 'k-menu has-acc';
    menu.innerHTML =
      '<button type="button" class="k-menu-head" data-act="account" title="Contul meu">' + K.avatar(DATA ? DATA.me.name : '?', 38) + '<div><b>' + esc(DATA ? DATA.me.name : '') + '</b><small>' + esc(document.getElementById('whoLocation').textContent || 'Administrator · acces complet') + '</small></div>' + icon('right') + '</button>' +
      '<button type="button" class="k-menu-item is-strong" data-act="account">' + icon('user') + 'Contul meu</button>' +
      (window.C360Accent ? window.C360Accent.menuHtml() : '') +
      (phone() ? '<button type="button" class="k-menu-item" data-act="nav">' + icon('layers') + 'Deschide meniul</button>' :
        '<button type="button" class="k-menu-item" data-act="rail">' + icon('layers') + 'Strânge / extinde meniul<kbd>Ctrl B</kbd></button>') +
      '<button type="button" class="k-menu-item" data-act="search">' + icon('search') + 'Caută orice<kbd>Ctrl K</kbd></button>' +
      '<button type="button" class="k-menu-item" data-act="logout">' + icon('power') + 'Deconectare</button>';
    document.body.appendChild(menu);
    const r = anchor.getBoundingClientRect();
    menu.style.top = (r.bottom + 8) + 'px';
    menu.style.right = Math.max(8, window.innerWidth - r.right) + 'px';
    menu.style.setProperty('--menu-top', (r.bottom + 8) + 'px');
    if (window.C360Accent) window.C360Accent.wire(menu);
    requestAnimationFrame(() => menu && menu.classList.add('is-open'));
    menu.addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]');
      if (!act) return;
      const what = act.dataset.act;
      closeMenu();
      if (what === 'rail') { const t = document.querySelector('.c360-rail-toggle'); if (t) t.click(); }
      // phones: the side menu is the "☰" button under the top bar
      if (what === 'nav') { const b = document.querySelector('.c360-mnav'); if (b) setTimeout(() => b.click(), 0); }
      if (what === 'search') document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }));
      if (what === 'logout') logout();
      if (what === 'account' && K.openAccount) K.openAccount();
    });
  }
  function closeMenu() { if (!menu) return; const m = menu; menu = null; m.classList.remove('is-open'); setTimeout(() => m.remove(), 200); }
  document.addEventListener('click', (e) => {
    const av = e.target.closest('.c360-avatar');
    if (av) { e.stopPropagation(); openMenu(av); return; }
    // (a drag on the colour picker that ends outside the menu doesn't close it)
    if (menu && !e.target.closest('.k-menu') && !(window.C360Accent && window.C360Accent.justDragged())) closeMenu();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && menu) closeMenu(); });

  async function logout() {
    try { await fetch('/api/portal-logout', { method: 'POST' }); } catch (e) { /* leaving anyway */ }
    location.href = '/login';
  }
  document.getElementById('logoutBtn').addEventListener('click', logout);

  load(false);
})();
