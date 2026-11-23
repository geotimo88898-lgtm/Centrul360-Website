/* ============================================================
   Centrul360, the online payment (the owner, 23.11: „foarte fluid, foarte simplu de plătit orice pe site”).
   One screen, open at once: the sum and what she gets for paying online, her name and phone (filled in when this device
   knows them), one solid button. Two myPOS ways, chosen by the server:
     - Payment Requests (the Partners app, now): myPOS's page for this order, in a new tab; the request is made in the
       background while she types, so the tap only opens it; this tab turns to „Plătit” by itself.
     - Embedded Checkout (the online store, when approved): myPOS's card form and Apple Pay / Google Pay in the page.
   The price is always the server's (api/pay.js); what the page shows first (preview) is replaced by the server's answer.

   For any part of the site (the booking slip, the Card de Sărbători):
     C360Pay.ready()                         → Promise<boolean>: the payment may be used on this page
     C360Pay.preload()                       loads what it needs ahead (the slip calls it when the page loads)
     C360Pay.open({ kind, ref, city, page, mount, preview, contact, onPaid, onClinic, onClose, onOrder, onContact, onError })
       kind: 'hold' | 'booking' | 'offer' | 'treatment' | 'card' | 'test'; ref: what is paid, or a Promise of it (the sheet
         opens at once, the order is made when the ref is there)
       preview: { amount, full, title, bonusText } shown at once (the server's numbers replace it)
       mount: an element to draw in (the slip); without it a sheet of its own opens over the page
       contact: false to not ask (the caller has them); { name, phone } to fill them in
       onPaid({ orderId, amount, confirmed }) · onClinic({ name, phone }) (button shown only when given) · onClose()
       onOrder({ orderId, key, amount }) · onContact({ name, phone }) · onError(code): the ref's promise failed (the caller
         takes over, e.g. the hour was taken)
     → Promise<{ paid, orderId, amount, confirmed }>
   ============================================================ */
