// Centrul360 portal, „Carduri de Sărbători” (the owner, 21.11): admin, manager and reception (reception records payments).
//   on top     the wave of now (Valul 2 din 7: left, sold; the owner sets the waves, „Valuri”; only here, never on the site), the money of the cards paid, the credit used, the WhatsApp templates
//   Card rezervat, de încasat  the reservations to pay in the clinic, by clinic (reception: hers), VIP first, then the newest:
//              her phone to call, what to tell her (her name, the sum, the credit), „Trimite linkul de plată” on WhatsApp
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
  // of: the orders' filter (open, rezervat, lead, neplatita, appt, lot:N, anulate); os: their order (new, appt)
  // tab: 'req' („De confirmat”) or 'int' („Interesate”, api/_lib/card-interested.js); int: its list, loaded after the page
  const S = { d: null, q: '', f: 'all', box: null, busy: false, of: 'open', os: 'new', open: new Set(), tab: 'req', int: null };
  const STATE = { activ: ['Activ', 'is-good'], folosit: ['Folosit', 'is-done'], expirat: ['Expirat', 'is-warn'], anulat: ['Anulat', 'is-bad'], rezervat: ['Rezervat', 'is-info'], lead: ['Lead', 'is-info'], asteptare: ['În așteptarea plății', 'is-warn'] };
  const FILTERS = [['all', 'Toate'], ['activ', 'Active'], ['folosit', 'Folosite'], ['expirat', 'Expirate'], ['anulat', 'Anulate'], ['vip', 'VIP']];
  const lei = (n) => K.lei(n);
  // the VIP card („Cardul VIP Transformarea 360”, 9.900 → 30.000, 5 per clinic, the owner 22.11); 290 is out of sale, its
  // orders still shown and worked as they are
  const VIP = 9900;
  const isVip = (x) => Number(x && typeof x === 'object' ? x.tier : x) === VIP;
  const tierTxt = (t) => (isVip(t) ? 'VIP 9.900 lei' : t + ' lei');
  const TIER_SEG = [['490', '490 → 1.000'], ['990', '990 → 2.500'], ['9900', 'VIP 9.900']];
  const vipTag = '<span class="k-tag cd-vip">VIP</span>';
  // the VIP's full review and plan, booked from her appointments (api/_lib/card-sarbatori.js orderExtras)
  const reviewTag = (r) => (r ? '<span class="k-tag ' + (r.state === 'booked' ? 'is-good' : 'is-warn') + ' cd-rev">' + icon('calendar') + (r.state === 'booked' ? 'Revizie programată ' + r.date.slice(8, 10) + '.' + r.date.slice(5, 7) + (r.time ? ', ' + r.time : '') : 'Revizie: de programat') + '</span>' : '');
  const when = (iso) => { const t = Date.parse(iso); return Number.isFinite(t) ? new Date(t).toLocaleDateString('ro-RO', { timeZone: 'Europe/Bucharest', day: 'numeric', month: 'short' }) + ', ' + new Date(t).toLocaleTimeString('ro-RO', { timeZone: 'Europe/Bucharest', hour: '2-digit', minute: '2-digit' }) : ''; };
  const dayOf = (iso) => { const t = Date.parse(iso); return Number.isFinite(t) ? new Date(t).toLocaleDateString('ro-RO', { timeZone: 'Europe/Bucharest', day: 'numeric', month: 'short', year: 'numeric' }) : ''; };
  const api = (b) => K.api('/api/card-sarbatori', b);
  const tag = (st) => { const x = STATE[st] || [st, '']; return '<span class="k-tag ' + x[1] + '">' + esc(x[0]) + '</span>'; };
  const img = (code, dl) => '/api/card-sarbatori?img=' + encodeURIComponent(code) + (dl ? '&dl=1' : '') + '&v=' + encodeURIComponent((S.d && S.d.cards.find((c) => c.code === code) || {}).recipient || '');

  function mount(p) {
    S.box = p;
    p.classList.add('k-panel', 'cd');
    p.innerHTML = '<div class="k-head"><div><div class="k-eyebrow">Clinică</div><h2>Carduri de Sărbători</h2></div><div class="k-head-actions"><button type="button" class="k-btn is-outline admin-only hidden" data-cd-stock>' + icon('sliders') + 'Valuri</button><button type="button" class="k-btn is-outline" data-cd-iadd>' + icon('plus') + 'Adaugă interesată</button><button type="button" class="k-btn is-outline" data-cd-req>' + icon('plus') + 'Adaugă cerere</button><button type="button" class="k-btn is-primary" data-cd-add>' + icon('plus') + 'Adaugă card plătit</button></div></div>' +
      '<div data-cd-body><div class="k-skel" style="height:110px;border-radius:18px"></div><div class="k-skel" style="height:360px;margin-top:1rem;border-radius:18px"></div></div>';
    p.addEventListener('click', onClick);
    p.addEventListener('input', (e) => { if (e.target.matches('[data-cd-q]')) { S.q = e.target.value; paintList(); } });
    p.addEventListener('change', (e) => { if (e.target.matches('[data-cd-sort]')) { S.os = e.target.value; paintOrders(); } });
    // a menu closes on a tap elsewhere and on Escape
    document.addEventListener('click', (e) => { if (S.box && !e.target.closest('.cd-mw')) closeMenus(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && S.box) closeMenus(); });
  }
  async function load(quiet) {
    try { S.d = await api({ action: 'list', scan: !quiet }); const sb = S.box.querySelector('[data-cd-stock]'); if (sb) sb.classList.toggle('hidden', S.d.role !== 'admin'); paint(); loadInt(); }
    catch (err) { const b = S.box && S.box.querySelector('[data-cd-body]'); if (b && !S.d) b.innerHTML = '<section class="k-card">' + K.empty('alert', 'Nu am putut încărca cardurile', esc(K.errText(err))) + '</section>'; }
  }

  async function loadInt() {
    try { S.int = await api({ action: 'interested' }); paintOrders(); } catch (err) { if (!S.int) S.int = { people: [], potential: { total: 0 }, error: K.errText(err) }; paintOrders(); }
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
      '<div data-cd-money></div><div data-cd-checks></div><div data-cd-resv></div><div data-cd-orders></div>' +
      '<section class="k-card cd-list"><div class="cd-bar"><label class="k-search">' + icon('search') + '<input data-cd-q type="search" placeholder="Caută după cod sau nume…" autocomplete="off" value="' + esc(S.q) + '"></label>' +
      '<div class="k-chips" data-cd-chips></div></div><div data-cd-rows></div></section>' +
      '<p class="k-muted cd-foot">Folosirea creditului nu e o încasare nouă: banii au intrat o dată, la plata cardului. Cardul se folosește la prețul de listă, nu peste ofertele reduse. Valabil până pe 30.06.2027.</p>';
    paintOrders(); paintList();
  }
  // the trail of an order, one short line each (api/_lib/card-sarbatori.js mark): what happened, so nobody guesses
  const REASON = { retry: 'încearcă din nou', declined: 'cardul a fost refuzat', nocard: 'n-avea cardul la ea', confusing: 'n-a înțeles pagina de plată', clinic: 'preferă să plătească în clinică', no: 's-a răzgândit' };
  const BTN = { pay: '„Finalizez plata” (i-a plecat linkul)', clinic: '„Plătesc în clinică”', no: '„Nu mai vreau”', text: 'a scris (vezi Mesaje)' };
  const NAMEFOR = { me: 'e pentru ea', gift: 'e cadou' };
  // where the name on the card came from
  const NAMEFROM = { formular: 'din formularul reclamei', site: 'scris pe site', fisa: 'din fișa clientei', whatsapp: 'întrebat pe WhatsApp', receptie: 'pus de recepție', plata: 'scris la plată' };
  function trailLine(e, o) {
    const n = e.note || '', failed = /^netrimis/.test(n), why = n.replace(/^netrimis:?\s*/, '');
    switch (e.ev) {
      case 'created': return /^whatsapp/.test(n) || (o && o.via === 'whatsapp') ? 'a apăsat «Rezerv în clinică» în mesaj' : /^portal/.test(n) || (o && o.via === 'portal') ? 'adăugată în portal' + (n.length > 7 ? ' de ' + n.slice(8) : '') : n === 'meta-form' ? 'a lăsat datele în formularul din reclamă' : o && o.pay === 'clinica' && !o.converted ? 'a rezervat pe site, plătește în clinică' : '';
      case 'lead_msg': return failed ? 'WhatsApp-ul cu cardul n-a plecat' + (why ? ' (' + why + ')' : '') : 'WhatsApp trimis: cardul ei, online sau în clinică';
      case 'choice': return 'a ales pe WhatsApp: ' + (n === 'online' ? 'plătește online' : 'plătește în clinică');
      case 'lead_call': return 'de sunat: ' + n;
      case 'to_paylink': return n === 'whatsapp' ? 'a primit linkul de plată pe WhatsApp' : n === 'receptie' ? 'recepția i-a trimis linkul de plată pe WhatsApp' : 'a intrat pe pagina de plată';
      case 'to_checkout': return 'a deschis plata pe site';
      case 'contact': return n === 'la rezervare' ? 'și-a lăsat telefonul la rezervare' : n === 'telefon schimbat' ? 'alt telefon, scris la plată' : 'și-a scris numele și telefonul la plată';
      case 'test_paid': return 'plată de test (sandbox): nu e card';
      case 'amount': return 'suma: ' + n;
      case 'returned': return 's-a întors pe site fără plată';
      case 'reason': return 's-a întors: ' + (REASON[n] || n);
      case 'expired': return 'au trecut 2 ore: cardul nu mai e ținut';
      case 'wa1': return failed ? 'WhatsApp neplecat' + (why ? ' (' + why + ')' : '') : 'WhatsApp trimis: plata nu s-a finalizat';
      case 'wa2': return failed ? 'al doilea WhatsApp neplecat' + (why ? ' (' + why + ')' : '') : 'al doilea WhatsApp trimis (mai sunt carduri)';
      case 'replied': return n === 'text' ? 'a scris pe WhatsApp (vezi Mesaje)' : 'a răspuns pe WhatsApp: ' + (BTN[n] || n);
      case 'converted': return n === 'lead' ? 'rezervată, plătește în clinică' : 'trecută pe plata în clinică' + (n === 'whatsapp' ? ', din WhatsApp' : n === 'portal' ? ', din portal' : ', pe site');
      case 'check': return 'o plată cu aceeași sumă: de verificat în myPOS';
      case 'paid': return n === 'auto' ? 'plătită (găsită în myPOS)' : 'plată confirmată în portal';
      case 'ask_name': return failed ? 'întrebarea numelui n-a plecat: cardul a plecat fără nume' : 'întrebată pe WhatsApp pe ce nume să fie cardul';
      case 'name_for': return 'a răspuns: ' + (NAMEFOR[n] || n) + ', așteptăm numele';
      case 'named': return n === 'none' ? 'n-a răspuns în 6 ore: cardul pleacă fără nume' : n === 'fisa' ? 'numele luat din fișa clientei' : 'a scris numele de pe card';
      case 'renamed': return 'numele de pe card schimbat' + (n ? ' ' + n : '');
      case 'card_sent': return /^ok/.test(n) ? 'cardul i-a plecat pe WhatsApp' + (/fără nume/.test(n) ? ', fără nume' : '') : 'cardul n-a plecat pe WhatsApp: de trimis manual';
      case 'cancelled': return n === 'ea' ? 'a renunțat' : n && n !== 'team' ? n : 'anulată';
      case 'edited': return 'modificată' + (n ? ' ' + n : '');
      case 'replaced': return 'a înlocuit comanda ei online neplătită (același card)';
      case 'moved': return 'mutată la Interesate' + (n ? ' ' + n : '');
      case 'rez_msg': return failed ? 'WhatsApp „ți-am rezervat cardul” neplecat' + (why ? ' (' + why + ')' : '') : 'WhatsApp trimis: ți-am rezervat cardul';
      default: return '';
    }
  }
  const hm = (iso, ref) => { const t = Date.parse(iso); if (!Number.isFinite(t)) return ''; const d = (x) => new Date(x).toLocaleDateString('ro-RO', { timeZone: 'Europe/Bucharest' });
    return (ref && d(t) === d(Date.parse(ref)) ? '' : new Date(t).toLocaleDateString('ro-RO', { timeZone: 'Europe/Bucharest', day: 'numeric', month: 'short' }) + ', ') + new Date(t).toLocaleTimeString('ro-RO', { timeZone: 'Europe/Bucharest', hour: '2-digit', minute: '2-digit' }); };
  const trailHtml = (o) => { const rows = (o.trail || []).map((e) => [e, trailLine(e, o)]).filter((x) => x[1]); return rows.length ? '<ol class="cd-trail">' + rows.map(([e, t]) => '<li><time>' + esc(hm(e.at, o.created)) + '</time>' + esc(t) + '</li>').join('') + '</ol>' : ''; };
  // „De verificat”: a payment of one sum that could be two orders' (the desk looks at who paid in myPOS, then taps hers)
  function paintChecks() {
    const box = S.box.querySelector('[data-cd-checks]'), list = S.d.checks || [];
    if (!box) return;
    if (!list.length) { box.innerHTML = ''; return; }
    box.innerHTML = '<section class="k-card cd-orders cd-checks"><div class="k-card-head"><h3>De verificat în myPOS</h3><span class="k-muted">' + list.length + '</span></div>' +
      list.map((c) => '<div class="cd-check"><p class="cd-check-h">' + icon('alert') + '<span>' + (c.why === 'suma' ? 'Plată pe site de <b>' + lei(c.amount) + '</b>, ' + esc(when(c.at)) + ', altă sumă decât comanda ei: vezi în myPOS și confirm-o doar dacă e corectă.' : 'Plată online de <b>' + lei(c.amount) + '</b>, ' + esc(when(c.at)) + '. Se potrivește cu ' + c.cands.length + ' comenzi: uită-te în myPOS cine a plătit și alege-o pe a ei.') + '</span></p>' +
        '<div class="k-list">' + c.cands.map((o) => '<div class="k-row cd-order"><div class="k-row-main"><div class="k-row-title">' + esc(o.name || 'Fără nume') + ' · telefon •••' + esc(o.last3) + '</div>' +
          '<div class="k-row-sub">comandată ' + esc(when(o.created)) + ' · ' + esc(o.city) + ' · ' + tierTxt(o.tier) + '</div></div>' +
          '<div class="k-row-end"><button type="button" class="k-btn is-primary is-sm" data-cd-pick="' + esc(c.id) + '" data-id="' + esc(o.id) + '">' + icon('check') + 'E a ei</button></div></div>').join('') + '</div></div>').join('') + '</section>';
  }
  // „Bani potențiali” (the owner, 22.11): what the open requests are worth, by clinic, and what is already cashed
  const isOpen = (o) => !o.byHer && !o.cancelled;
  // the VIP cards left in a clinic („VIP 4 din 5”)
  const vipLeft = (c) => { const v = S.d.vip && S.d.vip[c]; return v ? ' · VIP ' + (v.left > 0 ? v.left + ' din ' + v.max : 'epuizat') : ''; };
  function paintMoney() {
    const box = S.box.querySelector('[data-cd-money]');
    if (!box) return;
    const open = (S.d.orders || []).filter(isOpen), t = S.d.totals || {}, by = t.byCity || {};
    const sum = (l) => l.reduce((n, o) => n + (Number(o.amount) || 0), 0);
    const city = (c) => open.filter((o) => o.city === c);
    const tile = (cls, label, value, sub) => '<div class="k-stat ' + cls + '"><div class="k-stat-top"><span class="k-stat-l">' + label + '</span></div><div class="k-stat-value">' + value + '</div><div class="k-stat-sub">' + sub + '</div></div>';
    const n = (l) => l.length + (l.length === 1 ? ' cerere' : ' cereri');
    box.innerHTML = '<div class="k-grid c4 cd-money">' +
      tile('is-accent', 'Bani potențiali', lei(sum(open)), n(open) + ' deschise') +
      tile('', 'Timișoara', lei(sum(city('Timișoara'))), n(city('Timișoara')) + ' · încasat ' + lei(by['Timișoara'] || 0) + vipLeft('Timișoara')) +
      tile('', 'Arad', lei(sum(city('Arad'))), n(city('Arad')) + ' · încasat ' + lei(by.Arad || 0) + vipLeft('Arad')) +
      tile('is-good', 'Încasat deja', lei(t.money || 0), (t.cards || 0) + ' carduri plătite') + '</div>';
  }
  const DAYS = ['duminică', 'luni', 'marți', 'miercuri', 'joi', 'vineri', 'sâmbătă'];
  const apptTxt = (a) => { const d = new Date(a.date + 'T12:00:00Z'); return 'Programare ' + DAYS[d.getUTCDay()] + ' ' + a.date.slice(8, 10) + '.' + a.date.slice(5, 7) + (a.time ? ', ' + a.time : '') + (a.city ? ' · ' + a.city : ''); };
  const lotTxt = (l) => 'Lot ' + l.n + ' · mesaj ' + l.tier;
  const kind = (o) => (o.cancelled ? 'anulate' : o.status === 'lead' ? 'lead' : o.status === 'asteptare' ? 'neplatita' : o.status === 'rezervat' ? 'rezervat' : '');
  function orderFilters(all) {
    const open = all.filter(isOpen);
    const lots = [...new Set(open.filter((o) => o.lot).map((o) => o.lot.n))].sort((a, b) => a - b);
    const f = [['open', 'Deschise', open.length], ['rezervat', 'Rezervate', open.filter((o) => kind(o) === 'rezervat').length], ['lead', 'Lead', open.filter((o) => kind(o) === 'lead').length],
      ['neplatita', 'Online neplătite', open.filter((o) => kind(o) === 'neplatita').length], ['appt', 'Au programare', open.filter((o) => o.appt).length], ['vip', 'VIP', open.filter(isVip).length]]
      .concat(lots.map((n) => ['lot:' + n, 'Lot ' + n, open.filter((o) => o.lot && o.lot.n === n).length]))
      .concat([['anulate', 'Anulate', all.filter((o) => o.cancelled).length]]);
    return f.filter((x) => x[2] || x[0] === 'open' || x[0] === S.of);
  }
  function pickOrders(all) {
    const f = S.of;
    let l = all.filter((o) => (f === 'anulate' ? o.cancelled : f === 'open' ? !o.cancelled : isOpen(o) && (f === 'appt' ? !!o.appt : f === 'vip' ? isVip(o) : /^lot:/.test(f) ? o.lot && 'lot:' + o.lot.n === f : kind(o) === f)));
    if (S.os === 'appt') l = l.slice().sort((a, b) => (a.appt ? a.appt.date + a.appt.time : '9') .localeCompare(b.appt ? b.appt.date + b.appt.time : '9'));
    return l;
  }
  function orderRow(o, now, admin) {
    const unpaid = o.status === 'asteptare' && o.pay === 'online';
    const over = unpaid && o.heldUntil && Date.parse(o.heldUntil) < now;
    const isLead = o.status === 'lead';
    const call = (isLead && (o.leadCall || Date.parse(o.created) + 2 * 3600e3 < now)) || (over && !o.byHer);
    const st = o.cancelled ? ['Anulată', 'is-bad'] : isLead ? ['Lead', 'is-info'] : o.byHer ? ['A renunțat', 'is-bad'] : unpaid ? ['Neplătită', 'is-warn'] : o.pay === 'online' ? ['Online', 'is-info'] : ['Rezervat', 'is-info'];
    const what = isLead ? 'Lead din reclamă · alege cum plătește' : o.cancelled ? 'Anulată' : o.byHer ? 'A renunțat la plata online' : unpaid ? 'A început plata online · neplătită' + (over ? '' : ' · ținut până la ' + hm(o.heldUntil, o.created)) :
      o.via === 'whatsapp' ? 'Din mesajul WhatsApp · plătește în clinică' : o.via === 'portal' ? 'Adăugată în portal · plătește în clinică' : o.converted ? 'Plătește în clinică · a început online' : 'Plătește în clinică';
    const chips = (isVip(o) ? vipTag : '') + '<span class="k-tag ' + st[1] + '">' + st[0] + '</span>' + (o.lot ? '<span class="k-tag cd-lot">' + esc(lotTxt(o.lot)) + '</span>' : '') +
      (o.appt ? '<span class="k-tag is-good cd-appt">' + icon('calendar') + esc(apptTxt(o.appt)) + '</span>' : '') + (call ? '<span class="k-tag is-warn">' + icon('phone') + 'Sun-o</span>' : '');
    const open = S.open.has(o.id), dead = o.byHer || o.cancelled;
    const menu = (dead ? '' : '<button type="button" data-cd-edit="' + esc(o.id) + '">' + icon('pen') + 'Editează</button><button type="button" data-cd-toint="' + esc(o.id) + '">' + icon('star') + 'Mută la Interesate</button><button type="button" data-cd-cancel="' + esc(o.id) + '">' + icon('ban') + 'Anulează</button>') +
      (admin ? '<button type="button" class="is-bad" data-cd-del="' + esc(o.id) + '">' + icon('trash') + 'Șterge</button>' : '');
    return '<div class="cd-o' + (dead ? ' is-off' : '') + (open ? ' open' : '') + '" data-o="' + esc(o.id) + '"><div class="cd-o-row">' +
      '<button type="button" class="cd-o-main" data-cd-x="' + esc(o.id) + '" aria-expanded="' + open + '"><span class="cd-o-t"><b>' + esc(o.name || 'Fără nume') + '</b><span class="cd-o-m">' + (o.qty > 1 ? o.qty + ' × ' : '') + tierTxt(o.tier) + (Number(o.amount) !== Number(o.tier) * (o.qty || 1) ? ' · plătește ' + lei(o.amount) : '') + ' · ' + esc(o.city) + '</span></span>' +
        '<span class="cd-o-c">' + chips + '</span></button>' +
      '<a class="cd-o-tel" href="' + K.tel(o.phone) + '" aria-label="Sună">' + icon('phone') + '<span>' + esc(o.phone) + '</span></a>' +
      '<div class="cd-o-act">' + (o.phone ? '<a class="k-btn is-outline is-sm cd-i-chat" href="#mesaje" data-chat="' + esc(o.phone) + '" data-chat-name="' + esc(o.name || '') + '" data-chat-city="' + esc(o.city || '') + '" aria-label="Mesaje">' + icon('chat') + '<span class="cd-lg">Mesaje</span></a>' : '') +
        (dead ? '' : '<button type="button" class="k-btn is-primary is-sm" data-cd-confirm="' + esc(o.id) + '" data-via="' + (o.pay === 'online' ? 'online' : 'clinica') + '">' + icon('check') +
        '<span class="cd-lg">' + (o.pay === 'online' ? 'Confirmă (e în myPOS)' : 'Confirmă plata') + '</span><span class="cd-sm">Confirmă</span></button>') +
        (menu ? '<span class="cd-mw"><button type="button" class="k-btn is-ghost is-sm cd-dots" data-cd-menu aria-haspopup="true" aria-expanded="false" aria-label="Mai mult">' + icon('more') + '</button><span class="cd-menu" role="menu">' + menu + '</span></span>' : '') + '</div></div>' +
      '<div class="cd-o-more"><div><p class="cd-o-sub">' + esc(what) + ' · ' + esc(when(o.created)) + (o.names.some(Boolean) ? ' · pe numele: ' + esc(o.names.map((n) => n || 'ea').join(', ')) : '') +
        (NAMEFROM[o.nameFrom] && o.via !== 'portal' ? ' · numele ' + NAMEFROM[o.nameFrom] : '') + (o.note ? ' · ' + esc(o.note) : '') + '</p>' + trailHtml(o) + '</div></div></div>';
  }
  // the two lists side by side, as tabs: „De confirmat” (the requests) and „Interesate” (the owner, 22.11)
  const ints = () => ((S.int && S.int.people) || []).filter((x) => !x.hidden);
  function tabs(nReq) {
    const t = (k, l, n) => '<button type="button" role="tab" class="cd-tab' + (S.tab === k ? ' is-on' : '') + '" aria-selected="' + (S.tab === k) + '" data-cd-tab="' + k + '">' + l + '<span>' + n + '</span></button>';
    return '<div class="cd-tabs" role="tablist">' + t('req', 'De confirmat', nReq) + t('int', 'Interesate', S.int ? ints().length : '…') + '</div>';
  }
  // ------------------------------------------------------------------ „Card rezervat, de încasat” (the owner, 24.11)
  // reception calls each reservation to pay in the clinic and pushes the online payment: her phone, what to say, the link
  const noName = (n) => !n || /fără nume/i.test(n);
  const first = (n) => { const w = noName(n) ? '' : String(n || '').trim().split(/\s+/)[0] || ''; return /^[\p{L}]+(?:-[\p{L}]+)?$/u.test(w) && w.replace(/-/g, '').length >= 2 ? w.toLowerCase().replace(/(^|-)(\p{L})/gu, (m, a, b) => a + b.toUpperCase()) : ''; };
  const cardTxt = (o) => (o.qty > 1 ? o.qty + ' × ' : '') + (isVip(o) ? 'VIP ' : '') + lei(o.amount) + ' → ' + lei(o.credit);
  function script(o) {
    const g = first(o.name), hi = 'Bună' + (g ? ', ' + g : '') + ', sunt de la Centrul360. ';
    if (isVip(o)) return hi + 'Ți-am rezervat Cardul VIP Transformarea 360 de ' + lei(o.amount) + ', primești ' + lei(o.credit) + ' în tratamente. Ți-l ținem rezervat până vii. Dacă îl plătești acum online, ai -10%, plătești ' + lei(Math.round(Number(o.tier) * 0.9) * (o.qty || 1)) + ', și acces în Clubul 360; îți trimit chiar acum linkul pe WhatsApp. Sau stabilim acum când treci pe la clinică să-l plătești.';
    return hi + 'Ți-am rezervat Cardul de Sărbători de ' + lei(o.amount) + ', primești ' + lei(o.credit) + ' în tratamente. Ți-l ținem rezervat până vii. Dacă îl plătești acum online, primești în plus o ședință de BioLifting cadou și acces în Clubul 360; îți trimit chiar acum linkul pe WhatsApp. Sau stabilim acum când treci pe la clinică să-l plătești.';
  }
  const resvOf = () => (S.d.orders || []).filter((o) => o.status === 'rezervat' && o.pay === 'clinica' && isOpen(o) && o.phone)
    .sort((a, b) => (isVip(b) - isVip(a)) || String(b.converted || b.created).localeCompare(String(a.converted || a.created)));
  function resvRow(o) {
    const open = S.open.has('r' + o.id);
    const chips = (isVip(o) ? vipTag : '') + '<span class="k-tag">' + icon('calendar') + 'Rezervat ' + esc(when(o.converted || o.created)) + '</span>' +
      (o.linkAt ? '<span class="k-tag is-good">' + icon('check') + 'Link trimis ' + esc(hm(o.linkAt)) + '</span>' : '');
    return '<div class="cd-o cd-r' + (open ? ' open' : '') + '" data-r="' + esc(o.id) + '"><div class="cd-o-row">' +
      '<button type="button" class="cd-o-main" data-cd-rx="' + esc(o.id) + '" aria-expanded="' + open + '"><span class="cd-o-t"><b>' + esc(noName(o.name) ? 'Fără nume' : o.name) + '</b><span class="cd-o-m">' + esc(cardTxt(o)) + '</span></span>' +
        '<span class="cd-o-c">' + chips + '</span></button>' +
      '<a class="cd-o-tel" href="' + K.tel(o.phone) + '" aria-label="Sună">' + icon('phone') + '<span>' + esc(o.phone) + '</span></a>' +
      '<div class="cd-o-act"><a class="k-btn is-outline is-sm cd-i-chat" href="#mesaje" data-chat="' + esc(o.phone) + '" data-chat-name="' + esc(o.name || '') + '" data-chat-city="' + esc(o.city || '') + '" aria-label="Mesaje">' + icon('chat') + '<span class="cd-lg">Mesaje</span></a>' +
        '<button type="button" class="k-btn is-primary is-sm" data-cd-link="' + esc(o.id) + '">' + icon('link') + '<span class="cd-lg">Trimite linkul de plată</span><span class="cd-sm">Trimite linkul</span></button></div></div>' +
      '<div class="cd-o-more"><div><p class="cd-script">' + icon('phone') + '<span>' + esc(script(o)) + '</span></p></div></div></div>';
  }
  function paintResv() {
    const box = S.box.querySelector('[data-cd-resv]');
    if (!box) return;
    const mine = S.d.role === 'receptie' && S.d.myCity ? S.d.myCity : '';
    const all = resvOf().filter((o) => !mine || o.city === mine);
    if (!all.length) { box.innerHTML = ''; return; }
    const cities = (mine ? [mine] : ['Timișoara', 'Arad']).filter((c) => all.some((o) => o.city === c));
    const other = all.filter((o) => !cities.includes(o.city));
    const group = (c, l) => '<div class="cd-rg"><h4 class="cd-rg-h">' + esc(c) + '<span>' + l.length + '</span><small>' + lei(l.reduce((n, o) => n + (Number(o.amount) || 0), 0)) + '</small></h4><div class="cd-olist">' + l.map(resvRow).join('') + '</div></div>';
    box.innerHTML = '<section class="k-card cd-orders cd-resv"><div class="k-card-head"><h3>Card rezervat, de încasat</h3><span class="k-muted">' + all.length + '</span></div>' +
      '<p class="cd-resv-hint">Atinge numele pentru ce îi spui. Linkul pleacă pe WhatsApp doar când apeși.</p>' +
      cities.map((c) => group(c, all.filter((o) => o.city === c))).join('') + (other.length ? group('Altă clinică', other) : '') + '</section>';
  }
  async function sendLink(b) {
    const o = (S.d.orders || []).find((x) => x.id === b.dataset.cdLink);
    if (!o) return;
    await K.busy(b, async () => {
      try {
        const r = await api({ action: 'paylink', id: o.id });
        K.ui().toast(r.how === 'template' ? 'Linkul a plecat, cu butoane: îl primește când apasă „Plătesc online”.' : 'Linkul a plecat.', 'success');
        await load(true);
      } catch (err) { K.ui().toast(LINKERR[err.code] ? LINKERR[err.code] + (err.data && err.data.detail && err.code === 'send' ? ' (' + err.data.detail + ')' : '') : K.errText(err), 'error'); }
    });
  }
  const LINKERR = { not_open: 'Rezervarea nu mai e deschisă.', paid: 'E deja plătită.', not_found: 'Rezervarea nu mai există.', sold_out: 'Nu mai sunt carduri.', closed: 'Oferta s-a încheiat.', bad_phone: 'Telefon invalid.',
    tpl: 'Nu ne-a scris în ultimele 24 de ore și mesajul cu butoane nu e aprobat încă de Meta. Sun-o sau scrie-i din Mesaje.', send: 'WhatsApp-ul n-a plecat', no_link: 'Linkul de plată nu s-a putut face.' };
  function paintOrders() {
    paintMoney(); paintChecks(); paintResv();
    const box = S.box.querySelector('[data-cd-orders]'), all = S.d.orders || [];
    if (!box) return;
    if (S.tab === 'int') { box.innerHTML = paintInt(all.filter(isOpen).length); return; }
    const now = Date.now(), admin = S.d.role === 'admin';
    if (!orderFilters(all).some((x) => x[0] === S.of)) S.of = 'open';
    const list = pickOrders(all);
    box.innerHTML = '<section class="k-card cd-orders"><div class="k-card-head">' + tabs(all.filter(isOpen).length) +
      '<label class="cd-sort"><span class="cd-sort-l">Ordine</span><select data-cd-sort><option value="new"' + (S.os === 'new' ? ' selected' : '') + '>cele mai noi</option><option value="appt"' + (S.os === 'appt' ? ' selected' : '') + '>după programare</option></select></label></div>' +
      (all.length ? '<div class="k-chips cd-of">' + orderFilters(all).map(([k, l, n]) => '<button type="button" class="k-chip' + (S.of === k ? ' is-on' : '') + '" data-cd-of="' + esc(k) + '">' + esc(l) + '<span>' + n + '</span></button>').join('') + '</div>' : '') +
      (list.length ? '<div class="cd-olist">' + list.map((o) => orderRow(o, now, admin)).join('') + '</div>' : K.empty('gift', all.length ? 'Nimic aici' : 'Nicio cerere', all.length ? 'Alege alt filtru.' : 'Cererile de card apar aici.')) + '</section>';
  }
  // „Interesate”: who answered the campaign's message with words and has no order; by hand too
  const said = (x) => (x.said && x.said.text ? '„' + x.said.text + '”' + (x.said.at ? ' · ' + hm(x.said.at) : '') : x.manual ? 'adăugată de mână' + (x.by ? ' de ' + x.by : '') + (x.from === 'cerere' ? ', din cereri' : '') : '');
  function intRow(x) {
    const k = x.k, open = S.open.has('i' + k);
    const chips = (isVip(x.tier) ? vipTag : '') + (x.lot ? '<span class="k-tag cd-lot">' + esc(lotTxt(x.lot)) + '</span>' : '<span class="k-tag is-info">De mână</span>') +
      (x.appt ? '<span class="k-tag is-good cd-appt">' + icon('calendar') + esc(apptTxt(x.appt)) + '</span>' : '') +
      (x.note ? '<span class="k-tag cd-note">' + icon('pen') + esc(x.note.text) + '</span>' : '');
    return '<div class="cd-o cd-i' + (open ? ' open' : '') + '" data-i="' + esc(k) + '"><div class="cd-o-row">' +
      '<button type="button" class="cd-o-main" data-cd-ix="' + esc(k) + '" aria-expanded="' + open + '"><span class="cd-o-t"><b>' + esc(x.name || 'Fără nume') + '</b><span class="cd-o-m">' + tierTxt(x.tier) + (x.city ? ' · ' + esc(x.city) : '') + '</span></span>' +
        (said(x) ? '<span class="cd-i-q">' + esc(said(x)) + '</span>' : '') + '<span class="cd-o-c">' + chips + '</span></button>' +
      '<a class="cd-o-tel" href="' + K.tel(x.phone) + '" aria-label="Sună">' + icon('phone') + '<span>' + esc(x.phone) + '</span></a>' +
      '<div class="cd-o-act"><a class="k-btn is-outline is-sm cd-i-chat" href="#mesaje" data-chat="' + esc(x.phone) + '" data-chat-name="' + esc(x.name || '') + '" data-chat-city="' + esc(x.city || '') + '">' + icon('chat') + '<span class="cd-lg">Mesaje</span></a>' +
        '<button type="button" class="k-btn is-primary is-sm" data-cd-mk="' + esc(k) + '">' + icon('plus') + '<span class="cd-lg">Fă cerere</span><span class="cd-sm">Cerere</span></button>' +
        '<span class="cd-mw"><button type="button" class="k-btn is-ghost is-sm cd-dots" data-cd-menu aria-haspopup="true" aria-expanded="false" aria-label="Mai mult">' + icon('more') + '</button><span class="cd-menu" role="menu">' +
        '<button type="button" data-cd-iedit="' + esc(k) + '">' + icon('pen') + 'Editează</button><button type="button" data-cd-inote="' + esc(k) + '">' + icon('chat') + 'Notă</button>' +
        '<button type="button" class="is-bad" data-cd-ihide="' + esc(k) + '">' + icon('ban') + 'Nu e interesată</button></span></span></div></div>' +
      '<div class="cd-o-more"><div><p class="cd-o-sub">' + esc([x.said && x.n > 1 ? x.n + ' mesaje de la ea' : '', x.note ? 'Notă de ' + (x.note.byName || 'echipă') + ', ' + hm(x.note.at) : ''].filter(Boolean).join(' · ') || 'Fără alte detalii.') + '</p></div></div></div>';
  }
  function paintInt(nReq) {
    const I = S.int, list = ints(), p = (I && I.potential) || {};
    return '<section class="k-card cd-orders cd-int"><div class="k-card-head">' + tabs(nReq) + '</div>' +
      (!I ? '<div class="k-skel" style="height:120px;border-radius:14px"></div>' :
      '<p class="cd-int-pot"><b>Potențial ' + lei(p.total || 0) + '</b><span>' + list.length + (list.length === 1 ? ' persoană' : ' persoane') + ' · Timișoara ' + lei(p['Timișoara'] || 0) + ' · Arad ' + lei(p.Arad || 0) + '</span><small>separat de cereri</small></p>' +
      (list.length ? '<div class="cd-olist">' + list.map(intRow).join('') + '</div>' : K.empty('chat', 'Nicio interesată', I.error ? esc(I.error) : 'Cine răspunde cu un mesaj la campania cardului apare aici.'))) + '</section>';
  }
  const intOf = (k) => ((S.int && S.int.people) || []).find((x) => x.k === k);
  // „Adaugă interesată” and „Editează”: name, phone (the contact search), clinic, card, note
  function intDrawer(from, x) {
    const ed = !!x, v0 = x || {};
    K.drawer({
      from, title: ed ? 'Editează interesata' : 'Adaugă interesată', icon: 'star', width: 520,
      subtitle: 'Apare la „Interesate”. „Fă cerere” o mută la „De confirmat”.',
      body: '<form class="k-form cd-waves cd-form" data-f>' +
        '<div class="k-grid c2">' + K.field('Numele ei', '<input name="name" autocomplete="off" required value="' + esc(v0.name || '') + '">') + K.field('Telefon (WhatsApp)', '<input name="phone" inputmode="tel" autocomplete="off" required value="' + esc(v0.phone || '') + '">') + '</div>' +
        K.field('Clinica', K.seg('city', [['Timișoara', 'Timișoara'], ['Arad', 'Arad']], v0.city || 'Timișoara')) +
        K.field('Cardul', K.seg('tier', (Number(v0.tier) === 290 ? [['290', '290 → 500']] : []).concat(TIER_SEG), String(v0.tier || 990))) +
        K.field('Notă', '<textarea name="note" rows="2" maxlength="200" placeholder="ex. sunată, revine luni">' + esc((v0.note && v0.note.text) || '') + '</textarea>') + '</form>',
      footer: '<button type="button" class="k-btn" data-cancel>Renunță</button><span class="k-grow"></span><button type="button" class="k-btn is-primary" data-save>' + icon('check') + (ed ? 'Salvează' : 'Adaugă') + '</button>',
      onMount(root, h) {
        const f = root.querySelector('[data-f]');
        contacts(f);
        root.querySelector('[data-cancel]').addEventListener('click', () => h.close());
        root.querySelector('[data-save]').addEventListener('click', (ev) => K.busy(ev.currentTarget, async () => {
          const v = K.formValues(f);
          try { await api({ action: 'int_add', name: v.name, phone: v.phone, city: v.city, tier: Number(v.tier), note: v.note, was: ed ? v0.phone : '' }); h.close(); K.ui().toast(ed ? 'Salvat.' : 'Adăugată la Interesate.', 'success'); S.tab = 'int'; await loadInt(); }
          catch (err) { K.ui().toast(REQERR[err.code] || K.errText(err), 'error'); }
        }));
      },
    });
  }
  function noteDrawer(from, x) {
    K.drawer({
      from, title: 'Notă', icon: 'pen', width: 440, subtitle: esc(x.name || x.phone),
      body: '<form class="k-form" data-f>' + K.field('Notă', '<textarea name="note" rows="3" maxlength="200" placeholder="ex. sunată, revine luni">' + esc((x.note && x.note.text) || '') + '</textarea>') + '</form>',
      footer: '<button type="button" class="k-btn" data-cancel>Renunță</button><span class="k-grow"></span><button type="button" class="k-btn is-primary" data-save>' + icon('check') + 'Salvează</button>',
      onMount(root, h) {
        root.querySelector('[data-cancel]').addEventListener('click', () => h.close());
        root.querySelector('[data-save]').addEventListener('click', (ev) => K.busy(ev.currentTarget, async () => {
          try { await api({ action: 'int_note', phone: x.phone, note: K.formValues(root.querySelector('[data-f]')).note }); h.close(); await loadInt(); }
          catch (err) { K.ui().toast(K.errText(err), 'error'); }
        }));
      },
    });
  }
  // the row opens in place (its history), the menu from its button
  function toggleRow(id) {
    const row = S.box.querySelector('.cd-o[data-o="' + CSS.escape(id) + '"]');
    if (!row) return;
    const on = !row.classList.contains('open');
    row.classList.toggle('open', on); row.querySelector('[data-cd-x]').setAttribute('aria-expanded', String(on));
    if (on) S.open.add(id); else S.open.delete(id);
  }
  function closeMenus(except) {
    S.box.querySelectorAll('.cd-mw.open').forEach((m) => { if (m !== except) { m.classList.remove('open'); m.querySelector('[data-cd-menu]').setAttribute('aria-expanded', 'false'); } });
  }
  function paintList() {
    const box = S.box && S.box.querySelector('[data-cd-rows]');
    if (!box || !S.d) return;
    const all = S.d.cards || [];
    const n = (k) => (k === 'all' ? all.length : k === 'vip' ? all.filter(isVip).length : all.filter((c) => c.state === k).length);
    S.box.querySelector('[data-cd-chips]').innerHTML = FILTERS.filter(([k]) => k !== 'vip' || n('vip') || S.f === 'vip').map(([k, l]) => '<button type="button" class="k-chip' + (S.f === k ? ' is-on' : '') + '" data-cd-f="' + k + '">' + l + '<span>' + n(k) + '</span></button>').join('');
    const q = K.norm ? K.norm(S.q) : S.q.toLowerCase();
    const hit = (c) => !q || [c.code, c.recipient, c.buyer, c.phone].some((x) => (K.norm ? K.norm(x || '') : String(x || '').toLowerCase()).includes(q));
    const rows = all.filter((c) => (S.f === 'all' || (S.f === 'vip' ? isVip(c) : c.state === S.f)) && hit(c));
    if (!rows.length) { box.innerHTML = K.empty('gift', all.length ? 'Niciun card găsit' : 'Niciun card plătit încă', all.length ? 'Încearcă alt cod sau alt nume.' : 'Un card apare aici imediat ce plata e confirmată.'); return; }
    box.innerHTML = '<div class="k-list cd-rows">' + rows.map((c) => {
      const pct = c.value ? Math.round((c.left / c.value) * 100) : 0;
      const extra = c.naming === 'asked' || c.naming === 'typing' ? '<span class="k-tag is-info">Așteaptă numele</span>' : c.sent && !c.sent.how && c.state !== 'anulat' ? '<span class="k-tag is-warn">De trimis manual</span>' : '';
      return '<button type="button" class="k-row is-click cd-row" data-cd-open="' + esc(c.code) + '">' +
        '<span class="cd-mini' + (isVip(c) ? ' is-vip' : '') + '" aria-hidden="true"><b>' + esc(String(c.value / 1000 >= 1 ? (c.value / 1000).toLocaleString('ro-RO') + 'k' : c.value)) + '</b></span>' +
        '<span class="k-row-main"><span class="k-row-title"><span>' + esc(c.recipient || c.buyer || 'Fără nume') + '</span><span class="cd-code">' + esc(c.code) + '</span></span>' +
        '<span class="cd-o-c">' + (isVip(c) ? vipTag : '') + tag(c.state) + (c.state === 'activ' || c.state === 'folosit' ? reviewTag(c.review) : '') + '<span class="k-tag">' + esc(c.city) + ' · ' + (c.paidVia === 'online' ? 'online' : 'în clinică') + '</span>' + (c.lot ? '<span class="k-tag cd-lot">' + esc(lotTxt(c.lot)) + '</span>' : '') + extra + '</span>' +
        '<span class="cd-bar2" aria-hidden="true"><i style="width:' + pct + '%"></i></span></span>' +
        '<span class="k-row-end"><span class="cd-left"><b>' + lei(c.left) + '</b><small>din ' + lei(c.value) + '</small></span></span></button>';
    }).join('') + '</div>';
  }

  // ------------------------------------------------------------------ actions
  async function onClick(e) {
    const b = e.target.closest('button, a');
    if (!b || !S.box.contains(b)) return;
    if (b.dataset.cdF) { S.f = b.dataset.cdF; paintList(); return; }
    if (b.dataset.cdOf) { S.of = b.dataset.cdOf; paintOrders(); return; }
    if (b.dataset.cdX) { toggleRow(b.dataset.cdX); return; }
    if (b.dataset.cdRx) { const row = b.closest('.cd-r'), on = !row.classList.contains('open'); row.classList.toggle('open', on); b.setAttribute('aria-expanded', String(on)); if (on) S.open.add('r' + b.dataset.cdRx); else S.open.delete('r' + b.dataset.cdRx); return; }
    if (b.dataset.cdLink) { sendLink(b); return; }
    if (b.hasAttribute('data-cd-menu')) { const mw = b.closest('.cd-mw'), on = !mw.classList.contains('open'); closeMenus(mw); mw.classList.toggle('open', on); b.setAttribute('aria-expanded', String(on)); return; }
    if (b.closest('.cd-menu')) closeMenus();
    if (b.dataset.cdDel) {
      const o = (S.d.orders || []).find((x) => x.id === b.dataset.cdDel);
      if (!o) return;
      if (!(await K.ui().confirm({ title: 'Ștergi comanda definitiv?', message: (o.name || 'Fără nume') + ' · ' + o.qty + ' × ' + tierTxt(o.tier) + '. Dispare din listă, din numărători și din stoc. Leadul ei din Pipeline rămâne.', confirmText: 'Șterge', danger: true }))) return;
      try { await api({ action: 'delete', id: o.id, name: o.name || o.phone }); K.ui().toast('Comanda e ștearsă.', 'success'); S.open.delete(o.id); await load(true); } catch (err) { K.ui().toast(err.code === 'paid' ? 'E plătită: anulează întâi cardul.' : K.errText(err), 'error'); }
      return;
    }
    if (b.hasAttribute('data-cd-add')) { addDrawer(b); return; }
    if (b.dataset.cdTab) { S.tab = b.dataset.cdTab; paintOrders(); return; }
    if (b.hasAttribute('data-cd-iadd')) { intDrawer(b); return; }
    if (b.dataset.cdIx) { const row = S.box.querySelector('.cd-i[data-i="' + CSS.escape(b.dataset.cdIx) + '"]'); if (row) { const on = !row.classList.contains('open'); row.classList.toggle('open', on); b.setAttribute('aria-expanded', String(on)); if (on) S.open.add('i' + b.dataset.cdIx); else S.open.delete('i' + b.dataset.cdIx); } return; }
    if (b.dataset.cdMk) { const x = intOf(b.dataset.cdMk); if (x) requestDrawer(b, null, { name: x.name, phone: x.phone, city: x.city, tier: x.tier, note: x.note ? x.note.text : '' }); return; }
    if (b.dataset.cdIedit) { const x = intOf(b.dataset.cdIedit); if (x) intDrawer(b, x); return; }
    if (b.dataset.cdInote) { const x = intOf(b.dataset.cdInote); if (x) noteDrawer(b, x); return; }
    if (b.dataset.cdIhide) {
      const x = intOf(b.dataset.cdIhide); if (!x) return;
      if (!(await K.ui().confirm({ title: 'Nu e interesată?', message: (x.name || x.phone) + ' nu mai apare la Interesate. Rămâne notat cine și când.', confirmText: 'Nu e interesată' }))) return;
      try { await api({ action: 'int_hide', phone: x.phone, name: x.name || x.phone }); K.ui().toast('Scoasă din Interesate.', 'success'); await loadInt(); } catch (err) { K.ui().toast(K.errText(err), 'error'); }
      return;
    }
    if (b.dataset.cdToint) {
      const o = (S.d.orders || []).find((x) => x.id === b.dataset.cdToint); if (!o) return;
      if (!(await K.ui().confirm({ title: 'Muți cererea la Interesate?', message: (o.name || 'Fără nume') + ' · ' + tierTxt(o.tier) + '. Cererea se închide (cardul nu mai e ținut), ea rămâne la Interesate cu cardul și nota.', confirmText: 'Mută' }))) return;
      try { await api({ action: 'to_interested', id: o.id, name: o.name || o.phone }); K.ui().toast('Mutată la Interesate.', 'success'); S.open.delete(o.id); await load(true); } catch (err) { K.ui().toast(err.code === 'not_open' ? 'Cererea nu mai e deschisă.' : K.errText(err), 'error'); }
      return;
    }
    if (b.hasAttribute('data-cd-req')) { requestDrawer(b); return; }
    if (b.dataset.cdEdit) { const o = (S.d.orders || []).find((x) => x.id === b.dataset.cdEdit); if (o) requestDrawer(b, o); return; }
    if (b.hasAttribute('data-cd-stock')) { stockDrawer(b); return; }
    if (b.dataset.cdOpen) { cardDrawer(b.dataset.cdOpen, b); return; }
    if (b.dataset.cdConfirm) {
      const o = (S.d.orders || []).find((x) => x.id === b.dataset.cdConfirm);
      if (!o) return;
      if (b.dataset.via !== 'online') { payDrawer(o, b); return; }
      if (!(await K.ui().confirm({ title: 'Ai văzut plata în myPOS?', message: 'Confirmă doar dacă vezi în myPOS plata de ' + lei(o.amount) + ' de la ' + (o.name || 'ea') + ' (•••' + String(o.phone || '').replace(/\D/g, '').slice(-3) + '). Cardul se emite, pleacă pe WhatsApp și plata intră în Încasări.', confirmText: 'Am văzut plata, confirmă' }))) return;
      await K.busy(b, () => doConfirm(o, 'online', 'card'));
      return;
    }
    if (b.dataset.cdPick) {
      const c = (S.d.checks || []).find((x) => x.id === b.dataset.cdPick), o = c && c.cands.find((x) => x.id === b.dataset.id);
      if (!o) return;
      if (!(await K.ui().confirm({ title: 'E plata ei?', message: lei(c.amount) + ' de la ' + (o.name || 'comanda') + ' (•••' + o.last3 + ', comandată ' + when(o.created) + '). Cardul se emite, pleacă pe WhatsApp și plata intră în Încasări.', confirmText: 'Da, e a ei' }))) return;
      await K.busy(b, async () => { try { await api({ action: 'pick', check: c.id, id: o.id }); K.ui().toast('Plata e a ei: cardul e emis.', 'success'); await load(true); } catch (err) { K.ui().toast(K.errText(err), 'error'); } });
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
      subtitle: esc(o.name) + ' · ' + o.qty + ' × ' + tierTxt(o.tier) + ' = ' + lei(o.amount) + '. Cardul se emite, pleacă pe WhatsApp și plata intră în Încasări.',
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
        '<h4 class="cd-h4">Carduri VIP, pe clinică</h4><div class="k-grid c2">' + ['Timișoara', 'Arad'].map((c) => { const x = (S.d.vip || {})[c] || { max: 5, left: 5 };
          return K.field(c + ' · ' + (x.left > 0 ? x.left + ' rămase' : 'epuizat'), '<input type="number" name="vip' + (c === 'Arad' ? 'Ar' : 'Tm') + '" min="0" max="100" step="1" inputmode="numeric" value="' + x.max + '">'); }).join('') + '</div>' +
        '<p class="cd-stock-left">Doar în portal: pe site se vede numai „Au mai rămas doar N carduri”, N din valul de acum. Un val epuizat deschide imediat următorul; după total, vânzarea se închide.</p>' +
        (w.n < w.of && !w.soldOut ? '<div class="cd-wait"><span>Valul ' + w.n + ': ' + w.left + ' rămase.</span><button type="button" class="k-btn is-outline is-sm" data-open>' + icon('sparkles') + 'Deschide acum următorul val</button></div>' : '') + '</form>',
      footer: '<button type="button" class="k-btn" data-cancel>Renunță</button><span class="k-grow"></span><button type="button" class="k-btn is-primary" data-save>' + icon('check') + 'Salvează</button>',
      onMount(root, h) {
        const v = (n) => Math.floor(Number(root.querySelector('input[name=' + n + ']').value));
        root.querySelector('[data-cancel]').addEventListener('click', () => h.close());
        root.querySelector('[data-save]').addEventListener('click', (ev) => K.busy(ev.currentTarget, async () => {
          try { const r = await api({ action: 'stock', wave: v('wave'), max: v('max'), vip: { 'Timișoara': v('vipTm'), Arad: v('vipAr') } }); h.close(); K.ui().toast('Salvat: valul ' + r.wave.n + ' din ' + r.wave.of + '.', 'success'); await load(true); }
          catch (err) { K.ui().toast(err.code === 'bad_stock' ? 'Valul: 1 până la 200, totalul: 0 până la 1.000, VIP: 0 până la 100.' : K.errText(err), 'error'); }
        }));
        const op = root.querySelector('[data-open]');
        if (op) op.addEventListener('click', (ev) => K.busy(ev.currentTarget, async () => {
          try { const r = await api({ action: 'open_wave' }); h.close(); K.ui().toast('Valul ' + r.opened + ' e deschis: ' + r.left + ' carduri.', 'success'); await load(true); }
          catch (err) { K.ui().toast(K.errText(err), 'error'); }
        }));
      },
    });
  }

  // „Adaugă cerere”: a request taken by phone or at the desk, reserved for the clinic like one from the site; nothing issued,
  // nothing paid; „Confirmă plata” issues the card later (api/_lib/card-sarbatori.js request)
  const REQERR = { missing_name: 'Scrie numele ei.', bad_phone: 'Telefon invalid.', missing_city: 'Alege clinica.', bad_tier: 'Alege cardul.', bad_qty: 'Câte carduri: 1 până la 5.',
    sold_out: 'Cardurile s-au terminat (la VIP: în clinica aleasă).', not_enough: 'Nu mai sunt atâtea carduri.', closed: 'Oferta s-a încheiat.' };
  // her name or her phone: the contacts that match, like a new booking in Calendar (K.clientPicker); a tap fills her
  // name, phone and clinic; a new person typed by hand stays as typed
  function contacts(f) {
    const nm = f.querySelector('input[name=name]'), ph = f.querySelector('input[name=phone]');
    const clinic = (c) => { const l = K.norm ? K.norm(c.location || '') : String(c.location || '').toLowerCase(); const v = /arad/.test(l) ? 'Arad' : /timi/.test(l) ? 'Timișoara' : '';
      const b = v && f.querySelector('[data-k-seg="city"] button[data-v="' + v + '"]'); if (b && !b.classList.contains('is-on')) b.click(); };
    if (!K.clientPicker || !nm || !ph) return;
    K.clientPicker(nm, ph, clinic);
    K.clientPicker(ph, nm, (c) => { ph.value = c.phone || ''; nm.value = c.name || ''; clinic(c); });
  }
  // o: an open order to change („Editează”, the same sheet, filled in); none: a new request; pre: a new one filled in (from
  // „Interesate”: her name, phone, clinic, the card of her message, her note)
  function requestDrawer(from, o, pre) {
    const ed = !!o, v0 = o || pre || {}, gift0 = v0.forWho === 'cadou';
    const one = ed && v0.pay !== 'clinica'; // an online order or a lead: one card (a PayLink is one sum)
    K.drawer({
      from, title: ed ? 'Editează comanda' : 'Adaugă cerere', icon: 'gift', width: 520,
      subtitle: ed ? 'Comanda nu e plătită: se pot schimba datele ei, cardul și câte carduri.' : 'Rezervat, plătește în clinică. Cardul se emite când confirmi plata.',
      body: '<form class="k-form cd-waves cd-form" data-f>' +
        '<div class="k-grid c2">' + K.field('Numele ei', '<input name="name" autocomplete="off" required value="' + esc(v0.name || '') + '">') + K.field('Telefon (WhatsApp)', '<input name="phone" inputmode="tel" autocomplete="off" required value="' + esc(v0.phone || '') + '">') + '</div>' +
        K.field('Clinica', K.seg('city', [['Timișoara', 'Timișoara'], ['Arad', 'Arad']], v0.city || 'Timișoara')) +
        K.field('Cardul', K.seg('tier', (Number(v0.tier) === 290 ? [['290', '290 → 500']] : []).concat(TIER_SEG), String(v0.tier || 990))) +
        '<div class="k-grid c2">' + K.field('Câte carduri', '<input type="number" name="qty" min="1" max="' + (one ? 1 : 5) + '" step="1" inputmode="numeric" value="' + (v0.qty || 1) + '"' + (one ? ' readonly' : '') + '>') + K.field('Pentru', K.seg('forWho', [['eu', 'Ea'], ['cadou', 'Cadou']], gift0 ? 'cadou' : 'eu')) + '</div>' +
        '<div data-names' + (gift0 ? '' : ' hidden') + '>' + K.field('Pe numele (opțional)', '<input name="names" autocomplete="off" placeholder="ex. Mama; pentru mai multe carduri: Mama, Ana" value="' + esc((v0.names || []).filter(Boolean).join(', ')) + '">') + '</div>' +
        K.field('Notă', '<textarea name="note" rows="2" maxlength="300" placeholder="opțional">' + esc(v0.note || '') + '</textarea>') +
        (ed ? '' : K.toggle('send', true, 'Trimite-i confirmarea pe WhatsApp')) +
        '<div class="cd-exists" data-exists hidden></div></form>',
      footer: '<button type="button" class="k-btn" data-cancel>Renunță</button><span class="k-grow"></span><button type="button" class="k-btn is-primary" data-save>' + icon('check') + (ed ? 'Salvează' : 'Rezervă cardul') + '</button>',
      onMount(root, h) {
        const f = root.querySelector('[data-f]'), names = root.querySelector('[data-names]'), ex = root.querySelector('[data-exists]');
        // her name or her phone: the contacts that match, like a new booking in Calendar (K.clientPicker); a tap fills her
        // name, phone and clinic; a new person typed by hand stays as typed
        contacts(f);
        f.addEventListener('change', () => { names.hidden = K.formValues(f).forWho !== 'cadou'; });
        f.addEventListener('input', () => { ex.hidden = true; });
        root.querySelector('[data-cancel]').addEventListener('click', () => h.close());
        root.querySelector('[data-save]').addEventListener('click', (ev) => K.busy(ev.currentTarget, async () => {
          const v = K.formValues(f);
          if (ed) {
            try {
              await api({ action: 'edit', id: o.id, name: v.name, phone: v.phone, city: v.city, tier: Number(v.tier), qty: Number(v.qty) || 1, forWho: v.forWho,
                names: v.forWho === 'cadou' ? String(v.names || '').split(',').map((x) => x.trim()) : [], note: v.note });
              h.close(); K.ui().toast('Comanda e modificată.', 'success'); await load(true);
            } catch (err) { K.ui().toast(REQERR[err.code] || (err.code === 'not_open' ? 'Comanda nu mai e deschisă (plătită sau anulată).' : K.errText(err)), 'error'); }
            return;
          }
          try {
            const r = await api({ action: 'request', name: v.name, phone: v.phone, city: v.city, tier: Number(v.tier), qty: Number(v.qty) || 1, forWho: v.forWho,
              names: v.forWho === 'cadou' ? String(v.names || '').split(',').map((x) => x.trim()) : [], note: v.note, send: !!v.send });
            h.close();
            const m = r.msg ? (r.msg.how ? ' Confirmarea i-a plecat pe WhatsApp.' : ' WhatsApp: ' + (r.msg.skipped || 'neplecat') + '.') : '';
            if (pre) S.tab = 'req';
            K.ui().toast('Cerere adăugată: ' + r.reservation.qty + ' × ' + tierTxt(r.reservation.tier) + ', plătește în clinică.' + (r.replaced ? ' Comanda ei online neplătită e închisă.' : '') + m, 'success');
            await load(true);
          } catch (err) {
            // she already has an open order: shown here, not a second one
            if (err.code === 'exists' && err.data && err.data.order) {
              const o = err.data.order;
              ex.innerHTML = icon('alert') + '<span><b>Are deja o comandă deschisă.</b> ' + esc((o.name || 'Fără nume') + ' · ' + o.qty + ' × ' + tierTxt(o.tier) + ' · ' + (STATE[o.status] || [o.status])[0] + ' · ' + o.city + ' · ' + when(o.created)) + '. O găsești la „De confirmat”.</span>';
              ex.hidden = false;
              return;
            }
            K.ui().toast(REQERR[err.code] || K.errText(err), 'error');
          }
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
        K.field('Cardul', K.seg('tier', TIER_SEG, '990')) +
        K.field('Plătit', K.seg('via', [['clinica', 'În clinică'], ['online', 'Online (PayLink)']], 'clinica'), '', 'Plata online aduce și cadoul (o ședință de BioLifting) și Clubul 360; la VIP, 10% reducere în loc de cadou.') +
        '<div data-sum hidden>' + K.field('Suma plătită online (VIP)', K.seg('sum', [['full', '9.900 lei'], ['disc', '8.910 lei (10% reducere)']], 'full')) + '</div>' +
        '<div class="k-grid c2">' + K.field('Numele ei', '<input name="name" autocomplete="off" required>') + K.field('Telefon (WhatsApp)', '<input name="phone" inputmode="tel" autocomplete="off" required>') + '</div>' +
        K.field('Pe numele (dacă e cadou)', '<input name="recipient" autocomplete="off" placeholder="gol = pe numele ei">') +
        K.field('Clinica', K.seg('city', [['Timișoara', 'Timișoara'], ['Arad', 'Arad']], 'Timișoara')) +
        K.field('Cum a plătit (în clinică)', K.seg('method', [['card', 'Card (POS)'], ['cash', 'Cash'], ['transfer', 'Transfer']], 'card'), '', 'Plata intră în Încasări; online e mereu card.') + '</form>',
      footer: '<button type="button" class="k-btn" data-cancel>Renunță</button><span class="k-grow"></span><button type="button" class="k-btn is-primary" data-save>' + icon('check') + 'Emite cardul</button>',
      onMount(root, h) {
        const f0 = root.querySelector('[data-f]'), sum = root.querySelector('[data-sum]');
        // online: the full sum or the 10% one (its PayLink, 22.11)
        f0.addEventListener('click', () => setTimeout(() => { const v = K.formValues(f0); sum.hidden = !(v.via === 'online' && v.tier === '9900'); }, 0));
        root.querySelector('[data-cancel]').addEventListener('click', () => h.close());
        root.querySelector('[data-save]').addEventListener('click', (ev) => K.busy(ev.currentTarget, async () => {
          const v = K.formValues(root.querySelector('[data-f]'));
          try {
            const r = await api({ action: 'add', tier: Number(v.tier), qty: 1, names: [v.recipient || ''], name: v.name, phone: v.phone, city: v.city, via: v.via, method: v.via === 'online' ? 'card' : v.method, disc: v.via === 'online' && v.sum === 'disc' });
            h.close(); K.ui().toast('Card emis: ' + ((r.cards || [])[0] || {}).code, 'success'); await load(true);
          } catch (err) { K.ui().toast(err.code === 'bad_phone' ? 'Telefon invalid.' : err.code === 'missing_name' ? 'Scrie numele.' : err.code === 'sold_out' ? 'Cardurile VIP din clinica asta s-au epuizat.' : K.errText(err), 'error'); }
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
    const sentLine = c.naming === 'asked' || c.naming === 'typing' ? '<p class="cd-sent">' + icon('chat') + '<span><b>Așteaptă numele.</b> A primit pe WhatsApp întrebarea „pe ce nume să fie cardul?”. Dacă nu răspunde în 6 ore, cardul pleacă fără nume; îl poți scrie tu mai jos.</span></p>'
      : c.sent && c.sent.how ? '<p class="cd-sent ok">' + icon('check') + 'Trimis pe WhatsApp, ' + esc(when(c.sent.at)) + '</p>'
      : '<p class="cd-sent">' + icon('alert') + '<span><b>De trimis manual.</b> ' + esc((c.sent && c.sent.error) || 'Nu a plecat încă.') + '</span></p>';
    const msg = 'Bună, ' + (c.buyer || '').split(' ')[0] + '! Cardul tău de Sărbători Centrul360: credit ' + lei(c.value) + ', cod ' + c.code + ', valabil până pe 30.06.2027.' + (c.gift ? ' Cadou: ' + c.gift.what + '.' : '') + (c.club ? ' Locul tău în Clubul 360: https://www.centrul360.com/club-360?cod=' + c.code : '');
    const hist = c.claims.length ? '<ol class="cd-hist">' + c.claims.slice().reverse().map((x) => '<li class="' + (x.undone ? 'is-undone' : '') + '"><div><b>' + esc(x.items.map((i) => i.name + (i.kind === 'gift' ? ' (cadou)' : ' ' + lei(i.amount))).join(', ')) + '</b>' +
      '<small>' + esc(K.dateShort(x.date)) + ' · ' + esc(x.city) + (x.usedBy ? ' · l-a folosit ' + esc(x.usedBy) : '') + (x.performerName ? ' · a făcut-o ' + esc(x.performerName) : '') + (x.byName ? ' · trecut de ' + esc(x.byName) : '') + (x.rest > 0 ? ' · a plătit în plus ' + lei(x.rest) : '') + (x.undone ? ' · anulat' : '') + '</small></div>' +
      '<span class="cd-amt">' + (x.applied ? '−' + lei(x.applied) : '0 lei') + '</span>' + (admin && x.id === lastId ? '<button type="button" class="k-btn is-ghost is-sm" data-undo>Anulează</button>' : '') + '</li>').join('') + '</ol>' : '<p class="k-muted">Nefolosit încă.</p>';
    const dr = K.drawer({
      from, title: c.recipient || c.buyer || 'Fără nume', icon: 'gift', width: 560,
      subtitle: esc(c.code) + ' · ' + tag(c.state),
      body: '<figure class="cd-img"><img src="' + img(c.code) + '" alt="Cardul de Sărbători ' + esc(c.code) + '" loading="lazy"></figure>' +
        '<div class="cd-acts"><a class="k-btn is-outline is-sm" href="' + img(c.code, 1) + '" download="Card-' + esc(c.code) + '.png">' + icon('download') + 'Descarcă</a>' +
        '<button type="button" class="k-btn is-outline is-sm" data-resend>' + icon('chat') + 'Trimite pe WhatsApp</button>' +
        '<a class="k-btn is-ghost is-sm" href="' + K.wa(c.phone, msg) + '" target="_blank" rel="noopener">' + icon('link') + 'Scrie din WhatsApp</a></div>' + sentLine +
        '<div class="cd-kv"><div><small>Credit</small><b>' + lei(c.value) + '</b></div><div><small>Folosit</small><b>' + lei(c.used) + '</b></div><div><small>Rămas</small><b class="cd-big">' + lei(c.left) + '</b></div></div>' +
        '<p class="k-muted cd-meta">Cumpărat de ' + esc(c.buyer) + ' · <a href="' + K.tel(c.phone) + '">' + esc(c.phone) + '</a> · ' + esc(c.city) + ' · ' + tierTxt(c.tier) + ' ' + (c.paidVia === 'online' ? 'online' : 'în clinică') + ', ' + esc(dayOf(c.paidAt)) +
        (c.paidByName ? ' (' + esc(c.paidByName) + ')' : '') + (NAMEFROM[c.nameFrom] ? ' · Numele ' + NAMEFROM[c.nameFrom] : '') + (c.gift ? ' · Cadou: ' + esc(c.gift.what) + (c.gift.state === 'open' ? '' : ', folosit') : '') + (c.club ? ' · Clubul 360' : '') + '</p>' +
        (isVip(c) && c.review ? '<p class="cd-sent' + (c.review.state === 'booked' ? ' ok' : '') + '">' + icon('calendar') + '<span>' + (c.review.state === 'booked' ? '<b>Revizia completă e programată</b> pe ' + esc(K.dateShort(c.review.date)) + (c.review.time ? ', ' + esc(c.review.time) : '') + '.' : '<b>Revizia completă: de programat.</b> Sun-o să stabiliți revizia și planul ei personal.') + '</span></p>' : '') +
        (canUse ? '<form class="k-form cd-use" data-use><h4>Folosește creditul</h4>' +
          '<div class="cd-pick"><select data-pick><option value="">Alege din lista de prețuri…</option>' + tr.map((t, i) => '<option value="' + i + '">' + esc(t.name) + ' · ' + lei(t.price) + (t.city ? ' · ' + esc(t.city) : '') + '</option>').join('') + '</select>' +
          '<button type="button" class="k-btn is-outline is-sm" data-line>' + icon('plus') + 'Alt tratament</button></div>' +
          '<div class="cd-lines" data-lines></div>' +
          (c.gift && c.gift.state === 'open' ? '<label class="cd-gift"><input type="checkbox" name="gift"><span>Folosește cadoul: ' + esc(c.gift.what) + '</span></label>' : '') +
          '<div class="k-grid c3">' + K.field('Data', '<input type="date" name="date" value="' + today + '" max="' + today + '">') +
          K.field('A făcut-o', '<select name="performer"><option value="">Alege</option>' + K.options(team.map((p) => [p.id, p.name]), '') + '</select>') +
          K.field('Clinica', '<select name="city">' + K.options([['Timișoara', 'Timișoara'], ['Arad', 'Arad']], c.city) + '</select>') + '</div>' +
          K.field('Cine a folosit (opțional)', '<input name="usedBy" autocomplete="off" maxlength="80" placeholder="' + (isVip(c) ? 'ex. sora ei, Ana' : 'gol = ea') + '">') +
          '<p class="cd-total" data-total></p><button type="button" class="k-btn is-primary" data-use-go>' + icon('check') + 'Scade din credit</button></form>'
          : '<p class="k-muted">' + (c.state === 'expirat' ? 'Cardul a expirat pe 30.06.2027 și nu mai poate fi folosit.' : c.state === 'folosit' ? 'Creditul e folosit în întregime.' : '') + '</p>') +
        '<h4 class="cd-h4">Istoric</h4>' + hist +
        (admin && c.state !== 'anulat' && !c.used && !(c.gift && c.gift.state === 'used') ? '<p class="cd-void"><button type="button" class="k-btn is-ghost is-sm" data-void>' + icon('ban') + 'Anulează cardul plătit</button><small>Se face rambursare în Încasări, cu data de azi.</small></p>' : '') +
        // cancelled: deleted for good (admin); Încasări keeps the payment and its refund
        (admin && c.state === 'anulat' ? '<p class="cd-void"><button type="button" class="k-btn is-ghost is-sm" data-delcard>' + icon('trash') + 'Șterge definitiv</button><small>Dispare din listă și din numărători. Încasări păstrează plata și rambursarea.</small></p>' : '') +
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
              const r = await api({ action: 'redeem', code: c.code, items, date: f.date.value, performer: f.performer.value, city: f.city.value, usedBy: f.usedBy.value.trim() });
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
        const dl = root.querySelector('[data-delcard]');
        if (dl) dl.addEventListener('click', (ev) => K.busy(ev.currentTarget, async () => {
          if (!(await K.ui().confirm({ title: 'Ștergi cardul anulat?', message: c.code + ' dispare definitiv din listă și din numărători. Leadul ei din Pipeline și Încasări rămân.', confirmText: 'Șterge', danger: true }))) return;
          try { await api({ action: 'delete', id: c.order, name: c.buyer || c.phone }); h.close(); K.ui().toast('Cardul e șters.', 'success'); await load(true); }
          catch (err) { K.ui().toast(err.code === 'paid' ? 'Cardul e activ: anulează-l întâi.' : K.errText(err), 'error'); }
        }));
        const vd = root.querySelector('[data-void]');
        if (vd) vd.addEventListener('click', (ev) => K.busy(ev.currentTarget, async () => {
          if (!(await K.ui().confirm({ title: 'Anulezi cardul plătit?', message: 'Comanda ' + c.qty + ' × ' + tierTxt(c.tier) + ' se anulează, cardurile ei nu mai pot fi folosite, iar banii apar ca rambursare în Încasări, azi.', confirmText: 'Anulează cardul', danger: true }))) return;
          try { await api({ action: 'void', id: c.order }); h.close(); K.ui().toast('Card anulat, rambursarea e în Încasări.', 'success'); await load(true); }
          catch (err) { K.ui().toast(err.code === 'used' ? 'Cardul a fost deja folosit: nu se mai anulează.' : K.errText(err), 'error'); }
        }));
        root.querySelector('[data-rename]').addEventListener('click', (ev) => K.busy(ev.currentTarget, async () => {
          try { const r = await api({ action: 'rename', code: c.code, recipient: root.querySelector('input[name=recipient]').value }); K.ui().toast(r.sent && r.sent.how ? 'Salvat și trimis pe WhatsApp, cu numele nou.' : 'Salvat. WhatsApp-ul n-a plecat: descarcă poza și trimite-o manual.', r.sent && r.sent.how ? 'success' : 'error'); h.close(); await load(true); }
          catch (err) { K.ui().toast(K.errText(err), 'error'); }
        }));
      },
    });
    return dr;
  }

  K.section('carduri', { mount, show() { load(); } });
})();
