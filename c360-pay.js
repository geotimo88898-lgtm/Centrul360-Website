/* ============================================================
   Centrul360, the online payment inside the page (the owner, 23.11: „extrem de simplu, fără redirecturi”).
   myPOS's embedded checkout: Apple Pay / Google Pay first when the phone has them, the card form under them, all in the
   page (myPOS's own frames: the card never touches our server). The price is the server's (api/pay.js).

   For any part of the site (the booking slip, the Card de Sărbători):
     C360Pay.ready()                         → Promise<boolean>: the payment may be used on this page
     C360Pay.open({ kind, ref, city, name, phone, page, mount, onPaid, onClinic, onClose, onOrder })
       kind: 'booking' | 'offer' | 'treatment' | 'card' | 'test'; ref: what is paid (the server knows its price)
       mount: an element to draw in (the slip); without it a sheet of its own opens over the page
       onPaid({ orderId, amount, confirmed }): paid (confirmed: myPOS's signed answer came; false = still being checked)
       onClinic(): she chose to pay at the clinic after all (shown only when given)
       onClose(): the sheet was closed without paying
       onOrder({ orderId, key, amount }): the order was made (key: to tell the server „at the clinic” for a booking)
     → Promise<{ paid, orderId, amount, confirmed }>
   ============================================================ */