(function () {
  'use strict';
  if (window.C360Pay) return;
  const SDK = '/vendor/mypos-embedded-sdk-20261123.js';
  const PREVIEW = /^\/v2\//.test(location.pathname) || /[?&]plata=test\b/.test(location.search);
  const ME = 'c360-book-me'; // { name, phone } this device already gave (the booking slip keeps it too)
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const lei = (n) => (Math.round(n * 100) % 100 ? (Math.round(n * 100) / 100).toFixed(2).replace('.', ',') : Math.round(n).toLocaleString('ro-RO')) + ' lei';
  const post = (body, keep) => fetch('/api/pay', { method: 'POST', keepalive: !!keep, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    .then((r) => r.json().then((d) => (r.ok ? d : Promise.reject(Object.assign(new Error(d.error || 'failed'), { code: d.error, said: d.message || '', status: d.status || 0, data: d })))), (e) => Promise.reject(Object.assign(e, { code: e.code || 'net' })));
  const store = { get(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } } };
  const digits = (p) => String(p || '').replace(/\D/g, '');
  const phoneOk = (p) => { const d = digits(p); return /^07\d{8}$/.test(d) || /^7\d{8}$/.test(d) || /^40?7\d{8}$/.test(d) || (d.length >= 11 && d.length <= 15 && !/^0/.test(d)); };

  let statusP = null, lastStatus = null;
  function status() {
    if (!statusP) statusP = fetch('/api/pay?status=1', { headers: { Accept: 'application/json' } }).then((r) => (r.ok ? r.json() : { on: false })).catch(() => ({ on: false })).then((s) => { lastStatus = s; return s; });
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
  function preload() { status().then((s) => { if (s && s.provider === 'embedded') sdk().catch(() => {}); }); css(); }
  // what the wallets' session says (Apple Pay / Google Pay switched on for the store): its first field, "wallet-cards-apple-google-…"
  function tokenInfo(t) { try { const p = JSON.parse(atob(t)).info.split('-'); return { apple: p[2] === '1', google: p[3] === '1' }; } catch (e) { return { apple: false, google: false }; } }
  // the bonus line: the server's text (the card's own, an offer's „+ BioLifting cadou…”, „-10% la plata online”)
  const bonusOf = (x) => String((x && (x.bonusText || (x.bonus && x.bonus.line))) || (x && x.bonusPct ? '-' + x.bonusPct + '% la plata online' : '')).trim();
  function sumInner(x) {
    const line = bonusOf(x);
    const strike = Number(x.full) > Number(x.amount) ? '<s>' + lei(x.full) + '</s> · ' : '';
    return '<b>' + lei(x.amount) + '</b>' + (line ? '<em class="cp-bonus">' + esc(line) + '</em>' : '') + '<small>' + strike + esc(x.title || '') + '</small>';
  }

  // the site's light look (v2/book-light.css). Solid, crisp, no blur and no fading anywhere (the owner, 23.11)
  const CSS = `
  .cp{ font-family:'Inter',system-ui,sans-serif; color:inherit; }
  .cp-sum{ margin:0 0 14px; padding:14px 16px; border-radius:18px; background:#f7fcfb; box-shadow:0 0 0 1px rgba(20,165,150,.2) inset; }
  .cp-sum b{ display:block; font-size:30px; font-weight:800; letter-spacing:-.035em; line-height:1.05; color:#0b0b0d; }
  .cp-bonus{ display:block; margin-top:6px; font-style:normal; font-size:14.5px; font-weight:700; color:#0b7f74; }
  .cp-sum small{ display:block; margin-top:4px; font-size:13px; line-height:1.35; color:#646b75; }
  .cp-sum s{ color:#9aa1aa; }
  .cp-two{ display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1fr); gap:8px; }
  @media (max-width:340px){ .cp-two{ grid-template-columns:1fr; } }
  .cp-f{ display:block; min-width:0; }
  .cp-f span{ display:block; font-size:12.5px; font-weight:500; color:#646b75; margin:0 0 5px; }
  .cp-f input{ width:100%; height:50px; padding:0 14px; border:0; border-radius:14px; background:#f5f7f7; color:#0b0b0d; font:inherit; font-size:16px; box-shadow:0 0 0 1px rgba(11,11,13,.1) inset; box-sizing:border-box; -webkit-appearance:none; appearance:none; }
  .cp-f input:focus{ outline:none; background:#fff; box-shadow:0 0 0 2px #14a596 inset; }
  .cp-f.err input{ box-shadow:0 0 0 2px #d9534f inset; }
  .cp-note{ margin:8px 2px 0; font-size:12.5px; line-height:1.4; color:#646b75; }
  .cp-msg{ margin:8px 2px 0; font-size:13.5px; font-weight:600; color:#b0362f; }
  .cp-msg[hidden]{ display:none; }
  .cp-btn{ display:flex; align-items:center; justify-content:center; gap:8px; width:100%; min-height:56px; margin-top:14px; border:0; border-radius:999px; color:#fff; background:#0f9083; box-shadow:0 10px 24px -12px rgba(16,145,132,.75);
    font:inherit; font-size:16.5px; font-weight:800; letter-spacing:-.01em; text-decoration:none; cursor:pointer; -webkit-tap-highlight-color:transparent; box-sizing:border-box; }
  .cp-btn:active{ background:#0b7f74; }
  .cp-ghost{ display:block; width:100%; min-height:50px; margin-top:10px; border-radius:999px; border:0; background:#fff; color:#0b0b0d; box-shadow:0 0 0 1px rgba(11,11,13,.14) inset; font:inherit; font-size:14.5px; font-weight:600; cursor:pointer; }
  .cp-safe{ display:flex; align-items:center; justify-content:center; gap:6px; margin:12px 0 0; font-size:12.5px; color:#7a818b; text-align:center; }
  .cp-w{ margin:12px 0 0; }
  .cp-w:empty{ display:none; }
  .cp-w iframe{ display:block; width:100% !important; border:0; border-radius:14px; }
  .cp-or{ display:flex; align-items:center; gap:12px; margin:14px 0 10px; font-size:12px; font-weight:600; letter-spacing:.14em; text-transform:uppercase; color:#9aa1aa; }
  .cp-or::before, .cp-or::after{ content:''; flex:1; height:1px; background:rgba(11,11,13,.1); }
  .cp-or[hidden]{ display:none; }
  .cp-card{ position:relative; min-height:420px; margin-top:12px; border-radius:18px; overflow:hidden; background:#fff; box-shadow:0 0 0 1px rgba(11,11,13,.08) inset; }
  .cp-card iframe{ display:block; width:100% !important; min-width:300px; border:0; }
  .cp-box{ position:relative; }
  .cp-tap{ position:absolute; inset:0; z-index:2; border:0; padding:0; background:transparent; cursor:pointer; }
  .cp-tap[hidden]{ display:none; }
  .cp-load{ position:absolute; inset:0; display:grid; place-items:center; background:#fff; color:#646b75; font-size:14px; text-align:center; }
  .cp-load i, .cp-ico .spin{ display:block; width:22px; height:22px; margin:0 auto 10px; border-radius:50%; border:2.5px solid rgba(20,165,150,.2); border-top-color:#14a596; animation:cpSp .8s linear infinite; }
  @keyframes cpSp{ to{ transform:rotate(360deg); } }
  .cp-state{ text-align:center; padding:14px 4px 4px; }
  .cp-state h3{ margin:0 0 8px; font-size:22px; font-weight:800; letter-spacing:-.03em; color:#0b0b0d; }
  .cp-state p{ margin:0 auto 14px; max-width:330px; font-size:14.5px; line-height:1.55; color:#4d545e; }
  .cp-ico{ width:64px; height:64px; margin:4px auto 14px; border-radius:50%; display:grid; place-items:center; background:#effaf8; box-shadow:0 0 0 1px rgba(20,165,150,.3) inset; }
  .cp-ico.bad{ background:#fdf1f0; box-shadow:0 0 0 1px rgba(200,68,63,.25) inset; }
  .cp-ico .spin{ margin:0; width:24px; height:24px; }
  .cp-root{ position:fixed; inset:0; z-index:230; display:flex; align-items:flex-end; justify-content:center; }
  .cp-bg{ position:absolute; inset:0; background:rgba(11,20,19,.42); }
  .cp-sheet{ position:relative; width:100%; max-width:468px; max-height:94dvh; overflow:auto; overscroll-behavior:contain; padding:14px 20px calc(20px + env(safe-area-inset-bottom)); box-sizing:border-box; border-radius:24px 24px 0 0; color:#0b0b0d;
    background:#fff; box-shadow:0 -10px 40px -20px rgba(11,40,38,.45); animation:cpUp .22s cubic-bezier(.2,.8,.2,1); }
  @keyframes cpUp{ from{ transform:translateY(24px); } to{ transform:none; } }
  @media (min-width:641px){ .cp-root{ align-items:center; padding:20px; } .cp-sheet{ border-radius:24px; } }
  .cp-head{ display:flex; align-items:center; justify-content:space-between; gap:10px; margin:0 0 12px; }
  .cp-head p{ margin:0; font-size:11px; font-weight:700; letter-spacing:.2em; text-transform:uppercase; color:#646b75; }
  .cp-x{ width:40px; height:40px; border-radius:50%; border:0; background:#f1f3f3; color:#0b0b0d; cursor:pointer; display:grid; place-items:center; padding:0; }
  .cp-test{ margin:0 0 12px; padding:8px 12px; border-radius:12px; font-size:12.5px; background:#fff7e6; color:#8a5a00; }
  @media (prefers-reduced-motion:reduce){ .cp-sheet{ animation:none; } }`;
  const ICON = {
    lock: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
    check: '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#0f9083" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    bad: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#c8443f" stroke-width="2.2" stroke-linecap="round"><path d="M12 7v6M12 17h.01"/></svg>',
    x: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>',
  };
  function css() { if (!document.getElementById('cp-css')) { const s = document.createElement('style'); s.id = 'cp-css'; s.textContent = CSS; document.head.appendChild(s); } }
  // an app's own browser (Facebook, Instagram, TikTok…): it may open no new tab; the payment goes on in the same one
  const IN_APP = /FBAN|FBAV|FB_IAB|FBIOS|Instagram|musical_ly|TikTok|BytedanceWebview|Snapchat|Pinterest|LinkedInApp|\bLine\//i;
  const ERR = {
    off: 'Plata online nu e pornită acum.', already_paid: 'E deja plătită.', cancelled: 'Programarea nu mai e activă.', not_found: 'Nu am găsit ce vrei să plătești.', expired: 'Ora ținută a expirat. Alege din nou ora.',
    not_in_city: 'Asta nu se face în clinica aleasă.', missing_contact: 'Scrie numele și telefonul.', card_not_ready: 'Plata pentru card nu e gata încă.', net: 'Nu avem internet acum. Încearcă din nou.',
    bad_phone: 'Numărul de telefon nu pare corect.', missing_name: 'Scrie numele tău.', has_booking: 'Ai deja o programare în ziua asta. Pentru încă una, scrie-ne pe WhatsApp.', no_url: 'Nu am putut deschide plata. Încearcă din nou.',
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
      document.documentElement.style.overflow = 'hidden';
    }
    let done = false, settle;
    const result = new Promise((r) => { settle = r; });
    const me = { destroy, id: ++seq };
    active = me;
    const finish = (r) => { if (done) return; done = true; polling++; settle(r); };
    let polling = 0;
    function destroy() {
      if (active === me) active = null;
      polling++;
      host.querySelectorAll('.cp-card, .cp-w').forEach((x) => { x.innerHTML = ''; });
      ['IPCForm', 'myposCheckoutThreedsModalBackdrop'].forEach((id) => { const x = document.getElementById(id); if (x) x.remove(); });
    }
    function closeSheet() {
      destroy();
      if (!sheet) return;
      document.documentElement.style.overflow = '';
      sheet.remove();
    }
    if (sheet) sheet.addEventListener('click', (e) => { if (e.target.closest('[data-cp-x]')) { closeSheet(); if (!done && o.onClose) o.onClose(); finish({ paid: false }); } });

    // ---- what is known at once: the preview's numbers, the way (from the status asked when the page loaded), her contact
    const ask = o.contact !== false;
    const known = Object.assign({}, store.get(ME) || {}, o.contact && typeof o.contact === 'object' ? o.contact : {});
    const who = { name: String(known.name || ''), phone: String(known.phone || '') };
    let order = null, orderErr = null, way = (lastStatus && lastStatus.provider) || 'requests';
    let contactSaved = '', link = '', linkP = null, n = me.id + '-' + Date.now().toString(36);
    const view = Object.assign({ amount: 0, full: 0, title: '', bonusText: '' }, o.preview || {});

    const $ = (s) => host.querySelector(s);
    const say = (t) => { const x = $('.cp-msg'); if (x) { x.textContent = t || ''; x.hidden = !t; } };
    const flag = (k, bad) => { const x = $('[data-cp-f="' + k + '"]'); if (x) x.classList.toggle('err', !!bad); };
    const fv = (k) => { const x = $('[name="cp-' + k + '"]'); return x ? x.value.trim() : ''; };
    const valid = () => !ask || (fv('name').length >= 2 && phoneOk(fv('phone')));
    function stateHtml(kind, title, text, buttons) {
      return '<div class="cp-state"><div class="cp-ico' + (kind === 'bad' ? ' bad' : '') + '">' + (kind === 'wait' ? '<i class="spin"></i>' : kind === 'bad' ? ICON.bad : ICON.check) + '</div><h3>' + title + '</h3>' + (text ? '<p>' + text + '</p>' : '') + (buttons || '') + '</div>';
    }
    const paint = (h) => { if (active === me || done) host.innerHTML = '<div class="cp">' + h + '</div>'; };

    // the one screen, drawn once (typing never redraws it)
    function screen() {
      paint((order && order.sandbox ? '<p class="cp-test">Cont de test myPOS: plătește doar cu un card de test.</p>' : '') +
        '<div class="cp-sum" data-cp-sum>' + sumInner(order || view) + '</div>' +
        (ask ? '<div class="cp-two">' +
          '<label class="cp-f" data-cp-f="name"><span>Nume</span><input name="cp-name" type="text" autocomplete="name" autocapitalize="words" enterkeyhint="next" placeholder="Maria Popescu" value="' + esc(who.name) + '"></label>' +
          '<label class="cp-f" data-cp-f="phone"><span>Telefon</span><input name="cp-phone" type="tel" inputmode="tel" autocomplete="tel" enterkeyhint="go" placeholder="07xx xxx xxx" value="' + esc(who.phone) + '"></label></div>' +
          '<p class="cp-note">Îți trimitem confirmarea pe WhatsApp.</p>' : '') +
        '<p class="cp-msg" hidden></p>' +
        (way === 'embedded'
          ? '<div class="cp-box"><div class="cp-w" id="cpW' + n + '"></div><button type="button" class="cp-tap" data-cp-tap hidden aria-label="Scrie întâi numele și telefonul"></button></div><p class="cp-or" id="cpO' + n + '" hidden>sau cu cardul</p>' +
            '<div class="cp-box"><div class="cp-card" id="cpC' + n + '"><div class="cp-load"><div><i></i>Se încarcă formularul securizat…</div></div></div><button type="button" class="cp-tap" data-cp-tap aria-label="Scrie întâi numele și telefonul"' + (ask ? '' : ' hidden') + '></button></div>'
          : '<button type="button" class="cp-btn" data-cp-pay>Plătesc ' + lei((order || view).amount) + '</button>') +
        '<p class="cp-safe">' + ICON.lock + (way === 'embedded' ? 'Plată securizată prin myPOS. Datele cardului nu ajung la noi.' : 'Pe pagina securizată myPOS completezi doar cardul. Emailul și telefonul de acolo nu sunt obligatorii.') + '</p>');
    }
    const refreshSum = () => { const s = $('[data-cp-sum]'); if (s && order) s.innerHTML = sumInner(order); const b = $('[data-cp-pay]'); if (b && order) b.textContent = 'Plătesc ' + lei(order.amount); };

    // ---- the order, in the background
    async function makeOrder() {
      try {
        const ref = await Promise.resolve(o.ref);
        const st = await status();
        // her name and phone known already (this device): the myPOS page is made in the same call
        const known = ask && valid() ? { name: fv('name'), phone: fv('phone') } : null;
        order = await post(Object.assign({ action: 'create', kind: o.kind, ref, city: o.city, name: ask ? fv('name') || who.name : o.name, phone: ask ? fv('phone') || who.phone : o.phone, page: o.page || location.pathname },
          known ? { link: true, notice: 'whatsapp-confirmation' } : {}));
        if (known && order.url) link = order.url;
        if (known && !order.contactError && known.name === fv('name') && known.phone === fv('phone')) saidContact(known);
        order.kind = o.kind;
        if (o.onOrder) o.onOrder({ orderId: order.orderId, key: order.key, amount: order.amount });
        if ((order.provider || st.provider) !== way) { way = order.provider; screen(); } else refreshSum();
        if (way === 'embedded') embedded();
        if (valid()) saveContact().then(() => { if (way === 'requests') prep(); }, () => {});
        return order;
      } catch (e) {
        orderErr = e;
        throw e;
      }
    }
    let orderP = null;
    const ensureOrder = () => { if (!orderP) orderP = makeOrder(); return orderP; };

    // ---- her name and phone: saved as soon as they are right (a little after she stops typing), once per value
    // (one call at a time per value: the order's making and her typing asked it twice at once before, 23.11; on the Partners
    // way the same call makes the myPOS page too)
    let contactP = null, contactK = '';
    function saidContact(c) {
      contactSaved = c.name + '|' + digits(c.phone);
      store.set(ME, { name: c.name, phone: c.phone });
      if (o.onContact) o.onContact({ name: c.name, phone: c.phone });
      host.querySelectorAll('[data-cp-tap]').forEach((x) => { x.hidden = true; });
    }
    async function saveContact() {
      if (!ask) return true;
      const c = { name: fv('name'), phone: fv('phone') }, key = c.name + '|' + digits(c.phone);
      if (contactSaved === key) return true;
      if (contactP && contactK === key) return contactP;
      contactK = key;
      contactP = (async () => {
        await ensureOrder();
        if (contactSaved === key) return true;
        const r = await post({ action: 'contact', orderId: order.orderId, key: order.key, name: c.name, phone: c.phone, consent: true, notice: 'whatsapp-confirmation', link: way === 'requests' && !link });
        if (r.url) link = r.url;
        saidContact(c);
        return true;
      })();
      contactP.catch(() => {}).then(() => { if (contactK === key) contactP = null; });
      return contactP;
    }
    // the myPOS page of this order, made in the background (the tap then only opens it)
    function getLink() {
      if (link) return Promise.resolve(link);
      if (!linkP) {
        linkP = ensureOrder().then(() => saveContact()).then(() => link || post({ action: 'link', orderId: order.orderId, key: order.key }).then((r) => { link = r.url; return link; }));
        linkP.catch(() => { linkP = null; });
      }
      return linkP;
    }
    // made ahead quietly: a failure here says nothing (the tap's own tab tries again, and says what failed)
    const prep = () => getLink().catch((e) => { note('prep', e && (e.code || e.status)); });
    const note = (step, code) => { if (order) post({ action: 'trace', orderId: order.orderId, key: order.key, step, code: String(code || '') }, true).catch(() => {}); };
    let typing = 0;
    host.addEventListener('input', (e) => {
      if (!e.target.closest('.cp-f')) return;
      const k = (e.target.name || '').replace('cp-', ''); flag(k, false); say('');
      clearTimeout(typing);
      typing = setTimeout(() => { if (valid()) { saveContact().then(() => { if (way === 'requests') prep(); }, (err) => showErr(err)); } }, 450);
    });
    function showErr(e) {
      if (e && e.code === 'bad_phone') flag('phone', true);
      if (e && e.code === 'missing_name') flag('name', true);
      say((e && ERR[e.code]) || (o.kind === 'test' && e && e.said ? 'myPOS ' + (e.status || '') + ': ' + e.said : 'Nu am putut pregăti plata. Încearcă din nou.'));
    }
    function needContact() {
      const bn = fv('name').length < 2, bp = !phoneOk(fv('phone'));
      flag('name', bn); flag('phone', bp);
      say(bn && bp ? 'Scrie numele și telefonul.' : bn ? 'Scrie numele tău.' : 'Scrie un număr de telefon valid.');
      const f = $(bn ? '[name="cp-name"]' : '[name="cp-phone"]'); if (f) f.focus();
    }

    // ---- the tap: only opens the page (a blank tab at once when the link isn't there yet, Safari lets that through)
    host.addEventListener('click', (e) => {
      const b = e.target.closest('button, a'); if (!b || !host.contains(b)) return;
      if (b.hasAttribute('data-cp-tap')) { if (!valid()) needContact(); else saveContact().catch(showErr); return; }
      if (b.hasAttribute('data-cp-retry')) { start(); return; }
      if (b.hasAttribute('data-cp-done')) { closeSheet(); return; }
      if (b.hasAttribute('data-cp-clinic')) {
        b.disabled = true;
        const leave = () => { destroy(); if (sheet) closeSheet(); if (o.onClinic) o.onClinic({ name: fv('name') || who.name, phone: fv('phone') || who.phone }); finish({ paid: false, clinic: true }); };
        if (order && (order.kind === 'booking' || order.kind === 'hold')) post({ action: 'clinic', orderId: order.orderId, key: order.key }).then(leave, leave); else leave();
        return;
      }
      if (!b.hasAttribute('data-cp-pay') && !b.hasAttribute('data-cp-again')) return;
      e.preventDefault();
      if (b.hasAttribute('data-cp-pay') && !valid()) { needContact(); return; }
      // the page of myPOS made already: opened in this very tap
      const inApp = IN_APP.test(navigator.userAgent || '');
      if (link) { note('tap', 'link'); if (inApp) { sameTab(link); return; } const w = window.open(link, '_blank'); if (!w) sameTab(link); else waitPaid(); return; }
      // the order there, its page not yet: a new tab of ours makes it and goes there by itself (iOS stops this page as soon
      // as the tab opens, so nothing is left to do here: 23.11); an app's browser that opens no tabs: the same tab
      if (order) { note('tap', inApp ? 'go-self' : 'go'); go(inApp ? '_self' : '_blank'); return; }
      // the order not made yet (a tap in the first second): it is waited for here, then the same tab (a tab opened now would
      // stop this page before the order is made)
      const label = b.textContent; b.disabled = true; b.textContent = 'Se pregătește plata…';
      ensureOrder().then(() => { note('tap', 'late'); if (link) sameTab(link); else go('_self'); }, (err) => { b.disabled = false; b.textContent = label; showErr(err); });
    });
    // the tap's tab: a form sent to /api/pay-go (her name and phone in the body, never in a URL); that tab saves them, makes
    // the myPOS page and goes there by itself. A new tab that did not open (an app's browser): the same tab after a moment.
    function go(target) {
      const c = ask ? { name: fv('name') || who.name, phone: fv('phone') || who.phone } : null;
      if (c && c.name && c.phone) { who.name = c.name; who.phone = c.phone; store.set(ME, c); if (o.onContact && contactSaved !== c.name + '|' + digits(c.phone)) o.onContact(c); }
      store.set('c360-pay-pending', { orderId: order.orderId, key: order.key, amount: order.amount, title: order.title, at: Date.now() });
      const f = document.createElement('form');
      f.method = 'POST'; f.action = '/api/pay-go'; f.style.display = 'none';
      const add = (k, v) => { const i = document.createElement('input'); i.type = 'hidden'; i.name = k; i.value = v; f.appendChild(i); };
      add('orderId', order.orderId); add('key', order.key);
      if (c) { add('name', c.name || ''); add('phone', c.phone || ''); add('notice', 'whatsapp-confirmation'); }
      document.body.appendChild(f);
      // a new tab of its own, opened in the tap and named: the form goes into it. None given (an app's browser, a blocker):
      // the same tab. Never guessed from the focus afterwards (two tabs on one payment, 23.11).
      let w = null;
      if (target !== '_self') { const nm = 'c360pay' + String(n).replace(/\W/g, ''); try { w = window.open('', nm); } catch (x) { w = null; } if (w) f.target = nm; }
      if (!w) { note('tab', target === '_self' ? 'self' : 'none'); f.target = '_self'; f.submit(); return; }
      f.submit(); f.remove();
      waitPaid();
    }
    // the browser didn't open a tab (an app's own browser): the same tab, and the site says „Plătit” when she comes back
    function sameTab(url) {
      if (!/^https:\/\//.test(String(url || '')) && !/^http:\/\/(localhost|127\.0\.0\.1)[:/]/.test(String(url || ''))) { showErr({ code: 'no_url' }); return; }
      store.set('c360-pay-pending', { orderId: order.orderId, key: order.key, amount: order.amount, title: order.title, at: Date.now() });
      location.assign(url);
    }
    function fail(msg) {
      destroy(); active = me;
      paint(stateHtml('bad', 'Plata nu a trecut', esc(msg || 'Banca nu a aprobat plata. Banii nu au fost luați.'),
        '<button type="button" class="cp-btn" data-cp-retry>Încearcă din nou</button>' + (o.onClinic ? '<button type="button" class="cp-ghost" data-cp-clinic>Plătesc în clinică</button>' : '')));
    }
    function paidNow(confirmed) {
      store.set('c360-pay-pending', null);
      const out = { paid: true, orderId: order.orderId, amount: order.amount, confirmed: !!confirmed };
      if (o.onPaid) o.onPaid(out);
      if (!o.mount) paint(stateHtml('ok', 'Plătit', confirmed ? 'Mulțumim! Confirmarea vine și pe WhatsApp.' : 'Plata e în confirmare la bancă. Îți scriem pe WhatsApp imediat ce vine.', '<button type="button" class="cp-btn" data-cp-done>Gata</button>'));
      finish(out);
    }
    // she pays in the myPOS tab; this one asks the server every few seconds (at once when she comes back)
    function waitPaid() {
      store.set('c360-pay-pending', { orderId: order.orderId, key: order.key, amount: order.amount, title: order.title, at: Date.now() });
      paint(stateHtml('wait', 'Plătește în fila myPOS', 'S-a deschis cu ' + lei(order.amount) + ' completat. Când ai plătit, revino aici: se actualizează singur.',
        '<button type="button" class="cp-btn" data-cp-again>Deschide din nou plata</button>' + (o.onClinic ? '<button type="button" class="cp-ghost" data-cp-clinic>Plătesc în clinică</button>' : '')));
      const mine = ++polling, t0 = Date.now();
      const tick = async () => {
        if (mine !== polling || done) return;
        let r = {};
        try { r = await post({ action: 'check', orderId: order.orderId, key: order.key }); } catch (e) { r = {}; }
        if (mine !== polling || done) return;
        if (r.paid) { paidNow(true); return; }
        if (r.status === 'failed' || r.status === 'mismatch' || r.status === 'double') { fail(r.status === 'double' ? 'E deja plătită. A doua plată se întoarce singură pe card.' : 'Plata a expirat sau a fost anulată. Banii nu au fost luați.'); return; }
        if (Date.now() - t0 < 45 * 60e3) setTimeout(tick, document.hidden ? 8000 : 2500);
      };
      setTimeout(tick, 2000);
      const vis = () => { if (!document.hidden && mine === polling && !done) { document.removeEventListener('visibilitychange', vis); tick(); } };
      document.addEventListener('visibilitychange', vis);
    }
    // myPOS said yes in the page (the embedded way): its signed answer is asked for at the server
    async function confirm() {
      destroy(); active = me;
      paint(stateHtml('wait', 'Verificăm plata…', 'Durează câteva secunde.'));
      let r = { paid: false };
      for (let i = 0; i < 8 && !r.paid; i++) {
        if (i) await new Promise((w) => setTimeout(w, 1500));
        try { r = await post({ action: 'check', orderId: order.orderId, key: order.key }); } catch (e) { r = { paid: false }; }
        if (r.status === 'failed' || r.status === 'mismatch' || r.status === 'double') break;
      }
      if (r.status === 'failed' || r.status === 'mismatch' || r.status === 'double') { fail(r.status === 'double' ? 'E deja plătită. A doua plată se întoarce singură pe card.' : ''); return; }
      paidNow(!!r.paid);
    }
    // the embedded way: the wallets and myPOS's card frame (a transparent cover asks for the name and phone first)
    async function embedded() {
      let M;
      try { M = await sdk(); } catch (e) { fail('Formularul de plată nu s-a încărcat. Încearcă din nou.'); return; }
      if (active !== me) return;
      const sandbox = !!order.sandbox;
      const ti = order.sessionToken ? tokenInfo(order.sessionToken) : {};
      const wallet = { isSandbox: sandbox, onSuccess: () => confirm(), onDecline: () => fail() };
      const showOr = () => { const x = document.getElementById('cpO' + n); if (x) x.hidden = false; };
      try {
        if (ti.apple && M.IS_APPLE_PAY_AVAILABLE) M.createApplePayButton('cpW' + n, order.sessionToken, Object.assign({ merchantName: 'Centrul360' }, wallet)).then(showOr).catch(() => {});
        else if (ti.google && M.IS_GOOGLE_PAY_AVAILABLE) M.isGooglePayPaymentAvailable(order.sessionToken, { isSandbox: sandbox, onAvailable: () => { M.createGooglePayButton('cpW' + n, order.sessionToken, wallet).then(showOr).catch(() => {}); }, onUnavailable: () => {} }).catch(() => {});
      } catch (e) { /* the card form is enough */ }
      if (ask && contactSaved) host.querySelectorAll('[data-cp-tap]').forEach((x) => { x.hidden = true; });
      const params = Object.assign({}, order.params, { urlOk: location.href.split('#')[0], urlCancel: location.href.split('#')[0] });
      const look = { formBackgroundColor: '#ffffff', labelColor: '#646b75', labelFontSize: '14px', inputBorderRadius: '14px', payButtonBackgroundColor: '#0f9083', payButtonBorderColor: '#0f9083',
        payButtonColor: '#ffffff', payButtonBackgroundColorHover: '#0b7f74', payButtonBorderColorHover: '#0b7f74', payButtonColorHover: '#ffffff', payButtonFontSize: '16px' };
      M.createPayment('cpC' + n, params, { isSandbox: sandbox, onSuccess: () => confirm(), onError: () => fail(), onDecline: () => fail() }, look)
        .then(() => { const l = $('.cp-load'); if (l) l.remove(); }).catch(() => fail('Formularul de plată nu s-a încărcat. Încearcă din nou.'));
    }

    function start() {
      n = me.id + '-' + Date.now().toString(36);
      link = ''; linkP = null; contactSaved = ''; orderErr = null; order = null; orderP = null;
      if (o.preview || lastStatus) screen(); else paint('<div class="cp-state"><div class="cp-ico"><i class="spin"></i></div></div>');
      ensureOrder().then(() => { if (!host.querySelector('[data-cp-sum]')) screen(); }, (e) => {
        if (e && e.fromRef) return; // the caller took over (onError)
        fail(ERR[e && e.code] || (o.kind === 'test' && e && e.said ? 'myPOS: ' + e.said : 'Nu am putut porni plata. Încearcă din nou.'));
      });
    }
    // a ref given as a promise that fails (the hour was taken): the caller decides
    if (o.ref && typeof o.ref.then === 'function') o.ref = o.ref.catch((e) => { const err = Object.assign(new Error((e && e.code) || 'ref'), { code: (e && e.code) || 'ref', fromRef: true }); if (o.onError) o.onError(err.code); throw err; });
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


  window.C360Pay = { ready, status, preload, open, resume, preview: PREVIEW };
})();
