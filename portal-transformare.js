// Centrul360 portal, Admin → „Campanii” (the owner, 21.11; the section's key stays „transformare”, so its links, bell
// notes and guide keep working). At the top the picker: which campaign he sees (CAMPAIGNS, the same list as
// api/_lib/campaigns.js; remembered on this device), each with its own screen (VIEWS).
//   Transformarea 360: the spots per clinic, the money, the time left and the switch; under it the funnel (per clinic or
//   in all), each message of the week with Meta's numbers, and the people who answered: tap one and her card grows into
//   a sheet (status, plan, consultation date).
//   Cardul de Sărbători: read only, where people drop from the WhatsApp message to the payment (WhatsApp, the site, the
//   orders and the money, by hour), per clinic and in all; „—” where a number can't be known.
// API: api/portal-transformare.js (api/_lib/fc-campaign.js, api/_lib/card-kpi.js).
(function () {
  'use strict';
  const K = window.K;
  if (!K) return;
  const { esc, icon } = K;
  // the campaigns: one line here and one in api/_lib/campaigns.js for a new one (its screen in VIEWS, below)
  const CAMPAIGNS = [
    { key: 'transformarea', name: 'Transformarea 360', short: 'Transformarea' },
    { key: 'card', name: 'Cardul de Sărbători', short: 'Card Sărbători' },
  ];
  const PICK_KEY = 'c360_campaign_pick';
  const pickRead = () => { try { const v = localStorage.getItem(PICK_KEY); return CAMPAIGNS.some((c) => c.key === v) ? v : CAMPAIGNS[0].key; } catch (e) { return CAMPAIGNS[0].key; } };
  const pickSave = (v) => { try { localStorage.setItem(PICK_KEY, v); } catch (e) { /* private mode: the first campaign next time */ } };
  const S = { camp: pickRead(), batch: 'all', d: null, c: null, city: 'total', filter: 'call', timer: 0, cc: 'total', src: 'camp', dev: 'all', ms: 'camp', pf: 'all', err: null };
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
  const LEDE = {
    transformarea: 'Transformarea 360 pe WhatsApp, 22-29 noiembrie: 10 locuri în fiecare clinică.',
    card: 'Cardul de Sărbători pe WhatsApp, la clientele cele mai calde: de la mesaj până la plată, unde se pierd.',
  };

  function mount(p) {
    panel = p;
    panel.classList.add('k-panel', 'tf');
    panel.innerHTML = '<div class="k-head"><div><div class="k-eyebrow">Marketing</div><h2>Campanii</h2>' +
      '<p class="k-lede" data-cplede></p></div><div class="k-head-actions" data-tfhead></div></div>' +
      '<div class="cp-pick" data-cppick></div>' +
      '<div data-tfbody><div class="k-skel" style="height:520px"></div></div>';
    panel.addEventListener('click', onClick);
    panel.addEventListener('toggle', (e) => { const d = e.target.closest && e.target.closest('[data-cpfold]'); if (d) { S.open = S.open || {}; S.open[d.dataset.cpfold] = d.open; if (d.open) { const ch = d.querySelector('[data-cpchart]'); if (ch && !ch.children.length) drawHours(ch); } } }, true);
  }
  const dataOf = (key) => (key === 'card' ? S.c : S.d);
  async function load(quiet, action) {
    const key = S.camp;
    try {
      const d = await api({ campaign: key, action: action || 'get' });
      if (key === 'card') S.c = d; else S.d = d;
      S.err = null;
      if (key === S.camp) paint();
    } catch (err) {
      if (quiet && dataOf(key)) return;
      S.err = K.errText(err);
      if (key === S.camp) paint();
    }
  }
  async function act(btn, body, done) {
    return K.busy(btn, async () => {
      try { S.d = await api(body); paint(); if (done) K.ui().toast(done, 'success'); return true; }
      catch (err) { K.ui().toast((err.data && err.data.message) || K.errText(err), 'error'); return false; }
    });
  }
  // the picker, the head and the campaign's screen; nothing yet: a skeleton (so the switch slides in at once)
  function paint() {
    if (!panel) return;
    const pick = panel.querySelector('[data-cppick]');
    if (!pick.firstChild || pick.dataset.on !== S.camp) {
      pick.dataset.on = S.camp;
      pick.innerHTML = K.seg('campaign', CAMPAIGNS.map((c) => [c.key, c.name]), S.camp, 'cp-tabs');
    }
    panel.querySelector('[data-cplede]').textContent = LEDE[S.camp] || '';
    const d = dataOf(S.camp), head = panel.querySelector('[data-tfhead]'), body = panel.querySelector('[data-tfbody]');
    if (!d) {
      head.innerHTML = '';
      body.innerHTML = S.err ? K.empty('alert', 'Nu am putut încărca campania', esc(S.err), '<button type="button" class="k-btn" data-tf="reload">' + icon('refresh') + 'Reîncearcă</button>') : '<div class="k-skel" style="height:520px" data-cpskel="' + esc(S.camp) + '"></div>';
      return;
    }
    VIEWS[S.camp](head, body);
  }

  // ---------------------------------------------------------------- the page
  function paintTf(head, body) {
    const d = S.d, st = d.state;
    const state = !st.armed ? ['', 'Oprită'] : st.paused ? ['is-warn', 'Pauză'] : ['is-good', 'Pornită'];
    head.innerHTML =
      '<span class="k-tag ' + state[0] + ' tf-state">' + icon(st.armed && !st.paused ? 'zap' : 'power') + state[1] + '</span>' +
      '<button type="button" class="k-btn is-outline" data-tf="test">' + icon('phone') + 'Trimite test</button>' +
      (!st.armed ? '<button type="button" class="k-btn" data-tf="arm">' + icon('power') + 'Pornește campania</button>'
        : st.paused ? '<button type="button" class="k-btn" data-tf="resume">' + icon('zap') + 'Continuă</button>'
          : '<button type="button" class="k-btn is-outline" data-tf="pause">' + icon('clock') + 'Pauză</button>');
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
    if (!el || !S.d || S.camp !== 'transformarea') return;
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

  // ================================================================ Cardul de Sărbători (read only)
  const DASH = '<span class="cp-na" title="nu se poate ști">—</span>';
  const n0 = (v) => (v == null ? DASH : esc(K.num(v)));
  const lei0 = (v) => (v == null ? DASH : esc(K.lei(v)));
  const mins = (v) => (v == null ? DASH : v < 90 ? esc(K.num(v)) + ' min' : esc(String(Math.round(v / 6) / 10).replace('.', ',')) + ' h');
  const ccol = () => (S.cc === 'total' ? 'total' : S.cc);
  // the batch chosen (api/_lib/card-blast.js pickMore): its WhatsApp numbers, its people's orders, its people
  const bAll = () => !S.c.batches || S.c.batches.length < 2 || S.batch === 'all' || !(S.c.waBy || {})[S.batch];
  const waOf = () => (bAll() ? S.c.wa : S.c.waBy[S.batch]);
  const campOf = () => (bAll() ? S.c.money.camp : (S.c.money.campBy || {})[S.batch] || S.c.money.camp);
  function cBatch() {
    const b = S.c.batches || [];
    if (b.length < 2) return '';
    const n = (k) => (S.c.waBy[k] || { total: { list: 0 } }).total.list;
    const lot = (k) => (S.c.lots || []).find((l) => l.b === k) || {};
    return '<div class="cp-batch">' + segBox('cpbatch', [['all', 'Toate · ' + K.num(n('all'))]].concat(b.map((k) => [k, 'Lotul ' + k + ' · ' + (lot(k).msg || '990') + ' · ' + K.num(n(k))])), bAll() ? 'all' : S.batch) + '</div>';
  }
  // ---- the lots: the chosen one's card, all of them side by side
  const SEGS = { client: 'clienți calzi din lista Transformarea', client2: 'clienți cu vizite, din afara listei', 'client-tr': 'din lista Transformarea', lead: 'leaduri care n-au venit' };
  const SEG_S = { client: 'calzi', client2: 'cu vizite', 'client-tr': 'Transformarea', lead: 'leaduri' };
  const MSG = (m) => (m === 'mix' ? 'mix' : (m || '990') + ' lei');
  const span = (a, b) => (a ? fmt(a, { day: '2-digit', month: '2-digit' }) + ' ' + fmt(a, { hour: '2-digit', minute: '2-digit' }) + (b && b !== a ? ' – ' + fmt(b, { hour: '2-digit', minute: '2-digit' }) : '') : 'netrimis încă');
  const segLine = (segs, short) => Object.keys(segs || {}).sort((a, b) => segs[b] - segs[a]).map((k) => K.num(segs[k]) + ' ' + ((short ? SEG_S : SEGS)[k] || k)).join(' · ');
  function cLot() {
    if (bAll()) return '';
    const l = (S.c.lots || []).find((x) => x.b === S.batch);
    if (!l) return '';
    const r = l.recency || {}, tot = l.n || 1;
    const REC = [['m1', 'sub o lună'], ['m3', '1-3 luni'], ['m6', '3-6 luni'], ['m12', '6-12 luni'], ['older', 'peste un an'], ['never', 'niciodată']];
    const bar = '<div class="cp-rec">' + REC.map(([k], i) => (r[k] ? '<i class="r' + i + '" style="flex:' + r[k] + '"></i>' : '')).join('') + '</div>' +
      '<div class="cp-rec-l">' + REC.filter(([k]) => r[k]).map(([k, lbl], i) => '<span><i class="r' + REC.findIndex((x) => x[0] === k) + '"></i>' + esc(lbl) + ' ' + esc(K.num(r[k])) + '</span>').join('') + '</div>';
    return '<section class="k-card tf-card cp-lot">' +
      '<div class="cp-lot-h">' + (l.img ? '<img class="cp-thumb" src="/api/portal-file?p=' + encodeURIComponent(l.img) + '" alt="" loading="lazy">' : '<span class="cp-thumb">' + icon('image') + '</span>') +
        '<div><b>Lotul ' + esc(l.b) + ' · mesajul ' + esc(MSG(l.msg)) + '</b><span class="k-muted">' + esc(span(l.first, l.last)) + ' · TM ' + esc(K.num(l.cities['Timișoara'])) + ' · AR ' + esc(K.num(l.cities.Arad)) + '</span></div></div>' +
      '<div class="cp-lot-g">' +
        '<div><small>Cine</small><b>' + esc(K.num(l.n)) + '</b><span>' + esc(segLine(l.segs)) + '</span></div>' +
        '<div><small>Vizite</small><b>' + (l.visits ? esc(l.visits.med) : '—') + '</b><span>' + (l.visits ? 'de la ' + esc(l.visits.min) + ' la ' + esc(l.visits.max) : '') + '</span></div>' +
        '<div><small>Plătit la noi</small><b>' + (l.paidMed != null ? esc(K.lei(l.paidMed)) : '—') + '</b><span>mediana</span></div>' +
        '<div><small>Programare la trimitere</small><b>' + esc(K.num(l.atSend)) + '</b><span>' + esc(pct(l.atSend, tot)) + '</span></div>' +
      '</div><small class="cp-h2">Ultima vizită</small>' + bar + '</section>';
  }
  function cLots() {
    const L = S.c.lots || [];
    if (L.length < 2) return '';
    const rowsH = L.map((l) => {
      const x = l.stats;
      return '<button type="button" class="cp-lr' + (S.c.best === l.b ? ' is-best' : '') + (!bAll() && S.batch === l.b ? ' is-on' : '') + '" data-cplot="' + esc(l.b) + '">' +
        '<span class="cp-ln"><b>Lotul ' + esc(l.b) + '</b>' + (S.c.best === l.b ? '<em>cel mai bun</em>' : '') + '<small>' + esc(MSG(l.msg)) + ' · ' + esc(segLine(l.segs, true)) + '</small></span>' +
        '<span>' + n0(x.sent) + '</span><span class="cp-x">' + n0(x.delivered) + '</span><span>' + esc(pct(x.read, x.sent) || '—') + '</span><span class="cp-x">' + n0(x.replied) + '</span><span class="cp-x">' + n0(x.taps) + '</span>' +
        '<span>' + n0(x.requests) + '</span><span class="cp-x">' + n0(x.paidOnline) + '</span><span class="cp-x">' + n0(x.paidClinic) + '</span><span>' + lei0(x.cash) + '</span><span class="cp-x">' + lei0(x.potential) + '</span>' +
        '<span class="cp-x">' + (x.spend == null ? DASH : lei0(x.spend)) + '</span><span class="cp-conv">' + (x.conv == null ? DASH : esc(String(x.conv).replace('.', ',')) + '%') + '</span></button>';
    }).join('');
    const head = ['Trimise', 'Livrate', 'Citite', 'Răspuns', '„Rezerv”', 'Cereri', 'Online', 'Clinică', 'Încasat', 'Potențial', 'Cost mesaje', 'Conversie'];
    const extra = new Set(['Livrate', 'Răspuns', '„Rezerv”', 'Online', 'Clinică', 'Potențial', 'Cost mesaje']); // behind a tap on a phone (the lot's card)
    return '<section class="k-card tf-card"><div class="k-card-head"><h3>' + icon('layers') + 'Loturile</h3><span class="k-sub">conversie = plătite sau cerute / trimise</span></div>' +
      '<div class="cp-scroll"><div class="cp-lots"><div class="cp-lr cp-lh"><span>Lot</span>' + head.map((h) => '<span' + (extra.has(h) ? ' class="cp-x"' : '') + '>' + esc(h) + '</span>').join('') + '</div>' + rowsH + '</div></div></section>';
  }
  const segBox = (name, pairs, on) => K.seg(name, pairs, on);

  function paintCard(head, body) {
    const d = S.c;
    head.innerHTML = '<button type="button" class="k-btn is-outline" data-cp="refresh">' + icon('refresh') + 'Actualizează</button>';
    const st = d.state || {};
    if (!st.from) {
      body.innerHTML = K.empty('chat', 'Mesajul nu a plecat încă', 'Când pleacă primele mesaje ale cardului, aici apar cifrele: WhatsApp, site, comenzi, bani.');
      return;
    }
    body.innerHTML = cBatch() + cLot() + cTop() + cLots() + cFunnel() + cPeople() + fold('wa', 'WhatsApp, pe clinică', cWa()) + fold('site', 'Pe site', cSite()) +
      fold('money', 'Comenzi și bani, în detaliu', cMoney()) + fold('hours', 'Oră cu oră', cHours()) + cLine();
    const ch = body.querySelector('[data-cpchart]');
    if (ch) { if (S.drawn) ch.classList.add('no-anim'); drawHours(ch); S.drawn = true; }
  }
  // the money, in four tiles: cashed, still to come (open requests), the credit sold, who to call
  function cTop() {
    const m = campOf().by.total, w = waOf().total;
    return '<div class="k-grid c4 tf-top tf-top5">' +
      stat('is-good', 'wallet', 'Încasat', esc(K.lei(m.cash)), esc(K.plural(m.cards, 'card', 'carduri')) + ' · ' + esc(K.num(w.sent)) + ' trimise') +
      stat('is-warn', 'trend', 'Potențial', esc(K.lei(m.potential)), esc(K.plural(m.open, 'cerere deschisă', 'cereri deschise'))) +
      stat('is-info', 'gift', 'Credit vândut', esc(K.lei(m.credit)), 'în tratamente') +
      stat('is-accent', 'phone', 'De sunat', esc(K.num(m.resvOpen)), '<button type="button" class="cp-go" data-cp="carduri">Carduri ' + icon('arrow') + '</button>') + cSpend(m, w) + '</div>';
  }
  // what the messages cost (the owner, 23.11): Meta's own charges for the marketing messages since the first send (in lei);
  // a lot's share at the same price per delivered message; with it, what one card sold cost in messages
  function cSpend(m, w) {
    const sp = S.c.spend;
    if (!sp) return '';
    if (sp.error) return stat('is-bad', 'chat', 'Cheltuit pe mesaje', DASH, 'Meta nu a răspuns acum');
    const lot = !bAll() ? (S.c.lots || []).find((l) => l.b === S.batch) : null;
    const lei = lot ? lot.stats.spend || 0 : sp.lei || 0;
    const per = m.cards ? ' · ' + K.lei(Math.round(lei / m.cards)) + ' / card' : '';
    const roi = lei && m.cash ? ' · ' + String(Math.round((m.cash / lei) * 10) / 10).replace('.', ',') + 'x înapoi' : '';
    return stat('is-warn', 'chat', 'Cheltuit pe mesaje', esc(K.lei(Math.round(lei))), esc((sp.unit ? String(sp.unit.toFixed(2)).replace('.', ',') + ' lei / mesaj livrat' : 'de la Meta') + per + roi));
  }
  // a block that opens in place (its open state kept across the refresh)
  const fold = (key, title, html) => (html ? '<details class="k-card tf-card cp-fold" data-cpfold="' + key + '"' + (S.open && S.open[key] ? ' open' : '') + '><summary>' + esc(title) + icon('down') + '</summary><div class="cp-fbody">' + html.replace(/^<section class="k-card tf-card">/, '<div>').replace(/<\/section>$/, '</div>') + '</div></details>' : '');
  function cLine() {
    const d = S.c, st = d.state, sk = d.stock;
    const sending = st.armed && !st.doneAt ? '<span class="k-tag is-info">' + icon('zap') + 'se trimite</span>' : st.doneAt ? '<span class="k-tag is-good">trimis tot, ' + esc(dayHour(st.doneAt)) + '</span>' : '<span class="k-tag">oprit</span>';
    const note = st.note ? '<span class="tf-warn">' + icon('alert') + esc(st.note) + '</span>' : '';
    const stock = '<span class="k-tag ' + (sk.open ? '' : 'is-bad') + '">stoc: ' + esc(K.num(sk.left)) + ' în valul ' + esc(K.num(sk.wave)) + ' · ' + esc(K.num(sk.totalLeft)) + ' din ' + esc(K.num(sk.max)) + ' rămase</span>';
    return '<p class="tf-limits">' + sending + stock + note + '<span class="k-muted">Primul mesaj ' + esc(dayHour(st.from)) + '. Actualizat ' + esc(K.ago(d.at)) + '.</span>' +
      '<button type="button" class="k-icon-btn" data-cp="refresh" aria-label="Actualizează">' + icon('refresh') + '</button></p>';
  }
  // a funnel's rows: [label, value (null = can't be known), branch title?, base?]; the % is from the row above (base: from
  // that number instead; false: none, a step beside the one above, not after it), the biggest drop is marked
  const baseOf = (list, i) => { const r = list[i]; if (!i || r[2] || r[3] === false) return null; return r[3] != null ? r[3] : list[i - 1][1]; };
  function rows(list, top) {
    // the biggest drop on the main path (a branch, like the clinic's, waits on the desk's call: not a drop yet)
    let worst = -1, worstR = 1;
    const end = list.findIndex((r) => r[2]);
    list.forEach((r, i) => {
      if (end > 0 && i >= end) return;
      const prev = baseOf(list, i);
      if (prev == null || r[1] == null || prev < 3) return;
      const ratio = r[1] / prev;
      if (ratio < worstR) { worstR = ratio; worst = i; }
    });
    return list.map((r, i) => {
      const [l, v, branch] = r;
      const prev = baseOf(list, i);
      const w = top && v != null ? Math.max(v ? 2 : 0, Math.min(100, Math.round((v / top) * 100))) : 0;
      return (branch ? '<div class="cp-branch">' + esc(branch) + '</div>' : '') +
        '<div class="tf-fun-row cp-fun' + (i === worst ? ' is-leak' : '') + '"><span class="tf-fun-l">' + esc(l) + '</span><span class="tf-fun-bar"><i style="width:' + w + '%"></i></span>' +
        '<b class="tf-fun-v">' + n0(v) + '</b><span class="tf-fun-p">' + (prev != null && v != null ? esc(pct(v, prev)) : '') + '</span></div>';
    }).join('') + (worst > 0 ? '<p class="cp-leak">' + icon('alert') + 'Cea mai mare pierdere: de la „' + esc(list[worst - 1][0]) + '” la „' + esc(list[worst][0]) + '” (rămân ' + esc(pct(list[worst][1], baseOf(list, worst))) + ').</p>' : '');
  }
  const citySeg = () => segBox('cpcity', [['total', 'Total'], ['Timișoara', 'TM'], ['Arad', 'AR']], S.cc);
  function cFunnel() {
    const d = S.c, c = ccol(), w = waOf()[c], m = campOf().by[c], all = S.cc === 'total' && bAll();
    const camp = d.site.camp, sum = (k) => (all ? (camp.m[k] || 0) + (camp.d[k] || 0) : null);
    const list = [['Lista', w.list], ['Trimise', w.sent], ['Livrate', w.delivered], ['Citite', w.read], ['Au intrat pe site', sum('visit')], ['Au văzut cardul', sum('seen')],
      ['„Plătesc online”', sum('buy')], ['Comandă online', m.online], ['Spre myPOS', sum('pay')], ['Plătite online', m.onlinePaid],
      ['„Rezerv” pe WhatsApp', w.taps, 'În clinică'], ['„Rezerv” pe site', sum('res'), '', false], ['Rezervări', m.resv, '', all ? (w.taps || 0) + (sum('res') || 0) : w.taps], ['Plătite în clinică', m.clinicPaid]];
    return '<section class="k-card tf-card"><div class="k-card-head"><h3>' + icon('target') + 'De la mesaj la plată</h3>' + citySeg() + '</div>' + rows(list, w.list) +
      '<p class="tf-foot k-muted">Procentul arată cât trece de la treapta de deasupra. ' + (all ? 'Site-ul: cine a venit pe linkul din mesaj, o dată pe zi.' : 'Pe site clinica și lotul nu se știu (același link pentru toate): „—”.') + ' Comenzile: făcute după trimitere de un telefon din listă sau din linkul mesajului.</p></section>';
  }
  // a table: rows [label, [TM, AR, total]] (or a function of the column)
  function table(head, list) {
    return '<div class="cp-t"><div class="cp-tr cp-th"><span></span>' + head.map((h) => '<b>' + esc(h) + '</b>').join('') + '</div>' +
      list.map(([l, vals, tone]) => '<div class="cp-tr' + (tone ? ' ' + tone : '') + '"><span>' + esc(l) + '</span>' + vals.map((v) => '<b>' + v + '</b>').join('') + '</div>').join('') + '</div>';
  }
  const by3 = (o, f) => ['Timișoara', 'Arad', 'total'].map((c) => f(o[c] || {}));
  function cWa() {
    const d = S.c, w = waOf(), st = d.state;
    const r = (l, k, tone) => [l, by3(w, (x) => n0(x[k])), tone];
    const list = [r('Lista', 'list'), r('Trimise', 'sent'), r('Netrimise încă', 'waiting'), r('Eșuate la trimitere', 'failedSend', 'is-bad'), r('Eșuate după', 'failedLater', 'is-bad'),
      r('Livrate', 'delivered'), r('Citite', 'read'), r('Au răspuns', 'replied'), r('„Rezerv în clinică”', 'taps', 'is-good'), r('Au scris', 'texts'), r('Nu mai vor', 'stop')];
    const fails = (d.fails || []).map((f) => '<li><b>' + esc(K.num(f.n)) + '</b><span>' + esc(f.why) + (f.code ? ' <small>(cod ' + esc(f.code) + ')</small>' : '') + '</span><em>' + CITIES.filter((c) => f.by[c]).map((c) => SHORT[c] + ' ' + f.by[c]).join(' · ') + '</em></li>').join('');
    const late = st.tracked && Date.parse(st.tracked) - Date.parse(st.from) > 10 * 60e3;
    const meta = CITIES.map((c) => {
      const x = (d.meta.by || {})[c];
      if (!x || x.error) return '<li><b>' + SHORT[c] + '</b><span class="k-muted">—' + (x && x.error ? ' ' + esc(x.error) : '') + '</span></li>';
      const link = (x.clicks || []).filter((k) => /url/i.test(k.type)).reduce((a, k) => a + k.n, 0), quick = (x.clicks || []).filter((k) => !/url/i.test(k.type)).reduce((a, k) => a + k.n, 0);
      return '<li><b>' + SHORT[c] + '</b><span>' + esc(K.num(x.sent)) + ' trimise · ' + esc(K.num(x.delivered)) + ' livrate · ' + esc(K.num(x.read)) + ' citite · ' + esc(K.num(link)) + ' clicuri pe link · ' + esc(K.num(quick)) + ' pe „Rezerv”</span></li>';
    }).join('');
    return '<section class="k-card tf-card"><div class="k-card-head"><h3>' + icon('chat') + 'WhatsApp</h3><span class="k-sub">' + esc(K.num(w.total.list)) + ' persoane</span></div>' +
      table(['TM', 'AR', 'Total'], list) +
      (fails ? '<h4 class="cp-h">De ce n-au primit</h4><ul class="cp-why">' + fails + '</ul>' : '') +
      '<h4 class="cp-h">Cifrele Meta pentru șablon</h4><ul class="cp-meta">' + meta + '</ul>' +
      '<p class="tf-foot k-muted">Livrate și citite vin de la Meta pe fiecare mesaj' + (late ? ', numărate din ' + esc(dayHour(st.tracked)) + ': cele de dinainte nu le-am primit (cifrele Meta de mai sus le au, când contul le dă)' : '') + '. Clicurile pe linkul din mesaj le știe doar Meta; pe site le vezi ca vizite.</p></section>';
  }
  function cSite() {
    const d = S.c, g = d.site[S.src] || {}, pick = (k) => (S.dev === 'all' ? (g.m[k] || 0) + (g.d[k] || 0) : (g[S.dev][k] || 0));
    const list = [['Vizite', pick('visit')], ['Au văzut cardul', pick('seen')], ['„Plătesc online”', pick('buy')], ['Comandă creată', pick('order')], ['Spre myPOS', pick('pay')], ['Plătite online', pick('paid')],
      ['„Rezerv în clinică”', pick('res'), 'În clinică', pick('seen')], ['Rezervări create', pick('resv')], ['Plătite în clinică', pick('cpaid')]];
    const lost = pick('order') - pick('pay');
    return '<section class="k-card tf-card"><div class="k-card-head"><h3>' + icon('globe') + 'Pe site</h3><div class="cp-segs">' +
      segBox('cpsrc', [['camp', 'Din mesaj'], ['page', 'Toată pagina cardului']], S.src) + segBox('cpdev', [['all', 'Toate'], ['m', 'Telefon'], ['d', 'Calculator']], S.dev) + '</div></div>' +
      rows(list, pick('visit')) +
      (lost > 0 ? '<p class="cp-leak">' + icon('alert') + 'Comenzi online fără drumul spre myPOS: ' + esc(K.num(lost)) + '. Verifică trimiterea spre plată.</p>' : '') +
      '<p class="tf-foot k-muted">' + (S.src === 'camp' ? 'Cine a venit pe linkul din mesaj (utm_campaign=card-sarbatori), pe orice pagină după.' : 'Toți vizitatorii paginii /card-sarbatori, din orice sursă, din ziua trimiterii.') +
      ' O vizitatoare se numără o dată pe zi. Comenzile și plățile vin din comenzi (linkul și telefonul sau calculatorul de pe ele).</p></section>';
  }
  function cMoney() {
    const d = S.c, mo = S.ms === 'camp' ? campOf() : d.money.all, b = mo.by, sp = d.money.split;
    const r = (l, f, tone) => [l, by3(b, f), tone];
    const list = [r('Comenzi online începute', (x) => n0(x.online)), r('Plătite online', (x) => n0(x.onlinePaid), 'is-good'), r('Online, încă în cele 2 ore', (x) => n0(x.onlineWaiting)),
      r('Online neplătite, expirate', (x) => n0(x.onlineExpired), 'is-bad'), r('Rezervate pentru clinică', (x) => n0(x.resv)), r('Rezervări încă de plătit', (x) => n0(x.resvOpen)), r('Plătite în clinică', (x) => n0(x.clinicPaid), 'is-good'),
      r('Anulate', (x) => n0(x.cancelled)), r('Carduri plătite', (x) => n0(x.cards)), r('Încasat', (x) => lei0(x.cash), 'is-good'), r('Credit vândut', (x) => lei0(x.credit)),
      r('Până la plată online', (x) => mins(x.minOnline)), r('Până la plata în clinică', (x) => mins(x.minClinic))];
    const tiers = Object.keys(mo.tiers).map((t) => [(t === '9900' ? 'VIP 9.900' : t) + ' lei', [n0(mo.tiers[t].orders), n0(mo.tiers[t].cards), lei0(mo.tiers[t].cash)]]);
    const spl = [['Telefon din listă', sp.list], ['Alt telefon, din linkul mesajului', sp.link], ['Restul (alte surse)', sp.rest]].map(([l, x]) => [l, [n0(x.orders), n0(x.paid), lei0(x.cash)]]);
    return '<section class="k-card tf-card"><div class="k-card-head"><h3>' + icon('wallet') + 'Comenzi și bani</h3>' + segBox('cpmoney', [['camp', 'Din campanie'], ['all', 'Toate comenzile']], S.ms) + '</div>' +
      table(['TM', 'AR', 'Total'], list) +
      '<h4 class="cp-h">Pe card</h4>' + table(['Comenzi', 'Plătite', 'Încasat'], tiers.map(([l, v]) => [l, v])) +
      '<h4 class="cp-h">De unde vin comenzile de după trimitere</h4>' + table(['Comenzi', 'Plătite', 'Încasat'], spl) +
      '<p class="tf-foot k-muted">' + (S.ms === 'camp' ? 'Din campanie: comenzi făcute după primul mesaj, de un telefon din listă sau din linkul mesajului.' : 'Toate comenzile cardului, de la începutul vânzării, din orice sursă.') +
      ' O comandă online neplătită ține cardurile 2 ore, apoi expiră. „Pe card”: carduri plătite.</p></section>';
  }
  function cHours() {
    const h = S.c.hours;
    if (!h || !h.keys.length) return '';
    const leg = [['Citite', 'var(--info)'], ['Vizite din mesaj', 'var(--accent)'], ['Comenzi', 'var(--warn)'], ['Plătite', 'var(--good)']];
    return '<section class="k-card tf-card"><div class="k-card-head"><h3>' + icon('trend') + (h.unit === 'day' ? 'Zi cu zi' : 'Oră cu oră') + ' de la trimitere</h3></div>' +
      '<div class="cp-legend">' + leg.map(([l, c]) => '<span><i style="background:' + c + '"></i>' + esc(l) + '</span>').join('') + '</div>' +
      '<div data-cpchart></div></section>';
  }
  function drawHours(el) {
    const h = S.c.hours;
    const label = (k) => (h.unit === 'day' ? k.slice(8, 10) + '.' + k.slice(5, 7) : k.slice(11, 13) + ':00');
    const long = (k) => (h.unit === 'day' ? k.slice(8, 10) + '.' + k.slice(5, 7) : k.slice(8, 10) + '.' + k.slice(5, 7) + ', ' + k.slice(11, 13) + ':00');
    // the sends (all in the first minutes) only in the tooltip: as bars they would flatten everything else
    const series = [{ name: 'Citite', values: h.read, color: 'var(--info)', kind: 'line' },
      { name: 'Vizite din mesaj', values: h.visits, color: 'var(--accent)', kind: 'line' }, { name: 'Comenzi', values: h.orders, color: 'var(--warn)', kind: 'line' }, { name: 'Plătite', values: h.paid, color: 'var(--good)', kind: 'line' }];
    el.innerHTML = ''; el._kro = null;
    K.chart(el, { labels: h.keys.map(label), height: 210, series, format: K.num, axis: (v) => Math.round(v),
      tip: (i) => '<b>' + esc(long(h.keys[i])) + '</b>' + (h.sent[i] ? '<span><i style="background:var(--muted)"></i>Trimise: ' + esc(K.num(h.sent[i])) + '</span>' : '') + series.map((s) => '<span><i style="background:' + s.color + '"></i>' + esc(s.name) + ': ' + esc(K.num(s.values[i])) + '</span>').join('') });
  }
  const AKIND = { tap: ['is-good', '„Rezerv” pe WhatsApp'], text: ['is-info', 'A scris'], stop: ['is-bad', 'Nu mai vrea'] };
  const hm = (iso) => { if (!iso) return ''; const today = fmt(new Date().toISOString(), { day: '2-digit', month: '2-digit' }), d = fmt(iso, { day: '2-digit', month: '2-digit' }); return (d === today ? '' : d + ' ') + fmt(iso, { hour: '2-digit', minute: '2-digit' }); };
  // her steps in order: [label, time, tone]; the last one (muted, no time) is where she stopped
  function stepsOf(p) {
    const out = [];
    if (p.fail) return [['N-a primit: ' + p.fail, '', 'is-bad is-wrap']];
    if (!p.sent) return [['Netrimis încă', '', 'is-off']];
    out.push(['Trimis', p.sent, '']);
    if (p.delivered != null) out.push(['Livrat', p.delivered, '']);
    if (p.read != null) out.push(['Citit', p.read, 'is-info']);
    const seenK = new Set();
    p.answers.forEach((a) => { if (seenK.has(a.kind)) return; seenK.add(a.kind); const k = AKIND[a.kind] || ['', 'A scris']; out.push([k[1], a.at, k[0]]); });
    const trailPay = p.orders.some((o) => (o.trail || []).some((e) => e.ev === 'to_paylink'));
    if (p.site) [['visit', 'Pe site', ''], ['seen', 'A văzut cardul', ''], ['buy', '„Plătesc online”', 'is-warn'], ['res', '„Rezerv” pe site', 'is-info'], ['pay', 'Spre myPOS', 'is-warn']].forEach(([k, l, t]) => { if (p.site[k] && !(k === 'pay' && trailPay)) out.push([l, p.site[k], t]); });
    p.orders.forEach((o) => {
      const card = (o.qty > 1 ? o.qty + ' × ' : '') + o.tier + ' lei';
      if (o.trail && o.trail.length) { trailSteps(o, card).forEach((x) => out.push(x)); return; }
      if (o.pay === 'online') { out.push(['Comandă online ' + card, o.created, 'is-warn']); if (!p.site || !p.site.pay) out.push(['Trimisă la myPOS', o.created, '']); }
      else out.push(['Rezervat în clinică ' + card, o.created, 'is-info']);
      if (o.status === 'platit') out.push(['Plătit ' + (o.paidVia === 'online' ? 'online' : 'în clinică'), o.paidAt, 'is-good']);
      else if (o.status === 'anulat') out.push(['Anulat', '', 'is-bad']);
      else if (o.expired) out.push(['Neplătit, a expirat', '', 'is-bad']);
      else if (o.pay === 'online') out.push(['Încă la plată', '', 'is-off']);
      else out.push(['De plătit în clinică', '', 'is-off']);
    });
    // where she stopped (an answer or a visit says she read it, even when her phone sends no read receipt)
    if (!p.orders.length) out.push([p.answers.length || p.site ? 'Fără comandă' : p.delivered == null ? 'Nelivrat încă' : p.read == null ? 'N-a citit' : 'Fără comandă', '', 'is-off']);
    // by time (what has none, her state now, stays at the end)
    const timed = out.filter((x) => x[1]).map((x, i) => [x, i]).sort((a, b) => String(a[0][1]).localeCompare(String(b[0][1])) || a[1] - b[1]).map((x) => x[0]);
    return timed.concat(out.filter((x) => !x[1]));
  }
  // an order's trail (api/_lib/card-sarbatori.js mark): what happened to it, in order; its state at the end when the trail
  // doesn't say it
  const REASON = { retry: 'încearcă din nou', declined: 'card refuzat', nocard: 'n-avea cardul', confusing: 'n-a înțeles pagina', clinic: 'preferă clinica', no: 's-a răzgândit' };
  const ok = (n) => !/^netrimis/.test(String(n || ''));
  function trailSteps(o, card) {
    const out = [];
    const T = {
      created: () => [(o.pay === 'online' || o.converted ? 'Comandă online ' : 'Rezervat în clinică ') + card, o.pay === 'online' || o.converted ? 'is-warn' : 'is-info'],
      to_paylink: (n) => [n === 'whatsapp' ? 'Spre myPOS (din WhatsApp)' : 'Spre myPOS', 'is-warn'],
      returned: () => ['Înapoi pe site, neplătit', 'is-bad'],
      reason: (n) => ['Motiv: ' + (REASON[n] || n), 'is-bad'],
      wa1: (n) => ['Mesaj de recuperare 1' + (ok(n) ? '' : ' (netrimis)'), ok(n) ? '' : 'is-off'],
      wa2: (n) => ['Mesaj de recuperare 2' + (ok(n) ? '' : ' (netrimis)'), ok(n) ? '' : 'is-off'],
      replied: (n) => ['A răspuns' + (n === 'pay' ? ': plătesc' : n === 'clinic' ? ': în clinică' : n === 'no' ? ': nu' : ''), n === 'no' ? 'is-bad' : 'is-info'],
      converted: () => ['Mutat în clinică', 'is-info'],
      expired: () => ['Expirat (2 ore)', 'is-bad'],
      paid: () => ['Plătit ' + (o.paidVia === 'online' ? 'online' : 'în clinică'), 'is-good'],
      cancelled: (n) => ['Anulat' + (n === 'ea' ? ' de ea' : ''), 'is-bad'],
      ask_name: (n) => ['I-am cerut numele' + (ok(n) ? '' : ' (netrimis)'), ok(n) ? '' : 'is-off'],
      named: () => ['Nume pe card', ''],
      card_sent: (n) => ['Cardul pe WhatsApp' + (ok(n) ? '' : ' (netrimis)'), ok(n) ? 'is-good' : 'is-bad'],
    };
    o.trail.forEach((e) => { const f = T[e.ev]; if (f) { const [l, t] = f(e.note); out.push([l, e.at, t]); } });
    const evs = new Set(o.trail.map((e) => e.ev));
    if (!evs.has('created')) out.unshift([(o.pay === 'online' ? 'Comandă online ' : 'Rezervat în clinică ') + card, o.created, o.pay === 'online' ? 'is-warn' : 'is-info']);
    if (o.status === 'platit' && !evs.has('paid')) out.push(['Plătit ' + (o.paidVia === 'online' ? 'online' : 'în clinică'), o.paidAt, 'is-good']);
    else if (o.status === 'anulat' && !evs.has('cancelled')) out.push(['Anulat', '', 'is-bad']);
    else if ((o.status === 'asteptare' || o.status === 'matching') && !o.expired) out.push(['Încă la plată', '', 'is-off']);
    else if (o.status === 'asteptare' && !evs.has('expired')) out.push(['Neplătit, a expirat', '', 'is-bad']);
    else if (o.status === 'rezervat') out.push(['De plătit în clinică', '', 'is-off']);
    return out;
  }
  const apptTxt = (a) => fmt(a.date + 'T12:00:00Z', { day: '2-digit', month: '2-digit' }) + (a.time ? ' ' + a.time : '') + (a.city ? ' ' + (SHORT[a.city] || a.city) : '');
  // her card now: paid, a request to call, at the payment, or nothing
  function stateChip(p) {
    const o = p.orders.slice().reverse();
    const paid = o.find((x) => x.status === 'platit'), req = o.find((x) => x.status === 'rezervat' || x.status === 'lead'), pay = o.find((x) => (x.status === 'asteptare' || x.status === 'matching') && !x.expired);
    if (paid) return '<span class="cp-chip is-good">Plătit ' + esc(paid.tier) + '</span>';
    if (req) return '<span class="cp-chip is-warn">Cerere ' + esc(req.tier) + '</span>';
    if (pay) return '<span class="cp-chip is-warn">La plată ' + esc(pay.tier) + '</span>';
    return '';
  }
  const paidOf = (p) => p.orders.some((o) => o.status === 'platit');
  const PF = [
    ['all', 'Toate', () => true],
    ['read', 'Au citit, fără comandă', (p) => p.read != null && !p.orders.length],
    ['unpaid', 'Au început plata, n-au plătit', (p) => p.orders.some((o) => (o.pay === 'online' || o.converted) && o.status !== 'platit')],
    ['resv', 'Au rezervat', (p) => p.orders.some((o) => o.pay !== 'online') || p.answers.some((a) => a.kind === 'tap')],
    ['paid', 'Au plătit', paidOf],
    ['ans', 'Au răspuns', (p) => p.answers.length > 0],
  ];
  const rank = (p) => (paidOf(p) ? 7 : p.orders.length ? 6 : p.site ? 5 : p.answers.length ? 4 : p.read != null ? 3 : p.delivered != null ? 2 : p.sent ? 1 : 0);
  const lastAt = (p) => { const st = stepsOf(p).filter((x) => x[1]); return st.length ? st[st.length - 1][1] : ''; };
  const chips = (p, max) => { const st = stepsOf(p); const show = max && st.length > max ? st.slice(st.length - max) : st; return (show.length < st.length ? '<span class="cp-chip is-off">…</span>' : '') + show.map(([l, t, tone]) => '<span class="cp-chip ' + tone + '">' + esc(l) + (t ? ' <small>' + esc(hm(t)) + '</small>' : '') + '</span>').join('<i class="cp-arr" aria-hidden="true">›</i>'); };
  function cPeople() {
    const list = (S.c.people || []).filter((p) => bAll() || p.batch === S.batch);
    const f = PF.find((x) => x[0] === S.pf) || PF[0];
    const seg = segBox('cppeople', PF.map(([v, l, fn]) => [v, l + ' ' + list.filter(fn).length]), f[0]);
    const shown = list.filter(f[2]).sort((a, b) => rank(b) - rank(a) || String(lastAt(b)).localeCompare(String(lastAt(a))));
    const page = shown.slice(0, S.pn || 40);
    const rowsH = page.map((p) => '<button type="button" class="k-row is-click tf-person cp-person" data-cpp="' + esc(p.k) + '">' +
        '<div class="k-row-main"><div class="k-row-title">' + esc(p.name || p.phone) + '</div>' +
        '<div class="k-row-sub">' + esc(SHORT[p.city] || '') + ' · ' + esc(p.phone) + '</div>' +
        '<div class="cp-meta-row"><span class="cp-chip">Lotul ' + esc(p.batch) + ' · ' + esc(MSG(p.msg)) + '</span>' + stateChip(p) +
          (p.appt ? '<span class="cp-chip is-info">' + icon('calendar') + esc(apptTxt(p.appt)) + '</span>' : '') + '</div>' +
        '<div class="cp-chips">' + chips(p, 5) + '</div></div></button>').join('');
    const more = shown.length > page.length ? '<button type="button" class="k-btn is-outline cp-more" data-cp="more">Mai arată ' + esc(K.num(Math.min(40, shown.length - page.length))) + ' din ' + esc(K.num(shown.length - page.length)) + '</button>' : '';
    return '<section class="k-card tf-card"><div class="k-card-head"><h3>' + icon('users') + 'Fiecare persoană</h3><span class="k-sub">' + esc(K.num(list.length)) + ' în listă</span></div>' + '<div class="tf-filter">' + seg + '</div>' +
      (rowsH ? '<div class="k-list">' + rowsH + '</div>' + more : K.empty('users', 'Nimeni aici', 'Nicio persoană din listă nu e în pasul ăsta acum.')) +
      '<p class="tf-foot k-muted">' + (S.c.tokens ? 'Pașii de pe site se văd la cine a venit pe linkul ei personal (' + esc(K.num(S.c.tokens)) + ').' : 'Ce a făcut pe site nu se poate lega de o persoană cu linkul de acum (același pentru toate): pe site vezi pâlnia de mai sus. Comanda se leagă de ea după telefon.') + '</p></section>';
  }
  function cardPerson(p, from) {
    const st = stepsOf(p).map(([l, t, tone]) => '<li class="cp-tl ' + tone + '"><span class="k-muted">' + esc(t ? dayHour(t) : '') + '</span>' + esc(l) + '</li>').join('');
    const ans = p.answers.slice().reverse().map((a) => '<li><span class="k-muted">' + esc(dayHour(a.at)) + ' · ' + esc((AKIND[a.kind] || ['', ''])[1]) + '</span>„' + esc(a.text || '') + '”</li>').join('');
    K.drawer({
      from, focus: false, icon: 'user', title: p.name || p.phone, subtitle: esc((p.city || '') + ' · ' + p.phone), width: 480,
      body: '<div class="tf-sheet"><div class="tf-sheet-go"><a class="k-btn is-outline" href="' + esc(K.tel(p.phone)) + '">' + icon('phone') + 'Sună</a>' +
        '<a class="k-btn is-outline" href="#mesaje" data-cpchat>' + icon('chat') + 'Mesaje</a></div>' +
        '<h4 class="tf-sheet-h">Pașii ei</h4><ul class="tf-log cp-tlist">' + st + '</ul>' +
        (ans ? '<h4 class="tf-sheet-h">Ce a scris</h4><ul class="tf-log">' + ans + '</ul>' : '') + '</div>',
      onMount(el, h) { el.querySelector('[data-cpchat]').addEventListener('click', (e) => { e.preventDefault(); h.close(); K.go('mesaje'); }); },
    });
  }

  const VIEWS = { transformarea: paintTf, card: paintCard };

  async function onClick(e) {
    const pick = e.target.closest('[data-k-seg="campaign"] > button');
    if (pick) {
      if (pick.dataset.v === S.camp) return;
      S.camp = pick.dataset.v; S.err = null; S.drawn = false; pickSave(S.camp);
      paint(); // at once, from what is known (or a skeleton): the new screen slides in with the tap
      load(!!dataOf(S.camp));
      return;
    }
    const cs = e.target.closest('[data-k-seg^="cp"] > button');
    if (cs) {
      const n = cs.parentElement.dataset.kSeg, v = cs.dataset.v;
      if (n === 'cpbatch') { S.batch = v; S.pn = 40; } else if (n === 'cpcity') S.cc = v; else if (n === 'cpsrc') S.src = v; else if (n === 'cpdev') S.dev = v; else if (n === 'cpmoney') S.ms = v; else if (n === 'cppeople') { S.pf = v; S.pn = 40; } else return;
      paint(); return;
    }
    const cr = e.target.closest('[data-cpp]');
    if (cr) { const p = ((S.c && S.c.people) || []).find((x) => x.k === cr.dataset.cpp); if (p) cardPerson(p, cr); return; }
    const cb = e.target.closest('[data-cp]');
    if (cb && cb.dataset.cp === 'refresh') return K.busy(cb, () => load(false, 'refresh'));
    if (cb && cb.dataset.cp === 'more') { S.pn = (S.pn || 40) + 40; paint(); return; }
    if (cb && cb.dataset.cp === 'carduri') { K.go('carduri'); return; }
    const lr = e.target.closest('[data-cplot]');
    if (lr) { S.batch = S.batch === lr.dataset.cplot ? 'all' : lr.dataset.cplot; S.pn = 40; paint(); panel.querySelector('[data-cppick]').scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    const city = e.target.closest('[data-tfcity] > button');
    if (city) { S.city = city.dataset.v; paint(); return; }
    const f = e.target.closest('[data-tffilter] > button');
    if (f) { S.filter = f.dataset.v; paint(); return; }
    const row = e.target.closest('[data-tfp]');
    if (row) { const p = (S.d.people || []).find((x) => x.k === row.dataset.tfp); if (p) personSheet(p, row); return; }
    const b = e.target.closest('[data-tf]');
    if (!b) return;
    const a = b.dataset.tf;
    if (a === 'reload') return load();
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
      paint();
      load();
      clearInterval(S.timer);
      S.timer = setInterval(() => { if (!document.hidden && K.isActive('transformare') && !K.drawerOpen) load(true); }, 30000);
    },
  });
  K.everySecond(() => { if (K.isActive('transformare')) tick(); });
})();
