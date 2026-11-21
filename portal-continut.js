// Centrul360 portal, Marketing → „Content” (renamed from „Conținut”, the owner, 15.11; the section's id stays
// `continut`, so the old links and notifications still open it). Three tabs:
//  - „Insights” (first): what is useful to him and to the producer, numbers first, a line that says what it means
//    under each: the key numbers, the week's analysis, the monthly goals, the networks (followers, growth, rates), the
//    organic funnel, „Merge tare 🔥” (with „Fă reclamă din asta”), what to make more of, the top 10, what works
//    (rubrics, topics, hooks), the audience, the hours (one tap saves them), what people say, last month, the moments
//    ahead, his ideas (api/_lib/content-learn.js, content-insights.js). Each block says what will appear and when
//    while it has no data yet.
//  - „Transit” (#continut/transit, also #continut/program): the queue to approve, one item at a time, full height,
//    like Tinder: the video plays (the preview with the music; the clean one is what posts), where and when it goes on
//    each network is on the card, the texts per network a tap away; ✓ / a swipe right / → approves it (its planned
//    slots are its places in the Calendar), ✕ / a swipe left / ← opens „Ce schimbăm?”: the areas (Video, Muzică, Text
//    pe ecran, Caption, Descriere, Hashtag-uri, Altceva), his words, links and files of reference (photos, videos,
//    music, from the phone's picker, up to 200 MB each); it goes to the producer (reels/PRODUCER.md „Refacerea”) and
//    comes back here once redone. A note can go with an approval too (a lesson for the producer). „Anulează”, the
//    counter („3 din 7”), „Aprobă tot (N)”: everything in Transit, all weeks, N its count (the owner, 15.11). The bar's
//    switch shows the whole queue as a grid of covers instead (remembered per device); a tap opens that one as the card.
//  - „Calendar” (#continut/calendar): what posts when, a week (the default) or a month, per network; a day with many
//    posts shows compact chips (time, network, cover) and „+N”, which opens the whole day; a post opens its drawer
//    (preview, time, networks, state, skip a network, post now, its numbers). Today marked; what went out shows its
//    views. Above it: what needs a look (errors, holds) and the connections; under it, the last posted.
//  - „Galerie” (#continut/galerie, the owner, 15.11): every reel approved or posted, as a grid of covers: „Toate”,
//    „Favorite” (the star, on any item: the Transit card, the grid, the drawer, here) and „Cele mai bune” (by the real
//    numbers: views, then saves and shares; empty until the first posts have numbers). A tap opens the item's drawer.
// An item's drawer: the owner's look, the texts' check, the statistics, the video, the texts (editable), the plan per
// network and, once posted on Instagram or Facebook, „Fă reclamă din asta” (api/_lib/content-boost.js). Admin only.
// „De postat” (the owner, 14.11: he posts from each app, with a licensed trending sound), on top of every tab: the
// slots of the networks in „Din aplicație” mode that came due (api/_lib/content-app.js), one card each, phone first:
// the preview, „Distribuie” (the clean MP4 through the phone's share sheet, else a download), the texts to copy, the
// hint for the sound, „Am postat” (the link optional), „Nu pot acum”, „Sari peste”. A push opens its card
// (#continut/de-postat~<id>~<net>).
(function () {
  'use strict';
  const K = window.K;
  if (!K) return;
  const { esc, icon } = K;
  // Transit as one card or as a grid (the owner, 15.11), remembered on this device
  const VIEW_KEY = 'c360_ct_trview';
  const readView = () => { try { return localStorage.getItem(VIEW_KEY) === 'grid' ? 'grid' : 'card'; } catch (e) { return 'card'; } };
  const saveView = (v) => { try { localStorage.setItem(VIEW_KEY, v); } catch (e) { /* private mode: this visit only */ } };
  const S = { d: null, busy: false, tab: 'ins', r: null, rErr: '', rAt: 0, warn: {}, an: '', fm: 'month', drafts: {}, wide: null, tpOpen: {},
    // sound: on once he turned it on (the owner, 15.11: "nu pot să aud sound-ul la transit"), for the next videos too
    tr: { seen: 0, last: null, focus: '', cap: null, moved: false, skip: [], view: readView() }, sound: false, cal: { view: 'week', day: '', nets: [] },
    // Galerie: every item approved or posted (read when the tab opens), the segment, the favourites being saved
    gal: { list: null, at: 0, err: '', busy: false, seg: 'all' }, favBusy: {} };
  let panel = null, dr = null, openId = '';

  const NETS = ['tt', 'yt', 'ig', 'fb'];
  const NET = { ig: 'Instagram', fb: 'Facebook', tt: 'TikTok', yt: 'YouTube' };
  const NET_S = { ig: 'IG', fb: 'FB', tt: 'TT', yt: 'YT' };
  const AS = { reel: ['tt', 'yt', 'ig', 'fb'], carousel: ['ig', 'fb', 'tt'], slideshow: ['tt'], story: ['ig', 'fb'] };
  const CAP_MAX = { tt: 2200, yt: 100, ig: 2200, fb: 5000 };
  const KIND = { reel: 'Reel', carousel: 'Carusel', slideshow: 'Slideshow', story: 'Story' };
  const STATE = { planned: 'Programat', todo: 'De postat', posting: 'Se publică', posted: 'Postat', error: 'Eroare', waiting_access: 'Așteaptă acces', skipped: 'Scos', missed: 'Ratat' };
  const TONE = { planned: 'is-info', todo: 'is-warn', posting: 'is-warn', posted: 'is-good', error: 'is-bad', waiting_access: '', skipped: '', missed: '' };
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
  // a reel's two videos: the preview with the music (approved, posted by the API) and the clean one (role 'clean')
  const byName = (a, b) => a.name.localeCompare(b.name, 'en', { numeric: true });
  const mainVid = (it) => (it.files || []).slice().sort(byName).find((f) => f.mime === 'video/mp4' && f.role !== 'clean') || null;
  const cleanVid = (it) => (it.files || []).find((f) => f.mime === 'video/mp4' && f.role === 'clean') || null;
  const modeOf = (net) => ((S.d && S.d.settings.modes) || {})[net] === 'auto' ? 'auto' : 'app';
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
  const HOOK = { intrebare: 'Întrebare', cifra: 'Cifră', contra: 'Contraintuitiv', pov: 'POV', socant: 'Șocant', poveste: 'Poveste' };
  const hookName = (h) => HOOK[h] || (h ? h.charAt(0).toUpperCase() + h.slice(1).replace(/-/g, ' ') : '');
  const signed = (n) => (n > 0 ? '+' : n < 0 ? '-' : '') + k(Math.abs(n));

  // ------------------------------------------------------------------ the page
  function mount(p) {
    panel = p;
    panel.classList.add('k-panel', 'cn');
    panel.innerHTML = '<div class="k-head"><div><div class="k-eyebrow">Marketing</div><h2>Content</h2></div><div class="k-head-actions" data-cthead></div></div><div data-ctbody><div class="k-skel" style="height:420px"></div></div>';
    panel.addEventListener('click', async (e) => {
      // the star: a favourite on or off (Transit, the grid, Galerie)
      const fv = e.target.closest('[data-ctfav]');
      if (fv) return toggleFav(fv.dataset.ctfav);
      const sh = e.target.closest('[data-ctshare]');
      if (sh) return shareVid(sh.dataset.ctshare);
      // Transit: one card or the grid; a cover in the grid opens that one as the card
      const vw = e.target.closest('[data-ctview]');
      if (vw) { const v = vw.dataset.ctview === 'grid' ? 'grid' : 'card'; if (v !== S.tr.view) { S.tr.view = v; saveView(v); S.tr.cap = null; paintTransit(); } return; }
      const gt = e.target.closest('[data-cttr-open]');
      if (gt) { S.tr.focus = gt.dataset.cttrOpen; S.tr.view = 'card'; S.tr.cap = null; paintTransit(); const c = panel.querySelector('.cn-tx'); if (c) { const y = c.getBoundingClientRect().top; if (y < 60 || y > window.innerHeight * 0.4) window.scrollTo({ top: Math.max(0, y + window.scrollY - 76), behavior: still ? 'auto' : 'smooth' }); } return; }
      // De postat: a card's buttons
      const tp = e.target.closest('[data-cttp]');
      if (tp) {
        const [id, net] = tp.dataset.cttp.split('~'), it = S.d && S.d.items.find((x) => x.id === id);
        const sh = e.target.closest('[data-cttp-share]'); if (sh && it) return shareIt(sh, it, net);
        const cp = e.target.closest('[data-cttp-copy]'); if (cp && it) return copyFor(it, net, cp.dataset.cttpCopy);
        const sn = e.target.closest('[data-cttp-snooze]'); if (sn && it) return snoozeIt(sn, it, net);
        const sk = e.target.closest('[data-cttp-skip]'); if (sk && it) return skipIt(sk, it, net);
      }
      const tpo = e.target.closest('[data-cttp-open]');
      if (tpo) { S.tpOpen[tpo.dataset.cttpOpen] = true; paint(true); const c = panel.querySelector('[data-cttp="' + tpo.dataset.cttpOpen + '"]'); if (c) c.scrollIntoView({ block: 'nearest', behavior: still ? 'auto' : 'smooth' }); return; }
      const all = e.target.closest('[data-ctall]');
      if (all) return approveAll(all);
      const del = e.target.closest('[data-ctidel]');
      if (del) { if (await save({ action: 'idea_del', id: del.dataset.ctidel }, del)) K.ui().toast('Idee ștearsă.', 'success'); return; }
      // the video's own controls (back, play, forward, full screen); the position bar is a slider
      const vcb = e.target.closest('[data-ctv]');
      if (vcb) { const box = vcb.closest('.cn-rc-m'); return vctl(box && box.querySelector('video[data-ctvid]'), vcb.dataset.ctv); }
      if (e.target.closest('[data-ctvc]')) return;
      // Transit: approve, redo, a note, undo, a network's text
      const card = e.target.closest('[data-cttr]');
      if (card) {
        const it = current();
        if (e.target.closest('[data-cttr-undo]')) return undoLast();
        if (it && e.target.closest('[data-cttr-ok]')) return decide(it.id, 'ok');
        if (it && e.target.closest('[data-cttr-no]')) return openRedo(it.id);
        if (it && e.target.closest('[data-cttr-note]')) return openRedo(it.id, 'note');
        if (it && e.target.closest('[data-cttr-skip]')) return skipItem(it.id);
        const cn = e.target.closest('[data-cttr-cap]');
        if (it && cn) { const n = cn.dataset.cttrCap; S.tr.cap = S.tr.cap && S.tr.cap.id === it.id && S.tr.cap.net === n && !S.wide ? { id: it.id, net: '' } : { id: it.id, net: n }; return repaintCaps(it); }
      } else if (e.target.closest('[data-cttr-undo]')) return undoLast();
      // a tap anywhere on a video's box (the video, the blurred sides, the speaker): sound on or off
      const vb = e.target.closest('[data-ctsnd], .cn-rc-m');
      const v = vb && (vb.matches('.cn-rc-m') ? vb : vb.closest('.cn-rc-m')).querySelector('video[data-ctvid]');
      if (v) { if (S.tr.moved) { S.tr.moved = false; return; } return sound(v); }
      const tg = e.target.closest('[data-cttab-go]');
      if (tg) { setTab(tg.dataset.cttabGo); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
      // Calendar: move, a day, a network on or off
      const cg = e.target.closest('[data-ctcal-go]'); if (cg) return calGo(Number(cg.dataset.ctcalGo));
      const cf = e.target.closest('[data-ctcal-net]');
      if (cf) { const n = cf.dataset.ctcalNet, l = S.cal.nets.length ? S.cal.nets.slice() : NETS.slice(); const i = l.indexOf(n); if (i >= 0) l.splice(i, 1); else l.push(n); S.cal.nets = l.length === NETS.length || !l.length ? [] : l; return paint(true); }
      const cd = e.target.closest('[data-ctday]'); if (cd) return openDay(cd.dataset.ctday);
      const ap = e.target.closest('[data-ctapply]');
      if (ap) return applyHours(ap);
      const hb = e.target.closest('[data-cthboost]');
      if (hb) return boost(hb, hb.dataset.cthboost, hb.dataset.net);
      if (e.target.closest('[data-ctgoals]')) return openSettings(true);
      const it = e.target.closest('[data-ctitem]'); if (it) return openItem(it.dataset.ctitem, it.dataset.net);
      if (e.target.closest('[data-ctset]')) return openSettings();
      if (e.target.closest('[data-ctgo]')) return K.go('integrari');
    });
    panel.addEventListener('change', (e) => {
      if (e.target.name === 'cton') save({ action: 'settings', on: e.target.checked });
      if (e.target.name === 'cttab') setTab(e.target.value);
      if (e.target.name === 'ctgal') { S.gal.seg = ['fav', 'best'].includes(e.target.value) ? e.target.value : 'all'; paintGallery(); }
      if (e.target.name === 'ctcalv') { S.cal.view = e.target.value === 'month' ? 'month' : 'week'; paint(true); }
      if (e.target.name === 'ctfm') { S.fm = e.target.value === 'prev' ? 'prev' : 'month'; paint(true); }
      if (e.target.matches('[data-ctan]')) { S.an = e.target.value; paint(true); }
    });
    // a carousel: which photo is showing
    panel.addEventListener('scroll', (e) => {
      const c = e.target.closest && e.target.closest('[data-ctcar]'); if (!c) return;
      const n = c.parentElement.querySelector('[data-ctcarn]'); if (!n) return;
      n.textContent = (Math.round(c.scrollLeft / Math.max(1, c.clientWidth)) + 1) + '/' + c.children.length;
    }, true);
    // an idea for the next weeks; „Am postat” on a De postat card
    panel.addEventListener('submit', async (e) => {
      const done = e.target.closest('[data-cttp-done]');
      if (done) { e.preventDefault(); const [id, net] = done.closest('[data-cttp]').dataset.cttp.split('~'); return postedIt(done, id, net); }
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
    // a phone turned or a window resized across the wide layout: the card follows (the text open or not)
    if (window.matchMedia) { const mq = window.matchMedia('(min-width: 900px)'); const on = () => { const w = mq.matches; if (w !== S.wide) { S.wide = w; if (S.tab === 'tr' && S.d) paintTransit(); } }; if (mq.addEventListener) mq.addEventListener('change', on); }
  }
  // a network's text on the Transit card, opened or closed (the video keeps playing)
  function repaintCaps(it) {
    const host = panel.querySelector('[data-cttrid="' + it.id + '"] .cn-tx-caps'); if (!host) return paintTransit();
    const tmp = document.createElement('div'); tmp.innerHTML = trCard(it);
    host.replaceWith(tmp.querySelector('.cn-tx-caps'));
  }
  // Insights, Transit, Calendar or Galerie (old links: „program” opens Transit, „rezultate” Insights)
  const TABS = { ins: 'ins', insights: 'ins', rezultate: 'ins', res: 'ins', tr: 'tr', transit: 'tr', program: 'tr', week: 'tr', aprobare: 'tr', cal: 'cal', calendar: 'cal', gal: 'gal', galerie: 'gal', gallery: 'gal', favorite: 'gal' };
  function setTab(t) {
    S.tab = TABS[String(t || '').toLowerCase()] || 'ins';
    if (!panel || !S.d) return;
    paint(true);
    if (S.tab === 'ins') loadResults();
    if (S.tab === 'gal') loadGallery();
  }
  // a push for a reel to post opens its card: #continut/de-postat~<id>~<net> (the tab stays as it is)
  K.on('continut:sub', (sub) => {
    const m = /^de-postat(?:~([0-9a-f-]{36})~(tt|yt|ig|fb))?$/.exec(String(sub || ''));
    if (m) { S.focus = m[1] ? m[1] + '~' + m[2] : 'all'; focusCard(false); return; }
    setTab(sub);
  });
  async function load() {
    try { S.d = await K.api('/api/portal-content', { action: 'get' }); paint(); focusCard(true); }
    catch (err) { const b = panel && panel.querySelector('[data-ctbody]'); if (b) b.innerHTML = K.empty('alert', 'Nu am putut încărca Content', esc(K.errText(err))); }
    if (S.tab === 'ins') loadResults();
    if (S.tab === 'gal') loadGallery(true);
  }
  // Insights: read when the tab opens (again after a minute)
  async function loadResults(force) {
    if (!force && S.r && Date.now() - S.rAt < 60e3) return;
    try { S.r = await K.api('/api/portal-content', { action: 'results' }); S.rErr = ''; S.rAt = Date.now(); }
    catch (err) { S.rErr = K.errText(err); }
    if (S.tab === 'ins' && S.d) paint(true);
    // an open drawer shows the item's funnel once Insights is there
    if (dr && openId) { const it = S.d && itemById(openId); if (it) { const y = dr.body.scrollTop; dr.body.innerHTML = itemBody(it); dr.body.scrollTop = y; } }
  }
  const ERR = { not_approved: 'Întâi aprobă materialul.', paused: 'Programul e oprit.', not_ready: 'Materialul se reface acum.', already_posted: 'E postat deja.', idea_too_short: 'Scrie ideea pe scurt.',
    invalid_link: 'Linkul nu e al unei postări de pe rețeaua asta.', not_todo: 'Cardul s-a schimbat între timp.', reason_required: 'Alege un motiv.', not_manual: 'Linkul se pune doar la postările făcute din aplicație.',
    net_app: 'Rețeaua e pe „Din aplicație”: o postezi tu, din De postat.', nothing_to_undo: 'Nu mai e nimic de anulat.', already_redoing: 'Producătorul a început deja refacerea.', not_found: 'Materialul nu mai există.' };
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
    const st = S.d.settings;
    if (S.wide == null) S.wide = !!(window.matchMedia && window.matchMedia('(min-width: 900px)').matches);
    if (!S.cal.day) S.cal.day = S.d.today;
    // the switch runs the whole program: the API's posts and the De postat cards alike
    panel.querySelector('[data-cthead]').innerHTML = K.toggle('cton', st.on, st.on ? 'Postare pornită' : 'Postare oprită') +
      '<button type="button" class="k-icon-btn" data-ctset aria-label="Setări">' + icon('sliders') + '</button>';
    const body = panel.querySelector('[data-ctbody]');
    // a text being typed in the ideas box survives a repaint
    const typing = body.querySelector('[data-ctidea] input[name=text]'), draft = typing && !S.ideaSent ? typing.value : '', focused = typing && document.activeElement === typing;
    const pend = queue().length;
    const tabs = '<div class="cn-tabs">' + K.seg('cttab', [['ins', 'Insights', 'trend'], ['tr', pend ? 'Transit · ' + pend : 'Transit', 'checkCircle'], ['cal', 'Calendar', 'calendar'], ['gal', 'Galerie', 'image']], S.tab, 'cn-tabseg') + '</div>';
    // a link being typed on a De postat card survives a repaint too
    const links = {};
    body.querySelectorAll('[data-cttp] input[name=link]').forEach((x) => { if (x.value) links[x.closest('[data-cttp]').dataset.cttp] = x.value; });
    const linkFocus = document.activeElement && document.activeElement.closest && document.activeElement.closest('[data-cttp] [data-cttp-done]') ? document.activeElement.closest('[data-cttp]').dataset.cttp : '';
    stopMedia();
    const page = S.tab === 'tr' ? '<div data-cttrhost>' + transit() + '</div>'
      : S.tab === 'cal' ? access() + errors() + calendar() + last()
        : S.tab === 'gal' ? '<div data-ctgalhost>' + gallery() + '</div>'
          : banner(pend) + resTab() + seasonBox() + ideasBox();
    body.innerHTML = tabs + toPost() + '<div class="cn-page is-' + S.tab + '">' + page + '</div>';
    const t2 = body.querySelector('[data-ctidea] input[name=text]');
    if (t2 && draft) { t2.value = draft; if (focused) t2.focus(); }
    Object.keys(links).forEach((key) => { const x = body.querySelector('[data-cttp="' + key + '"] input[name=link]'); if (x) { x.value = links[key]; if (key === linkFocus) x.focus(); } });
    wireMedia(body);
    wireShare(body);
    if (S.tab === 'tr') wireSwipe(body);
    K.badge('continut', pend);
    if (dr && openId && !quiet) { const it = itemById(openId); if (it) { const y = dr.body.scrollTop; dr.body.innerHTML = itemBody(it); dr.body.scrollTop = y; dr.el.querySelector('.k-dfoot') && (dr.el.querySelector('.k-dfoot').innerHTML = itemFoot(it)); } }
  }
  // items wait for the owner's look: the way to Transit, on top of Insights
  function banner(n) {
    if (!n) return '';
    const it = queue()[0];
    return '<button type="button" class="cn-ban" data-cttab-go="tr"><span class="cn-ban-ic">' + icon('checkCircle') + '</span><span class="cn-main"><b>' + pl(n, 'material', 'materiale') + ' de aprobat</b><small>' + esc(it && it.week ? 'Săptămâna ' + range(it.week) : 'În Transit') + '</small></span><span class="cn-ban-go">Transit' + icon('right') + '</span></button>';
  }
  // „Aprobă tot (N)” (the owner, 15.11: „să fie corelat cu nr de transit-uri”): everything in Transit, every week; the
  // ids he saw go along, so one that arrives meanwhile still waits for his look
  async function approveAll(btn) {
    const q = queue(), n = q.length;
    if (!n || S.busy) return;
    if (!(await K.ui().confirm({ title: n === 1 ? 'Aprobi materialul?' : 'Aprobi toate cele ' + n + '?', message: 'Intră în calendar, pe orele lor.', confirmText: 'Aprobă tot' }))) return;
    const r = await save({ action: 'approve_all', ids: q.map((x) => x.id) }, btn);
    if (r) { S.tr.seen += r.approved || 0; S.tr.last = null; S.tr.focus = ''; S.tr.skip = []; K.ui().toast(r.approved === 1 ? 'Aprobat.' : pl(r.approved || 0, 'material aprobat', 'materiale aprobate') + '.', 'success'); }
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

  // ------------------------------------------------------------------ De postat (the networks in „Din aplicație” mode)
  const isTodo = (it, e) => e.state === 'todo' && it.state === 'ready' && review(it) === 'approved' && !it.removed && !it.dropped;
  const later = (e) => !!(e.snoozeUntil && Date.parse(e.snoozeUntil) > Date.now());
  const todos = () => entries().filter(({ it, e }) => isTodo(it, e)).sort((a, b) => (later(a.e) - later(b.e)) || a.e.at.localeCompare(b.e.at));
  const mb = (n) => (n >= 1e6 ? (Math.round(n / 1e5) / 10).toLocaleString('ro-RO') + ' MB' : Math.max(1, Math.round(n / 1e3)) + ' KB');
  const slugOf = (x) => String(x || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'material';
  function toPost() {
    const list = todos();
    if (!list.length) return '';
    const wait = list.filter((x) => later(x.e)).length;
    // one line each, so every tab starts with its own content; a tap opens the card (a push opens it too)
    const full = false;
    const one = ({ it, e }) => { const key = it.id + '~' + e.net; return full || S.tpOpen[key] ? tpCard(it, e) : '<button type="button" class="cn-tpr' + (later(e) ? ' is-later' : '') + '" data-cttp-open="' + esc(key) + '">' + thumb(it) +
      '<span class="cn-main"><b>' + esc(title(it)) + '</b><small>' + badge(e.net) + NET[e.net] + ' · ' + esc(later(e) ? 'revine ' + when(e.snoozeUntil) : when(e.at)) + '</small></span><span class="cn-tpr-go">' + icon('share') + '<span>Postează</span></span></button>'; };
    return '<section class="cn-sec cn-tp' + (full ? '' : ' is-compact') + '" data-cttps><div class="cn-tp-h"><h3>De postat</h3><span class="k-tag is-warn">' + (list.length - wait) + '</span>' +
      (wait ? '<span class="k-tag">' + icon('clock') + wait + ' mai târziu</span>' : '') + '</div><div class="cn-tps">' + list.map(one).join('') + '</div></section>';
  }
  // what „Distribuie” sends: a reel's clean MP4 (the one with the music while the clean one is missing), or the photos
  function shareFiles(it) {
    const files = (it.files || []).slice().sort(byName);
    if (photo(it)) return files.filter((f) => /^image\//.test(f.mime));
    const v = cleanVid(it) || mainVid(it);
    return v ? [v] : [];
  }
  const shareName = (it, net, f, i, n) => 'centrul360-' + slugOf(title(it)) + '-' + NET[net].toLowerCase() + (n > 1 ? '-' + String(i + 1).padStart(2, '0') : '') + '.' + (f.name.split('.').pop().toLowerCase().replace('jpeg', 'jpg'));
  function tpCard(it, e) {
    const key = it.id + '~' + e.net, c = e.copy || {}, wait = later(e), kind = e.kind || it.kind;
    const files = shareFiles(it), size = files.reduce((n, f) => n + (f.size || 0), 0);
    const noClean = it.kind === 'reel' && !cleanVid(it);
    const what = it.kind === 'reel' ? (noClean ? 'cu muzică' : 'fără muzică') : pl(files.length, 'poză', 'poze');
    const when2 = wait ? '<span class="cn-when is-off">' + icon('clock') + 'Revine ' + esc(when(e.snoozeUntil)) + '</span>' : '<span class="cn-when">' + icon('clock') + esc(when(e.at)) + '</span>';
    const head = '<header class="cn-tp-ch">' + badge(e.net) + '<b>' + NET[e.net] + '</b><small>' + esc(KIND[kind] || '') + '</small>' + when2 + '</header>' +
      '<div class="cn-tp-tt"><h4>' + esc(title(it)) + '</h4>' + (it.hook ? '<p>„' + esc(it.hook) + '”</p>' : '') + '</div>';
    const acts = '<div class="cn-tp-x">' +
      '<button type="button" class="k-btn is-primary is-lg cn-tp-share" data-cttp-share' + (files.length ? '' : ' disabled') + '>' + icon('share') + '<span>Distribuie</span><small>' + esc(what + (size ? ' · ' + mb(size) : '')) + '</small></button>' +
      (noClean ? '<p class="cn-tp-w">' + icon('alert') + '<span>Fișierul fără muzică lipsește: se trimite varianta cu muzică.</span></p>' : '') +
      '<div class="cn-tp-cp"><button type="button" class="k-btn is-outline" data-cttp-copy="text"' + (c.text ? '' : ' disabled') + '>' + icon('copy') + '<span>Copiază textul</span></button>' +
      (c.comment ? '<button type="button" class="k-btn is-outline" data-cttp-copy="comment">' + icon('chat') + '<span>Copiază primul comentariu</span></button>' : '') + '</div>' +
      (c.hint ? '<p class="cn-tp-hint">' + mi('note') + '<span>' + esc(c.hint) + '</span></p>' : '') +
      '<form class="cn-tp-done" data-cttp-done autocomplete="off"><input type="url" name="link" inputmode="url" enterkeyhint="done" placeholder="Linkul postării (opțional)" aria-label="Linkul postării pe ' + NET[e.net] + '">' +
      '<button type="submit" class="k-btn is-good">' + icon('check') + '<span>Am postat</span></button></form>' +
      '<div class="cn-tp-more"><button type="button" class="k-btn is-ghost is-sm" data-cttp-snooze>' + icon('clock') + 'Nu pot acum</button><button type="button" class="k-btn is-ghost is-sm" data-cttp-skip>' + icon('ban') + 'Sari peste</button></div></div>';
    return '<article class="cn-tp-c is-' + e.net + (wait ? ' is-later' : '') + '" data-cttp="' + esc(key) + '">' + head + '<div class="cn-tp-b">' + media(it) + acts + '</div></article>';
  }
  // the files of a card, fetched once (so the tap that shares them still counts as the tap on iOS)
  const shareReady = new Map(), shareDone = new Set();
  const canShareFiles = () => !!(navigator.share && navigator.canShare);
  function prep(it, net) {
    const key = it.id + '~' + net;
    if (!shareReady.has(key)) {
      const list = shareFiles(it);
      const p = Promise.all(list.map((f, i) => fetch(fileUrl(it, f.name), { credentials: 'same-origin' }).then((r) => { if (!r.ok) throw new Error('http ' + r.status); return r.blob(); })
        .then((b) => new File([b], shareName(it, net, f, i, list.length), { type: f.mime }))));
      p.then(() => shareDone.add(key), () => shareReady.delete(key));
      shareReady.set(key, p);
    }
    return shareReady.get(key);
  }
  // a card in view: its files start coming (only where the phone can share files)
  let ioShare = null;
  function wireShare(root) {
    const cards = root.querySelectorAll('[data-cttp]');
    if (!cards.length || !canShareFiles() || !('IntersectionObserver' in window)) return;
    if (!ioShare) ioShare = new IntersectionObserver((list) => list.forEach((x) => {
      if (!x.isIntersecting) return;
      ioShare.unobserve(x.target);
      const [id, net] = x.target.dataset.cttp.split('~'), it = S.d && S.d.items.find((y) => y.id === id);
      if (it) prep(it, net).catch(() => {});
    }), { rootMargin: '200px 0px' });
    cards.forEach((c) => ioShare.observe(c));
  }
  // the network's text in the clipboard with the same tap, so it is there to paste in the app (best effort: never
  // awaited, the share sheet must open within the tap)
  function copySilently(it, net) {
    const e = entryOf(it, net), t = e && e.copy && e.copy.text;
    if (!t || !navigator.clipboard || !navigator.clipboard.writeText) return false;
    navigator.clipboard.writeText(t).catch(() => {});
    return true;
  }
  // „Distribuie”: the phone's share sheet with the files (TikTok, Instagram, Save); without it, a normal download
  async function shareIt(btn, it, net) {
    const list = shareFiles(it);
    if (!list.length) return;
    const copied = copySilently(it, net);
    if (!canShareFiles()) { download(it, net, list, copied); return; }
    const key = it.id + '~' + net, had = shareDone.has(key);
    let files;
    if (!had) { btn.disabled = true; btn.classList.add('is-busy'); }
    try { files = await prep(it, net); }
    catch (err) { K.ui().toast('Nu am putut pregăti fișierul. Încearcă din nou.', 'error'); return; }
    finally { if (btn.isConnected) { btn.disabled = false; btn.classList.remove('is-busy'); } }
    if (!navigator.canShare({ files })) { download(it, net, list, copied); return; }
    try { await navigator.share({ files }); }
    catch (err) {
      if (err && err.name === 'AbortError') return;
      // the tap ran out while the file came: it is here now, one more tap shares it
      if (err && err.name === 'NotAllowedError' && !had) { K.ui().toast('Fișierul e gata. Apasă din nou Distribuie.', 'success'); return; }
      download(it, net, list, copied);
    }
  }
  function download(it, net, list, copied) {
    list.forEach((f, i) => setTimeout(() => {
      const name = shareName(it, net, f, i, list.length), a = document.createElement('a');
      a.href = fileUrl(it, f.name) + '&dl=1&as=' + encodeURIComponent(name); a.download = name; a.rel = 'noopener';
      document.body.appendChild(a); a.click(); a.remove();
    }, i * 350));
    K.ui().toast((list.length > 1 ? 'Se descarcă pozele.' : 'Se descarcă fișierul.') + (copied ? ' Textul e copiat.' : ''), 'success');
  }
  async function copyFor(it, net, what) {
    const e = entryOf(it, net), c = (e && e.copy) || {}, text = what === 'comment' ? c.comment : c.text;
    if (!text) return;
    let ok = false;
    try { await navigator.clipboard.writeText(text); ok = true; }
    catch (err) {
      const ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
      document.body.appendChild(ta); ta.select();
      try { ok = document.execCommand('copy'); } catch (x) { ok = false; }
      ta.remove();
    }
    K.ui().toast(ok ? (what === 'comment' ? 'Comentariul e copiat.' : 'Textul pentru ' + NET[net] + ' e copiat.') : 'Nu am putut copia.', ok ? 'success' : 'error');
  }
  // a link of the network (the server reads it again): a wrong one is said at once, never sent
  const HOSTS = { tt: /(^|\.)tiktok\.com$/, yt: /(^|\.)(youtube\.com|youtu\.be)$/, ig: /(^|\.)(instagram\.com|instagr\.am)$/, fb: /(^|\.)(facebook\.com|fb\.com|fb\.watch)$/ };
  const linkOk = (net, v) => { try { const u = new URL(v); return /^https?:$/.test(u.protocol) && HOSTS[net].test(u.hostname.toLowerCase()); } catch (e) { return false; } };
  const badLink = (net, input) => { K.ui().toast('Linkul nu e al unei postări de pe ' + NET[net] + '.', 'error'); input.focus(); };
  async function postedIt(form, id, net) {
    const link = form.elements.link.value.trim();
    if (link && !linkOk(net, link)) return badLink(net, form.elements.link);
    const r = await save({ action: 'app_posted', id, net, link }, form.querySelector('button[type=submit]'), true);
    if (r) K.ui().toast(link ? 'Notat ca postat. Cifrele vin din link.' : 'Notat ca postat. Caut postarea pe ' + NET[net] + ' ca să-i citesc cifrele.', 'success');
  }
  async function snoozeIt(btn, it, net) {
    const r = await save({ action: 'app_snooze', id: it.id, net }, btn, true);
    if (r && r.result && r.result.until) K.ui().toast('Revine ' + when(r.result.until) + '.', 'success');
  }
  const REASONS = [['moment', 'Nu e momentul potrivit'], ['sunet', 'N-am găsit un sunet potrivit'], ['retea', 'Nu se potrivește pe rețeaua asta'], ['altul', 'Alt motiv']];
  async function skipIt(btn, it, net) {
    let v = await K.ui().prompt({ title: 'Sari peste ' + NET[net] + '?', message: 'Trece pe următorul loc liber din săptămână.', options: REASONS, value: 'moment', confirmText: 'Sari peste' });
    if (v == null) return;
    let reason = (REASONS.find((x) => x[0] === v) || [])[1] || '';
    if (v === 'altul') {
      reason = await K.ui().prompt({ title: 'De ce sari peste?', value: '', confirmText: 'Sari peste' });
      if (reason == null) return;
      reason = reason.trim();
      if (reason.length < 2) { K.ui().toast('Scrie pe scurt motivul.', 'error'); return; }
    }
    const r = await save({ action: 'app_skip', id: it.id, net, reason }, btn, true);
    if (!r || !r.result) return;
    K.ui().toast(r.result.moved ? 'Mutat pe ' + short(r.result.moved) + '.' : 'Sărit: nu mai e loc liber pe ' + NET[net] + ' săptămâna asta.', 'success');
  }
  // a push opened Conținut on a card: there, and it flashes (final: after the page has its data)
  function focusCard(final) {
    if (!S.focus || !panel || !S.d) return;
    if (S.focus !== 'all' && !S.tpOpen[S.focus] && panel.querySelector('[data-cttp-open="' + S.focus + '"]')) { S.tpOpen[S.focus] = true; paint(true); }
    const exact = S.focus !== 'all' && panel.querySelector('[data-cttp="' + S.focus + '"]');
    const el = exact || (final ? panel.querySelector('[data-cttps]') : null);
    if (!el) { if (final) S.focus = ''; return; }
    S.focus = '';
    el.scrollIntoView({ behavior: still ? 'auto' : 'smooth', block: 'start' });
    el.classList.remove('is-flash'); void el.offsetWidth; el.classList.add('is-flash');
  }

  // ------------------------------------------------------------------ shared: an item's slots, its media
  const firstAt = (it) => (it.plan || []).filter((e) => e.at && e.state !== 'skipped').map((e) => e.at).sort()[0] || it.createdAt || '';
  const entryOf = (it, net) => (it.plan || []).find((e) => e.net === net && e.state !== 'skipped') || null;
  const short = (iso) => { const d = roDay(iso); return dow(d) + ' ' + Number(d.slice(8, 10)) + '.' + d.slice(5, 7) + ', ' + fTime.format(new Date(iso)); };
  // the networks an item shows: the ones it is planned on (in time order), else every network of its kind
  function netsOf(it) {
    const on = (it.plan || []).filter((e) => e.state !== 'skipped' && e.at).sort((a, b) => a.at.localeCompare(b.at)).map((e) => e.net);
    const list = [...new Set(on)];
    return list.length ? list : (AS[it.kind] || []).slice();
  }
  // where and when it goes, before he approves (the owner, 15.11): every network of its kind with its day and hour, in
  // time order, and the ones without a slot (never the same reel everywhere at once: content-plan.js spreads them)
  function slotRow(it, big) {
    const all = (AS[it.kind] || []).slice();
    const on = all.map((n) => ({ n, e: entryOf(it, n) })).filter((x) => x.e && x.e.at).sort((a, b) => a.e.at.localeCompare(b.e.at));
    const off = all.filter((n) => !on.some((x) => x.n === n));
    const chip = ({ n, e }) => {
      const d = roDay(e.at), st = e.state === 'posted' ? ' is-posted' : e.state === 'error' ? ' is-bad' : '';
      return '<span class="cn-sl is-' + n + st + '" title="' + esc(NET[n] + ', ' + when(e.at) + (e.state !== 'planned' && e.state !== 'waiting_access' ? ', ' + STATE[e.state] : '')) + '">' + badge(n) +
        '<b>' + esc(dow(d)) + (big ? ' ' + dm(d) : '') + '</b><time>' + fTime.format(new Date(e.at)) + '</time></span>';
    };
    return '<div class="cn-sls' + (big ? ' is-big' : '') + '">' + on.map(chip).join('') + off.map((n) => '<span class="cn-sl is-none" title="' + NET[n] + ': fără loc săptămâna asta">' + badge(n) + '<b>fără loc</b></span>').join('') + '</div>';
  }
  // the owner's controls on the video to approve (15.11: „să-l fac full screen și să dau în spate sau în față”): 3 s back,
  // play / pause, 3 s forward, the position (drag it), the time, full screen (the phone's own player, with its controls)
  const VI = (d) => '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>';
  const VCI = {
    back: VI('<path d="M11 7 6 12l5 5"/><path d="M18 7l-5 5 5 5"/>'), fwd: VI('<path d="m13 7 5 5-5 5"/><path d="m6 7 5 5-5 5"/>'),
    play: VI('<path d="M8 5.5v13l10-6.5z" fill="currentColor"/>'), pause: VI('<path d="M8 5v14M16 5v14"/>'),
    full: VI('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
  };
  const VC = '<div class="cn-vc" data-ctvc><button type="button" data-ctv="back" aria-label="Înapoi 3 secunde">' + VCI.back + '</button>' +
    '<button type="button" data-ctv="play" aria-label="Pornește sau oprește">' + VCI.pause + '</button>' +
    '<button type="button" data-ctv="fwd" aria-label="Înainte 3 secunde">' + VCI.fwd + '</button>' +
    '<input type="range" class="cn-vc-r" data-ctv-seek min="0" max="1000" step="1" value="0" aria-label="Poziția în video">' +
    '<span class="cn-vc-t" data-ctv-t>0:00</span><button type="button" data-ctv="full" aria-label="Pe tot ecranul">' + VCI.full + '</button></div>';
  const mmss = (x) => { x = Math.max(0, Math.floor(x || 0)); return Math.floor(x / 60) + ':' + String(x % 60).padStart(2, '0'); };
  function vload(v) { if (v && v.dataset.src) { v.src = v.dataset.src; v.removeAttribute('data-src'); } }
  function vctl(v, what) {
    if (!v) return;
    vload(v);
    const d = v.duration || 0;
    if (what === 'back') v.currentTime = Math.max(0, (v.currentTime || 0) - 3);
    else if (what === 'fwd') v.currentTime = Math.min(d ? d - 0.05 : 1e9, (v.currentTime || 0) + 3);
    else if (what === 'play') { if (v.paused) v.play().catch(() => {}); else v.pause(); }
    else if (what === 'full') {
      v.controls = true;
      const done = () => { if (!document.fullscreenElement && !document.webkitFullscreenElement) { v.controls = false; document.removeEventListener('fullscreenchange', done); } };
      document.addEventListener('fullscreenchange', done);
      v.addEventListener('webkitendfullscreen', () => { v.controls = false; }, { once: true });
      if (v.requestFullscreen) v.requestFullscreen().catch(() => { if (v.webkitEnterFullscreen) v.webkitEnterFullscreen(); });
      else if (v.webkitEnterFullscreen) v.webkitEnterFullscreen();
      if (v.paused) v.play().catch(() => {});
    }
  }
  function wireVc(v) {
    const box = v.closest('.cn-rc-m'), bar = box && box.querySelector('[data-ctvc]');
    if (!bar || v.dataset.vc) return;
    v.dataset.vc = '1';
    const r = bar.querySelector('[data-ctv-seek]'), tt = bar.querySelector('[data-ctv-t]'), pb = bar.querySelector('[data-ctv="play"]');
    let drag = false;
    // the played part is drawn by us (--p), from the bar's very start to the thumb: iOS draws its own fill off by the thumb's width
    const fill = () => { r.style.setProperty('--p', (Number(r.value) / 10).toFixed(2) + '%'); };
    const show = () => { const d = v.duration || 0; if (!drag && d) r.value = String(Math.round((v.currentTime / d) * 1000)); fill(); tt.textContent = mmss(v.currentTime) + (d ? ' / ' + mmss(d) : ''); };
    v.addEventListener('timeupdate', show); v.addEventListener('loadedmetadata', show);
    v.addEventListener('play', () => { pb.innerHTML = VCI.pause; }); v.addEventListener('pause', () => { pb.innerHTML = VCI.play; });
    r.addEventListener('input', () => { drag = true; fill(); vload(v); const d = v.duration || 0; if (d) { v.currentTime = (Number(r.value) / 1000) * d; tt.textContent = mmss(v.currentTime) + ' / ' + mmss(d); } });
    r.addEventListener('change', () => { drag = false; });
  }
  // the video (loaded when it comes near, playing while it is in view, muted until a tap) or the photos to swipe
  function media(it, cls) {
    const files = (it.files || []).slice().sort(byName);
    const vid = mainVid(it);
    if (vid) {
      return '<div class="cn-rc-m ' + (cls || '') + '">' + (it.cover ? '<img class="cn-rc-bg" src="' + esc(cover(it)) + '" alt="" aria-hidden="true">' : '') +
        '<video data-ctvid data-src="' + esc(fileUrl(it, vid.name)) + '"' + (it.cover ? ' poster="' + esc(cover(it)) + '"' : '') + ' muted playsinline loop preload="none"></video>' +
        '<button type="button" class="cn-snd is-btn' + (S.sound ? ' is-on' : '') + '" data-ctsnd aria-label="Sunet">' + (S.sound ? SPK.on : SPK.off) + '</button>' + (vid.dur ? '<span class="cn-dur">' + Math.round(vid.dur) + ' s</span>' : '') +
        (/cn-tx-m/.test(cls || '') ? VC : '') + '</div>';
    }
    const imgs = files.filter((f) => /^image\//.test(f.mime));
    return '<div class="cn-rc-m is-car ' + (cls || '') + '"><div class="cn-car" data-ctcar>' + imgs.map((f) => '<img src="' + esc(fileUrl(it, f.name)) + '" alt="" loading="lazy" decoding="async" draggable="false">').join('') + '</div>' +
      (imgs.length > 1 ? '<span class="cn-dur" data-ctcarn>1/' + imgs.length + '</span>' : '') + '</div>';
  }
  // the little marks (drawn here: the kit has no heart or note)
  const MI = {
    note: '<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
    text: '<path d="M4 7V5h16v2M12 5v14M9 19h6"/>',
    hash: '<path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18"/>',
    caption: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M7 14h4M13 14h4M7 10h10"/>',
    desc: '<path d="M4 6h16M4 10h16M4 14h10M4 18h7"/>',
    clip: '<path d="m21 11-8.6 8.6a5 5 0 0 1-7-7l8.5-8.6a3.3 3.3 0 0 1 4.7 4.7l-8.6 8.6a1.7 1.7 0 0 1-2.3-2.4l7.9-7.9"/>',
    grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.8"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.8"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.8"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.8"/>',
    card: '<rect x="6" y="2.5" width="12" height="19" rx="3"/>',
  };
  const mi = (n) => '<svg class="k-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + MI[n] + '</svg>';
  const SPK = {
    off: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M17 9l4 6M21 9l-4 6"/></svg>',
    on: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/></svg>',
  };
  const capOf = (it, net) => String((it.captions && it.captions[net]) || it.caption || '');
  const tagsOf = (t) => String(t || '').match(/#[\p{L}\p{N}_]+/gu) || [];

  // ------------------------------------------------------------------ Transit: one item at a time (the owner, 15.11)
  // „un fel de Tinder”: the item fills the screen, its video plays (the preview with the music; the clean one is what
  // posts), where and when it goes is on the card; ✓ or a swipe to the right approves it (its slots are already in
  // the Calendar), ✕ or a swipe to the left opens „De refăcut” (what to change, the areas, links and files of
  // reference); after the producer's redo it comes back here. ← → on a keyboard, „Anulează” for the last one.
  const AREAS = [['video', 'Video', 'video'], ['muzica', 'Muzică', 'note'], ['text', 'Text pe ecran', 'text'], ['caption', 'Caption', 'caption'], ['descriere', 'Descriere', 'desc'], ['hashtag', 'Hashtag-uri', 'hash'], ['altceva', 'Altceva', 'more']];
  const AREA = Object.fromEntries(AREAS.map((a) => [a[0], a[1]]));
  const areaIc = (ic) => (MI[ic] ? mi(ic) : icon(ic));
  const queue = () => S.d.items.filter((it) => it.state === 'ready' && review(it) === 'pending' && !it.removed && !it.dropped)
    .sort((a, b) => String(a.week).localeCompare(String(b.week)) || firstAt(a).localeCompare(firstAt(b)) || String(a.id).localeCompare(String(b.id)));
  const redoing = () => S.d.items.filter((it) => review(it) === 'redo' && !it.removed && !it.dropped).sort((a, b) => String(b.redoAt || b.reviewedAt || '').localeCompare(String(a.redoAt || a.reviewedAt || '')));
  function current() {
    const q = queue();
    if (S.tr.focus) { const f = q.find((x) => x.id === S.tr.focus); if (f) return f; }
    // „Următorul” (the owner, 15.11): one he skipped waits at the end of the queue, still to approve; when only skipped
    // ones are left, the round starts again from the first
    const skip = S.tr.skip || [];
    const f = q.find((x) => !skip.includes(x.id));
    if (f) return f;
    if (q.length) S.tr.skip = [];
    return q[0] || null;
  }
  function transit() {
    const q = queue(), it = current();
    const back = redoing();
    const later = back.length ? '<section class="cn-sec cn-txl"><h3>La refăcut</h3><div class="cn-list">' + back.map((x) => {
      const r = x.redo || { note: x.redoNote, areas: [] };
      const tags = (r.areas || []).map((a) => '<i class="cn-ar-t">' + esc(AREA[a] || a) + '</i>').join('') + ((r.files || []).length + (r.links || []).length ? '<i class="cn-ar-t">' + mi('clip') + ((r.files || []).length + (r.links || []).length) + '</i>' : '');
      return '<button type="button" class="cn-row" data-ctitem="' + esc(x.id) + '">' + thumb(x) + '<span class="cn-main"><b>' + esc(title(x)) + '</b>' + (r.note ? '<em class="cn-txl-n">' + esc(r.note) + '</em>' : '') + (tags ? '<span class="cn-ar-ts">' + tags + '</span>' : '') + '</span>' +
        '<span class="k-tag' + (x.state === 'draft' ? ' is-info' : '') + '">' + icon('refresh') + (x.state === 'draft' ? 'Se reface' : 'Trimis') + '</span>' + icon('right') + '</button>';
    }).join('') + '</div></section>' : '';
    const undo = S.tr.last && S.d.items.some((x) => x.id === S.tr.last.id && x.canUndo) ? '<button type="button" class="k-btn is-ghost is-sm cn-tx-undo" data-cttr-undo>' + icon('undo') + 'Anulează</button>' : '';
    if (!it) {
      const next = S.d.status && S.d.status.next, ok = (next && next.approved) || 0;
      const sub = back.some((x) => x.state === 'draft') ? 'Producătorul reface ' + pl(back.length, 'material', 'materiale') + ': apar aici imediat ce sunt gata.' : 'Lotul săptămânii care vine apare aici sâmbătă seara. Primești o notificare.';
      return '<section class="cn-tx is-empty">' + (undo ? '<div class="cn-tx-bar"><span class="k-grow"></span>' + undo + '</div>' : '') +
        '<div class="cn-tx-done"><span class="cn-tx-done-ic">' + icon('checkCircle') + '</span><b>Nimic de aprobat</b><p>' + esc(sub) + '</p>' +
        (ok ? '<button type="button" class="k-btn is-outline" data-cttab-go="cal">' + icon('calendar') + pl(ok, 'aprobat', 'aprobate') + ' în calendar' + icon('right') + '</button>' : '') + '</div></section>' + later;
    }
    // „Aprobă tot (N)”: N is the Transit count, every week (the owner, 15.11)
    const allB = q.length > 1 ? '<button type="button" class="k-btn is-ghost is-sm cn-tx-all" data-ctall>' + icon('checkCircle') + 'Aprobă tot (' + q.length + ')</button>' : '';
    const sw = q.length > 1 ? viewSwitch() : '';
    if (S.tr.view === 'grid' && q.length > 1) {
      const gbar = '<div class="cn-tx-bar"><span class="cn-tx-n"><b>' + q.length + '</b> de aprobat</span><span class="k-grow"></span>' + undo + '<span class="cn-tx-ba">' + allB + '</span>' + sw + '</div>';
      return '<section class="cn-tx is-grid">' + gbar + '<div class="cn-cvg" role="list">' + q.map((x) => tile(x, 'tr')).join('') + '</div></section>' + later;
    }
    const skipped = (S.tr.skip || []).filter((x) => q.some((y) => y.id === x)).length;
    // a cover tapped in the grid: its own place in the queue
    const total = S.tr.seen + q.length, pos = S.tr.seen + 1 + (S.tr.focus === it.id ? q.indexOf(it) : Math.min(skipped, q.length - 1));
    const dots = total <= 14 ? '<span class="cn-tx-dots" aria-hidden="true">' + Array.from({ length: total }, (_, i) => '<i class="' + (i < S.tr.seen ? 'is-done' : i === pos - 1 ? 'is-on' : '') + '"></i>').join('') + '</span>' : '<span class="cn-tx-prog" aria-hidden="true"><i style="width:' + ((S.tr.seen / total) * 100).toFixed(1) + '%"></i></span>';
    const skipB = q.length > 1 ? '<button type="button" class="k-btn is-ghost is-sm cn-tx-skip" data-cttr-skip aria-label="Următorul, fără decizie (săgeata jos)">Următorul' + icon('right') + '</button>' : '';
    // phones: the count and the switch on one line, „Următorul” and „Aprobă tot” under them, half each
    const bar = '<div class="cn-tx-bar"><span class="cn-tx-n"><b>' + pos + '</b> din ' + total + '</span>' + dots + '<span class="k-grow"></span>' + undo +
      (skipB || allB ? '<span class="cn-tx-ba">' + skipB + allB + '</span>' : '') + sw + '</div>';
    const nx = q.filter((x) => x !== it)[0];
    const peek = nx ? '<div class="cn-tx-peek" aria-hidden="true">' + (nx.cover ? '<img src="' + esc(cover(nx)) + '" alt="">' : '') + '</div>' : '';
    return '<section class="cn-tx" data-cttr>' + bar + '<div class="cn-tx-stage">' + peek + trCard(it) + '</div>' +
      '<div class="cn-tx-acts"><button type="button" class="cn-tx-b is-no" data-cttr-no aria-label="De refăcut (săgeata stânga)">' + icon('x') + '</button>' +
      '<button type="button" class="cn-tx-b is-ok" data-cttr-ok aria-label="Aprobă (săgeata dreapta)">' + icon('check') + '</button></div>' +
      '<p class="cn-tx-keys"><kbd>←</kbd> De refăcut <kbd>→</kbd> Aprobă <kbd>↓</kbd> Următorul <kbd>Z</kbd> Anulează</p></section>' + later;
  }
  function trCard(it) {
    const id = esc(it.id), q = qaOf(it);
    const meta = [KIND[it.kind], it.rubric].filter(Boolean).join(' · ');
    const nets = netsOf(it), sel = S.tr.cap && S.tr.cap.id === it.id ? S.tr.cap.net : (S.wide ? nets[0] : '');
    const prev = it.replacedAt && (it.redo || it.redoNote) ? (() => {
      const r = it.redo || { note: it.redoNote, areas: [] };
      return '<p class="cn-tx-f">' + icon('refresh') + '<span><b>Refăcut' + ((r.areas || []).length ? ': ' + esc(r.areas.map((a) => AREA[a] || a).join(', ')) : '') + '</b>' + (r.note ? esc(r.note) : '') + '</span></p>';
    })() : '';
    const bad = q.problems.length ? '<p class="cn-tx-f is-bad">' + icon('alert') + '<span>' + esc(q.problems[0]) + (q.problems.length > 1 ? ' (+' + (q.problems.length - 1) + ')' : '') + '</span></p>' : '';
    const caps = '<div class="cn-tx-caps"><div class="cn-tx-ch" role="tablist" aria-label="Textele pe rețele">' + mi('caption') + '<span>Texte</span>' +
      nets.map((n) => '<button type="button" role="tab" class="cn-tx-cn' + (n === sel ? ' is-on' : '') + '" data-cttr-cap="' + n + '" aria-selected="' + (n === sel) + '">' + badge(n) + '<span>' + NET[n] + '</span>' + (qaFor(it, n).problems.length ? '<i class="cn-qa is-bad">!</i>' : '') + '</button>').join('') + '</div>' +
      (sel ? capView(it, sel) : '') + '</div>';
    // on a phone the networks and times sit on the video too, seen before anything else
    // the player's controls sit under the networks and times, at the top: the approve buttons float at the bottom
    // the star (a favourite) sits on the video, top right under the player's controls: clear of them, of the approve
    // buttons at the bottom and of the speaker
    return '<article class="cn-tx-c" data-cttrid="' + id + '">' + media(it, 'cn-tx-m').replace(/<\/div>$/, '<div class="cn-tx-fv">' + favBtn(it, 'is-on-video') + shareBtn(it, 'is-on-video') + '</div></div>') +
      '<span class="cn-tx-stamp is-ok" aria-hidden="true">' + icon('check') + 'Aprobat</span><span class="cn-tx-stamp is-no" aria-hidden="true">' + icon('undo') + 'De refăcut</span>' +
      '<div class="cn-tx-i"><div class="cn-tx-h"><small>' + esc(meta) + (it.week ? ' · ' + esc(range(it.week)) : '') + '</small><h3>' + esc(title(it)) + '</h3>' + (it.hook ? '<p class="cn-tx-hook">„' + esc(it.hook) + '”</p>' : '') + '</div>' +
      '<div class="cn-tx-w"><small>Când și unde se postează</small>' + slotRow(it, true) + '</div>' + prev + bad + caps +
      '<button type="button" class="k-btn is-ghost is-sm cn-tx-more" data-ctitem="' + id + '">' + icon('pen') + 'Editează textele, detalii</button></div></article>';
  }
  // a network's text, as it goes (with its hashtags and its checks)
  function capView(it, net) {
    const v = capOf(it, net), q = qaFor(it, net), tags = tagsOf(v);
    const list = q.problems.map((x) => '<li class="is-bad">' + icon('alert') + '<span>' + esc(x.replace(NET[net] + ': ', '')) + '</span></li>').join('') +
      q.warnings.map((x) => '<li class="is-warn">' + icon('info') + '<span>' + esc(x.replace(NET[net] + ': ', '')) + '</span></li>').join('');
    return '<div class="cn-tx-cv" role="tabpanel"><p>' + (v ? esc(v) : '<i>Fără text</i>') + '</p><div class="cn-tx-cm"><small>' + v.length + '/' + CAP_MAX[net] + '</small>' +
      (tags.length ? '<small>' + pl(tags.length, 'hashtag', 'hashtag-uri') + '</small>' : '') + '</div>' + (list ? '<ul class="cn-qal">' + list + '</ul>' : '') + '</div>';
  }
  function paintTransit() {
    const host = panel && panel.querySelector('[data-cttrhost]');
    if (!host) return paint(true);
    stopMedia();
    host.innerHTML = transit();
    wireMedia(host);
    wireSwipe(host);
  }
  // ------------------------------------------------------------------ the grid (Transit) and Galerie
  // one card or every cover at once (the owner, 15.11: „ca să nu trebuiască să apăs pe următorul în continuu”)
  function viewSwitch() {
    const b = (v, ic, label) => '<button type="button" class="' + (S.tr.view === v ? 'is-on' : '') + '" data-ctview="' + v + '" aria-pressed="' + (S.tr.view === v) + '" aria-label="' + label + '" title="' + label + '">' + mi(ic) + '</button>';
    return '<span class="cn-vw" role="group" aria-label="Cum arată Transit">' + b('card', 'card', 'Unul câte unul') + b('grid', 'grid', 'Toate, în grilă') + '</span>';
  }
  const itemById = (id) => (S.d && S.d.items.find((x) => x.id === id)) || (S.gal.list || []).find((x) => x.id === id) || null;
  // save / share the video (15.11, the owner: „un buton cu share… să pot da save în galerie… pe calculator download”):
  // on a phone the share sheet with the file (Salvează videoclipul → Poze, AirDrop, WhatsApp…); on a computer a download.
  // The first tap fetches the file; the phone may ask for a second tap (the share sheet needs a fresh tap).
  const SHR = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 19h14"/></svg>';
  const shareBtn = (it, cls) => (mainVid(it) ? '<button type="button" class="cn-fav cn-shr ' + (cls || '') + '" data-ctshare="' + esc(it.id) + '" aria-label="Salvează sau trimite video-ul" title="Salvează / trimite">' + SHR + (/is-chip/.test(cls || '') ? '<span>Salvează</span>' : '') + '</button>' : '');
  const blobs = new Map();
  async function shareVid(id) {
    const it = itemById(id); const vid = it && mainVid(it); if (!vid) return;
    const url = fileUrl(it, vid.name), name = slugOf(title(it)) + '.mp4';
    const touch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    const down = () => { const a = document.createElement('a'); a.href = url; a.download = name; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove(); };
    if (!touch || !navigator.share || !navigator.canShare) return down();
    let f = blobs.get(id);
    if (f) { try { await navigator.share({ files: [f], title: title(it) }); } catch (e) { if (e && e.name !== 'AbortError') down(); } return; }
    K.ui().toast('Se pregătește video-ul…', 'info');
    try {
      const r = await fetch(url, { credentials: 'same-origin' }); if (!r.ok) throw new Error('http ' + r.status);
      f = new File([await r.blob()], name, { type: 'video/mp4' });
      if (!navigator.canShare({ files: [f] })) return down();
      blobs.set(id, f);
      try { await navigator.share({ files: [f], title: title(it) }); }
      catch (e) { if (e && e.name === 'NotAllowedError') K.ui().toast('Gata. Mai apasă o dată ca să-l salvezi sau să-l trimiți.', 'success'); else if (e && e.name !== 'AbortError') down(); }
    } catch (e) { down(); }
  }
  const favBtn = (it, cls) => { const on = !!it.fav; return '<button type="button" class="cn-fav ' + (cls || '') + (on ? ' is-on' : '') + '" data-ctfav="' + esc(it.id) + '" aria-pressed="' + on + '" aria-label="' + (on ? 'Scoate de la favorite' : 'Pune la favorite') + '" title="' + (on ? 'Favorit' : 'Pune la favorite') + '">' + icon('star') + (/is-chip/.test(cls || '') ? '<span>' + (on ? 'Favorit' : 'Pune la favorite') + '</span>' : '') + '</button>'; };
  // a star tapped: at once on screen, then saved (back as it was if the save fails)
  async function toggleFav(id) {
    const it = itemById(id);
    if (!it || S.favBusy[id]) return;
    const on = !it.fav;
    S.favBusy[id] = true;
    setFavLocal(id, on, on ? new Date().toISOString() : '', true);
    try {
      const r = await K.api('/api/portal-content', { action: 'fav', id, fav: on });
      if (r && r.items) S.d = r;
      if (r && r.fav) setFavLocal(id, r.fav.fav, r.fav.favAt);
      K.badge('continut', queue().length);
    } catch (err) {
      setFavLocal(id, !on, it.favAt || '');
      K.ui().toast(ERR[err && err.code] || K.errText(err, 'Nu am putut salva.'), 'error');
    } finally { delete S.favBusy[id]; }
  }
  function setFavLocal(id, on, at, pop) {
    [S.d && S.d.items, S.gal.list].forEach((list) => (list || []).forEach((x) => { if (x.id === id) { x.fav = !!on; x.favAt = on ? at || x.favAt || new Date().toISOString() : ''; } }));
    // every star of this item on screen (the card, the grid, the drawer) follows, without repainting the playing video
    document.querySelectorAll('[data-ctfav="' + id + '"]').forEach((b) => {
      b.classList.toggle('is-on', !!on); b.setAttribute('aria-pressed', String(!!on));
      b.setAttribute('aria-label', on ? 'Scoate de la favorite' : 'Pune la favorite'); b.title = on ? 'Favorit' : 'Pune la favorite';
      const t = b.querySelector('span'); if (t) t.textContent = on ? 'Favorit' : 'Pune la favorite';
      if (pop && on && !still) { b.classList.remove('is-pop'); void b.offsetWidth; b.classList.add('is-pop'); }
    });
    if (S.tab === 'gal') paintGallery();
  }
  // an item's real numbers, its posted networks added up (nothing guessed: no numbers, no rank)
  function nums(it) {
    const t = { views: 0, saves: 0, shares: 0, any: false };
    const nets = [...new Set((it.plan || []).filter((e) => e.state === 'posted').map((e) => e.net))];
    nets.forEach((n) => { const x = (it.stats || {})[n]; if (!x) return; if (x.views != null || x.saves != null || x.shares != null) t.any = true; t.views += x.views || 0; t.saves += x.saves || 0; t.shares += x.shares || 0; });
    if (!(t.views + t.saves + t.shares)) t.any = false;
    return t;
  }
  const postedAt = (it) => (it.plan || []).filter((e) => e.state === 'posted').map((e) => e.postedAt || e.at).filter(Boolean).sort().pop() || '';
  // the small chips of a cover: where and when it goes, in time order
  function miniSlots(it) {
    const on = netsOf(it).map((n) => ({ n, e: entryOf(it, n) })).filter((x) => x.e && x.e.at).sort((a, b) => a.e.at.localeCompare(b.e.at));
    if (!on.length) return '';
    return '<span class="cn-gt-sl">' + on.map(({ n, e }) => '<i class="' + (e.state === 'posted' ? 'is-posted' : '') + '" title="' + esc(NET[n] + ', ' + when(e.at)) + '">' + badge(n) + '<b>' + esc(dow(roDay(e.at))) + '</b>' + fTime.format(new Date(e.at)) + '</i>').join('') + '</span>';
  }
  // a cover in a grid: 9:16, the star, „Refăcut”, the title, the week (Transit) or the post's numbers (Galerie)
  function tile(it, where, rank) {
    const n = nums(it), when2 = postedAt(it);
    const open = where === 'tr' ? ' data-cttr-open="' + esc(it.id) + '"' : ' data-ctitem="' + esc(it.id) + '"';
    const img = it.cover ? '<img src="' + esc(cover(it)) + '" alt="" loading="lazy" decoding="async" draggable="false">' : '<span class="cn-gt-ph">' + icon(photo(it) ? 'layers' : 'video') + '</span>';
    const tags = (rank ? '<span class="cn-gt-rk">' + rank + '</span>' : '') + (it.replacedAt ? '<span class="cn-gt-tag">' + icon('refresh') + 'Refăcut</span>' : '') +
      (where === 'tr' && qaOf(it).problems.length ? '<span class="cn-gt-tag is-bad" title="' + esc(qaOf(it).problems[0]) + '">' + icon('alert') + '</span>' : '');
    const dur = (mainVid(it) || {}).dur;
    const foot = n.any ? '<span class="cn-gt-st">' + icon('eye') + k(n.views) + (n.saves + n.shares ? '<em>' + icon('book') + k(n.saves + n.shares) + '</em>' : '') + '</span>'
      : dur && where === 'tr' ? '<span class="cn-gt-st is-dur">' + Math.round(dur) + ' s</span>' : '';
    const sub = where === 'tr' ? (it.week ? 'Săpt. ' + range(it.week) : KIND[it.kind] || '') : when2 ? 'Postat ' + dm(roDay(when2)) : it.week ? 'Săpt. ' + range(it.week) : '';
    return '<div class="cn-gt' + (where === 'tr' ? ' is-tr' : '') + '" role="listitem"><button type="button" class="cn-gt-b"' + open + ' aria-label="' + esc(title(it)) + '"><span class="cn-gt-c' + (photo(it) ? ' is-photo' : '') + '">' + img + (tags ? '<span class="cn-gt-tags">' + tags + '</span>' : '') + foot + '</span>' +
      '<span class="cn-gt-i"><b>' + esc(title(it)) + '</b><small>' + esc(sub) + '</small>' + (where === 'tr' || !when2 ? miniSlots(it) : '') + '</span></button>' + favBtn(it, 'is-on-cover') + '</div>';
  }
  // Galerie: read when the tab opens (again after a minute); until then, what the page already has
  async function loadGallery(force) {
    if (S.gal.busy || (!force && S.gal.list && Date.now() - S.gal.at < 60e3)) return;
    S.gal.busy = true;
    try { const r = await K.api('/api/portal-content', { action: 'gallery' }); S.gal.list = (r && r.items) || []; S.gal.at = Date.now(); S.gal.err = ''; }
    catch (err) { S.gal.err = K.errText(err); }
    finally { S.gal.busy = false; }
    if (S.tab === 'gal' && S.d) paintGallery();
  }
  // every item approved (ready) or posted, the page's own copy first (the freshest)
  function galItems() {
    const map = new Map();
    (S.gal.list || []).forEach((x) => map.set(x.id, x));
    (S.d.items || []).forEach((x) => map.set(x.id, x));
    return [...map.values()].filter((it) => !it.removed && ((review(it) === 'approved' && !it.dropped && it.state === 'ready') || (it.plan || []).some((e) => e.state === 'posted')));
  }
  const newest = (it) => postedAt(it) || firstAt(it) || it.createdAt || '';
  function gallery() {
    const all = galItems().sort((a, b) => newest(b).localeCompare(newest(a)));
    const favs = all.filter((x) => x.fav).sort((a, b) => String(b.favAt || '').localeCompare(String(a.favAt || '')));
    // the best: by the real views, then the saves and shares (the numbers content-stats.js reads per network)
    const best = all.filter((x) => nums(x).any).sort((a, b) => { const x = nums(a), y = nums(b); return (y.views - x.views) || ((y.saves + y.shares) - (x.saves + x.shares)); });
    const seg = S.gal.seg, list = seg === 'fav' ? favs : seg === 'best' ? best : all;
    const segs = '<div class="k-seg cn-galseg" data-k-seg="ctgal">' + [['all', 'Toate', all.length], ['fav', 'Favorite', favs.length], ['best', 'Cele mai bune', best.length]].map(([v, l, c]) =>
      '<button type="button" data-v="' + v + '" class="' + (v === seg ? 'is-on' : '') + '"><span>' + l + '</span><em>' + c + '</em></button>').join('') + '<input type="hidden" name="ctgal" value="' + esc(seg) + '"></div>';
    const loading = !S.gal.list && !S.gal.err;
    let body;
    if (list.length) body = '<div class="cn-cvg" role="list">' + list.map((x, i) => tile(x, 'gal', seg === 'best' ? i + 1 : 0)).join('') + '</div>';
    else if (loading && seg !== 'fav') body = '<div class="cn-cvg">' + '<div class="k-skel cn-gt-sk"></div>'.repeat(6) + '</div>';
    else {
      const E = { all: ['image', 'Nimic aprobat încă', 'Ce aprobi în Transit apare aici.'], fav: ['star', 'Nicio favorită încă', 'Atinge steaua de pe un reel ca să-l pui aici.'], best: ['trophy', 'Încă fără cifre', 'Apar după primele postări, când avem cifre.'] }[seg];
      body = '<div class="cn-gal0"><span class="cn-gal0-ic">' + icon(E[0]) + '</span><b>' + E[1] + '</b><p>' + E[2] + '</p></div>';
    }
    const note = seg === 'best' && best.length ? '<p class="cn-gal-n">După vizualizări, apoi salvări și distribuiri, pe toate rețelele.</p>' : '';
    return '<section class="cn-gal">' + segs + note + (S.gal.err && !S.gal.list ? '<p class="cn-line is-bad">' + icon('alert') + '<span>Nu am putut încărca galeria: ' + esc(S.gal.err) + '</span></p>' : '') + body + '</section>';
  }
  function paintGallery() {
    const host = panel && panel.querySelector('[data-ctgalhost]');
    if (host) host.innerHTML = gallery();
  }
  // the card follows the finger; far enough (or fast enough) to a side decides it
  function wireSwipe(root) {
    const card = root.querySelector('.cn-tx-c'); if (!card) return;
    let x0 = 0, y0 = 0, dx = 0, on = false, locked = '', t0 = 0, pid = null;
    const set = (v) => { card.style.transform = v ? 'translateX(' + v + 'px) rotate(' + (v / 22).toFixed(2) + 'deg)' : ''; card.style.setProperty('--ok', Math.max(0, Math.min(1, v / 110)).toFixed(2)); card.style.setProperty('--no', Math.max(0, Math.min(1, -v / 110)).toFixed(2)); };
    card.addEventListener('pointerdown', (e) => {
      if (e.button || e.target.closest('button, a, textarea, input, .cn-tx-i')) return;
      on = true; locked = ''; x0 = e.clientX; y0 = e.clientY; dx = 0; t0 = Date.now(); pid = e.pointerId; S.tr.moved = false;
    });
    card.addEventListener('pointermove', (e) => {
      if (!on || e.pointerId !== pid) return;
      const mx = e.clientX - x0, my = e.clientY - y0;
      if (!locked) { if (Math.abs(mx) < 8 && Math.abs(my) < 8) return; locked = Math.abs(mx) > Math.abs(my) ? 'x' : 'y'; if (locked === 'x') { card.setPointerCapture(pid); card.classList.add('is-drag'); } }
      if (locked !== 'x') return;
      e.preventDefault(); dx = mx; S.tr.moved = true; set(dx);
    });
    const end = () => {
      if (!on) return; on = false;
      card.classList.remove('is-drag');
      if (locked !== 'x') return;
      const fast = Math.abs(dx) / Math.max(1, Date.now() - t0) > 0.6 && Math.abs(dx) > 50;
      const id = card.dataset.cttrid;
      if (dx > 110 || (fast && dx > 0)) return decide(id, 'ok');
      if (dx < -110 || (fast && dx < 0)) { set(0); return openRedo(id); }
      set(0);
      setTimeout(() => { S.tr.moved = false; }, 0);
    };
    card.addEventListener('pointerup', end);
    card.addEventListener('pointercancel', end);
  }
  // ✓: the card flies right, the item is approved; it keeps the slots it shows (Calendar)
  async function decide(id, what, extra) {
    const card = panel.querySelector('[data-cttrid="' + id + '"]');
    if (S.busy) return;
    if (card) { card.classList.add(what === 'ok' ? 'is-out-ok' : 'is-out-no'); card.style.transform = ''; }
    const payload = Object.assign({ action: what === 'ok' ? 'approve' : 'redo', id }, extra || {});
    S.busy = true;
    try {
      const [r] = await Promise.all([K.api('/api/portal-content', payload), new Promise((ok) => setTimeout(ok, still ? 0 : 260))]);
      S.d = r; S.tr.seen++; S.tr.last = { id, what }; S.tr.focus = ''; S.tr.cap = null;
      K.ui().toast(what === 'ok' ? 'Aprobat. E în calendar.' : 'Trimis la refăcut. Revine aici după.', 'success');
      paint(true);
    } catch (err) {
      K.ui().toast(ERR[err && err.code] || K.errText(err, 'Nu am putut salva.'), 'error');
      paintTransit();
    } finally { S.busy = false; }
  }
  // skip: the next one, without a decision on this one (it stays to approve, it comes back after the others)
  function skipItem(id) {
    if (S.busy) return;
    const q = queue();
    if (q.length < 2) { K.ui().toast('E singurul de aprobat.', 'info'); return; }
    S.tr.skip = (S.tr.skip || []).filter((x) => x !== id).concat(id); S.tr.focus = ''; S.tr.cap = null;
    paint(true);
  }
  async function undoLast() {
    const l = S.tr.last; if (!l || S.busy) return;
    S.busy = true;
    try {
      S.d = await K.api('/api/portal-content', { action: 'unreview', id: l.id });
      S.tr.seen = Math.max(0, S.tr.seen - 1); S.tr.last = null; S.tr.focus = l.id;
      if (S.tab !== 'tr') S.tab = 'tr';
      K.ui().toast('Anulat. E din nou de aprobat.', 'success');
      paint(true);
    } catch (err) { K.ui().toast(ERR[err && err.code] || K.errText(err, 'Nu am putut anula.'), 'error'); }
    finally { S.busy = false; }
  }
  // ← → on a keyboard (iPad, the computer), Z to undo, only while Transit is on screen and nothing else is open
  document.addEventListener('keydown', (e) => {
    if (!panel || !S.d || S.tab !== 'tr' || !K.isActive('continut') || e.metaKey && e.key !== 'z' || e.altKey) return;
    if (document.querySelector('.k-drawer-root.is-open, .c360-dialog-root, .c360-palette-root')) return;
    if (e.target && e.target.closest && e.target.closest('input, textarea, select, [contenteditable]')) return;
    const it = S.tr.view === 'grid' && queue().length > 1 ? null : current();
    if (e.key === 'ArrowRight' && it) { e.preventDefault(); decide(it.id, 'ok'); }
    else if (e.key === 'ArrowLeft' && it) { e.preventDefault(); openRedo(it.id); }
    else if (e.key === 'ArrowDown' && it) { e.preventDefault(); skipItem(it.id); }
    else if ((e.key === 'z' || e.key === 'Z') && !e.shiftKey) { if (S.tr.last) { e.preventDefault(); undoLast(); } }
    else if (e.key === ' ' && it) { const v = panel.querySelector('[data-cttrid] video'); if (v) { e.preventDefault(); sound(v); } }
  });

  // ------------------------------------------------------------------ De refăcut: the change request
  // what to change (the areas, more than one), in his words, with links and files of reference (photos, videos, music
  // from the phone's picker, uploaded at once in parts to content/<id>/notes/, up to 200 MB each); a draft survives
  // closing the sheet. Approve with a note uses the same sheet, without the files.
  const ATT_MAX = 200 * 1024 * 1024;
  const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/heic': 'heic', 'image/heif': 'heif', 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm', 'video/x-m4v': 'm4v',
    'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'aac', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/ogg': 'ogg' };
  const TYPE = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', heic: 'image/heic', heif: 'image/heif', mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', m4v: 'video/x-m4v', mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', wav: 'audio/wav', ogg: 'audio/ogg', opus: 'audio/ogg' };
  const extOf = (f) => { const e = (/\.([a-z0-9]{2,5})$/i.exec(f.name || '') || [])[1]; const x = e && TYPE[e.toLowerCase()] ? e.toLowerCase() : EXT[f.type] || ''; return x === 'jpeg' ? 'jpg' : x; };
  const rid = () => { const a = new Uint8Array(10); (window.crypto || window.msCrypto).getRandomValues(a); return Array.from(a, (b) => (b % 36).toString(36)).join('') + Date.now().toString(36).slice(-4); };
  const kindOf = (type) => (/^image\//.test(type) ? 'image' : /^video\//.test(type) ? 'video' : /^audio\//.test(type) ? 'audio' : 'file');
  let blobLib = null;
  function uploader() {
    if (window.C360BlobUpload) return Promise.resolve(window.C360BlobUpload);
    if (!blobLib) blobLib = new Promise((ok, fail) => { const s = document.createElement('script'); s.src = '/vendor/blob-upload.js'; s.onload = () => ok(window.C360BlobUpload); s.onerror = () => { blobLib = null; fail(new Error('lib')); }; document.head.appendChild(s); });
    return blobLib;
  }
  function openRedo(id, mode) {
    const it = S.d.items.find((x) => x.id === id); if (!it) return;
    const ok = mode === 'note';
    const D = (S.drafts[id + (ok ? '~ok' : '')] = S.drafts[id + (ok ? '~ok' : '')] || { note: '', areas: [], links: [], files: [] });
    const chips = () => '<div class="cn-ar" role="group" aria-label="Ce anume">' + AREAS.map(([v, l, ic]) => '<button type="button" class="cn-ar-c' + (D.areas.includes(v) ? ' is-on' : '') + '" data-ctar="' + v + '" aria-pressed="' + D.areas.includes(v) + '">' + areaIc(ic) + '<span>' + l + '</span></button>').join('') + '</div>';
    // the texts of now, when the change is about them: per network, with its hashtags (our rule: a few relevant ones)
    const texts = () => {
      if (!D.areas.some((a) => a === 'caption' || a === 'descriere' || a === 'hashtag')) return '';
      return '<div class="cn-rq-tx"><small>Textele de acum</small>' + netsOf(it).map((n) => {
        const v = capOf(it, n), tags = tagsOf(v);
        return '<div class="cn-rq-t"><div class="cn-rq-th">' + badge(n) + '<b>' + NET[n] + '</b>' + (tags.length ? '<span class="cn-rq-hs">' + tags.map((t) => '<i>' + esc(t) + '</i>').join('') + '</span>' : '<span class="cn-rq-hs is-none">fără hashtag-uri</span>') + '</div><p>' + esc(v.replace(/(\n\s*)?(#[\p{L}\p{N}_]+\s*)+$/u, '').trim() || 'Fără text') + '</p></div>';
      }).join('') + '<p class="cn-rq-rule">' + icon('info') + '<span>Regula noastră: câteva hashtag-uri relevante, TikTok <b class="cn-nw">3-5</b>, Instagram <b class="cn-nw">3-5</b> la final, Facebook <b class="cn-nw">1-2</b>, YouTube doar #shorts. Scrie mai sus ce vrei altfel.</span></p></div>';
    };
    const fileRow = (f, i) => '<li class="cn-rq-f is-' + f.kind + (f.err ? ' is-err' : '') + '"><span class="cn-rq-fi">' + (f.kind === 'image' && f.preview ? '<img src="' + esc(f.preview) + '" alt="">' : f.kind === 'video' ? icon('video') : f.kind === 'audio' ? mi('note') : icon('file')) + '</span>' +
      '<span class="cn-main"><b>' + esc(f.name) + '</b><small>' + (f.err ? esc(f.err) : f.done ? mb(f.size) : 'Se urcă… ' + Math.round(f.pct || 0) + '%') + '</small>' + (!f.done && !f.err ? '<span class="cn-rq-pb"><i style="width:' + (f.pct || 0).toFixed(1) + '%"></i></span>' : '') + '</span>' +
      '<button type="button" class="k-icon-btn" data-ctrq-rmf="' + i + '" aria-label="Scoate fișierul">' + icon('x') + '</button></li>';
    const refs = () => ok ? '' : '<div class="cn-rq-refs"><small>Referințe</small><form class="cn-rq-l" data-ctrq-link autocomplete="off"><input type="url" name="link" inputmode="url" enterkeyhint="done" placeholder="Un link (video, sunet, cont, articol)" aria-label="Link de referință"><button type="submit" class="k-btn is-outline">' + icon('plus') + 'Adaugă</button></form>' +
      (D.links.length ? '<ul class="cn-rq-ls">' + D.links.map((l, i) => '<li>' + icon('link') + '<a href="' + esc(l) + '" target="_blank" rel="noopener">' + esc(l.replace(/^https?:\/\/(www\.)?/, '')) + '</a><button type="button" class="k-icon-btn" data-ctrq-rml="' + i + '" aria-label="Scoate linkul">' + icon('x') + '</button></li>').join('') + '</ul>' : '') +
      '<label class="cn-rq-pick">' + mi('clip') + '<span><b>Adaugă poze, video sau muzică</b><small>Până la 200 MB fiecare. Un video mai mare: pune linkul lui (Drive, WeTransfer, YouTube).</small></span><input type="file" multiple accept="image/*,video/*,audio/*" data-ctrq-files hidden></label>' +
      (D.files.length ? '<ul class="cn-rq-fs">' + D.files.map(fileRow).join('') + '</ul>' : '') + '</div>';
    const body = () => '<div class="cn-rq">' + (ok ? '<p class="cn-rq-p">Se aprobă și intră în calendar. Nota rămâne pentru producător, la materialele următoare.</p>' : '') +
      '<small class="cn-rq-l1">Ce anume' + (ok ? '' : ' (poți alege mai multe)') + '</small>' + chips() +
      '<label class="cn-rq-n"><small>' + (ok ? 'Ce să țină minte data viitoare' : 'Ce ai vrea schimbat') + '</small><textarea data-ctrq-note rows="4" maxlength="2000" placeholder="' + (ok ? 'Ex.: mai scurt, muzica mai jos sub voce' : 'Ex.: prima secundă mai puternică, muzica prea tare, alt cârlig') + '">' + esc(D.note) + '</textarea></label>' +
      texts() + refs() + '</div>';
    const busy = () => D.files.some((f) => !f.done && !f.err);
    const foot = () => '<button type="button" class="k-btn is-ghost" data-k-close2>Renunță</button><span class="k-grow"></span><button type="button" class="k-btn ' + (ok ? 'is-good' : 'is-danger') + '" data-ctrq-send' + (busy() ? ' disabled' : '') + '>' + icon(ok ? 'check' : 'undo') + (ok ? 'Aprobă cu nota' : busy() ? 'Se urcă fișierele…' : 'Trimite la refăcut') + '</button>';
    const dr2 = K.drawer({
      title: ok ? 'Aprobat, cu o notă' : 'Ce schimbăm?', subtitle: esc(title(it)), icon: ok ? 'check' : 'undo', width: 520, body: body(), footer: foot(), focus: false,
      onMount(el, h) {
        const redraw = (keepNote) => { const y = h.body.scrollTop; const t = el.querySelector('[data-ctrq-note]'); if (t && keepNote !== false) D.note = t.value; h.body.innerHTML = body(); h.body.scrollTop = y; el.querySelector('.k-dfoot').innerHTML = foot(); };
        const refoot = () => { const f = el.querySelector('.k-dfoot'); if (f) f.innerHTML = foot(); };
        D.redraw = (full) => { if (!el.isConnected) return; const list = el.querySelector('.cn-rq-fs'); if (full || !list) redraw(); else { list.innerHTML = D.files.map(fileRow).join(''); refoot(); } };
        el.addEventListener('input', (e) => { if (e.target.matches('[data-ctrq-note]')) D.note = e.target.value; });
        el.addEventListener('submit', (e) => {
          const f = e.target.closest('[data-ctrq-link]'); if (!f) return;
          e.preventDefault();
          let v = f.elements.link.value.trim();
          if (v && !/^https?:\/\//i.test(v)) v = 'https://' + v;
          try { const u = new URL(v); if (!/^https?:$/.test(u.protocol) || !u.hostname.includes('.')) throw new Error('x'); } catch (x) { K.ui().toast('Linkul nu pare bun.', 'error'); f.elements.link.focus(); return; }
          if (D.links.length >= 10) { K.ui().toast('Cel mult 10 linkuri.', 'error'); return; }
          if (!D.links.includes(v)) D.links.push(v);
          redraw();
          const n = el.querySelector('[data-ctrq-link] input'); if (n) n.focus();
        });
        el.addEventListener('change', async (e) => { if (e.target.matches('[data-ctrq-files]')) { const fl = Array.from(e.target.files || []); e.target.value = ''; await addFiles(it, D, fl); redraw(); const l = el.querySelector('.cn-rq-fs'); if (l) l.scrollIntoView({ block: 'nearest', behavior: still ? 'auto' : 'smooth' }); } });
        el.addEventListener('click', async (e) => {
          if (e.target.closest('[data-k-close2]')) return h.close();
          const a = e.target.closest('[data-ctar]');
          if (a) { const v = a.dataset.ctar; D.areas = D.areas.includes(v) ? D.areas.filter((x) => x !== v) : D.areas.concat(v); return redraw(); }
          const rl = e.target.closest('[data-ctrq-rml]'); if (rl) { D.links.splice(Number(rl.dataset.ctrqRml), 1); return redraw(); }
          const rf = e.target.closest('[data-ctrq-rmf]'); if (rf) { const f = D.files.splice(Number(rf.dataset.ctrqRmf), 1)[0]; if (f && f.preview) URL.revokeObjectURL(f.preview); if (f) f.gone = true; return redraw(); }
          const send = e.target.closest('[data-ctrq-send]');
          if (!send) return;
          const t = el.querySelector('[data-ctrq-note]'); D.note = t ? t.value : D.note;
          const pending = el.querySelector('[data-ctrq-link] input');
          if (pending && pending.value.trim()) { K.ui().toast('Apasă Adaugă pentru link, sau șterge-l.', 'error'); pending.focus(); return; }
          const files = D.files.filter((f) => f.done && !f.err);
          if (D.note.trim().length < 3 && !(files.length || D.links.length)) { K.ui().toast(ok ? 'Scrie nota pe scurt.' : 'Scrie pe scurt ce schimbăm.', 'error'); if (t) t.focus(); return; }
          if (ok && D.note.trim().length < 3) { K.ui().toast('Scrie nota pe scurt.', 'error'); return; }
          const extra = { note: D.note.trim(), areas: D.areas };
          if (!ok) Object.assign(extra, { links: D.links, files: files.map((f) => ({ path: f.path, name: f.name })) });
          h.close();
          delete S.drafts[id + (ok ? '~ok' : '')];
          await decide(id, ok ? 'ok' : 'no', extra);
        });
      },
      onClose() { D.redraw = null; },
    });
    return dr2;
  }
  // the files picked: each goes up at once, in parts (the sheet shows its progress)
  async function addFiles(it, D, list) {
    const lib = await uploader().catch(() => null);
    Array.from(list || []).forEach((file) => {
      if (D.files.length >= 10) { K.ui().toast('Cel mult 10 fișiere.', 'error'); return; }
      const ext = extOf(file), type = TYPE[ext] || file.type || '';
      const f = { name: file.name || 'fisier', size: file.size, kind: kindOf(type), pct: 0, done: false, err: '' };
      if (!ext) f.err = 'Tipul ăsta nu merge: poze, video sau audio.';
      else if (file.size > ATT_MAX) f.err = 'Are ' + mb(file.size) + ': pune linkul lui.';
      else if (!lib) f.err = 'Nu am putut porni urcarea.';
      if (f.kind === 'image' && !f.err) { try { f.preview = URL.createObjectURL(file); } catch (e) { /* no preview */ } }
      D.files.push(f);
      if (f.err) return;
      f.path = 'content/' + it.id + '/notes/' + rid() + '.' + ext;
      lib.upload(f.path, file, { access: 'private', handleUploadUrl: '/api/portal-content?upload=1', contentType: type, multipart: true,
        onUploadProgress: (p) => { f.pct = p.percentage || 0; if (D.redraw) D.redraw(); } })
        .then(() => { f.done = true; f.pct = 100; })
        .catch((err) => { f.err = err && err.code === 'too_large' ? 'E prea mare: pune linkul lui.' : 'Nu s-a urcat. Încearcă din nou.'; })
        .then(() => { if (D.redraw) D.redraw(); });
    });
  }

  // ------------------------------------------------------------------ Calendar: what posts when
  // a week (the default) or a month; each day's posts as compact chips (the time, the network, the cover), a day with
  // many shows the first ones and „+N”, which opens the whole day; a tap on a post opens it (its preview, time,
  // networks, state and what can be done: skip a network, post now, the numbers once posted)
  const MONTHS = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];
  const mondayOf = (d) => { const w = new Date(d + 'T12:00:00Z').getUTCDay(); return addDay(d, -((w + 6) % 7)); };
  const CST = { planned: 'Programat', waiting_access: 'Programat', todo: 'De postat', posting: 'Se publică', posted: 'Postat', error: 'Eroare', skipped: 'Sărit', missed: 'Ratat' };
  const CTONE = { planned: 'is-info', waiting_access: 'is-info', todo: 'is-warn', posting: 'is-warn', posted: 'is-good', error: 'is-bad', skipped: '', missed: '' };
  // the entries of a day, by time (skipped and dropped ones only in the day's sheet)
  function dayMap(all) {
    const map = {};
    entries().forEach(({ it, e }) => {
      if (!e.at) return;
      if (!all && (e.state === 'skipped' || ((it.dropped || it.removed) && e.state !== 'posted'))) return;
      if (S.cal.nets.length && !S.cal.nets.includes(e.net)) return;
      (map[roDay(e.at)] = map[roDay(e.at)] || []).push({ it, e });
    });
    Object.values(map).forEach((l) => l.sort((a, b) => a.e.at.localeCompare(b.e.at) || NETS.indexOf(a.e.net) - NETS.indexOf(b.e.net)));
    return map;
  }
  // the owner's look decides how a post shows before it goes: approved (solid), waiting for him (dashed), sent back (red)
  const look = (it, e) => (e.state === 'posted' || e.state === 'error' || e.state === 'todo' || e.state === 'posting' ? '' : review(it) === 'approved' ? '' : review(it) === 'redo' ? ' is-redo' : ' is-wait');
  const views = (it, e) => { const s = e.state === 'posted' && it.stats && it.stats[e.net]; return s && s.views != null ? '<em class="cn-cc-v">' + icon('eye') + k(s.views) + '</em>' : ''; };
  const stMark = (e) => (e.state === 'posted' ? '<i class="cn-cc-s is-good">' + icon('check') + '</i>' : e.state === 'error' ? '<i class="cn-cc-s is-bad">' + icon('alert') + '</i>' : e.state === 'todo' ? '<i class="cn-cc-s is-warn">' + icon('share') + '</i>' : e.state === 'missed' ? '<i class="cn-cc-s">' + icon('ban') + '</i>' : '');
  function cchip(it, e, extra) {
    return '<button type="button" class="cn-cc is-' + e.net + ' is-' + e.state + look(it, e) + (extra || '') + '" data-ctitem="' + esc(it.id) + '" data-net="' + e.net + '" title="' + esc(NET[e.net] + ', ' + fTime.format(new Date(e.at)) + ': ' + title(it) + ' (' + (CST[e.state] || '') + ')') + '">' +
      thumb(it, 'cn-cc-th') + '<span class="cn-cc-b"><span class="cn-cc-t">' + badge(e.net) + '<time>' + fTime.format(new Date(e.at)) + '</time>' + stMark(e) + '</span><span class="cn-cc-n">' + esc(title(it)) + '</span>' + views(it, e) + '</span></button>';
  }
  const FIT = 4;
  function calendar() {
    const C2 = S.cal, today = S.d.today;
    const map = dayMap(false);
    const nav = '<div class="cn-cal-h"><div class="cn-cal-nv"><button type="button" class="k-icon-btn" data-ctcal-go="-1" aria-label="Înapoi">' + icon('left') + '</button>' +
      '<b class="cn-cal-l">' + esc(C2.view === 'month' ? cap1(MONTHS[Number(C2.day.slice(5, 7)) - 1]) + ' ' + C2.day.slice(0, 4) : range(mondayOf(C2.day))) + '</b>' +
      '<button type="button" class="k-icon-btn" data-ctcal-go="1" aria-label="Înainte">' + icon('right') + '</button>' +
      (C2.view === 'month' ? C2.day.slice(0, 7) !== today.slice(0, 7) : mondayOf(C2.day) !== mondayOf(today) ? '<button type="button" class="k-btn is-ghost is-sm" data-ctcal-go="0">Azi</button>' : '') + '</div>' +
      K.seg('ctcalv', [['week', 'Săptămână'], ['month', 'Lună']], C2.view, 'cn-seg-sm') + '</div>';
    const legend = '<div class="cn-cal-lg">' + NETS.map((n) => '<button type="button" class="cn-cal-f' + (!C2.nets.length || C2.nets.includes(n) ? ' is-on' : '') + '" data-ctcal-net="' + n + '" aria-pressed="' + (!C2.nets.length || C2.nets.includes(n)) + '">' + badge(n) + '<span>' + NET[n] + '</span></button>').join('') +
      '<span class="cn-cal-k"><i class="is-ok"></i>aprobat<i class="is-wait"></i>de aprobat<i class="is-posted"></i>postat</span></div>';
    return '<section class="cn-sec cn-cal">' + nav + legend + (C2.view === 'month' ? monthGrid(map) : weekGrid(map)) + '</section>';
  }
  const cap1 = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  function weekGrid(map) {
    const w = mondayOf(S.cal.day), today = S.d.today;
    const days = []; for (let i = 0; i < 7; i++) days.push(addDay(w, i));
    const any = days.some((d) => (map[d] || []).length);
    return '<div class="cn-wkg">' + days.map((d) => {
      const list = map[d] || [], cls = (d === today ? ' is-today' : '') + (d < today ? ' is-past' : '') + (list.length ? '' : ' is-free');
      const more = list.length - FIT;
      return '<div class="cn-wd' + cls + '"><button type="button" class="cn-wd-h" data-ctday="' + d + '"><b>' + esc(dow(d)) + '</b><span>' + Number(d.slice(8, 10)) + '</span>' + (d === today ? '<em>azi</em>' : '') + (list.length ? '<small>' + list.length + '</small>' : '') + '</button>' +
        '<div class="cn-wd-l">' + (list.length ? list.map(({ it, e }, i) => cchip(it, e, i >= FIT ? ' is-extra' : '')).join('') + (more > 0 ? '<button type="button" class="cn-wd-more" data-ctday="' + d + '">+' + more + '</button>' : '') : '<span class="cn-wd-0">Liber</span>') + '</div></div>';
    }).join('') + '</div>' + (any ? '' : '<p class="cn-cal-0">' + icon('calendar') + 'Nimic programat în săptămâna asta. Ce aprobi în Transit apare aici, pe orele lui.</p>');
  }
  function monthGrid(map) {
    const first = S.cal.day.slice(0, 8) + '01', start = mondayOf(first), today = S.d.today, mon = first.slice(0, 7);
    const cells = []; for (let d = start; cells.length < 42; d = addDay(d, 1)) { cells.push(d); if (cells.length % 7 === 0 && addDay(d, 1).slice(0, 7) !== mon && cells.length >= 28) break; }
    const head = ['Lu', 'Ma', 'Mi', 'Jo', 'Vi', 'Sâ', 'Du'].map((x) => '<span class="cn-mo-dh">' + x + '</span>').join('');
    return '<div class="cn-mo">' + head + cells.map((d) => {
      const list = map[d] || [], out = d.slice(0, 7) !== mon;
      const cls = (d === today ? ' is-today' : '') + (d < today ? ' is-past' : '') + (out ? ' is-out' : '') + (list.length ? ' has' : '');
      const mini = list.slice(0, 3).map(({ it, e }) => '<i class="cn-mo-c is-' + e.net + ' is-' + e.state + look(it, e) + '"><b>' + fTime.format(new Date(e.at)) + '</b><span>' + esc(title(it)) + '</span></i>').join('');
      const dots = list.slice(0, 8).map(({ it, e }) => '<i class="is-' + e.net + look(it, e) + '"></i>').join('');
      return '<button type="button" class="cn-mo-d' + cls + '" data-ctday="' + d + '"' + (list.length ? ' aria-label="' + esc(dow(d) + ' ' + dm(d) + ': ' + pl(list.length, 'postare', 'postări')) + '"' : '') + '><span class="cn-mo-n">' + Number(d.slice(8, 10)) + '</span>' +
        (list.length ? '<span class="cn-mo-cs">' + mini + (list.length > 3 ? '<em>+' + (list.length - 3) + '</em>' : '') + '</span><span class="cn-mo-ds">' + dots + '</span>' : '') + '</button>';
    }).join('') + '</div>';
  }
  // a day, whole: every post by time (the skipped ones too, faded), a tap opens the post
  function openDay(d) {
    const list = (dayMap(true)[d] || []);
    const row = ({ it, e }) => '<button type="button" class="cn-dy-r is-' + e.state + look(it, e) + '" data-ctdyitem="' + esc(it.id) + '" data-net="' + e.net + '"><time>' + fTime.format(new Date(e.at)) + '</time>' + thumb(it) +
      '<span class="cn-main"><b>' + esc(title(it)) + '</b><small>' + badge(e.net) + NET[e.net] + (e.kind && e.kind !== 'reel' ? ' · ' + KIND[e.kind] : '') + '</small>' + (e.state === 'posted' ? statLine((it.stats || {})[e.net]) : '') + '</span>' +
      '<span class="k-tag ' + (look(it, e) === ' is-wait' ? 'is-warn' : look(it, e) === ' is-redo' ? 'is-bad' : CTONE[e.state]) + '">' + (look(it, e) === ' is-wait' ? 'De aprobat' : look(it, e) === ' is-redo' ? 'De refăcut' : CST[e.state]) + '</span></button>';
    const dd = K.drawer({
      title: cap1(new Intl.DateTimeFormat('ro-RO', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(d + 'T12:00:00Z'))), subtitle: pl(list.filter((x) => x.e.state !== 'skipped').length, 'postare', 'postări'), icon: 'calendar', width: 480,
      body: list.length ? '<div class="cn-dy">' + list.map(row).join('') + '</div>' : K.empty('calendar', 'Nimic în ziua asta', ''), focus: false,
      onMount(el) { el.addEventListener('click', (e) => { const b = e.target.closest('[data-ctdyitem]'); if (b) openItem(b.dataset.ctdyitem, b.dataset.net); }); },
    });
    return dd;
  }
  function calGo(dir) {
    const C2 = S.cal;
    if (dir === 0) C2.day = S.d.today;
    else if (C2.view === 'month') { const [y, m] = C2.day.split('-').map(Number); const t = new Date(Date.UTC(y, m - 1 + dir, 1, 12)); C2.day = t.toISOString().slice(0, 10); }
    else C2.day = addDay(mondayOf(C2.day), 7 * dir);
    paint(true);
  }

  // the videos: loaded when near, playing while in view (not with reduced motion), muted until a tap
  let ioLoad = null, ioPlay = null;
  const still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function wireMedia(root) {
    const vids = root.querySelectorAll('video[data-ctvid]');
    if (!vids.length) return;
    vids.forEach(wireVc);
    if (!('IntersectionObserver' in window)) { vids.forEach((v) => { if (v.dataset.src) { v.src = v.dataset.src; v.removeAttribute('data-src'); } }); return; }
    if (!ioLoad) ioLoad = new IntersectionObserver((list) => list.forEach((x) => { const v = x.target; if (x.isIntersecting && v.dataset.src) { v.preload = 'metadata'; v.src = v.dataset.src; v.removeAttribute('data-src'); ioLoad.unobserve(v); } }), { rootMargin: '300px 0px' });
    if (!ioPlay) ioPlay = new IntersectionObserver((list) => list.forEach((x) => {
      const v = x.target;
      if (x.isIntersecting && x.intersectionRatio >= 0.6) {
        if (still || v.dataset.src) return;
        // sound was turned on: this one plays with it (the only one with sound); the browser may refuse, then muted
        const ic = v.parentElement.querySelector('.cn-snd');
        if (S.sound && v.closest('[data-cttrid]')) { v.muted = false; if (ic) { ic.innerHTML = SPK.on; ic.classList.add('is-on'); } }
        v.play().catch(() => { v.muted = true; if (ic) { ic.innerHTML = SPK.off; ic.classList.remove('is-on'); } v.play().catch(() => {}); });
      }
      else if (!v.paused) v.pause();
    }), { threshold: [0, 0.6] });
    vids.forEach((v) => { ioLoad.observe(v); ioPlay.observe(v); wireVc(v); });
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
    S.sound = on;
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
      (e.state === 'posted' ? (blind(e) ? '<span class="k-tag is-warn">Fără cifre</span>' : e.manual && e.match && e.match.state === 'pending' && !(it.stats || {})[e.net] ? '<span class="k-tag">Caut postarea</span>' : statLine((it.stats || {})[e.net]))
        : '<span class="k-tag ' + TONE[e.state] + '">' + STATE[e.state] + '</span>') + icon('right') + '</button>';
  }
  // a post made from the app whose post was never found: no numbers until a link comes (nothing guessed)
  const blind = (e) => e.state === 'posted' && e.manual && e.match && (e.match.state === 'none' || e.match.state === 'ambiguous');
  const blindText = (e) => (e.match.state === 'ambiguous' ? 'Mai multe postări se potrivesc' : 'Nu am găsit postarea') + ': fără cifre. Adaugă linkul.';
  function errors() {
    const bad = entries().filter(({ it, e }) => e.state === 'error' || (e.hold && e.state === 'planned' && review(it) === 'approved') || blind(e)).sort((a, b) => (b.e.postedAt || b.e.at).localeCompare(a.e.postedAt || a.e.at)).slice(0, 6);
    if (!bad.length) return '';
    return '<section class="cn-sec"><h3>De văzut</h3><div class="cn-list">' + bad.map(({ it, e }) => row(it, e, '<em class="cn-err' + (e.state === 'error' ? '' : ' is-warn') + '">' + esc(blind(e) ? blindText(e) : e.error || e.hold) + '</em>')).join('') + '</div></section>';
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
  // a block's line that says what it means, under its numbers
  const take = (html, text) => (html && text ? html.replace(/<\/section>$/, '<p class="cn-take">' + icon('sparkles') + '<span>' + esc(text) + '</span></p></section>') : html);
  const best = (arr, f) => (arr || []).reduce((m, x) => (m == null || f(x) > f(m) ? x : m), null);
  function takes(R, L) {
    const t = {}, fol = R.followers || {}, per = (R.last30 && R.last30.per) || {};
    const g = best(ORDER.filter((n) => fol[n] && fol[n].d30 != null), (n) => fol[n].d30);
    const v = best(ORDER.filter((n) => per[n] && per[n].views), (n) => per[n].views);
    if (g && fol[g].d30 > 0) t.nets = 'Crește cel mai repede ' + NET[g] + ': ' + signed(fol[g].d30) + ' urmăritori în 30 de zile.';
    else if (v) t.nets = 'Cele mai multe vizualizări vin de pe ' + NET[v] + ' (' + k(per[v].views) + ' în 30 de zile).';
    const F = R.funnel && R.funnel.month;
    if (F && (F.kw || F.leads)) t.funnel = 'Luna asta: ' + pl(Math.round(F.kw || 0), 'comentariu', 'comentarii') + ' cu cuvântul, ' + pl(Math.round(F.leads || 0), 'lead', 'leaduri') + ', ' + pl(Math.round(F.clients || 0), 'clientă', 'cliente') + '.';
    if ((R.hot || []).length) t.hot = (R.hot.length === 1 ? 'O postare merge' : R.hot.length + ' postări merg') + ' mult peste obișnuit: reclama din ea prinde cel mai bine acum.';
    const ml = (L.more_like || [])[0]; if (ml) t.more = 'Facem mai mult din „' + (ml.topic || ml.rubric) + '”: ' + x1(ml.score) + ' față de o postare obișnuită.';
    const tp = (R.top || [])[0]; if (tp) t.top = 'Pe primul loc: „' + (tp.topic || tp.rubric || KIND[tp.kind]) + '”, ' + k(tp.views) + ' vizualizări.';
    const r1 = (L.rubrics || [])[0], h1 = (L.hooks || [])[0];
    if (r1 || h1) t.ranks = [r1 ? 'Merge cel mai bine rubrica ' + (r1.rubric || 'fără rubrică') + ' (' + x1(r1.score) + ')' : '', h1 ? 'cârligul ' + (hookName(h1.hookType) || 'fără tip').toLowerCase() + ' (' + x1(h1.score) + ')' : ''].filter(Boolean).join(', ') + '.';
    const A = R.audience;
    if (A) {
      const age = best(A.ages || [], (a) => a.p), city = (A.cities || [])[0];
      const who = A.gender ? (A.gender.F >= 50 ? 'mai ales femei' : 'mai ales bărbați') : '';
      const bits = [who, age ? age.k + ' ani' : '', city ? 'din ' + city.name : ''].filter(Boolean);
      if (bits.length) t.aud = 'Publicul: ' + bits.join(', ') + '.';
    }
    const rec = R.hoursRec || {}, diff = ORDER.filter((n) => rec[n] && !rec[n].same).length;
    if (Object.keys(rec).length) t.hours = diff ? 'Pe ' + pl(diff, 'rețea', 'rețele') + ' sunt ore mai bune decât cele de acum: un tap le salvează.' : 'Orele de acum sunt deja cele mai bune.';
    const G = R.goals;
    if (G && G.set) { const late = (G.rows || []).filter((x) => x.pace === 'behind').length; t.goals = late ? pl(late, 'țintă', 'ținte') + ' în urmă: le vezi mai sus cu estimarea.' : 'Toate țintele sunt în grafic.'; }
    return t;
  }
  // what will appear, and when, while a block has no data yet
  const SOON = [
    ['an', 'sparkles', 'Analiza săptămânii', 'Lunea dimineață, după o săptămână cu postări: ce a mers, ce nu și ce schimbăm.'],
    ['nets', 'users', 'Pe rețele', 'Urmăritorii și creșterea, zilnic, după primele postări pe fiecare rețea.'],
    ['funnel', 'userPlus', 'Pâlnia organică', 'Când apar comentariile cu „360”: mesaje, leaduri, programări, cliente, încasări.'],
    ['ranks', 'trophy', 'Ce merge', 'Rubricile, subiectele și cârligele, după postările de cel puțin 3 zile.'],
    ['top', 'star', 'Top 10', 'Cele mai bune postări din ultimele 30 de zile, cu cifrele lor.'],
    ['aud', 'globe', 'Publicul', 'Vârsta, orașele și orele online, când Instagram și Facebook dau datele.'],
    ['voice', 'chat', 'Ce spun oamenii', 'Temele, întrebările și obiecțiile din comentarii, o dată pe săptămână.'],
  ];
  function soonBlock(have) {
    const list = SOON.filter((x) => !have[x[0]]);
    if (!list.length) return '';
    return '<section class="cn-sec"><h3>Apare în curând</h3><div class="cn-soon">' + list.map(([, ic, t, d]) => '<div class="cn-soon-c"><span class="cn-soon-ic">' + icon(ic) + '</span><b>' + t + '</b><p>' + d + '</p></div>').join('') + '</div></section>';
  }
  // the dashboard: the key numbers first, then the blocks in the owner's order; side by side on a wide screen
  function resTab() {
    const R = S.r;
    if (!R) return S.rErr ? K.empty('alert', 'Nu am putut încărca insights', esc(S.rErr)) : '<div class="k-skel" style="height:420px"></div>';
    const L = R.learn || {}, T = takes(R, L);
    const any = Object.keys(R.followers || {}).length || (R.last30 && R.last30.total.posts) || (R.month && R.month.total.posts) || R.audience || (R.analysis || []).length || (R.goals && R.goals.set);
    if (!any && orgBlock(R)) return '<div class="cn-dash"><div class="cn-dw is-w12">' + orgBlock(R) + '</div></div>' + soonBlock({});
    if (!any) return '<div class="cn-ins0"><span class="cn-ins0-ic">' + icon('trend') + '</span><b>Insights apar după primele postări</b><p>Fiecare postare își aduce cifrele aici. Până atunci, ce urmează:</p><button type="button" class="k-btn is-outline" data-ctgoals>' + icon('target') + 'Setează ținte lunare</button></div>' + soonBlock({});
    const w = (cls, html) => (html ? '<div class="cn-dw ' + cls + '">' + html + '</div>' : '');
    const an = analysisBlock(R), gl = take(goalsBlock(R), T.goals);
    const og = orgBlock(R), nc = take(netCards(R), T.nets), fu = take(funnelBlock(R), T.funnel), ho = take(hotBlock(R), T.hot), ml = take(moreLike(L), T.more), tt = take(topTen(R), T.top), rk = take(ranks(L), T.ranks);
    const au = take(audienceBlock(R), T.aud), hr = take(hoursBlock(R, L), T.hours);
    const vo = voiceBlock(R), mo = monthCard(R);
    const have = { an, nets: nc, funnel: fu, ranks: rk, top: tt, aud: au, voice: vo };
    return kpis(R) + '<div class="cn-dash">' +
      w(an && gl ? 'is-w7' : 'is-w12', an) + w(an && gl ? 'is-w5' : 'is-w12', gl) +
      w('is-w12', og) + w('is-w12', nc) + w('is-w12', fu) + w('is-w12', ho) + w('is-w12', ml) + w('is-w12', tt) + w('is-w12', rk) +
      w('is-w12', au) + w('is-w12', hr) + w(vo && mo ? 'is-w7' : 'is-w12', vo) + w(vo && mo ? 'is-w5' : 'is-w12', mo) + '</div>' + soonBlock(have);
  }
  // the moments of the weeks ahead (reels/calendar.json): what the producer makes for them
  function seasonBox() {
    const list = (S.d && S.d.season) || [];
    if (!list.length) return '';
    return '<section class="cn-sec"><h3>Momente care vin</h3><div class="cn-sea">' + list.map((x) => '<div class="cn-sea-c"><span class="cn-sea-d">' + esc(dm(x.from)) + '-' + esc(dm(x.to)) + '</span><b>' + esc(x.name) + '</b>' + (x.angle ? '<p>' + esc(x.angle) + '</p>' : '') + (x.note ? '<small>' + esc(x.note) + '</small>' : '') + '</div>').join('') + '</div></section>';
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
  // Organic → vânzări (21.11): the last 14 days, per source (network × bio / story / dm / reel): visits, how far they went
  // on the site, the cards paid and their lei, the site's lead-filter leads; then the keyword messages per network
  const ORG_NET = { instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok', youtube: 'YouTube' };
  const ORG_MED = { bio: 'bio', profil: 'profil', story: 'story', dm: 'mesaj privat', reel: 'reel', post: 'postare', altele: 'alt link' };
  function orgBlock(R) {
    const O = R.organic;
    if (!O || !O.ok) return '';
    const T = O.total || {}, D = O.dm || {};
    const rows = Object.keys(T).sort((a, b) => (T[b].cardsLei || 0) - (T[a].cardsLei || 0) || (T[b].visit || 0) - (T[a].visit || 0));
    const dmNets = Object.keys(D);
    if (!rows.length && !dmNets.length) return '';
    const name = (src) => { const [n, m] = src.split(':'); return (ORG_NET[n] || n) + (m ? ' · ' + (ORG_MED[m] || m) : ' · fără etichetă'); };
    const c = (v) => full(v || 0);
    const table = rows.length ? '<div class="cn-st-w"><table class="cn-st"><thead><tr><th>Sursa</th><th>Vizite</th><th>Au apăsat</th><th>La plată</th><th>Carduri</th><th>Leaduri</th></tr></thead><tbody>' +
      rows.map((src) => { const t = T[src]; return '<tr><td>' + esc(name(src)) + '</td><td>' + c(t.visit) + '</td><td>' + c(t.cta) + '</td><td>' + c(t.pay) + '</td><td>' + c(t.cardsPaid) + (t.cardsLei ? '<small> · ' + lei(t.cardsLei) + '</small>' : '') + '</td><td>' + c((t.lfLeads || 0) + (t.cardsReserved || 0)) + '</td></tr>'; }).join('') +
      '</tbody></table></div>' : '';
    const dmLine = dmNets.length ? '<div class="cn-fn-t"><span class="cn-fn-tl"><b>Mesajele cu cuvântul</b><small>comentarii și răspunsuri la story, cu linkul</small></span>' +
      dmNets.map((n) => { const x = D[n]; return '<span><b>' + c((x.comments || 0) + (x.stories || 0)) + '</b>' + (n === 'ig' ? 'Instagram' : 'Facebook') + '<small>' + c(x.stories) + ' din story · ' + c(x.replies) + ' au răspuns</small></span>'; }).join('') + '</div>' : '';
    return '<section class="cn-sec"><div class="cn-sh"><h3>Organic → vânzări</h3><small>ultimele 14 zile</small></div>' + table + dmLine + '</section>';
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
    const files = (it.files || []).slice().sort(byName);
    const vid = mainVid(it);
    if (vid) return '<div class="cn-pv"><video src="' + esc(fileUrl(it, vid.name)) + '"' + (it.cover ? ' poster="' + esc(cover(it)) + '"' : '') + ' controls playsinline preload="none"></video></div>';
    const imgs = files.filter((f) => /^image\//.test(f.mime));
    return '<div class="cn-pv' + (photo(it) ? ' is-photo' : '') + (imgs.length > 1 ? ' is-many' : '') + '">' + imgs.map((f) => '<img src="' + esc(fileUrl(it, f.name)) + '" alt="" loading="lazy">').join('') + '</div>';
  }
  // a network's entry not out yet can be taken off that network only (the others keep theirs)
  const canSkip = (e) => !['posted', 'posting', 'skipped', 'missed'].includes(e.state);
  let focusNet = '';
  // the owner's change request on the item: his words, the areas, the references (links, his files)
  function requestView(r) {
    if (!r) return '';
    const files = (r.files || []).map((f) => {
      const u = f.url.replace(/^https?:\/\/[^/]+/, '');
      return f.kind === 'image' ? '<a class="cn-rf is-img" href="' + esc(u) + '" target="_blank" rel="noopener"><img src="' + esc(u) + '" alt="" loading="lazy"></a>'
        : '<a class="cn-rf" href="' + esc(u) + '" target="_blank" rel="noopener">' + (f.kind === 'video' ? icon('video') : f.kind === 'audio' ? mi('note') : icon('file')) + '<span>' + esc(f.name) + '</span></a>';
    }).join('');
    return '<div class="cn-rqv">' + ((r.areaNames || []).length ? '<span class="cn-ar-ts">' + r.areaNames.map((a) => '<i class="cn-ar-t">' + esc(a) + '</i>').join('') + '</span>' : '') +
      (r.note ? '<p>' + esc(r.note) + '</p>' : '') + ((r.links || []).length ? '<ul class="cn-rq-ls">' + r.links.map((l) => '<li>' + icon('link') + '<a href="' + esc(l) + '" target="_blank" rel="noopener">' + esc(l.replace(/^https?:\/\/(www\.)?/, '')) + '</a></li>').join('') + '</ul>' : '') +
      (files ? '<div class="cn-rfs">' + files + '</div>' : '') + '</div>';
  }
  function itemBody(it) {
    const on = S.d.settings.nets, r = review(it);
    const rv = REVIEW[r];
    const status = '<div class="cn-rv is-' + r + '">' + favBtn(it, 'is-chip') + shareBtn(it, 'is-chip') + '<span class="k-tag ' + rv[1] + '">' + (r === 'approved' ? icon('check') : r === 'redo' ? icon('undo') : '') + rv[0] + '</span>' +
      (r === 'redo' ? (it.redo ? requestView(it.redo) : it.redoNote ? '<p>' + esc(it.redoNote) + '</p>' : '') : r === 'pending' && it.replacedAt ? '<p>Refăcut' + (it.redoNote ? ': ' + esc(it.redoNote) : '') + '</p>' : '') +
      (r === 'approved' ? (it.notes || []).filter((n) => n && n.kind === 'approve' && n.note).slice(-1).map((n) => '<p class="cn-rv-nt">' + icon('pen') + esc(n.note) + '</p>').join('') : '') +
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
      const can = on[e.net] && modeOf(e.net) === 'auto' && S.d.settings.on && r === 'approved' && (e.state === 'planned' || e.state === 'error' || e.state === 'missed') && e.net !== 'tt' && e.net !== 'yt';
      const app = e.manual || e.state === 'todo' || (modeOf(e.net) === 'app' && e.state !== 'posted');
      return '<li class="cn-pl is-' + e.state + (e.net === focusNet ? ' is-focus' : '') + '" data-ctpl="' + e.net + '"><div class="cn-pl-h">' + badge(e.net) + '<b>' + NET[e.net] + (e.kind && e.kind !== it.kind ? ' · ' + KIND[e.kind] : '') + '</b>' +
        (app ? '<span class="k-tag">' + icon('share') + 'Din aplicație</span>' : '') + '<span class="k-tag ' + TONE[e.state] + '">' + STATE[e.state] + '</span></div>' +
        '<p>' + esc(when(e.postedAt || e.at)) + (e.url ? ' · <a href="' + esc(e.url) + '" target="_blank" rel="noopener">Deschide</a>' : '') + '</p>' + manualLine(e) +
        (e.skips && e.skips.length ? '<p class="cn-pl-sk">' + icon('ban') + '<span>Sărit ' + e.skips.map((k) => esc(dow(roDay(k.at)) + ' ' + fTime.format(new Date(k.at)) + ': ' + k.reason)).join(' · ') + '</span></p>' : '') +
        (e.error && e.state !== 'posted' ? '<p class="cn-err">' + esc(e.error) + (e.tries ? ' (' + e.tries + '/3)' : '') + '</p>' : '') + (e.hold && e.state === 'planned' ? '<p class="cn-err is-warn">' + esc(e.hold) + '</p>' : '') +
        (e.note ? '<p class="cn-err is-warn">' + icon('eyeOff') + esc(e.note) + '</p>' : '') +
        (e.comment && (e.comment.text || e.comment.error) ? '<p class="cn-cmt' + (e.comment.error ? ' is-bad' : '') + '">' + icon('chat') + '<span>' + esc(e.comment.text || '') + (e.comment.error ? '<em>' + esc(e.comment.error) + '</em>' : '') + '</span></p>' : '') +
        (e.state === 'posted' && it.stats && it.stats[e.net] ? statLine(it.stats[e.net]) : '') +
        (can || canSkip(e) ? '<div class="cn-pl-a">' + (can ? '<button type="button" class="k-btn is-outline is-sm" data-ctnow="' + e.net + '">' + icon('arrow') + 'Postează acum</button>' : '') +
          (canSkip(e) ? '<button type="button" class="k-btn is-ghost is-sm" data-ctskipnet="' + e.net + '">' + icon('ban') + 'Scoate de pe ' + NET[e.net] + '</button>' : '') + '</div>' : '') + boostLine(it, e) + '</li>';
    }).join('');
    const fc = it.firstComment && !(it.plan || []).some((e) => e.comment) ? '<p class="cn-cmt is-plan">' + icon('chat') + '<span><small>Primul comentariu</small>' + esc(it.firstComment) + '</span></p>' : '';
    return status + qa + statsSection(it) + preview(it) + (plan ? '<h5 class="cn-dsub">Când și unde</h5><ul class="cn-plan">' + plan + '</ul>' : '') + '<h5 class="cn-dsub">Textele</h5><section class="cn-caps">' + caps + '</section>' + fc;
  }
  // a post made from the app: which post the numbers come from, or why there are none (and the link to give them)
  function manualLine(e) {
    if (!(e.state === 'posted' && e.manual)) return '';
    const m = e.match || {};
    const say = m.state === 'matched' ? '<p class="cn-pl-m is-good">' + icon('check') + '<span>' + (m.how === 'link' ? 'Cifrele vin din link.' : 'Am găsit postarea după oră și text.') + '</span></p>'
      : m.state === 'pending' ? '<p class="cn-pl-m">' + icon('refresh') + '<span>Caut postarea ca să-i citesc cifrele' + (m.note ? ' (' + esc(m.note) + ')' : '') + '.</span></p>'
        : '<p class="cn-pl-m is-warn">' + icon('alert') + '<span>' + esc(blindText(e)) + (m.note && m.state === 'none' ? ' ' + esc(m.note) + '.' : '') + '</span></p>';
    const form = m.state === 'matched' && m.how === 'link' ? '' : '<form class="cn-pl-lk" data-ctlink="' + e.net + '" autocomplete="off"><input type="url" name="link" inputmode="url" placeholder="Linkul postării" aria-label="Linkul postării pe ' + NET[e.net] + '"><button type="submit" class="k-btn is-outline is-sm">' + icon('link') + 'Adaugă linkul</button></form>';
    return say + form;
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
    const dur = (mainVid(it) || {}).dur || 0;
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
  function openItem(id, net) {
    const it = itemById(id); if (!it) return;
    openId = id; focusNet = net || '';
    if (!S.r && (it.plan || []).some((e) => e.state === 'posted')) setTimeout(() => loadResults(), 0);
    dr = K.drawer({
      title: title(it), subtitle: esc([KIND[it.kind], it.rubric, it.keyword ? '„' + it.keyword + '”' : '', it.week ? range(it.week) : ''].filter(Boolean).join(' · ')), icon: photo(it) ? 'layers' : 'video', width: 540,
      body: itemBody(it), focus: false, footer: itemFoot(it) || ' ',
      onClose: () => { dr = null; openId = ''; focusNet = ''; },
      onMount(el) {
        // opened from a post in the Calendar: its network's line in view
        if (focusNet) setTimeout(() => { const x = el.querySelector('[data-ctpl="' + focusNet + '"]'); if (x) x.scrollIntoView({ block: 'center', behavior: still ? 'auto' : 'smooth' }); }, 320);
        el.addEventListener('input', (e) => {
          const t = e.target.closest('[data-ctcap]'); if (!t) return;
          const c = el.querySelector('[data-ctcount="' + t.dataset.ctcap + '"]'); if (c) c.textContent = t.value.length + '/' + CAP_MAX[t.dataset.ctcap];
        });
        el.addEventListener('submit', async (e) => {
          const f = e.target.closest('[data-ctlink]'); if (!f) return;
          e.preventDefault();
          const link = f.elements.link.value.trim();
          if (!link) { K.ui().toast('Lipește linkul postării.', 'error'); f.elements.link.focus(); return; }
          if (!linkOk(f.dataset.ctlink, link)) return badLink(f.dataset.ctlink, f.elements.link);
          if (await save({ action: 'app_link', id, net: f.dataset.ctlink, link }, f.querySelector('button'))) K.ui().toast('Link salvat. Cifrele vin de acolo.', 'success');
        });
        el.addEventListener('change', async (e) => {
          const t = e.target.closest('[data-ctcap]'); if (!t) return;
          if (await save({ action: 'captions', id, captions: { [t.dataset.ctcap]: t.value } }, null, true)) K.ui().toast('Text salvat pentru ' + NET[t.dataset.ctcap] + '.', 'success');
        });
        el.addEventListener('click', async (e) => {
          const cur = itemById(id) || it;
          const fv = e.target.closest('[data-ctfav]'); if (fv) return toggleFav(id);
          const sh = e.target.closest('[data-ctshare]'); if (sh) return shareVid(id);
          const bst = e.target.closest('[data-ctboost]'); if (bst) return boost(bst, id, bst.dataset.ctboost);
          const sn = e.target.closest('[data-ctskipnet]');
          if (sn) {
            const net = sn.dataset.ctskipnet;
            if (!(await K.ui().confirm({ title: 'Scoți de pe ' + NET[net] + '?', message: '„' + title(cur) + '” nu se mai postează pe ' + NET[net] + '. Celelalte rețele rămân cum sunt.', confirmText: 'Scoate', danger: true }))) return;
            if (await save({ action: 'skip', id, net })) K.ui().toast('Scos de pe ' + NET[net] + '.', 'success');
            return;
          }
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
          if (e.target.closest('[data-ctredo]')) return openRedo(id);
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
    const q = (n, w, kind, label) => '<label class="k-field"><span>' + label + '</span><input type="number" inputmode="numeric" min="0" max="' + (kind === 'reel' ? 28 : kind === 'story' ? 35 : 7) + '" data-ctq="' + w + '|' + n + '|' + kind + '" value="' + esc(String(st.quotas[w][n][kind] != null ? st.quotas[w][n][kind] : 0)) + '"></label>';
    const pk = { tt: 'slideshow', ig: 'carousel', fb: 'carousel' };
    const STORY = { ig: true, fb: true };
    const card = (n) => '<div class="cn-netc"><div class="cn-setr">' + badge(n) + '<b>' + NET[n] + '</b>' + K.seg('ctmode_' + n, [['app', 'Din aplicație'], ['auto', 'Automat']], modeOf(n), 'cn-seg-sm cn-mode') + '</div>' +
      '<div class="cn-setr cn-api' + (modeOf(n) === 'app' ? ' is-hidden' : '') + '" data-ctapi="' + n + '"><span>Postare prin API</span>' + K.toggle('net_' + n, st.nets[n]) + '</div>' +
      '<div class="cn-nf">' + t(n, 0) + t(n, 1) + (pk[n] ? t(n, 'p') : '<span></span>') + '</div>' +
      '<div class="cn-nf">' + q(n, 'warm', 'reel', 'Reels săpt. 1-' + st.warmWeeks) + q(n, 'full', 'reel', 'Reels apoi') + (pk[n] ? q(n, 'full', pk[n], n === 'tt' ? 'Slideshow' : 'Carusele') : '<span></span>') + '</div>' +
      // stories (Instagram, Facebook): their own times and quota
      (STORY[n] ? '<div class="cn-nf"><label class="k-field cn-nf-w"><span>Ore story</span><input type="text" inputmode="numeric" maxlength="40" placeholder="10:00, 15:00, 21:00" data-ctstory="' + n + '" value="' + esc(((st.storyTimes || {})[n] || []).join(', ')) + '"></label>' +
        q(n, 'full', 'story', 'Story-uri pe săpt.') + '</div>' : '') + '</div>';
    const conn = access();
    const body = '<section class="cn-set"><h5>Conexiuni</h5>' + (conn || '<p class="cn-set-p">' + icon('check') + ' Conturile sunt conectate.</p>') + '</section>' +
      '<section class="cn-set"><h5>Rețele, ore și cote pe săptămână</h5><p class="cn-set-p">Din aplicație: la ora din program primești o notificare și postezi tu, cu sunetul din aplicație. Automat: se postează singur, prin API.</p>' + NETS.map(card).join('') + '</section>' +
      '<section class="cn-set"><h5>Prima săptămână</h5><label class="k-field"><span>Luni</span><input type="date" data-ctstart value="' + esc(st.startWeek) + '"></label></section>' +
      '<section class="cn-set"><h5>Concurenți</h5><label class="k-field"><span>Nu apar în texte</span><input type="text" data-ctcomp maxlength="600" placeholder="Nume, despărțite prin virgulă" value="' + esc((st.competitors || []).join(', ')) + '"></label></section>';
    // Ținte lunare: the followers gained per network, the views, the organic leads (empty: no goal)
    const gi = (key, label, v) => '<label class="k-field"><span>' + label + '</span><input type="number" inputmode="numeric" min="0" step="1" placeholder="-" data-ctgoal="' + key + '" value="' + (v ? esc(String(v)) : '') + '"></label>';
    const goals = '<section class="cn-set" data-ctgoalsec><h5>Ținte lunare</h5><div class="cn-gf">' + NETS.map((n) => gi('f_' + n, 'Urmăritori noi ' + NET[n], (G.followers || {})[n])).join('') +
      gi('views', 'Vizualizări', G.views) + gi('leads', 'Leaduri organice', G.leads) + '</div></section>';
    const d = K.drawer({
      title: 'Setări Content', icon: 'sliders', width: 480, body: goalsFirst ? goals + body : body + goals, focus: false,
      footer: '<span class="k-grow"></span><button type="button" class="k-btn is-primary" data-ctsave>' + icon('check') + 'Salvează</button>',
      onMount(el) {
        // Automat shows its API switch; Din aplicație needs none
        el.addEventListener('change', (e) => {
          const m = /^ctmode_(tt|yt|ig|fb)$/.exec(e.target.name || ''); if (!m) return;
          const r = el.querySelector('[data-ctapi="' + m[1] + '"]'); if (r) r.classList.toggle('is-hidden', e.target.value !== 'auto');
        });
        el.addEventListener('click', async (e) => {
          if (e.target.closest('[data-ctgo]')) { d.close(); return K.go('integrari'); }
          const b = e.target.closest('[data-ctsave]'); if (!b) return;
          const nets = {}, modes = {}, times = {}, photoTime = {}, storyTimes = {}, quotas = { warm: {}, full: {} };
          let bad = '';
          NETS.forEach((n) => {
            nets[n] = el.querySelector('input[name="net_' + n + '"]').checked;
            modes[n] = el.querySelector('input[name="ctmode_' + n + '"]').value === 'auto' ? 'auto' : 'app';
            const ts = [0, 1].map((i) => el.querySelector('[data-cttime="' + n + '|' + i + '"]').value.trim().replace(/^(\d):/, '0$1:')).filter(Boolean);
            if (!ts.length) bad = 'Fiecare rețea are cel puțin o oră.';
            times[n] = ts;
            const p = el.querySelector('[data-cttime="' + n + '|p"]');
            if (p) { photoTime[n] = p.value.trim().replace(/^(\d):/, '0$1:'); if (ts.includes(photoTime[n])) bad = 'Ora caruselului e alta decât orele reels.'; }
          });
          el.querySelectorAll('[data-ctstory]').forEach((x) => {
            const ts = x.value.split(/[,;\s]+/).map((v) => v.trim().replace(/^(\d):/, '0$1:')).filter(Boolean);
            if (!ts.length) bad = 'Story-urile au cel puțin o oră.';
            storyTimes[x.dataset.ctstory] = ts.slice(0, 5);
          });
          if ([].concat(...Object.values(times), Object.values(photoTime), ...Object.values(storyTimes)).some((x) => !/^([01]\d|2[0-3]):[0-5]\d$/.test(x))) bad = 'Orele se scriu ca 19:30.';
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
          if (await save({ action: 'settings', nets, modes, times, photoTime, storyTimes, quotas, startWeek: start || st.startWeek, competitors, goals }, b)) { K.ui().toast('Salvat.', 'success'); d.close(); loadResults(true); }
        });
      },
    });
  }

  // Marketing → Setări opens this from outside Conținut (the content first, so the form starts from what is saved)
  window.C360Content = {
    async openSettings() {
      if (!S.d) { try { S.d = await K.api('/api/portal-content', { action: 'get' }); } catch (e) { K.ui().toast(K.errText(e), 'error'); return; } }
      openSettings();
    },
  };

  K.section('continut', { mount, show() { load(); } });
})();
