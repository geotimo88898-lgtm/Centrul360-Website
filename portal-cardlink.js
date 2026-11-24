// Centrul360 portal, „Trimite linkul de plată” (the owner, 24.11): the Card de Sărbători's one-tap pay link on WhatsApp,
// from anywhere a client shows (Carduri, De sunat, Pipeline, Mesaje, Calendar). One popup for all of them:
//   the card (490, 990, VIP 9.900 with its 10% off online), the clinic, the exact message, Trimite / Anulează.
// A screen only writes the button: '<button type="button" class="…"' + C360SendCardLink.attrs({ phone, name, city, tier,
// orderId }) + '>…<span data-cl-at>Trimite linkul de plată</span></button>'; a tap anywhere on it opens the popup (from the
// button: portal-motion.js), and „Link trimis 14:05” takes the place of [data-cl-at] when her last link went in 48 h.
// The rules (her open order, a new one, the 24 h window, the template) live on the server: api/card-sarbatori.js
// actions 'links' and 'sendlink' (_lib/card-sarbatori.js linkInfo, sendCardLink).
(function () {
  'use strict';
  const ROLES = ['admin', 'manager', 'receptie'];
  const role = () => document.documentElement.getAttribute('data-role') || '';
  const can = () => ROLES.includes(role());
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const d9 = (p) => String(p || '').replace(/\D/g, '').slice(-9);
  const lei = (n) => Math.round(Number(n) || 0).toLocaleString('ro-RO') + ' lei';
  const CREDIT = { 490: 1000, 990: 2500, 9900: 30000 };
  const VIP = 9900, VIP_ONLINE = 8910;
  const cityOf = (c) => { const s = String(c || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); return /arad/.test(s) ? 'Arad' : /timi/.test(s) ? 'Timișoara' : ''; };
  const hm = (iso) => { const t = Date.parse(iso); return Number.isFinite(t) ? new Date(t).toLocaleTimeString('ro-RO', { timeZone: 'Europe/Bucharest', hour: '2-digit', minute: '2-digit' }) : ''; };
  const api = (b) => window.K.api('/api/card-sarbatori', b);
  const ERR = { bad_phone: 'Telefonul nu pare corect.', missing_city: 'Alege clinica.', bad_tier: 'Alege cardul.', sold_out: 'Nu mai sunt carduri (la VIP: în clinica aleasă).', closed: 'Oferta s-a încheiat.',
    no_link: 'Linkul de plată nu s-a putut face.', tpl: 'Nu ne-a scris în ultimele 24 de ore, iar mesajul aprobat nu e gata la Meta. Scrie-i din Mesaje după ce îți răspunde.', send: 'WhatsApp-ul n-a plecat', forbidden: 'Nu e în contul tău.' };
  const errText = (e) => (ERR[e && e.code] ? ERR[e.code] + (e.code === 'send' && e.data && e.data.detail ? ' (' + e.data.detail + ')' : '') : window.K.errText(e));

  // ------------------------------------------------------------------ her last link (48 h), per phone, for every button
  const seen = new Map(); // phone9 → { at (ms read), linkAt, open }
  const FRESH = 60e3;
  function attrs(o) {
    o = o || {};
    return ' data-cardlink data-cl-phone="' + esc(o.phone || '') + '" data-cl-name="' + esc(o.name || '') + '" data-cl-city="' + esc(o.city || '') + '"' +
      (o.tier ? ' data-cl-tier="' + esc(o.tier) + '"' : '') + (o.orderId ? ' data-cl-order="' + esc(o.orderId) + '"' : '');
  }
  function paintBtn(b) {
    const x = seen.get(d9(b.dataset.clPhone)), at = x && x.linkAt;
    const t = b.querySelector('[data-cl-at]');
    if (t && t.dataset.clOrig == null) t.dataset.clOrig = t.textContent;
    if (b.dataset.clTitle == null) b.dataset.clTitle = b.getAttribute('title') || '';
    b.classList.toggle('c360-cl-sent', !!at);
    if (t) t.textContent = at ? 'Link trimis ' + hm(at) : t.dataset.clOrig;
    const title = at ? 'Link trimis ' + hm(at) + '. Trimite din nou' : b.dataset.clTitle || 'Trimite linkul de plată';
    b.setAttribute('title', title);
    if (!t) b.setAttribute('aria-label', title);
  }
  let timer = 0;
  async function refresh() {
    timer = 0;
    if (!can() || !window.K) return;
    const btns = Array.from(document.querySelectorAll('[data-cardlink]'));
    const now = Date.now(), want = [...new Set(btns.map((b) => d9(b.dataset.clPhone)).filter((k) => k.length === 9 && !(seen.has(k) && now - seen.get(k).at < FRESH)))];
    if (want.length) {
      try {
        const r = await api({ action: 'links', phones: want.slice(0, 200) });
        want.forEach((k) => seen.set(k, Object.assign({ at: Date.now() }, (r.people || {})[k] || { linkAt: '', open: null })));
      } catch (e) { want.forEach((k) => seen.set(k, { at: Date.now(), linkAt: '', open: null })); }
    }
    document.querySelectorAll('[data-cardlink]').forEach(paintBtn);
  }
  const soon = () => { if (!timer) timer = setTimeout(refresh, 250); };
  // a screen drew its rows: its buttons get her last link
  new MutationObserver((recs) => { if (recs.some((r) => Array.from(r.addedNodes).some((n) => n.nodeType === 1 && (n.matches('[data-cardlink]') || n.querySelector('[data-cardlink]'))))) soon(); })
    .observe(document.documentElement, { childList: true, subtree: true });

  // ------------------------------------------------------------------ the popup
  let open = null;
  function show(o) {
    if (!window.K || !can()) return;
    if (open) open.close();
    o = o || {};
    const from = o.from instanceof Element ? o.from : null;
    if (from && window.C360Motion) window.C360Motion.from(from); // opens from its button and closes back into it
    const k = d9(o.phone), known = seen.get(k) || {}, op = known.open;
    const st = { tier: Number(o.tier) || (op && op.tier) || 990, city: cityOf(o.city) || (op && op.city) || cityOf(window.K.data && window.K.data.me && window.K.data.me.location) || 'Timișoara', orderId: o.orderId || (op && op.id) || '', name: o.name || '', ready: false, seq: 0 };
    if (![490, 990, VIP].includes(st.tier)) st.tier = 990;
    const seg = (name, pairs, v) => '<div class="k-seg c360-cl-seg" data-k-seg="' + name + '">' + pairs.map(([x, l]) => '<button type="button" data-v="' + esc(x) + '" class="' + (String(x) === String(v) ? 'is-on' : '') + '">' + l + '</button>').join('') + '<input type="hidden" name="' + name + '" value="' + esc(v) + '"></div>';
    const prev = document.activeElement;
    const root = document.createElement('div');
    root.className = 'c360-dialog-root c360-cl-root';
    root.innerHTML = '<div class="c360-dialog-backdrop" data-cl-x></div>' +
      '<div class="c360-dialog c360-cl" role="dialog" aria-modal="true" aria-labelledby="c360-cl-t">' +
      '<h3 class="c360-dialog-title" id="c360-cl-t">Trimite linkul de plată</h3>' +
      '<p class="c360-dialog-msg">' + esc([o.name && !/fără nume/i.test(o.name) ? o.name : '', o.phone].filter(Boolean).join(' · ')) + '</p>' +
      '<div class="c360-cl-l">Cardul</div>' + seg('tier', [[490, '490 lei'], [990, '990 lei'], [VIP, 'VIP 9.900']], st.tier) +
      '<p class="c360-cl-sub" data-cl-sub></p>' +
      '<div class="c360-cl-l">Clinica</div>' + seg('city', [['Timișoara', 'Timișoara'], ['Arad', 'Arad']], st.city) +
      '<div class="c360-cl-l">Mesajul</div><div class="c360-cl-msg" data-cl-msg aria-live="polite"><span class="c360-cl-wait">…</span></div>' +
      '<p class="c360-cl-note" data-cl-note></p>' +
      '<div class="c360-dialog-actions"><button type="button" class="c360-btn is-ghost" data-cl-x>Anulează</button><button type="button" class="c360-btn is-primary" data-cl-send disabled>Trimite</button></div></div>';
    document.body.appendChild(root);
    document.documentElement.classList.add('c360-noscroll');
    requestAnimationFrame(() => root.classList.add('is-open'));
    const $ = (s) => root.querySelector(s);
    const sub = () => { $('[data-cl-sub]').innerHTML = st.tier === VIP ? 'primește ' + lei(CREDIT[VIP]) + ' în tratamente · <b>-10% online: ' + lei(VIP_ONLINE) + '</b>' : 'primește ' + lei(CREDIT[st.tier]) + ' în tratamente'; };
    async function preview() {
      const n = ++st.seq;
      st.ready = false; $('[data-cl-send]').disabled = true; $('[data-cl-msg]').classList.add('is-wait');
      try {
        const r = await api({ action: 'links', phones: [], preview: { phone: o.phone, name: st.name, city: st.city, tier: st.tier, orderId: st.orderId } });
        if (n !== st.seq || !root.isConnected) return;
        const p = r.preview || {};
        $('[data-cl-msg]').textContent = p.text || '';
        // the credit the server counts (Black Friday: 3.000 for a 990 card paid online)
        if (p.credit && st.tier !== VIP) $('[data-cl-sub]').innerHTML = 'primește ' + lei(p.credit) + ' în tratamente' + (p.credit > CREDIT[st.tier] ? ' · <b>Black Friday, la plata online</b>' : '');
        const ord = p.order;
        $('[data-cl-note]').textContent = r.error ? (ERR[r.error] || '') : [ord ? (ord.status === 'rezervat' ? 'Folosim rezervarea ei: trece pe plata online, ținută 2 ore.' : ord.status === 'lead' ? 'Folosim cererea ei din reclamă.' : 'Folosim comanda ei deschisă.') : '',
          p.how === 'template' ? (p.ready ? 'Nu ne-a scris în ultimele 24 de ore: pleacă mesajul aprobat, cu poza cardului și butoanele „Plătesc online” / „Plătesc în clinică”.' : ERR.tpl) : ''].filter(Boolean).join(' ');
        st.ready = !r.error && p.ready !== false;
      } catch (e) { if (n === st.seq) $('[data-cl-note]').textContent = errText(e); }
      if (n === st.seq && root.isConnected) { $('[data-cl-msg]').classList.remove('is-wait'); $('[data-cl-send]').disabled = !st.ready; }
    }
    root.addEventListener('change', (e) => {
      if (e.target.name === 'tier') st.tier = Number(e.target.value);
      else if (e.target.name === 'city') st.city = e.target.value;
      else return;
      sub(); preview();
    });
    const close = () => {
      if (open !== handle) return;
      open = null;
      root.classList.remove('is-open'); root.classList.add('is-closing');
      document.removeEventListener('keydown', onKey, true);
      document.documentElement.classList.remove('c360-noscroll');
      setTimeout(() => { root.remove(); if (prev && prev.focus && prev.isConnected) prev.focus({ preventScroll: true }); }, 220);
    };
    const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } };
    document.addEventListener('keydown', onKey, true);
    root.querySelectorAll('[data-cl-x]').forEach((b) => b.addEventListener('click', close));
    $('[data-cl-send]').addEventListener('click', (ev) => window.K.busy(ev.currentTarget, async () => {
      try {
        const r = await api({ action: 'sendlink', phone: o.phone, name: st.name, city: st.city, tier: st.tier, orderId: st.orderId });
        seen.set(k, { at: Date.now(), linkAt: r.linkAt || new Date().toISOString(), open: { id: r.id, tier: st.tier, city: st.city, status: 'asteptare' } });
        document.querySelectorAll('[data-cardlink]').forEach(paintBtn);
        window.K.ui().toast(r.how === 'template' ? 'Linkul a plecat, cu butoane: îl primește când apasă „Plătesc online”.' : 'Linkul a plecat.', 'success');
        close();
        document.dispatchEvent(new CustomEvent('c360:cardlink', { detail: { phone: o.phone, id: r.id } }));
      } catch (e) { window.K.ui().toast(errText(e), 'error'); }
    }));
    const handle = { close };
    open = handle;
    sub(); preview();
    setTimeout(() => { const b = $('[data-k-seg="tier"] .is-on'); if (b) b.focus({ preventScroll: true }); }, 40);
    return handle;
  }

  // a tap on any [data-cardlink], before the row or card it sits in hears it (a Pipeline card would open the lead)
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('[data-cardlink]');
    if (!b) return;
    e.preventDefault(); e.stopPropagation();
    show({ phone: b.dataset.clPhone, name: b.dataset.clName, city: b.dataset.clCity, tier: b.dataset.clTier, orderId: b.dataset.clOrder, from: b });
  }, true);

  const api0 = (o) => show(o);
  api0.attrs = attrs;
  api0.can = can;
  api0.refresh = () => { seen.clear(); soon(); };
  window.C360SendCardLink = api0;
})();
