// Centrul360 portal, follow-ups (the owner, 16.11), for the manager (her clinics) and the owner (both), never the
// cosmeticians or reception (the API checks it: api/portal-followups.js).
//   Ore libere   the next 7 days: each cosmetician's free hours (her shift minus her bookings), and next to them who to
//                call to fill them (packages started, no-shows and cancellations not booked again, leads not booked).
//                Tap an hour, then „Programează” on a client: the Calendar's own form opens on that hour.
//   Pachete      clients with sessions left and nothing in the calendar: call, WhatsApp, book, or „Rezolvat” with a
//                reason (Nu mai vrea, Revine ea, Amânat până la o dată, Altul), undone from „Rezolvate”
//   De resunat   who didn't answer: the calls in a row, the last one, the next try (in 2 hours, the next day, in 3 days,
//                then stop); „Nu răspunde” is one tap
//   Discuția lunară  the 1:1 sheet of a cosmetician (Manager → Echipa): the month's numbers, the month before, the notes
// Opened from Calendar („Ore libere”), Manager → Cifre (under each clinic), Manager → Echipa, and the morning
// notifications (#programari/orelibere, #programari/maine, #pipeline/coada).
(function () {
  'use strict';
  const K = window.K;
  if (!K) return;
  const { esc, icon } = K;
  const API = '/api/portal-followups';
  const S = { tab: 'ore', city: '', day: '', slot: null, free: null, pk: null, rc: null, showResolved: false, d: null, reopen: 0 };
  const can = () => !!(K.canManage && K.canManage());
  const ALL = ['Timișoara', 'Arad'];
  const CL = () => (K.data && Array.isArray(K.data.manages) && K.data.manages.length && !K.data.isAdmin ? K.data.manages : ALL);
  const KIND = { pachet: ['Pachet început', 'is-accent'], noshow: ['Nu a venit', 'is-warn'], anulata: ['A anulat', ''], lead: ['Lead', 'is-info'], client: ['Clientă', ''] };
  const ERR = { invalid_reason: 'Alege motivul.', invalid_until: 'Alege o dată după azi.', missing_note: 'Scrie pe scurt de ce.', not_found: 'Nu mai e pe listă.', forbidden: 'Nu ai acces aici.' };
  const errText = (e) => ERR[e && e.code] || K.errText(e);

  // ------------------------------------------------------------------ small helpers
  const RO_T = new Intl.DateTimeFormat('ro-RO', { timeZone: 'Europe/Bucharest', hour: '2-digit', minute: '2-digit' });
  const RO_D = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest' });
  const roDay = (iso) => { try { return RO_D.format(new Date(iso)); } catch (e) { return ''; } };
  const dayName = (d) => { const t = K.today(); return d === t ? 'Azi' : d === K.addDays(t, 1) ? 'Mâine' : K.DOW_S[K.parse(d).getDay()] + ' ' + K.parse(d).getDate(); };
  function when(iso) {
    if (!iso || !Number.isFinite(Date.parse(iso))) return '';
    const d = roDay(iso), t = K.today();
    const rel = d === t ? 'azi' : d === K.addDays(t, 1) ? 'mâine' : d === K.addDays(t, -1) ? 'ieri' : K.DOW_S[K.parse(d).getDay()].toLowerCase() + ' ' + K.dateShort(d);
    return rel + ', ' + RO_T.format(new Date(iso));
  }
  const hrs = (m) => { const h = Math.floor(m / 60), r = m % 60; return h ? h + ' h' + (r ? ' ' + r : '') : r + ' min'; };
  const short = (c) => (c === 'Arad' ? 'AR' : 'TM');
  const api = (action, body) => K.api(API, Object.assign({ action }, body || {}));
  const skel = (h) => '<div class="k-skel" style="height:' + (h || 160) + 'px"></div>';
  const tag = (kind) => { const k = KIND[kind] || KIND.client; return '<span class="k-tag ' + k[1] + '">' + esc(k[0]) + '</span>'; };
  const callBtns = (x) => (x.phone ? '<a class="k-icon-btn fu-ic" href="' + esc(K.tel(x.phone)) + '" title="Sună" aria-label="Sună">' + icon('phone') + '</a>' +
    '<a class="k-icon-btn fu-ic is-wa" href="' + esc(K.wa(x.phone)) + '" target="_blank" rel="noopener" title="WhatsApp" aria-label="WhatsApp">' + icon('chat') + '</a>'
    : '');
  const tries = (x) => (x.stopped ? '<span class="fu-try is-stop">' + icon('ban') + 'Nu răspunde, ' + K.plural(x.misses || 0, 'apel', 'apeluri') + '</span>'
    : x.misses ? '<span class="fu-try">' + icon('clock') + K.plural(x.misses, 'apel', 'apeluri') + ' fără răspuns' + (x.next ? ' · reîncerci ' + esc(when(x.next)) : '') + '</span>' : '');
  function why(x) {
    if (x.kind === 'pachet' && !x.what) return esc(x.treatment || 'Pachet început');
    if ((x.kind === 'noshow' || x.kind === 'anulata') && !x.date) return esc(x.treatment || '');
    // short (16.11): the tag already says „Pachet început”; the generic name of an unnamed package isn't repeated
    if (x.kind === 'pachet') return (x.what && x.what !== 'Pachet sau ședințe cumpărate în plus' ? esc(x.what) + ' · ' : '') + (x.left != null ? K.plural(x.left, 'ședință rămasă', 'ședințe rămase') + ' din ' + x.total : 'din ' + esc(K.dateShort(x.boughtOn)) + ', ' + (x.done ? K.plural(x.done, 'ședință', 'ședințe') + ' de atunci' : 'nicio ședință')) +
      (x.lastVisit && x.lastVisit !== x.boughtOn ? ' · ultima vizită ' + esc(K.dateShort(x.lastVisit)) : '') + (x.owe > 0 ? ' · rest de plată ' + K.lei(x.owe) : '');
    if (x.kind === 'noshow') return 'Nu a venit ' + esc(K.relDay(x.date).toLowerCase()) + (x.treatment ? ' · ' + esc(x.treatment) : '');
    if (x.kind === 'anulata') return 'A anulat ' + (x.treatment ? esc(x.treatment) + ', ' : '') + esc(K.relDay(x.date).toLowerCase());
    if (x.kind === 'lead') return (x.never ? '<b class="fu-hot">Nesunată</b> · ' : '') + esc(x.interest || 'Lead nou') + ' · a intrat ' + esc(K.ago(x.createdAt));
    return esc(x.treatment || '');
  }

  // ------------------------------------------------------------------ the sheet (a drawer over the page)
  function open(tab, opts) {
    if (!can()) return;
    const o = opts || {};
    if (tab) S.tab = tab;
    if (o.city && CL().includes(o.city)) S.city = o.city;
    if (!S.city || (S.city !== 'all' && !CL().includes(S.city))) S.city = CL().includes(K.data && K.data.me && K.data.me.location) ? K.data.me.location : CL()[0];
    S.d = K.drawer({
      title: 'Ore libere', icon: 'sunrise', width: 860, subtitle: esc(CL().join(' și ')),
      body: '<div class="fu" data-fu></div>',
      onMount(el) { el.addEventListener('click', onClick); },
      onClose() { S.d = null; },
    });
    paint(true);
  }
  function bar() {
    const n = (v) => (v ? '<b class="fu-n">' + v + '</b>' : '');
    const pkN = S.pk ? S.pk.items.length : 0, rcN = S.rc ? S.rc.items.filter((x) => !x.stopped && (!x.next || Date.parse(x.next) <= Date.now())).length : 0;
    const cities = S.tab === 'ore' ? CL() : CL().length > 1 ? ['all'].concat(CL()) : CL();
    if (S.tab === 'ore' && S.city === 'all') S.city = CL()[0];
    return '<div class="fu-bar"><div class="k-seg fu-tabs" role="tablist">' + [['ore', 'Ore libere', 'calendar'], ['pachete', 'Pachete', 'gift'], ['resunat', 'De resunat', 'phone']].map(([v, l, ic]) =>
      '<button type="button" data-fu-tab="' + v + '" class="' + (S.tab === v ? 'is-on' : '') + '">' + icon(ic) + '<span>' + l + '</span>' + (v === 'pachete' ? n(pkN) : v === 'resunat' ? n(rcN) : '') + '</button>').join('') + '</div>' +
      (cities.length > 1 ? '<div class="k-seg fu-city">' + cities.map((c) => '<button type="button" data-fu-city="' + esc(c) + '" class="' + (S.city === c ? 'is-on' : '') + '">' + esc(c === 'all' ? 'Ambele' : c) + '</button>').join('') + '</div>' : '') + '</div>';
  }
  const host = () => S.d && S.d.body && S.d.body.querySelector('[data-fu]');
  async function paint(fetch) {
    const el = host();
    if (!el) return;
    const body = () => (S.tab === 'ore' ? oreHtml() : S.tab === 'pachete' ? pkHtml() : rcHtml());
    el.innerHTML = bar() + '<div class="fu-body">' + (have() ? body() : skel(320)) + '</div>';
    if (!fetch && have()) return;
    try {
      const [free, pk, rc] = await Promise.all([S.tab === 'ore' || !S.free ? api('free') : S.free, api('packages'), api('recontact')]);
      S.free = free; S.pk = pk; S.rc = rc;
      fetchCounts(true);
    } catch (e) {
      if (!have()) { el.querySelector('.fu-body').innerHTML = K.empty('alert', 'Nu am putut încărca', 'Verifică conexiunea și reîncearcă.', '<button type="button" class="k-btn is-primary" data-fu-retry>Reîncearcă</button>'); return; }
    }
    if (host() === el) el.innerHTML = bar() + '<div class="fu-body">' + body() + '</div>';
  }
  const have = () => (S.tab === 'ore' ? !!S.free : S.tab === 'pachete' ? !!S.pk : !!S.rc);
  const inCity = (x) => S.city === 'all' || x.location === S.city;

  // ------------------------------------------------------------------ Ore libere
  function oreHtml() {
    const c = S.free && S.free.cities[S.city];
    if (!c) return K.empty('calendar', 'Nimic de arătat', '');
    if (!S.day || !c.days.some((d) => d.date === S.day)) S.day = (c.days.find((d) => d.freeMin > 0) || c.days[0]).date;
    const day = c.days.find((d) => d.date === S.day);
    const chips = '<div class="fu-days">' + c.days.map((d) => '<button type="button" class="fu-day' + (d.date === S.day ? ' is-on' : '') + (d.closed ? ' is-closed' : '') + '" data-fu-day="' + d.date + '"><span>' + esc(dayName(d.date)) + '</span><b>' + (d.closed ? 'închis' : d.freeMin ? hrs(d.freeMin) : 'plin') + '</b></button>').join('') + '</div>';
    const people = day.closed ? K.empty('moon', 'Clinica e închisă în ziua asta', '')
      : !day.people.length ? K.empty('users', 'Nicio cosmeticiană la lucru', 'Programul se pune în Calendar → Program echipă.')
      : '<div class="fu-people">' + day.people.map((p) => '<div class="fu-person"><div class="fu-person-h">' + (p.id ? K.avatar(p.name, 32) : '') + '<span class="fu-pn"><b>' + esc(p.name || S.city) + '</b><small>' + esc(p.from) + ' - ' + esc(p.to) + '</small></span>' +
          '<span class="fu-free ' + (p.freeMin ? '' : 'is-full') + '">' + (p.freeMin ? (p.freeMin === 60 ? '1 oră liberă' : hrs(p.freeMin) + ' libere') : 'plin') + '</span></div>' +
          (p.free.length ? '<div class="fu-wins">' + p.free.map((w) => { const on = S.slot && S.slot.date === day.date && S.slot.time === w.from && S.slot.emp === p.id && S.slot.city === S.city;
            return '<button type="button" class="fu-win' + (on ? ' is-on' : '') + '" data-fu-slot="' + esc(w.from) + '" data-fu-to="' + esc(w.to) + '" data-fu-emp="' + esc(p.id) + '" data-fu-name="' + esc(p.name) + '"><b>' + esc(w.from) + ' - ' + esc(w.to) + '</b><small>' + hrs(w.min) + '</small></button>'; }).join('') + '</div>'
            : '<p class="k-muted fu-pad">Toată tura e programată.</p>') + '</div>').join('') + '</div>';
    const pick = S.slot && S.slot.city === S.city
      ? '<div class="fu-picked">' + icon('check') + '<span>Programezi <b>' + esc(dayName(S.slot.date).toLowerCase()) + ', ' + esc(S.slot.time) + '</b>' + (S.slot.name ? ' cu ' + esc(S.slot.name) : '') + '. Alege clienta de mai jos.</span><button type="button" class="k-icon-btn" data-fu-unpick aria-label="Renunță">' + icon('x') + '</button></div>'
      : '<p class="fu-hint">' + icon('info') + 'Atinge o oră liberă, apoi „Programează” la clienta pe care o suni.</p>';
    return '<p class="fu-sum">' + icon('sunrise') + '<span>În următoarele 7 zile, ' + esc(S.city) + ': <b>' + hrs(c.freeMin) + ' libere</b>' + (c.team ? '' : ' (după orele clinicii: programul cosmeticienelor nu e pus)') + '</span></p>' +
      chips + people + '<h4 class="fu-h">' + icon('phone') + 'Pe cine suni' + (c.calls.length ? '<span class="k-muted">' + c.calls.length + '</span>' : '') + '</h4>' + pick +
      (c.calls.length ? '<div class="fu-list">' + c.calls.map((x) => row(x, 'ore')).join('') + '</div>' : K.empty('checkCircle', 'Nimeni de sunat acum', 'Pachetele, cele care n-au venit și leadurile sunt toate programate.'));
  }
  function row(x, where) {
    const at = where === 'ore' && S.slot && S.slot.city === x.location;
    const book = '<button type="button" class="k-btn is-sm ' + (at ? 'is-accent' : 'is-outline') + '" data-fu-book="' + esc(x.key) + '">' + icon('calendar') + (at ? 'La ' + esc(S.slot.time) : 'Programează') + '</button>';
    const no = !x.phone ? '' : x.stopped ? '<button type="button" class="k-btn is-sm is-ghost" data-fu-try="reset" data-fu-key="' + esc(x.key) + '">' + icon('refresh') + 'Mai încearcă</button>'
      : '<button type="button" class="k-btn is-sm is-ghost" data-fu-try="nu_raspunde" data-fu-key="' + esc(x.key) + '">' + icon('phone') + 'Nu răspunde</button>';
    const ans = where === 'resunat' && !x.stopped ? '<button type="button" class="k-btn is-sm is-ghost" data-fu-try="raspuns" data-fu-key="' + esc(x.key) + '">' + icon('check') + 'A răspuns</button>' : '';
    const res = where === 'pachete' ? '<button type="button" class="k-btn is-sm is-outline" data-fu-resolve="' + esc(x.key) + '">' + icon('checkCircle') + 'Rezolvat</button>' : '';
    return '<article class="fu-row' + (x.stopped ? ' is-stop' : '') + '">' + K.avatar(x.name, 36) +
      '<div class="fu-main"><div class="fu-top"><b>' + esc(x.name) + '</b>' + tag(x.kind) + (S.city === 'all' ? '<span class="k-tag">' + short(x.location) + '</span>' : '') + (x.phone ? '' : '<span class="k-tag">fără telefon</span>') + '</div>' +
        '<div class="fu-why">' + why(x) + '</div>' + tries(x) + (x.snoozedUntil ? '<span class="fu-try">' + icon('clock') + 'Amânat până ' + esc(K.dateShort(x.snoozedUntil)) + '</span>' : '') + '</div>' +
      '<div class="fu-acts">' + callBtns(x) + (x.stopped && where !== 'resunat' ? '' : no) + ans + (x.stopped && where === 'resunat' ? '' : book) + res + '</div></article>';
  }

  // ------------------------------------------------------------------ Pachete
  function pkHtml() {
    const items = S.pk.items.filter(inCity), done = S.pk.resolved.filter(inCity);
    return '<p class="fu-sum">' + icon('gift') + '<span>Clientele care au început un pachet (sau au plătit ședințe pentru altă dată) și nu au nimic în calendar. O programare nouă le scoate singură de aici.</span></p>' +
      (items.length ? '<div class="fu-list">' + items.map((x) => row(x, 'pachete')).join('') + '</div>' : K.empty('checkCircle', 'Toate sunt programate', 'Nicio clientă cu ședințe rămase fără o programare.')) +
      (done.length ? '<button type="button" class="fu-more" data-fu-showres>' + icon(S.showResolved ? 'up' : 'down') + 'Rezolvate (' + done.length + ')</button>' +
        (S.showResolved ? '<div class="fu-list is-done">' + done.map((x) => '<article class="fu-row is-done">' + K.avatar(x.name, 32) + '<div class="fu-main"><div class="fu-top"><b>' + esc(x.name) + '</b><span class="k-tag">' + esc(x.resolved.label) +
          (x.resolved.until ? ' până ' + esc(K.dateShort(x.resolved.until)) : '') + '</span>' + (S.city === 'all' ? '<span class="k-tag">' + short(x.location) + '</span>' : '') + '</div><div class="fu-why">' + esc(x.what) + (x.resolved.note ? ' · „' + esc(x.resolved.note) + '”' : '') + '</div>' +
          '<span class="fu-try">' + esc(x.resolved.byName || '') + ', ' + esc(K.ago(x.resolved.at)) + '</span></div><div class="fu-acts"><button type="button" class="k-btn is-sm is-ghost" data-fu-undo="' + esc(x.key) + '">' + icon('undo') + 'Anulează</button></div></article>').join('') + '</div>' : '') : '');
  }
  async function resolve(key) {
    const x = S.pk.items.find((y) => y.key === key);
    if (!x) return;
    const reason = await K.ui().prompt({ title: 'Rezolvat', message: x.name + ' iese de pe listă. De ce?', label: 'Motiv', confirmText: 'Mai departe',
      options: [['nu_mai_vrea', 'Nu mai vrea'], ['revine_ea', 'Revine ea'], ['amanat', 'Amânat, până la o dată'], ['altul', 'Altul']], value: 'nu_mai_vrea' });
    if (reason == null) return;
    let until = '', note = '';
    if (reason === 'amanat') { until = await K.ui().prompt({ title: 'Până când?', message: 'Revine pe listă în ziua aleasă.', type: 'date', value: K.addDays(K.today(), 14), confirmText: 'Rezolvat' }); if (!until) return; }
    if (reason === 'altul') { note = await K.ui().prompt({ title: 'Ce s-a întâmplat?', label: 'Pe scurt', confirmText: 'Rezolvat' }); if (note == null) return; }
    try {
      await api('resolve', { key, reason, until, note });
      K.ui().toast('Rezolvat. O găsești la „Rezolvate”.', 'success');
      paint(true);
    } catch (e) { K.ui().toast(errText(e), 'error'); }
  }

  // ------------------------------------------------------------------ De resunat
  function rcHtml() {
    const items = S.rc.items.filter(inCity);
    const now = Date.now(), t = K.today();
    const grp = (x) => (x.stopped ? 3 : !x.next || Date.parse(x.next) <= now ? 0 : roDay(x.next) === t ? 1 : 2);
    const names = ['De sunat acum', 'Azi, mai târziu', 'Mai târziu', 'Nu răspund (oprit după 4 apeluri)'];
    const out = [0, 1, 2, 3].map((g) => { const xs = items.filter((x) => grp(x) === g); return xs.length ? '<h4 class="fu-h">' + esc(names[g]) + '<span class="k-muted">' + xs.length + '</span></h4><div class="fu-list">' + xs.map((x) => row(x, 'resunat')).join('') + '</div>' : ''; }).join('');
    return '<p class="fu-sum">' + icon('phone') + '<span>Cine n-a răspuns: după primul apel reîncerci în 2 ore, apoi a doua zi, apoi peste 3 zile; după al patrulea apel fără răspuns se oprește.</span></p>' +
      (out || K.empty('checkCircle', 'Nimeni de resunat', 'Când o clientă sau un lead nu răspunde, apasă „Nu răspunde” și apare aici la ora potrivită.'));
  }
  async function attempt(key, outcome, btn) {
    const all = [].concat(S.rc ? S.rc.items : [], S.pk ? S.pk.items : [], S.free ? [].concat(...Object.values(S.free.cities).map((c) => c.calls)) : []);
    const x = all.find((y) => y.key === key) || {};
    // a lead that answered: its own sheet in the Pipeline, to write how it went
    if (outcome === 'raspuns' && x.kind === 'lead' && x.leadId && window.C360Pipeline && window.C360Pipeline.show) { if (S.d) S.d.close(); window.C360Pipeline.show(x.leadId, { section: 'log' }); return; }
    await K.busy(btn, async () => {
      try {
        const r = await api('attempt', { key: x.kind === 'lead' ? key : 'ct:' + (x.ck || key.replace(/^ct:/, '')), outcome });
        K.ui().toast(outcome === 'raspuns' ? 'Notat, a răspuns.' : outcome === 'reset' ? 'Mai încercăm' + (r.next ? ', ' + when(r.next) : '') + '.' : r.stopped ? 'Notat. Al patrulea apel fără răspuns: nu mai sunăm.' : 'Notat. Reîncerci ' + when(r.next) + '.', 'success');
        paint(true);
      } catch (e) { K.ui().toast(errText(e), 'error'); }
    });
  }

  // ------------------------------------------------------------------ booking (the Calendar's own form)
  function book(key) {
    const all = [].concat(S.free ? [].concat(...Object.values(S.free.cities).map((c) => c.calls)) : [], S.pk ? S.pk.items : [], S.rc ? S.rc.items : []);
    const x = all.find((y) => y.key === key);
    if (!x) return;
    const slot = S.tab === 'ore' && S.slot && S.slot.city === x.location ? S.slot : null;
    const pre = { clientName: x.name, clientPhone: x.phone || '', location: x.location, treatment: x.treatment || x.interest || '', leadId: x.leadId || '' };
    if (slot) Object.assign(pre, { date: slot.date, time: slot.time, cosmeticianId: slot.emp || '' });
    else if (S.tab === 'ore' && S.day) pre.date = S.day;
    S.reopen = Date.now();
    K.emit('calendar:new', pre);
  }
  // booked from here: back to the same list, fresh
  K.on('appointment:created', () => {
    if (!S.reopen || Date.now() - S.reopen > 15 * 60e3) return;
    S.reopen = 0; S.slot = null; S.free = null;
    setTimeout(() => open(S.tab), 450);
  });

  function onClick(e) {
    const t = e.target;
    const b = (sel) => t.closest(sel);
    let x;
    if ((x = b('[data-fu-tab]'))) { S.tab = x.dataset.fuTab; return paint(false); }
    if ((x = b('[data-fu-city]'))) { S.city = x.dataset.fuCity; S.day = ''; return paint(false); }
    if ((x = b('[data-fu-day]'))) { S.day = x.dataset.fuDay; return paint(false); }
    if ((x = b('[data-fu-slot]'))) { const on = S.slot && S.slot.date === S.day && S.slot.time === x.dataset.fuSlot && S.slot.emp === x.dataset.fuEmp; S.slot = on ? null : { date: S.day, time: x.dataset.fuSlot, emp: x.dataset.fuEmp, name: x.dataset.fuName, city: S.city }; paint(false); if (!on) { const l = host() && host().querySelector('.fu-picked'); if (l) l.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } return; }
    if (b('[data-fu-unpick]')) { S.slot = null; return paint(false); }
    if ((x = b('[data-fu-book]'))) return book(x.dataset.fuBook);
    if ((x = b('[data-fu-try]'))) return attempt(x.dataset.fuKey, x.dataset.fuTry, x);
    if ((x = b('[data-fu-resolve]'))) return resolve(x.dataset.fuResolve);
    if ((x = b('[data-fu-undo]'))) return K.busy(x, async () => { try { await api('unresolve', { key: x.dataset.fuUndo }); K.ui().toast('E din nou pe listă.', 'success'); paint(true); } catch (err) { K.ui().toast(errText(err), 'error'); } });
    if (b('[data-fu-showres]')) { S.showResolved = !S.showResolved; return paint(false); }
    if (b('[data-fu-retry]')) return paint(true);
  }

  // ------------------------------------------------------------------ the monthly 1:1 (Manager → Echipa)
  const sheetS = { emp: '', month: '', data: null };
  async function openSheet(empId, month) {
    sheetS.emp = empId; sheetS.month = month || K.thisMonth();
    const d = K.drawer({ title: 'Discuția lunară', icon: 'users', width: 640, body: skel(360),
      footer: '<button type="button" class="k-btn is-ghost" data-s-print>' + icon('printer') + 'Printează</button><button type="button" class="k-btn is-ghost" data-s-share>' + icon('share') + 'Trimite</button><span class="k-grow"></span><button type="button" class="k-btn is-primary" data-s-save>' + icon('check') + 'Salvează</button>',
      onMount(el) {
        el.addEventListener('click', (ev) => {
          const t = ev.target;
          if (t.closest('[data-s-prev]')) return load(-1);
          if (t.closest('[data-s-next]')) return load(1);
          if (t.closest('[data-s-print]')) return printSheet();
          if (t.closest('[data-s-share]')) return shareSheet();
          const sv = t.closest('[data-s-save]');
          if (sv) return K.busy(sv, async () => {
            const f = el.querySelector('[data-s-form]');
            if (!f || !sheetS.data) return;
            const v = K.formValues(f);
            try { const r = await api('sheet_save', { employeeId: sheetS.emp, month: sheetS.data.month, good: v.good, improve: v.improve, agree: v.agree }); sheetS.data.notes = r.notes; K.ui().toast('Salvat.', 'success'); paintSheet(d); }
            catch (err) { K.ui().toast(errText(err), 'error'); }
          });
        });
      },
    });
    async function load(step) {
      if (step) sheetS.month = K.addMonths(sheetS.month, step);
      if (sheetS.month > K.thisMonth()) sheetS.month = K.thisMonth();
      d.body.innerHTML = skel(360);
      try { sheetS.data = await api('sheet', { employeeId: sheetS.emp, month: sheetS.month }); }
      catch (e) { d.body.innerHTML = K.empty('alert', 'Nu am putut încărca fișa', errText(e)); return; }
      paintSheet(d);
    }
    load(0);
  }
  function cmp(now, before, fmt, higherIsBetter) {
    if (before == null || now == null) return '';
    const dlt = now - before;
    if (!dlt) return '<small class="fu-cmp">la fel ca luna trecută</small>';
    const good = higherIsBetter ? dlt > 0 : dlt < 0;
    return '<small class="fu-cmp ' + (good ? 'is-good' : 'is-bad') + '">' + icon(dlt > 0 ? 'arrowUp' : 'arrowDown') + (dlt > 0 ? '+' : '-') + fmt(Math.abs(dlt)) + ' față de luna trecută</small>';
  }
  function tiles(x) {
    const n = x.now, p = x.before.empty ? null : x.before;
    const tile = (label, value, sub, extra, tone) => '<div class="fu-tile' + (tone ? ' ' + tone : '') + '"><span>' + label + '</span><b>' + value + '</b><small>' + sub + '</small>' + (extra || '') + '</div>';
    if (n.empty) return K.empty('calendar', 'Luna n-a început încă', '');
    return '<div class="fu-tiles">' +
      tile('Lei pe zi lucrată', n.days ? K.lei(n.perDay) : 'nicio zi', 'țintă ' + K.lei(n.target) + (p ? ' · luna trecută ' + (p.days ? K.lei(p.perDay) : 'nicio zi') : ''), n.days && p && p.days ? cmp(n.perDay, p.perDay, K.lei, true) : '', n.days ? (n.ok ? 'is-good' : 'is-warn') : '') +
      tile('Zile lucrate', String(n.days), (n.daysFrom === 'incasari' ? 'după încasări, fără pontaj' : 'din Condică și încasări') + (p ? ' · luna trecută ' + p.days : '')) +
      tile('Consultații', String(n.consults.total), n.consults.withPackage + ' cu upsell' + (n.consults.pct != null ? ' (' + n.consults.pct + '%)' : '') + (p ? ' · luna trecută ' + p.consults.withPackage + ' din ' + p.consults.total : ''), p ? cmp(n.consults.withPackage, p.consults.withPackage, String, true) : '') +
      tile('Clientele ei care n-au venit', String(n.noShows), 'din ' + K.plural(n.visits, 'programare trecută', 'programări trecute') + (p ? ' · luna trecută ' + p.noShows : ''), p ? cmp(n.noShows, p.noShows, String, false) : '', n.noShows ? 'is-warn' : '') +
      tile('Anulări', String(n.cancelled), 'anulate înainte de oră' + (p ? ' · luna trecută ' + p.cancelled : ''), p ? cmp(n.cancelled, p.cancelled, String, false) : '') +
      '</div>';
  }
  function paintSheet(d) {
    const x = sheetS.data;
    if (!x || !d.body) return;
    const cur = x.month === K.thisMonth();
    d.el.querySelector('.k-dtitle h3').textContent = x.employee.name;
    d.body.innerHTML = '<div class="fu-sheet"><div class="fu-month"><button type="button" class="k-icon-btn" data-s-prev aria-label="Luna trecută">' + icon('left') + '</button><b>' + esc(K.monthLabel(x.month)) + (cur ? '<small>până azi</small>' : '') + '</b>' +
        '<button type="button" class="k-icon-btn" data-s-next aria-label="Luna următoare"' + (cur ? ' disabled' : '') + '>' + icon('right') + '</button></div>' +
      '<p class="fu-sum">' + icon('users') + '<span>' + esc(x.employee.name) + ' · ' + esc(x.employee.location) + '. Încasările ei împărțite la zilele lucrate; consultațiile cu upsell: urmate în 7 zile de un pachet sau un upsell al aceleiași cliente.</span></p>' +
      tiles(x) +
      '<form class="k-form fu-notes" data-s-form>' +
        K.field('Ce merge bine', '<textarea name="good" rows="3" maxlength="2000">' + esc(x.notes.good) + '</textarea>', 'full') +
        K.field('Ce are de îmbunătățit', '<textarea name="improve" rows="3" maxlength="2000">' + esc(x.notes.improve) + '</textarea>', 'full') +
        K.field('Ce stabilim', '<textarea name="agree" rows="3" maxlength="2000">' + esc(x.notes.agree) + '</textarea>', 'full') +
      '</form>' + (x.notes.at ? '<p class="fu-hint">' + icon('check') + 'Salvat de ' + esc(x.notes.byName || '') + ', ' + esc(K.ago(x.notes.at)) + '.</p>' : '') + '</div>';
  }
  function sheetText() {
    const x = sheetS.data; if (!x) return '';
    const n = x.now, p = x.before;
    const f = document.querySelector('.k-drawer [data-s-form]');
    const v = f ? K.formValues(f) : x.notes;
    return [x.employee.name + ', ' + K.monthLabel(x.month),
      'Lei pe zi lucrată: ' + (n.days ? K.lei(n.perDay) : 'nicio zi lucrată') + ' (țintă ' + K.lei(n.target) + ')' + (p.empty ? '' : ', luna trecută ' + (p.days ? K.lei(p.perDay) : 'nicio zi lucrată')),
      'Zile lucrate: ' + n.days + (p.empty ? '' : ', luna trecută ' + p.days),
      'Consultații: ' + n.consults.total + ', ' + n.consults.withPackage + ' cu upsell' + (p.empty ? '' : ' (luna trecută ' + p.consults.withPackage + ' din ' + p.consults.total + ')'),
      'Clientele ei care n-au venit: ' + n.noShows + ' din ' + n.visits + (p.empty ? '' : ', luna trecută ' + p.noShows),
      'Anulări: ' + n.cancelled + (p.empty ? '' : ', luna trecută ' + p.cancelled),
      '', 'Ce merge bine: ' + (v.good || '-'), 'Ce are de îmbunătățit: ' + (v.improve || '-'), 'Ce stabilim: ' + (v.agree || '-')].join('\n');
  }
  async function shareSheet() {
    const text = sheetText(); if (!text) return;
    if (navigator.share) { try { await navigator.share({ title: 'Discuția lunară', text }); return; } catch (e) { if (e && e.name === 'AbortError') return; } }
    K.copy(text);
  }
  function printSheet() {
    const x = sheetS.data; if (!x) return;
    const w = window.open('', '_blank', 'width=820,height=900');
    if (!w) { K.ui().toast('Permite ferestrele pop-up ca să printezi.', 'error'); return; }
    const lines = sheetText().split('\n');
    const f = document.querySelector('.k-drawer [data-s-form]'), v = f ? K.formValues(f) : x.notes;
    w.document.write('<!doctype html><html lang="ro"><head><meta charset="utf-8"><title>' + esc(lines[0]) + '</title><style>' +
      'body{font:14px/1.5 Inter,system-ui,sans-serif;color:#111;margin:36px;max-width:720px}h1{font-size:21px;margin:0 0 2px}p.s{color:#666;margin:0 0 20px}' +
      'table{width:100%;border-collapse:collapse;margin-bottom:22px}td{padding:8px 6px;border-bottom:1px solid #ddd}td.n{text-align:right;font-variant-numeric:tabular-nums;font-weight:600}' +
      'h2{font-size:14px;margin:18px 0 6px;text-transform:uppercase;letter-spacing:.05em;color:#555}.box{min-height:70px;border:1px solid #ccc;border-radius:8px;padding:10px;white-space:pre-wrap}</style></head><body>' +
      '<h1>' + esc(x.employee.name) + '</h1><p class="s">Discuția lunară · ' + esc(K.monthLabel(x.month)) + ' · ' + esc(x.employee.location) + '</p><table>' +
      lines.slice(1, 6).map((l) => { const i = l.indexOf(': '); return '<tr><td>' + esc(l.slice(0, i)) + '</td><td class="n">' + esc(l.slice(i + 2)) + '</td></tr>'; }).join('') + '</table>' +
      '<h2>Ce merge bine</h2><div class="box">' + esc(v.good || '') + '</div><h2>Ce are de îmbunătățit</h2><div class="box">' + esc(v.improve || '') + '</div><h2>Ce stabilim</h2><div class="box">' + esc(v.agree || '') + '</div>' +
      '<script>window.onload=function(){window.print();}<\/script></body></html>');
    w.document.close();
  }

  // ------------------------------------------------------------------ where it is reached from
  // Calendar: „Ore libere” next to „Program echipă”; Manager → Cifre: under each clinic; Manager → Echipa: Discuția lunară
  let people = null, peopleAt = 0;
  function hook() {
    if (!can()) return;
    const cal = document.querySelector('#panel-programari .cal-head .k-head-actions');
    if (cal && !cal.querySelector('[data-fu-open]')) {
      const btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'k-btn is-outline fu-cal-btn'; btn.dataset.fuOpen = 'ore'; btn.title = 'Ore libere'; btn.setAttribute('aria-label', 'Ore libere'); btn.innerHTML = icon('sunrise') + '<span>Ore libere</span>';
      const before = cal.querySelector('[data-act="block"]');
      cal.insertBefore(btn, before || cal.firstChild);
    }
    document.querySelectorAll('#panel-manager .mg-city-card').forEach((card) => {
      if (card.querySelector('.fu-mg')) return;
      const h = card.querySelector('.k-card-head h3');
      const city = ALL.find((c) => h && h.textContent.indexOf(c) >= 0) || '';
      const stats = card.querySelector('.mg-stats');
      if (!stats) return;
      stats.insertAdjacentHTML('afterend', '<div class="fu-mg"><button type="button" class="k-btn is-outline is-sm" data-fu-open="ore" data-city="' + esc(city) + '">' + icon('sunrise') + 'Ore libere</button>' +
        '<button type="button" class="k-btn is-ghost is-sm" data-fu-open="pachete" data-city="' + esc(city) + '">' + icon('gift') + 'Pachete fără programare</button>' +
        '<button type="button" class="k-btn is-ghost is-sm" data-fu-open="resunat" data-city="' + esc(city) + '">' + icon('phone') + 'De resunat</button></div>');
    });
    const emps = document.querySelector('#panel-manager [data-body] .mg-team-list');
    if (emps && !document.querySelector('#panel-manager .fu-1on1')) {
      const card = emps.closest('.k-card');
      if (!card) return;
      card.insertAdjacentHTML('afterend', '<section class="k-card fu-1on1"><div class="k-card-head"><h3>' + icon('users') + 'Discuția lunară</h3><span class="k-sub">fișa fiecărei cosmeticiene, cu cifrele lunii</span></div><div class="fu-1on1-list">' + skel(60) + '</div></section>');
      paintPeople();
    }
  }
  async function paintPeople() {
    const el = document.querySelector('#panel-manager .fu-1on1-list');
    if (!el) return;
    try { if (!people || Date.now() - peopleAt > 5 * 60e3) { people = (await api('people')).people || []; peopleAt = Date.now(); } }
    catch (e) { el.innerHTML = '<p class="k-muted">Nu am putut încărca lista.</p>'; return; }
    const shown = document.querySelector('#panel-manager .mg-city [data-v].is-on');
    const city = shown && shown.dataset.v !== 'all' ? shown.dataset.v : '';
    const list = people.filter((p) => !city || p.location === city);
    el.innerHTML = list.length ? '<div class="fu-1on1-grid">' + list.map((p) => '<button type="button" class="fu-1on1-p" data-fu-sheet="' + esc(p.id) + '">' + K.avatar(p.name, 34) + '<span class="fu-pt"><b>' + esc(p.name) + '</b><small>' + esc(p.location) + ' · ' + esc(K.monthLabel(K.thisMonth())) + '</small></span>' + icon('right') + '</button>').join('') + '</div>'
      : '<p class="k-muted">Nicio cosmeticiană aici.</p>';
  }
  let raf = 0;
  const later = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; hook(); }); };
  function watch() {
    ['panel-programari', 'panel-manager'].forEach((id) => {
      const p = document.getElementById(id);
      if (p && !p._fuWatch) { p._fuWatch = true; new MutationObserver(later).observe(p, { childList: true, subtree: true }); }
    });
    later();
  }
  document.addEventListener('click', (e) => {
    const o = e.target.closest('[data-fu-open]');
    if (o) { e.preventDefault(); open(o.dataset.fuOpen, { city: o.dataset.city || '' }); return; }
    const s = e.target.closest('[data-fu-sheet]');
    if (s) { e.preventDefault(); openSheet(s.dataset.fuSheet); }
  });
  K.on('data', watch);
  K.on('section', (id) => { if (id === 'programari' || id === 'manager') watch(); });
  // the notifications' links: #programari/orelibere, #programari/pachete, #programari/resunat, #programari/maine, #pipeline/coada
  K.on('programari:sub', (sub) => {
    if (sub === 'maine') return K.emit('calendar:open', { date: K.addDays(K.today(), 1) });
    const tab = { orelibere: 'ore', pachete: 'pachete', resunat: 'resunat' }[sub];
    if (tab) setTimeout(() => open(tab), 250);
  });
  K.on('pipeline:sub', (sub) => { if (sub === 'coada') K.emit('pipeline:queue'); });
  K.followups = { open, openSheet };
  // Panou → Azi → De făcut (portal-kpi.js reads it at once, so it gets the last numbers fetched): the packages without a
  // next booking and who is due to be called again, for her clinics (the owner: both); a tap opens the list
  let cnt = null, cntAt = 0, cntP = null;
  function fetchCounts(force) {
    if (!can() || cntP || (!force && cnt && Date.now() - cntAt < 3 * 60e3)) return cntP;
    cntP = api('counts').then((r) => { cnt = r; cntAt = Date.now(); }).catch(() => {}).then(() => { cntP = null; });
    return cntP;
  }
  window.C360Followups = {
    counts() {
      fetchCounts(false);
      if (!cnt) return null;
      return { packagesUnbooked: cnt.packagesUnbooked || 0, callAgain: cnt.callAgain || 0, go: cnt.packagesUnbooked ? 'programari/pachete' : 'programari/resunat', cities: cnt.cities };
    },
    refresh: () => fetchCounts(true),
  };
  K.on('data', () => fetchCounts(false));
})();
