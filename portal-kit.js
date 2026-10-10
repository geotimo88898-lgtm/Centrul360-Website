// Centrul360 portal — shared kit for every section module (portal-dashboard.js, portal-calendar.js,
// portal-money.js, portal-work.js, portal-admin.js). One API helper, one icon set, one drawer, one
// chart engine, one motion vocabulary — so every section looks and behaves the same.
// Exposed as window.K. Sections register with K.section(id, {...}); portal.html's core calls
// K.show(tab) on navigation and K.setData(DATA) whenever /api/portal-data is (re)loaded.
(function () {
  'use strict';
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const ui = () => window.c360 || { toast: (m) => window.alert(m), confirm: async (o) => window.confirm(o.message || o.title), prompt: async (o) => window.prompt(o.title, o.value || '') };

  // ------------------------------------------------------------------ events + data hub
  const listeners = {};
  const on = (evt, fn) => { (listeners[evt] = listeners[evt] || []).push(fn); };
  const emit = (evt, payload) => (listeners[evt] || []).forEach((fn) => { try { fn(payload); } catch (e) { console.error(e); } });

  // ------------------------------------------------------------------ api
  const ERR = {
    network: 'Nu am putut contacta serverul. Verifică conexiunea.', missing_fields: 'Completează câmpurile obligatorii.',
    invalid_category: 'Alege categoria.', invalid_amount: 'Suma nu e validă.', invalid_date: 'Data nu e validă.', invalid_method: 'Alege metoda de plată.',
    invalid_client: 'Completează numele și telefonul clientului.', invalid_location: 'Alege locația.', invalid_status: 'Statusul nu e valid.',
    missing_treatment: 'Completează tratamentul.', invalid_cosmetician: 'Cosmeticiana aleasă nu mai există.', username_taken: 'Acest username există deja.',
    invalid_role: 'Rolul nu e valid.', employee_not_found: 'Angajatul nu mai există.', already_decided: 'Vânzarea a fost deja decisă.',
    forbidden: 'Doar adminul poate face asta.', too_many_goals: 'Maxim 2 obiective per angajat.', invalid_goal: 'Un obiectiv nu e complet.',
    preview_only: 'Ești în previzualizarea contului — aici doar te uiți. Revino la Admin ca să faci modificări.',
    missing_title: 'Completează titlul.', invalid_prices: 'Prețurile nu sunt valide.', offer_not_found: 'Oferta nu mai există.',
  };
  const errText = (e, fallback) => ERR[e && e.code] || fallback || 'Nu am putut salva. Încearcă din nou.';
  async function api(url, body, opts) {
    let r;
    try {
      r = await fetch(url, body === undefined ? { credentials: 'same-origin' } : {
        method: (opts && opts.method) || 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
    } catch (e) { throw Object.assign(new Error('network'), { code: 'network' }); }
    if (r.status === 401) { location.href = '/portal-login'; throw Object.assign(new Error('auth'), { code: 'auth' }); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(j.error || 'failed'), { code: j.error || 'failed', status: r.status });
    return j;
  }

  // ------------------------------------------------------------------ formatting
  const pad = (n) => String(n).padStart(2, '0');
  const lei = (n, dec) => (Math.round(Number(n || 0) * 100) / 100).toLocaleString('ro-RO', { maximumFractionDigits: dec == null ? 0 : dec }) + ' lei';
  const num = (n) => Math.round(Number(n || 0)).toLocaleString('ro-RO');
  // Local-time ISO date (the old portal used UTC, which flips to "tomorrow" after midnight UTC).
  const iso = (d) => { d = d || new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  const today = () => iso(new Date());
  const parse = (s) => new Date(String(s).slice(0, 10) + 'T00:00:00');
  const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
  const monthOf = (s) => String(s || '').slice(0, 7);
  const thisMonth = () => today().slice(0, 7);
  const addMonths = (m, n) => { const [y, mo] = m.split('-').map(Number); const d = new Date(y, mo - 1 + n, 1); return d.getFullYear() + '-' + pad(d.getMonth() + 1); };
  const daysIn = (m) => { const [y, mo] = m.split('-').map(Number); return new Date(y, mo, 0).getDate(); };
  const mondayOf = (s) => { const d = parse(s); const k = (d.getDay() + 6) % 7; d.setDate(d.getDate() - k); return iso(d); };
  const DOW = ['Duminică', 'Luni', 'Marți', 'Miercuri', 'Joi', 'Vineri', 'Sâmbătă'];
  const DOW_S = ['Dum', 'Lun', 'Mar', 'Mie', 'Joi', 'Vin', 'Sâm'];
  const MON = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];
  const MON_S = ['ian', 'feb', 'mar', 'apr', 'mai', 'iun', 'iul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const dateShort = (s) => { const d = parse(s); return d.getDate() + ' ' + MON_S[d.getMonth()]; };
  const dateLong = (s) => { const d = parse(s); return DOW[d.getDay()] + ', ' + d.getDate() + ' ' + MON[d.getMonth()]; };
  const monthLabel = (m) => { const [y, mo] = m.split('-').map(Number); return MON[mo - 1].replace(/^./, (c) => c.toUpperCase()) + ' ' + y; };
  function relDay(s) {
    const diff = Math.round((parse(s) - parse(today())) / 864e5);
    if (diff === 0) return 'Azi';
    if (diff === -1) return 'Ieri';
    if (diff === 1) return 'Mâine';
    return dateLong(s);
  }
  function ago(isoTs) {
    const t = new Date(isoTs).getTime();
    if (!Number.isFinite(t)) return '';
    const d = Date.now() - t;
    if (d < 6e4) return 'chiar acum';
    if (d < 36e5) return 'acum ' + Math.floor(d / 6e4) + ' min';
    if (d < 864e5) return 'acum ' + Math.floor(d / 36e5) + ' h';
    if (d < 2 * 864e5) return 'ieri';
    return 'acum ' + Math.floor(d / 864e5) + ' zile';
  }
  const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
  const initials = (n) => String(n || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  const HUES = ['#4f8fd6', '#2bb3a3', '#c9a227', '#e0835a', '#e05a7a', '#8b6fd0', '#2f9d62', '#d97757', '#6fa8d6'];
  const colorFor = (s) => { let h = 0; for (const ch of String(s)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return HUES[h % HUES.length]; };
  const avatar = (name, size) => '<span class="k-avatar" style="--c:' + colorFor(name) + (size ? ';--s:' + size + 'px' : '') + '">' + esc(initials(name)) + '</span>';
  function intlPhone(p) {
    let d = String(p || '').replace(/\D/g, '');
    if (d.startsWith('00')) d = d.slice(2);
    if (d.startsWith('0')) d = '4' + d;
    else if (d.length === 9 && d.startsWith('7')) d = '40' + d;
    return d;
  }
  const wa = (phone, text) => 'https://wa.me/' + intlPhone(phone) + (text ? '?text=' + encodeURIComponent(text) : '');
  const tel = (phone) => 'tel:' + String(phone || '').replace(/[^\d+]/g, '');

  // ------------------------------------------------------------------ icons (Lucide geometry)
  const P = {
    plus: '<path d="M12 5v14M5 12h14"/>', x: '<path d="M18 6 6 18M6 6l12 12"/>', check: '<path d="M20 6 9 17l-5-5"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>', left: '<path d="m15 18-6-6 6-6"/>', right: '<path d="m9 18 6-6-6-6"/>',
    up: '<path d="m18 15-6-6-6 6"/>', down: '<path d="m6 9 6 6 6-6"/>', arrowUp: '<path d="M7 17 17 7M7 7h10v10"/>', arrowDown: '<path d="M7 7l10 10M17 7v10H7"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>', pen: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    trash: '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
    phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/>',
    chat: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22z"/>', calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>', user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
    userPlus: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/>',
    wallet: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
    card: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>', cash: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/>',
    bank: '<path d="m3 10 9-6 9 6M5 10v9M19 10v9M9 10v9M15 10v9M3 21h18"/>', receipt: '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M16 8H8M16 12H8M13 16H8"/>',
    trend: '<path d="m22 7-8.5 8.5-5-5L2 17"/><path d="M16 7h6v6"/>', target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
    trophy: '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18M4 22h16M10 14.7V17c0 .6-.5 1-1 1.2C7.8 18.8 7 20.2 7 22M14 14.7V17c0 .6.5 1 1 1.2 1.2.6 2 2 2 3.8M18 2H6v7a6 6 0 0 0 12 0z"/>',
    crown: '<path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7zM5 20h14"/>', zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>',
    flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3.3.4 1.1 1.4 2.3 2.5 2.8z"/>',
    sparkles: '<path d="M9.94 15.5A2 2 0 0 0 8.5 14.06l-6.14-1.58a.5.5 0 0 1 0-.96L8.5 9.94A2 2 0 0 0 9.94 8.5l1.58-6.14a.5.5 0 0 1 .96 0L14.06 8.5A2 2 0 0 0 15.5 9.94l6.14 1.58a.5.5 0 0 1 0 .96L15.5 14.06a2 2 0 0 0-1.44 1.44l-1.58 6.14a.5.5 0 0 1-.96 0z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z"/>', sunrise: '<path d="M12 2v8M4.9 10.9l1.4 1.4M2 18h2M20 18h2M17.7 12.3l1.4-1.4M22 22H2M8 6l4-4 4 4M16 18a4 4 0 0 0-8 0"/>',
    listCheck: '<path d="M11 18H3M15 6H3M11 12H3M16 12l2 2 4-4M16 18l2 2 4-4"/>', checkCircle: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
    alert: '<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>', pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
    tag: '<path d="M12.6 2.6A2 2 0 0 0 11.2 2H4a2 2 0 0 0-2 2v7.2a2 2 0 0 0 .6 1.4l8.7 8.7a2.4 2.4 0 0 0 3.4 0l6.6-6.6a2.4 2.4 0 0 0 0-3.4z"/><circle cx="7.5" cy="7.5" r="1"/>',
    star: '<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/>', eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    eyeOff: '<path d="M9.9 4.2A9 9 0 0 1 12 4c6.4 0 10 7 10 7a17 17 0 0 1-2.1 3M6.6 6.6A17 17 0 0 0 2 12s3.6 7 10 7a9 9 0 0 0 5.4-1.6M2 2l20 20M14.1 14.1a3 3 0 1 1-4.2-4.2"/>',
    key: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3"/>', power: '<path d="M18.4 6.6a9 9 0 1 1-12.8 0M12 2v10"/>',
    printer: '<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8" rx="1"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>', copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>', book: '<path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/>',
    gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7M7.5 8a2.5 2.5 0 0 1 0-5C10 3 12 8 12 8s2-5 4.5-5a2.5 2.5 0 0 1 0 5"/>',
    mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M19 10v1a7 7 0 0 1-14 0v-1M12 18v4"/>', layers: '<path d="m12 2 10 5-10 5L2 7z"/><path d="m2 17 10 5 10-5M2 12l10 5 10-5"/>',
    sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>', percent: '<path d="M19 5 5 19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
    facebook: '<path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"/>', grip: '<circle cx="9" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="18" r="1"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>', inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.1z"/>',
    bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0"/>', refresh: '<path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5"/>',
    shield: '<path d="M20 13c0 5-3.5 7.5-7.7 9a1 1 0 0 1-.7 0C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.2-2.7a1.2 1.2 0 0 1 1.6 0C14.5 3.8 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
    filter: '<path d="M22 3H2l8 9.5V19l4 2v-8.5z"/>', more: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
    ban: '<circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/>',
    globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
    video: '<path d="m16 13 5.2 3.5a.5.5 0 0 0 .8-.4V7.9a.5.5 0 0 0-.8-.4L16 11"/><rect x="2" y="6" width="14" height="12" rx="2"/>', undo: '<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-15-6.7L3 13"/>',
  };
  const icon = (name, cls) => '<svg class="k-ic' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (P[name] || '') + '</svg>';

  // ------------------------------------------------------------------ motion
  function tween(from, to, dur, step, done) {
    if (reduceMotion || dur <= 0) { step(to); if (done) done(); return; }
    const t0 = performance.now();
    const f = (now) => {
      const p = Math.min(1, (now - t0) / dur);
      const e = 1 - Math.pow(1 - p, 4);
      step(from + (to - from) * e);
      if (p < 1) requestAnimationFrame(f); else if (done) done();
    };
    requestAnimationFrame(f);
  }
  // Rolls a number element from its last shown value to `to` (first time: from 0).
  function countUp(el, to, format, dur) {
    if (!el) return;
    const fmt = format || num;
    const from = el._kv == null ? 0 : el._kv;
    el._kv = to;
    if (from === to) { el.textContent = fmt(to); return; }
    tween(from, to, dur || 1100, (v) => { el.textContent = fmt(v); });
    // Background tabs pause requestAnimationFrame — make sure the final number always lands.
    setTimeout(() => { if (el._kv === to) el.textContent = fmt(to); }, (dur || 1100) + 200);
  }
  // Animates every [data-count] inside root: data-count="1234" data-fmt="lei|num|pct".
  // data-key="..." remembers the last value across re-renders, so a refresh rolls from the old
  // number to the new one instead of from 0.
  const lastByKey = {};
  function countAll(root) {
    (root || document).querySelectorAll('[data-count]').forEach((el) => {
      const f = el.dataset.fmt === 'lei' ? lei : el.dataset.fmt === 'pct' ? (v) => Math.round(v) + '%' : num;
      const to = Number(el.dataset.count) || 0;
      const key = el.dataset.key;
      if (key && el._kv == null && lastByKey[key] != null) el._kv = lastByKey[key];
      if (key) lastByKey[key] = to;
      countUp(el, to, f);
    });
  }
  // One shared 1s ticker for live clocks / "now" lines / relative times.
  const tickers = new Set();
  const everySecond = (fn) => { tickers.add(fn); return () => tickers.delete(fn); };
  setInterval(() => { if (!document.hidden) tickers.forEach((fn) => { try { fn(new Date()); } catch (e) { /* keep ticking */ } }); }, 1000);

  // ------------------------------------------------------------------ charts (SVG)
  // Smooth curve through the points; control points are clamped to [minY, maxY] so the line never
  // dips below the baseline (or above the top) between two data points.
  function smoothPath(pts, minY, maxY) {
    const cy = (v) => (minY == null ? v : Math.max(minY, Math.min(maxY, v)));
    if (!pts.length) return '';
    if (pts.length === 1) return 'M' + pts[0][0] + ',' + pts[0][1];
    let d = 'M' + pts[0][0].toFixed(1) + ',' + pts[0][1].toFixed(1);
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      const t = 0.18;
      const c1x = p1[0] + (p2[0] - p0[0]) * t, c1y = cy(p1[1] + (p2[1] - p0[1]) * t);
      const c2x = p2[0] - (p3[0] - p1[0]) * t, c2y = cy(p2[1] - (p3[1] - p1[1]) * t);
      d += ' C' + c1x.toFixed(1) + ',' + c1y.toFixed(1) + ' ' + c2x.toFixed(1) + ',' + c2y.toFixed(1) + ' ' + p2[0].toFixed(1) + ',' + p2[1].toFixed(1);
    }
    return d;
  }
  let gid = 0;
  function spark(values, opts) {
    const o = Object.assign({ w: 120, h: 36, color: 'var(--accent)' }, opts || {});
    const max = Math.max(1, ...values), n = values.length;
    const pts = values.map((v, i) => [n === 1 ? o.w / 2 : (i / (n - 1)) * o.w, o.h - 3 - (v / max) * (o.h - 6)]);
    const line = smoothPath(pts, 1, o.h - 1);
    const id = 'ks' + (++gid);
    return '<svg class="k-spark" viewBox="0 0 ' + o.w + ' ' + o.h + '" preserveAspectRatio="none" aria-hidden="true">' +
      '<defs><linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + o.color + '" stop-opacity=".28"/><stop offset="1" stop-color="' + o.color + '" stop-opacity="0"/></linearGradient></defs>' +
      '<path d="' + line + ' L' + o.w + ',' + o.h + ' L0,' + o.h + 'Z" fill="url(#' + id + ')"/>' +
      '<path class="k-draw" d="' + line + '" fill="none" stroke="' + o.color + '" stroke-width="2" stroke-linecap="round" vector-effect="non-scaling-stroke" pathLength="1"/>' +
      (pts.length ? '<circle class="k-spark-dot" cx="' + pts[n - 1][0] + '" cy="' + pts[n - 1][1] + '" r="3" fill="' + o.color + '"/>' : '') + '</svg>';
  }
  // Ring progress (0..100). Animates from 0 via CSS on .k-ring-bar (stroke-dashoffset).
  function ring(pct, opts) {
    const o = Object.assign({ size: 120, stroke: 10, color: 'var(--accent)', track: 'var(--glass-2)', inner: '' }, opts || {});
    const r = (o.size - o.stroke) / 2, c = 2 * Math.PI * r, p = Math.max(0, Math.min(100, pct || 0));
    const id = 'kr' + (++gid);
    return '<div class="k-ring" style="--s:' + o.size + 'px"><svg viewBox="0 0 ' + o.size + ' ' + o.size + '" aria-hidden="true">' +
      '<defs><linearGradient id="' + id + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="' + (o.color2 || o.color) + '"/><stop offset="1" stop-color="' + o.color + '"/></linearGradient></defs>' +
      '<circle cx="' + o.size / 2 + '" cy="' + o.size / 2 + '" r="' + r + '" fill="none" stroke="' + o.track + '" stroke-width="' + o.stroke + '"/>' +
      '<circle class="k-ring-bar" cx="' + o.size / 2 + '" cy="' + o.size / 2 + '" r="' + r + '" fill="none" stroke="url(#' + id + ')" stroke-width="' + o.stroke + '" stroke-linecap="round"' +
      ' stroke-dasharray="' + c.toFixed(1) + '" style="--c:' + c.toFixed(1) + ';--off:' + (c * (1 - p / 100)).toFixed(1) + '" transform="rotate(-90 ' + o.size / 2 + ' ' + o.size / 2 + ')"/>' +
      '</svg><div class="k-ring-inner">' + o.inner + '</div></div>';
  }
  function donut(segs, opts) {
    const o = Object.assign({ size: 140, stroke: 18, inner: '' }, opts || {});
    const total = segs.reduce((s, x) => s + (x.value || 0), 0) || 1;
    const r = (o.size - o.stroke) / 2, c = 2 * Math.PI * r;
    let acc = 0;
    const arcs = segs.filter((s) => s.value > 0).map((s, i) => {
      const len = (s.value / total) * c, gap = segs.length > 1 ? Math.min(3, len / 3) : 0;
      const el = '<circle class="k-donut-seg" cx="' + o.size / 2 + '" cy="' + o.size / 2 + '" r="' + r + '" fill="none" stroke="' + s.color + '" stroke-width="' + o.stroke + '"' +
        ' stroke-dasharray="' + Math.max(0, len - gap).toFixed(1) + ' ' + c.toFixed(1) + '" stroke-dashoffset="' + (-acc).toFixed(1) + '" style="--d:' + (i * 90) + 'ms" transform="rotate(-90 ' + o.size / 2 + ' ' + o.size / 2 + ')"><title>' + esc(s.label) + '</title></circle>';
      acc += len;
      return el;
    }).join('');
    return '<div class="k-ring k-donut" style="--s:' + o.size + 'px"><svg viewBox="0 0 ' + o.size + ' ' + o.size + '" aria-hidden="true">' +
      '<circle cx="' + o.size / 2 + '" cy="' + o.size / 2 + '" r="' + r + '" fill="none" stroke="var(--glass-2)" stroke-width="' + o.stroke + '"/>' + arcs +
      '</svg><div class="k-ring-inner">' + o.inner + '</div></div>';
  }

  // Responsive area/bar chart with hover crosshair + tooltip. Re-renders on resize.
  // cfg: { labels:[], series:[{name, values, color, dashed, kind:'area'|'line'|'bar'}], format(v), tip(i)->html, height, highlight:i }
  function chart(el, cfg) {
    el.classList.add('k-chart');
    const draw = () => {
      const W = Math.max(280, el.clientWidth), H = cfg.height || 240;
      const padL = 44, padR = 12, padT = 14, padB = 26;
      const n = cfg.labels.length;
      const all = cfg.series.flatMap((s) => s.values);
      // Nice axis: 4 gridlines on a 1 / 2 / 2.5 / 5 × 10ⁿ step.
      const rawMax = Math.max(1, ...all) * 1.08;
      const rough = rawMax / 4, mag = Math.pow(10, Math.floor(Math.log10(rough)));
      const yStep = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= rough) || 10 * mag;
      const max = yStep * 4;
      const x = (i) => padL + (n <= 1 ? (W - padL - padR) / 2 : (i / (n - 1)) * (W - padL - padR));
      const bw = (W - padL - padR) / Math.max(1, n);
      const xb = (i) => padL + i * bw;
      const y = (v) => padT + (1 - v / max) * (H - padT - padB);
      let svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" class="k-chart-svg" role="img">';
      svg += '<defs>' + cfg.series.map((s, i) => '<linearGradient id="kc' + i + '_' + (el._kid = el._kid || ++gid) + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + s.color + '" stop-opacity=".32"/><stop offset="1" stop-color="' + s.color + '" stop-opacity="0"/></linearGradient>').join('') + '</defs>';
      for (let g = 0; g <= 4; g++) {
        const v = (max / 4) * g, yy = y(v);
        svg += '<line x1="' + padL + '" x2="' + (W - padR) + '" y1="' + yy + '" y2="' + yy + '" class="k-gridline"/>' +
          '<text x="' + (padL - 8) + '" y="' + (yy + 4) + '" class="k-axis" text-anchor="end">' + (cfg.axis ? cfg.axis(v) : num(v)) + '</text>';
      }
      const step = Math.ceil(n / Math.max(1, Math.floor((W - padL) / 56)));
      cfg.labels.forEach((l, i) => {
        if (i % step && i !== n - 1) return;
        const cx = cfg.series.some((s) => s.kind === 'bar') ? xb(i) + bw / 2 : x(i);
        svg += '<text x="' + cx + '" y="' + (H - 7) + '" class="k-axis" text-anchor="middle">' + esc(l) + '</text>';
      });
      cfg.series.forEach((s, si) => {
        if (s.kind === 'bar') {
          s.values.forEach((v, i) => {
            const h = Math.max(v > 0 ? 2 : 0, (H - padT - padB) - (y(v) - padT));
            const isHi = cfg.highlight === i;
            svg += '<rect class="k-col' + (isHi ? ' is-hi' : '') + '" x="' + (xb(i) + bw * 0.18).toFixed(1) + '" y="' + (H - padB - h).toFixed(1) + '" width="' + (bw * 0.64).toFixed(1) + '" height="' + h.toFixed(1) + '" rx="' + Math.min(5, bw * 0.3).toFixed(1) + '" fill="' + (isHi ? 'var(--fg)' : s.color) + '" style="--d:' + Math.min(i * 14, 600) + 'ms"/>';
          });
          return;
        }
        const pts = s.values.map((v, i) => [x(i), y(v)]);
        const line = smoothPath(pts, padT, H - padB);
        if (s.kind !== 'line') svg += '<path class="k-area" d="' + line + ' L' + x(n - 1) + ',' + (H - padB) + ' L' + x(0) + ',' + (H - padB) + 'Z" fill="url(#kc' + si + '_' + el._kid + ')"/>';
        svg += '<path class="k-draw' + (s.dashed ? ' is-dashed' : '') + '" d="' + line + '" fill="none" stroke="' + s.color + '" stroke-width="' + (s.dashed ? 1.6 : 2.4) + '" stroke-linecap="round" stroke-linejoin="round"' + (s.dashed ? ' stroke-dasharray="4 5"' : ' pathLength="1"') + '/>';
      });
      svg += '<line class="k-cross" x1="0" x2="0" y1="' + padT + '" y2="' + (H - padB) + '"/>' +
        cfg.series.map((s, si) => '<circle class="k-cross-dot" data-s="' + si + '" r="4.5" fill="' + s.color + '"/>').join('') + '</svg>';
      el.innerHTML = svg + '<div class="k-tip"></div>';
      const svgEl = el.querySelector('svg'), tip = el.querySelector('.k-tip');
      const cross = el.querySelector('.k-cross'), dots = el.querySelectorAll('.k-cross-dot');
      const hasBar = cfg.series.some((s) => s.kind === 'bar');
      const move = (ev) => {
        const r = svgEl.getBoundingClientRect();
        const px = (ev.clientX - r.left) * (W / r.width);
        const i = hasBar ? Math.max(0, Math.min(n - 1, Math.floor((px - padL) / bw))) : Math.max(0, Math.min(n - 1, Math.round(((px - padL) / (W - padL - padR)) * (n - 1))));
        const cx = hasBar ? xb(i) + bw / 2 : x(i);
        cross.setAttribute('x1', cx); cross.setAttribute('x2', cx);
        el.classList.add('is-hover');
        dots.forEach((d) => { const s = cfg.series[+d.dataset.s]; d.setAttribute('cx', cx); d.setAttribute('cy', y(s.values[i] || 0)); d.style.display = s.kind === 'bar' ? 'none' : ''; });
        tip.innerHTML = cfg.tip ? cfg.tip(i) : '<b>' + esc(cfg.labels[i]) + '</b>' + cfg.series.map((s) => '<span><i style="background:' + s.color + '"></i>' + esc(s.name) + ': ' + (cfg.format || num)(s.values[i] || 0) + '</span>').join('');
        const tx = (cx / W) * r.width;
        tip.style.left = Math.max(8, Math.min(r.width - tip.offsetWidth - 8, tx - tip.offsetWidth / 2)) + 'px';
      };
      svgEl.addEventListener('pointermove', move);
      svgEl.addEventListener('pointerleave', () => el.classList.remove('is-hover'));
      if (cfg.onClick) svgEl.addEventListener('click', (ev) => {
        const r = svgEl.getBoundingClientRect(); const px = (ev.clientX - r.left) * (W / r.width);
        const i = hasBar ? Math.floor((px - padL) / bw) : Math.round(((px - padL) / (W - padL - padR)) * (n - 1));
        if (i >= 0 && i < n) cfg.onClick(i);
      });
    };
    draw();
    if (!el._kro && 'ResizeObserver' in window) {
      let lastW = el.clientWidth;
      el._kro = new ResizeObserver(() => { if (Math.abs(el.clientWidth - lastW) > 4) { lastW = el.clientWidth; el.classList.add('no-anim'); el._kdraw(); } });
      el._kro.observe(el);
    }
    el._kdraw = draw;
  }

  // ------------------------------------------------------------------ drawer
  let drawerRoot = null, current = null;
  function drawer(opts) {
    if (!drawerRoot) {
      drawerRoot = document.createElement('div');
      drawerRoot.className = 'k-drawer-root';
      drawerRoot.innerHTML = '<div class="k-drawer-backdrop"></div><aside class="k-drawer" role="dialog" aria-modal="true"></aside>';
      document.body.appendChild(drawerRoot);
      drawerRoot.querySelector('.k-drawer-backdrop').addEventListener('click', () => current && current.close());
      document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape' || !current) return;
        if (document.querySelector('.c360-dialog-root, .c360-palette-root, .c360-select.is-open')) return;
        e.preventDefault(); current.close();
      });
    }
    if (current) current.close(true);
    const aside = drawerRoot.querySelector('.k-drawer');
    aside.style.setProperty('--w', (opts.width || 520) + 'px');
    const handle = {
      el: aside,
      set(o) {
        Object.assign(opts, o);
        aside.innerHTML =
          '<header class="k-dhead">' + (opts.lead || (opts.icon ? '<span class="k-dicon">' + icon(opts.icon) + '</span>' : '')) +
          '<div class="k-dtitle"><h3>' + esc(opts.title || '') + '</h3>' + (opts.subtitle ? '<p>' + opts.subtitle + '</p>' : '') + '</div>' +
          (opts.actions || '') + '<button type="button" class="k-icon-btn" data-k-close aria-label="Închide (Esc)">' + icon('x') + '</button></header>' +
          '<div class="k-dbody">' + (opts.body || '') + '</div>' + (opts.footer ? '<footer class="k-dfoot">' + opts.footer + '</footer>' : '');
        aside.querySelector('[data-k-close]').addEventListener('click', () => handle.close());
        handle.body = aside.querySelector('.k-dbody');
        if (opts.onMount) opts.onMount(aside, handle);
        return handle;
      },
      close(silent) {
        if (current !== handle) return;
        current = null;
        if (!silent) { drawerRoot.classList.remove('is-open'); document.documentElement.classList.remove('c360-noscroll'); }
        if (opts.onClose) opts.onClose();
      },
    };
    current = handle;
    handle.set({});
    aside.classList.remove('is-swap'); void aside.offsetWidth; aside.classList.add('is-swap');
    document.documentElement.classList.add('c360-noscroll');
    requestAnimationFrame(() => drawerRoot.classList.add('is-open'));
    setTimeout(() => { const f = aside.querySelector('[autofocus], .k-dbody input:not([type=hidden]):not([readonly]), .k-dbody textarea'); if (f && opts.focus !== false) f.focus({ preventScroll: true }); }, 280);
    return handle;
  }
  const field = (label, control, cls, hint) => '<label class="k-field' + (cls ? ' ' + cls : '') + '"><span>' + label + '</span>' + control + (hint ? '<small>' + hint + '</small>' : '') + '</label>';
  function formValues(form) {
    const o = {};
    form.querySelectorAll('input[name], select[name], textarea[name]').forEach((f) => {
      if (f.type === 'checkbox') o[f.name] = f.checked;
      else if (f.type === 'radio') { if (f.checked) o[f.name] = f.value; }
      else o[f.name] = typeof f.value === 'string' ? f.value.trim() : f.value;
    });
    return o;
  }
  async function busy(btn, fn) {
    if (btn) { btn.disabled = true; btn.classList.add('is-busy'); }
    try { return await fn(); } finally { if (btn && btn.isConnected) { btn.disabled = false; btn.classList.remove('is-busy'); } }
  }
  const options = (pairs, selected) => pairs.map(([v, l]) => '<option value="' + esc(v) + '"' + (String(v) === String(selected) ? ' selected' : '') + '>' + esc(l) + '</option>').join('');
  // Segmented control bound to a hidden input: K.seg('method', [['card','Card'],...], 'card')
  const seg = (name, pairs, selected, cls) => '<div class="k-seg' + (cls ? ' ' + cls : '') + '" data-k-seg="' + name + '">' +
    pairs.map(([v, l, ic]) => '<button type="button" data-v="' + esc(v) + '" class="' + (String(v) === String(selected) ? 'is-on' : '') + '">' + (ic ? icon(ic) : '') + '<span>' + esc(l) + '</span></button>').join('') +
    '<input type="hidden" name="' + name + '" value="' + esc(selected) + '"></div>';
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-k-seg] > button');
    if (!b) return;
    const segEl = b.parentElement;
    segEl.querySelectorAll('button').forEach((x) => x.classList.toggle('is-on', x === b));
    const input = segEl.querySelector('input[type=hidden]');
    input.value = b.dataset.v;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  const empty = (ic, title, text, action) => '<div class="k-empty"><span class="k-empty-ic">' + icon(ic) + '</span><b>' + esc(title) + '</b>' + (text ? '<p>' + text + '</p>' : '') + (action || '') + '</div>';
  const toggle = (name, checked, label) => '<label class="k-switch"><input type="checkbox" name="' + name + '"' + (checked ? ' checked' : '') + '><i></i>' + (label ? '<span>' + label + '</span>' : '') + '</label>';

  // ------------------------------------------------------------------ client autocomplete
  // Wires a name input (+ optional phone input) to /api/portal-clients. Returns {id(), reset()}.
  function clientPicker(input, phoneInput, onSelect) {
    const wrap = document.createElement('div');
    wrap.className = 'k-ac';
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);
    const list = document.createElement('div');
    list.className = 'k-ac-list';
    wrap.appendChild(list);
    let id = '', t = 0, items = [], active = -1;
    const hide = () => { list.classList.remove('is-open'); active = -1; };
    const paint = () => {
      list.innerHTML = items.length ? items.map((c, i) => '<button type="button" class="k-ac-item' + (i === active ? ' is-active' : '') + '" data-i="' + i + '">' + avatar(c.name, 28) +
        '<span><b>' + esc(c.name || '(fără nume)') + '</b><small>' + esc(c.phone || '') + '</small></span></button>').join('')
        : '<div class="k-ac-empty">' + icon('userPlus') + 'Client nou — se salvează automat</div>';
      list.classList.add('is-open');
    };
    const pick = (c) => { input.value = c.name || ''; id = c.id; if (phoneInput) phoneInput.value = c.phone || ''; hide(); if (onSelect) onSelect(c); };
    const search = async (q) => { try { const j = await api('/api/portal-clients?q=' + encodeURIComponent(q)); items = (j.clients || []).slice(0, 7); active = -1; if (document.activeElement === input) paint(); } catch (e) { /* convenience only */ } };
    input.setAttribute('autocomplete', 'off');
    input.addEventListener('input', () => { id = ''; clearTimeout(t); t = setTimeout(() => search(input.value.trim()), 200); });
    input.addEventListener('focus', () => { if (!input.value.trim()) search(''); });
    input.addEventListener('blur', () => setTimeout(hide, 160));
    input.addEventListener('keydown', (e) => {
      if (!list.classList.contains('is-open') || !items.length) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); active = (active + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length; paint(); }
      else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); pick(items[active]); }
      else if (e.key === 'Escape') { e.stopPropagation(); hide(); }
    });
    list.addEventListener('mousedown', (e) => e.preventDefault());
    list.addEventListener('click', (e) => { const b = e.target.closest('[data-i]'); if (b) pick(items[+b.dataset.i]); });
    return { id: () => id, reset: () => { id = ''; hide(); } };
  }

  // ------------------------------------------------------------------ sections + nav
  const sections = {};
  let data = null;
  function section(id, def) { sections[id] = Object.assign({ mounted: false }, def); if (data && def.data) def.data(data); }
  function show(id) {
    const s = sections[id];
    if (!s) return;
    const panel = document.getElementById('panel-' + id);
    if (!s.mounted && s.mount && panel) { s.mount(panel); s.mounted = true; if (data && s.data) s.data(data); }
    if (s.show) s.show(panel);
    requestAnimationFrame(() => countAll(panel));
  }
  function setData(d) {
    data = d;
    emit('data', d);
    Object.keys(sections).forEach((id) => { const s = sections[id]; if (s.data) { try { s.data(d); } catch (e) { console.error(e); } } });
  }
  function badge(tab, n, tone) {
    const b = document.querySelector('#tabsNav button[data-tab="' + tab + '"]');
    if (!b) return;
    let el = b.querySelector('.k-nav-badge');
    if (!n) { if (el) el.remove(); return; }
    if (!el) { el = document.createElement('b'); el.className = 'k-nav-badge'; b.appendChild(el); }
    el.classList.toggle('is-hot', tone === 'hot');
    if (el.textContent !== String(n)) { el.textContent = n > 99 ? '99+' : n; el.classList.remove('is-pop'); void el.offsetWidth; el.classList.add('is-pop'); }
  }
  const go = (tab) => { const b = document.querySelector('#tabsNav button[data-tab="' + tab + '"]'); if (b) b.click(); };
  const isActive = (id) => { const p = document.getElementById('panel-' + id); return !!(p && p.classList.contains('active')); };

  // CSV download (Excel-friendly: BOM + semicolons)
  function csv(filename, rows) {
    const text = '﻿' + rows.map((r) => r.map((c) => { const s = String(c == null ? '' : c); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(';')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
    a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  async function copy(text) {
    try { await navigator.clipboard.writeText(text); ui().toast('Copiat în clipboard.', 'success'); }
    catch (e) { ui().toast('Nu am putut copia — selectează textul manual.', 'error'); }
  }
  // Pipeline leads, shared by the dashboard / nav badges (15s cache, one request in flight).
  let leadsCache = null, leadsAt = 0, leadsP = null;
  function leads(force) {
    if (!force && leadsCache && Date.now() - leadsAt < 15000) return Promise.resolve(leadsCache);
    if (leadsP) return leadsP;
    leadsP = api('/api/portal-leads', { action: 'list' })
      .then((j) => { leadsCache = j; leadsAt = Date.now(); leadsP = null; emit('leads', j); return j; })
      .catch((e) => { leadsP = null; throw e; });
    return leadsP;
  }
  const typing = (el) => !!(el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable));

  window.K = {
    on, emit, api, errText, ui, esc, norm, reduceMotion,
    lei, num, pad, iso, today, parse, addDays, monthOf, thisMonth, addMonths, daysIn, mondayOf, DOW, DOW_S, MON, MON_S,
    dateShort, dateLong, monthLabel, relDay, ago, plural, initials, colorFor, avatar, wa, tel, intlPhone,
    icon, P, tween, countUp, countAll, everySecond, spark, ring, donut, chart,
    drawer, field, formValues, busy, options, seg, empty, toggle, clientPicker,
    section, show, setData, badge, go, isActive, csv, copy, typing, leads,
    get data() { return data; },
    get drawerOpen() { return !!current; },
  };
})();
