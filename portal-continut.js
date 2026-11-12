// Centrul360 portal, Marketing → „Conținut” (the owner, 12.11: „vreau să fie totul în one screen: main screen-ul să fie
// cu insights, și după, la Program, să fie ăla de aprobat”). Two tabs:
//  - „Rezultate” (first, the dashboard): the key numbers, the week's analysis, the monthly goals, the networks, the
//    organic funnel, „Merge tare 🔥” (with „Fă reclamă din asta”), what to make more of, the top 10, what works, the
//    audience, the recommended hours (one tap saves them), what people say, last month (api/_lib/content-learn.js,
//    api/_lib/content-insights.js). A banner says when next week waits for approval.
//  - „Program” (#continut/program): next week's batch as a review feed (every item large, its video inline, a phone
//    preview per network with that network's text, editable, its planned time, Aprobă / Refă, „Aprobă toată
//    săptămâna” always at hand), the compact calendar of days × networks, this week, the owner's ideas, what to look at,
//    the last posted. The clock posts only what is approved (api/_lib/content-post.js).
// An item's drawer: the owner's look, the texts' check, the statistics (per network the numbers and rates, the
// retention curve, the growth in the first hours, × the usual post, the funnel), the video, the texts, the plan and,
// once posted on Instagram or Facebook, „Fă reclamă din asta” (api/_lib/content-boost.js). Admin only.
(function () {
  'use strict';
  const K = window.K;
  if (!K) return;
  const { esc, icon } = K;
  const S = { d: null, busy: false, tab: 'res', r: null, rErr: '', rAt: 0, warn: {}, an: '', fm: 'month', sel: {}, open: {} };
  let panel = null, dr = null, openId = '';

  const NETS = ['tt', 'yt', 'ig', 'fb'];
  const NET = { ig: 'Instagram', fb: 'Facebook', tt: 'TikTok', yt: 'YouTube' };
  const NET_S = { ig: 'IG', fb: 'FB', tt: 'TT', yt: 'YT' };
  const AS = { reel: ['tt', 'yt', 'ig', 'fb'], carousel: ['ig', 'fb', 'tt'], slideshow: ['tt'], story: ['ig', 'fb'] };
  const CAP_MAX = { tt: 2200, yt: 100, ig: 2200, fb: 5000 };
  const KIND = { reel: 'Reel', carousel: 'Carusel', slideshow: 'Slideshow', story: 'Story' };
  const STATE = { planned: 'Programat', posting: 'Se publică', posted: 'Postat', error: 'Eroare', waiting_access: 'Așteaptă acces', skipped: 'Scos', missed: 'Ratat' };
  const TONE = { planned: 'is-info', posting: 'is-warn', posted: 'is-good', error: 'is-bad', waiting_access: '', skipped: '', missed: '' };
  const REVIEW = { pending: ['De aprobat', 'is-warn'], approved: ['Aprobat', 'is-good'], redo: ['De refăcut', 'is-bad'] };
  const TZ = 'Europe/Bucharest';
  const fDay = new Intl.DateTimeFormat('en-CA', { timeZone: TZ });
  const fTime = new Intl.DateTimeFormat('ro-RO', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
  const fDow = new Intl.DateTimeFormat('ro-RO', { timeZone: 'UTC', weekday: 'short' });
  const roDay = (t) => fDay.format(new Date(t));
  const dm = (d) => d.slice(8, 10) + '.' + d.slice(5, 7);
  const addDay = (d, n) => { const [y, m, x] = d.split('-').map(Number); return new Date(Date.UTC(y, m - 1, x + n, 12)).toISOString().slice(0, 10); };
  const dow = (d) => { const s = fDow.format(new Date(d + 'T12:00:00Z')).replace('.', ''); return s.charAt(0).toUpperCase() + s.slice(1); };
  const range = (w) => { const e = addDay(w, 6); return Number(w.slice(8, 10)) + (w.slice(5, 7) === e.slice(5, 7) ? '' : '.' + w.slice(5, 7)) + '-' + Number(e.slice(8, 10)) + '.' + e.slice(5, 7); };
  const when = (iso) => { const d = roDay(iso), t = S.d.today; return (d === t ? 'azi' : d === addDay(t, 1) ? 'mâine' : d === addDay(t, -1) ? 'ieri' : dow(d) + ' ' + dm(d)) + ', ' + fTime.format(new Date(iso)); };
  const fileOf = (it, n) => (it.files || []).find((f) => f.name === n);
  const fileUrl = (it, n) => { const f = fileOf(it, n); return '/api/content-file?i=' + encodeURIComponent(it.id) + '&n=' + encodeURIComponent(n) + (f && f.v ? '&v=' + encodeURIComponent(f.v) : ''); };
  const cover = (it) => (it.cover ? fileUrl(it, it.cover) : '');
  const title = (it) => it.topic || it.rubric || KIND[it.kind];
  const k = (n) => (n >= 10000 ? Math.round(n / 1000) + 'k' : n >= 1000 ? (Math.round(n / 100) / 10).toLocaleString('ro-RO') + 'k' : String(n || 0));
  const pl = (n, one, many) => (n === 1 ? '1 ' + one : n + (n % 100 >= 20 ? ' de ' : ' ') + many);
  const photo = (it) => it.kind === 'carousel' || it.kind === 'slideshow';
  const thumb = (it, cls) => '<span class="cn-th ' + (cls || '') + (photo(it) ? ' is-photo' : '') + '">' + (it.cover ? '<img src="' + esc(cover(it)) + '" alt="" loading="lazy">' : icon(photo(it) ? 'layers' : 'video')) + '</span>';
  const badge = (net) => '<i class="cn-net is-' + net + '">' + NET_S[net] + '</i>';
  const review = (it) => it.review || 'pending';
  const qaOf = (it) => it.qa || { problems: [], warnings: [] };
  // a network's own checks (and the item's, named on no network): a chip shows only what concerns its network
  const qaFor = (it, net) => {
    const q = qaOf(it);
    if (!net) return q;
    const mine = (x) => x.startsWith(NET[net] + ': ') || !NETS.some((n) => x.startsWith(NET[n] + ': '));
    return { problems: q.problems.filter(mine), warnings: q.warnings.filter(mine) };
  };
  // the score on the networks' common scale: ×1 is a usual post, ×2 twice as good
  const x1 = (v) => '×' + (Math.round((v || 0) * 10) / 10).toLocaleString('ro-RO');
  const tone = (v) => (v >= 1.15 ? 'is-good' : v <= 0.85 ? 'is-bad' : '');
  const HOOK = { intrebare: 'Întrebare', cifra: 'Cifră', mit: 'Mit', pov: 'POV', socant: 'Șocant', poveste: 'Poveste' };
  const hookName = (h) => HOOK[h] || (h ? h.charAt(0).toUpperCase() + h.slice(1).replace(/-/g, ' ') : '');
  const signed = (n) => (n > 0 ? '+' : n < 0 ? '-' : '') + k(Math.abs(n));

  // ------------------------------------------------------------------ the page
  function mount(p) {
    panel = p;
    panel.classList.add('k-panel', 'cn');
    panel.innerHTML = '<div class="k-head"><div><div class="k-eyebrow">Marketing</div><h2>Conținut</h2></div><div class="k-head-actions" data-cthead></div></div><div data-ctbody><div class="k-skel" style="height:420px"></div></div>';
    panel.addEventListener('click', async (e) => {
      const all = e.target.closest('[data-ctall]');
      if (all) return approveAll(all);
      const del = e.target.closest('[data-ctidel]');
      if (del) { if (await save({ action: 'idea_del', id: del.dataset.ctidel }, del)) K.ui().toast('Idee ștearsă.', 'success'); return; }
      // the review feed: a network's preview, approve, redo, open an approved one, the sound
      const ph = e.target.closest('[data-ctph]');
      if (ph) { const c = ph.closest('[data-ctrcid]'); if (c) { S.sel[c.dataset.ctrcid] = ph.dataset.ctph; refreshCard(c.dataset.ctrcid); } return; }
      const rok = e.target.closest('[data-ctrc-ok]');
      if (rok) { const id = rok.closest('[data-ctrcid]').dataset.ctrcid; if (await save({ action: 'approve', id }, rok)) K.ui().toast('Aprobat.', 'success'); return; }
      const rredo = e.target.closest('[data-ctrc-redo]');
      if (rredo) return redoItem(rredo.closest('[data-ctrcid]').dataset.ctrcid, rredo);
      const ro = e.target.closest('[data-ctrc-open]');
      if (ro) { const id = ro.dataset.ctrcOpen; S.open[id] = !S.open[id]; refreshCard(id); return; }
      const v = e.target.closest('[data-ctvid]');
      if (v) return sound(v);
      const tg = e.target.closest('[data-cttab-go]');
      if (tg) { setTab(tg.dataset.cttabGo); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
      const ap = e.target.closest('[data-ctapply]');
      if (ap) return applyHours(ap);
      const hb = e.target.closest('[data-cthboost]');
      if (hb) return boost(hb, hb.dataset.cthboost, hb.dataset.net);
      if (e.target.closest('[data-ctgoals]')) return openSettings(true);
      const it = e.target.closest('[data-ctitem]'); if (it) return openItem(it.dataset.ctitem);
      if (e.target.closest('[data-ctset]')) return openSettings();
      if (e.target.closest('[data-ctgo]')) return K.go('integrari');
    });
    panel.addEventListener('change', (e) => {
      if (e.target.name === 'cton') save({ action: 'settings', on: e.target.checked });
      if (e.target.name === 'cttab') setTab(e.target.value);
      if (e.target.name === 'ctfm') { S.fm = e.target.value === 'prev' ? 'prev' : 'month'; paint(true); }
      if (e.target.matches('[data-ctan]')) { S.an = e.target.value; paint(true); }
      const cap = e.target.closest('[data-ctrc-cap]');
      if (cap) saveCaption(cap.closest('[data-ctrcid]').dataset.ctrcid, cap.dataset.ctrcCap, cap.value);
    });
    panel.addEventListener('input', (e) => {
      const cap = e.target.closest('[data-ctrc-cap]'); if (!cap) return;
      const n = cap.closest('.cn-rc-e').querySelector('[data-ctrc-n]'); if (n) n.textContent = cap.value.length + '/' + CAP_MAX[cap.dataset.ctrcCap];
    });
    // a carousel in the feed: which photo is showing
    panel.addEventListener('scroll', (e) => {
      const c = e.target.closest && e.target.closest('[data-ctcar]'); if (!c) return;
      const n = c.parentElement.querySelector('[data-ctcarn]'); if (!n) return;
      n.textContent = (Math.round(c.scrollLeft / Math.max(1, c.clientWidth)) + 1) + '/' + c.children.length;
    }, true);
    // an idea for the next weeks
    panel.addEventListener('submit', async (e) => {
      const f = e.target.closest('[data-ctidea]'); if (!f) return;
      e.preventDefault();
      const text = f.elements.text.value.trim();
      if (text.length < 3) { K.ui().toast('Scrie ideea pe scurt.', 'error'); f.elements.text.focus(); return; }
      S.ideaSent = true;
      const ok = await save({ action: 'idea_add', text, rubric: f.elements.rubric.value }, f.querySelector('button[type=submit]'));
      S.ideaSent = false;
      if (ok) {
        K.ui().toast('Idee adăugată.', 'success');
        const t = panel.querySelector('[data-ctidea] input[name=text]'); if (t) t.focus();
      }
    });
  }
  // Rezultate or Program (a notification opens Program: #continut/program)
  function setTab(t) {
    S.tab = t === 'week' || t === 'program' ? 'week' : 'res';
    if (!panel || !S.d) return;
    paint(true);
    if (S.tab === 'res') loadResults();
  }
  K.on('continut:sub', (sub) => setTab(sub));
  async function load() {
    try { S.d = await K.api('/api/portal-content', { action: 'get' }); paint(); }
    catch (err) { const b = panel && panel.querySelector('[data-ctbody]'); if (b) b.innerHTML = K.empty('alert', 'Nu am putut încărca conținutul', esc(K.errText(err))); }
    if (S.tab === 'res') loadResults();
  }
  // Rezultate: read when the tab opens (again after a minute)
  async function loadResults(force) {
    if (!force && S.r && Date.now() - S.rAt < 60e3) return;
    try { S.r = await K.api('/api/portal-content', { action: 'results' }); S.rErr = ''; S.rAt = Date.now(); }
    catch (err) { S.rErr = K.errText(err); }
    if (S.tab === 'res' && S.d) paint(true);
    // an open drawer shows the item's funnel once Rezultate is there
    if (dr && openId) { const it = S.d && S.d.items.find((x) => x.id === openId); if (it) { const y = dr.body.scrollTop; dr.body.innerHTML = itemBody(it); dr.body.scrollTop = y; } }
  }
  const ERR = { not_approved: 'Întâi aprobă materialul.', paused: 'Postarea automată e oprită.', not_ready: 'Materialul se reface acum.', already_posted: 'E postat peste tot.', idea_too_short: 'Scrie ideea pe scurt.' };
  async function save(payload, btn, quiet) {
    if (btn) btn.disabled = true;
    try { S.busy = true; const r = await K.api('/api/portal-content', payload); S.d = r; paint(quiet); return r; }
    catch (err) { K.ui().toast(ERR[err && err.code] || K.errText(err, 'Nu am putut salva.'), 'error'); return null; }
    finally { S.busy = false; if (btn && btn.isConnected) btn.disabled = false; }
  }
  function entries() {
    const out = [];
    S.d.items.forEach((it) => (it.plan || []).forEach((e) => out.push({ it, e })));
    return out;
  }
  // quiet: the drawer stays as it is (a text being edited keeps its focus)
  function paint(quiet) {
    if (!panel || !S.d) return;
    const st = S.d.settings, s = S.d.status;
    panel.querySelector('[data-cthead]').innerHTML = K.toggle('cton', st.on, st.on ? 'Postare automată' : 'Oprită') +
      '<button type="button" class="k-icon-btn" data-ctset aria-label="Setări">' + icon('sliders') + '</button>';
    const body = panel.querySelector('[data-ctbody]');
    // a text being typed in the ideas box survives a repaint
    const typing = body.querySelector('[data-ctidea] input[name=text]'), draft = typing && !S.ideaSent ? typing.value : '', focused = typing && document.activeElement === typing;
    const pend = (s.next && s.next.pending) || 0;
    const tabs = '<div class="cn-tabs">' + K.seg('cttab', [['res', 'Rezultate', 'trend'], ['week', pend ? 'Program · ' + pend : 'Program', 'calendar']], S.tab) + '</div>';
    stopMedia();
    body.innerHTML = tabs + (S.tab === 'res' ? banner(s.next) + resTab()
      : access() + gallery(s.next) + board(s.next, 'Săptămâna viitoare', true) + board(s.current, 'Săptămâna asta', false) + ideasBox() + errors() + last());
    const t2 = body.querySelector('[data-ctidea] input[name=text]');
    if (t2 && draft) { t2.value = draft; if (focused) t2.focus(); }
    wireMedia(body);
    if (dr && openId && !quiet) { const it = S.d.items.find((x) => x.id === openId); if (it) { const y = dr.body.scrollTop; dr.body.innerHTML = itemBody(it); dr.body.scrollTop = y; dr.el.querySelector('.k-dfoot') && (dr.el.querySelector('.k-dfoot').innerHTML = itemFoot(it)); } }
  }
  // next week waits for the owner's look: the way to it, on top of Rezultate
  function banner(w) {
    const n = (w && w.pending) || 0;
    if (!n) return '';
    return '<button type="button" class="cn-ban" data-cttab-go="week"><span class="cn-ban-ic">' + icon('calendar') + '</span><span class="cn-main"><b>' + pl(n, 'material', 'materiale') + ' de aprobat pentru săptămâna viitoare</b><small>' + esc(range(w.week)) + '</small></span><span class="cn-ban-go">Program' + icon('right') + '</span></button>';
  }
  function access() {
    const a = S.d.access;
    let fb = '';
    if (!a.connected) fb = '<p class="cn-line is-bad">' + icon('alert') + '<span>Facebook nu e conectat.</span><button type="button" class="k-btn is-ghost is-sm" data-ctgo>Integrări</button></p>';
    else if (a.missing && a.missing.length) fb = '<p class="cn-line">' + icon('key') + '<span>Lipsesc permisiunile ' + esc(a.missing.join(', ')) + '</span><button type="button" class="k-btn is-ghost is-sm" data-ctgo>Reconectează</button></p>';
    // TikTok and YouTube: their own connection (Integrări), shown while it isn't ready
    const own = ['tt', 'yt'].map((n) => {
      const x = a[n];
      if (!x || (x.connected && !(x.missing || []).length)) return '';
      const why = x.lost ? 's-a deconectat' : !x.connected ? 'neconectat' : 'lipsesc permisiuni';
      return '<button type="button" class="cn-conn' + (x.lost ? ' is-bad' : '') + '" data-ctgo title="' + esc(x.lost || (x.missing || []).join(', ')) + '">' + badge(n) + '<span>' + NET[n] + ': ' + why + '</span>' + icon('right') + '</button>';
    }).join('');
    return fb + (own ? '<div class="cn-conns">' + own + '</div>' : '');
  }

  // ------------------------------------------------------------------ a week: days × networks
  function board(w, label, next) {
    if (!w) return '';
    const days = []; for (let i = 0; i < 7; i++) days.push(addDay(w.week, i));
    const cells = {}, placed = new Set();
    entries().forEach(({ it, e }) => {
      if (e.state === 'skipped' || !e.at) return;
      const d = roDay(e.at); if (!days.includes(d)) return;
      (cells[d + '|' + e.net] = cells[d + '|' + e.net] || []).push({ it, e });
      placed.add(it.id);
    });
    const mine = S.d.items.filter((it) => it.week === w.week && !it.dropped && !it.removed);
    const loose = mine.filter((it) => !placed.has(it.id));
    const nets = S.d.settings.nets;
    const tag = (txt, tone, ic) => '<span class="k-tag ' + tone + '">' + (ic ? icon(ic) : '') + txt + '</span>';
    const miss = [w.missing.reel ? pl(w.missing.reel, 'reel', 'reels') : '', w.missing.carousel ? pl(w.missing.carousel, 'carusel', 'carusele') : ''].filter(Boolean).join(' și ');
    const tags = (w.pending ? tag(w.pending + ' de aprobat', 'is-warn') : '') + (w.approved ? tag(pl(w.approved, 'aprobat', 'aprobate'), 'is-good', 'check') : '') +
      (w.redo ? tag(w.redo + ' de refăcut', 'is-bad', 'undo') : '') + (miss ? tag((w.missing.reel + w.missing.carousel === 1 ? 'Lipsește ' : 'Lipsesc ') + miss, '') : '') + (w.drafts ? tag(w.drafts + ' în lucru', '') : '');
    const head = '<div class="cn-gh"></div>' + NETS.map((n) => '<div class="cn-gh' + (nets[n] ? '' : ' is-off') + '">' + badge(n) + '<span>' + NET[n] + '</span></div>').join('');
    const rows = days.map((d) => {
      const today = d === S.d.today, past = d < S.d.today;
      return '<div class="cn-gd' + (today ? ' is-today' : '') + (past ? ' is-past' : '') + '"><b>' + esc(dow(d)) + '</b><small>' + dm(d) + '</small></div>' + NETS.map((n) => {
        const list = (cells[d + '|' + n] || []).sort((a, b) => a.e.at.localeCompare(b.e.at));
        return '<div class="cn-gc' + (nets[n] ? '' : ' is-off') + (past ? ' is-past' : '') + '">' + list.map(({ it, e }) => chip(it, e)).join('') + '</div>';
      }).join('');
    }).join('');
    const extra = loose.length ? '<div class="cn-loose"><small>Fără loc</small><div>' + loose.map((it) => '<button type="button" class="cn-chip is-' + review(it) + '" data-ctitem="' + esc(it.id) + '" title="' + esc(title(it)) + '">' + thumb(it) + mark(it, null) + qaMark(it, null) + '</button>').join('') + '</div></div>' : '';
    const empty = !mine.length && !placed.size;
    return '<section class="cn-sec cn-wk' + (next ? ' is-next' : '') + '"><div class="cn-wk-h"><div class="cn-wk-t"><h3>' + label + '</h3><p><b>' + range(w.week) + '</b>' + (w.week >= S.d.settings.startWeek ? '<span>Săpt. ' + w.n + '</span>' : '') + '</p></div>' +
      (w.pending ? '<button type="button" class="k-btn is-primary is-sm" data-ctall="' + esc(w.week) + '" data-n="' + w.pending + '">' + icon('checkCircle') + 'Aprobă toată săptămâna</button>' : '') + '</div>' +
      (tags && !(empty && !next) ? '<div class="cn-tags">' + tags + '</div>' : '') +
      (empty && !next ? '<p class="cn-wk-none">Nimic programat.</p>' : '<div class="cn-grid' + (S.d.settings.on ? '' : ' is-paused') + '">' + head + rows + '</div>') + extra + '</section>';
  }
  // the mark on a thumb: posted, error, the owner's look
  function mark(it, e) {
    if (e && e.state === 'posted') return '<em class="is-posted">' + icon('check') + '</em>';
    if (e && e.state === 'error') return '<em class="is-bad">' + icon('alert') + '</em>';
    const r = review(it);
    if (r === 'redo') return '<em class="is-redo">' + icon('undo') + '</em>';
    if (r === 'approved') return '<em class="is-ok">' + icon('check') + '</em>';
    return '<em class="is-wait"></em>';
  }
  // the texts' check on a thumb: red, it can't go; amber, something to look at (only what isn't out yet)
  function qaMark(it, e) {
    if (e && (e.state === 'posted' || e.state === 'skipped' || e.state === 'missed')) return '';
    const q = qaFor(it, e && e.net);
    return q.problems.length ? '<i class="cn-qa is-bad" aria-hidden="true">!</i>' : q.warnings.length ? '<i class="cn-qa is-warn" aria-hidden="true">!</i>' : '';
  }
  function chip(it, e) {
    const q = qaFor(it, e.net), more = e.state === 'posted' ? [] : q.problems.concat(q.warnings);
    return '<button type="button" class="cn-chip is-' + e.state + ' is-' + review(it) + '" data-ctitem="' + esc(it.id) + '" title="' + esc([NET[e.net] + ' · ' + title(it) + ' · ' + STATE[e.state]].concat(more).join('\n')) + '">' +
      thumb(it) + mark(it, e) + qaMark(it, e) + '<time>' + fTime.format(new Date(e.at)) + '</time></button>';
  }
  async function approveAll(btn) {
    const n = Number(btn.dataset.n) || 0;
    if (!(await K.ui().confirm({ title: 'Aprobi ' + pl(n, 'material', 'materiale') + '?', confirmText: 'Aprobă' }))) return;
    const r = await save({ action: 'approve_week', week: btn.dataset.ctall }, btn);
    if (r) K.ui().toast(r.approved === 1 ? 'Aprobat.' : pl(r.approved || 0, 'material aprobat', 'materiale aprobate') + '.', 'success');
  }

  // ------------------------------------------------------------------ Program: next week as a review feed
  // (the owner, 12.11: „toate videourile înșirate de aprobat, frumos, cu preview pentru fiecare canal”): every item large,
  // its video inline (muted, a tap for sound) or its photos to swipe, a phone preview per network with that network's
  // text, the text editable below (saved when it loses focus), its time, Aprobă / Refă; approved ones fold to a line.
  const firstAt = (it) => (it.plan || []).filter((e) => e.at && e.state !== 'skipped').map((e) => e.at).sort()[0] || it.createdAt || '';
  const entryOf = (it, net) => (it.plan || []).find((e) => e.net === net && e.state !== 'skipped') || null;
  const short = (iso) => { const d = roDay(iso); return dow(d) + ' ' + Number(d.slice(8, 10)) + '.' + d.slice(5, 7) + ', ' + fTime.format(new Date(iso)); };
  // the networks an item shows: the ones it is planned on (in time order), else every network of its kind
  function netsOf(it) {
    const on = (it.plan || []).filter((e) => e.state !== 'skipped' && e.at).sort((a, b) => a.at.localeCompare(b.at)).map((e) => e.net);
    const list = [...new Set(on)];
    return list.length ? list : (AS[it.kind] || []).slice();
  }
  function gallery(w) {
    if (!w) return '';
    const its = S.d.items.filter((it) => it.week === w.week && !it.removed && !it.dropped).sort((a, b) => firstAt(a).localeCompare(firstAt(b)));
    if (!its.length) return '';
    const pend = its.filter((it) => it.state === 'ready' && review(it) === 'pending').length;
    const ok = its.filter((it) => it.state === 'ready' && review(it) === 'approved').length;
    const head = '<div class="cn-rvh"><div><h3>De aprobat</h3><p><b>' + range(w.week) + '</b><span>' + pl(its.length, 'material', 'materiale') + '</span></p></div>' +
      '<div class="cn-tags">' + (pend ? '<span class="k-tag is-warn">' + pend + ' de aprobat</span>' : '') + (ok ? '<span class="k-tag is-good">' + icon('check') + pl(ok, 'aprobat', 'aprobate') + '</span>' : '') + '</div></div>';
    const bar = pend ? '<div class="cn-sticky"><div class="cn-sticky-in"><span><b>' + pend + '</b> ' + (pend === 1 ? 'material așteaptă' : 'materiale așteaptă') + '</span>' +
      '<button type="button" class="k-btn is-primary" data-ctall="' + esc(w.week) + '" data-n="' + pend + '">' + icon('checkCircle') + 'Aprobă toată săptămâna (' + pend + ')</button></div></div>' : '';
    // the ones to look at as cards (an approved one opened again stays with them), the rest as lines below
    const big = (it) => it.state === 'ready' && (review(it) === 'pending' || (review(it) === 'approved' && S.open[it.id]));
    const cards = its.filter(big), lines = its.filter((it) => !big(it));
    return '<section class="cn-sec cn-rvs">' + head + (cards.length ? '<div class="cn-rcs">' + cards.map(card).join('') + '</div>' : '') +
      (lines.length ? '<div class="cn-rcl">' + lines.map(card).join('') + '</div>' : '') + bar + '</section>';
  }
  function card(it) {
    const r = review(it), id = esc(it.id);
    // being made again, sent back, or approved (folded): one line
    if (it.state !== 'ready' || r === 'redo' || (r === 'approved' && !S.open[it.id])) {
      const tag = it.state !== 'ready' ? '<span class="k-tag">' + icon('refresh') + 'Se reface</span>' : r === 'redo' ? '<span class="k-tag is-bad">' + icon('undo') + 'De refăcut</span>' : '<span class="k-tag is-good">' + icon('check') + 'Aprobat</span>';
      const times = netsOf(it).map((n) => { const e = entryOf(it, n); return e ? '<span class="cn-rc-tm">' + badge(n) + fTime.format(new Date(e.at)) + '</span>' : ''; }).join('');
      const note = r === 'redo' && it.redoNote ? '<em>' + esc(it.redoNote) + '</em>' : '';
      const act = r === 'approved' && it.state === 'ready' ? 'data-ctrc-open="' + id + '"' : 'data-ctitem="' + id + '"';
      return '<div class="cn-rc is-slim is-' + r + '" data-ctrcid="' + id + '"><button type="button" class="cn-rc-sl" ' + act + '>' + thumb(it) + '<span class="cn-main"><b>' + esc(title(it)) + '</b><small>' + times + '</small>' + note + '</span>' + tag + icon(r === 'approved' ? 'down' : 'right') + '</button></div>';
    }
    const nets = netsOf(it), sel = nets.includes(S.sel[it.id]) ? S.sel[it.id] : nets[0];
    const meta = [KIND[it.kind], it.rubric, it.keyword ? '„' + it.keyword + '”' : ''].filter(Boolean).join(' · ');
    const q = qaOf(it);
    const head = '<header class="cn-rc-h"><div class="cn-main"><small>' + esc(meta) + '</small><b>' + esc(title(it)) + '</b>' + (it.hook ? '<em>„' + esc(it.hook) + '”</em>' : '') + '</div>' +
      (r === 'approved' ? '<button type="button" class="k-icon-btn" data-ctrc-open="' + id + '" aria-label="Restrânge">' + icon('up') + '</button>' : '<span class="k-tag is-warn">De aprobat</span>') + '</header>';
    const flags = (it.replacedAt && r === 'pending' ? '<p class="cn-rc-f">' + icon('refresh') + '<span>Refăcut' + (it.redoNote ? ': ' + esc(it.redoNote) : '') + '</span></p>' : '') +
      (q.problems.length ? '<p class="cn-rc-f is-bad">' + icon('alert') + '<span>' + esc(q.problems[0]) + (q.problems.length > 1 ? ' (+' + (q.problems.length - 1) + ')' : '') + '</span></p>' : '');
    const acts = '<div class="cn-rc-a">' + (r === 'approved' ? '<button type="button" class="k-btn is-ghost" data-ctitem="' + id + '">' + icon('more') + 'Detalii</button>' : '') +
      '<button type="button" class="k-btn is-outline is-lg" data-ctrc-redo>' + icon('undo') + 'Refă</button>' +
      (r !== 'approved' ? '<button type="button" class="k-btn is-primary is-lg" data-ctrc-ok>' + icon('check') + 'Aprobă</button>' : '') + '</div>';
    return '<article class="cn-rc is-' + r + '" data-ctrcid="' + id + '">' + head + flags + '<div class="cn-rc-v">' + media(it) + '<div class="cn-phs">' + nets.map((n) => mock(it, n, n === sel)).join('') + '</div></div>' +
      editor(it, sel) + acts + '</article>';
  }
  // the video (loaded when it comes near, playing while it is in view, muted until a tap) or the photos to swipe
  function media(it) {
    const files = (it.files || []).slice().sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }));
    const vid = files.find((f) => f.mime === 'video/mp4');
    const open = '<button type="button" class="cn-rc-x" data-ctitem="' + esc(it.id) + '" aria-label="Deschide">' + icon('more') + '</button>';
    if (vid) {
      return '<div class="cn-rc-m"><video data-ctvid data-src="' + esc(fileUrl(it, vid.name)) + '"' + (it.cover ? ' poster="' + esc(cover(it)) + '"' : '') + ' muted playsinline loop preload="none"></video>' +
        '<span class="cn-snd" aria-hidden="true">' + SPK.off + '</span>' + (vid.dur ? '<span class="cn-dur">' + Math.round(vid.dur) + ' s</span>' : '') + open + '</div>';
    }
    const imgs = files.filter((f) => /^image\//.test(f.mime));
    return '<div class="cn-rc-m is-car"><div class="cn-car" data-ctcar>' + imgs.map((f) => '<img src="' + esc(fileUrl(it, f.name)) + '" alt="" loading="lazy" decoding="async">').join('') + '</div>' +
      (imgs.length > 1 ? '<span class="cn-dur" data-ctcarn>1/' + imgs.length + '</span>' : '') + open + '</div>';
  }
  // the little marks of the phones (drawn here: the kit has no heart or bookmark)
  const MI = {
    heart: '<path d="M12 20.5s-7.5-4.6-7.5-10.1A4.2 4.2 0 0 1 12 7.6a4.2 4.2 0 0 1 7.5 2.8c0 5.5-7.5 10.1-7.5 10.1z"/>',
    bubble: '<path d="M20 11.5a8 8 0 0 1-11.6 7.1L4 20l1.4-4.1A8 8 0 1 1 20 11.5z"/>',
    send: '<path d="M21 3 10 14M21 3l-7 18-4-7-7-4z"/>',
    mark: '<path d="M6 3.5h12v17l-6-4-6 4z"/>',
    share: '<path d="M14 5l7 6.5-7 6.5v-4c-5 0-8.5 1.5-11 5 1-5 4-10 11-10.5z"/>',
    thumb: '<path d="M7 10v10H4V10zM7 10l4-7c1.6 0 2.6 1.3 2.2 2.8L12.6 9H19a2 2 0 0 1 2 2.3l-1.2 6.6A2.4 2.4 0 0 1 17.4 20H7"/>',
    down: '<path d="M17 14V4h3v10zM17 14l-4 7c-1.6 0-2.6-1.3-2.2-2.8l.6-3.2H5a2 2 0 0 1-2-2.3l1.2-6.6A2.4 2.4 0 0 1 6.6 4H17"/>',
    note: '<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
    more: '<circle cx="12" cy="5" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="12" cy="19" r="1.4"/>',
    cam: '<path d="M3 8h3.5L8 5.5h8L17.5 8H21v11H3z"/><circle cx="12" cy="13" r="3.5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
  };
  const mi = (n) => '<svg viewBox="0 0 24 24" aria-hidden="true">' + MI[n] + '</svg>';
  const SPK = {
    off: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M17 9l4 6M21 9l-4 6"/></svg>',
    on: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/></svg>',
  };
  const capOf = (it, net) => String((it.captions && it.captions[net]) || it.caption || '');
  const handle = (net) => { const a = S.d.access || {}; return net === 'ig' ? (a.igUser || 'centrul360') : net === 'tt' ? ((a.tt && a.tt.name) || 'centrul360') : net === 'yt' ? ((a.yt && a.yt.channel) || 'Centrul360') : 'Centrul360'; };
  // a phone with the post as that network shows it: the picture, the network's marks, the account, the text
  function mock(it, net, sel) {
    const e = entryOf(it, net), photoK = photo(it);
    const img = photoK ? (((it.files || []).filter((f) => /^image\//.test(f.mime)).sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }))[0] || {}).name || '') : it.cover;
    const src = img ? fileUrl(it, img) : '';
    const cap = capOf(it, net).replace(/\s+/g, ' ').trim();
    const ytTitle = (capOf(it, 'yt').split('\n').find((l) => l.trim()) || title(it)).replace(/#shorts\b/ig, '').trim();
    const side = (list) => '<span class="cn-ph-side">' + list.map(([n, c]) => '<i>' + mi(n) + (c != null ? '<small>' + c + '</small>' : '') + '</i>').join('') + '</span>';
    let top = '', ov = '', bot = '';
    if (net === 'tt') {
      top = '<span class="cn-ph-top">Urmăriți · <b>Pentru tine</b></span>';
      ov = side([['heart', '0'], ['bubble', '0'], ['mark', '0'], ['share', '0']]);
      bot = '<b>@' + esc(handle('tt')) + '</b><p>' + esc(cap) + '</p><small>' + mi('note') + 'sunet original</small>';
    } else if (net === 'ig') {
      top = photoK ? '' : '<span class="cn-ph-top"><b>Reels</b>' + mi('cam') + '</span>';
      ov = photoK ? '' : side([['heart', '0'], ['bubble', '0'], ['send', null], ['more', null]]);
      bot = '<span class="cn-ph-who"><i class="cn-ph-av"></i><b>' + esc(handle('ig')) + '</b></span><p>' + esc(cap) + '</p>' + (photoK ? '' : '<small>' + mi('note') + 'Audio original</small>');
    } else if (net === 'fb') {
      top = photoK ? '' : '<span class="cn-ph-top"><b>Reels</b>' + mi('plus') + '</span>';
      ov = photoK ? '' : side([['thumb', '0'], ['bubble', '0'], ['share', '0'], ['more', null]]);
      bot = '<span class="cn-ph-who"><i class="cn-ph-av"></i><b>' + esc(handle('fb')) + '</b></span><p>' + esc(cap) + '</p>';
    } else {
      top = '<span class="cn-ph-top"><b>Shorts</b></span>';
      ov = side([['thumb', '0'], ['down', null], ['bubble', '0'], ['share', null]]);
      bot = '<p class="cn-ph-yt">' + esc(ytTitle) + ' <span>#shorts</span></p><span class="cn-ph-who"><i class="cn-ph-av"></i><b>@' + esc(handle('yt').replace(/\s+/g, '').toLowerCase()) + '</b></span>';
    }
    const q = qaFor(it, net), mark = e && e.state === 'posted' ? '' : q.problems.length ? '<i class="cn-qa is-bad">!</i>' : q.warnings.length ? '<i class="cn-qa is-warn">!</i>' : '';
    const when = e ? (e.state === 'posted' ? 'Postat' : dow(roDay(e.at)) + ' ' + fTime.format(new Date(e.at))) : 'Neprogramat';
    const feed = photoK && (net === 'ig' || net === 'fb');
    return '<button type="button" class="cn-ph is-' + net + (sel ? ' is-sel' : '') + (feed ? ' is-feed' : '') + '" data-ctph="' + net + '" aria-label="' + NET[net] + '" aria-pressed="' + (sel ? 'true' : 'false') + '">' +
      '<span class="cn-ph-s">' + (src ? '<img src="' + esc(src) + '" alt="" loading="lazy" decoding="async">' : '') + top + ov + '<span class="cn-ph-bot">' + bot + '</span>' + mark + '</span>' +
      '<span class="cn-ph-l">' + badge(net) + '<time>' + esc(when) + '</time></span></button>';
  }
  // the chosen network's text, editable (saved when it loses focus), its time, its checks
  function editor(it, net) {
    const e = entryOf(it, net), v = capOf(it, net), q = qaFor(it, net), posted = e && e.state === 'posted';
    const list = q.problems.map((x) => '<li class="is-bad">' + icon('alert') + '<span>' + esc(x.replace(NET[net] + ': ', '')) + '</span></li>').join('') +
      q.warnings.map((x) => '<li class="is-warn">' + icon('info') + '<span>' + esc(x.replace(NET[net] + ': ', '')) + '</span></li>').join('');
    return '<div class="cn-rc-e"><div class="cn-rc-eh">' + badge(net) + '<b>Text ' + NET[net] + '</b>' + (e ? '<span class="cn-when">' + icon('clock') + esc(when(e.at)) + '</span>' : '<span class="cn-when is-off">Neprogramat</span>') +
      '<small data-ctrc-n>' + v.length + '/' + CAP_MAX[net] + '</small></div>' +
      '<textarea data-ctrc-cap="' + net + '" maxlength="' + CAP_MAX[net] + '" rows="3" aria-label="Textul pentru ' + NET[net] + '"' + (posted ? ' readonly' : '') + '>' + esc(v) + '</textarea>' +
      (list && !posted ? '<ul class="cn-qal">' + list + '</ul>' : '') + '</div>';
  }
  // one card again (a network chosen, a text saved, opened or folded), the rest of the page as it is
  function refreshCard(id) {
    const el = panel && panel.querySelector('[data-ctrcid="' + (window.CSS && CSS.escape ? CSS.escape(id) : id) + '"]');
    const it = S.d.items.find((x) => x.id === id);
    if (!el || !it) return;
    const v = el.querySelector('video'); if (v) { v.pause(); v.removeAttribute('src'); v.load(); }
    const tmp = document.createElement('div'); tmp.innerHTML = card(it);
    const fresh = tmp.firstElementChild;
    el.replaceWith(fresh);
    wireMedia(fresh);
  }
  async function saveCaption(id, net, text) {
    try {
      const r = await K.api('/api/portal-content', { action: 'captions', id, captions: { [net]: text } });
      S.d = r;
      K.ui().toast('Text salvat pentru ' + NET[net] + '.', 'success');
      // the card's previews and checks follow; a text being typed elsewhere keeps its focus
      const el = panel.querySelector('[data-ctrcid="' + id + '"]');
      if (el && !el.contains(document.activeElement)) refreshCard(id);
      else if (el) { const it = S.d.items.find((x) => x.id === id); const ph = el.querySelector('[data-ctph="' + net + '"]'); if (it && ph) { const t = document.createElement('div'); t.innerHTML = mock(it, net, true); ph.replaceWith(t.firstElementChild); } }
    } catch (err) { K.ui().toast(K.errText(err, 'Nu am putut salva textul.'), 'error'); }
  }
  async function redoItem(id, btn) {
    const note = await K.ui().prompt({ title: 'Ce refacem?', multiline: true, value: '', confirmText: 'Trimite la refăcut' });
    if (note == null) return;
    if (note.trim().length < 2) { K.ui().toast('Scrie pe scurt ce refacem.', 'error'); return; }
    if (await save({ action: 'redo', id, note: note.trim() }, btn)) K.ui().toast('Trimis la refăcut.', 'success');
  }
  // the videos: loaded when near, playing while in view (not with reduced motion), muted until a tap
  let ioLoad = null, ioPlay = null;
  const still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function wireMedia(root) {
    const vids = root.querySelectorAll('video[data-ctvid]');
    if (!vids.length) return;
    if (!('IntersectionObserver' in window)) { vids.forEach((v) => { if (v.dataset.src) { v.src = v.dataset.src; v.removeAttribute('data-src'); } }); return; }
    if (!ioLoad) ioLoad = new IntersectionObserver((list) => list.forEach((x) => { const v = x.target; if (x.isIntersecting && v.dataset.src) { v.preload = 'metadata'; v.src = v.dataset.src; v.removeAttribute('data-src'); ioLoad.unobserve(v); } }), { rootMargin: '300px 0px' });
    if (!ioPlay) ioPlay = new IntersectionObserver((list) => list.forEach((x) => {
      const v = x.target;
      if (x.isIntersecting && x.intersectionRatio >= 0.6) { if (!still && !v.dataset.src) v.play().catch(() => {}); }
      else if (!v.paused) v.pause();
    }), { threshold: [0, 0.6] });
    vids.forEach((v) => { ioLoad.observe(v); ioPlay.observe(v); });
  }
  function stopMedia() {
    if (ioLoad) ioLoad.disconnect();
    if (ioPlay) ioPlay.disconnect();
    if (panel) panel.querySelectorAll('video[data-ctvid]').forEach((v) => { try { v.pause(); } catch (e) { /* gone */ } });
  }
  // a tap: sound on (the others muted) or off; a paused one plays
  function sound(v) {
    if (v.dataset.src) { v.src = v.dataset.src; v.removeAttribute('data-src'); }
    const on = v.muted;
    panel.querySelectorAll('video[data-ctvid]').forEach((o) => { if (o !== v && !o.muted) { o.muted = true; const ic = o.parentElement.querySelector('.cn-snd'); if (ic) ic.innerHTML = SPK.off; } });
    v.muted = !on;
    const ic = v.parentElement.querySelector('.cn-snd'); if (ic) { ic.innerHTML = on ? SPK.on : SPK.off; ic.classList.toggle('is-on', on); }
    if (v.paused) v.play().catch(() => {});
  }

  // ------------------------------------------------------------------ the owner's ideas for the next weeks
  function ideasBox() {
    const list = S.d.ideas || [], fresh = list.filter((d) => d.state !== 'used').length;
    const rub = '<option value="">Orice rubrică</option>' + (S.d.rubrics || []).map((r) => '<option value="' + esc(r) + '">' + esc(r) + '</option>').join('');
    const row = (d) => {
      const used = d.state === 'used', made = used && d.itemId && S.d.items.some((x) => x.id === d.itemId);
      const state = used ? (made ? '<button type="button" class="k-tag is-good cn-id-s" data-ctitem="' + esc(d.itemId) + '">' + icon('check') + 'Folosită</button>' : '<span class="k-tag is-good cn-id-s">' + icon('check') + 'Folosită</span>')
        : '<span class="k-tag is-accent cn-id-s">Nouă</span>';
      return '<li class="cn-id' + (used ? ' is-used' : '') + '"><div class="cn-id-t"><p>' + esc(d.text) + '</p>' + (d.rubric ? '<small>' + esc(d.rubric) + '</small>' : '') + '</div>' + state +
        (used ? '' : '<button type="button" class="k-icon-btn cn-id-x" data-ctidel="' + esc(d.id) + '" aria-label="Șterge ideea">' + icon('x') + '</button>') + '</li>';
    };
    return '<section class="cn-sec cn-ideas"><div class="cn-ideas-h"><h3>Idei pentru săptămânile următoare</h3>' + (fresh ? '<span class="k-tag is-accent">' + fresh + (fresh === 1 ? ' nouă' : ' noi') + '</span>' : '') + '</div>' +
      '<div class="cn-ideas-b"><form class="cn-idf" data-ctidea autocomplete="off"><input type="text" name="text" maxlength="400" placeholder="O idee de reel" aria-label="Ideea">' +
      '<select name="rubric" aria-label="Rubrica">' + rub + '</select><button type="submit" class="k-btn is-primary">' + icon('plus') + 'Adaugă</button></form>' +
      (list.length ? '<ul class="cn-idl">' + list.map(row).join('') + '</ul>' : '') + '</div></section>';
  }

  // ------------------------------------------------------------------ the rest of the page
  function statLine(s) {
    if (!s) return '';
    const x = (ic, n, label) => (n != null ? '<span title="' + label + '">' + icon(ic) + k(n) + '</span>' : '');
    return '<span class="cn-stats">' + x('eye', s.views, 'Vizualizări') + x('star', s.likes, 'Aprecieri') + x('chat', s.comments, 'Comentarii') + x('book', s.saves, 'Salvări') + x('share', s.shares, 'Distribuiri') + '</span>';
  }
  function row(it, e, extra) {
    return '<button type="button" class="cn-row" data-ctitem="' + esc(it.id) + '">' + thumb(it) + '<span class="cn-main"><b>' + (it.hot ? '<i class="cn-fl">🔥</i>' : '') + esc(title(it)) + '</b><small>' + badge(e.net) + esc(when(e.postedAt || e.at)) + '</small>' + (extra || '') + '</span>' +
      (e.state === 'posted' ? statLine((it.stats || {})[e.net]) : '<span class="k-tag ' + TONE[e.state] + '">' + STATE[e.state] + '</span>') + icon('right') + '</button>';
  }
  function errors() {
    const bad = entries().filter(({ it, e }) => e.state === 'error' || (e.hold && e.state === 'planned' && review(it) === 'approved')).sort((a, b) => b.e.at.localeCompare(a.e.at)).slice(0, 6);
    if (!bad.length) return '';
    return '<section class="cn-sec"><h3>De văzut</h3><div class="cn-list">' + bad.map(({ it, e }) => row(it, e, '<em class="cn-err' + (e.state === 'error' ? '' : ' is-warn') + '">' + esc(e.error || e.hold) + '</em>')).join('') + '</div></section>';
  }
  function last() {
    const done = entries().filter(({ e }) => e.state === 'posted').sort((a, b) => (b.e.postedAt || b.e.at).localeCompare(a.e.postedAt || a.e.at)).slice(0, 10);
    return '<section class="cn-sec"><h3>Postate</h3>' + (done.length ? '<div class="cn-list">' + done.map(({ it, e }) => row(it, e)).join('') + '</div>' : K.empty('video', 'Nimic postat încă', '')) + '</section>';
  }

  // ------------------------------------------------------------------ Rezultate
  const ORDER = ['ig', 'fb', 'tt', 'yt'];
  const COLOR = { ig: '#dd2a7b', fb: '#1877f2', tt: '#25c2c9', yt: '#ff0033' };
  const full = (n) => Number(n || 0).toLocaleString('ro-RO');
  const coverUrl = (x) => (x && x.cover ? '/api/content-file?i=' + encodeURIComponent(x.id) + '&n=' + encodeURIComponent(x.cover.n) + (x.cover.v ? '&v=' + encodeURIComponent(x.cover.v) : '') : '');
  const cov = (x) => '<span class="cn-th' + (x.kind === 'carousel' || x.kind === 'slideshow' ? ' is-photo' : '') + '">' + (coverUrl(x) ? '<img src="' + esc(coverUrl(x)) + '" alt="" loading="lazy">' : icon('video')) + '</span>';
  const known = (id) => !!(S.d && S.d.items.some((y) => y.id === id));
  const chipX = (v) => '<span class="cn-x ' + tone(v) + '">' + x1(v) + '</span>';
  const pct = (v) => (v == null ? '-' : (Math.round(v * 10) / 10).toLocaleString('ro-RO') + '%');
  const n1 = (v) => (v == null ? '-' : (Math.round(v * 10) / 10).toLocaleString('ro-RO'));
  const lei = (v) => full(Math.round(v || 0)) + ' lei';
  // the dashboard: the key numbers first, then the blocks in the owner's order; side by side on a wide screen
  function resTab() {
    const R = S.r;
    if (!R) return S.rErr ? K.empty('alert', 'Nu am putut încărca rezultatele', esc(S.rErr)) : '<div class="k-skel" style="height:420px"></div>';
    const L = R.learn || {};
    const any = Object.keys(R.followers || {}).length || (R.last30 && R.last30.total.posts) || (R.month && R.month.total.posts) || R.audience || (R.analysis || []).length || (R.goals && R.goals.set);
    if (!any) return K.empty('trend', 'Rezultatele apar după primele postări', '', '<button type="button" class="k-btn is-outline" data-ctgoals>' + icon('target') + 'Setează ținte lunare</button>');
    const w = (cls, html) => (html ? '<div class="cn-dw ' + cls + '">' + html + '</div>' : '');
    const an = analysisBlock(R), gl = goalsBlock(R);
    const au = audienceBlock(R), hr = hoursBlock(R, L);
    const vo = voiceBlock(R), mo = monthCard(R);
    return kpis(R) + '<div class="cn-dash">' +
      w(an && gl ? 'is-w7' : 'is-w12', an) + w(an && gl ? 'is-w5' : 'is-w12', gl) +
      w('is-w12', netCards(R)) + w('is-w12', funnelBlock(R)) + w('is-w12', hotBlock(R)) + w('is-w12', moreLike(L)) + w('is-w12', topTen(R)) + w('is-w12', ranks(L)) +
      w('is-w12', au) + w('is-w12', hr) + w(vo && mo ? 'is-w7' : 'is-w12', vo) + w(vo && mo ? 'is-w5' : 'is-w12', mo) + '</div>';
  }
  function kpis(R) {
    const x = R.kpi || {}, t = R.last30.total;
    const tile = (ic, label, v, sub, cls) => '<div class="k-stat ' + (cls || '') + '"><div class="k-stat-top"><span class="k-stat-ic">' + icon(ic) + '</span>' + label + '</div><div class="k-stat-value">' + v + '</div>' + (sub ? '<div class="k-stat-sub">' + sub + '</div>' : '') + '</div>';
    const fol = x.followers30;
    return '<section class="cn-sec"><div class="cn-kpis">' +
      tile('eye', 'Vizualizări', k(x.views30 != null ? x.views30 : t.views), '30 de zile · ' + pl(x.posts30 != null ? x.posts30 : t.posts, 'postare', 'postări'), 'is-accent') +
      tile('users', 'Urmăritori noi', fol == null ? '-' : signed(fol), '30 de zile', fol > 0 ? 'is-good' : '') +
      tile('userPlus', 'Leaduri organice', full(x.leadsMonth || 0), 'luna asta' + (x.clientsMonth ? ' · ' + pl(x.clientsMonth, 'clientă', 'cliente') : '')) +
      tile('wallet', 'Încasări organice', lei(x.revenueMonth), 'luna asta', x.revenueMonth > 0 ? 'is-good' : '') +
      tile('zap', 'Engagement', pct(x.er30), '30 de zile') +
      tile('clock', 'Vizionare medie', pct(x.watch30), x.hook30 != null ? pct(x.hook30) + ' rămân după 3 s' : '30 de zile') + '</div></section>';
  }
  // Analiza săptămânii: the latest, the older ones in the list
  function analysisBlock(R) {
    const list = R.analysis || [];
    if (!list.length) return '';
    const a = list.find((x) => x.week === S.an) || list[0];
    const opts = list.length > 1 ? '<select class="cn-an-sel" data-ctan aria-label="Săptămâna">' + list.map((x) => '<option value="' + esc(x.week) + '"' + (x === a ? ' selected' : '') + '>' + esc(x.label || range(x.week)) + '</option>').join('') + '</select>' : '<span class="k-tag">' + esc(a.label || range(a.week)) + '</span>';
    const ul = (arr, cls) => (arr && arr.length ? '<ul class="cn-an-l ' + cls + '">' + arr.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul>' : '');
    return '<section class="cn-sec"><div class="cn-sh"><h3>Analiza săptămânii</h3>' + opts + '</div><div class="cn-an"><div class="cn-an-h"><span class="cn-an-ic">' + icon('sparkles') + '</span><p>' + esc(a.summary || '') + '</p></div>' +
      '<div class="cn-an-g"><div class="cn-an-c is-good"><h4>' + icon('check') + 'Ce a mers și de ce</h4>' + ul(a.worked, '') + '</div><div class="cn-an-c is-bad"><h4>' + icon('alert') + 'Ce n-a mers</h4>' + ul(a.notWorked, '') + '</div></div>' +
      '<div class="cn-an-c is-next"><h4>' + icon('arrow') + 'Ce schimbăm săptămâna viitoare</h4>' + ul(a.changes, 'is-num') + '</div></div></section>';
  }
  // Ținte: this month, the progress and the pace
  function goalsBlock(R) {
    const g = R.goals;
    if (!g) return '';
    if (!g.set) return '<section class="cn-sec"><h3>Ținte</h3><div class="cn-gl is-empty"><button type="button" class="k-btn is-outline" data-ctgoals>' + icon('target') + 'Setează ținte lunare</button></div></section>';
    const row = (x) => {
      const p = Math.min(100, x.pct), exp = Math.min(100, (x.expected / x.target) * 100);
      const tag = x.pace === 'done' ? '<span class="k-tag is-good">' + icon('check') + 'Atinsă</span>' : x.pace === 'ok' ? '<span class="k-tag is-good">În grafic</span>' : '<span class="k-tag is-bad">În urmă</span>';
      return '<li><div class="cn-gl-t">' + (x.net ? badge(x.net) : '<span class="cn-gl-ic">' + icon(x.key === 'views' ? 'eye' : 'userPlus') + '</span>') + '<b>' + esc(x.label) + '</b>' + tag + '</div>' +
        '<div class="cn-gl-b"><i class="is-' + x.pace + '" style="width:' + p.toFixed(1) + '%"></i><em style="left:' + exp.toFixed(1) + '%"></em></div>' +
        '<div class="cn-gl-n"><span><b>' + full(x.value) + '</b> din ' + full(x.target) + '</span>' + (x.projected != null && x.pace !== 'done' ? '<small>estimat ' + full(x.projected) + '</small>' : '') + '</div></li>';
    };
    return '<section class="cn-sec"><div class="cn-sh"><h3>Ținte, ' + esc(g.label) + '</h3><button type="button" class="k-icon-btn" data-ctgoals aria-label="Ținte lunare">' + icon('pen') + '</button></div><div class="cn-gl"><ul>' + g.rows.map(row).join('') + '</ul><p class="cn-gl-d">Ziua ' + g.day + ' din ' + g.days + '</p></div></section>';
  }
  // Pâlnia organică: from the comment with the word to the money; „Profil → mesaj” in the organic total
  const STEPS = [['kw', 'Comentarii cu cuvântul', 'chat'], ['dms', 'Mesaje trimise', 'inbox'], ['replies', 'Răspunsuri', 'undo'], ['leads', 'Leaduri', 'userPlus'], ['booked', 'Programări', 'calendar'], ['showed', 'Au venit', 'checkCircle'], ['clients', 'Cliente', 'star'], ['revenue', 'Încasări, lei', 'wallet']];
  function strip(m, compact) {
    let prev = null;
    return '<ol class="cn-fn' + (compact ? ' is-sm' : '') + '">' + STEPS.map(([key, label, ic]) => {
      const v = m[key] || 0, rate = prev != null && key !== 'revenue' && prev > 0 ? Math.round((v / prev) * 100) : null;
      prev = key === 'revenue' ? prev : v;
      return '<li class="' + (v ? '' : 'is-zero') + '"><span class="cn-fn-ic">' + icon(ic) + '</span><b>' + full(Math.round(v)) + '</b><small>' + label + '</small>' + (rate != null ? '<em>' + rate + '%</em>' : '') + '</li>';
    }).join('') + '</ol>';
  }
  function funnelBlock(R) {
    const F = R.funnel;
    if (!F || !F.month) return '';
    const m = S.fm === 'prev' && F.prev ? F.prev : F.month;
    const t = m.total || {}, p = m.profil || {};
    const tot = '<div class="cn-fn-t"><span class="cn-fn-tl"><b>Organic total</b><small>cu cele venite din profil în mesaje</small></span>' +
      [['leads', 'leaduri'], ['booked', 'programări'], ['showed', 'au venit'], ['clients', 'cliente']].map(([k2, l]) => '<span><b>' + full(t[k2] || 0) + '</b>' + l + (p[k2] ? '<small>' + full(p[k2]) + ' din profil</small>' : '') + '</span>').join('') +
      '<span class="is-money"><b>' + lei(t.revenue) + '</b>încasări</span></div>';
    return '<section class="cn-sec"><div class="cn-sh"><h3>Pâlnia organică</h3>' + K.seg('ctfm', [['month', 'Luna asta'], ['prev', 'Luna trecută']], S.fm, 'cn-seg-sm') + '</div><div class="cn-fnw">' + strip(m) + tot + '</div></section>';
  }
  // Merge tare 🔥: the posts far above the usual in their first day, an ad one tap away
  function hotBlock(R) {
    const list = R.hot || [];
    if (!list.length) return '';
    return '<section class="cn-sec"><h3>Merge tare 🔥</h3><div class="cn-hot">' + list.map((x) => {
      const net = x.nets.includes(x.net) ? x.net : x.nets[0];
      const done = net && x.boosted.includes(net);
      const btn = !net ? '' : done ? '<button type="button" class="k-btn is-ghost is-sm" data-ctitem="' + esc(x.id) + '">' + icon('zap') + 'Reclamă făcută</button>'
        : known(x.id) ? '<button type="button" class="k-btn is-primary is-sm" data-cthboost="' + esc(x.id) + '" data-net="' + net + '">' + icon('zap') + 'Fă reclamă din asta</button>' : '';
      const inner = cov(x) + '<span class="cn-main"><b>' + esc(x.topic || x.rubric) + '</b><small>' + badge(x.net) + k(x.views) + ' vizualizări în ' + (x.h < 1.5 ? 'prima oră' : pl(Math.round(x.h), 'oră', 'ore')) + '</small></span><span class="cn-x is-good">' + x1(x.x) + '</span>';
      return '<div class="cn-hotc">' + (known(x.id) ? '<button type="button" class="cn-hotb" data-ctitem="' + esc(x.id) + '">' + inner + '</button>' : '<div class="cn-hotb">' + inner + '</div>') + btn + '</div>';
    }).join('') + '</div></section>';
  }
  // Publicul: age and gender, the cities, when the followers are online
  const DAYS7 = [[1, 'Lu'], [2, 'Ma'], [3, 'Mi'], [4, 'Jo'], [5, 'Vi'], [6, 'Sâ'], [0, 'Du']];
  function audienceBlock(R) {
    const A = R.audience;
    if (!A) return '';
    const cards = [];
    if (A.ages && A.ages.length) {
      const max = Math.max(...A.ages.map((a) => a.p));
      const g = A.gender ? '<div class="cn-au-g"><span class="cn-au-gb"><i class="is-f" style="width:' + A.gender.F + '%"></i><i class="is-m" style="width:' + A.gender.M + '%"></i></span><span class="cn-au-gl"><b class="is-f">' + pct(A.gender.F) + '</b> femei<b class="is-m">' + pct(A.gender.M) + '</b> bărbați</span></div>' : '';
      cards.push('<div class="cn-au"><h4>Vârstă și gen</h4>' + g + '<ul class="cn-au-a">' + A.ages.map((a) => '<li><span>' + esc(a.k) + '</span><span class="cn-au-b" style="--w:' + ((a.p / max) * 100).toFixed(1) + '%"><i class="is-f" style="flex:' + a.F + '"></i><i class="is-m" style="flex:' + (a.M + a.U) + '"></i></span><b>' + pct(a.p) + '</b></li>').join('') + '</ul></div>');
    }
    if (A.cities && A.cities.length) {
      const max = A.cities[0].p || 1;
      cards.push('<div class="cn-au"><h4>Orașe</h4><ul class="cn-au-c">' + A.cities.map((c) => '<li><span>' + esc(c.name) + '</span><span class="cn-au-b" style="--w:' + ((c.p / max) * 100).toFixed(1) + '%"><i class="is-a"></i></span><b>' + pct(c.p) + '</b></li>').join('') + '</ul></div>');
    }
    if (A.online) {
      const cell = (v) => (v == null ? '<i class="is-none"></i>' : '<i style="--v:' + v + '"' + (v >= 0.75 ? ' class="is-hot"' : '') + '></i>');
      cards.push('<div class="cn-au is-on"><h4>Când sunt online</h4>' + (A.online.best && A.online.best.length ? '<p class="cn-au-best">' + icon('clock') + A.online.best.map((x) => '<b>' + esc(x) + '</b>').join('') + '</p>' : '') +
        '<div class="cn-au-hm">' + DAYS7.map(([d, l]) => '<span class="cn-au-d">' + l + '</span><span class="cn-au-r">' + A.online.grid[d].map(cell).join('') + '</span>').join('') +
        '<span></span><span class="cn-au-x"><small>0</small><small>6</small><small>12</small><small>18</small><small>23</small></span></div></div>');
    }
    const d = A.d30 || {};
    const mini = [['ig', 'reach', 'Conturi atinse'], ['ig', 'profileViews', 'Vizite pe profil'], ['ig', 'websiteClicks', 'Atingeri pe link'], ['ig', 'engaged', 'Conturi implicate'], ['fb', 'reach', 'Atinși pe pagină'], ['fb', 'follows', 'Urmăritori noi pe pagină']]
      .filter(([n, key]) => d[n] && d[n][key] != null).map(([n, key, l]) => '<span>' + badge(n) + '<b>' + k(d[n][key]) + '</b><small>' + l + '</small></span>').join('');
    if (!cards.length && !mini) return '';
    return '<section class="cn-sec"><h3>Publicul</h3>' + (mini ? '<div class="cn-au-m">' + mini + '<em>30 de zile</em></div>' : '') + '<div class="cn-aus">' + cards.join('') + '</div></section>';
  }
  // Ore recomandate: per network now → recommended, one tap saves them; under it, how our slots did
  const WHY = { ambele: 'postările noastre + online', online: 'urmăritorii online', postari: 'postările noastre' };
  function hoursBlock(R, L) {
    const rec = R.hoursRec || {};
    const nets = ORDER.filter((n) => rec[n]);
    const change = nets.some((n) => !rec[n].same);
    const cards = nets.map((n) => {
      const x = rec[n];
      return '<div class="cn-hr' + (x.same ? ' is-same' : '') + '"><div class="cn-hr-h">' + badge(n) + '<b>' + NET[n] + '</b><small>' + esc(WHY[x.why] || '') + '</small></div>' +
        '<div class="cn-hr-t"><span class="cn-hr-now">' + x.now.map((t) => '<i>' + esc(t) + '</i>').join('') + '</span>' + (x.same ? '<span class="k-tag is-good">' + icon('check') + 'Deja</span>' : icon('arrow') + '<span class="cn-hr-rec">' + x.rec.map((t) => '<b>' + esc(t) + '</b>').join('') + '</span>') + '</div></div>';
    }).join('');
    const heat = hours(L);
    if (!cards && !heat) return '';
    return '<section class="cn-sec"><div class="cn-sh"><h3>Ore recomandate</h3>' + (change ? '<button type="button" class="k-btn is-primary is-sm" data-ctapply>' + icon('clock') + 'Folosește orele recomandate</button>' : '') + '</div>' +
      (cards ? '<div class="cn-hrs">' + cards + '</div>' : '') + heat + '</section>';
  }
  async function applyHours(btn) {
    if (!(await K.ui().confirm({ title: 'Folosești orele recomandate?', message: 'Postările încă neaprobate trec pe orele noi.', confirmText: 'Folosește' }))) return;
    const r = await save({ action: 'apply_hours' }, btn, true);
    if (!r) return;
    const n = Object.keys(r.applied || {}).length;
    K.ui().toast(n ? 'Ore noi pe ' + pl(n, 'rețea', 'rețele') + '.' : 'Orele erau deja acestea.', 'success');
    loadResults(true);
  }
  // Ce spun oamenii: the summary, the sentiment, the themes, the questions (made ideas), the objections
  function voiceBlock(R) {
    const v = R.voice;
    if (!v || v.few || !(v.themes || v.questions)) return '';
    const sn = v.sentiment;
    const bar = sn ? '<div class="cn-vo-s"><span class="cn-vo-sb"><i class="is-pos" style="width:' + sn.pos + '%"></i><i class="is-neu" style="width:' + sn.neu + '%"></i><i class="is-neg" style="width:' + sn.neg + '%"></i></span>' +
      '<span class="cn-vo-sl"><b class="is-pos">' + sn.pos + '%</b> pozitive<b class="is-neu">' + sn.neu + '%</b> neutre<b class="is-neg">' + sn.neg + '%</b> negative</span></div>' : '';
    const col = (h, arr, f) => (arr && arr.length ? '<div class="cn-vo-c"><h4>' + h + '</h4><ul>' + arr.map(f).join('') + '</ul></div>' : '');
    const cnt = (n) => '<i class="cn-vo-n">' + n + '</i>';
    return '<section class="cn-sec"><h3>Ce spun oamenii</h3><div class="cn-vo">' + (v.summary ? '<p class="cn-vo-sum">„' + esc(v.summary) + '”</p>' : '') + bar + '<div class="cn-vo-g">' +
      col('Teme', v.themes, (x) => '<li>' + cnt(x.n) + '<span>' + esc(x.t) + '</span></li>') +
      col('Întrebări', v.questions, (x) => '<li>' + cnt(x.n) + '<span>' + esc(x.q) + (x.added ? '<em class="k-tag is-accent">' + icon('sparkles') + 'Idee nouă</em>' : '') + '</span></li>') +
      col('Obiecții', v.objections, (x) => '<li>' + cnt(x.n) + '<span>' + esc(x.o) + '</span></li>') + '</div>' +
      '<p class="cn-vo-f">' + pl(v.n || 0, 'comentariu', 'comentarii') + ', ultimele 30 de zile · ' + esc(dm(roDay(v.at))) + '</p></div></section>';
  }
  function netCards(R) {
    const fol = R.followers || {}, per = (R.last30 && R.last30.per) || {}, on = (S.d && S.d.settings.nets) || {};
    const nets = ORDER.filter((n) => fol[n] || per[n] || on[n]);
    if (!nets.length) return '';
    const delta = (v, label) => (v == null ? '' : '<span class="cn-dl' + (v > 0 ? ' is-up' : v < 0 ? ' is-down' : '') + '">' + signed(v) + '<small>' + label + '</small></span>');
    const mini = (ic, v, label) => '<span title="' + label + '">' + icon(ic) + '<b>' + k(v) + '</b></span>';
    return '<section class="cn-sec"><h3>Pe rețele</h3><div class="cn-nets">' + nets.map((n) => {
      const f = fol[n], p = per[n] || { posts: 0, views: 0, saves: 0, shares: 0, comments: 0 };
      // the line from the lowest count of the 30 days, so the growth shows (not a flat line near the top)
      const ser = f && f.series && f.series.length > 1 ? f.series : null, lo = ser ? Math.min(...ser) : 0, hi = ser ? Math.max(...ser) : 0;
      const sp = ser && K.spark ? K.spark(ser.map((v) => v - lo + Math.max(1, (hi - lo) * 0.12)), { w: 120, h: 40, color: COLOR[n] }) : '';
      return '<div class="cn-nc"><div class="cn-nc-h">' + badge(n) + '<b>' + NET[n] + '</b><span class="k-tag">' + pl(p.posts, 'postare', 'postări') + '</span></div>' +
        '<div class="cn-nc-f"><div class="cn-nc-v"><span class="cn-nc-n">' + (f ? full(f.now) : '-') + '</span><small>urmăritori</small></div>' + (sp ? '<div class="cn-nc-sp" style="--sp:' + COLOR[n] + '">' + sp + '</div>' : '') + '</div>' +
        (f && (f.d7 != null || f.d30 != null) ? '<div class="cn-dls">' + delta(f.d7, '7 zile') + delta(f.d30, '30 de zile') + '</div>' : '') +
        '<div class="cn-nc-s">' + mini('eye', p.views, 'Vizualizări') + mini('book', p.saves, 'Salvări') + mini('share', p.shares, 'Distribuiri') + mini('chat', p.comments, 'Comentarii') + '</div>' + rateLine((R.netRates || {})[n]) + '</div>';
    }).join('') + '</div></section>';
  }
  // the rates of a network over 30 days: % watched, the hook, engagement, followers per 1000 views
  function rateLine(x) {
    if (!x) return '';
    const r = [['vizionat', x.avgPct, pct], ['după 3 s', x.hook, pct], ['engagement', x.er, pct], ['urmăritori la 1000', x.followK, n1]].filter((y) => y[1] != null);
    return r.length ? '<div class="cn-nc-r">' + r.map(([l, v, f]) => '<span><b>' + f(v) + '</b><small>' + l + '</small></span>').join('') + '</div>' : '';
  }
  function monthCard(R) {
    const m = R.month;
    if (!m || !m.total || !m.total.posts) return '';
    const name = m.label.charAt(0).toUpperCase() + m.label.slice(1);
    const f = ORDER.filter((n) => m.followers && m.followers[n] != null).map((n) => '<span class="cn-mf">' + badge(n) + '<b>' + signed(m.followers[n]) + '</b></span>').join('');
    const b = m.best;
    const best = b ? '<div class="cn-mb">' + (known(b.id) ? '<button type="button" class="cn-mb-t" data-ctitem="' + esc(b.id) + '">' : '<div class="cn-mb-t">') + '<span class="cn-mb-ic">' + icon('trophy') + '</span><span class="cn-main"><small>Cel mai bun</small><b>' + esc(b.topic) + '</b></span>' + (known(b.id) ? '</button>' : '</div>') +
      '<em>' + k(b.views) + '</em>' + (b.url ? '<a class="k-icon-btn" href="' + esc(b.url) + '" target="_blank" rel="noopener" aria-label="Deschide pe ' + NET[b.net] + '">' + icon('link') + '</a>' : '') + '</div>' : '';
    return '<section class="cn-sec"><h3>Luna trecută</h3><div class="cn-month"><div class="cn-mh"><b>' + esc(name) + '</b><span>' + pl(m.total.posts, 'postare', 'postări') + ' · ' + k(m.total.views) + ' vizualizări · ' + k(m.total.saves + m.total.shares) + ' salvări și distribuiri</span></div>' +
      (f ? '<div class="cn-mfs"><small>Urmăritori</small>' + f + '</div>' : '') + best + '</div></section>';
  }
  function moreLike(L) {
    const list = L.more_like || [];
    if (!list.length) return '';
    return '<section class="cn-sec"><h3>Ce facem mai mult</h3><div class="cn-ml">' + list.map((x) => {
      const inner = cov(x) + '<span class="cn-main"><b>' + esc(x.topic || x.rubric) + '</b><small>' + esc([x.rubric, hookName(x.hookType)].filter(Boolean).join(' · ')) + '</small>' +
        (x.hook ? '<em class="cn-ml-h">„' + esc(x.hook) + '”</em>' : '') + '</span>' + chipX(x.score);
      return known(x.id) ? '<button type="button" class="cn-mlc" data-ctitem="' + esc(x.id) + '">' + inner + '</button>' : '<div class="cn-mlc">' + inner + '</div>';
    }).join('') + '</div></section>';
  }
  function topTen(R) {
    const top = R.top || [];
    if (!top.length) return '';
    return '<section class="cn-sec"><h3>Top 10, ultimele 30 de zile</h3><div class="cn-list">' + top.map((x, i) => {
      const inner = cov(x) + '<span class="cn-main"><b>' + esc(x.topic || x.rubric || KIND[x.kind]) + '</b><small>' + esc([x.rubric, hookName(x.hookType)].filter(Boolean).join(' · ')) + (x.fresh ? ' <i class="cn-new">nou</i>' : '') + '</small></span>';
      const links = (x.links || []).map((l) => '<a class="cn-lk" href="' + esc(l.url) + '" target="_blank" rel="noopener" title="' + NET[l.net] + '">' + badge(l.net) + '</a>').join('');
      return '<div class="cn-tr"><span class="cn-rank">' + (i + 1) + '</span>' + (known(x.id) ? '<button type="button" class="cn-trb" data-ctitem="' + esc(x.id) + '">' + inner + '</button>' : '<div class="cn-trb">' + inner + '</div>') +
        '<div class="cn-tr-n">' + statLine({ views: x.views, saves: x.saves, shares: x.shares, comments: x.comments }) + (links ? '<span class="cn-lks">' + links + '</span>' : '') + '</div>' + chipX(x.score) + '</div>';
    }).join('') + '</div></section>';
  }
  function bars(name, rows, label) {
    if (!rows.length) return '';
    const max = Math.max(1, ...rows.map((r) => r.score));
    return '<div class="cn-rk"><h4>' + name + '</h4><ul>' + rows.map((r) => '<li><span class="cn-rk-l"><b>' + esc(label(r)) + '</b><small>' + pl(r.n, 'material', 'materiale') + '</small></span>' +
      '<span class="cn-rk-b"><i class="' + tone(r.score) + '" style="width:' + Math.max(6, Math.round((r.score / max) * 100)) + '%"></i></span>' + chipX(r.score) + '</li>').join('') + '</ul></div>';
  }
  function ranks(L) {
    const a = bars('Rubrici', L.rubrics || [], (r) => r.rubric || 'Fără rubrică'), b = bars('Subiecte', (L.topics || []).slice(0, 8), (r) => r.topic), c = bars('Cârlige', L.hooks || [], (r) => hookName(r.hookType) || 'Fără tip');
    return a || b || c ? '<section class="cn-sec"><h3>Ce merge</h3><div class="cn-rks">' + a + b + c + '</div></section>' : '';
  }
  function hours(L) {
    const heat = L.heat || {}, best = L.hours || {};
    const nets = ORDER.filter((n) => heat[n] && heat[n].slots.length);
    if (!nets.length) return '';
    const DAYS = [[1, 'Lu'], [2, 'Ma'], [3, 'Mi'], [4, 'Jo'], [5, 'Vi'], [6, 'Sâ'], [0, 'Du']];
    return '<h4 class="cn-sub">Cum au mers orele noastre</h4><div class="cn-hms">' + nets.map((n) => {
      const h = heat[n], max = Math.max(1, ...Object.keys(h.cells).map((x) => h.cells[x].score)), top = (best[n] || [])[0];
      const cell = (d, sl) => {
        const c = h.cells[d + '|' + sl];
        if (!c) return '<span class="cn-hm-c is-none"></span>';
        const v = Math.min(1, c.score / max);
        return '<span class="cn-hm-c' + (v >= 0.6 ? ' is-hot' : '') + '" style="--v:' + v.toFixed(2) + '" title="' + esc(pl(c.n, 'postare', 'postări')) + '">' + x1(c.score) + '</span>';
      };
      return '<div class="cn-hm"><div class="cn-hm-h">' + badge(n) + '<b>' + NET[n] + '</b>' + (top ? '<span class="k-tag is-good">' + icon('clock') + esc(top.at) + '</span>' : '') + '</div>' +
        '<div class="cn-hm-g"><span></span>' + DAYS.map((d) => '<span class="cn-hm-d">' + d[1] + '</span>').join('') +
        h.slots.map((sl) => '<span class="cn-hm-t">' + esc(sl) + '</span>' + DAYS.map(([d]) => cell(d, sl)).join('')).join('') + '</div></div>';
    }).join('') + '</div>';
  }

  // ------------------------------------------------------------------ one item
  function preview(it) {
    const files = (it.files || []).slice().sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }));
    const vid = files.find((f) => f.mime === 'video/mp4');
    if (vid) return '<div class="cn-pv"><video src="' + esc(fileUrl(it, vid.name)) + '"' + (it.cover ? ' poster="' + esc(cover(it)) + '"' : '') + ' controls playsinline preload="none"></video></div>';
    const imgs = files.filter((f) => /^image\//.test(f.mime));
    return '<div class="cn-pv' + (photo(it) ? ' is-photo' : '') + (imgs.length > 1 ? ' is-many' : '') + '">' + imgs.map((f) => '<img src="' + esc(fileUrl(it, f.name)) + '" alt="" loading="lazy">').join('') + '</div>';
  }
  function itemBody(it) {
    const on = S.d.settings.nets, r = review(it);
    const rv = REVIEW[r];
    const status = '<div class="cn-rv is-' + r + '"><span class="k-tag ' + rv[1] + '">' + (r === 'approved' ? icon('check') : r === 'redo' ? icon('undo') : '') + rv[0] + '</span>' +
      (r === 'redo' && it.redoNote ? '<p>' + esc(it.redoNote) + '</p>' : r === 'pending' && it.replacedAt ? '<p>Refăcut' + (it.redoNote ? ': ' + esc(it.redoNote) : '') + '</p>' : '') +
      (r === 'redo' && it.state === 'draft' ? '<p class="cn-rv-w">' + icon('refresh') + 'Se reface</p>' : '') +
      (it.ideaId ? '<span class="k-tag is-accent">' + icon('sparkles') + 'Ideea ta</span>' : '') + (it.variantOf ? '<span class="k-tag">' + icon('refresh') + 'Variantă nouă</span>' : '') +
      (it.hookType ? '<span class="k-tag">' + esc(hookName(it.hookType)) + '</span>' : '') + (it.hook ? '<p class="cn-hook">„' + esc(it.hook) + '”</p>' : '') + '</div>';
    // the texts' check: what stops it (red), what to look at (amber); none once it is out everywhere
    const q = qaOf(it), out = (it.plan || []).length && (it.plan || []).every((e) => ['posted', 'skipped', 'missed'].includes(e.state));
    const qa = out || !(q.problems.length + q.warnings.length) ? '' : '<ul class="cn-qal">' +
      q.problems.map((x) => '<li class="is-bad">' + icon('alert') + '<span>' + esc(x) + '</span></li>').join('') +
      q.warnings.map((x) => '<li class="is-warn">' + icon('info') + '<span>' + esc(x) + '</span></li>').join('') + '</ul>';
    const nets = (AS[it.kind] || []).slice().sort((a, b) => NETS.indexOf(a) - NETS.indexOf(b));
    const posted = (n) => (it.plan || []).some((e) => e.net === n && e.state === 'posted');
    const caps = nets.map((n) => {
      const v = (it.captions && it.captions[n]) || it.caption || '';
      return '<label class="cn-capn"><span>' + badge(n) + '<b>' + NET[n] + '</b><small data-ctcount="' + n + '">' + v.length + '/' + CAP_MAX[n] + '</small></span>' +
        '<textarea data-ctcap="' + n + '" maxlength="' + CAP_MAX[n] + '" rows="3"' + (posted(n) ? ' readonly' : '') + '>' + esc(v) + '</textarea></label>';
    }).join('');
    const plan = (it.plan || []).slice().sort((a, b) => String(a.at).localeCompare(String(b.at))).map((e) => {
      const can = on[e.net] && S.d.settings.on && r === 'approved' && (e.state === 'planned' || e.state === 'error' || e.state === 'missed') && e.net !== 'tt' && e.net !== 'yt';
      return '<li class="cn-pl is-' + e.state + '"><div class="cn-pl-h">' + badge(e.net) + '<b>' + NET[e.net] + (e.kind && e.kind !== it.kind ? ' · ' + KIND[e.kind] : '') + '</b><span class="k-tag ' + TONE[e.state] + '">' + STATE[e.state] + '</span></div>' +
        '<p>' + esc(when(e.postedAt || e.at)) + (e.url ? ' · <a href="' + esc(e.url) + '" target="_blank" rel="noopener">Deschide</a>' : '') + '</p>' +
        (e.error && e.state !== 'posted' ? '<p class="cn-err">' + esc(e.error) + (e.tries ? ' (' + e.tries + '/3)' : '') + '</p>' : '') + (e.hold && e.state === 'planned' ? '<p class="cn-err is-warn">' + esc(e.hold) + '</p>' : '') +
        (e.note ? '<p class="cn-err is-warn">' + icon('eyeOff') + esc(e.note) + '</p>' : '') +
        (e.comment && (e.comment.text || e.comment.error) ? '<p class="cn-cmt' + (e.comment.error ? ' is-bad' : '') + '">' + icon('chat') + '<span>' + esc(e.comment.text || '') + (e.comment.error ? '<em>' + esc(e.comment.error) + '</em>' : '') + '</span></p>' : '') +
        (e.state === 'posted' && it.stats && it.stats[e.net] ? statLine(it.stats[e.net]) : '') +
        (can ? '<button type="button" class="k-btn is-outline is-sm" data-ctnow="' + e.net + '">' + icon('arrow') + 'Postează acum</button>' : '') + boostLine(it, e) + '</li>';
    }).join('');
    const fc = it.firstComment && !(it.plan || []).some((e) => e.comment) ? '<p class="cn-cmt is-plan">' + icon('chat') + '<span><small>Primul comentariu</small>' + esc(it.firstComment) + '</span></p>' : '';
    return status + qa + statsSection(it) + preview(it) + '<section class="cn-caps">' + caps + '</section>' + fc + (plan ? '<ul class="cn-plan">' + plan + '</ul>' : '');
  }
  // ------------------------------------------------------------------ Statistici (the drawer)
  // per network the numbers and the rates, × the network's usual post, the retention curve, the growth in the first
  // hours, the funnel from the comments to the money
  const ROWS = [['views', 'Vizualizări', k], ['reach', 'Conturi atinse', k], ['likes', 'Aprecieri', k], ['comments', 'Comentarii', k], ['shares', 'Distribuiri', k], ['saves', 'Salvări', k],
    ['follows', 'Urmăritori noi', k], ['profileVisits', 'Vizite pe profil', k], ['profileActivity', 'Atingeri pe profil', k], ['watch', 'Timp mediu', (v) => n1(v) + ' s'],
    ['avgPct', 'Vizionat', pct, 1], ['hook', 'Rămân după 3 s', pct, 1], ['hold', 'Rămân la jumătate', pct, 1], ['er', 'Engagement', pct, 1], ['saveK', 'Salvări la 1000', n1, 1], ['shareK', 'Distribuiri la 1000', n1, 1], ['followK', 'Urmăritori la 1000', n1, 1]];
  function statsSection(it) {
    const posted = (it.plan || []).filter((e) => e.state === 'posted').map((e) => e.net);
    const nets = ORDER.filter((n) => posted.includes(n) && it.stats && it.stats[n]);
    if (!nets.length) return '';
    const st = it.stats, ins = it.ins || { x: {}, rates: {} }, rates = ins.rates || {};
    const val = (n, row) => (row[3] ? (rates[n] || {})[row[0]] : st[n][row[0]]);
    const rows = ROWS.filter((row) => nets.some((n) => val(n, row) != null));
    const xRow = nets.some((n) => ins.x && ins.x[n] != null) ? '<tr class="is-x"><th>Față de obișnuit</th>' + nets.map((n) => '<td>' + (ins.x[n] != null ? chipX(ins.x[n]) : '-') + '</td>').join('') + '</tr>' : '';
    const table = '<div class="cn-st-w"><table class="cn-st"><thead><tr><th></th>' + nets.map((n) => '<th>' + badge(n) + '</th>').join('') + '</tr></thead><tbody>' + xRow +
      rows.map((row) => '<tr' + (row[3] ? ' class="is-rate"' : '') + '><th>' + row[1] + '</th>' + nets.map((n) => { const v = val(n, row); return '<td>' + (v == null ? '<span class="cn-st-na">-</span>' : row[2](v)) + '</td>'; }).join('') + '</tr>').join('') + '</tbody></table></div>';
    const dur = ((it.files || []).find((f) => f.mime === 'video/mp4') || {}).dur || 0;
    const ret = nets.filter((n) => Array.isArray(st[n].ret)).map((n) => ({ net: n, ret: st[n].ret }));
    const snaps = nets.filter((n) => it.snaps && (it.snaps[n] || []).length).map((n) => ({ net: n, pts: it.snaps[n] }));
    const hot = it.hot ? '<div class="cn-st-hot"><span>🔥</span><p><b>Merge tare</b>' + esc(NET[it.hot.net] + ': ' + k(it.hot.views) + ' vizualizări în ' + (it.hot.h < 1.5 ? 'prima oră' : pl(Math.round(it.hot.h), 'oră', 'ore')) + ', ' + x1(it.hot.x) + ' față de obișnuit la aceeași vârstă') + '</p></div>' : '';
    const F = S.r && S.r.funnel && S.r.funnel.items ? S.r.funnel.items[it.id] : null;
    const fn = F ? '<h5>De la comentariu la încasări</h5>' + strip(F, true) : it.keyword && !S.r ? '<p class="cn-st-wait">' + icon('refresh') + 'Se încarcă pâlnia…</p>' : '';
    return '<section class="cn-sts"><h4>Statistici</h4>' + hot + table + (ret.length ? '<h5>Cât rămân să se uite</h5>' + retSvg(ret, dur) : '') + (snaps.length ? '<h5>Cum au crescut vizualizările</h5>' + growthSvg(snaps) : '') + fn + '</section>';
  }
  const legend = (nets) => (nets.length > 1 ? '<div class="cn-lg">' + nets.map((n) => '<span><i style="background:' + COLOR[n] + '"></i>' + NET[n] + '</span>').join('') + '</div>' : '');
  // the share still watching along the video (0 → 100%), the 3-second mark, half the video
  function retSvg(list, dur) {
    const W = 320, H = 132, l = 34, r = 10, t = 10, b = 22, ymax = Math.max(1, ...list.map((x) => Math.max(...x.ret)));
    const X = (f) => l + f * (W - l - r), Y = (v) => t + (1 - v / ymax) * (H - t - b);
    const grid = [0, 0.5, 1].map((v) => '<line x1="' + l + '" x2="' + (W - r) + '" y1="' + Y(v).toFixed(1) + '" y2="' + Y(v).toFixed(1) + '" class="cn-gr"/><text x="' + (l - 6) + '" y="' + (Y(v) + 3.5).toFixed(1) + '" text-anchor="end">' + Math.round(v * 100) + '%</text>').join('');
    const m3 = dur > 3 ? '<line x1="' + X(3 / dur).toFixed(1) + '" x2="' + X(3 / dur).toFixed(1) + '" y1="' + t + '" y2="' + (H - b) + '" class="cn-mk"/><text x="' + X(3 / dur).toFixed(1) + '" y="' + (H - 6) + '" text-anchor="middle">3 s</text>' : '';
    const lines = list.map((x) => '<polyline fill="none" stroke="' + COLOR[x.net] + '" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" points="' + x.ret.map((v, i) => X(i / (x.ret.length - 1)).toFixed(1) + ',' + Y(v).toFixed(1)).join(' ') + '"/>').join('');
    const xs = '<text x="' + l + '" y="' + (H - 6) + '" text-anchor="start">0</text><text x="' + X(0.5).toFixed(1) + '" y="' + (H - 6) + '" text-anchor="middle">jumătate</text><text x="' + (W - r) + '" y="' + (H - 6) + '" text-anchor="end">' + (dur ? Math.round(dur) + ' s' : 'final') + '</text>';
    return '<div class="cn-ch"><svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Retenția">' + grid + m3 + lines + xs + '</svg>' + legend(list.map((x) => x.net)) + '</div>';
  }
  // the views at 1 hour, 6 hours, a day, 3, 7, 30 days (a log scale: the first hours matter most)
  function growthSvg(list) {
    const W = 320, H = 132, l = 40, r = 10, t = 10, b = 22;
    const hmax = Math.max(2, ...list.map((x) => Math.max(...x.pts.map((p) => p.h)))), vmax = Math.max(1, ...list.map((x) => Math.max(...x.pts.map((p) => p.v))));
    const X = (h) => l + (Math.log1p(h) / Math.log1p(hmax)) * (W - l - r), Y = (v) => t + (1 - v / vmax) * (H - t - b);
    const ticks = [[1, '1 h'], [6, '6 h'], [24, '1 zi'], [72, '3 zile'], [168, '7 zile'], [720, '30 zile']].filter(([h]) => h <= hmax * 1.05);
    const grid = [0, 0.5, 1].map((f) => '<line x1="' + l + '" x2="' + (W - r) + '" y1="' + Y(f * vmax).toFixed(1) + '" y2="' + Y(f * vmax).toFixed(1) + '" class="cn-gr"/><text x="' + (l - 6) + '" y="' + (Y(f * vmax) + 3.5).toFixed(1) + '" text-anchor="end">' + k(Math.round(f * vmax)) + '</text>').join('');
    const xs = ticks.map(([h, lab]) => '<text x="' + X(h).toFixed(1) + '" y="' + (H - 6) + '" text-anchor="middle">' + lab + '</text>').join('');
    const lines = list.map((x) => { const pts = [{ h: 0, v: 0 }].concat(x.pts.slice().sort((a, c) => a.h - c.h)); return '<polyline fill="none" stroke="' + COLOR[x.net] + '" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" points="' + pts.map((p) => X(p.h).toFixed(1) + ',' + Y(p.v).toFixed(1)).join(' ') + '"/>' +
      x.pts.map((p) => '<circle cx="' + X(p.h).toFixed(1) + '" cy="' + Y(p.v).toFixed(1) + '" r="2.6" fill="' + COLOR[x.net] + '"><title>' + n1(p.h) + ' h: ' + full(p.v) + '</title></circle>').join(''); }).join('');
    return '<div class="cn-ch"><svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Creșterea">' + grid + xs + lines + '</svg>' + legend(list.map((x) => x.net)) + '</div>';
  }
  // a post that went out on Instagram or Facebook: „Fă reclamă din asta”, then the ad, its link and „Pornește reclama”
  function boostLine(it, e) {
    if (e.state !== 'posted' || (e.net !== 'ig' && e.net !== 'fb')) return '';
    const b = (it.boosts || []).find((x) => x.net === e.net && !x.gone);
    const warn = S.warn[it.id + '|' + e.net];
    if (!b) return '<button type="button" class="k-btn is-outline is-sm cn-bst-go" data-ctboost="' + e.net + '">' + icon('zap') + 'Fă reclamă din asta</button>';
    const what = [b.offer && b.offer.title, (b.cities || []).join(', '), b.daily ? b.daily + ' lei pe zi' : ''].filter(Boolean).join(' · ');
    return '<div class="cn-bst"><div class="cn-bst-h"><span class="k-tag ' + (b.startedAt ? 'is-good' : 'is-accent') + '">' + icon('zap') + (b.startedAt ? 'Reclamă pornită' : 'Reclamă gata, oprită') + '</span>' +
      (what ? '<small>' + esc(what) + '</small>' : '') + '</div>' + (warn ? '<p class="cn-err is-warn">' + esc(warn) + '</p>' : '') + '<div class="cn-bst-a">' +
      (b.url ? '<a class="k-btn is-ghost is-sm" href="' + esc(b.url) + '" target="_blank" rel="noopener">' + icon('link') + 'Ads Manager</a>' : '') +
      (b.startedAt ? '' : '<button type="button" class="k-btn is-primary is-sm" data-ctbstart="' + e.net + '">' + icon('power') + 'Pornește reclama</button>') + '</div></div>';
  }
  // the ad from a post: the plan first (the offer, the city, the budget), the owner confirms, then it is made (paused)
  async function boost(btn, id, net) {
    const it = S.d.items.find((x) => x.id === id); if (!it) return;
    const ask = {};
    const call = async (extra) => {
      try { const r = await K.api('/api/portal-content', Object.assign({ action: 'boost', id, net }, ask, extra || {})); if (r && r.items) { S.d = r; paint(); } return r && r.result ? r.result : r; }
      catch (err) { return { ok: false, error: err.code, message: err.code === 'not_posted' ? 'Materialul nu e încă postat acolo.' : K.errText(err) }; }
    };
    btn.disabled = true;
    try {
      for (let i = 0; i < 4; i++) {
        const r = await call({ dry: true });
        if (r.error === 'not_ready') { K.ui().toast('Reclamele din postări nu sunt gata încă.', 'error'); return; }
        if (r.error === 'choose_city') {
          const v = await K.ui().prompt({ title: 'În ce oraș?', options: (r.cities || []).map((c) => [c, c]).concat(r.both ? [['both', 'Ambele']] : []), value: (r.cities || [])[0], confirmText: 'Mai departe' });
          if (v == null) return; ask.city = v; continue;
        }
        if (r.error === 'choose_offer') {
          const v = await K.ui().prompt({ title: 'Ce ofertă?', message: r.message || '', options: (r.offers || []).map((o) => [o.id, o.title]), value: ((r.offers || [])[0] || {}).id, confirmText: 'Mai departe' });
          if (v == null) return; ask.offer = v; continue;
        }
        if (!r.ok) { K.ui().toast(r.message || K.errText(r.error), 'error'); return; }
        if (r.already) { K.ui().toast('Reclama există deja.', 'success'); await load(); return; }
        const cities = (r.cities || []).map((c) => (c && c.city) || c).join(' și ');
        const ok = await K.ui().confirm({ title: 'Faci reclamă din „' + title(it) + '”?', message: [r.offer && r.offer.title, cities, r.daily ? r.daily + ' lei pe zi' : ''].filter(Boolean).join(' · ') + '. Rămâne oprită până o pornești.', confirmText: 'Fă reclama' });
        if (!ok) return;
        btn.innerHTML = icon('refresh') + 'Se face reclama…';
        const done = await call();
        if (!done.ok) { K.ui().toast(done.message || 'Nu am putut face reclama.', 'error'); return; }
        if (done.warning) S.warn[id + '|' + net] = done.warning;
        K.ui().toast(done.already ? 'Reclama există deja.' : 'Reclama e gata, oprită.', 'success');
        if (!S.d.items.some((x) => x.id === id && (x.boosts || []).some((b) => b.net === net))) await load();
        else paint();
        return;
      }
    } finally { if (btn.isConnected) btn.disabled = false; }
  }
  async function boostStart(btn, id, net) {
    const it = S.d.items.find((x) => x.id === id) || {}, b = (it.boosts || []).find((x) => x.net === net && !x.gone) || {};
    if (!(await K.ui().confirm({ title: 'Pornești reclama?', message: b.daily ? 'Cheltuie ' + b.daily + ' lei pe zi.' : '', confirmText: 'Pornește' }))) return;
    btn.disabled = true;
    try {
      const r = await K.api('/api/portal-content', { action: 'boost_start', id, net });
      if (r.items) { S.d = r; paint(); }
      const res = r.result || r;
      K.ui().toast(res.ok ? 'Reclama e pornită.' : res.message || (res.error === 'not_ready' ? 'Reclamele din postări nu sunt gata încă.' : 'Nu am putut porni reclama.'), res.ok ? 'success' : 'error');
    } catch (err) { K.ui().toast(K.errText(err), 'error'); }
    finally { if (btn.isConnected) btn.disabled = false; }
  }
  function itemFoot(it) {
    const r = review(it), live = (it.plan || []).some((e) => !['posted', 'skipped', 'posting', 'missed'].includes(e.state));
    const drop = !it.dropped && (live || !(it.plan || []).length) ? '<button type="button" class="k-btn is-ghost" data-ctskip>' + icon('ban') + 'Scoate</button>' : '';
    if (it.state !== 'ready' || it.dropped) return drop;
    return drop + '<span class="k-grow"></span>' + (r !== 'redo' && live ? '<button type="button" class="k-btn is-outline" data-ctredo>' + icon('undo') + 'Refă</button>' : '') +
      (r !== 'approved' ? '<button type="button" class="k-btn is-primary" data-ctok>' + icon('check') + 'Aprobă</button>' : '');
  }
  function openItem(id) {
    const it = S.d.items.find((x) => x.id === id); if (!it) return;
    openId = id;
    if (!S.r && (it.plan || []).some((e) => e.state === 'posted')) setTimeout(() => loadResults(), 0);
    dr = K.drawer({
      title: title(it), subtitle: esc([KIND[it.kind], it.rubric, it.keyword ? '„' + it.keyword + '”' : '', it.week ? range(it.week) : ''].filter(Boolean).join(' · ')), icon: photo(it) ? 'layers' : 'video', width: 540,
      body: itemBody(it), focus: false, footer: itemFoot(it) || ' ',
      onClose: () => { dr = null; openId = ''; },
      onMount(el) {
        el.addEventListener('input', (e) => {
          const t = e.target.closest('[data-ctcap]'); if (!t) return;
          const c = el.querySelector('[data-ctcount="' + t.dataset.ctcap + '"]'); if (c) c.textContent = t.value.length + '/' + CAP_MAX[t.dataset.ctcap];
        });
        el.addEventListener('change', async (e) => {
          const t = e.target.closest('[data-ctcap]'); if (!t) return;
          if (await save({ action: 'captions', id, captions: { [t.dataset.ctcap]: t.value } }, null, true)) K.ui().toast('Text salvat pentru ' + NET[t.dataset.ctcap] + '.', 'success');
        });
        el.addEventListener('click', async (e) => {
          const cur = S.d.items.find((x) => x.id === id) || it;
          const bst = e.target.closest('[data-ctboost]'); if (bst) return boost(bst, id, bst.dataset.ctboost);
          const bgo = e.target.closest('[data-ctbstart]'); if (bgo) return boostStart(bgo, id, bgo.dataset.ctbstart);
          const now = e.target.closest('[data-ctnow]');
          if (now) {
            const net = now.dataset.ctnow;
            if (!(await K.ui().confirm({ title: 'Postezi acum pe ' + NET[net] + '?', confirmText: 'Postează' }))) return;
            now.disabled = true; now.innerHTML = icon('refresh') + 'Se publică…';
            const r = await save({ action: 'post_now', id, net });
            const res = r && r.result;
            if (res) K.ui().toast(res.posted ? 'Postat pe ' + NET[net] + '.' : res.waiting ? 'Instagram procesează video-ul, apare în câteva minute.' : res.hold ? res.hold : res.error ? res.error : 'Se publică.', res.posted || res.waiting ? 'success' : 'error');
            return;
          }
          const ok = e.target.closest('[data-ctok]');
          if (ok) { if (await save({ action: 'approve', id }, ok)) K.ui().toast('Aprobat.', 'success'); return; }
          const redo = e.target.closest('[data-ctredo]');
          if (redo) {
            const note = await K.ui().prompt({ title: 'Ce refacem?', multiline: true, value: '', confirmText: 'Trimite la refăcut' });
            if (note == null) return;
            if (note.trim().length < 2) { K.ui().toast('Scrie pe scurt ce refacem.', 'error'); return; }
            if (await save({ action: 'redo', id, note: note.trim() }, redo)) K.ui().toast('Trimis la refăcut.', 'success');
            return;
          }
          if (e.target.closest('[data-ctskip]')) {
            if (!(await K.ui().confirm({ title: 'Scoți „' + title(cur) + '”?', message: 'Nu se mai postează nicăieri.', confirmText: 'Scoate', danger: true }))) return;
            if (await save({ action: 'skip', id })) { K.ui().toast('Scos din săptămână.', 'success'); if (dr) dr.close(); }
          }
        });
      },
    });
  }

  // ------------------------------------------------------------------ settings
  function openSettings(goalsFirst) {
    const st = S.d.settings, G = S.d.goals || { followers: {} };
    const t = (n, i) => '<label class="k-field"><span>' + (i === 'p' ? (n === 'tt' ? 'Ora slideshow' : 'Ora carusel') : 'Ora ' + (i + 1)) + '</span><input type="text" inputmode="numeric" maxlength="5" placeholder="hh:mm" data-cttime="' + n + '|' + i + '" value="' + esc(i === 'p' ? st.photoTime[n] || '' : st.times[n][i] || '') + '"></label>';
    const q = (n, w, kind, label) => '<label class="k-field"><span>' + label + '</span><input type="number" inputmode="numeric" min="0" max="' + (kind === 'reel' ? 28 : 7) + '" data-ctq="' + w + '|' + n + '|' + kind + '" value="' + esc(String(st.quotas[w][n][kind] != null ? st.quotas[w][n][kind] : 0)) + '"></label>';
    const pk = { tt: 'slideshow', ig: 'carousel', fb: 'carousel' };
    const card = (n) => '<div class="cn-netc"><div class="cn-setr">' + badge(n) + '<b>' + NET[n] + '</b>' + K.toggle('net_' + n, st.nets[n]) + '</div>' +
      '<div class="cn-nf">' + t(n, 0) + t(n, 1) + (pk[n] ? t(n, 'p') : '<span></span>') + '</div>' +
      '<div class="cn-nf">' + q(n, 'warm', 'reel', 'Reels săpt. 1-' + st.warmWeeks) + q(n, 'full', 'reel', 'Reels apoi') + (pk[n] ? q(n, 'full', pk[n], n === 'tt' ? 'Slideshow' : 'Carusele') : '<span></span>') + '</div></div>';
    const body = '<section class="cn-set"><h5>Rețele, ore și cote pe săptămână</h5>' + NETS.map(card).join('') + '</section>' +
      '<section class="cn-set"><h5>Prima săptămână</h5><label class="k-field"><span>Luni</span><input type="date" data-ctstart value="' + esc(st.startWeek) + '"></label></section>' +
      '<section class="cn-set"><h5>Concurenți</h5><label class="k-field"><span>Nu apar în texte</span><input type="text" data-ctcomp maxlength="600" placeholder="Nume, despărțite prin virgulă" value="' + esc((st.competitors || []).join(', ')) + '"></label></section>';
    // Ținte lunare: the followers gained per network, the views, the organic leads (empty: no goal)
    const gi = (key, label, v) => '<label class="k-field"><span>' + label + '</span><input type="number" inputmode="numeric" min="0" step="1" placeholder="-" data-ctgoal="' + key + '" value="' + (v ? esc(String(v)) : '') + '"></label>';
    const goals = '<section class="cn-set" data-ctgoalsec><h5>Ținte lunare</h5><div class="cn-gf">' + NETS.map((n) => gi('f_' + n, 'Urmăritori noi ' + NET[n], (G.followers || {})[n])).join('') +
      gi('views', 'Vizualizări', G.views) + gi('leads', 'Leaduri organice', G.leads) + '</div></section>';
    const d = K.drawer({
      title: 'Setări conținut', icon: 'sliders', width: 480, body: goalsFirst ? goals + body : body + goals, focus: false,
      footer: '<span class="k-grow"></span><button type="button" class="k-btn is-primary" data-ctsave>' + icon('check') + 'Salvează</button>',
      onMount(el) {
        el.addEventListener('click', async (e) => {
          const b = e.target.closest('[data-ctsave]'); if (!b) return;
          const nets = {}, times = {}, photoTime = {}, quotas = { warm: {}, full: {} };
          let bad = '';
          NETS.forEach((n) => {
            nets[n] = el.querySelector('input[name="net_' + n + '"]').checked;
            const ts = [0, 1].map((i) => el.querySelector('[data-cttime="' + n + '|' + i + '"]').value.trim().replace(/^(\d):/, '0$1:')).filter(Boolean);
            if (!ts.length) bad = 'Fiecare rețea are cel puțin o oră.';
            times[n] = ts;
            const p = el.querySelector('[data-cttime="' + n + '|p"]');
            if (p) { photoTime[n] = p.value.trim().replace(/^(\d):/, '0$1:'); if (ts.includes(photoTime[n])) bad = 'Ora caruselului e alta decât orele reels.'; }
          });
          if ([].concat(...Object.values(times), Object.values(photoTime)).some((x) => !/^([01]\d|2[0-3]):[0-5]\d$/.test(x))) bad = 'Orele se scriu ca 19:30.';
          el.querySelectorAll('[data-ctq]').forEach((x) => {
            const [w, n, kind] = x.dataset.ctq.split('|'), v = Math.round(Number(x.value));
            if (!Number.isFinite(v) || v < 0 || v > Number(x.max)) bad = 'Cotele sunt între 0 și ' + x.max + '.';
            (quotas[w][n] = quotas[w][n] || {})[kind] = v;
            if (kind !== 'reel') (quotas.warm[n] = quotas.warm[n] || {})[kind] = v;
          });
          if (bad) { K.ui().toast(bad, 'error'); return; }
          const start = el.querySelector('[data-ctstart]').value;
          const competitors = el.querySelector('[data-ctcomp]').value;
          const goals = { followers: {} };
          el.querySelectorAll('[data-ctgoal]').forEach((x) => { const v = Math.round(Number(x.value)); const key = x.dataset.ctgoal; if (!(v > 0)) return; if (key.startsWith('f_')) goals.followers[key.slice(2)] = v; else goals[key] = v; });
          if (await save({ action: 'settings', nets, times, photoTime, quotas, startWeek: start || st.startWeek, competitors, goals }, b)) { K.ui().toast('Salvat.', 'success'); d.close(); loadResults(true); }
        });
      },
    });
  }

  K.section('continut', { mount, show() { load(); } });
})();
