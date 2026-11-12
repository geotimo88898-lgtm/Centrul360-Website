// Centrul360 portal, Marketing → „Conținut” (the owner, 12.11): the weekly batch of organic reels and carousels the
// producer hands in (api/content-intake.js). Here the owner looks at next week before it goes out: a board of days ×
// networks, each item with its video, its text per network (editable), Aprobă / Refă, and „Aprobă toată
// săptămâna”; this week below it; then the week's top, what needs a look and the last posted with their numbers.
// The clock posts only what is approved (api/_lib/content-post.js). Under the weeks, the owner's ideas for the next
// weeks (the producer makes them first). Each item shows its texts' check (qa: what stops it, what to look at) and,
// once posted on Instagram or Facebook, „Fă reclamă din asta” (api/_lib/content-boost.js).
// The second tab, „Rezultate”: the followers per network, the last 30 days, the last month, what to make more of, the
// top 10, the rubrics, topics and hooks ranked, the best slot times per network (api/_lib/content-learn.js). Admin only.
(function () {
  'use strict';
  const K = window.K;
  if (!K) return;
  const { esc, icon } = K;
  const store = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } } };
  const S = { d: null, busy: false, tab: store.get('cn-tab') === 'res' ? 'res' : 'week', r: null, rErr: '', rAt: 0, warn: {} };
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
      const it = e.target.closest('[data-ctitem]'); if (it) return openItem(it.dataset.ctitem);
      if (e.target.closest('[data-ctset]')) return openSettings();
      if (e.target.closest('[data-ctgo]')) return K.go('integrari');
    });
    panel.addEventListener('change', (e) => {
      if (e.target.name === 'cton') save({ action: 'settings', on: e.target.checked });
      if (e.target.name === 'cttab') { S.tab = e.target.value === 'res' ? 'res' : 'week'; store.set('cn-tab', S.tab); paint(true); if (S.tab === 'res') loadResults(); }
    });
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
    if (S.tab === 'res') paint(true);
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
    const tabs = '<div class="cn-tabs">' + K.seg('cttab', [['week', 'Săptămâna', 'calendar'], ['res', 'Rezultate', 'trend']], S.tab) + '</div>';
    body.innerHTML = tabs + (S.tab === 'res' ? resTab() : access() + board(s.next, 'Săptămâna viitoare', true) + board(s.current, 'Săptămâna asta', false) + ideasBox() + topWeek() + errors() + last());
    const t2 = body.querySelector('[data-ctidea] input[name=text]');
    if (t2 && draft) { t2.value = draft; if (focused) t2.focus(); }
    if (dr && openId && !quiet) { const it = S.d.items.find((x) => x.id === openId); if (it) { const y = dr.body.scrollTop; dr.body.innerHTML = itemBody(it); dr.body.scrollTop = y; dr.el.querySelector('.k-dfoot') && (dr.el.querySelector('.k-dfoot').innerHTML = itemFoot(it)); } }
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
  function topWeek() {
    const top = S.d.top || [];
    if (!top.length) return '';
    const by = Object.fromEntries(S.d.items.map((x) => [x.id, x]));
    return '<section class="cn-sec"><h3>Top săptămâna</h3><div class="cn-top">' + top.map((t, i) => {
      const it = by[t.id] || { id: t.id, kind: t.kind, topic: t.topic, rubric: t.rubric };
      return '<div class="cn-topc"><button type="button" class="cn-topb" data-ctitem="' + esc(t.id) + '"><span class="cn-rank">' + (i + 1) + '</span>' + thumb(it, 'is-lg') +
        '<span class="cn-main"><b>' + esc(title(it)) + '</b><small>' + k(t.views) + ' vizualizări · ' + k(t.saves + t.shares) + ' salvări și distribuiri</small></span></button>' +
        (t.url ? '<a class="k-btn is-ghost is-sm" href="' + esc(t.url) + '" target="_blank" rel="noopener">' + icon('link') + NET_S[t.net] + '</a>' : '') + '</div>';
    }).join('') + '</div></section>';
  }
  function row(it, e, extra) {
    return '<button type="button" class="cn-row" data-ctitem="' + esc(it.id) + '">' + thumb(it) + '<span class="cn-main"><b>' + esc(title(it)) + '</b><small>' + badge(e.net) + esc(when(e.postedAt || e.at)) + '</small>' + (extra || '') + '</span>' +
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
  function resTab() {
    const R = S.r;
    if (!R) return S.rErr ? K.empty('alert', 'Nu am putut încărca rezultatele', esc(S.rErr)) : '<div class="k-skel" style="height:420px"></div>';
    const L = R.learn || {};
    const any = Object.keys(R.followers || {}).length || (R.last30 && R.last30.total.posts) || (R.month && R.month.total.posts);
    if (!any) return K.empty('trend', 'Rezultatele apar după primele postări', '');
    return kpis(R) + netCards(R) + monthCard(R) + moreLike(L) + topTen(R) + ranks(L) + hours(L);
  }
  function kpis(R) {
    const t = R.last30.total, f = R.last30.followers || {};
    const won = Object.keys(f).reduce((s, n) => s + (f[n] || 0), 0);
    const tile = (ic, label, v, sub, cls) => '<div class="k-stat ' + (cls || '') + '"><div class="k-stat-top"><span class="k-stat-ic">' + icon(ic) + '</span>' + label + '</div><div class="k-stat-value">' + v + '</div>' + (sub ? '<div class="k-stat-sub">' + sub + '</div>' : '') + '</div>';
    return '<section class="cn-sec"><h3>Ultimele 30 de zile</h3><div class="cn-kpis">' + tile('eye', 'Vizualizări', k(t.views), pl(t.posts, 'postare', 'postări'), 'is-accent') +
      tile('book', 'Salvări', k(t.saves)) + tile('share', 'Distribuiri', k(t.shares)) + tile('chat', 'Comentarii', k(t.comments)) +
      (Object.keys(f).length ? tile('users', 'Urmăritori noi', signed(won), '', won > 0 ? 'is-good' : '') : '') + '</div></section>';
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
        '<div class="cn-nc-s">' + mini('eye', p.views, 'Vizualizări') + mini('book', p.saves, 'Salvări') + mini('share', p.shares, 'Distribuiri') + mini('chat', p.comments, 'Comentarii') + '</div></div>';
    }).join('') + '</div></section>';
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
    return '<section class="cn-sec"><h3>Cele mai bune ore</h3><div class="cn-hms">' + nets.map((n) => {
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
    }).join('') + '</div></section>';
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
    return status + qa + preview(it) + '<section class="cn-caps">' + caps + '</section>' + fc + (plan ? '<ul class="cn-plan">' + plan + '</ul>' : '');
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
  function openSettings() {
    const st = S.d.settings;
    const t = (n, i) => '<label class="k-field"><span>' + (i === 'p' ? (n === 'tt' ? 'Ora slideshow' : 'Ora carusel') : 'Ora ' + (i + 1)) + '</span><input type="text" inputmode="numeric" maxlength="5" placeholder="hh:mm" data-cttime="' + n + '|' + i + '" value="' + esc(i === 'p' ? st.photoTime[n] || '' : st.times[n][i] || '') + '"></label>';
    const q = (n, w, kind, label) => '<label class="k-field"><span>' + label + '</span><input type="number" inputmode="numeric" min="0" max="' + (kind === 'reel' ? 28 : 7) + '" data-ctq="' + w + '|' + n + '|' + kind + '" value="' + esc(String(st.quotas[w][n][kind] != null ? st.quotas[w][n][kind] : 0)) + '"></label>';
    const pk = { tt: 'slideshow', ig: 'carousel', fb: 'carousel' };
    const card = (n) => '<div class="cn-netc"><div class="cn-setr">' + badge(n) + '<b>' + NET[n] + '</b>' + K.toggle('net_' + n, st.nets[n]) + '</div>' +
      '<div class="cn-nf">' + t(n, 0) + t(n, 1) + (pk[n] ? t(n, 'p') : '<span></span>') + '</div>' +
      '<div class="cn-nf">' + q(n, 'warm', 'reel', 'Reels săpt. 1-' + st.warmWeeks) + q(n, 'full', 'reel', 'Reels apoi') + (pk[n] ? q(n, 'full', pk[n], n === 'tt' ? 'Slideshow' : 'Carusele') : '<span></span>') + '</div></div>';
    const body = '<section class="cn-set"><h5>Rețele, ore și cote pe săptămână</h5>' + NETS.map(card).join('') + '</section>' +
      '<section class="cn-set"><h5>Prima săptămână</h5><label class="k-field"><span>Luni</span><input type="date" data-ctstart value="' + esc(st.startWeek) + '"></label></section>' +
      '<section class="cn-set"><h5>Concurenți</h5><label class="k-field"><span>Nu apar în texte</span><input type="text" data-ctcomp maxlength="600" placeholder="Nume, despărțite prin virgulă" value="' + esc((st.competitors || []).join(', ')) + '"></label></section>';
    const d = K.drawer({
      title: 'Setări conținut', icon: 'sliders', width: 480, body, focus: false,
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
          if (await save({ action: 'settings', nets, times, photoTime, quotas, startWeek: start || st.startWeek, competitors }, b)) { K.ui().toast('Salvat.', 'success'); d.close(); }
        });
      },
    });
  }

  K.section('continut', { mount, show() { load(); } });
})();
