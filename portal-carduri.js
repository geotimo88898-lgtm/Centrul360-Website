// Centrul360 portal, „Carduri de Sărbători” (the owner, 21.11): admin, manager and reception (reception records payments).
//   on top     the wave of now (Valul 2 din 7: left, sold; the owner sets the waves, „Valuri”; only here, never on the site), the money of the cards paid, the credit used, the WhatsApp templates
//   De confirmat  the orders sent to the PayLink (found in myPOS by themselves, or one tap here) and the reservations to pay
//              in the clinic: „Confirmă plata (X lei)”, „Anulează”
//   the cards  code, name on the card, who bought it, phone, the card, credit used / left, state, clinic, bonuses, dates;
//              search by code or name, chips by state; „Adaugă card plătit” for a payment seen in myPOS or in the clinic
//   a card     its picture (download, send on WhatsApp again, or by hand when no template is approved yet), the credit
//              used: the treatments of the price list (list price) or typed, the gift as its own line, who did it, the
//              clinic, the date; the history; undo the last one (admin only)
// The rules live on the server (api/card-sarbatori.js, api/_lib/card-sarbatori.js); nothing of them is decided here.
(function () {
  'use strict';
  const K = window.K;
  if (!K) return;
  const { esc, icon } = K;
  const S = { d: null, q: '', f: 'all', box: null, busy: false };
  const STATE = { activ: ['Activ', 'is-good'], folosit: ['Folosit', 'is-done'], expirat: ['Expirat', 'is-warn'], anulat: ['Anulat', 'is-bad'], rezervat: ['Rezervat', 'is-info'], asteptare: ['În așteptarea plății', 'is-warn'] };
  const FILTERS = [['all', 'Toate'], ['activ', 'Active'], ['folosit', 'Folosite'], ['expirat', 'Expirate']];
  const lei = (n) => K.lei(n);
  const when = (iso) => { const t = Date.parse(iso); return Number.isFinite(t) ? new Date(t).toLocaleDateString('ro-RO', { timeZone: 'Europe/Bucharest', day: 'numeric', month: 'short' }) + ', ' + new Date(t).toLocaleTimeString('ro-RO', { timeZone: 'Europe/Bucharest', hour: '2-digit', minute: '2-digit' }) : ''; };
  const dayOf = (iso) => { const t = Date.parse(iso); return Number.isFinite(t) ? new Date(t).toLocaleDateString('ro-RO', { timeZone: 'Europe/Bucharest', day: 'numeric', month: 'short', year: 'numeric' }) : ''; };
  const api = (b) => K.api('/api/card-sarbatori', b);
  const tag = (st) => { const x = STATE[st] || [st, '']; return '<span class="k-tag ' + x[1] + '">' + esc(x[0]) + '</span>'; };
  const img = (code, dl) => '/api/card-sarbatori?img=' + encodeURIComponent(code) + (dl ? '&dl=1' : '') + '&v=' + encodeURIComponent((S.d && S.d.cards.find((c) => c.code === code) || {}).recipient || '');

  function mount(p) {
    S.box = p;
    p.classList.add('k-panel', 'cd');
    p.innerHTML = '<div class="k-head"><div><div class="k-eyebrow">Clinică</div><h2>Carduri de Sărbători</h2></div><div class="k-head-actions"><button type="button" class="k-btn is-outline admin-only hidden" data-cd-stock>' + icon('sliders') + 'Valuri</button><button type="button" class="k-btn is-primary" data-cd-add>' + icon('plus') + 'Adaugă card plătit</button></div></div>' +
      '<div data-cd-body><div class="k-skel" style="height:110px;border-radius:18px"></div><div class="k-skel" style="height:360px;margin-top:1rem;border-radius:18px"></div></div>';
    p.addEventListener('click', onClick);
    p.addEventListener('input', (e) => { if (e.target.matches('[data-cd-q]')) { S.q = e.target.value; paintList(); } });
  }
  async function load(quiet) {
    try { S.d = await api({ action: 'list', scan: !quiet }); const sb = S.box.querySelector('[data-cd-stock]'); if (sb) sb.classList.toggle('hidden', S.d.role !== 'admin'); paint(); }
    catch (err) { const b = S.box && S.box.querySelector('[data-cd-body]'); if (b && !S.d) b.innerHTML = '<section class="k-card">' + K.empty('alert', 'Nu am putut încărca cardurile', esc(K.errText(err))) + '</section>'; }
  }

  // ------------------------------------------------------------------ the page
  function paint() {
    const d = S.d, body = S.box && S.box.querySelector('[data-cd-body]');
    if (!d || !body) return;
    const t = d.totals || {};
    const tpl = d.templates || {}, tplOk = Object.values(tpl).length && Object.values(tpl).every((x) => x === 'APPROVED');
    const stat = (ic, cls, label, value, sub) => '<div class="k-stat ' + cls + '"><div class="k-stat-top"><span class="k-stat-ic">' + icon(ic) + '</span><span class="k-stat-l">' + label + '</span></div><div class="k-stat-value">' + value + '</div><div class="k-stat-sub">' + sub + '</div></div>';
    body.innerHTML = '<div class="k-grid c4 cd-stats">' +
      stat('gift', 'is-accent', 'Valul ' + d.wave.n + ' din ' + d.wave.of, d.wave.soldOut ? 'Epuizat' : d.wave.left + ' <small>rămase</small>', d.wave.sold + ' vândute din val · ' + d.sold + ' în total') +
      stat('wallet', 'is-good', 'Încasat din carduri', lei(t.money || 0), (t.cards || 0) + ' carduri plătite · ' + lei(t.online || 0) + ' online') +
      stat('card', '', 'Credit folosit', lei(t.used || 0), 'din ' + lei(t.credit || 0) + ' credit dat') +
      stat('chat', tplOk ? 'is-good' : 'is-warn', 'Mesaje WhatsApp', tplOk ? 'Automate' : 'Manual', tplOk ? 'șabloanele sunt aprobate de Meta' : 'șabloanele așteaptă aprobarea Meta') +
      '</div>' +
      '<div data-cd-orders></div>' +
      '<section class="k-card cd-list"><div class="cd-bar"><label class="k-search">' + icon('search') + '<input data-cd-q type="search" placeholder="Caută după cod sau nume…" autocomplete="off" value="' + esc(S.q) + '"></label>' +
      '<div class="k-chips" data-cd-chips></div></div><div data-cd-rows></div></section>' +
      '<p class="k-muted cd-foot">Folosirea creditului nu e o încasare nouă: banii au intrat o dată, la plata cardului. Cardul se folosește la prețul de listă, nu peste ofertele reduse. Valabil până pe 30.06.2027.</p>';
    paintOrders(); paintList();
  }
  function paintOrders() {
    const box = S.box.querySelector('[data-cd-orders]'), list = S.d.orders || [];
    if (!list.length) { box.innerHTML = ''; return; }
    box.innerHTML = '<section class="k-card cd-orders"><div class="k-card-head"><h3>De confirmat</h3><span class="k-muted">' + list.length + '</span></div><div class="k-list">' +
      list.map((o) => '<div class="k-row cd-order"><div class="k-row-main"><div class="k-row-title">' + esc(o.name || 'Fără nume') + ' · ' + o.qty + ' × ' + o.tier + ' lei</div>' +
        '<div class="k-row-sub">' + (o.pay === 'online' ? 'La plata online (myPOS) · se confirmă singură când apare plata' : 'Plătește în clinică') + ' · ' + esc(o.city) + ' · ' + esc(when(o.created)) +
        (o.names.some(Boolean) ? ' · pe numele: ' + esc(o.names.map((n) => n || 'ea').join(', ')) : '') + ' · <a href="' + K.tel(o.phone) + '">' + esc(o.phone) + '</a></div></div>' +
        '<div class="k-row-end">' + tag(o.status) + '<button type="button" class="k-btn is-primary is-sm" data-cd-confirm="' + esc(o.id) + '" data-via="' + (o.pay === 'online' ? 'online' : 'clinica') + '">' + icon('check') + 'Confirmă plata (' + lei(o.amount) + ')</button>' +
        '<button type="button" class="k-btn is-ghost is-sm" data-cd-cancel="' + esc(o.id) + '">Anulează</button></div></div>').join('') + '</div></section>';
  }
  function paintList() {
    const box = S.box && S.box.querySelector('[data-cd-rows]');
    if (!box || !S.d) return;
    const all = S.d.cards || [];
    const n = (k) => (k === 'all' ? all.length : all.filter((c) => c.state === k).length);
    S.box.querySelector('[data-cd-chips]').innerHTML = FILTERS.map(([k, l]) => '<button type="button" class="k-chip' + (S.f === k ? ' is-on' : '') + '" data-cd-f="' + k + '">' + l + '<span>' + n(k) + '</span></button>').join('');
    const q = K.norm ? K.norm(S.q) : S.q.toLowerCase();
    const hit = (c) => !q || [c.code, c.recipient, c.buyer, c.phone].some((x) => (K.norm ? K.norm(x || '') : String(x || '').toLowerCase()).includes(q));
    const rows = all.filter((c) => (S.f === 'all' || c.state === S.f) && hit(c));
    if (!rows.length) { box.innerHTML = K.empty('gift', all.length ? 'Niciun card găsit' : 'Niciun card plătit încă', all.length ? 'Încearcă alt cod sau alt nume.' : 'Un card apare aici imediat ce plata e confirmată.'); return; }
    box.innerHTML = '<div class="k-list cd-rows">' + rows.map((c) => {
      const pct = c.value ? Math.round((c.left / c.value) * 100) : 0;
      return '<button type="button" class="k-row is-click cd-row" data-cd-open="' + esc(c.code) + '">' +
        '<span class="cd-mini" aria-hidden="true"><b>' + esc(String(c.value / 1000 >= 1 ? (c.value / 1000).toLocaleString('ro-RO') + 'k' : c.value)) + '</b></span>' +
        '<span class="k-row-main"><span class="k-row-title"><span>' + esc(c.recipient || c.buyer || 'Fără nume') + '</span><span class="cd-code">' + esc(c.code) + '</span></span>' +
        '<span class="k-row-sub">' + (c.recipient && c.recipient !== c.buyer ? 'Cumpărat de ' + esc(c.buyer) + ' · ' : '') + esc(c.phone) + ' · ' + esc(c.city) + ' · ' + c.tier + ' lei, ' + (c.paidVia === 'online' ? 'online' : 'în clinică') + ' · ' + esc(dayOf(c.paidAt)) +
        (c.gift ? ' · ' + (c.gift.state === 'open' ? 'Cadou: ' : 'Cadou folosit: ') + esc(c.gift.what) : '') + (c.club ? ' · Clubul 360' : '') + '</span>' +
        '<span class="cd-bar2" aria-hidden="true"><i style="width:' + pct + '%"></i></span></span>' +
        '<span class="k-row-end"><span class="cd-left"><b>' + lei(c.left) + '</b><small>din ' + lei(c.value) + '</small></span>' + tag(c.state) + (c.sent && !c.sent.how ? '<span class="k-tag is-warn">De trimis manual</span>' : '') + '</span></button>';
    }).join('') + '</div>';
  }

  // ------------------------------------------------------------------ actions
  async function onClick(e) {
    const b = e.target.closest('button, a');
    if (!b || !S.box.contains(b)) return;
    if (b.dataset.cdF) { S.f = b.dataset.cdF; paintList(); return; }
    if (b.hasAttribute('data-cd-add')) { addDrawer(b); return; }
    if (b.hasAttribute('data-cd-stock')) { stockDrawer(b); return; }
    if (b.dataset.cdOpen) { cardDrawer(b.dataset.cdOpen, b); return; }
    if (b.dataset.cdConfirm) {
      const o = (S.d.orders || []).find((x) => x.id === b.dataset.cdConfirm);
      if (!o) return;
      if (b.dataset.via !== 'online') { payDrawer(o, b); return; }
      if (!(await K.ui().confirm({ title: 'Confirmi plata?', message: o.name + ': ' + o.qty + ' × ' + o.tier + ' lei = ' + lei(o.amount) + ', plătit online (verificat în myPOS). Cardul se emite, pleacă pe WhatsApp și plata intră în Încasări.', confirmText: 'Confirmă plata' }))) return;
      await K.busy(b, () => doConfirm(o, 'online', 'card'));
      return;
    }
    if (b.dataset.cdCancel) {
      if (!(await K.ui().confirm({ title: 'Anulezi comanda?', message: 'Cardurile ei se întorc în stoc.', confirmText: 'Anulează', danger: true }))) return;
      await K.busy(b, async () => { try { await api({ action: 'cancel', id: b.dataset.cdCancel }); await load(true); } catch (err) { K.ui().toast(K.errText(err), 'error'); } });
    }
  }

  async function doConfirm(o, via, method) {
    try {
      const r = await api({ action: 'confirm', id: o.id, via, method });
      const sent = (r.cards || []).filter((c) => c.sent && c.sent.how).length;
      K.ui().toast(r.again ? 'Era deja confirmată.' : 'Card emis, plata în Încasări' + (sent ? ', trimis pe WhatsApp.' : '. WhatsApp: de trimis manual (din card).'), 'success');
      await load(true);
      return true;
    } catch (err) { K.ui().toast(K.errText(err), 'error'); return false; }
  }
  // paid in the clinic: how (card on the POS, cash, transfer); the payment goes in Încasări with it
  function payDrawer(o, from) {
    K.drawer({
      from, title: 'Confirmă plata în clinică', icon: 'wallet', width: 460,
      subtitle: esc(o.name) + ' · ' + o.qty + ' × ' + o.tier + ' lei = ' + lei(o.amount) + '. Cardul se emite, pleacă pe WhatsApp și plata intră în Încasări.',
      body: '<form class="k-form cd-waves" data-f>' + K.field('Cum a plătit', K.seg('method', [['card', 'Card (POS)'], ['cash', 'Cash'], ['transfer', 'Transfer']], 'card')) + '</form>',
      footer: '<button type="button" class="k-btn" data-cancel>Renunță</button><span class="k-grow"></span><button type="button" class="k-btn is-primary" data-save>' + icon('check') + 'Confirmă plata (' + lei(o.amount) + ')</button>',
      onMount(root, h) {
        root.querySelector('[data-cancel]').addEventListener('click', () => h.close());
        root.querySelector('[data-save]').addEventListener('click', (ev) => K.busy(ev.currentTarget, async () => {
          const v = K.formValues(root.querySelector('[data-f]'));
          if (await doConfirm(o, 'clinica', v.method)) h.close();
        }));
      },
    });
  }

  // the waves (the owner only): how many cards in a wave, how many in all, and the next wave opened now
  function stockDrawer(from) {
    const w = S.d.wave;
    K.drawer({
      from, title: 'Valurile de carduri', icon: 'sliders', width: 480,
      subtitle: 'Valul ' + w.n + ' din ' + w.of + ' · ' + w.sold + ' vândute din val · ' + S.d.sold + ' în total. Pagina și numărătoarea se schimbă imediat.',
      body: '<form class="k-form cd-waves" data-f><div class="k-grid c2">' + K.field('Carduri într-un val', '<input type="number" name="wave" min="1" max="200" step="1" inputmode="numeric" value="' + w.size + '">') +
        K.field('Total maxim', '<input type="number" name="max" min="0" max="1000" step="1" inputmode="numeric" value="' + w.max + '">') + '</div>' +
        '<p class="cd-stock-left">Doar în portal: pe site se vede numai „Au mai rămas doar N carduri”, N din valul de acum. Un val epuizat deschide imediat următorul; după total, vânzarea se închide.</p>' +
        (w.n < w.of && !w.soldOut ? '<div class="cd-wait"><span>Valul ' + w.n + ': ' + w.left + ' rămase.</span><button type="button" class="k-btn is-outline is-sm" data-open>' + icon('sparkles') + 'Deschide acum următorul val</button></div>' : '') + '</form>',
      footer: '<button type="button" class="k-btn" data-cancel>Renunță</button><span class="k-grow"></span><button type="button" class="k-btn is-primary" data-save>' + icon('check') + 'Salvează</button>',
      onMount(root, h) {
        const v = (n) => Math.floor(Number(root.querySelector('input[name=' + n + ']').value));
        root.querySelector('[data-cancel]').addEventListener('click', () => h.close());
        root.querySelector('[data-save]').addEventListener('click', (ev) => K.busy(ev.currentTarget, async () => {
          try { const r = await api({ action: 'stock', wave: v('wave'), max: v('max') }); h.close(); K.ui().toast('Salvat: valul ' + r.wave.n + ' din ' + r.wave.of + '.', 'success'); await load(true); }
          catch (err) { K.ui().toast(err.code === 'bad_stock' ? 'Valul: 1 până la 200, totalul: 0 până la 1.000.' : K.errText(err), 'error'); }
        }));
        const op = root.querySelector('[data-open]');
        if (op) op.addEventListener('click', (ev) => K.busy(ev.currentTarget, async () => {
          try { const r = await api({ action: 'open_wave' }); h.close(); K.ui().toast('Valul ' + r.opened + ' e deschis: ' + r.left + ' carduri.', 'success'); await load(true); }
          catch (err) { K.ui().toast(K.errText(err), 'error'); }
        }));
      },
    });
  }

  // „Adaugă card plătit”: a payment seen in myPOS or taken in the clinic
  function addDrawer(from) {
    const dr = K.drawer({
      from, title: 'Adaugă card plătit', icon: 'gift', width: 520,
      subtitle: 'Pentru o plată văzută în myPOS sau încasată în clinică. Cardul se emite și pleacă pe WhatsApp.',
      body: '<form class="k-form cd-form" data-f>' +
        K.field('Cardul', K.seg('tier', [['290', '290 → 500'], ['490', '490 → 1.000'], ['990', '990 → 2.500']], '990')) +
        K.field('Plătit', K.seg('via', [['clinica', 'În clinică'], ['online', 'Online (PayLink)']], 'clinica'), '', 'Plata online aduce și cadoul (EMS la Timișoara, Restart la Arad) și Clubul 360.') +
        '<div class="k-grid c2">' + K.field('Numele ei', '<input name="name" autocomplete="off" required>') + K.field('Telefon (WhatsApp)', '<input name="phone" inputmode="tel" autocomplete="off" required>') + '</div>' +
        K.field('Pe numele (dacă e cadou)', '<input name="recipient" autocomplete="off" placeholder="gol = pe numele ei">') +
        K.field('Clinica', K.seg('city', [['Timișoara', 'Timișoara'], ['Arad', 'Arad']], 'Timișoara')) +
        K.field('Cum a plătit (în clinică)', K.seg('method', [['card', 'Card (POS)'], ['cash', 'Cash'], ['transfer', 'Transfer']], 'card'), '', 'Plata intră în Încasări; online e mereu card.') + '</form>',
      footer: '<button type="button" class="k-btn" data-cancel>Renunță</button><span class="k-grow"></span><button type="button" class="k-btn is-primary" data-save>' + icon('check') + 'Emite cardul</button>',
      onMount(root, h) {
        root.querySelector('[data-cancel]').addEventListener('click', () => h.close());
        root.querySelector('[data-save]').addEventListener('click', (ev) => K.busy(ev.currentTarget, async () => {
          const v = K.formValues(root.querySelector('[data-f]'));
          try {
            const r = await api({ action: 'add', tier: Number(v.tier), qty: 1, names: [v.recipient || ''], name: v.name, phone: v.phone, city: v.city, via: v.via, method: v.via === 'online' ? 'card' : v.method });
            h.close(); K.ui().toast('Card emis: ' + ((r.cards || [])[0] || {}).code, 'success'); await load(true);
          } catch (err) { K.ui().toast(err.code === 'bad_phone' ? 'Telefon invalid.' : err.code === 'missing_name' ? 'Scrie numele.' : K.errText(err), 'error'); }
        }));
      },
    });
  }

  // ------------------------------------------------------------------ a card: picture, credit used, history
  function cardDrawer(code, from) {
    const c = (S.d.cards || []).find((x) => x.code === code);
    if (!c) return;
    const admin = S.d.role === 'admin';
    const canUse = c.state === 'activ' || (c.state === 'folosit' && c.gift && c.gift.state === 'open');
    const today = K.today();
    const team = (S.d.team || []).filter((p) => !p.city || p.city === c.city || /timi/i.test(p.city) === /timi/i.test(c.city));
    const tr = S.d.treatments || [];
    const live = c.claims.filter((x) => !x.undone);
    const lastId = live.length ? live[live.length - 1].id : '';
    const sentLine = c.sent && c.sent.how ? '<p class="cd-sent ok">' + icon('check') + 'Trimis pe WhatsApp, ' + esc(when(c.sent.at)) + '</p>'
      : '<p class="cd-sent">' + icon('alert') + '<span><b>De trimis manual.</b> ' + esc((c.sent && c.sent.error) || 'Nu a plecat încă.') + '</span></p>';
    const msg = 'Bună, ' + (c.buyer || '').split(' ')[0] + '! Cardul tău de Sărbători Centrul360: credit ' + lei(c.value) + ', cod ' + c.code + ', valabil până pe 30.06.2027.' + (c.gift ? ' Cadou: ' + c.gift.what + '.' : '') + (c.club ? ' Locul tău în Clubul 360: https://www.centrul360.com/club-360?cod=' + c.code : '');
    const hist = c.claims.length ? '<ol class="cd-hist">' + c.claims.slice().reverse().map((x) => '<li class="' + (x.undone ? 'is-undone' : '') + '"><div><b>' + esc(x.items.map((i) => i.name + (i.kind === 'gift' ? ' (cadou)' : ' ' + lei(i.amount))).join(', ')) + '</b>' +
      '<small>' + esc(K.dateShort(x.date)) + ' · ' + esc(x.city) + (x.performerName ? ' · a făcut-o ' + esc(x.performerName) : '') + (x.byName ? ' · trecut de ' + esc(x.byName) : '') + (x.rest > 0 ? ' · a plătit în plus ' + lei(x.rest) : '') + (x.undone ? ' · anulat' : '') + '</small></div>' +
      '<span class="cd-amt">' + (x.applied ? '−' + lei(x.applied) : '0 lei') + '</span>' + (admin && x.id === lastId ? '<button type="button" class="k-btn is-ghost is-sm" data-undo>Anulează</button>' : '') + '</li>').join('') + '</ol>' : '<p class="k-muted">Nefolosit încă.</p>';
    const dr = K.drawer({
      from, title: c.recipient || c.buyer || 'Fără nume', icon: 'gift', width: 560,
      subtitle: esc(c.code) + ' · ' + tag(c.state),
      body: '<figure class="cd-img"><img src="' + img(c.code) + '" alt="Cardul de Sărbători ' + esc(c.code) + '" loading="lazy"></figure>' +
        '<div class="cd-acts"><a class="k-btn is-outline is-sm" href="' + img(c.code, 1) + '" download="Card-' + esc(c.code) + '.png">' + icon('download') + 'Descarcă</a>' +
        '<button type="button" class="k-btn is-outline is-sm" data-resend>' + icon('chat') + 'Trimite pe WhatsApp</button>' +
        '<a class="k-btn is-ghost is-sm" href="' + K.wa(c.phone, msg) + '" target="_blank" rel="noopener">' + icon('link') + 'Scrie din WhatsApp</a></div>' + sentLine +
        '<div class="cd-kv"><div><small>Credit</small><b>' + lei(c.value) + '</b></div><div><small>Folosit</small><b>' + lei(c.used) + '</b></div><div><small>Rămas</small><b class="cd-big">' + lei(c.left) + '</b></div></div>' +
        '<p class="k-muted cd-meta">Cumpărat de ' + esc(c.buyer) + ' · <a href="' + K.tel(c.phone) + '">' + esc(c.phone) + '</a> · ' + esc(c.city) + ' · ' + c.tier + ' lei ' + (c.paidVia === 'online' ? 'online' : 'în clinică') + ', ' + esc(dayOf(c.paidAt)) +
        (c.paidByName ? ' (' + esc(c.paidByName) + ')' : '') + (c.gift ? ' · Cadou: ' + esc(c.gift.what) + (c.gift.state === 'open' ? '' : ', folosit') : '') + (c.club ? ' · Clubul 360' : '') + '</p>' +
        (canUse ? '<form class="k-form cd-use" data-use><h4>Folosește creditul</h4>' +
          '<div class="cd-pick"><select data-pick><option value="">Alege din lista de prețuri…</option>' + tr.map((t, i) => '<option value="' + i + '">' + esc(t.name) + ' · ' + lei(t.price) + (t.city ? ' · ' + esc(t.city) : '') + '</option>').join('') + '</select>' +
          '<button type="button" class="k-btn is-outline is-sm" data-line>' + icon('plus') + 'Alt tratament</button></div>' +
          '<div class="cd-lines" data-lines></div>' +
          (c.gift && c.gift.state === 'open' ? '<label class="cd-gift"><input type="checkbox" name="gift"><span>Folosește cadoul: ' + esc(c.gift.what) + '</span></label>' : '') +
          '<div class="k-grid c3">' + K.field('Data', '<input type="date" name="date" value="' + today + '" max="' + today + '">') +
          K.field('A făcut-o', '<select name="performer"><option value="">Alege</option>' + K.options(team.map((p) => [p.id, p.name]), '') + '</select>') +
          K.field('Clinica', '<select name="city">' + K.options([['Timișoara', 'Timișoara'], ['Arad', 'Arad']], c.city) + '</select>') + '</div>' +
          '<p class="cd-total" data-total></p><button type="button" class="k-btn is-primary" data-use-go>' + icon('check') + 'Scade din credit</button></form>'
          : '<p class="k-muted">' + (c.state === 'expirat' ? 'Cardul a expirat pe 30.06.2027 și nu mai poate fi folosit.' : c.state === 'folosit' ? 'Creditul e folosit în întregime.' : '') + '</p>') +
        '<h4 class="cd-h4">Istoric</h4>' + hist +
        (admin && c.state !== 'anulat' && !c.used && !(c.gift && c.gift.state === 'used') ? '<p class="cd-void"><button type="button" class="k-btn is-ghost is-sm" data-void>' + icon('ban') + 'Anulează cardul plătit</button><small>Se face rambursare în Încasări, cu data de azi.</small></p>' : '') +
        '<details class="cd-ren"><summary>Schimbă numele de pe card</summary><div class="cd-pick"><input name="recipient" value="' + esc(c.recipient) + '" placeholder="Numele de pe card"><button type="button" class="k-btn is-outline is-sm" data-rename>Salvează</button></div></details>',
      onMount(root, h) {
        const lines = root.querySelector('[data-lines]');
        const total = () => {
          if (!lines) return;
          const sum = [...lines.querySelectorAll('[data-amt]')].reduce((n, i) => n + (Number(i.value) || 0), 0);
          const over = Math.max(0, sum - c.left), gift = root.querySelector('input[name=gift]');
          const t = root.querySelector('[data-total]');
          t.innerHTML = sum || (gift && gift.checked) ? 'Se scade <b>' + lei(Math.min(sum, c.left)) + '</b>' + (gift && gift.checked ? ' + cadoul' : '') + '. Rămân ' + lei(Math.max(0, c.left - sum)) + '.' + (over ? ' <span class="cd-over">Mai are de plătit ' + lei(over) + '.</span>' : '') : '';
        };
        const add = (name, amount) => {
          const row = document.createElement('div'); row.className = 'cd-line';
          row.innerHTML = '<input data-nm placeholder="Tratament" value="' + esc(name || '') + '"><input data-amt type="number" min="0" step="1" inputmode="numeric" placeholder="lei" value="' + (amount || '') + '"><button type="button" class="k-icon-btn" data-del aria-label="Scoate">' + icon('x') + '</button>';
          lines.appendChild(row); total();
          (name ? row.querySelector('[data-amt]') : row.querySelector('[data-nm]')).focus();
        };
        if (lines) {
          root.querySelector('[data-pick]').addEventListener('change', (e) => { const t = tr[Number(e.target.value)]; if (t) add(t.name, t.price); e.target.value = ''; });
          root.querySelector('[data-line]').addEventListener('click', () => add('', ''));
          root.querySelector('[data-use]').addEventListener('input', total);
          root.querySelector('[data-use]').addEventListener('change', total);
          lines.addEventListener('click', (e) => { const x = e.target.closest('[data-del]'); if (x) { x.parentElement.remove(); total(); } });
          root.querySelector('[data-use-go]').addEventListener('click', (ev) => K.busy(ev.currentTarget, async () => {
            const f = root.querySelector('[data-use]');
            const items = [...lines.querySelectorAll('.cd-line')].map((r) => ({ name: r.querySelector('[data-nm]').value.trim(), amount: Number(r.querySelector('[data-amt]').value) || 0 })).filter((x) => x.name && x.amount > 0);
            const g = f.querySelector('input[name=gift]');
            if (g && g.checked) items.push({ kind: 'gift', name: c.gift.what });
            if (!items.length) { K.ui().toast('Alege tratamentul și suma.', 'error'); return; }
            if (!f.performer.value) { K.ui().toast('Alege cine a făcut tratamentul.', 'error'); return; }
            try {
              const r = await api({ action: 'redeem', code: c.code, items, date: f.date.value, performer: f.performer.value, city: f.city.value });
              K.ui().toast('Scăzut ' + lei(r.claim.applied) + '. Rămân ' + lei(r.left) + '.' + (r.claim.rest > 0 ? ' Mai are de plătit ' + lei(r.claim.rest) + '.' : '') + (r.msg ? (r.msg.sent ? ' Soldul i-a plecat pe WhatsApp.' : ' WhatsApp: soldul de spus manual.') : ''), 'success');
              h.close(); await load(true);
            } catch (err) { K.ui().toast({ expired: 'Cardul a expirat.', empty: 'Creditul e folosit în întregime.', no_gift: 'Cadoul a fost deja folosit.' }[err.code] || K.errText(err), 'error'); }
          }));
        }
        root.querySelector('[data-resend]').addEventListener('click', (ev) => K.busy(ev.currentTarget, async () => {
          try { const r = await api({ action: 'resend', code: c.code }); K.ui().toast(r.ok ? 'Trimis pe WhatsApp.' : 'Nu a plecat: ' + ((r.sent && r.sent.error) || '') + '. Descarcă poza și scrie-i din WhatsApp.', r.ok ? 'success' : 'error'); await load(true); }
          catch (err) { K.ui().toast(K.errText(err), 'error'); }
        }));
        const und = root.querySelector('[data-undo]');
        if (und) und.addEventListener('click', (ev) => K.busy(ev.currentTarget, async () => {
          if (!(await K.ui().confirm({ title: 'Anulezi ultima folosire?', message: 'Creditul (și cadoul, dacă a fost) revin pe card.', confirmText: 'Anulează', danger: true }))) return;
          try { await api({ action: 'undo', code: c.code }); h.close(); await load(true); } catch (err) { K.ui().toast(K.errText(err), 'error'); }
        }));
        const vd = root.querySelector('[data-void]');
        if (vd) vd.addEventListener('click', (ev) => K.busy(ev.currentTarget, async () => {
          if (!(await K.ui().confirm({ title: 'Anulezi cardul plătit?', message: 'Comanda ' + c.qty + ' × ' + c.tier + ' lei se anulează, cardurile ei nu mai pot fi folosite, iar banii apar ca rambursare în Încasări, azi.', confirmText: 'Anulează cardul', danger: true }))) return;
          try { await api({ action: 'void', id: c.order }); h.close(); K.ui().toast('Card anulat, rambursarea e în Încasări.', 'success'); await load(true); }
          catch (err) { K.ui().toast(err.code === 'used' ? 'Cardul a fost deja folosit: nu se mai anulează.' : K.errText(err), 'error'); }
        }));
        root.querySelector('[data-rename]').addEventListener('click', (ev) => K.busy(ev.currentTarget, async () => {
          try { await api({ action: 'rename', code: c.code, recipient: root.querySelector('input[name=recipient]').value }); K.ui().toast('Salvat. Trimite-i din nou cardul, cu numele nou.', 'success'); h.close(); await load(true); }
          catch (err) { K.ui().toast(K.errText(err), 'error'); }
        }));
      },
    });
    return dr;
  }

  K.section('carduri', { mount, show() { load(); } });
})();
