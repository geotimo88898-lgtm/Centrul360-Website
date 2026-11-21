// Centrul360 portal, Admin → „Campanie TRANSFORMARE” (the owner, 21.11): the „Transformarea 360” WhatsApp campaign in
// one page. At the top the spots per clinic, the money, the time left and the switch; under it the funnel (per clinic or
// in all), each message of the week with Meta's numbers, and the people who answered: tap one and her card grows into a
// sheet (status, plan, consultation date). API: api/portal-transformare.js (api/_lib/fc-campaign.js).
(function () {
  'use strict';
  const K = window.K;
  if (!K) return;
  const { esc, icon } = K;
  const S = { d: null, city: 'total', filter: 'call', timer: 0 };
  let panel = null;
  const api = (b) => K.api('/api/portal-transformare', b);
  const CITIES = ['Timișoara', 'Arad'];
  const SHORT = { 'Timișoara': 'TM', Arad: 'AR' };
  const STATUS = [['call', 'De sunat'], ['consult', 'Consult programat'], ['came', 'A venit'], ['paid', 'A plătit'], ['no', 'Nu']];
  const STATUS_L = Object.fromEntries(STATUS);
  const TONE = { call: 'is-warn', consult: 'is-info', came: 'is-accent', paid: 'is-good', no: '' };
  const KIND = { yes: 'DA', stop: 'Nu vrea', list: 'Lista', text: 'A scris' };
  const TIER = { TIER_50: 50, TIER_250: 250, TIER_1K: 1000, TIER_2K: 2000, TIER_10K: 10000, TIER_100K: 100000, TIER_UNLIMITED: 1e9 };

  const fmt = (iso, o) => { try { return new Intl.DateTimeFormat('ro-RO', Object.assign({ timeZone: 'Europe/Bucharest' }, o)).format(new Date(iso)); } catch (e) { return ''; } };
  const dayHour = (iso) => fmt(iso, { weekday: 'short', day: '2-digit', month: '2-digit' }) + ', ' + fmt(iso, { hour: '2-digit', minute: '2-digit' });
  const pct = (a, b) => (b ? Math.round((a / b) * 100) + '%' : '');
  const stepLabel = (k) => { const s = ((S.d && S.d.steps) || []).find((x) => x.k === k); return s ? s.label : ''; };

  function mount(p) {
    panel = p;
    panel.classList.add('k-panel', 'tf');
    panel.innerHTML = '<div class="k-head"><div><div class="k-eyebrow">Marketing</div><h2>Fast Cash</h2>' +
      '<p class="k-lede">Transformarea 360 pe WhatsApp, 22-29 noiembrie: 10 locuri în fiecare clinică.</p></div><div class="k-head-actions" data-tfhead></div></div>' +
      '<div data-tfbody><div class="k-skel" style="height:520px"></div></div>';
    panel.addEventListener('click', onClick);
  }
  async function load(quiet) {
    try { S.d = await api({ action: 'get' }); paint(); }
    catch (err) { if (quiet && S.d) return; const b = panel && panel.querySelector('[data-tfbody]'); if (b) b.innerHTML = K.empty('alert', 'Nu am putut încărca campania', esc(K.errText(err))); }
  }
  async function act(btn, body, done) {
    return K.busy(btn, async () => {
      try { S.d = await api(body); paint(); if (done) K.ui().toast(done, 'success'); return true; }
      catch (err) { K.ui().toast((err.data && err.data.message) || K.errText(err), 'error'); return false; }
    });
  }

  // ---------------------------------------------------------------- the page
  function paint() {
    if (!panel || !S.d) return;
    const d = S.d, st = d.state;
    const state = !st.armed ? ['', 'Oprită'] : st.paused ? ['is-warn', 'Pauză'] : ['is-good', 'Pornită'];
    panel.querySelector('[data-tfhead]').innerHTML =
      '<span class="k-tag ' + state[0] + ' tf-state">' + icon(st.armed && !st.paused ? 'zap' : 'power') + state[1] + '</span>' +
      '<button type="button" class="k-btn is-outline" data-tf="test">' + icon('phone') + 'Trimite test</button>' +
      (!st.armed ? '<button type="button" class="k-btn" data-tf="arm">' + icon('power') + 'Pornește campania</button>'
        : st.paused ? '<button type="button" class="k-btn" data-tf="resume">' + icon('zap') + 'Continuă</button>'
          : '<button type="button" class="k-btn is-outline" data-tf="pause">' + icon('clock') + 'Pauză</button>');
    const body = panel.querySelector('[data-tfbody]');
    body.innerHTML = top() + limits() + funnel() + steps() + people() + log();
    tick();
  }
  function stat(tone, ic, label, value, sub, extra) {
    return '<div class="k-stat ' + tone + '"' + (extra || '') + '><div class="k-stat-top"><span class="k-stat-ic">' + icon(ic) + '</span>' + esc(label) + '</div>' +
      '<div class="k-stat-value">' + value + '</div><div class="k-stat-sub">' + sub + '</div></div>';
  }
  function top() {
    const a = S.d.agg || {}, seats = a.seats || {}, m = a.money || {};
    const seat = (c) => { const x = seats[c] || { paid: 0, bonus: [] }; return stat(x.paid >= S.d.seatsMax ? 'is-good' : 'is-accent', 'users', 'Locuri ' + c, x.paid + '<small>/' + S.d.seatsMax + '</small>', (x.bonus || []).length ? 'primele ' + x.bonus.length + ' cu +1 lună bonus' : 'nimeni n-a plătit încă'); };
    return '<div class="k-grid c4 tf-top">' + seat('Timișoara') + seat('Arad') +
      stat('is-good', 'wallet', 'Încasat', esc(K.lei(m.cashed || 0)), 'contractat pe an ' + esc(K.lei(m.contracted || 0))) +
      stat('is-warn', 'clock', 'Timp rămas', '<span data-tfleft>…</span>', 'se închide sâmbătă 28.11, 23:59') + '</div>';
  }
  function tick() {
    const el = panel && panel.querySelector('[data-tfleft]');
    if (!el || !S.d) return;
    const ms = Date.parse(S.d.agg && S.d.agg.closeAt) - Date.now();
    if (!(ms > 0)) { el.textContent = 'închisă'; return; }
    const dd = Math.floor(ms / 864e5), hh = Math.floor(ms / 36e5) % 24, mm = Math.floor(ms / 6e4) % 60, ss = Math.floor(ms / 1e3) % 60;
    el.textContent = (dd ? dd + 'z ' : '') + String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0') + (dd ? '' : ':' + String(ss).padStart(2, '0'));
  }
  // Meta's daily limit of new chats per number: below the list, a step can't reach everyone in a day
  function limits() {
    const l = (S.d.agg || {}).limits || {}, f = (S.d.agg || {}).funnel || {};
    const bits = CITIES.map((c) => {
      const x = l[c] || {};
      if (!x.connected) return '<span class="k-tag is-bad">' + SHORT[c] + ': numărul nu e conectat</span>';
      if (x.error) return '<span class="k-tag">' + SHORT[c] + ': limita nu se vede acum</span>';
      const cap = TIER[x.tier] || 0, need = (f[c] || {}).audience || 0;
      const low = cap && need > cap;
      return '<span class="k-tag ' + (low ? 'is-bad' : 'is-good') + '">' + SHORT[c] + ': ' + (cap >= 1e9 ? 'fără limită' : esc(K.num(cap)) + ' pe zi') + (x.quality ? ' · calitate ' + esc(String(x.quality).toLowerCase()) : '') + '</span>' +
        (low ? '<span class="tf-warn">' + icon('alert') + 'Lista din ' + esc(c) + ' are ' + esc(K.num(need)) + ' persoane: peste limita zilnică a numărului.</span>' : '');
    });
    const clock = (S.d.agg || {}).clockAt;
    if (!clock || Date.now() - Date.parse(clock) > 5 * 60e3) bits.push('<span class="k-tag is-bad">ceasul de trimitere nu merge' + (clock ? ' din ' + esc(dayHour(clock)) : '') + '</span>');
    const frozen = S.d.state.frozenAt ? 'Lista e fixată din ' + esc(dayHour(S.d.state.frozenAt)) + '.' : 'Lista se fixează la primul mesaj trimis.';
    return '<p class="tf-limits">' + bits.join('') + '<span class="k-muted">' + frozen + ((S.d.agg || {}).at ? ' Actualizat ' + esc(K.ago(S.d.agg.at)) + '.' : '') + '</span>' +
      '<button type="button" class="k-icon-btn" data-tf="refresh" aria-label="Actualizează">' + icon('refresh') + '</button></p>';
  }
  function funnel() {
    const f = ((S.d.agg || {}).funnel || {})[S.city === 'total' ? 'total' : S.city] || {};
    const rows = [['audience', 'Lista'], ['sent', 'Primit mesaj'], ['delivered', 'Livrat'], ['read', 'Citit'], ['replied', 'Au răspuns'], ['interested', 'Vor (DA)'], ['consult', 'Consult programat'], ['came', 'Au venit'], ['paid', 'Au plătit']];
    const top = f.audience || 0;
    const html = rows.map(([k, l], i) => {
      const v = f[k] || 0, prev = i ? f[rows[i - 1][0]] || 0 : 0, w = top ? Math.max(v ? 2 : 0, Math.round((v / top) * 100)) : 0;
      return '<div class="tf-fun-row"><span class="tf-fun-l">' + esc(l) + '</span><span class="tf-fun-bar"><i style="width:' + w + '%"></i></span>' +
        '<b class="tf-fun-v">' + esc(K.num(v)) + '</b><span class="tf-fun-p">' + (i ? esc(pct(v, prev)) : '') + '</span></div>';
    }).join('');
    const seg = '<div class="k-seg" data-tfcity>' + [['total', 'Total'], ['Timișoara', 'TM'], ['Arad', 'AR']].map(([v, l]) => '<button type="button" data-v="' + esc(v) + '" class="' + (S.city === v ? 'is-on' : '') + '">' + l + '</button>').join('') + '</div>';
    return '<section class="k-card tf-card"><div class="k-card-head"><h3>' + icon('target') + 'Pâlnia</h3>' + seg + '</div>' + html +
      '<p class="tf-foot k-muted">Procentul arată cât trece de la treapta de deasupra. Nu vor: ' + esc(K.num(f.stop || 0)) + ' · mesaje nelivrate: ' + esc(K.num(f.failed || 0)) + '.</p></section>';
  }
  function steps() {
    const a = S.d.agg || {}, rows = a.steps || [];
    const tag = { programat: '', 'se trimite': 'is-info', trimis: 'is-good', 'sărit': 'is-bad' };
    const tpl = (k) => CITIES.map((c) => { const s = (S.d.templates[k] || {})[c]; return '<span class="k-tag ' + (s === 'APPROVED' ? 'is-good' : s === 'REJECTED' ? 'is-bad' : s ? 'is-warn' : '') + '">' + SHORT[c] + (s === 'APPROVED' ? ' aprobat' : s === 'REJECTED' ? ' respins' : s ? ' la Meta' : ' fără șablon') + '</span>'; }).join('');
    const sum = (r, key) => (S.city === 'total' ? CITIES.reduce((x, c) => x + ((r.cities[c] || {})[key] || 0), 0) : ((r.cities[S.city] || {})[key] || 0));
    const cols = [['sent', 'trimise'], ['delivered', 'livrate'], ['read', 'citite'], ['replies', 'răspunsuri'], ['interested', 'DA'], ['stop', 'nu vor'], ['failed', 'eșuate']];
    const html = rows.map((r) => {
      const sent = sum(r, 'sent');
      const n = cols.map(([k, l]) => { const v = sum(r, k); return '<span class="tf-n' + (k === 'failed' && v ? ' is-bad' : k === 'interested' && v ? ' is-good' : '') + '"><b>' + esc(K.num(v)) + '</b>' + esc(l) + (k !== 'sent' && sent && ['delivered', 'read', 'replies'].includes(k) ? '<em>' + esc(pct(v, sent)) + '</em>' : '') + '</span>'; }).join('');
      const again = (r.status === 'sărit' || r.cut) ? '<button type="button" class="k-btn is-outline is-sm" data-tf="extend" data-step="' + esc(r.k) + '">' + icon('refresh') + 'Mai trimite 2 ore</button>' : '';
      return '<div class="tf-step"><div class="tf-step-head"><div class="tf-step-t"><b>' + esc(r.k) + ' · ' + esc(r.label) + '</b><span class="k-muted">' + esc(dayHour(r.at)) + '</span></div>' +
        '<span class="k-tag ' + (tag[r.status] || '') + '">' + esc(r.status) + '</span></div>' +
        '<div class="tf-step-tpl">' + tpl(r.k) + (r.note ? '<span class="tf-note">' + icon('info') + esc(r.note) + '</span>' : '') + again + '</div>' +
        '<div class="tf-nums">' + n + '</div></div>';
    }).join('');
    return '<section class="k-card tf-card"><div class="k-card-head"><h3>' + icon('chat') + 'Mesajele săptămânii</h3><span class="k-sub">' + (S.city === 'total' ? 'ambele clinici' : esc(S.city)) + '</span></div>' + html + '</section>';
  }
  function people() {
    const list = S.d.people || [];
    const counts = { call: 0, consult: 0, came: 0, paid: 0, no: 0, all: list.length };
    list.forEach((p) => { counts[p.status || 'call'] = (counts[p.status || 'call'] || 0) + 1; });
    const seg = '<div class="k-seg tf-filter" data-tffilter>' + [['call', 'De sunat'], ['consult', 'Consult'], ['came', 'Au venit'], ['paid', 'Au plătit'], ['all', 'Toate']].map(([v, l]) =>
      '<button type="button" data-v="' + v + '" class="' + (S.filter === v ? 'is-on' : '') + '">' + l + ' <small>' + (counts[v] || 0) + '</small></button>').join('') + '</div>';
    const shown = list.filter((p) => S.filter === 'all' || (p.status || 'call') === S.filter);
    const rows = shown.map((p) => {
      const last = p.last;
      const said = last ? '<span class="tf-said">' + (last.step ? esc(stepLabel(last.step)) + ': ' : '') + '„' + esc(String(last.text || KIND[last.kind] || '').slice(0, 70)) + '”</span>' : '<span class="tf-said k-muted">adăugată de mână</span>';
      return '<button type="button" class="k-row is-click tf-person" data-tfp="' + esc(p.k) + '">' +
        '<div class="k-row-main"><div class="k-row-title">' + esc(p.name || p.phone) + (p.bonus ? ' <span class="k-tag is-good">+1 lună</span>' : '') + '</div>' +
        '<div class="k-row-sub">' + esc(SHORT[p.city] || '') + ' · ' + esc(p.phone || '') + (last ? ' · ' + esc(K.ago(last.at)) : '') + '</div>' + said + '</div>' +
        '<div class="k-row-end"><span class="k-tag ' + (TONE[p.status || 'call'] || '') + '">' + esc(STATUS_L[p.status || 'call']) + (p.status === 'paid' ? (p.plan === 'monthly' ? ' · lunar' : ' · integral') : '') + '</span>' +
        (p.consultAt && p.status === 'consult' ? '<span class="k-muted tf-when">' + esc(dayHour(p.consultAt.length > 10 ? p.consultAt : p.consultAt + 'T09:00')) + '</span>' : '') + '</div></button>';
    }).join('');
    return '<section class="k-card tf-card"><div class="k-card-head"><h3>' + icon('phone') + 'Cine a răspuns</h3>' +
      '<button type="button" class="k-btn is-outline is-sm" data-tf="add">' + icon('plus') + 'Adaugă</button></div>' + seg +
      (rows ? '<div class="k-list">' + rows + '</div>' : K.empty('users', S.filter === 'call' ? 'Nimeni de sunat acum' : 'Nimeni aici încă', 'Cine răspunde la mesaje apare aici, cu ce a scris.')) +
      '<p class="tf-foot k-muted">Nu vor să mai primească: ' + esc(K.num(S.d.stops || 0)) + ' · pe lista de primăvară: ' + esc(K.num(S.d.lists || 0)) + '.</p></section>';
  }
  function log() {
    const l = S.d.state.log || [];
    if (!l.length) return '';
    return '<section class="k-card tf-card"><div class="k-card-head"><h3>' + icon('listCheck') + 'Ce s-a întâmplat</h3></div><ul class="tf-log">' +
      l.map((x) => '<li><span class="k-muted">' + esc(dayHour(x.at)) + '</span>' + esc(x.text) + '</li>').join('') + '</ul></section>';
  }

  // ---------------------------------------------------------------- sheets
  function personSheet(p, from) {
    const dt = p.consultAt ? (p.consultAt.length > 10 ? p.consultAt : p.consultAt + 'T09:00') : '';
    const replies = (p.replies || []).slice().reverse().map((r) => '<li><span class="k-muted">' + esc(dayHour(r.at)) + (r.step ? ' · ' + esc(stepLabel(r.step)) : '') + '</span>„' + esc(r.text || KIND[r.kind] || '') + '”</li>').join('');
    K.drawer({
      from, focus: false, icon: 'user', title: p.name || p.phone, subtitle: esc((p.city || '') + ' · ' + (p.phone || '')), width: 480,
      body: '<div class="tf-sheet"><div class="tf-sheet-go"><a class="k-btn is-outline" href="' + esc(K.tel(p.phone)) + '">' + icon('phone') + 'Sună</a>' +
        '<a class="k-btn is-outline" href="#mesaje" data-tfchat>' + icon('chat') + 'Mesaje</a></div>' +
        '<div class="k-form">' + K.field('Stare', K.seg('status', STATUS.map(([v, l]) => [v, l]), p.status || 'call', 'is-big'), 'k-span2') +
        K.field('Plata', K.seg('plan', [['full', 'Integral 9.900'], ['monthly', 'Lunar 1.500']], p.plan || 'full', 'is-big'), 'k-span2') +
        K.field('Consultația', '<input type="datetime-local" name="consultAt" value="' + esc(dt) + '">', 'k-span2') +
        K.field('Notă', '<textarea name="note" rows="2">' + esc(p.note || '') + '</textarea>', 'k-span2') + '</div>' +
        (replies ? '<h4 class="tf-sheet-h">Ce a scris</h4><ul class="tf-log">' + replies + '</ul>' : '') + '</div>',
      footer: '<button type="button" class="k-btn" data-save>' + icon('check') + 'Salvează</button>',
      onMount(el, h) {
        el.querySelector('[data-tfchat]').addEventListener('click', (e) => { e.preventDefault(); h.close(); K.go('mesaje'); });
        el.querySelector('[data-save]').addEventListener('click', async (e) => {
          const v = K.formValues(el);
          const ok = await act(e.currentTarget, { action: 'person', k: p.k, status: v.status, plan: v.plan, consultAt: v.consultAt || '', note: v.note || '' }, 'Salvat.');
          if (ok) h.close();
        });
      },
    });
  }
  function addSheet(from) {
    K.drawer({
      from, icon: 'userPlus', title: 'Adaugă', subtitle: 'o plată sau o cerere venită altfel decât pe WhatsApp', width: 480,
      body: '<div class="k-form">' + K.field('Nume', '<input name="name" autocomplete="off">', 'k-span2') + K.field('Telefon', '<input name="phone" inputmode="tel" autocomplete="off">', 'k-span2') +
        K.field('Clinica', K.seg('city', [['Timișoara', 'Timișoara'], ['Arad', 'Arad']], 'Timișoara', 'is-big'), 'k-span2') +
        K.field('Stare', K.seg('status', STATUS.slice(0, 4), 'paid', 'is-big'), 'k-span2') +
        K.field('Plata', K.seg('plan', [['full', 'Integral 9.900'], ['monthly', 'Lunar 1.500']], 'full', 'is-big'), 'k-span2') + '</div>',
      footer: '<button type="button" class="k-btn" data-save>' + icon('check') + 'Adaugă</button>',
      onMount(el, h) {
        el.querySelector('[data-save]').addEventListener('click', async (e) => {
          const v = K.formValues(el);
          if (await act(e.currentTarget, Object.assign({ action: 'add' }, v), 'Adăugată.')) h.close();
        });
      },
    });
  }
  function testSheet(from) {
    const steps = (S.d.steps || []).map((s) => [s.k, s.k + ' · ' + s.label]);
    K.drawer({
      from, icon: 'phone', title: 'Trimite test', subtitle: 'un mesaj al campaniei pe un singur număr; nu intră în cifre', width: 460,
      body: '<div class="k-form">' + K.field('Telefon', '<input name="phone" inputmode="tel" autocomplete="off" value="' + esc(S.d.state.testPhone || '') + '">', 'k-span2') +
        K.field('Prenume în mesaj', '<input name="name" autocomplete="off" value="George">', 'k-span2') +
        K.field('Mesajul', '<select name="step">' + K.options(steps, '1') + '</select>', 'k-span2') +
        K.field('De pe numărul', K.seg('city', [['Timișoara', 'Timișoara'], ['Arad', 'Arad']], 'Timișoara', 'is-big'), 'k-span2') + '</div>',
      footer: '<button type="button" class="k-btn" data-save>' + icon('zap') + 'Trimite</button>',
      onMount(el, h) {
        el.querySelector('[data-save]').addEventListener('click', async (e) => {
          const v = K.formValues(el);
          if (await act(e.currentTarget, Object.assign({ action: 'test' }, v), 'Trimis. Verifică telefonul.')) h.close();
        });
      },
    });
  }

  async function onClick(e) {
    const city = e.target.closest('[data-tfcity] > button');
    if (city) { S.city = city.dataset.v; paint(); return; }
    const f = e.target.closest('[data-tffilter] > button');
    if (f) { S.filter = f.dataset.v; paint(); return; }
    const row = e.target.closest('[data-tfp]');
    if (row) { const p = (S.d.people || []).find((x) => x.k === row.dataset.tfp); if (p) personSheet(p, row); return; }
    const b = e.target.closest('[data-tf]');
    if (!b) return;
    const a = b.dataset.tf;
    if (a === 'refresh') return act(b, { action: 'refresh' });
    if (a === 'test') return testSheet(b);
    if (a === 'add') return addSheet(b);
    if (a === 'pause') return act(b, { action: 'pause', on: true }, 'Pauză. Nu mai pleacă nimic până apeși „Continuă”.');
    if (a === 'resume') return act(b, { action: 'pause', on: false }, 'Campania continuă.');
    if (a === 'extend') return act(b, { action: 'extend', step: b.dataset.step }, 'Se mai trimite 2 ore, la cine n-a primit.');
    if (a === 'arm') {
      const ok = await K.ui().confirm({ title: 'Pornești campania?', message: 'Mesajele pleacă singure la orele lor, de pe numărul fiecărei clinici, la toată lista (' + K.num(((S.d.agg || {}).funnel || {}).total ? S.d.agg.funnel.total.audience : 0) + ' persoane). Poți pune pauză oricând.', confirmText: 'Pornește' });
      if (ok) act(b, { action: 'arm', on: true }, 'Campania e pornită.');
    }
  }

  K.section('transformare', {
    mount,
    show() {
      load();
      clearInterval(S.timer);
      S.timer = setInterval(() => { if (!document.hidden && K.isActive('transformare') && !K.drawerOpen) load(true); }, 30000);
    },
  });
  K.everySecond(() => { if (K.isActive('transformare')) tick(); });
})();
