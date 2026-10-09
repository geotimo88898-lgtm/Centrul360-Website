// Centrul360 portal — Pipeline (portal.html "Pipeline" tab).
// Ported from the sales.timoceanuhr.com pipeline and taken further: editable stages, pointer
// drag & drop (mouse and touch long-press) with edge auto-scroll, a lead drawer with contact
// log / follow-up / next step / booking straight into the Calendar, a speed-to-lead call queue,
// duplicate merge, Ctrl+K lead search and a 20s auto-refresh that never interrupts typing.
// Talks only to /api/portal-leads and /api/portal-appointments.
(function () {
  'use strict';
  const API = '/api/portal-leads';
  const REFRESH_MS = 20000;
  const COLUMN_PAGE = 60;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const ui = () => window.c360 || {
    toast: (m) => window.alert(m),
    confirm: async (o) => window.confirm(o.message || o.title),
    prompt: async (o) => window.prompt(o.title, o.value || ''),
  };

  // ------------------------------------------------------------------ icons (Lucide paths)
  const P = {
    phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>',
    chat: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22z"/><path d="M8 12h.01M12 12h.01M16 12h.01"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    calPlus: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M12 14v5M9.5 16.5h5"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
    zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>',
    pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    trash: '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    left: '<path d="m15 18-6-6 6-6"/>',
    right: '<path d="m9 18 6-6-6-6"/>',
    up: '<path d="m18 15-6-6-6 6"/>',
    down: '<path d="m6 9 6 6 6-6"/>',
    userPlus: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
    repeat: '<path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5"/>',
    trophy: '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18M4 22h16M10 14.7V17c0 .6-.5 1-1 1.2C7.8 18.8 7 20.2 7 22M14 14.7V17c0 .6.5 1 1 1.2 1.2.6 2 2 2 3.8M18 2H6v7a6 6 0 0 0 12 0z"/>',
    flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3.3.4 1.1 1.4 2.3 2.5 2.8z"/>',
    alert: '<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
    pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
    mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>',
    tag: '<path d="M12.6 2.6A2 2 0 0 0 11.2 2H4a2 2 0 0 0-2 2v7.2a2 2 0 0 0 .6 1.4l8.7 8.7a2.4 2.4 0 0 0 3.4 0l6.6-6.6a2.4 2.4 0 0 0 0-3.4z"/><circle cx="7.5" cy="7.5" r="1"/>',
    coins: '<circle cx="8" cy="8" r="6"/><path d="M18.1 10.4A6 6 0 1 1 10.3 18M7 6h1v4M16.7 13.9l.7.7-2.8 2.8"/>',
    archive: '<rect x="2" y="3" width="20" height="5" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8M10 12h4"/>',
    note: '<path d="M15.5 3H5a2 2 0 0 0-2 2v14c0 1.1.9 2 2 2h14a2 2 0 0 0 2-2V8.5z"/><path d="M15 3v6h6"/>',
    target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
    ban: '<circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/>',
    facebook: '<path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>',
    instagram: '<rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><path d="M17.5 6.5h.01"/>',
    globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
    store: '<path d="m3 9 1-5h16l1 5M4 9v11h16V9M9 20v-6h6v6"/>',
  };
  const ic = (name, cls) => '<svg class="pl-ic' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (P[name] || '') + '</svg>';

  // ------------------------------------------------------------------ vocab
  const SOURCES = {
    facebook: { label: 'Facebook', icon: 'facebook' },
    instagram: { label: 'Instagram', icon: 'instagram' },
    site: { label: 'Site', icon: 'globe' },
    recomandare: { label: 'Recomandare', icon: 'users' },
    telefon: { label: 'Telefon', icon: 'phone' },
    walk_in: { label: 'Walk-in', icon: 'store' },
    altul: { label: 'Altul', icon: 'tag' },
  };
  const CHANNELS = { call: 'Apel', whatsapp: 'WhatsApp', sms: 'SMS', in_person: 'În clinică' };
  const OUTCOMES = {
    raspuns: { label: 'A răspuns', tone: 'good' },
    interesat: { label: 'Interesată', tone: 'good' },
    programat: { label: 'Vrea programare', tone: 'good' },
    revine: { label: 'Revine ea', tone: 'info' },
    nu_raspunde: { label: 'Nu răspunde', tone: 'warn' },
    refuz: { label: 'Nu e interesată', tone: 'bad' },
    numar_gresit: { label: 'Număr greșit', tone: 'bad' },
  };
  // Active offers only — the same list the Creative machine sells.
  const OFFERS = [
    { label: 'Facial Restart', value: 190, category: 'tratament-facial', where: '' },
    { label: 'LipoSonix 2 zone la preț de 1', value: 640, category: 'liposonix', where: '' },
    { label: 'Cavitație + EMS', value: 280, category: 'ems-tonifiere', where: 'Timișoara' },
    { label: 'Cavitație 1+1', value: 280, category: 'altele', where: 'Arad' },
    { label: 'Epilare laser Full Body', value: 490, category: 'epilare-laser', where: 'Timișoara' },
  ];
  const LOST_REASONS = ['Preț prea mare', 'Nu răspunde (3+ încercări)', 'A ales altă clinică', 'Nu e momentul', 'Distanță / locație', 'Număr greșit / spam', 'Altul'];
  const KIND_LABELS = { open: 'Lucru', booked: 'Programare', won: 'Câștigat ★', lost: 'Pierdut' };
  const COLORS = ['#4f8fd6', '#6fa8d6', '#2bb3a3', '#c9a227', '#e0835a', '#d97757', '#e05a7a', '#8b6fd0', '#2f9d62', '#8a8580'];
  const FIELD_LABELS = { name: 'nume', phone: 'telefon', email: 'email', source: 'sursă', location: 'locație', interest: 'interes', value: 'valoare' };
  const ERR = {
    missing_name: 'Completează numele.', missing_phone: 'Completează telefonul.', invalid_email: 'Email-ul nu pare corect.',
    invalid_value: 'Valoarea nu e validă.', invalid_source: 'Alege sursa.', invalid_location: 'Alege locația.',
    invalid_outcome: 'Alege cum a decurs discuția.', invalid_followup: 'Data de follow-up nu e validă.',
    need_one_won_stage: 'Trebuie exact o etapă de tip „Câștigat”.', need_one_lost_stage: 'Trebuie exact o etapă de tip „Pierdut”.',
    need_open_stage: 'Ai nevoie de cel puțin o etapă de lucru.', missing_stage_name: 'Fiecare etapă are nevoie de un nume.',
    invalid_stages: 'Lista de etape nu e validă (maxim 15).', lead_not_found: 'Leadul nu mai există — probabil a fost șters.',
    forbidden: 'Doar adminul poate face asta.', invalid_date: 'Alege data programării.', missing_treatment: 'Completează tratamentul.',
    invalid_category: 'Alege categoria.', invalid_client: 'Leadul nu are nume sau telefon.', network: 'Nu am putut contacta serverul. Verifică conexiunea.',
  };
  const errText = (e) => ERR[e && e.code] || 'Nu am putut salva. Încearcă din nou.';

  // ------------------------------------------------------------------ state
  const S = {
    ctx: { isAdmin: false, categories: {} },
    stages: [], leads: [], loaded: false, sig: '',
    q: '', filter: 'all', source: '', location: '', showLost: false,
    expanded: {}, dragging: false, timer: null,
    drawer: null, // { mode: 'lead'|'new', id, section, queue, dirty }
  };
  let root, boardEl, drawerRoot;

  async function api(action, payload, url) {
    let r;
    try {
      r = await fetch(url || API, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin',
        body: JSON.stringify(Object.assign({ action }, payload || {})),
      });
    } catch (e) { throw Object.assign(new Error('network'), { code: 'network' }); }
    if (r.status === 401) { location.href = '/portal-login'; throw new Error('auth'); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(j.error || 'failed'), { code: j.error });
    return j;
  }

  // ------------------------------------------------------------------ time helpers
  const MIN = 60000, HOUR = 60 * MIN, DAY = 24 * HOUR;
  const DOW = ['Dum', 'Lun', 'Mar', 'Mie', 'Joi', 'Vin', 'Sâm'];
  const MON = ['ian', 'feb', 'mar', 'apr', 'mai', 'iun', 'iul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const pad = (n) => String(n).padStart(2, '0');
  const hm = (d) => pad(d.getHours()) + ':' + pad(d.getMinutes());
  function ago(iso) {
    const t = new Date(iso).getTime();
    if (!Number.isFinite(t)) return '';
    const d = Date.now() - t;
    if (d < MIN) return 'acum';
    if (d < HOUR) return Math.floor(d / MIN) + ' min';
    if (d < DAY) return Math.floor(d / HOUR) + ' h';
    if (d < 2 * DAY) return 'ieri';
    if (d < 30 * DAY) return Math.floor(d / DAY) + ' zile';
    const x = new Date(t);
    return x.getDate() + ' ' + MON[x.getMonth()];
  }
  // Sentence form of ago(): "acum 5 min", "ieri", "3 oct".
  function agoLong(iso) {
    const v = ago(iso);
    return v === 'acum' ? 'chiar acum' : /(min|h|zile)$/.test(v) ? 'acum ' + v : v;
  }
  // appointmentAt is stored as "YYYY-MM-DD HH:MM" (calendar format) — show it like follow-ups.
  function apptWhen(s) {
    const m = /^(\d{4}-\d{2}-\d{2})(?: (\d{1,2}:\d{2}))?/.exec(s || '');
    if (!m) return s || '';
    const label = when(new Date(m[1] + 'T' + (m[2] || '00:00')).toISOString());
    return m[2] ? label : label.replace(/ 00:00$/, '');
  }
  function when(iso) {
    const d = new Date(iso);
    if (!Number.isFinite(d.getTime())) return '';
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const day = new Date(d); day.setHours(0, 0, 0, 0);
    const diff = Math.round((day - today) / DAY);
    const label = diff === 0 ? 'Azi' : diff === 1 ? 'Mâine' : diff === -1 ? 'Ieri' : (diff > 1 && diff < 7) ? DOW[d.getDay()] : d.getDate() + ' ' + MON[d.getMonth()];
    return label + ' ' + hm(d);
  }
  const fullDate = (iso) => { const d = new Date(iso); return Number.isFinite(d.getTime()) ? d.toLocaleString('ro-RO', { dateStyle: 'medium', timeStyle: 'short' }) : ''; };
  const toLocalInput = (iso) => { if (!iso) return ''; const d = new Date(iso); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + hm(d); };
  const fromLocalInput = (v) => (v ? new Date(v).toISOString() : '');
  // Calls only make sense while people pick up: anything outside 09:00–20:00 rolls to 10:00.
  function callableHours(d) {
    if (d.getHours() >= 20) { d.setDate(d.getDate() + 1); d.setHours(10, 0, 0, 0); }
    else if (d.getHours() < 9) d.setHours(10, 0, 0, 0);
    return d;
  }
  function quickWhen(key) {
    const d = new Date();
    if (key === '2h') { d.setTime(d.getTime() + 2 * HOUR); d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0); return callableHours(d); }
    if (key === 'evening') { d.setHours(18, 0, 0, 0); if (d < new Date()) d.setDate(d.getDate() + 1); return d; }
    if (key === 'tomorrow') { d.setDate(d.getDate() + 1); d.setHours(10, 0, 0, 0); return d; }
    if (key === '3d') { d.setDate(d.getDate() + 3); d.setHours(10, 0, 0, 0); return d; }
    if (key === 'week') { d.setDate(d.getDate() + 7); d.setHours(10, 0, 0, 0); return d; }
    return null;
  }
  const QUICK = [['2h', 'În 2 ore'], ['evening', 'Diseară 18:00'], ['tomorrow', 'Mâine 10:00'], ['3d', 'În 3 zile'], ['week', 'Peste o săptămână']];

  // ------------------------------------------------------------------ derived data
  const stageById = (id) => S.stages.find((s) => s.id === id);
  const leadById = (id) => S.leads.find((l) => l.id === id);
  const isWorking = (l) => l.kind === 'open' || l.kind === 'booked';
  const firstName = (n) => String(n || '').trim().split(/\s+/)[0] || '';
  const fmtLei = (n) => Math.round(Number(n) || 0).toLocaleString('ro-RO') + ' lei';
  function intlPhone(p) {
    let d = String(p || '').replace(/\D/g, '');
    if (d.startsWith('00')) d = d.slice(2);
    if (d.startsWith('0')) d = '4' + d;
    else if (d.length === 9 && d.startsWith('7')) d = '40' + d;
    return d;
  }
  function waLink(l) {
    const offer = l.interest ? ' pentru ' + l.interest : '';
    const msg = 'Bună, ' + firstName(l.name) + '! Sunt de la Centrul360 ' + (l.location || '') + '. Ai lăsat datele' + offer +
      ' și voiam să te ajut cu o programare. Când ți-ar fi bine să vii?';
    return 'https://wa.me/' + intlPhone(l.phone) + '?text=' + encodeURIComponent(msg);
  }
  const telLink = (l) => 'tel:' + String(l.phone || '').replace(/[^\d+]/g, '');
  function avatarColor(name) {
    let h = 0;
    for (const ch of String(name)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return COLORS[h % (COLORS.length - 1)];
  }
  const initials = (n) => String(n || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

  function queueList() {
    const w = S.leads.filter(isWorking);
    const overdue = w.filter((l) => l.followUpState === 'overdue').sort((a, b) => (a.followUpAt < b.followUpAt ? -1 : 1));
    const fresh = w.filter((l) => l.neverContacted && l.followUpState !== 'overdue').sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
    const today = w.filter((l) => l.followUpState === 'today' && !l.neverContacted).sort((a, b) => (a.followUpAt < b.followUpAt ? -1 : 1));
    return overdue.concat(fresh, today);
  }
  function matches(l) {
    if (S.source && l.source !== S.source) return false;
    if (S.location && l.location !== S.location) return false;
    if (S.filter === 'queue' && !(isWorking(l) && (l.followUpState === 'overdue' || l.followUpState === 'today' || l.neverContacted))) return false;
    if (S.filter === 'overdue' && l.followUpState !== 'overdue') return false;
    if (S.filter === 'new' && !l.neverContacted) return false;
    if (S.filter === 'idle' && !l.isInactive) return false;
    if (S.q) {
      const q = norm(S.q), qd = S.q.replace(/\D/g, '');
      const hay = norm([l.name, l.email, l.interest, l.nextAction, l.location].join(' '));
      if (!hay.includes(q) && !(qd.length >= 3 && String(l.phone).replace(/\D/g, '').includes(qd))) return false;
    }
    return true;
  }

  // ------------------------------------------------------------------ mount
  function mount() {
    root = document.getElementById('panel-pipeline');
    if (!root || root.dataset.plMounted) return;
    root.dataset.plMounted = '1';
    root.classList.add('pl-panel');
    root.innerHTML =
      '<div class="pl-head">' +
        '<div><div class="sec-eyebrow"><i></i>Vânzări</div><h2>Pipeline</h2>' +
        '<p class="pl-lede">Fiecare lead, de la formular la client. Sună întâi pe cei noi — viteza închide vânzarea.</p></div>' +
        '<div class="pl-head-actions">' +
          '<button type="button" class="pl-btn is-hot" data-act="queue">' + ic('zap') + '<span>Coada de apeluri</span><b class="pl-count" data-queue-count>0</b></button>' +
          (S.ctx.isAdmin ? '<button type="button" class="pl-btn is-ghost" data-act="stages" title="Editează etapele">' + ic('sliders') + '<span>Etape</span></button>' : '') +
          '<button type="button" class="pl-btn is-primary" data-act="new">' + ic('plus') + '<span>Lead nou</span><kbd>N</kbd></button>' +
        '</div>' +
      '</div>' +
      '<div class="pl-stats" data-stats></div>' +
      '<div class="pl-toolbar">' +
        '<label class="pl-search">' + ic('search') + '<input type="search" placeholder="Caută nume, telefon, interes…" data-search autocomplete="off" spellcheck="false"><kbd>/</kbd></label>' +
        '<div class="pl-chips" data-chips></div>' +
        '<div class="pl-filters">' +
          '<select data-filter-source aria-label="Sursă"><option value="">Toate sursele</option>' +
            Object.keys(SOURCES).map((k) => '<option value="' + k + '">' + SOURCES[k].label + '</option>').join('') + '</select>' +
          '<select data-filter-location aria-label="Locație"><option value="">Ambele locații</option><option>Timișoara</option><option>Arad</option></select>' +
          '<button type="button" class="pl-toggle" data-act="lost" aria-pressed="false">' + ic('archive') + '<span>Pierduți</span></button>' +
        '</div>' +
      '</div>' +
      '<div class="pl-board" data-board><div class="pl-skeleton">' + '<div></div>'.repeat(5) + '</div></div>';
    boardEl = root.querySelector('[data-board]');

    root.addEventListener('click', onRootClick);
    root.querySelector('[data-search]').addEventListener('input', (e) => { S.q = e.target.value; renderBoard(); renderChips(); });
    root.querySelector('[data-filter-source]').addEventListener('change', (e) => { S.source = e.target.value; renderAll(); });
    root.querySelector('[data-filter-location]').addEventListener('change', (e) => { S.location = e.target.value; renderAll(); });
    boardEl.addEventListener('pointerdown', onPointerDown);
    boardEl.addEventListener('click', (e) => {
      if (Date.now() - lastDropAt < 350) { e.stopPropagation(); e.preventDefault(); }
    }, true);
    window.addEventListener('resize', fitBoard);
    document.addEventListener('keydown', onKey);
    document.addEventListener('visibilitychange', () => { if (!document.hidden && isActive()) refresh(); });
  }
  const isActive = () => root && root.classList.contains('active');

  async function load(silent) {
    try {
      const j = await api('list');
      const sig = JSON.stringify([j.stages, j.leads]);
      S.stages = j.stages || [];
      S.leads = j.leads || [];
      S.loaded = true;
      if (sig !== S.sig || !silent) { S.sig = sig; renderAll(); if (S.drawer && !drawerBusy()) renderDrawer(); }
    } catch (e) {
      if (!silent && boardEl) boardEl.innerHTML = '<div class="pl-empty-board">' + ic('alert') + '<b>Nu am putut încărca pipeline-ul.</b><button type="button" class="pl-btn is-ghost" data-act="reload">Reîncearcă</button></div>';
    }
  }
  function refresh() { if (!S.dragging && !document.querySelector('.c360-dialog-root, .pl-stage-root')) load(true); }
  function startTimer() {
    clearInterval(S.timer);
    S.timer = setInterval(() => { if (isActive() && !document.hidden) refresh(); else clearInterval(S.timer); }, REFRESH_MS);
  }

  // ------------------------------------------------------------------ render: stats / chips
  function renderAll() { renderStats(); renderChips(); renderBoard(); }

  function renderStats() {
    const el = root.querySelector('[data-stats]');
    const w = S.leads.filter(isWorking);
    const overdue = w.filter((l) => l.followUpState === 'overdue');
    const fresh = w.filter((l) => l.neverContacted);
    const callNow = w.filter((l) => l.followUpState === 'overdue' || l.neverContacted);
    const booked = S.leads.filter((l) => l.kind === 'booked');
    const ms = new Date(); ms.setDate(1); ms.setHours(0, 0, 0, 0);
    const won = S.leads.filter((l) => l.kind === 'won' && new Date(l.stageChangedAt) >= ms);
    const oldest = fresh.slice().sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1))[0];
    const bookedStage = S.stages.find((s) => s.kind === 'booked');
    const card = (key, icon, label, value, sub, tone) =>
      '<button type="button" class="pl-stat' + (tone ? ' is-' + tone : '') + (S.filter === key ? ' is-on' : '') + '" data-stat="' + key + '">' +
      '<span class="pl-stat-ic">' + ic(icon) + '</span><span class="pl-stat-label">' + label + '</span>' +
      '<b class="pl-stat-value">' + value + '</b><span class="pl-stat-sub">' + sub + '</span></button>';
    el.innerHTML =
      card('all', 'users', 'Leaduri active', w.length, fmtLei(w.reduce((s, l) => s + (l.value || 0), 0)) + ' în pipeline') +
      card('queue', 'zap', 'De sunat acum', callNow.length, overdue.length + ' întârziate · ' + fresh.length + ' noi', callNow.length ? 'hot' : '') +
      card('new', 'flame', 'Necontactați', fresh.length, oldest ? 'cel mai vechi: ' + agoLong(oldest.createdAt) : 'toți au fost sunați', fresh.length ? 'warn' : 'good') +
      card('booked', 'calendar', 'Programați', booked.length, bookedStage ? 'în „' + esc(bookedStage.name) + '”' : '—') +
      card('won', 'trophy', 'Câștigați luna asta', won.length, fmtLei(won.reduce((s, l) => s + (l.value || 0), 0)), won.length ? 'good' : '');
    const q = queueList().length;
    const qc = root.querySelector('[data-queue-count]');
    qc.textContent = q;
    qc.classList.toggle('is-zero', !q);
  }

  function renderChips() {
    const el = root.querySelector('[data-chips]');
    const counts = {
      all: S.leads.filter((l) => S.showLost || l.kind !== 'lost').length,
      queue: S.leads.filter((l) => isWorking(l) && (l.followUpState === 'overdue' || l.followUpState === 'today' || l.neverContacted)).length,
      overdue: S.leads.filter((l) => l.followUpState === 'overdue').length,
      new: S.leads.filter((l) => l.neverContacted).length,
      idle: S.leads.filter((l) => l.isInactive).length,
    };
    const chips = [['all', 'Toate'], ['queue', 'De sunat azi'], ['overdue', 'Întârziate'], ['new', 'Necontactați'], ['idle', 'Fără activitate']];
    el.innerHTML = chips.map(([k, label]) =>
      '<button type="button" class="pl-chip' + (S.filter === k ? ' is-on' : '') + (k === 'overdue' && counts.overdue ? ' is-alert' : '') + '" data-chip="' + k + '">' +
      label + '<span>' + counts[k] + '</span></button>').join('');
    const lostBtn = root.querySelector('[data-act="lost"]');
    lostBtn.setAttribute('aria-pressed', S.showLost ? 'true' : 'false');
  }

  // ------------------------------------------------------------------ render: board
  function fitBoard() {
    if (!boardEl || !isActive()) return;
    const top = boardEl.getBoundingClientRect().top + window.scrollY;
    const h = Math.max(440, window.innerHeight - top - 24);
    boardEl.style.height = h + 'px';
  }

  function renderBoard() {
    if (!boardEl || !S.loaded) return;
    const scroll = { left: boardEl.scrollLeft, lists: {} };
    boardEl.querySelectorAll('.pl-list').forEach((l) => { scroll.lists[l.dataset.stage] = l.scrollTop; });

    if (!boardEl.dataset.entered) {
      boardEl.dataset.entered = '1';
      boardEl.classList.add('is-enter');
      setTimeout(() => boardEl.classList.remove('is-enter'), 700);
    }
    const visible = S.leads.filter(matches);
    const stages = S.stages.filter((s) => s.kind !== 'lost' || S.showLost);
    // Stats "Programați"/"Câștigați" filters are column focus, not lead filters.
    const focus = S.filter === 'booked' ? 'booked' : S.filter === 'won' ? 'won' : '';
    boardEl.innerHTML = stages.map((s) => {
      const all = visible.filter((l) => l.stage === s.id).sort((a, b) => (a.position || 0) - (b.position || 0));
      const limit = S.expanded[s.id] ? all.length : COLUMN_PAGE;
      const value = all.reduce((sum, l) => sum + (l.value || 0), 0);
      return '<section class="pl-col is-' + s.kind + (focus && s.kind !== focus ? ' is-dim' : '') + '" data-stage="' + s.id + '" style="--c:' + s.color + '">' +
        '<header class="pl-col-head"><span class="pl-dot"></span><b>' + esc(s.name) + '</b>' +
        (s.kind === 'won' ? '<span class="pl-star" title="Etapa de câștig">★</span>' : '') +
        '<span class="pl-col-count">' + all.length + '</span>' +
        (value ? '<span class="pl-col-value">' + fmtLei(value) + '</span>' : '') + '</header>' +
        '<div class="pl-list" data-stage="' + s.id + '">' +
          (all.length ? all.slice(0, limit).map(cardHtml).join('') : '<div class="pl-col-empty">' + (S.q || S.filter !== 'all' || S.source || S.location ? 'Nimic aici pentru filtrul ales' : 'Trage un lead aici') + '</div>') +
          (all.length > limit ? '<button type="button" class="pl-more" data-more="' + s.id + '">Arată încă ' + (all.length - limit) + '</button>' : '') +
        '</div>' +
        (s.kind === 'won' || s.kind === 'lost' ? '' : '<button type="button" class="pl-add" data-add="' + s.id + '">' + ic('plus') + 'Adaugă lead</button>') +
      '</section>';
    }).join('');

    boardEl.scrollLeft = scroll.left;
    boardEl.querySelectorAll('.pl-list').forEach((l) => { if (scroll.lists[l.dataset.stage]) l.scrollTop = scroll.lists[l.dataset.stage]; });
    fitBoard();
  }

  function cardHtml(l) {
    const src = SOURCES[l.source] || SOURCES.altul;
    const chips = [];
    if (l.followUpState) {
      chips.push('<span class="pl-tag is-' + (l.followUpState === 'overdue' ? 'bad' : l.followUpState === 'today' ? 'warn' : 'info') + '" title="' + esc(l.nextAction || 'Follow-up') + '">' +
        ic('clock') + (l.followUpState === 'overdue' ? 'Întârziat · ' : '') + when(l.followUpAt) + '</span>');
    }
    if (l.neverContacted) {
      const age = Date.now() - new Date(l.createdAt).getTime();
      const tone = age < 15 * MIN ? 'good' : age < 2 * HOUR ? 'warn' : 'bad';
      chips.push('<span class="pl-tag is-' + tone + ' is-pulse">' + '<i class="pl-pulse"></i>Nou · ' + ago(l.createdAt) + '</span>');
    } else if (l.isInactive) {
      chips.push('<span class="pl-tag is-warn">' + ic('alert') + l.idleDays + ' zile fără activitate</span>');
    }
    if (l.appointmentAt && l.kind !== 'won') chips.push('<span class="pl-tag is-info">' + ic('calendar') + esc(apptWhen(l.appointmentAt)) + '</span>');
    if (l.contactCount) chips.push('<span class="pl-tag is-mute" title="Contactări">' + ic('phone') + l.contactCount + '</span>');
    if (l.kind === 'lost' && l.lostReason) chips.push('<span class="pl-tag is-mute">' + esc(l.lostReason) + '</span>');
    return '<article class="pl-card' + (l.followUpState === 'overdue' ? ' is-overdue' : '') + (l.neverContacted ? ' is-new' : '') + '" data-id="' + l.id + '" tabindex="0">' +
      '<div class="pl-card-top">' +
        '<span class="pl-src is-' + l.source + '" title="' + src.label + '">' + ic(src.icon) + '</span>' +
        '<b class="pl-name">' + esc(l.name) + '</b>' +
        '<span class="pl-age" title="În etapă de ' + l.daysInStage + ' zile">' + ago(l.stageChangedAt || l.createdAt) + '</span>' +
      '</div>' +
      '<div class="pl-card-sub">' + esc(l.phone) + ' · ' + esc(l.location) + '</div>' +
      (l.interest ? '<div class="pl-interest">' + ic('target') + '<span>' + esc(l.interest) + '</span>' + (l.value ? '<b>' + fmtLei(l.value) + '</b>' : '') + '</div>' : '') +
      (l.nextAction && !l.followUpState ? '<div class="pl-next">' + ic('arrow') + esc(l.nextAction) + '</div>' : '') +
      (chips.length ? '<div class="pl-tags">' + chips.join('') + '</div>' : '') +
      '<div class="pl-quick">' +
        '<a href="' + telLink(l) + '" class="pl-qbtn" title="Sună" data-quick="call">' + ic('phone') + '</a>' +
        '<a href="' + waLink(l) + '" target="_blank" rel="noopener" class="pl-qbtn is-wa" title="WhatsApp" data-quick="wa">' + ic('chat') + '</a>' +
      '</div>' +
    '</article>';
  }

  // ------------------------------------------------------------------ events: panel
  function onRootClick(e) {
    const t = e.target;
    const act = t.closest('[data-act]');
    if (act) {
      const a = act.dataset.act;
      if (a === 'new') return openNew();
      if (a === 'queue') return openQueue();
      if (a === 'stages') return openStageEditor();
      if (a === 'reload') return load();
      if (a === 'lost') { S.showLost = !S.showLost; return renderAll(); }
    }
    const stat = t.closest('[data-stat]');
    if (stat) { const k = stat.dataset.stat; S.filter = S.filter === k ? 'all' : k; return renderAll(); }
    const chip = t.closest('[data-chip]');
    if (chip) { S.filter = chip.dataset.chip; return renderAll(); }
    const more = t.closest('[data-more]');
    if (more) { S.expanded[more.dataset.more] = true; return renderBoard(); }
    const add = t.closest('[data-add]');
    if (add) return openNew(add.dataset.add);
    const quick = t.closest('[data-quick]');
    if (quick) {
      const card = quick.closest('.pl-card');
      const l = card && leadById(card.dataset.id);
      // After dialing / opening WhatsApp, land on the outcome form so the call gets logged.
      if (l) setTimeout(() => openLead(l.id, { section: 'log', channel: quick.dataset.quick === 'wa' ? 'whatsapp' : 'call' }), 250);
      return;
    }
    const card = t.closest('.pl-card');
    if (card) openLead(card.dataset.id);
  }

  function typingTarget(el) {
    return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
  }
  function onKey(e) {
    if (!isActive() || e.ctrlKey || e.metaKey || e.altKey) return;
    if (document.querySelector('.c360-dialog-root, .c360-palette-root, .pl-stage-root, .c360-select.is-open')) return;
    if (e.key === 'Escape' && S.drawer) { e.preventDefault(); closeDrawer(); return; }
    if (typingTarget(document.activeElement)) return;
    const k = e.key.toLowerCase();
    if (S.drawer && S.drawer.mode === 'lead') {
      if (k === 'j' || e.key === 'ArrowDown') { e.preventDefault(); stepDrawer(1); return; }
      if (k === 'k' || e.key === 'ArrowUp') { e.preventDefault(); stepDrawer(-1); return; }
      if (k === 'l') { e.preventDefault(); showSection('log'); return; }
      if (k === 'p') { e.preventDefault(); showSection('book'); return; }
    }
    if (S.drawer) return;
    if (k === 'n') { e.preventDefault(); openNew(); }
    else if (e.key === '/') { e.preventDefault(); root.querySelector('[data-search]').focus(); }
    else if (k === 'q') { e.preventDefault(); openQueue(); }
    else if (e.key === 'Enter' && document.activeElement && document.activeElement.classList.contains('pl-card')) openLead(document.activeElement.dataset.id);
  }

  // ------------------------------------------------------------------ drag & drop
  let drag = null;
  let lastDropAt = 0;
  function onPointerDown(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const card = e.target.closest('.pl-card');
    if (!card || e.target.closest('a, button')) return;
    drag = { card, id: card.dataset.id, sx: e.clientX, sy: e.clientY, x: e.clientX, y: e.clientY, type: e.pointerType, started: false, timer: 0 };
    if (e.pointerType !== 'mouse') {
      card.classList.add('is-pressing');
      drag.timer = setTimeout(() => { if (drag && !drag.started) beginDrag(); }, 320);
    }
    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerCancel);
    document.addEventListener('touchmove', blockTouchScroll, { passive: false });
  }
  function blockTouchScroll(e) { if (drag && drag.started) e.preventDefault(); }
  function onPointerMove(e) {
    if (!drag) return;
    drag.x = e.clientX; drag.y = e.clientY;
    if (!drag.started) {
      const dist = Math.hypot(drag.x - drag.sx, drag.y - drag.sy);
      if (drag.type === 'mouse' ? dist > 6 : false) beginDrag();
      else if (drag.type !== 'mouse' && dist > 10) endPointer(); // it's a scroll, not a long-press
      return;
    }
    e.preventDefault();
    moveGhost();
    placePlaceholder();
  }
  function beginDrag() {
    const d = drag;
    clearTimeout(d.timer);
    d.card.classList.remove('is-pressing');
    d.started = true;
    S.dragging = true;
    const r = d.card.getBoundingClientRect();
    d.ox = d.sx - r.left; d.oy = d.sy - r.top;
    d.ghost = d.card.cloneNode(true);
    d.ghost.classList.add('pl-ghost');
    d.ghost.style.width = r.width + 'px';
    document.body.appendChild(d.ghost);
    d.ph = document.createElement('div');
    d.ph.className = 'pl-placeholder';
    d.ph.style.height = r.height + 'px';
    d.card.after(d.ph);
    d.card.classList.add('is-src');
    boardEl.classList.add('is-dragging');
    document.documentElement.classList.add('pl-grabbing');
    if (navigator.vibrate && d.type !== 'mouse') navigator.vibrate(8);
    moveGhost();
    placePlaceholder();
    autoScroll();
  }
  function moveGhost() {
    const d = drag;
    d.ghost.style.transform = 'translate3d(' + (d.x - d.ox) + 'px,' + (d.y - d.oy) + 'px,0) rotate(2.2deg)';
  }
  function columnAt(x) {
    const cols = boardEl.querySelectorAll('.pl-col');
    for (const c of cols) { const r = c.getBoundingClientRect(); if (x >= r.left - 6 && x <= r.right + 6) return c; }
    return null;
  }
  function placePlaceholder() {
    const d = drag;
    const col = columnAt(d.x);
    boardEl.querySelectorAll('.pl-col.is-over').forEach((c) => { if (c !== col) c.classList.remove('is-over'); });
    if (!col) return;
    col.classList.add('is-over');
    const list = col.querySelector('.pl-list');
    const cards = Array.from(list.querySelectorAll('.pl-card:not(.is-src)'));
    let before = null;
    for (const c of cards) { const r = c.getBoundingClientRect(); if (d.y < r.top + r.height / 2) { before = c; break; } }
    const empty = list.querySelector('.pl-col-empty');
    if (empty) empty.style.display = 'none';
    if (!before) before = list.querySelector('.pl-more');
    if (before) { if (d.ph.nextElementSibling !== before) list.insertBefore(d.ph, before); }
    else if (list.lastElementChild !== d.ph) list.appendChild(d.ph);
  }
  function autoScroll() {
    if (!drag || !drag.started) return;
    const d = drag;
    const br = boardEl.getBoundingClientRect();
    const edge = 80;
    let moved = false;
    if (d.x < br.left + edge) { boardEl.scrollLeft -= Math.ceil((br.left + edge - d.x) / 4); moved = true; }
    else if (d.x > br.right - edge) { boardEl.scrollLeft += Math.ceil((d.x - (br.right - edge)) / 4); moved = true; }
    const col = columnAt(d.x);
    const list = col && col.querySelector('.pl-list');
    if (list) {
      const lr = list.getBoundingClientRect();
      if (d.y < lr.top + 56) { list.scrollTop -= Math.ceil((lr.top + 56 - d.y) / 3); moved = true; }
      else if (d.y > lr.bottom - 56) { list.scrollTop += Math.ceil((d.y - (lr.bottom - 56)) / 3); moved = true; }
    }
    if (moved) placePlaceholder();
    requestAnimationFrame(autoScroll);
  }
  function onPointerCancel() { if (drag && drag.started) finishDrag(false); else endPointer(); }
  function onPointerUp() {
    if (!drag) return;
    if (!drag.started) { endPointer(); return; }
    finishDrag(true);
  }
  function endPointer() {
    if (drag) { clearTimeout(drag.timer); drag.card.classList.remove('is-pressing'); }
    drag = null;
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerCancel);
    document.removeEventListener('touchmove', blockTouchScroll);
  }
  function finishDrag(commit) {
    const d = drag;
    lastDropAt = Date.now();
    const col = d.ph.closest('.pl-col');
    const stageId = col && col.dataset.stage;
    const prev = d.ph.previousElementSibling && d.ph.previousElementSibling.classList.contains('pl-card') ? leadById(d.ph.previousElementSibling.dataset.id) : null;
    let nextEl = d.ph.nextElementSibling;
    while (nextEl && nextEl.classList.contains('is-src')) nextEl = nextEl.nextElementSibling;
    const next = nextEl && nextEl.classList.contains('pl-card') ? leadById(nextEl.dataset.id) : null;
    const position = prev && next ? (prev.position + next.position) / 2 : prev ? prev.position + 1 : next ? next.position - 1 : 0;

    const pr = d.ph.getBoundingClientRect();
    const ghost = d.ghost;
    ghost.style.transition = reduceMotion ? 'none' : 'transform .18s cubic-bezier(.2,.8,.2,1), box-shadow .18s ease';
    ghost.style.transform = 'translate3d(' + pr.left + 'px,' + pr.top + 'px,0) rotate(0deg)';
    ghost.classList.add('is-landing');
    setTimeout(() => ghost.remove(), reduceMotion ? 0 : 190);

    boardEl.classList.remove('is-dragging');
    document.documentElement.classList.remove('pl-grabbing');
    boardEl.querySelectorAll('.pl-col.is-over').forEach((c) => c.classList.remove('is-over'));
    S.dragging = false;
    const id = d.id;
    endPointer();
    const lead = leadById(id);
    if (!commit || !stageId || !lead) { renderBoard(); return; }
    if (lead.stage === stageId && Math.abs((lead.position || 0) - position) < 1e-9) { renderBoard(); return; }
    setTimeout(() => moveLead(id, stageId, position), reduceMotion ? 0 : 150);
  }

  async function askLostReason(lead) {
    return ui().prompt({
      title: 'De ce s-a pierdut ' + firstName(lead.name) + '?', message: 'Motivul ne arată ce trebuie schimbat în ofertă sau în ritmul de follow-up.',
      label: 'Motiv', options: LOST_REASONS.map((r) => [r, r]), value: LOST_REASONS[0], confirmText: 'Marchează pierdut',
    });
  }

  async function moveLead(id, stageId, position, opts) {
    const lead = leadById(id);
    const target = stageById(stageId);
    if (!lead || !target) return;
    const changed = lead.stage !== stageId;
    let lostReason = '';
    if (changed && target.kind === 'lost') {
      lostReason = (opts && opts.lostReason) || await askLostReason(lead);
      if (lostReason == null) { renderBoard(); return; }
    }
    const before = { stage: lead.stage, position: lead.position, kind: lead.kind };
    lead.stage = stageId; lead.kind = target.kind;
    if (position != null) lead.position = position;
    renderAll();
    flashCard(id);
    try {
      const j = await api('move_stage', { leadId: id, stage: stageId, position, lostReason });
      replaceLead(j.lead);
      renderAll();
      if (S.drawer && S.drawer.id === id) renderDrawer();
      if (!changed) return;
      if (target.kind === 'won') ui().toast('Felicitări — ' + lead.name + ' e client nou. L-am adăugat în baza de clienți.', 'success');
      else if (target.kind === 'booked' && !j.lead.appointmentId) {
        ui().toast('Pune și programarea în calendar, ca să primească confirmarea.', 'info');
        openLead(id, { section: 'book' });
      } else ui().toast(lead.name + ' → ' + target.name, 'success');
    } catch (e) {
      Object.assign(lead, before);
      renderAll();
      ui().toast(errText(e), 'error');
    }
  }
  function flashCard(id) {
    const c = boardEl.querySelector('.pl-card[data-id="' + id + '"]');
    if (c) { c.classList.add('is-flash'); setTimeout(() => c.classList.remove('is-flash'), 900); }
  }
  function replaceLead(fresh) {
    const i = S.leads.findIndex((l) => l.id === fresh.id);
    if (i === -1) S.leads.push(fresh); else S.leads[i] = fresh;
  }

  // ------------------------------------------------------------------ drawer
  function ensureDrawer() {
    if (drawerRoot) return;
    drawerRoot = document.createElement('div');
    drawerRoot.className = 'pl-drawer-root';
    drawerRoot.innerHTML = '<div class="pl-drawer-backdrop" data-close></div><aside class="pl-drawer" role="dialog" aria-modal="true" aria-label="Fișa leadului"></aside>';
    document.body.appendChild(drawerRoot);
    drawerRoot.addEventListener('click', onDrawerClick);
    drawerRoot.addEventListener('input', onDrawerInput);
    drawerRoot.addEventListener('change', onDrawerInput);
    drawerRoot.addEventListener('submit', onDrawerSubmit);
  }
  const drawerEl = () => drawerRoot.querySelector('.pl-drawer');
  function drawerBusy() {
    if (!S.drawer) return false;
    if (S.drawer.dirty || S.drawer.saving) return true;
    const a = document.activeElement;
    return !!(a && drawerRoot.contains(a) && typingTarget(a));
  }
  function openDrawerShell() {
    ensureDrawer();
    if (!drawerRoot.classList.contains('is-open')) {
      document.documentElement.classList.add('c360-noscroll');
      requestAnimationFrame(() => drawerRoot.classList.add('is-open'));
    }
  }
  function closeDrawer() {
    if (!S.drawer) return;
    S.drawer = null;
    drawerRoot.classList.remove('is-open');
    document.documentElement.classList.remove('c360-noscroll');
    boardEl && boardEl.querySelectorAll('.pl-card.is-current').forEach((c) => c.classList.remove('is-current'));
  }
  function openLead(id, opts) {
    if (!leadById(id)) return;
    const o = opts || {};
    S.drawer = { mode: 'lead', id, section: o.section || '', channel: o.channel || 'call', queue: o.queue || (S.drawer && S.drawer.queue) || null, dirty: false };
    openDrawerShell();
    renderDrawer(true);
    boardEl.querySelectorAll('.pl-card.is-current').forEach((c) => c.classList.remove('is-current'));
    const c = boardEl.querySelector('.pl-card[data-id="' + id + '"]');
    if (c) c.classList.add('is-current');
  }
  function openNew(stageId) {
    S.drawer = { mode: 'new', stageId: stageId || '', dirty: false };
    openDrawerShell();
    renderDrawer(true);
    setTimeout(() => { const f = drawerEl().querySelector('[name="name"]'); if (f) f.focus(); }, 260);
  }
  function openQueue() {
    const q = queueList();
    if (!q.length) { ui().toast('Coada e goală — toți leadurii au fost contactați la timp.', 'success'); return; }
    openLead(q[0].id, { queue: q.map((l) => l.id), section: 'log' });
  }
  function stepDrawer(dir) {
    const d = S.drawer;
    if (!d || d.mode !== 'lead') return;
    const ids = d.queue || Array.from(boardEl.querySelectorAll('.pl-card')).map((c) => c.dataset.id);
    const i = ids.indexOf(d.id);
    const nextId = ids[i + dir];
    if (nextId && leadById(nextId)) openLead(nextId, { queue: d.queue, section: d.queue ? 'log' : '' });
    else if (d.queue && dir > 0) { ui().toast('Ai terminat coada de apeluri. Bravo!', 'success'); closeDrawer(); }
  }
  function showSection(name) {
    if (!S.drawer || S.drawer.mode !== 'lead') return;
    S.drawer.section = S.drawer.section === name ? '' : name;
    renderDrawer();
    const el = drawerEl().querySelector('[data-section="' + name + '"]');
    if (el) {
      el.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
      const f = el.querySelector('textarea, input:not([type=hidden])');
      if (f && name !== 'log') setTimeout(() => f.focus({ preventScroll: true }), 200);
    }
  }

  function renderDrawer(fresh) {
    if (!S.drawer) return;
    const el = drawerEl();
    const body = el.querySelector('.pl-dbody');
    const keep = body && !fresh ? body.scrollTop : 0;
    el.innerHTML = S.drawer.mode === 'new' ? newLeadHtml() : leadHtml(leadById(S.drawer.id));
    const nb = el.querySelector('.pl-dbody');
    if (nb) nb.scrollTop = keep;
    if (fresh) {
      el.classList.remove('is-swap'); void el.offsetWidth; el.classList.add('is-swap');
      clearTimeout(el._swapT);
      el._swapT = setTimeout(() => el.classList.remove('is-swap'), 450);
    }
  }

  function offerOptions(current) {
    const known = OFFERS.some((o) => o.label === current);
    return '<option value="">— alege oferta —</option>' +
      OFFERS.map((o) => '<option value="' + esc(o.label) + '"' + (o.label === current ? ' selected' : '') + '>' + esc(o.label) + ' · ' + o.value + ' lei' + (o.where ? ' (' + o.where + ')' : '') + '</option>').join('') +
      (current && !known ? '<option selected>' + esc(current) + '</option>' : '') +
      '<option value="__custom">Altceva…</option>';
  }
  const sourceOptions = (cur) => Object.keys(SOURCES).map((k) => '<option value="' + k + '"' + (k === cur ? ' selected' : '') + '>' + SOURCES[k].label + '</option>').join('');
  const locationOptions = (cur) => ['Timișoara', 'Arad'].map((k) => '<option' + (k === cur ? ' selected' : '') + '>' + k + '</option>').join('');

  function newLeadHtml() {
    const d = S.drawer;
    const workStages = S.stages.filter((s) => s.kind === 'open' || s.kind === 'booked');
    return '<header class="pl-dhead"><div class="pl-dtitle"><span class="pl-avatar is-new">' + ic('userPlus') + '</span><div><h3>Lead nou</h3><p>Dacă numărul există deja, deschid fișa existentă — fără dubluri.</p></div></div>' +
      '<button type="button" class="pl-icon-btn" data-close aria-label="Închide">' + ic('x') + '</button></header>' +
      '<form class="pl-dbody pl-form" data-form="new" autocomplete="off">' +
        '<div class="pl-grid">' +
          field('Nume', '<input name="name" required maxlength="150" placeholder="ex: Andreea Popescu">', 'full') +
          field('Telefon', '<input name="phone" type="tel" required maxlength="30" placeholder="07xx xxx xxx">') +
          field('Email (opțional)', '<input name="email" type="email" maxlength="150">') +
          field('Sursă', '<select name="source">' + sourceOptions('facebook') + '</select>') +
          field('Locație', '<select name="location">' + locationOptions('Timișoara') + '</select>') +
          field('Interesată de', '<select name="interest">' + offerOptions('') + '</select>', 'full') +
          '<div class="pl-field full is-hidden" data-custom-interest><span>Descrie interesul</span><input name="interestCustom" maxlength="120"></div>' +
          field('Valoare estimată (lei)', '<input name="value" type="number" min="0" step="10" placeholder="0">') +
          field('Etapă', '<select name="stageId">' + workStages.map((s) => '<option value="' + s.id + '"' + (s.id === d.stageId ? ' selected' : '') + '>' + esc(s.name) + '</option>').join('') + '</select>') +
          field('Notă (opțional)', '<textarea name="note" rows="3" maxlength="1000" placeholder="Ce știm despre ea, ce a întrebat…"></textarea>', 'full') +
        '</div>' +
        '<div class="pl-form-actions"><button type="button" class="pl-btn is-ghost" data-close>Renunță</button><button type="submit" class="pl-btn is-primary">' + ic('check') + 'Adaugă lead</button></div>' +
      '</form>';
  }
  const field = (label, control, cls) => '<label class="pl-field' + (cls ? ' ' + cls : '') + '"><span>' + label + '</span>' + control + '</label>';

  function leadHtml(l) {
    if (!l) return '<div class="pl-dbody"><p class="pl-muted">Leadul nu mai există.</p></div>';
    const d = S.drawer;
    const stage = stageById(l.stage) || { name: l.stage, color: '#8a8580', kind: 'open' };
    const src = SOURCES[l.source] || SOURCES.altul;
    const ids = d.queue || Array.from(boardEl.querySelectorAll('.pl-card')).map((c) => c.dataset.id);
    const idx = ids.indexOf(l.id);
    const nav = idx > -1 ? '<div class="pl-dnav">' +
      (d.queue ? '<span class="pl-queue-pill">' + ic('zap') + 'Coadă ' + (idx + 1) + '/' + ids.length + '</span>' : '') +
      '<button type="button" class="pl-icon-btn" data-step="-1" ' + (idx <= 0 ? 'disabled' : '') + ' title="Anterior (K)">' + ic('up') + '</button>' +
      '<button type="button" class="pl-icon-btn" data-step="1" ' + (idx >= ids.length - 1 && !d.queue ? 'disabled' : '') + ' title="Următorul (J)">' + ic('down') + '</button></div>' : '';
    const flow = S.stages.filter((s) => s.kind !== 'lost');
    const lostStage = S.stages.find((s) => s.kind === 'lost');

    return '<header class="pl-dhead">' +
        '<div class="pl-dtitle"><span class="pl-avatar" style="--c:' + avatarColor(l.name) + '">' + esc(initials(l.name)) + '</span>' +
        '<div><h3>' + esc(l.name) + '</h3><p><span class="pl-src-inline is-' + l.source + '">' + ic(src.icon) + src.label + '</span> · ' + esc(l.location) + ' · creat ' + agoLong(l.createdAt) + '</p></div></div>' +
        nav + '<button type="button" class="pl-icon-btn" data-close aria-label="Închide (Esc)">' + ic('x') + '</button>' +
      '</header>' +
      '<div class="pl-dbody">' +
        // stage stepper
        '<div class="pl-stepper" role="group" aria-label="Etapă">' +
          flow.map((s) => '<button type="button" class="pl-step' + (s.id === l.stage ? ' is-on' : '') + (flow.indexOf(s) < flow.findIndex((x) => x.id === l.stage) ? ' is-past' : '') + '" data-move="' + s.id + '" style="--c:' + s.color + '">' +
            '<i></i><span>' + esc(s.name) + '</span></button>').join('') +
        '</div>' +
        (l.kind === 'lost' ? '<div class="pl-banner is-bad">' + ic('ban') + '<div><b>Pierdut</b>' + (l.lostReason ? ' · ' + esc(l.lostReason) : '') + '</div><button type="button" class="pl-btn is-ghost is-sm" data-move="' + (S.stages.find((s) => s.kind === 'open') || {}).id + '">Redeschide</button></div>' : '') +
        (l.kind === 'won' ? '<div class="pl-banner is-good">' + ic('trophy') + '<div><b>Client câștigat</b> · e în baza de clienți a clinicii.</div></div>' : '') +
        // contact row
        '<div class="pl-contact">' +
          '<a class="pl-big-action" href="' + telLink(l) + '" data-dial="call">' + ic('phone') + '<span><b>Sună</b><small>' + esc(l.phone) + '</small></span></a>' +
          '<a class="pl-big-action is-wa" href="' + waLink(l) + '" target="_blank" rel="noopener" data-dial="whatsapp">' + ic('chat') + '<span><b>WhatsApp</b><small>mesaj pregătit</small></span></a>' +
          '<button type="button" class="pl-big-action is-book' + (d.section === 'book' ? ' is-on' : '') + '" data-section-toggle="book">' + ic('calPlus') + '<span><b>Programează</b><small>' + (l.appointmentAt ? esc(apptWhen(l.appointmentAt)) : 'direct în calendar') + '</small></span></button>' +
        '</div>' +
        (d.section === 'book' ? bookHtml(l) : '') +
        // log contact
        '<section class="pl-card-sec' + (d.section === 'log' ? ' is-focus' : '') + '" data-section="log">' +
          '<div class="pl-sec-head"><h4>' + ic('phone') + 'Cum a mers contactul?</h4><span class="pl-muted">' + (l.contactCount ? l.contactCount + (l.contactCount === 1 ? ' contactare' : ' contactări') + ' · ultima ' + agoLong(l.lastContactAt) : 'Încă necontactată') + '</span></div>' +
          '<div class="pl-seg" data-seg="channel">' + Object.keys(CHANNELS).map((k) => '<button type="button" data-val="' + k + '" class="' + (k === (d.channel || 'call') ? 'is-on' : '') + '">' + CHANNELS[k] + '</button>').join('') + '</div>' +
          '<div class="pl-outcomes" data-seg="outcome">' + Object.keys(OUTCOMES).map((k) => '<button type="button" data-val="' + k + '" class="is-' + OUTCOMES[k].tone + '">' + OUTCOMES[k].label + '</button>').join('') + '</div>' +
          '<textarea class="pl-input" data-log-text rows="2" maxlength="1000" placeholder="Ce a spus? (opțional)"></textarea>' +
          '<div class="pl-follow"><span class="pl-follow-label">' + ic('clock') + 'Revin la ea</span>' +
            '<div class="pl-quickpicks" data-picks="log">' + QUICK.map(([k, t]) => '<button type="button" data-pick="' + k + '">' + t + '</button>').join('') + '</div>' +
            '<input type="datetime-local" class="pl-input" data-log-follow></div>' +
          '<div class="pl-sec-actions"><button type="button" class="pl-btn is-primary" data-save-log disabled>' + ic('check') + 'Salvează contactul</button></div>' +
        '</section>' +
        // next step
        '<section class="pl-card-sec" data-section="next">' +
          '<div class="pl-sec-head"><h4>' + ic('arrow') + 'Următorul pas</h4>' +
            (l.followUpAt ? '<span class="pl-tag is-' + (l.followUpState === 'overdue' ? 'bad' : l.followUpState === 'today' ? 'warn' : 'info') + '">' + ic('clock') + when(l.followUpAt) + '</span>' : '<span class="pl-muted">Nimic programat</span>') + '</div>' +
          '<input class="pl-input" data-next-text maxlength="160" placeholder="ex: Trimite prețul pe WhatsApp, sună după salariu…" value="' + esc(l.nextAction) + '">' +
          '<div class="pl-follow"><div class="pl-quickpicks" data-picks="next">' + QUICK.map(([k, t]) => '<button type="button" data-pick="' + k + '">' + t + '</button>').join('') + '</div>' +
          '<input type="datetime-local" class="pl-input" data-next-follow value="' + toLocalInput(l.followUpAt) + '"></div>' +
          '<div class="pl-sec-actions">' + (l.followUpAt ? '<button type="button" class="pl-btn is-ghost" data-clear-next>Șterge follow-up</button>' : '') +
          '<button type="button" class="pl-btn is-primary" data-save-next>' + ic('check') + 'Salvează pasul</button></div>' +
        '</section>' +
        // details
        '<details class="pl-card-sec pl-details"' + (d.detailsOpen ? ' open' : '') + ' data-section="details"><summary><h4>' + ic('pen') + 'Detalii</h4>' +
          '<span class="pl-muted">' + esc([l.interest, l.value ? fmtLei(l.value) : '', l.email].filter(Boolean).join(' · ') || 'interes, valoare, email') + '</span></summary>' +
          '<form class="pl-form" data-form="details" autocomplete="off"><div class="pl-grid">' +
            field('Nume', '<input name="name" required maxlength="150" value="' + esc(l.name) + '">', 'full') +
            field('Telefon', '<input name="phone" type="tel" required maxlength="30" value="' + esc(l.phone) + '">') +
            field('Email', '<input name="email" type="email" maxlength="150" value="' + esc(l.email) + '">') +
            field('Sursă', '<select name="source">' + sourceOptions(l.source) + '</select>') +
            field('Locație', '<select name="location">' + locationOptions(l.location) + '</select>') +
            field('Interesată de', '<select name="interest">' + offerOptions(l.interest) + '</select>', 'full') +
            '<div class="pl-field full is-hidden" data-custom-interest><span>Descrie interesul</span><input name="interestCustom" maxlength="120"></div>' +
            field('Valoare estimată (lei)', '<input name="value" type="number" min="0" step="10" value="' + (l.value || '') + '">') +
          '</div><div class="pl-form-actions"><button type="submit" class="pl-btn is-primary" data-save-details disabled>' + ic('check') + 'Salvează detaliile</button></div></form>' +
        '</details>' +
        // note + timeline
        '<section class="pl-card-sec" data-section="timeline">' +
          '<div class="pl-sec-head"><h4>' + ic('note') + 'Istoric</h4><span class="pl-muted">' + (l.activities || []).length + ' evenimente</span></div>' +
          '<form class="pl-note" data-form="note"><textarea class="pl-input" name="text" rows="2" maxlength="1000" placeholder="Adaugă o notă… (Ctrl+Enter salvează)"></textarea><button type="submit" class="pl-btn is-ghost">Adaugă</button></form>' +
          '<ol class="pl-timeline">' + (l.activities || []).slice().reverse().map(activityHtml).join('') + '</ol>' +
        '</section>' +
        '<footer class="pl-dfoot">' +
          (l.kind !== 'lost' && lostStage ? '<button type="button" class="pl-btn is-ghost is-sm is-danger-text" data-move="' + lostStage.id + '">' + ic('ban') + 'Marchează pierdut</button>' : '') +
          (S.ctx.isAdmin ? '<button type="button" class="pl-btn is-ghost is-sm is-danger-text" data-delete>' + ic('trash') + 'Șterge definitiv</button>' : '') +
          '<span class="pl-muted">În „' + esc(stage.name) + '” de ' + l.daysInStage + (l.daysInStage === 1 ? ' zi' : ' zile') + '</span>' +
        '</footer>' +
      '</div>';
  }

  function activityHtml(a) {
    const map = {
      created: ['userPlus', 'Lead creat' + (a.text ? ' · ' + (SOURCES[a.text] ? SOURCES[a.text].label : esc(a.text)) : '')],
      stage: ['arrow', esc(a.text)],
      note: ['note', 'Notă'],
      contact: [a.channel === 'whatsapp' ? 'chat' : 'phone', (CHANNELS[a.channel] || 'Contact') + ' · ' + ((OUTCOMES[a.outcome] || {}).label || '')],
      followup: ['clock', 'Follow-up'],
      booking: ['calendar', 'Programare făcută · ' + esc(String(a.text || '').replace(/^\d{4}-\d{2}-\d{2}(?: \d{1,2}:\d{2})?/, (m) => apptWhen(m)))],
      edit: ['pen', 'Detalii modificate: ' + esc(String(a.text || '').split(', ').map((k) => FIELD_LABELS[k] || k).join(', '))],
      returned: ['repeat', esc(a.text)],
    };
    const [icon, title] = map[a.type] || ['note', esc(a.type)];
    let detail = '';
    if (a.type === 'note' || a.type === 'contact') detail = a.text ? esc(a.text) : '';
    if (a.type === 'followup') detail = esc(String(a.text || '').replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z/, (m) => when(m)));
    const tone = a.type === 'contact' ? ' is-' + ((OUTCOMES[a.outcome] || {}).tone || 'info') : a.type === 'booking' ? ' is-good' : '';
    return '<li class="pl-tl' + tone + '"><span class="pl-tl-ic">' + ic(icon) + '</span><div><div class="pl-tl-title">' + title + '</div>' +
      (detail ? '<div class="pl-tl-text">' + detail + '</div>' : '') +
      '<div class="pl-tl-meta" title="' + esc(fullDate(a.at)) + '">' + (a.author ? esc(a.author) + ' · ' : '') + agoLong(a.at) + '</div></div></li>';
  }

  function guessCategory(l) {
    const offer = OFFERS.find((o) => o.label === l.interest);
    if (offer && S.ctx.categories[offer.category]) return offer.category;
    const n = norm(l.interest);
    const keys = Object.keys(S.ctx.categories || {});
    return keys.find((k) => n && n.includes(k.split('-')[0])) || (keys.includes('altele') ? 'altele' : keys[0] || '');
  }
  function bookHtml(l) {
    const t = new Date(); t.setDate(t.getDate() + 1);
    const date = t.getFullYear() + '-' + pad(t.getMonth() + 1) + '-' + pad(t.getDate());
    const cats = S.ctx.categories || {};
    const cat = guessCategory(l);
    return '<section class="pl-card-sec is-focus pl-book" data-section="book"><div class="pl-sec-head"><h4>' + ic('calPlus') + 'Programare nouă</h4><span class="pl-muted">Apare în Calendar + sarcină de confirmare WhatsApp</span></div>' +
      '<form class="pl-form" data-form="book"><div class="pl-grid">' +
        field('Data', '<input name="date" type="date" required value="' + date + '">') +
        field('Ora', '<input name="time" type="time" step="900" value="10:00">') +
        field('Categorie', '<select name="category">' + Object.keys(cats).map((k) => '<option value="' + k + '"' + (k === cat ? ' selected' : '') + '>' + esc(cats[k]) + '</option>').join('') + '</select>') +
        field('Locație', '<select name="location">' + locationOptions(l.location) + '</select>') +
        field('Tratament', '<input name="treatment" required maxlength="200" value="' + esc(l.interest || '') + '" placeholder="ex: Facial Restart">', 'full') +
      '</div><div class="pl-form-actions"><button type="button" class="pl-btn is-ghost" data-section-toggle="book">Renunță</button><button type="submit" class="pl-btn is-primary">' + ic('check') + 'Programează</button></div></form></section>';
  }

  // ------------------------------------------------------------------ drawer events
  function onDrawerClick(e) {
    const t = e.target;
    if (t.closest('[data-close]')) return closeDrawer();
    const d = S.drawer;
    if (!d) return;
    const step = t.closest('[data-step]');
    if (step) return stepDrawer(+step.dataset.step);
    if (d.mode !== 'lead') return;
    const l = leadById(d.id);
    if (!l) return;
    const move = t.closest('[data-move]');
    if (move && move.dataset.move && move.dataset.move !== l.stage) return moveLead(l.id, move.dataset.move, null);
    const sect = t.closest('[data-section-toggle]');
    if (sect) return showSection(sect.dataset.sectionToggle);
    const dial = t.closest('[data-dial]');
    if (dial) {
      d.channel = dial.dataset.dial;
      setTimeout(() => { d.section = 'log'; renderDrawer(); const s = drawerEl().querySelector('[data-section="log"]'); s && s.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 300);
      return;
    }
    const segBtn = t.closest('[data-seg] > button');
    if (segBtn) {
      const seg = segBtn.parentElement;
      seg.querySelectorAll('button').forEach((b) => b.classList.toggle('is-on', b === segBtn));
      if (seg.dataset.seg === 'channel') d.channel = segBtn.dataset.val;
      if (seg.dataset.seg === 'outcome') {
        const out = segBtn.dataset.val;
        const sec = seg.closest('[data-section]');
        sec.querySelector('[data-save-log]').disabled = false;
        // Smart default for "when do I try again": unanswered calls retry fast, then back off.
        const pick = out === 'nu_raspunde' ? ((l.contactCount || 0) >= 2 ? 'tomorrow' : '2h') : out === 'revine' ? '3d' : out === 'interesat' || out === 'raspuns' ? 'tomorrow' : '';
        const input = sec.querySelector('[data-log-follow]');
        sec.querySelectorAll('[data-pick]').forEach((b) => b.classList.toggle('is-on', b.dataset.pick === pick));
        input.value = pick ? toLocalInput(quickWhen(pick).toISOString()) : '';
      }
      return;
    }
    const pick = t.closest('[data-pick]');
    if (pick) {
      const wrap = pick.closest('.pl-follow');
      const on = !pick.classList.contains('is-on');
      wrap.querySelectorAll('[data-pick]').forEach((b) => b.classList.toggle('is-on', on && b === pick));
      wrap.querySelector('input[type=datetime-local]').value = on ? toLocalInput(quickWhen(pick.dataset.pick).toISOString()) : '';
      return;
    }
    if (t.closest('[data-save-log]')) return saveLog(l);
    if (t.closest('[data-save-next]')) return saveNext(l, false);
    if (t.closest('[data-clear-next]')) return saveNext(l, true);
    if (t.closest('[data-delete]')) return deleteLead(l);
    const sum = t.closest('summary');
    if (sum) setTimeout(() => { d.detailsOpen = sum.parentElement.open; }, 0);
  }

  function onDrawerInput(e) {
    const t = e.target;
    const form = t.closest('form');
    if (t.name === 'interest') {
      const custom = form.querySelector('[data-custom-interest]');
      custom.classList.toggle('is-hidden', t.value !== '__custom');
      if (t.value === '__custom') setTimeout(() => custom.querySelector('input').focus(), 30);
      const offer = OFFERS.find((o) => o.label === t.value);
      const val = form.querySelector('[name="value"]');
      if (offer && val && (!val.value || OFFERS.some((o) => String(o.value) === val.value))) val.value = offer.value;
      if (offer && offer.where) { const loc = form.querySelector('[name="location"]'); if (loc && e.type === 'change') loc.value = offer.where; }
    }
    if (t.matches('[data-log-follow], [data-next-follow]')) t.closest('.pl-follow').querySelectorAll('[data-pick]').forEach((b) => b.classList.remove('is-on'));
    if (form && form.dataset.form === 'details') {
      S.drawer.dirty = true;
      form.querySelector('[data-save-details]').disabled = false;
    }
    if (form && form.dataset.form === 'new') S.drawer.dirty = true;
  }

  function onDrawerSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const kind = form.dataset.form;
    if (kind === 'new') return submitNew(form);
    const l = leadById(S.drawer && S.drawer.id);
    if (!l) return;
    if (kind === 'details') return submitDetails(form, l);
    if (kind === 'note') return submitNote(form, l);
    if (kind === 'book') return submitBook(form, l);
  }
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && drawerRoot && drawerRoot.contains(document.activeElement)) {
      const form = document.activeElement.closest('form');
      if (form) { e.preventDefault(); form.requestSubmit(); }
      else if (document.activeElement.matches('[data-log-text]')) { e.preventDefault(); const b = drawerEl().querySelector('[data-save-log]'); if (!b.disabled) b.click(); }
    }
  });

  function formData(form) {
    const o = {};
    new FormData(form).forEach((v, k) => { o[k] = typeof v === 'string' ? v.trim() : v; });
    if (o.interest === '__custom') o.interest = o.interestCustom || '';
    delete o.interestCustom;
    return o;
  }
  async function busy(btn, fn) {
    if (btn) { btn.disabled = true; btn.classList.add('is-busy'); }
    S.drawer && (S.drawer.saving = true);
    try { return await fn(); }
    finally { if (S.drawer) S.drawer.saving = false; if (btn && btn.isConnected) { btn.disabled = false; btn.classList.remove('is-busy'); } }
  }

  async function submitNew(form) {
    const data = formData(form);
    await busy(form.querySelector('[type=submit]'), async () => {
      try {
        const j = await api('create', data);
        replaceLead(j.lead);
        S.drawer.dirty = false;
        renderAll();
        if (j.duplicate) ui().toast(j.reopened ? 'Numărul era la Pierduți — am redeschis leadul existent.' : 'Numărul există deja — am deschis fișa existentă.', 'info');
        else ui().toast('Lead adăugat. Sună-l acum — primele 5 minute contează cel mai mult.', 'success');
        openLead(j.lead.id, { section: j.duplicate ? '' : 'log' });
        flashCard(j.lead.id);
      } catch (e) { ui().toast(errText(e), 'error'); }
    });
  }
  async function submitDetails(form, l) {
    const data = formData(form);
    data.leadId = l.id;
    data.value = Number(data.value || 0);
    await busy(form.querySelector('[type=submit]'), async () => {
      try {
        const j = await api('update_details', data);
        replaceLead(j.lead); S.drawer.dirty = false; renderAll(); renderDrawer();
        ui().toast('Detalii salvate.', 'success');
      } catch (e) { ui().toast(errText(e), 'error'); }
    });
  }
  async function submitNote(form, l) {
    const text = form.text.value.trim();
    if (!text) { form.text.focus(); return; }
    await busy(form.querySelector('[type=submit]'), async () => {
      try {
        const j = await api('add_note', { leadId: l.id, text });
        replaceLead(j.lead); renderAll(); renderDrawer();
      } catch (e) { ui().toast(errText(e), 'error'); }
    });
  }
  async function saveLog(l) {
    const sec = drawerEl().querySelector('[data-section="log"]');
    const outcomeBtn = sec.querySelector('[data-seg="outcome"] .is-on');
    if (!outcomeBtn) { ui().toast(ERR.invalid_outcome, 'error'); return; }
    const outcome = outcomeBtn.dataset.val;
    const followUpAt = fromLocalInput(sec.querySelector('[data-log-follow]').value);
    const payload = {
      leadId: l.id, channel: S.drawer.channel || 'call', outcome,
      text: sec.querySelector('[data-log-text]').value.trim(),
      followUpAt,
    };
    if (outcome === 'nu_raspunde' && followUpAt && !l.nextAction) payload.nextAction = 'Sună din nou';
    await busy(sec.querySelector('[data-save-log]'), async () => {
      try {
        const j = await api('log_contact', payload);
        replaceLead(j.lead); renderAll();
        const stageChanged = j.lead.stage !== l.stage;
        ui().toast('Contact salvat' + (stageChanged ? ' · mutat în „' + (stageById(j.lead.stage) || {}).name + '”' : '') + (followUpAt ? ' · revii ' + when(followUpAt) : ''), 'success');
        if (outcome === 'programat') { S.drawer.section = ''; showSection('book'); return; }
        if (outcome === 'refuz' || outcome === 'numar_gresit') {
          const lost = S.stages.find((s) => s.kind === 'lost');
          const ok = await ui().confirm({ title: 'Îl treci la Pierduți?', message: outcome === 'refuz' ? 'Nu mai apare în coada de apeluri.' : 'Numărul greșit nu poate fi contactat.', confirmText: 'Da, pierdut' });
          if (ok && lost) return moveLead(l.id, lost.id, null, outcome === 'numar_gresit' ? { lostReason: 'Număr greșit / spam' } : null);
        }
        if (S.drawer && S.drawer.queue) { stepDrawer(1); return; }
        S.drawer.section = '';
        renderDrawer();
      } catch (e) { ui().toast(errText(e), 'error'); }
    });
  }
  async function saveNext(l, clear) {
    const sec = drawerEl().querySelector('[data-section="next"]');
    const payload = clear ? { leadId: l.id, followUpAt: '', nextAction: '' } : {
      leadId: l.id, nextAction: sec.querySelector('[data-next-text]').value.trim(), followUpAt: fromLocalInput(sec.querySelector('[data-next-follow]').value),
    };
    await busy(sec.querySelector(clear ? '[data-clear-next]' : '[data-save-next]'), async () => {
      try {
        const j = await api('set_followup', payload);
        replaceLead(j.lead); renderAll(); renderDrawer();
        ui().toast(clear ? 'Follow-up șters.' : payload.followUpAt ? 'Îți amintesc ' + when(payload.followUpAt) + '.' : 'Pas salvat.', 'success');
      } catch (e) { ui().toast(errText(e), 'error'); }
    });
  }
  async function submitBook(form, l) {
    const data = formData(form);
    await busy(form.querySelector('[type=submit]'), async () => {
      try {
        const a = await api('create', {
          date: data.date, time: data.time, treatment: data.treatment, category: data.category, location: data.location,
          status: 'programata', clientName: l.name, clientPhone: l.phone,
        }, '/api/portal-appointments');
        const appt = a.appointment || {};
        const j = await api('link_appointment', { leadId: l.id, appointmentId: appt.id, date: data.date, time: data.time, treatment: data.treatment });
        replaceLead(j.lead); S.drawer.section = ''; renderAll(); renderDrawer();
        ui().toast('Programat ' + when(new Date(data.date + 'T' + (data.time || '10:00')).toISOString()) + '. Apare în Calendar.', 'success');
        if (typeof window.loadWeek === 'function') { try { window.loadWeek(); } catch (_) { /* calendar refreshes on its own */ } }
      } catch (e) { ui().toast(errText(e), 'error'); }
    });
  }
  async function deleteLead(l) {
    const ok = await ui().confirm({ title: 'Ștergi definitiv leadul?', message: l.name + ' și tot istoricul lui dispar. Dacă doar nu mai e interesat, folosește „Marchează pierdut”.', confirmText: 'Șterge definitiv', danger: true });
    if (!ok) return;
    try {
      await api('delete', { leadId: l.id });
      S.leads = S.leads.filter((x) => x.id !== l.id);
      closeDrawer(); renderAll();
      ui().toast('Lead șters.', 'success');
    } catch (e) { ui().toast(errText(e), 'error'); }
  }

  // ------------------------------------------------------------------ stage editor (admin)
  function openStageEditor() {
    if (!S.ctx.isAdmin) return;
    const draft = S.stages.map((s) => Object.assign({}, s, { count: S.leads.filter((l) => l.stage === s.id).length }));
    const reassign = {};
    let colorOpen = -1;
    const wrap = document.createElement('div');
    wrap.className = 'c360-dialog-root pl-stage-root';
    wrap.innerHTML = '<div class="c360-dialog-backdrop" data-x></div><div class="c360-dialog pl-stage-dialog" role="dialog" aria-modal="true" aria-label="Etapele pipeline-ului"></div>';
    document.body.appendChild(wrap);
    document.documentElement.classList.add('c360-noscroll');
    const box = wrap.querySelector('.pl-stage-dialog');

    function render() {
      box.innerHTML =
        '<div class="pl-stage-head"><div><h3 class="c360-dialog-title">Etapele pipeline-ului</h3><p class="c360-dialog-msg">Ordinea de aici e ordinea coloanelor. ★ Câștigat adaugă automat clientul în bază; „Programare” e etapa în care ajunge un lead programat.</p></div>' +
        '<button type="button" class="pl-icon-btn" data-x aria-label="Închide">' + ic('x') + '</button></div>' +
        '<div class="pl-stage-list">' + draft.map((s, i) =>
          '<div class="pl-st-row" data-i="' + i + '">' +
            '<div class="pl-st-move"><button type="button" data-up ' + (i === 0 ? 'disabled' : '') + ' aria-label="Mută sus">' + ic('up') + '</button><button type="button" data-down ' + (i === draft.length - 1 ? 'disabled' : '') + ' aria-label="Mută jos">' + ic('down') + '</button></div>' +
            '<button type="button" class="pl-st-color" data-color style="--c:' + s.color + '" aria-label="Culoare"></button>' +
            '<input class="pl-input pl-st-name" data-name maxlength="40" value="' + esc(s.name) + '" placeholder="Nume etapă">' +
            '<select data-kind aria-label="Tip">' + Object.keys(KIND_LABELS).map((k) => '<option value="' + k + '"' + (k === s.kind ? ' selected' : '') + '>' + KIND_LABELS[k] + '</option>').join('') + '</select>' +
            '<span class="pl-st-count">' + (s.count || 0) + '</span>' +
            '<button type="button" class="pl-icon-btn" data-del aria-label="Șterge etapa">' + ic('trash') + '</button>' +
          '</div>' +
          (colorOpen === i ? '<div class="pl-st-palette">' + COLORS.map((c) => '<button type="button" data-pick-color="' + c + '" style="--c:' + c + '"' + (c === s.color ? ' class="is-on"' : '') + '></button>').join('') + '</div>' : '')
        ).join('') + '</div>' +
        '<button type="button" class="pl-btn is-ghost pl-st-add" data-add-stage>' + ic('plus') + 'Adaugă etapă</button>' +
        '<div class="c360-dialog-actions"><button type="button" class="c360-btn is-ghost" data-x>Anulează</button><button type="button" class="c360-btn is-primary" data-save>Salvează etapele</button></div>';
    }
    function close() {
      wrap.classList.remove('is-open'); wrap.classList.add('is-closing');
      document.documentElement.classList.toggle('c360-noscroll', !!S.drawer);
      document.removeEventListener('keydown', onEsc, true);
      setTimeout(() => wrap.remove(), reduceMotion ? 0 : 200);
    }
    function onEsc(e) { if (e.key === 'Escape' && !document.querySelector('.c360-dialog-root:not(.pl-stage-root)')) { e.preventDefault(); close(); } }
    document.addEventListener('keydown', onEsc, true);
    wrap.addEventListener('input', (e) => { const row = e.target.closest('[data-i]'); if (row && e.target.matches('[data-name]')) draft[+row.dataset.i].name = e.target.value; });
    wrap.addEventListener('change', (e) => { const row = e.target.closest('[data-i]'); if (row && e.target.matches('[data-kind]')) draft[+row.dataset.i].kind = e.target.value; });
    wrap.addEventListener('click', async (e) => {
      const t = e.target;
      if (t.closest('[data-x]')) return close();
      const row = t.closest('[data-i]');
      const i = row ? +row.dataset.i : -1;
      if (t.closest('[data-up]') && i > 0) { [draft[i - 1], draft[i]] = [draft[i], draft[i - 1]]; colorOpen = -1; return render(); }
      if (t.closest('[data-down]') && i < draft.length - 1) { [draft[i + 1], draft[i]] = [draft[i], draft[i + 1]]; colorOpen = -1; return render(); }
      if (t.closest('[data-color]')) { colorOpen = colorOpen === i ? -1 : i; return render(); }
      const pc = t.closest('[data-pick-color]');
      if (pc) { draft[colorOpen].color = pc.dataset.pickColor; colorOpen = -1; return render(); }
      if (t.closest('[data-add-stage]')) {
        const lostAt = draft.findIndex((s) => s.kind === 'won');
        draft.splice(lostAt > -1 ? lostAt : draft.length, 0, { id: '', name: '', color: COLORS[draft.length % COLORS.length], kind: 'open', count: 0 });
        render();
        const inputs = box.querySelectorAll('[data-name]');
        inputs[lostAt > -1 ? lostAt : inputs.length - 1].focus();
        return;
      }
      if (t.closest('[data-del]')) {
        const s = draft[i];
        if (s.count) {
          const others = draft.filter((x, j) => j !== i && x.id);
          const target = await ui().prompt({
            title: 'Unde muți cele ' + s.count + ' leaduri?', message: '„' + (s.name || 'Etapa') + '” se șterge când salvezi.',
            label: 'Etapa nouă', options: others.map((x) => [x.id, x.name]), value: (others[0] || {}).id, confirmText: 'Mută și șterge',
          });
          if (target == null) return;
          reassign[s.id] = target;
          const dest = draft.find((x) => x.id === target);
          if (dest) dest.count = (dest.count || 0) + s.count;
        }
        draft.splice(i, 1);
        colorOpen = -1;
        return render();
      }
      if (t.closest('[data-save]')) {
        const btn = t.closest('[data-save]');
        btn.disabled = true;
        try {
          const j = await api('stages_save', { stages: draft.map(({ id, name, color, kind }) => ({ id, name, color, kind })), reassign });
          close();
          ui().toast('Etapele au fost salvate' + (j.moved ? ' · ' + j.moved + ' leaduri mutate' : '') + '.', 'success');
          load();
        } catch (err) { ui().toast(errText(err), 'error'); btn.disabled = false; }
      }
    });
    render();
    requestAnimationFrame(() => wrap.classList.add('is-open'));
  }

  // ------------------------------------------------------------------ Ctrl+K integration
  (window.c360PaletteProviders = window.c360PaletteProviders || []).push(() => {
    const open = () => { const b = document.querySelector('nav button[data-tab="pipeline"]'); if (b && !isActive()) b.click(); };
    const items = [
      { group: 'Pipeline', label: 'Lead nou', hint: 'N', icon: P.userPlus, run: () => { open(); setTimeout(() => openNew(), 120); } },
      { group: 'Pipeline', label: 'Coada de apeluri', hint: 'Q', icon: P.zap, run: () => { open(); setTimeout(() => (S.loaded ? openQueue() : load().then(openQueue)), 160); } },
    ];
    S.leads.slice(0, 400).forEach((l) => items.push({
      group: 'Leaduri', label: l.name + ' · ' + l.phone, icon: P.users,
      run: () => { open(); setTimeout(() => openLead(l.id), 160); },
    }));
    return items;
  });

  // ------------------------------------------------------------------ public
  window.C360Pipeline = {
    init(ctx) { S.ctx = Object.assign(S.ctx, ctx || {}); },
    open() {
      if (window.C360_CTX) S.ctx = Object.assign(S.ctx, window.C360_CTX);
      mount();
      requestAnimationFrame(fitBoard);
      load(S.loaded);
      startTimer();
    },
    openLead, openNew, openQueue,
  };
  // Lead names should be searchable from Ctrl+K before the tab is ever opened.
  // Plain fetch (no login redirect) — this is a background nicety, not a page load.
  document.addEventListener('DOMContentLoaded', () => setTimeout(() => {
    if (S.loaded) return;
    fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: '{"action":"list"}' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (j && !S.loaded) { S.stages = j.stages || []; S.leads = j.leads || []; } })
      .catch(() => {});
  }, 1500));
})();
