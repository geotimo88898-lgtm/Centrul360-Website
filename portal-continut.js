// Centrul360 portal, Marketing → „Conținut” (the owner, 12.11): the weekly batch of organic reels and carousels the
// producer hands in (api/content-intake.js). Here the owner looks at next week before it goes out: a board of days ×
// networks, each item with its video, its text per network (editable), Aprobă / Refă, and „Aprobă toată
// săptămâna”; this week below it; then the week's top, what needs a look and the last posted with their numbers.
// The clock posts only what is approved (api/_lib/content-post.js). Admin only.
(function () {
  'use strict';
  const K = window.K;
  if (!K) return;
  const { esc, icon } = K;
  const S = { d: null, busy: false };
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

  // ------------------------------------------------------------------ the page
  function mount(p) {
    panel = p;
    panel.classList.add('k-panel', 'cn');
    panel.innerHTML = '<div class="k-head"><div><div class="k-eyebrow">Marketing</div><h2>Conținut</h2></div><div class="k-head-actions" data-cthead></div></div><div data-ctbody><div class="k-skel" style="height:420px"></div></div>';
    panel.addEventListener('click', async (e) => {
      const all = e.target.closest('[data-ctall]');
      if (all) return approveAll(all);
      const it = e.target.closest('[data-ctitem]'); if (it) return openItem(it.dataset.ctitem);
      if (e.target.closest('[data-ctset]')) return openSettings();
      if (e.target.closest('[data-ctgo]')) return K.go('integrari');
    });
    panel.addEventListener('change', (e) => { if (e.target.name === 'cton') save({ action: 'settings', on: e.target.checked }); });
  }
  async function load() {
    try { S.d = await K.api('/api/portal-content', { action: 'get' }); paint(); }
    catch (err) { const b = panel && panel.querySelector('[data-ctbody]'); if (b) b.innerHTML = K.empty('alert', 'Nu am putut încărca conținutul', esc(K.errText(err))); }
  }
  const ERR = { not_approved: 'Întâi aprobă materialul.', paused: 'Postarea automată e oprită.', not_ready: 'Materialul se reface acum.', already_posted: 'E postat peste tot.' };
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
    panel.querySelector('[data-ctbody]').innerHTML = access() + board(s.next, 'Săptămâna viitoare', true) + board(s.current, 'Săptămâna asta', false) + topWeek() + errors() + last();
    if (dr && openId && !quiet) { const it = S.d.items.find((x) => x.id === openId); if (it) { const y = dr.body.scrollTop; dr.body.innerHTML = itemBody(it); dr.body.scrollTop = y; dr.el.querySelector('.k-dfoot') && (dr.el.querySelector('.k-dfoot').innerHTML = itemFoot(it)); } }
  }
  function access() {
    const a = S.d.access;
    if (!a.connected) return '<p class="cn-line is-bad">' + icon('alert') + '<span>Facebook nu e conectat.</span><button type="button" class="k-btn is-ghost is-sm" data-ctgo>Integrări</button></p>';
    if (a.missing && a.missing.length) return '<p class="cn-line">' + icon('key') + '<span>Lipsesc permisiunile ' + esc(a.missing.join(', ')) + '</span><button type="button" class="k-btn is-ghost is-sm" data-ctgo>Reconectează</button></p>';
    return '';
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
    const extra = loose.length ? '<div class="cn-loose"><small>Fără loc</small><div>' + loose.map((it) => '<button type="button" class="cn-chip is-' + review(it) + '" data-ctitem="' + esc(it.id) + '" title="' + esc(title(it)) + '">' + thumb(it) + mark(it, null) + '</button>').join('') + '</div></div>' : '';
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
  function chip(it, e) {
    return '<button type="button" class="cn-chip is-' + e.state + ' is-' + review(it) + '" data-ctitem="' + esc(it.id) + '" title="' + esc(NET[e.net] + ' · ' + title(it) + ' · ' + STATE[e.state]) + '">' +
      thumb(it) + mark(it, e) + '<time>' + fTime.format(new Date(e.at)) + '</time></button>';
  }
  async function approveAll(btn) {
    const n = Number(btn.dataset.n) || 0;
    if (!(await K.ui().confirm({ title: 'Aprobi ' + pl(n, 'material', 'materiale') + '?', confirmText: 'Aprobă' }))) return;
    const r = await save({ action: 'approve_week', week: btn.dataset.ctall }, btn);
    if (r) K.ui().toast(r.approved === 1 ? 'Aprobat.' : pl(r.approved || 0, 'material aprobat', 'materiale aprobate') + '.', 'success');
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
      (r === 'redo' && it.state === 'draft' ? '<p class="cn-rv-w">' + icon('refresh') + 'Se reface</p>' : '') + '</div>';
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
        (e.state === 'posted' && it.stats && it.stats[e.net] ? statLine(it.stats[e.net]) : '') +
        (can ? '<button type="button" class="k-btn is-outline is-sm" data-ctnow="' + e.net + '">' + icon('arrow') + 'Postează acum</button>' : '') + '</li>';
    }).join('');
    return status + preview(it) + '<section class="cn-caps">' + caps + '</section>' + (plan ? '<ul class="cn-plan">' + plan + '</ul>' : '');
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
      '<section class="cn-set"><h5>Prima săptămână</h5><label class="k-field"><span>Luni</span><input type="date" data-ctstart value="' + esc(st.startWeek) + '"></label></section>';
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
          if (await save({ action: 'settings', nets, times, photoTime, quotas, startWeek: start || st.startWeek }, b)) { K.ui().toast('Salvat.', 'success'); d.close(); }
        });
      },
    });
  }

  K.section('continut', { mount, show() { load(); } });
})();
