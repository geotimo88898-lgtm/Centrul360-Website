/* ============================================================
   Centrul360, online booking on every page of the site.
   The client picks the clinic, the treatment, the day and a free hour (the portal's Calendar, api/booking.js)
   and is booked at once: the confirmation and the reminders come on WhatsApp from the clinic's number.
   Every "Programează" / "Rezervă" / "Consultație gratuită" button opens it (also the ones that used to open
   WhatsApp or the call-back form); the forms of the lead magnet (the home page's quiz, the treatment pages'
   "Consultație gratuită" form with the gift) and the plain WhatsApp contacts ("Întreabă", the phone numbers,
   "Preferi WhatsApp?") stay as they are.
   C360Book.open({ service, city, label }) from code, #programare in the address, /programare as a page.
   ============================================================ */
(function () {
  'use strict';
  if (window.C360Book) return;

  const WA = { 'Timișoara': '40750452002', Arad: '40750277394' };
  const ADDR = { 'Timișoara': 'Str. Bucegi 7, Timișoara', Arad: 'Str. Ioan Alexandru 16-18, Arad' };
  const MAPS = { 'Timișoara': 'https://www.google.com/maps/search/?api=1&query=Centrul360%20Strada%20Bucegi%207%20Timisoara', Arad: 'https://www.google.com/maps/search/?api=1&query=Centrul360%20Strada%20Ioan%20Alexandru%2016-18%20Arad' };
  const WD = ['Du', 'Lu', 'Ma', 'Mi', 'Jo', 'Vi', 'Sâ'];
  const WDL = ['duminică', 'luni', 'marți', 'miercuri', 'joi', 'vineri', 'sâmbătă'];
  const MO = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];
  const PAGE = (location.pathname.split('/').pop() || 'index').replace(/\.html$/, '');
  const PAGE_CITY = { timisoara: 'Timișoara', arad: 'Arad', 'epilare-laser': 'Timișoara', 'tonifiere-musculara': 'Timișoara', 'detox-drenaj': 'Timișoara' }[PAGE] || '';

  const CSS = `
  .bk-root{ position:fixed; inset:0; z-index:210; display:flex; align-items:center; justify-content:center; padding:20px; visibility:hidden; font-family:'Inter',system-ui,sans-serif; }
  .bk-root.open{ visibility:visible; }
  .bk-root.bk-inline{ position:static; inset:auto; padding:0; display:block; visibility:visible; z-index:auto; min-width:0; max-width:100%; }
  .bk, .bk-body{ min-width:0; }
  .bk-bg{ position:absolute; inset:0; background:rgba(4,4,6,.74); -webkit-backdrop-filter:blur(6px); backdrop-filter:blur(6px); opacity:0; transition:opacity .35s ease; }
  .bk-root.open .bk-bg{ opacity:1; }
  .bk{ position:relative; width:100%; max-width:468px; max-height:calc(100dvh - 40px); display:flex; flex-direction:column; color:#f5f4f2;
    background:linear-gradient(180deg,#17171c 0%,#111115 100%); border:1px solid rgba(255,255,255,.11); border-radius:28px;
    box-shadow:0 40px 100px -30px rgba(0,0,0,.95), inset 0 1px 0 rgba(255,255,255,.06); transform:translateY(18px) scale(.985); opacity:0;
    transition:transform .45s cubic-bezier(.16,1,.3,1), opacity .3s ease; overflow:hidden; -webkit-font-smoothing:antialiased; }
  .bk-root.open .bk{ transform:none; opacity:1; }
  .bk-inline .bk{ transform:none; opacity:1; max-height:none; box-shadow:0 30px 80px -40px rgba(0,0,0,.9); }
  @media (max-width:640px){
    .bk-root{ align-items:flex-end; padding:0; }
    .bk{ max-width:none; border-radius:26px 26px 0 0; max-height:94dvh; transform:translateY(40px); border-bottom:0; }
    .bk-inline .bk{ border-radius:26px; border-bottom:1px solid rgba(255,255,255,.11); }
    .bk-grab{ display:block !important; }
  }
  .bk-inline .bk-grab{ display:none !important; }
  .bk-grab{ display:none; width:38px; height:4px; border-radius:4px; background:rgba(255,255,255,.18); margin:9px auto 0; flex:none; }
  .bk-head{ display:flex; align-items:center; gap:10px; padding:14px 14px 0 16px; flex:none; }
  .bk-ico{ width:40px; height:40px; flex:none; display:grid; place-items:center; border-radius:50%; border:1px solid rgba(255,255,255,.1); background:rgba(255,255,255,.05); color:#f5f4f2; cursor:pointer; transition:background-color .2s, opacity .2s; padding:0; }
  .bk-ico:hover{ background:rgba(255,255,255,.12); }
  .bk-ico[hidden]{ display:grid !important; visibility:hidden; }
  .bk-prog{ flex:1; display:flex; gap:5px; }
  .bk-prog i{ flex:1; height:3px; border-radius:3px; background:rgba(255,255,255,.09); overflow:hidden; position:relative; }
  .bk-prog i::after{ content:''; position:absolute; inset:0; transform:scaleX(0); transform-origin:left; background:linear-gradient(90deg,#e9cfa3,#f6e6c8); transition:transform .5s cubic-bezier(.16,1,.3,1); }
  .bk-prog i.on::after{ transform:none; }
  .bk-body{ overflow:auto; padding:18px 22px 22px; overscroll-behavior:contain; scrollbar-width:thin; }
  .bk-inline .bk-body{ overflow:visible; }
  .bk-eyebrow{ display:flex; align-items:center; gap:8px; font-size:10.5px; font-weight:600; letter-spacing:.22em; text-transform:uppercase; color:rgba(245,244,242,.55); margin:0 0 10px; }
  .bk-eyebrow::before{ content:''; width:6px; height:6px; border-radius:50%; background:#e9cfa3; box-shadow:0 0 12px rgba(233,207,163,.7); }
  .bk-h{ margin:0 0 18px; font-size:27px; line-height:1.08; font-weight:800; letter-spacing:-.035em; }
  .bk-h em{ font-family:'Fraunces',Georgia,serif; font-style:italic; font-weight:400; letter-spacing:-.01em; }
  .bk-seg{ display:grid; grid-template-columns:1fr 1fr; gap:4px; padding:4px; border-radius:999px; background:rgba(255,255,255,.05); border:1px solid rgba(255,255,255,.08); margin-bottom:16px; }
  .bk-seg button{ height:40px; border:0; border-radius:999px; background:transparent; color:rgba(245,244,242,.6); font:inherit; font-size:14px; font-weight:600; cursor:pointer; transition:background-color .25s, color .25s; }
  .bk-seg button.on{ background:#f5f4f2; color:#0b0b0d; }
  .bk-list{ display:grid; gap:8px; }
  .bk-svc{ display:flex; align-items:center; gap:14px; width:100%; text-align:left; padding:15px 16px; border-radius:18px; border:1px solid rgba(255,255,255,.1); background:rgba(255,255,255,.035); color:#f5f4f2; font:inherit; cursor:pointer; transition:border-color .2s, background-color .2s, transform .2s; }
  .bk-svc:hover{ border-color:rgba(255,255,255,.26); background:rgba(255,255,255,.06); }
  .bk-svc:active{ transform:scale(.99); }
  .bk-svc.on{ border-color:#e9cfa3; background:rgba(233,207,163,.07); }
  .bk-svc b{ display:block; font-size:15px; font-weight:700; letter-spacing:-.01em; }
  .bk-svc small{ display:block; margin-top:3px; font-size:12.5px; color:rgba(245,244,242,.5); }
  .bk-svc .bk-pr{ margin-left:auto; text-align:right; flex:none; }
  .bk-pr strong{ display:block; font-size:15px; font-weight:800; letter-spacing:-.02em; }
  .bk-pr s{ display:block; font-size:12px; color:rgba(245,244,242,.38); }
  .bk-pr .free{ color:#e9cfa3; font-weight:700; font-size:13px; }
  .bk-svc.gift{ border-color:rgba(233,207,163,.35); }
  .bk-city{ padding:16px; }
  .bk-opt{ padding:18px; align-items:flex-start; }
  .bk-opt .bk-pr{ align-self:center; }
  .bk-tag{ display:inline-block; font-style:normal; font-size:10.5px; font-weight:600; letter-spacing:.14em; text-transform:uppercase; color:#e9cfa3; margin-bottom:6px; }
  .bk-opt b{ font-size:16px; }
  .bk-opt small{ line-height:1.45; max-width:30ch; }
  .bk-pin{ width:44px; height:44px; flex:none; border-radius:50%; display:grid; place-items:center; color:#e9cfa3; background:rgba(233,207,163,.08); border:1px solid rgba(233,207,163,.25); }
  .bk-city b{ font-size:16.5px; }
  .bk-go{ margin-left:auto; flex:none; color:rgba(245,244,242,.4); display:grid; place-items:center; transition:transform .25s cubic-bezier(.16,1,.3,1), color .2s; }
  .bk-city:hover .bk-go{ transform:translateX(3px); color:#f5f4f2; }
  .bk-chip{ display:flex; align-items:center; gap:12px; padding:12px 12px 12px 16px; border-radius:16px; background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.08); margin-bottom:14px; }
  .bk-chip div{ min-width:0; }
  .bk-chip b{ display:block; font-size:14.5px; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .bk-chip small{ display:block; font-size:12.5px; color:rgba(245,244,242,.5); margin-top:2px; }
  .bk-link{ margin-left:auto; flex:none; border:0; background:rgba(255,255,255,.07); color:#f5f4f2; font:inherit; font-size:12.5px; font-weight:600; padding:8px 12px; border-radius:999px; cursor:pointer; }
  .bk-link:hover{ background:rgba(255,255,255,.13); }
  .bk-cal{ margin:2px 0 4px; }
  .bk-cal-h{ display:flex; align-items:baseline; justify-content:space-between; margin:0 2px 10px; }
  .bk-cal-h b{ font-size:14px; font-weight:700; letter-spacing:-.01em; }
  .bk-cal-h span{ font-size:12px; color:rgba(245,244,242,.42); }
  .bk-cal-wd, .bk-cal-g{ display:grid; grid-template-columns:repeat(7,minmax(0,1fr)); gap:4px; }
  .bk-cal-wd span{ text-align:center; font-size:10.5px; font-weight:600; letter-spacing:.08em; text-transform:uppercase; color:rgba(245,244,242,.36); padding-bottom:6px; }
  .bk-cd{ position:relative; height:44px; display:grid; place-items:center; border:0; border-radius:13px; background:transparent; color:rgba(245,244,242,.2); font:inherit; font-size:15px; font-weight:600; font-variant-numeric:tabular-nums; padding:0; cursor:default; transition:background-color .2s, color .2s, transform .15s; }
  .bk-cd.has{ color:#f5f4f2; background:rgba(255,255,255,.05); cursor:pointer; }
  .bk-cd.has::after{ content:''; position:absolute; bottom:6px; left:50%; width:4px; height:4px; margin-left:-2px; border-radius:50%; background:#e9cfa3; }
  .bk-cd.has:hover{ background:rgba(255,255,255,.11); }
  .bk-cd.has:active{ transform:scale(.95); }
  .bk-cd.on, .bk-cd.on:hover{ background:#f5f4f2; color:#0b0b0d; }
  @media (hover:none){ .bk-cd.has:hover:not(.on){ background:rgba(255,255,255,.05); } }
  .bk-cd.on::after{ background:#0b0b0d; }
  .bk-cd.today:not(.on){ box-shadow:inset 0 0 0 1px rgba(233,207,163,.45); }
  .bk-daylbl{ margin:18px 0 0 !important; font-size:13px !important; color:rgba(245,244,242,.85) !important; font-weight:700 !important; }
  .bk-daylbl + .bk-part{ margin-top:8px; }
  .bk-part{ margin:14px 0 8px; font-size:12px; font-weight:600; color:rgba(245,244,242,.45); letter-spacing:.02em; }
  .bk-times{ display:grid; grid-template-columns:repeat(4,1fr); gap:8px; }
  @media (max-width:380px){ .bk-times{ grid-template-columns:repeat(3,1fr); } }
  .bk-time{ height:46px; border-radius:14px; border:1px solid rgba(255,255,255,.1); background:rgba(255,255,255,.035); color:#f5f4f2; font:inherit; font-size:15px; font-weight:600; letter-spacing:-.01em; cursor:pointer; font-variant-numeric:tabular-nums; transition:border-color .2s, background-color .2s, transform .15s; }
  .bk-time:hover{ border-color:rgba(255,255,255,.3); background:rgba(255,255,255,.07); }
  .bk-time:active{ transform:scale(.97); }
  .bk-time.on{ background:#f5f4f2; color:#0b0b0d; border-color:#f5f4f2; }
  .bk-empty{ padding:22px 16px; border-radius:16px; border:1px dashed rgba(255,255,255,.12); text-align:center; color:rgba(245,244,242,.55); font-size:14px; line-height:1.5; }
  .bk-skel{ height:46px; border-radius:14px; background:linear-gradient(90deg,rgba(255,255,255,.04),rgba(255,255,255,.09),rgba(255,255,255,.04)); background-size:200% 100%; animation:bkSh 1.2s ease-in-out infinite; }
  .bk-skel.cd{ height:44px; border-radius:13px; }
  @keyframes bkSh{ 0%{ background-position:100% 0; } 100%{ background-position:-100% 0; } }
  .bk-sum{ position:relative; padding:16px 18px; border-radius:20px; background:radial-gradient(120% 140% at 100% 0%,rgba(233,207,163,.13),transparent 55%),rgba(255,255,255,.04); border:1px solid rgba(233,207,163,.22); margin-bottom:18px; }
  .bk-sum .when{ font-size:20px; font-weight:800; letter-spacing:-.03em; }
  .bk-sum .when span{ color:#e9cfa3; }
  .bk-sum .what{ margin-top:4px; font-size:13.5px; color:rgba(245,244,242,.6); }
  .bk-f{ margin-bottom:12px; }
  .bk-f label{ display:block; font-size:13px; font-weight:500; color:rgba(245,244,242,.6); margin-bottom:6px; }
  .bk-f input{ width:100%; height:52px; padding:0 16px; border-radius:16px; border:1px solid rgba(255,255,255,.13); background:rgba(0,0,0,.28); color:#f5f4f2; font:inherit; font-size:16px; transition:border-color .2s, box-shadow .2s; box-sizing:border-box; }
  .bk-f input::placeholder{ color:rgba(245,244,242,.28); }
  .bk-f input:focus{ outline:none; border-color:rgba(245,244,242,.85); box-shadow:0 0 0 4px rgba(255,255,255,.06); }
  .bk-f.err input{ border-color:#e79a94; }
  .bk-f .msg{ display:none; color:#e79a94; font-size:13px; margin-top:6px; }
  .bk-f.err .msg{ display:block; }
  .bk-ok{ display:flex; gap:10px; align-items:flex-start; font-size:13px; line-height:1.5; color:rgba(245,244,242,.55); cursor:pointer; margin:6px 0 4px; }
  .bk-ok input{ width:18px; height:18px; margin:1px 0 0; flex:none; accent-color:#e9cfa3; }
  .bk-ok.err{ color:#e79a94; }
  .bk-cta{ position:relative; width:100%; min-height:56px; margin-top:16px; border:0; border-radius:999px; background:#f5f4f2; color:#0b0b0d; font:inherit; font-size:15.5px; font-weight:700; letter-spacing:-.01em; cursor:pointer;
    display:flex; align-items:center; justify-content:center; gap:10px; box-shadow:0 14px 40px -14px rgba(245,244,242,.45); transition:transform .25s cubic-bezier(.16,1,.3,1), opacity .2s; }
  .bk-cta:hover{ transform:translateY(-1px); }
  .bk-cta:active{ transform:scale(.985); }
  .bk-cta:disabled{ opacity:.65; cursor:default; transform:none; }
  .bk-cta .spin{ width:16px; height:16px; border-radius:50%; border:2px solid rgba(11,11,13,.25); border-top-color:#0b0b0d; animation:bkSp .8s linear infinite; }
  @keyframes bkSp{ to{ transform:rotate(360deg); } }
  .bk-note{ margin:12px 0 0; text-align:center; font-size:12.5px; line-height:1.5; color:rgba(245,244,242,.45); }
  .bk-note a{ color:rgba(245,244,242,.8); text-decoration:underline; text-underline-offset:3px; }
  .bk-alert{ padding:12px 14px; border-radius:14px; background:rgba(231,154,148,.1); border:1px solid rgba(231,154,148,.3); color:#f1c3be; font-size:13.5px; line-height:1.5; margin-bottom:14px; }
  .bk-alert a{ color:#fff; text-decoration:underline; text-underline-offset:3px; }
  .bk-done{ text-align:center; padding:8px 0 4px; }
  .bk-check{ width:76px; height:76px; margin:6px auto 18px; border-radius:50%; display:grid; place-items:center; background:radial-gradient(circle,rgba(233,207,163,.22),rgba(233,207,163,.04) 70%); border:1px solid rgba(233,207,163,.45); box-shadow:0 0 60px -10px rgba(233,207,163,.45); }
  .bk-check svg{ width:34px; height:34px; }
  .bk-check path{ stroke-dasharray:30; stroke-dashoffset:30; animation:bkDraw .6s .15s cubic-bezier(.65,0,.35,1) forwards; }
  @keyframes bkDraw{ to{ stroke-dashoffset:0; } }
  .bk-done .bk-h{ margin-bottom:8px; }
  .bk-done p{ margin:0 auto 18px; max-width:330px; font-size:14px; line-height:1.55; color:rgba(245,244,242,.6); }
  .bk-card{ text-align:left; border-radius:20px; border:1px solid rgba(255,255,255,.1); background:rgba(255,255,255,.035); padding:6px 16px; margin-bottom:16px; }
  .bk-row{ display:flex; gap:12px; align-items:flex-start; padding:12px 0; }
  .bk-row + .bk-row{ border-top:1px solid rgba(255,255,255,.07); }
  .bk-row svg{ flex:none; margin-top:2px; opacity:.6; }
  .bk-row b{ display:block; font-size:14.5px; font-weight:700; }
  .bk-row small{ display:block; font-size:12.5px; color:rgba(245,244,242,.5); margin-top:2px; }
  .bk-two{ display:grid; grid-template-columns:1fr 1fr; gap:8px; }
  .bk-ghost{ min-height:50px; border-radius:999px; border:1px solid rgba(255,255,255,.14); background:rgba(255,255,255,.06); color:#f5f4f2; font:inherit; font-size:14px; font-weight:600; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:8px; text-decoration:none; transition:background-color .2s; }
  .bk-ghost:hover{ background:rgba(255,255,255,.12); }
  .bk-step{ animation:bkIn .45s cubic-bezier(.16,1,.3,1); }
  @keyframes bkIn{ from{ opacity:0; transform:translateX(14px); } to{ opacity:1; transform:none; } }
  .bk-step.back{ animation-name:bkBack; }
  @keyframes bkBack{ from{ opacity:0; transform:translateX(-14px); } to{ opacity:1; transform:none; } }
  .bk [hidden]{ display:none !important; }
  @media (prefers-reduced-motion:reduce){ .bk, .bk-step, .bk-check path, .bk-prog i::after{ animation:none !important; transition:none !important; } .bk-check path{ stroke-dashoffset:0; } }`;

  const ICON = {
    back: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
    x: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>',
    cal: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
    pin: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',
    spark: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4z"/></svg>',
    wa: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16v11H8l-4 4V5z"/></svg>',
    next: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="#e9cfa3" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>'
  };

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const dt = (d) => new Date(d + 'T12:00:00Z');
  const niceDay = (d) => { const x = dt(d); return WDL[x.getUTCDay()] + ', ' + x.getUTCDate() + ' ' + MO[x.getUTCMonth()]; };
  const lei = (n) => Math.round(n).toLocaleString('ro-RO') + ' lei';
  const mins = (m) => (m >= 60 ? (m % 60 ? Math.floor(m / 60) + ' h ' + (m % 60) + ' min' : (m / 60) + (m === 60 ? ' oră' : ' ore')) : m + ' min');
  const store = { get(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } } };

  let root, sheet, body, S, inline = false, pushed = false, lastFocus = null, seq = 0;
  // a city's treatments with the consultation's free hours, asked once and kept a minute: asked for both cities the
  // moment the window opens, so the hours are there when she taps her city
  const early = {};
  function cityData(city) {
    const e = early[city];
    if (e && Date.now() - e.at < 60e3) return e.p;
    const p = fetch('/api/booking?' + new URLSearchParams({ city, service: 'consult' }).toString(), { headers: { Accept: 'application/json' } })
      .then((r) => r.json().then((d) => { if (!r.ok) throw new Error(d.error || 'failed'); return d; }));
    p.catch(() => { delete early[city]; });
    early[city] = { at: Date.now(), p };
    return p;
  }

  function build(mount) {
    if (!document.getElementById('bk-css')) { const st = document.createElement('style'); st.id = 'bk-css'; st.textContent = CSS; document.head.appendChild(st); }
    const el = document.createElement('div');
    el.className = 'bk-root' + (mount ? ' bk-inline open' : '');
    if (!mount) { el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', 'Programare online'); }
    el.innerHTML = (mount ? '' : '<div class="bk-bg" data-bk-close></div>') +
      '<div class="bk"><span class="bk-grab"></span><div class="bk-head">' +
      '<button type="button" class="bk-ico" data-bk-back aria-label="Înapoi">' + ICON.back + '</button>' +
      '<div class="bk-prog" aria-hidden="true"><i></i><i></i><i></i><i></i></div>' +
      (mount ? '<span class="bk-ico" style="visibility:hidden"></span>' : '<button type="button" class="bk-ico" data-bk-close aria-label="Închide">' + ICON.x + '</button>') +
      '</div><div class="bk-body" aria-live="polite"></div></div>';
    if (mount) { mount.innerHTML = ''; mount.appendChild(el); } else document.body.appendChild(el);
    el.addEventListener('click', onClick);
    el.addEventListener('submit', onSubmit);
    if (!mount) {
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') close();
        if (e.key === 'Tab') { // keep the keyboard inside the sheet
          const f = [...el.querySelectorAll('button:not(:disabled), a[href], input:not([type=hidden]):not([tabindex="-1"])')].filter((x) => x.offsetParent);
          if (!f.length) return;
          if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
        }
      });
    }
    return el;
  }

  // ---------------------------------------------------------------- state & data
  function fresh(o) {
    const me = store.get('c360-book-me') || {};
    return { step: 'svc', city: o.city || PAGE_CITY || store.get('c360-book-city') || '', svc: o.service || '', label: o.label || '', services: null, days: null, date: '', time: '', err: '', name: me.name || '', phone: me.phone || '', busy: false, done: null, dir: '' };
  }
  async function load(fresh) {
    const my = ++seq;
    S.days = null;
    paint();
    try {
      const q = new URLSearchParams({ city: S.city || 'Timișoara', service: S.svc || 'consult' });
      if (fresh) q.set('t', Date.now()); // past the edge's few seconds: the hours as they are now
      if (S.svc === 'custom' && S.label) q.set('label', S.label);
      const r = await fetch('/api/booking?' + q.toString(), { headers: { Accept: 'application/json' } });
      const d = await r.json();
      if (my !== seq) return;
      if (!r.ok) throw new Error(d.error || 'failed');
      S.services = d.services || S.services; S.off = d.on === false; S.err = '';
      if (S.off) { paint(); return; }
      S.service = d.service; S.svc = d.service.id;
      S.days = d.days || [];
      const has = (x) => x && x.slots.length;
      if (!has(S.days.find((x) => x.date === S.date))) { const f = S.days.find(has); S.date = f ? f.date : ''; S.time = ''; }
      if (S.time && !(S.days.find((x) => x.date === S.date) || { slots: [] }).slots.includes(S.time)) S.time = '';
    } catch (e) {
      if (my !== seq) return;
      S.err = 'net'; S.days = [];
    }
    paint();
  }
  // What can be booked in the city: the procedure the client came from (the button she pressed) and the free
  // consultation, nothing else (the owner, 4.11). mode 'enter': after the city is known; 'switch': the city changed
  // on the hours' step
  async function loadServices(mode) {
    const my = ++seq;
    S.services = null;
    paint();
    try {
      const d = await cityData(S.city || 'Timișoara');
      if (my !== seq) return;
      S.services = d.services || []; S.off = d.on === false; S.err = '';
      S.pre = d.on === false ? null : { city: d.city, service: d.service, days: d.days };
    } catch (e) { if (my === seq) { S.err = 'net'; S.services = []; } }
    if (my !== seq) return;
    S.proc = null; S.note = '';
    const w = S.pick;
    if (w && w.svc && w.svc !== 'consult' && !S.off && S.err !== 'net') {
      const id = pick(w);
      if (id && id !== 'consult') { S.label = w.label || S.label; S.proc = byId(id); }
      else S.note = (w.label || 'Procedura aleasă') + (S.city === 'Arad' ? ' se face doar la Timișoara.' : ' nu se face la ' + S.city + '.') + ' Poți veni la consultația gratuită sau schimbi orașul.';
    }
    if (S.off || S.err === 'net') { paint(); return; }
    if (mode === 'switch') {
      if (S.svc !== 'consult' && !S.proc) { go('svc', 'back'); return; }
      choose(S.svc === 'consult' ? 'consult' : S.proc.id, true);
      return;
    }
    if (S.proc || S.note) { if (S.step !== 'svc') go('svc'); else paint(); return; } // the choice: the procedure or the free consultation
    choose('consult', S.step === 'when');
  }
  const consultSvc = () => (S.services || []).find((x) => x.id === 'consult') || { id: 'consult', title: 'Consultație gratuită', minutes: 30, price: 0 };
  function choose(id, stay) {
    S.svc = id; S.service = id === 'consult' ? consultSvc() : S.proc; S.time = '';
    // the consultation's hours came with the city's list: no second wait
    if (id === 'consult' && S.pre && S.pre.city === S.city && S.pre.days) { S.days = S.pre.days; S.service = S.pre.service || S.service; pickDay(); }
    else S.days = null;
    if (stay && S.step === 'when') paint(); else go('when');
    if (!S.days) load();
  }
  // the day shown: the one picked if it still has hours, else the first that has
  function pickDay() {
    const has = (x) => x && x.slots.length;
    if (!has(S.days.find((x) => x.date === S.date))) { const f = S.days.find(has); S.date = f ? f.date : ''; S.time = ''; }
  }
  // which service of the city a button meant: the same offer, an offer whose name it carries, else the treatment by its name
  function pick(w) {
    const list = S.services || [];
    if (!w.svc || w.svc === 'consult') return w.svc ? 'consult' : '';
    if (w.svc !== 'custom' && list.some((s) => s.id === w.svc)) return w.svc;
    const t = fold(w.label);
    const words = (s) => fold(s.title).split(/[^a-z0-9+]+/).filter((x) => x.length > 1);
    const hit = t && list.find((s) => s.id !== 'consult' && words(s).length && words(s).every((x) => t.includes(x)));
    if (hit) return hit.id;
    // EMS and laser hair removal are done only in Timișoara
    if (w.svc === 'custom' && w.label && !(S.city === 'Arad' && /\bems\b|epil|laser/.test(t))) return 'custom';
    return '';
  }
  const byId = (id) => (id === 'custom' ? { id: 'custom', title: S.label, minutes: 60, price: 0 } : (S.services || []).find((s) => s.id === id) || null);

  // ---------------------------------------------------------------- painting
  function prog(n) { root.querySelectorAll('.bk-prog i').forEach((i, k) => i.classList.toggle('on', k < n)); }
  function paint() {
    if (!root) return;
    body = root.querySelector('.bk-body');
    const back = root.querySelector('[data-bk-back]');
    back.hidden = S.step === 'city' || S.step === 'done';
    const html = S.step === 'city' ? cityHtml() : S.step === 'svc' ? svcHtml() : S.step === 'when' ? whenHtml() : S.step === 'you' ? youHtml() : doneHtml();
    prog({ city: 1, svc: 2, when: 3, you: 4, done: 4 }[S.step] || 1);
    const anim = S.dir;
    body.innerHTML = '<div class="bk-step' + (anim === 'back' ? ' back' : '') + '">' + html + '</div>';
    if (!anim) body.firstChild.style.animation = 'none';
    S.dir = '';
  }
  const segHtml = () => '<div class="bk-seg" role="tablist" aria-label="Clinica">' + ['Timișoara', 'Arad'].map((c) => '<button type="button" role="tab" aria-selected="' + (S.city === c) + '" class="' + (S.city === c ? 'on' : '') + '" data-city="' + c + '">' + c + '</button>').join('') + '</div>';
  function priceHtml(s) {
    if (s.id === 'consult') return '<span class="bk-pr"><span class="free">Gratuit</span></span>';
    if (!s.price) return '';
    return '<span class="bk-pr"><strong>' + lei(s.price) + '</strong>' + (s.old > s.price ? '<s>' + lei(s.old) + '</s>' : '') + '</span>';
  }
  // first: the clinic (when the page or the button didn't say it)
  function cityHtml() {
    return '<p class="bk-eyebrow">Programare online</p><h2 class="bk-h">În ce <em>oraș</em> vii?</h2><div class="bk-list">' +
      ['Timișoara', 'Arad'].map((c) => '<button type="button" class="bk-svc bk-city' + (S.city === c ? ' on' : '') + '" data-city="' + c + '"><span class="bk-pin">' + ICON.pin + '</span>' +
        '<span><b>' + c + '</b><small>' + esc(ADDR[c].split(',')[0]) + '</small></span><span class="bk-go">' + ICON.next + '</span></button>').join('') + '</div>';
  }
  function svcHtml() {
    if (!S.city) return cityHtml();
    let h = '<p class="bk-eyebrow">' + esc(S.city) + '</p><h2 class="bk-h">Ce <em>programezi?</em></h2>' +
      '<div class="bk-chip"><div><b>Centrul360 ' + esc(S.city) + '</b><small>' + esc(ADDR[S.city]) + '</small></div><button type="button" class="bk-link" data-go="city">Schimbă orașul</button></div>';
    if (S.off) return h + offHtml();
    if (S.err === 'net') return h + '<div class="bk-empty">Nu am putut încărca programările.<br><button type="button" class="bk-link" data-retry style="margin-top:12px">Încearcă din nou</button></div>' + waNote();
    if (!S.services) return h + '<div class="bk-list">' + '<div class="bk-skel" style="height:78px;border-radius:18px"></div>'.repeat(2) + '</div>';
    if (S.note) h += '<div class="bk-alert">' + esc(S.note) + '</div>';
    const c = consultSvc(), p = S.proc;
    return h + '<div class="bk-list">' +
      (p ? '<button type="button" class="bk-svc bk-opt' + (S.svc === p.id ? ' on' : '') + '" data-svc="' + esc(p.id) + '"><span><i class="bk-tag">Procedura aleasă</i><b>' + esc(p.title) + '</b><small>' + mins(p.minutes) + (p.price ? '' : ' · prețul ți-l spunem la clinică') + '</small></span>' + priceHtml(p) + '</button>' : '') +
      '<button type="button" class="bk-svc bk-opt gift' + (S.svc === 'consult' ? ' on' : '') + '" data-svc="consult"><span><i class="bk-tag">Nu ești sigură?</i><b>' + esc(c.title) + '</b><small>Evaluăm zona și îți spunem sincer ce ți se potrivește. ' + mins(c.minutes) + ', fără obligații.</small></span>' + priceHtml(c) + '</button>' +
      '</div>';
  }
  function chipHtml() {
    const s = S.service || {};
    return '<div class="bk-chip"><div><b>' + esc(s.title || '') + '</b><small>Centrul360 ' + esc(S.city) + ' · ' + mins(s.minutes || 60) + (s.id === 'consult' ? ' · gratuit' : s.price ? ' · ' + lei(s.price) : '') + '</small></div>' +
      (S.proc || S.note ? '<button type="button" class="bk-link" data-go="svc">Schimbă</button>' : '') + '</div>';
  }
  const addD = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 864e5).toISOString().slice(0, 10);
  const WDH = ['Lu', 'Ma', 'Mi', 'Jo', 'Vi', 'Sâ', 'Du'];
  // the bookable days as a small month: weeks from Monday, the days with free hours marked
  function calHtml() {
    const by = new Map(S.days.map((d) => [d.date, d]));
    const first = S.days[0].date, last = S.days[S.days.length - 1].date;
    const mon = (d) => addD(d, -((dt(d).getUTCDay() + 6) % 7));
    const cells = [];
    for (let d = mon(first); d <= addD(mon(last), 6); d = addD(d, 1)) cells.push(d);
    const free = S.days.filter((d) => d.slots.length);
    const m1 = dt(free[0].date).getUTCMonth(), m2 = dt(free[free.length - 1].date).getUTCMonth();
    const title = MO[m1].replace(/^./, (c) => c.toUpperCase()) + (m2 !== m1 ? ' - ' + MO[m2] : '') + ' ' + dt(free[free.length - 1].date).getUTCFullYear();
    return '<div class="bk-cal"><div class="bk-cal-h"><b>' + title + '</b><span>' + free.length + ' zile cu locuri</span></div>' +
      '<div class="bk-cal-wd">' + WDH.map((w) => '<span>' + w + '</span>').join('') + '</div>' +
      '<div class="bk-cal-g" role="listbox" aria-label="Ziua">' + cells.map((d) => {
        const x = by.get(d), n = dt(d).getUTCDate();
        if (!x || !x.slots.length) return '<span class="bk-cd' + (d === first ? ' today' : '') + '" aria-hidden="true">' + n + '</span>';
        return '<button type="button" class="bk-cd has' + (d === S.date ? ' on' : '') + (d === first ? ' today' : '') + '" data-date="' + d + '" aria-label="' + niceDay(d) + '" aria-selected="' + (d === S.date) + '">' + n + '</button>';
      }).join('') + '</div></div>';
  }
  function whenHtml() {
    let h = '<p class="bk-eyebrow">' + esc(S.city) + '</p><h2 class="bk-h">Alege <em>ziua și ora</em></h2>';
    if (S.off) return h + offHtml();
    h += S.service ? chipHtml() : '<div class="bk-skel" style="height:60px;margin-bottom:14px;border-radius:16px"></div>';
    if (S.err === 'net') return h + '<div class="bk-empty">Nu am putut încărca orele libere.<br><button type="button" class="bk-link" data-retry style="margin-top:12px">Încearcă din nou</button></div>' + waNote();
    if (!S.days) return h + '<div class="bk-cal"><div class="bk-cal-g" style="margin-top:28px">' + '<span class="bk-skel cd"></span>'.repeat(21) + '</div></div>';
    if (!S.days.some((d) => d.slots.length)) return h + '<div class="bk-empty">Nu mai sunt ore libere online în următoarele săptămâni.<br>Scrie-ne și îți găsim noi un loc.</div>' + waNote(true);
    h += calHtml();
    const day = S.days.find((d) => d.date === S.date);
    if (!day) return h;
    h += '<p class="bk-part bk-daylbl">' + esc(niceDay(day.date).replace(/^./, (c) => c.toUpperCase())) + '</p>';
    const parts = [['Dimineața', (t) => t < '12:00'], ['După-amiaza', (t) => t >= '12:00' && t < '17:00'], ['Seara', (t) => t >= '17:00']];
    parts.forEach(([name, ok]) => {
      const ts = day.slots.filter(ok);
      if (!ts.length) return;
      h += '<p class="bk-part">' + name + '</p><div class="bk-times">' + ts.map((t) => '<button type="button" class="bk-time' + (t === S.time ? ' on' : '') + '" data-time="' + t + '">' + t + '</button>').join('') + '</div>';
    });
    return h;
  }
  function youHtml() {
    const s = S.service || {};
    return '<p class="bk-eyebrow">Ultimul pas</p><h2 class="bk-h">Unde îți trimitem <em>confirmarea?</em></h2>' +
      '<div class="bk-sum"><div class="when">' + esc(niceDay(S.date).replace(/^./, (c) => c.toUpperCase())) + ' · <span>' + esc(S.time) + '</span></div>' +
      '<div class="what">' + esc(s.title || '') + ' · ' + esc(ADDR[S.city]) + '</div></div>' +
      (S.err && S.err !== 'net' ? '<div class="bk-alert">' + S.err + '</div>' : '') +
      '<form novalidate data-bk-form>' +
      '<input type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px;width:1px;height:1px;opacity:0">' +
      '<div class="bk-f"><label for="bkN">Nume și prenume</label><input id="bkN" name="name" autocomplete="name" placeholder="ex: Maria Popescu" value="' + esc(S.name) + '"><span class="msg">Scrie numele tău.</span></div>' +
      '<div class="bk-f"><label for="bkT">Telefon (WhatsApp)</label><input id="bkT" name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="07xx xxx xxx" value="' + esc(S.phone) + '"><span class="msg">Scrie un număr de telefon valid.</span></div>' +
      '<label class="bk-ok"><input type="checkbox" name="ok"' + (S.ok ? ' checked' : '') + '><span>Sunt de acord să primesc pe WhatsApp sau telefonic confirmarea și reamintirile programării de la Centrul360.</span></label>' +
      '<button type="submit" class="bk-cta"' + (S.busy ? ' disabled' : '') + '>' + (S.busy ? '<span class="spin"></span>Se programează…' : 'Confirmă programarea') + '</button>' +
      '<p class="bk-note">Confirmarea vine pe WhatsApp în câteva secunde. Dacă nu mai poți ajunge, ne anunți din același mesaj.</p></form>';
  }
  function doneHtml() {
    const a = S.done || {};
    return '<div class="bk-done"><div class="bk-check">' + ICON.check + '</div><p class="bk-eyebrow" style="justify-content:center">Programare confirmată</p>' +
      '<h2 class="bk-h">Te așteptăm <em>cu drag.</em></h2><p>Îți trimitem acum confirmarea pe WhatsApp, iar cu o zi înainte primești o reamintire.</p>' +
      '<div class="bk-card">' +
      '<div class="bk-row">' + ICON.cal + '<div><b>' + esc(niceDay(a.date).replace(/^./, (c) => c.toUpperCase())) + ', ora ' + esc(a.time) + '</b><small>' + mins(minsBetween(a.time, a.endTime)) + '</small></div></div>' +
      '<div class="bk-row">' + ICON.spark + '<div><b>' + esc(a.treatment) + '</b><small>' + (S.service && S.service.id === 'consult' ? 'Gratuit, fără obligații' : S.service && S.service.price ? lei(S.service.price) + ', plătești la clinică' : 'Prețul ți-l spunem la clinică') + '</small></div></div>' +
      '<div class="bk-row">' + ICON.pin + '<div><b>Centrul360 ' + esc(a.location) + '</b><small>' + esc(ADDR[a.location]) + '</small></div></div></div>' +
      '<div class="bk-two"><button type="button" class="bk-ghost" data-ics>' + ICON.cal + 'În calendar</button><a class="bk-ghost" href="' + MAPS[a.location] + '" target="_blank" rel="noopener">' + ICON.pin + 'Vezi pe hartă</a></div>' +
      (inline ? '' : '<button type="button" class="bk-cta" data-bk-close style="margin-top:10px">Gata</button>') + '</div>';
  }
  function offHtml() { return '<div class="bk-empty">Programările online sunt închise momentan.<br>Scrie-ne și îți găsim noi o oră.</div>' + waNote(true); }
  function waLink() { return 'https://wa.me/' + (WA[S.city] || WA['Timișoara']) + '?text=' + encodeURIComponent('Bună ziua! Aș dori o programare' + (S.service && S.service.id !== 'consult' ? ' pentru ' + S.service.title : '') + '.'); }
  function waNote(big) {
    return big ? '<a class="bk-ghost" style="margin-top:12px" href="' + waLink() + '" target="_blank" rel="noopener">' + ICON.wa + 'Scrie-ne pe WhatsApp</a>'
      : '<p class="bk-note">Sau <a href="' + waLink() + '" target="_blank" rel="noopener">scrie-ne pe WhatsApp</a>.</p>';
  }
  const minsBetween = (a, b) => { const m = (t) => { const x = /^(\d+):(\d+)/.exec(t || ''); return x ? +x[1] * 60 + +x[2] : 0; }; return Math.max(15, m(b) - m(a)) || 60; };

  // ---------------------------------------------------------------- actions
  function go(step, dir) { S.step = step; S.dir = dir || 'fwd'; S.err = S.err === 'net' ? S.err : ''; paint(); body.scrollTop = 0; if (root.querySelector('.bk-body')) root.querySelector('.bk-body').scrollTop = 0; }
  function onClick(e) {
    const t = e.target.closest('button, a');
    if (!t || !root.contains(t)) { if (e.target.closest('[data-bk-close]')) close(); return; }
    if (t.hasAttribute('data-bk-close')) { close(); return; }
    if (t.hasAttribute('data-bk-back')) {
      if (S.step === 'you') go('when', 'back');
      else if (S.step === 'when') go(S.proc || S.note ? 'svc' : 'city', 'back');
      else if (S.step === 'svc') go('city', 'back');
      return;
    }
    if (t.dataset.city && S.step === 'city') {
      S.city = t.dataset.city; store.set('c360-book-city', S.city);
      S.date = ''; S.time = ''; S.svc = '';
      go(S.pick && S.pick.svc && S.pick.svc !== 'consult' ? 'svc' : 'when');
      loadServices('enter');
      return;
    }
    if (t.dataset.city) { // the clinic switched on the hours' step
      if (S.city === t.dataset.city) return;
      S.city = t.dataset.city; store.set('c360-book-city', S.city);
      S.date = ''; S.time = ''; S.days = null;
      loadServices('switch');
      return;
    }
    if (t.dataset.svc) { choose(t.dataset.svc); return; }
    if (t.dataset.go === 'city') { go('city', 'back'); return; }
    if (t.dataset.go === 'svc') { go('svc', 'back'); return; }
    if (t.hasAttribute('data-retry')) { if (S.service) load(); else loadServices('enter'); return; }
    if (t.dataset.date) { S.date = t.dataset.date; S.time = ''; paint(); return; }
    if (t.dataset.time) { S.time = t.dataset.time; paint(); setTimeout(() => go('you'), 160); return; }
    if (t.hasAttribute('data-ics')) { ics(); return; }
  }
  function onSubmit(e) {
    e.preventDefault();
    const f = e.target;
    if (!f.matches('[data-bk-form]') || S.busy) return;
    if (f.website.value) return;
    const fl = (n) => f.querySelector('[name="' + n + '"]');
    S.name = fl('name').value.trim(); S.phone = fl('phone').value.trim(); S.ok = fl('ok').checked;
    let ok = true;
    const flag = (el, bad) => { el.closest('.bk-f, .bk-ok').classList.toggle('err', bad); if (bad) ok = false; };
    flag(fl('name'), S.name.length < 2);
    flag(fl('phone'), S.phone.replace(/\D/g, '').length < 9);
    flag(fl('ok'), !S.ok);
    if (!ok) { const bad = f.querySelector('.err input'); if (bad) bad.focus(); return; }
    S.busy = true; S.err = ''; paint();
    fetch('/api/booking', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      city: S.city, service: S.svc, label: S.svc === 'custom' ? S.label : '', date: S.date, time: S.time, name: S.name, phone: S.phone, consent: true, page: PAGE
    }) }).then((r) => r.json().then((d) => ({ r, d })), () => ({ r: { ok: false }, d: { error: 'net' } })).then(({ r, d }) => {
      S.busy = false;
      if (r.ok && d.ok) {
        store.set('c360-book-me', { name: S.name, phone: S.phone });
        Object.keys(early).forEach((k) => delete early[k]);
        S.done = d.appointment || { date: S.date, time: S.time, location: S.city, treatment: (S.service || {}).title };
        track();
        go('done');
        return;
      }
      const e2 = d.error;
      if (e2 === 'taken') { Object.keys(early).forEach((k) => delete early[k]); S.err = ''; S.time = ''; go('when', 'back'); load(true); setTimeout(() => { const b = root.querySelector('.bk-body .bk-step'); if (b) b.insertAdjacentHTML('afterbegin', '<div class="bk-alert">Ora aleasă tocmai a fost ocupată. Alege, te rog, altă oră.</div>'); }, 400); return; }
      S.err = e2 === 'has_booking' && d.at ? 'Ai deja o programare ' + esc(d.at.nice) + ', la ora ' + esc(d.at.time) + '. Pentru a o muta, <a href="' + waLink() + '" target="_blank" rel="noopener">scrie-ne pe WhatsApp</a>.'
        : e2 === 'bad_phone' ? 'Numărul de telefon nu pare corect. Verifică-l, te rog.'
        : e2 === 'too_many' || e2 === 'too_many_bookings' ? 'Ai făcut deja mai multe programări. Pentru încă una, <a href="' + waLink() + '" target="_blank" rel="noopener">scrie-ne pe WhatsApp</a>.'
        : 'Nu am putut face programarea. Verifică internetul și încearcă din nou, sau <a href="' + waLink() + '" target="_blank" rel="noopener">scrie-ne pe WhatsApp</a>.';
      paint();
    });
  }
  // the ads learn from it (Meta pixel, Google)
  function track() {
    const s = S.service || {};
    try { if (window.fbq) window.fbq('track', 'Schedule', { content_name: s.title, value: s.price || 0, currency: 'RON' }); } catch (e) { /* no pixel */ }
    try { if (window.gtag) window.gtag('event', 'booking', { item_name: s.title, value: s.price || 0, currency: 'RON', location: S.city }); } catch (e) { /* no gtag */ }
  }
  function ics() {
    const a = S.done; if (!a) return;
    const p = (d, t) => d.replace(/-/g, '') + 'T' + t.replace(':', '') + '00';
    const txt = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Centrul360//Programare//RO', 'BEGIN:VEVENT', 'UID:' + Date.now() + '@centrul360.com',
      'DTSTAMP:' + new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, ''),
      'DTSTART;TZID=Europe/Bucharest:' + p(a.date, a.time), 'DTEND;TZID=Europe/Bucharest:' + p(a.date, a.endTime || a.time),
      'SUMMARY:Centrul360 · ' + a.treatment, 'LOCATION:' + ADDR[a.location].replace(/,/g, '\\,'),
      'BEGIN:VALARM', 'TRIGGER:-PT2H', 'ACTION:DISPLAY', 'DESCRIPTION:Programare Centrul360', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    const url = URL.createObjectURL(new Blob([txt], { type: 'text/calendar;charset=utf-8' }));
    const l = document.createElement('a'); l.href = url; l.download = 'programare-centrul360.ics'; document.body.appendChild(l); l.click(); l.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  // ---------------------------------------------------------------- open / close
  function start(o) {
    S = fresh(o || {});
    S.pick = S.svc ? { svc: S.svc, label: S.label } : null; // what the button named
    S.svc = '';
    ['Timișoara', 'Arad'].forEach((c) => cityData(c).catch(() => {}));
    if (!S.city) { S.step = 'city'; paint(); return; }
    S.step = S.pick && S.pick.svc !== 'consult' ? 'svc' : 'when';
    paint();
    loadServices('enter');
  }
  function open(o) {
    lastFocus = document.activeElement;
    if (!root || inline) { root = build(); inline = false; }
    start(o);
    // eslint-disable-next-line no-unused-expressions
    root.offsetWidth;
    root.classList.add('open');
    document.documentElement.style.overflow = 'hidden';
    if (!pushed) { try { history.pushState({ bk: 1 }, '', location.href.replace(/#programare$/, '')); pushed = true; } catch (e) { /* no history */ } }
    setTimeout(() => { const f = root.querySelector('.bk-svc, .bk-cd.on, [data-bk-close]'); if (f) f.focus({ preventScroll: true }); }, 60);
  }
  function close() {
    if (!root || inline) return;
    root.classList.remove('open'); document.documentElement.style.overflow = '';
    if (pushed) { pushed = false; try { history.back(); } catch (e) { /* nothing */ } }
    if (lastFocus && lastFocus.focus) try { lastFocus.focus({ preventScroll: true }); } catch (e) { /* gone */ }
  }
  window.addEventListener('popstate', () => { if (pushed) { pushed = false; if (root && !inline) { root.classList.remove('open'); document.documentElement.style.overflow = ''; } } });
  function mount(el, o) { inline = true; root = build(el); start(o || {}); }

  // ---------------------------------------------------------------- the buttons of the site
  // what a button books: from data-book-* first, else from the WhatsApp text it carried (the offer, the city)
  function intentOf(a) {
    if (a.hasAttribute('data-book')) return { service: a.dataset.bookService || '', city: a.dataset.bookCity || '', label: a.dataset.bookLabel || '' };
    if (a.hasAttribute('data-sim-consult')) return { service: 'consult', city: '', label: '' }; // the home page's results: the free consultation
    const href = a.getAttribute('href') || '';
    if (!/wa\.me\//.test(href)) return null;
    const label = (a.textContent || '').replace(/\s+/g, ' ').trim();
    if (a.id !== 'fab' && !/programeaz|rezerv|vreau|consulta/i.test(label)) return null; // "Scrie-ne", "Întreabă", the phone numbers: WhatsApp
    if (a.id === 'fab' || (/programeaz[ăa]-te/i.test(label) && a.id !== 'offpop-wa')) return { service: '', city: /40750277394/.test(href) || /arad/i.test(label) ? 'Arad' : /timi/i.test(label) ? 'Timișoara' : '', label: '' }; // the general ones: she picks
    const p = a.closest('p'); if (p && /preferi/i.test(p.textContent || '')) return null;
    let msg = '';
    try { msg = new URL(a.href).searchParams.get('text') || ''; } catch (e) { /* none */ }
    const city = /40750277394/.test(href) || /\barad\b/i.test(msg) ? 'Arad' : '';
    return guessSvc(msg, a, city);
  }
  function guessSvc(msg, a, city) {
    const m = fold(msg);
    if (!m || /consultatie|detalii|intrebare/.test(m)) return { service: 'consult', city, label: '' };
    const card = a && a.closest('article, .ocard, .pkg, .pkgc, .card, [class*="card"]');
    const head = card && card.querySelector('h3, h4, .pkn, [class*="name"], [class*="title"]');
    let name = '';
    const x = /(?:rezerv[ăa]? oferta|pachetul|programul|as dori|aș dori)\s+(.+?)\.?$/i.exec(msg);
    if (x) name = x[1].replace(/\s+la\s+\d+\s*lei$/i, '').replace(/\s*\(\d+\s*lei\)$/i, '').replace(/\s*\((timisoara|arad)\)/i, '');
    const label = ((head ? head.textContent.replace(/\s+/g, ' ').trim() : '') || name).replace(/\s*·\s*(Timișoara|Arad)$/i, '');
    const t = fold(name + ' ' + label);
    const svc = /hifu/.test(t) && /gus/.test(t) && !/pachet|mini|360/.test(t) ? 'hifu-gusa-1sedinta'
      : /liposonix/.test(t) && !/pachet|o zona/.test(t) ? 'liposonix-2zone'
      : /restart/.test(t) ? 'facial-restart'
      : /full body/.test(t) && /epil|laser|pachet/.test(t + m) ? 'epilare-full-body'
      : /cavitatie\s*\+\s*ems/.test(t) ? 'cavitatie-ems'
      : /cavitatie\s*1\s*\+\s*1/.test(t) ? 'cavitatie-1plus1'
      : 'custom';
    const nice = /pachetul/i.test(msg) && label && !/^pachet/i.test(label) ? 'Pachetul ' + label : label;
    return { service: svc, city, label: nice.slice(0, 80) };
  }
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button > 0) return;
    const a = e.target.closest('a[href], button[data-book], button[data-sim-consult]');
    if (!a || (root && root.contains(a))) return;
    const o = intentOf(a);
    if (!o) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const pop = a.closest('.offpop, #offpop'); // the offer pop-up on Oferte closes first
    if (pop) { pop.classList.remove('open'); pop.setAttribute('aria-hidden', 'true'); document.body.style.overflow = ''; }
    if (o.service === 'custom' && !o.label) o.service = '';
    if (!o.city) o.city = PAGE_CITY;
    open(o);
  }, true);

  window.C360Book = { open, close, mount };
  const auto = () => {
    const m = document.querySelector('[data-book-mount]');
    if (m) { const q = new URLSearchParams(location.search); mount(m, { service: q.get('serviciu') || '', city: /arad/i.test(q.get('oras') || '') ? 'Arad' : /tim/i.test(q.get('oras') || '') ? 'Timișoara' : '', label: q.get('label') || '' }); return; }
    if (location.hash === '#programare') open({});
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', auto); else auto();
  window.addEventListener('hashchange', () => { if (location.hash === '#programare') open({}); });
})();
