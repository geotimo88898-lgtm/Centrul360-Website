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
       contact: false to not ask (the caller has her name and phone already); { name, phone } to fill them in; consent: true
         when she already ticked the WhatsApp line (then a filled contact is saved at once)
       onContact({ name, phone }): her name and phone were saved (the slip keeps them for „Plătesc în clinică”)
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
  .cp-who{ margin:0 0 14px; }
  .cp-two{ display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:8px; }
  @media (max-width:340px){ .cp-two{ grid-template-columns:1fr; } }
  .cp-f{ display:block; min-width:0; }
  .cp-f span{ display:block; font-size:12.5px; font-weight:500; color:#646b75; margin:0 0 5px; }
  .cp-f input{ width:100%; height:48px; padding:0 14px; border:0; border-radius:14px; background:#f5f7f7; color:#0b0b0d; font:inherit; font-size:16px; box-shadow:0 0 0 1px rgba(11,11,13,.08) inset; box-sizing:border-box; }
  .cp-f input:focus{ outline:none; background:#fff; box-shadow:0 0 0 1.5px #14a596 inset, 0 0 0 5px rgba(20,165,150,.12); }
  .cp-f.err input{ box-shadow:0 0 0 1.5px #d9534f inset; }
  .cp-ok{ display:flex; gap:9px; align-items:flex-start; margin:10px 0 0; font-size:12.5px; line-height:1.45; color:#646b75; cursor:pointer; }
  .cp-ok input{ width:18px; height:18px; margin:0; flex:none; accent-color:#14a596; }
  .cp-ok.err{ color:#c8443f; }
  .cp-msg{ margin:8px 0 0; font-size:13px; color:#a2352f; }
  .cp-msg[hidden]{ display:none; }
  .cp-wbox{ position:relative; }
  .cp-lock{ position:absolute; inset:0; z-index:2; border:0; padding:0; background:rgba(255,255,255,.6); -webkit-backdrop-filter:blur(1.5px); backdrop-filter:blur(1.5px); cursor:pointer; border-radius:14px; }
  .cp-card + .cp-lock{ border-radius:18px; }
  .cp-lock[hidden]{ display:none; }
  .cp-w:empty + .cp-lock{ display:none; }
  .cp-go{ display:flex; align-items:center; justify-content:center; text-decoration:none; box-sizing:border-box; }
  .cp-go.wait{ opacity:.6; pointer-events:none; }
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
      polling++;
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
        const go = () => { destroy(); if (sheet) closeSheet(); if (o.onClinic) o.onClinic({ name: last.name, phone: last.phone }); finish({ paid: false, clinic: true }); };
        if (order && (order.kind === 'booking' || order.kind === 'hold')) post({ action: 'clinic', orderId: order.orderId, key: order.key }).then(go, go); else go();
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

    // her name and phone on the payment screen itself (the owner, 23.11: no step before it). Saved at the server before any
    // payment can start: the wallets and the card form stay veiled until then (a tap on the veil says what is missing).
    const ask = o.contact !== false;
    const pre = (o.contact && typeof o.contact === 'object') ? o.contact : {};
    let contactOk = false, n = '';
    const last = { name: pre.name || '', phone: pre.phone || '' }; // what she typed, kept for a new try or the clinic
    const fv = (k) => { const x = host.querySelector('[name="cp-' + k + '"]'); return x ? (x.type === 'checkbox' ? x.checked : x.value.trim()) : ''; };
    const flag = (k, bad) => { const x = host.querySelector('[data-cp-f="' + k + '"]'); if (x) x.classList.toggle('err', !!bad); };
    const say = (t) => { const x = host.querySelector('.cp-msg'); if (x) { x.textContent = t || ''; x.hidden = !t; } };
    const lock = (on) => { ['cpL', 'cpK'].forEach((p) => { const x = document.getElementById(p + n); if (x) x.hidden = !on; }); };
    function contactBad() {
      const bad = { name: fv('name').length < 2, phone: fv('phone').replace(/\D/g, '').length < 9, ok: !fv('ok') };
      Object.keys(bad).forEach((k) => flag(k, bad[k]));
      return bad.name || bad.phone || bad.ok;
    }
    async function saveContact() {
      if (!ask || contactOk) return true;
      if (contactBad()) { say(''); const f = host.querySelector('.cp-f.err input'); if (f) f.focus(); return false; }
      try {
        await post({ action: 'contact', orderId: order.orderId, key: order.key, name: fv('name'), phone: fv('phone'), consent: true });
        contactOk = true; lock(false); say('');
        if (o.onContact) o.onContact({ name: fv('name'), phone: fv('phone') });
        if (order.provider === 'requests') getLink();
        return true;
      } catch (e) {
        if (e.code === 'bad_phone') { flag('phone', true); say('Numărul de telefon nu pare corect.'); }
        else if (e.code === 'has_booking') say('Ai deja o programare în ziua asta. Pentru încă una sau ca s-o muți, scrie-ne pe WhatsApp.');
        else say(ERR[e.code] || 'Nu am putut salva datele. Încearcă din nou.');
        return false;
      }
    }
    host.addEventListener('input', (e) => {
      if (!e.target.closest('.cp-who')) return;
      contactOk = false; lock(true);
      const k = (e.target.name || '').replace('cp-', ''); if (k) flag(k, false);
      if (k === 'name' || k === 'phone') last[k] = e.target.value.trim();
    });
    host.addEventListener('focusout', (e) => { if (e.target.closest('.cp-who') && !host.querySelector('.cp-who').contains(e.relatedTarget) && !contactBad()) saveContact(); });
    host.addEventListener('change', (e) => { if (e.target.name === 'cp-ok' && !contactBad()) saveContact(); });
    host.addEventListener('click', (e) => {
      if (e.target.closest('.cp-lock')) { if (!contactBad()) saveContact(); else { say('Scrie întâi numele și telefonul, apoi bifează acordul.'); const f = host.querySelector('.cp-f.err input'); if (f) f.focus(); } }
    });

    // ---- the Partners way (until the online store is approved): myPOS's own payment page for this order, in a new tab (it
    // can't work inside a frame); this tab asks the server every few seconds and turns to „Plătit” by itself
    let link = '', polling = 0;
    const PEND = 'c360-pay-pending';
    async function getLink() {
      const a = host.querySelector('[data-cp-go]');
      if (a) { a.classList.add('wait'); a.removeAttribute('href'); }
      try {
        const r = await post({ action: 'link', orderId: order.orderId, key: order.key });
        link = r.url;
        const b = host.querySelector('[data-cp-go]');
        if (b) { b.href = link; b.classList.remove('wait'); }
      } catch (e) { say(ERR[e.code] || 'Nu am putut pregăti plata. Încearcă din nou.'); const b = host.querySelector('[data-cp-go]'); if (b) b.classList.remove('wait'); }
    }
    function startRequest() {
      const save = order.full > order.amount ? '<small><s>' + lei(order.full) + '</s> · ' + esc(order.title) + '</small>' : '<small>' + esc(order.title) + '</small>';
      n = me.id + '-' + Date.now().toString(36);
      paint((order.sandbox ? '<p class="cp-test">Cont demo myPOS: plătește doar cu un card de test.</p>' : '') +
        '<div class="cp-sum"><div><b>' + lei(order.amount) + '</b>' + save + '</div>' + (order.bonusPct ? '<i class="cp-off">-' + order.bonusPct + '%</i>' : '') + '</div>' +
        (ask ? '<div class="cp-who"><div class="cp-two">' +
          '<label class="cp-f" data-cp-f="name"><span>Nume</span><input name="cp-name" autocomplete="name" placeholder="Maria Popescu" value="' + esc(last.name) + '"></label>' +
          '<label class="cp-f" data-cp-f="phone"><span>Telefon (WhatsApp)</span><input name="cp-phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="07xx xxx xxx" value="' + esc(last.phone) + '"></label></div>' +
          '<label class="cp-ok" data-cp-f="ok"><input type="checkbox" name="cp-ok"><span>Sunt de acord să primesc pe WhatsApp sau telefonic confirmarea și reamintirile de la Centrul360.</span></label>' +
          '<p class="cp-msg" hidden></p></div>' : '<p class="cp-msg" hidden></p>') +
        '<div class="cp-wbox"><a class="cp-btn cp-go" data-cp-go target="_blank" rel="noopener">Plătesc ' + lei(order.amount) + ' cu cardul</a>' +
          '<button type="button" class="cp-lock" id="cpL' + n + '"' + (ask ? '' : ' hidden') + ' aria-label="Scrie întâi numele și telefonul"></button></div>' +
        '<p class="cp-safe">' + ICON.lock + 'Se deschide pagina securizată myPOS, cu suma completată. Apoi revii aici.</p>');
      if (!ask) getLink();
      else if (last.name && last.phone && o.consent) { const c = host.querySelector('[name="cp-ok"]'); if (c) { c.checked = true; saveContact(); } }
    }
    // she tapped „Plătesc”: the myPOS tab opens; here, the wait (and a way back to that tab)
    host.addEventListener('click', (e) => {
      const a = e.target.closest('[data-cp-go]');
      if (!a) return;
      if (!a.getAttribute('href')) { e.preventDefault(); return; }
      try { localStorage.setItem(PEND, JSON.stringify({ orderId: order.orderId, key: order.key, amount: order.amount, title: order.title, at: Date.now() })); } catch (x) { /* private mode */ }
      setTimeout(waitPaid, 300);
    });
    function waitPaid() {
      paint(stateHtml('wait', 'Plătește în pagina myPOS', 'S-a deschis într-o filă nouă, cu ' + lei(order.amount) + ' completat. Când ai plătit, revino aici: pagina se actualizează singură.',
        '<a class="cp-btn" data-cp-go target="_blank" rel="noopener" href="' + esc(link) + '">Deschide din nou plata</a>' + (o.onClinic ? '<button type="button" class="cp-ghost" data-cp-clinic>Plătesc în clinică</button>' : '')));
      const mine = ++polling, t0 = Date.now();
      const tick = async () => {
        if (mine !== polling || done) return;
        let r = {};
        try { r = await post({ action: 'check', orderId: order.orderId, key: order.key }); } catch (e) { r = {}; }
        if (mine !== polling || done) return;
        if (r.paid) {
          polling++;
          try { localStorage.removeItem(PEND); } catch (x) { /* private mode */ }
          const out = { paid: true, orderId: order.orderId, amount: order.amount, confirmed: true };
          if (o.onPaid) o.onPaid(out);
          if (!o.mount) paint(stateHtml('ok', 'Plătit', 'Mulțumim! Confirmarea vine și pe WhatsApp.', '<button type="button" class="cp-btn" data-cp-done>Gata</button>'));
          finish(out);
          return;
        }
        if (r.status === 'failed' || r.status === 'mismatch' || r.status === 'double') { polling++; fail(r.status === 'double' ? 'E deja plătită. A doua plată se întoarce singură pe card.' : 'Plata a expirat sau a fost anulată. Banii nu au fost luați.'); return; }
        if (Date.now() - t0 < 45 * 60e3) setTimeout(tick, document.hidden ? 8000 : 3000);
      };
      setTimeout(tick, 2500);
      // back from the myPOS tab: asked at once
      const vis = () => { if (!document.hidden && mine === polling && !done) { document.removeEventListener('visibilitychange', vis); tick(); } };
      document.addEventListener('visibilitychange', vis);
    }

    async function start() {
      paint('<div class="cp-card"><div class="cp-load"><div><i></i>Pregătim plata…</div></div></div>');
      contactOk = false;
      try {
        [order] = await Promise.all([post({ action: 'create', kind: o.kind, ref: o.ref, city: o.city, name: o.name, phone: o.phone, page: o.page || location.pathname }), status()]);
        order.kind = o.kind;
        if (o.onOrder) o.onOrder({ orderId: order.orderId, key: order.key, amount: order.amount });
        if (order.provider !== 'requests') await sdk();
      } catch (e) { fail(ERR[e.code] || 'Nu am putut porni plata. Încearcă din nou.'); return; }
      if (active !== me) return;
      if (order.provider === 'requests') { startRequest(); return; }
      n = me.id + '-' + Date.now().toString(36);
      const keep = last;
      const save = order.full > order.amount ? '<small><s>' + lei(order.full) + '</s> · ' + esc(order.title) + '</small>' : '<small>' + esc(order.title) + '</small>';
      paint((order.sandbox ? '<p class="cp-test">Cont de test myPOS: plătește doar cu un card de test.</p>' : '') +
        '<div class="cp-sum"><div><b>' + lei(order.amount) + '</b>' + save + '</div>' + (order.bonusPct ? '<i class="cp-off">-' + order.bonusPct + '%</i>' : '') + '</div>' +
        (ask ? '<div class="cp-who"><div class="cp-two">' +
          '<label class="cp-f" data-cp-f="name"><span>Nume</span><input name="cp-name" autocomplete="name" placeholder="Maria Popescu" value="' + esc(keep.name) + '"></label>' +
          '<label class="cp-f" data-cp-f="phone"><span>Telefon (WhatsApp)</span><input name="cp-phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="07xx xxx xxx" value="' + esc(keep.phone) + '"></label></div>' +
          '<label class="cp-ok" data-cp-f="ok"><input type="checkbox" name="cp-ok"><span>Sunt de acord să primesc pe WhatsApp sau telefonic confirmarea și reamintirile de la Centrul360.</span></label>' +
          '<p class="cp-msg" hidden></p></div>' : '') +
        '<div class="cp-wbox"><div class="cp-w" id="cpW' + n + '"></div><button type="button" class="cp-lock" id="cpL' + n + '"' + (ask ? '' : ' hidden') + ' aria-label="Scrie întâi numele și telefonul"></button></div>' +
        '<p class="cp-or" id="cpO' + n + '" hidden>sau cu cardul</p>' +
        '<div class="cp-wbox"><div class="cp-card" id="cpC' + n + '"><div class="cp-load"><div><i></i>Se încarcă formularul securizat…</div></div></div>' +
          '<button type="button" class="cp-lock" id="cpK' + n + '"' + (ask ? '' : ' hidden') + ' aria-label="Scrie întâi numele și telefonul"></button></div>' +
        '<p class="cp-safe">' + ICON.lock + 'Plată securizată prin myPOS. Datele cardului nu ajung la noi.</p>');
      const M = window.MyPOSEmbedded, sandbox = !!order.sandbox;
      // Apple Pay / Google Pay first, when the phone has them (a session signed by our server: the sum can't change); they
      // open once her name and phone are saved (the lock over them asks for them)
      const ti = order.sessionToken ? tokenInfo(order.sessionToken) : {};
      const wallet = { isSandbox: sandbox, onSuccess: () => confirm(), onDecline: () => fail() };
      const showOr = () => { const x = document.getElementById('cpO' + n); if (x) x.hidden = false; };
      try {
        if (ti.apple && M.IS_APPLE_PAY_AVAILABLE) M.createApplePayButton('cpW' + n, order.sessionToken, Object.assign({ merchantName: 'Centrul360' }, wallet)).then(showOr).catch(() => {});
        else if (ti.google && M.IS_GOOGLE_PAY_AVAILABLE) {
          M.isGooglePayPaymentAvailable(order.sessionToken, { isSandbox: sandbox, onAvailable: () => { M.createGooglePayButton('cpW' + n, order.sessionToken, wallet).then(showOr).catch(() => {}); }, onUnavailable: () => {} }).catch(() => {});
        }
      } catch (e) { /* the card form is enough */ }
      // the card, in myPOS's frame, with myPOS's own pay button (the one button; a form paid by our own button did not work with
      // every payment method of the store). Locked like the wallets until her name and phone are saved.
      const params = Object.assign({}, order.params, { urlOk: location.href.split('#')[0], urlCancel: location.href.split('#')[0] });
      const look = { formBackgroundColor: '#ffffff', labelColor: '#646b75', labelFontSize: '14px', inputBorderRadius: '14px', payButtonBackgroundColor: '#0f9083', payButtonBorderColor: '#0f9083',
        payButtonColor: '#ffffff', payButtonBackgroundColorHover: '#0b7f74', payButtonBorderColorHover: '#0b7f74', payButtonColorHover: '#ffffff', payButtonFontSize: '16px' };
      M.createPayment('cpC' + n, params, {
        isSandbox: sandbox,
        onSuccess: () => confirm(),
        onError: () => fail(),
        onDecline: () => fail(),
      }, look).then(() => { const l = host.querySelector('.cp-load'); if (l) l.remove(); }).catch(() => fail('Formularul de plată nu s-a încărcat. Încearcă din nou.'));
      if (ask && keep.name && keep.phone) { const c = host.querySelector('[name="cp-ok"]'); if (c && o.consent) { c.checked = true; saveContact(); } }
    }
    start();
    return result;
  }

  // She comes back to the site with a payment on myPOS's page still unconfirmed (the same tab, an in-app browser that
  // opened it in place, or a link /?plata=<order>&k=<key>): a small sheet asks the server and says „Plătit” when it is.
  function resume() {
    let p = null;
    try { p = JSON.parse(localStorage.getItem('c360-pay-pending') || 'null'); } catch (e) { p = null; }
    const q = new URLSearchParams(location.search);
    if (q.get('plata') && q.get('k')) p = { orderId: q.get('plata'), key: q.get('k'), at: Date.now() };
    if (!p || !p.orderId || !p.key || Date.now() - (p.at || 0) > 3 * 3600e3) return;
    css();
    const sheet = document.createElement('div');
    sheet.className = 'cp-root';
    sheet.innerHTML = '<div class="cp-bg" data-cp-x></div><div class="cp-sheet" role="dialog" aria-modal="true" aria-label="Plata"><div class="cp-head"><p>Plata online</p><button type="button" class="cp-x" data-cp-x aria-label="Închide">' + ICON.x + '</button></div><div class="cp"></div></div>';
    const box = sheet.querySelector('.cp');
    const say = (k, t, x) => { box.innerHTML = '<div class="cp-state"><div class="cp-ico' + (k === 'bad' ? ' bad' : '') + '">' + (k === 'wait' ? '<i class="spin"></i>' : k === 'bad' ? ICON.bad : ICON.check) + '</div><h3>' + t + '</h3><p>' + x + '</p><button type="button" class="cp-btn" data-cp-x>Gata</button></div>'; };
    let stop = false;
    const shut = () => { stop = true; sheet.classList.remove('open'); document.documentElement.style.overflow = ''; setTimeout(() => sheet.remove(), 400); };
    sheet.addEventListener('click', (e) => { if (e.target.closest('[data-cp-x]')) shut(); });
    const check = (n) => post({ action: 'check', orderId: p.orderId, key: p.key }).then((r) => {
      if (stop) return;
      if (r.paid) { try { localStorage.removeItem('c360-pay-pending'); } catch (e) { /* private mode */ } say('ok', 'Plătit', (p.amount ? lei(p.amount) + ' · ' : '') + 'Programarea e confirmată. Confirmarea vine și pe WhatsApp.'); return; }
      if (r.status && r.status !== 'open') { try { localStorage.removeItem('c360-pay-pending'); } catch (e) { /* private mode */ } if (q.get('plata')) say('bad', 'Plata nu a trecut', 'Banii nu au fost luați. Poți încerca din nou din programare.'); else shut(); return; }
      if (n < 20) setTimeout(() => check(n + 1), 3000);
    }, () => {});
    // shown only once there is something to say (a payment still waiting on her side shows nothing until it is paid)
    post({ action: 'check', orderId: p.orderId, key: p.key }).then((r) => {
      if (!r.paid && !q.get('plata') && (!r.status || r.status === 'open')) { const t = setInterval(() => post({ action: 'check', orderId: p.orderId, key: p.key }).then((x) => { if (x.paid) { clearInterval(t); show(); check(0); } }, () => {}), 5000); setTimeout(() => clearInterval(t), 10 * 60e3); return; }
      show(); say('wait', 'Verificăm plata…', 'Durează câteva secunde.'); check(0);
    }, () => {});
    function show() { if (sheet.isConnected) return; document.body.appendChild(sheet); sheet.offsetWidth; sheet.classList.add('open'); document.documentElement.style.overflow = 'hidden'; }
  }

  window.C360Pay = { ready, status, open, resume, preview: PREVIEW };
})();