(function () {
  'use strict';
  if (window.C360Pay) return;
  const SDK = '/vendor/mypos-embedded-sdk-20261123.js';
  const PREVIEW = /^\/v2\//.test(location.pathname) || /[?&]plata=test\b/.test(location.search);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const lei = (n) => (Math.round(n * 100) % 100 ? (Math.round(n * 100) / 100).toFixed(2).replace('.', ',') : Math.round(n).toLocaleString('ro-RO')) + ' lei';
  const post = (body) => fetch('/api/pay', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    .then((r) => r.json().then((d) => (r.ok ? d : Promise.reject(Object.assign(new Error(d.error || 'failed'), { code: d.error })))), (e) => Promise.reject(Object.assign(e, { code: 'net' })));

  let statusP = null;
  function status() {
    if (!statusP) statusP = fetch('/api/pay?status=1', { headers: { Accept: 'application/json' } }).then((r) => (r.ok ? r.json() : { on: false })).catch(() => ({ on: false }));
    return statusP;
  }
  // on the site only when it is switched on (after the real 1 leu test); on the preview (/v2) as soon as the keys are saved
  const ready = () => status().then((s) => !!(s && s.on && (s.live || PREVIEW)));
  let sdkP = null;
  function sdk() {
    if (window.MyPOSEmbedded) return Promise.resolve(window.MyPOSEmbedded);
    if (!sdkP) sdkP = new Promise((ok, no) => { const s = document.createElement('script'); s.src = SDK; s.onload = () => (window.MyPOSEmbedded ? ok(window.MyPOSEmbedded) : no(new Error('sdk'))); s.onerror = () => { sdkP = null; no(new Error('sdk')); }; document.head.appendChild(s); });
    return sdkP;
  }
  // what the wallets' session says (Apple Pay / Google Pay switched on for the store): its first field, "wallet-cards-apple-google-…"
  function tokenInfo(t) { try { const p = JSON.parse(atob(t)).info.split('-'); return { apple: p[2] === '1', google: p[3] === '1' }; } catch (e) { return { apple: false, google: false }; } }

  // the site's light look (v2/book-light.css): ink text, teal for what matters; inside the slip it takes the slip's colours
  const CSS = `
  .cp{ font-family:'Inter',system-ui,sans-serif; color:inherit; }
  .cp-sum{ display:flex; align-items:center; justify-content:space-between; gap:12px; margin:0 0 16px; padding:14px 16px; border-radius:18px; background:#f7fcfb; box-shadow:0 0 0 1px rgba(20,165,150,.2) inset; }
  .cp-sum b{ display:block; font-size:26px; font-weight:800; letter-spacing:-.035em; line-height:1; color:#0b0b0d; }
  .cp-sum small{ display:block; margin-top:6px; font-size:13px; line-height:1.35; color:#646b75; }
  .cp-sum s{ color:#9aa1aa; }
  .cp-off{ flex:none; font-style:normal; font-size:13px; font-weight:800; padding:6px 10px; border-radius:999px; background:#14a596; color:#fff; }
  .cp-w{ margin:0 0 4px; }
  .cp-w:empty{ display:none; }
  .cp-w iframe{ display:block; width:100% !important; border:0; border-radius:14px; }
  .cp-or{ display:flex; align-items:center; gap:12px; margin:14px 0 10px; font-size:12px; font-weight:600; letter-spacing:.14em; text-transform:uppercase; color:#9aa1aa; }
  .cp-or::before, .cp-or::after{ content:''; flex:1; height:1px; background:rgba(11,11,13,.1); }
  .cp-or[hidden]{ display:none; }
  .cp-card{ position:relative; min-height:420px; border-radius:18px; overflow:hidden; background:#fff; box-shadow:0 0 0 1px rgba(11,11,13,.08) inset; }
  .cp-card iframe{ display:block; width:100% !important; min-width:300px; border:0; }
  .cp-load{ position:absolute; inset:0; display:grid; place-items:center; background:#fff; color:#646b75; font-size:14px; text-align:center; }
  .cp-load i{ width:22px; height:22px; border-radius:50%; border:2.5px solid rgba(20,165,150,.18); border-top-color:#14a596; animation:cpSp .8s linear infinite; display:block; margin:0 auto 10px; }
  @keyframes cpSp{ to{ transform:rotate(360deg); } }
  .cp-safe{ display:flex; align-items:center; justify-content:center; gap:6px; margin:12px 0 0; font-size:12.5px; color:#9aa1aa; text-align:center; }
  .cp-state{ text-align:center; padding:18px 4px 6px; }
  .cp-state h3{ margin:0 0 8px; font-size:22px; font-weight:800; letter-spacing:-.03em; color:#0b0b0d; }
  .cp-state p{ margin:0 auto 16px; max-width:330px; font-size:14px; line-height:1.55; color:#646b75; }
  .cp-ico{ width:68px; height:68px; margin:4px auto 16px; border-radius:50%; display:grid; place-items:center; background:#effaf8; box-shadow:0 0 0 1px rgba(20,165,150,.3) inset; }
  .cp-ico.bad{ background:#fdf1f0; box-shadow:0 0 0 1px rgba(200,68,63,.25) inset; }
  .cp-ico .spin{ width:26px; height:26px; border-radius:50%; border:2.5px solid rgba(20,165,150,.2); border-top-color:#14a596; animation:cpSp .8s linear infinite; }
  .cp-btn{ width:100%; min-height:54px; border:0; border-radius:999px; color:#fff; background:linear-gradient(180deg,#1bb9a9 0%,#0f9083 100%); box-shadow:0 1px 0 rgba(255,255,255,.35) inset, 0 14px 30px -12px rgba(16,145,132,.7); font:inherit; font-size:15.5px; font-weight:700; cursor:pointer; margin-top:4px; }
  .cp-ghost{ width:100%; min-height:50px; margin-top:10px; border-radius:999px; border:0; background:#fff; color:#0b0b0d; box-shadow:0 0 0 1px rgba(11,11,13,.12) inset; font:inherit; font-size:14px; font-weight:600; cursor:pointer; }
  .cp-root{ position:fixed; inset:0; z-index:230; display:flex; align-items:flex-end; justify-content:center; visibility:hidden; }
  .cp-root.open{ visibility:visible; }
  .cp-bg{ position:absolute; inset:0; background:rgba(240,247,246,.55); -webkit-backdrop-filter:blur(14px) saturate(160%); backdrop-filter:blur(14px) saturate(160%); opacity:0; transition:opacity .35s ease; }
  .cp-root.open .cp-bg{ opacity:1; }
  .cp-sheet{ position:relative; width:100%; max-width:468px; max-height:94dvh; overflow:auto; overscroll-behavior:contain; padding:14px 20px 24px; box-sizing:border-box; border-radius:26px 26px 0 0; color:#0b0b0d;
    background:rgba(255,255,255,.98); box-shadow:0 0 0 1px rgba(11,11,13,.08), 0 50px 100px -40px rgba(11,40,38,.45); transform:translateY(40px); opacity:0; transition:transform .45s cubic-bezier(.16,1,.3,1), opacity .3s ease; }
  .cp-root.open .cp-sheet{ transform:none; opacity:1; }
  @media (min-width:641px){ .cp-root{ align-items:center; padding:20px; } .cp-sheet{ border-radius:28px; } }
  .cp-head{ display:flex; align-items:center; justify-content:space-between; gap:10px; margin:0 0 14px; }
  .cp-head p{ margin:0; font-size:10.5px; font-weight:600; letter-spacing:.22em; text-transform:uppercase; color:#646b75; }
  .cp-x{ width:40px; height:40px; border-radius:50%; border:0; background:rgba(11,11,13,.05); color:#0b0b0d; cursor:pointer; display:grid; place-items:center; padding:0; }
  .cp-test{ margin:0 0 12px; padding:8px 12px; border-radius:12px; font-size:12.5px; background:#fff7e6; color:#8a5a00; }
  @media (prefers-reduced-motion:reduce){ .cp-sheet, .cp-bg{ transition:none; } }`;
  const ICON = {
    lock: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
    check: '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#0f9083" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    bad: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#c8443f" stroke-width="2.2" stroke-linecap="round"><path d="M12 7v6M12 17h.01"/></svg>',
    x: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>',
  };
  function css() { if (!document.getElementById('cp-css')) { const s = document.createElement('style'); s.id = 'cp-css'; s.textContent = CSS; document.head.appendChild(s); } }
  const ERR = {
    off: 'Plata online nu e pornită acum.', already_paid: 'E deja plătită.', cancelled: 'Programarea nu mai e activă.', not_found: 'Nu am găsit ce vrei să plătești.',
    not_in_city: 'Asta nu se face în clinica aleasă.', missing_contact: 'Lipsesc numele sau telefonul.', card_not_ready: 'Plata pentru card nu e gata încă.', net: 'Nu avem internet acum.',
  };

  let seq = 0, active = null;
  // one payment at a time (myPOS's form has fixed names in the page)
  function open(o) {
    o = o || {};
    css();
    if (active) active.destroy();
    let host = o.mount, sheet = null;
    if (!host) {
      sheet = document.createElement('div');
      sheet.className = 'cp-root';
      sheet.innerHTML = '<div class="cp-bg" data-cp-x></div><div class="cp-sheet" role="dialog" aria-modal="true" aria-label="Plata"><div class="cp-head"><p>Plata online</p><button type="button" class="cp-x" data-cp-x aria-label="Închide">' + ICON.x + '</button></div><div class="cp-host"></div></div>';
      document.body.appendChild(sheet);
      host = sheet.querySelector('.cp-host');
      // eslint-disable-next-line no-unused-expressions
      sheet.offsetWidth; sheet.classList.add('open');
      document.documentElement.style.overflow = 'hidden';
    }
    let done = false, settle;
    const result = new Promise((r) => { settle = r; });
    const me = { destroy, id: ++seq };
    active = me;
    const finish = (r) => { if (done) return; done = true; settle(r); };
    function destroy() {
      if (active === me) active = null;
      host.querySelectorAll('.cp-card, .cp-w').forEach((x) => { x.innerHTML = ''; });
      ['IPCForm', 'myposCheckoutThreedsModalBackdrop'].forEach((id) => { const x = document.getElementById(id); if (x) x.remove(); });
    }
    function closeSheet() {
      destroy();
      if (!sheet) return;
      sheet.classList.remove('open'); document.documentElement.style.overflow = '';
      setTimeout(() => sheet.remove(), 400);
    }
    if (sheet) sheet.addEventListener('click', (e) => { if (e.target.closest('[data-cp-x]')) { closeSheet(); if (!done && o.onClose) o.onClose(); finish({ paid: false }); } });

    let order = null;
    const paint = (h) => { if (active === me || done) host.innerHTML = '<div class="cp">' + h + '</div>'; };
    function stateHtml(kind, title, text, buttons) {
      return '<div class="cp-state"><div class="cp-ico' + (kind === 'bad' ? ' bad' : '') + '">' + (kind === 'wait' ? '<i class="spin"></i>' : kind === 'bad' ? ICON.bad : ICON.check) + '</div><h3>' + title + '</h3>' + (text ? '<p>' + text + '</p>' : '') + (buttons || '') + '</div>';
    }
    function fail(msg) {
      destroy();
      active = me;
      paint(stateHtml('bad', 'Plata nu a trecut', esc(msg || 'Banca nu a aprobat plata. Banii nu au fost luați.'),
        '<button type="button" class="cp-btn" data-cp-retry>Încearcă din nou</button>' + (o.onClinic ? '<button type="button" class="cp-ghost" data-cp-clinic>Plătesc în clinică</button>' : '')));
    }
    host.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b || !host.contains(b)) return;
      if (b.hasAttribute('data-cp-retry')) start();
      if (b.hasAttribute('data-cp-clinic')) {
        b.disabled = true;
        const go = () => { destroy(); if (sheet) closeSheet(); if (o.onClinic) o.onClinic(); finish({ paid: false, clinic: true }); };
        if (order && order.kind === 'booking') post({ action: 'clinic', orderId: order.orderId, key: order.key }).then(go, go); else go();
      }
      if (b.hasAttribute('data-cp-done')) closeSheet();
    });

    // myPOS said yes in the page: its signed answer is asked for at the server (a few tries, the notification may be slower)
    async function confirm() {
      destroy();
      active = me;
      paint(stateHtml('wait', 'Verificăm plata…', 'Durează câteva secunde.'));
      let r = { paid: false };
      for (let i = 0; i < 8 && !r.paid; i++) {
        if (i) await new Promise((w) => setTimeout(w, 1500));
        try { r = await post({ action: 'check', orderId: order.orderId, key: order.key }); } catch (e) { r = { paid: false }; }
        if (r.status === 'failed' || r.status === 'mismatch' || r.status === 'double') break;
      }
      if (r.status === 'failed' || r.status === 'mismatch' || r.status === 'double') { fail(r.status === 'double' ? 'E deja plătită. A doua plată se întoarce singură pe card.' : ''); return; }
      const out = { paid: true, orderId: order.orderId, amount: order.amount, confirmed: !!r.paid };
      if (o.onPaid) o.onPaid(out);
      if (!o.mount) paint(stateHtml('ok', 'Plătit', r.paid ? 'Mulțumim! Confirmarea vine și pe WhatsApp.' : 'Plata e în confirmare la bancă. Îți scriem pe WhatsApp imediat ce vine.', '<button type="button" class="cp-btn" data-cp-done>Gata</button>'));
      finish(out);
    }

    async function start() {
      paint('<div class="cp-card"><div class="cp-load"><div><i></i>Pregătim plata…</div></div></div>');
      let s;
      try {
        [order, s] = await Promise.all([post({ action: 'create', kind: o.kind, ref: o.ref, city: o.city, name: o.name, phone: o.phone, page: o.page || location.pathname }), status()]);
        order.kind = o.kind;
        if (o.onOrder) o.onOrder({ orderId: order.orderId, key: order.key, amount: order.amount });
        await sdk();
      } catch (e) { fail(ERR[e.code] || 'Nu am putut porni plata. Încearcă din nou.'); return; }
      if (active !== me) return;
      const n = me.id + '-' + Date.now().toString(36);
      const save = order.full > order.amount ? '<small><s>' + lei(order.full) + '</s> · ' + esc(order.title) + '</small>' : '<small>' + esc(order.title) + '</small>';
      paint((order.sandbox ? '<p class="cp-test">Cont de test myPOS: plătește doar cu un card de test.</p>' : '') +
        '<div class="cp-sum"><div><b>' + lei(order.amount) + '</b>' + save + '</div>' + (order.bonusPct ? '<i class="cp-off">-' + order.bonusPct + '%</i>' : '') + '</div>' +
        '<div class="cp-w" id="cpW' + n + '"></div><p class="cp-or" id="cpO' + n + '" hidden>sau cu cardul</p>' +
        '<div class="cp-card" id="cpC' + n + '"><div class="cp-load"><div><i></i>Se încarcă formularul securizat…</div></div></div>' +
        '<p class="cp-safe">' + ICON.lock + 'Plată securizată prin myPOS. Datele cardului nu ajung la noi.</p>');
      const M = window.MyPOSEmbedded, sandbox = !!order.sandbox;
      // Apple Pay / Google Pay first, when the phone has them (a session signed by our server: the sum can't change)
      const ti = order.sessionToken ? tokenInfo(order.sessionToken) : {};
      const wallet = { isSandbox: sandbox, onSuccess: () => confirm(), onDecline: () => fail() };
      const showOr = () => { const x = document.getElementById('cpO' + n); if (x) x.hidden = false; };
      try {
        if (ti.apple && M.IS_APPLE_PAY_AVAILABLE) M.createApplePayButton('cpW' + n, order.sessionToken, Object.assign({ merchantName: 'Centrul360' }, wallet)).then(showOr).catch(() => {});
        else if (ti.google && M.IS_GOOGLE_PAY_AVAILABLE) {
          M.isGooglePayPaymentAvailable(order.sessionToken, { isSandbox: sandbox, onAvailable: () => { M.createGooglePayButton('cpW' + n, order.sessionToken, wallet).then(showOr).catch(() => {}); }, onUnavailable: () => {} }).catch(() => {});
        }
      } catch (e) { /* the card form is enough */ }
      // the card, in myPOS's frame
      const params = Object.assign({}, order.params, { urlOk: location.href.split('#')[0], urlCancel: location.href.split('#')[0] });
      const look = { formBackgroundColor: '#ffffff', labelColor: '#646b75', labelFontSize: '14px', inputBorderRadius: '14px', payButtonBackgroundColor: '#0f9083', payButtonBorderColor: '#0f9083',
        payButtonColor: '#ffffff', payButtonBackgroundColorHover: '#0b7f74', payButtonBorderColorHover: '#0b7f74', payButtonColorHover: '#ffffff', payButtonFontSize: '16px' };
      M.createPayment('cpC' + n, params, {
        isSandbox: sandbox,
        onSuccess: () => confirm(),
        onError: () => fail(),
        onDecline: () => fail(),
      }, look).then(() => { const l = host.querySelector('.cp-load'); if (l) l.remove(); }).catch(() => fail('Formularul de plată nu s-a încărcat. Încearcă din nou.'));
    }
    start();
    return result;
  }

  window.C360Pay = { ready, status, open, preview: PREVIEW };
})();
