// Centrul360 portal, Marketing → „Conținut” (the owner, 12.11: „content infinit”): the organic reels, carousels and
// stories the nightly producer hands in (api/content-intake.js), planned on the networks and posted by the clock
// without approval (api/_lib/content-post.js). Here: the switch, the next 7 days, the queue, the week's top, the last
// posted with their numbers, and per item its preview, caption and plan (Postează acum, Scoate). Admin only.
(function () {
  'use strict';
  const K = window.K;
  if (!K) return;
  const { esc, icon } = K;
  const S = { d: null, busy: false };
  let panel = null, dr = null, openId = '';

  const NET = { ig: 'Instagram', fb: 'Facebook', tt: 'TikTok', yt: 'YouTube' };
  const NET_S = { ig: 'IG', fb: 'FB', tt: 'TT', yt: 'YT' };
  const KIND = { reel: 'Reel', carousel: 'Carusel', story: 'Story' };
  const STATE = { planned: 'Programat', posting: 'Se publică', posted: 'Postat', error: 'Eroare', waiting_access: 'Așteaptă acces', skipped: 'Scos' };
  const TONE = { planned: 'is-info', posting: 'is-warn', posted: 'is-good', error: 'is-bad', waiting_access: '', skipped: '' };
  const TZ = 'Europe/Bucharest';
  const fDay = new Intl.DateTimeFormat('en-CA', { timeZone: TZ });
  const fTime = new Intl.DateTimeFormat('ro-RO', { timeZone: TZ, hour: '2-digit', minute: '2-digit' });
  const fDow = new Intl.DateTimeFormat('ro-RO', { timeZone: TZ, weekday: 'short' });
  const roDay = (t) => fDay.format(new Date(t));
  const dm = (d) => d.slice(8, 10) + '.' + d.slice(5, 7);
  const addDay = (d, n) => { const [y, m, x] = d.split('-').map(Number); return new Date(Date.UTC(y, m - 1, x + n, 12)).toISOString().slice(0, 10); };
  const when = (iso) => { const d = roDay(iso), t = S.d.today; return (d === t ? 'azi' : d === addDay(t, 1) ? 'mâine' : d === addDay(t, -1) ? 'ieri' : fDow.format(new Date(iso)).replace('.', '') + ' ' + dm(d)) + ', ' + fTime.format(new Date(iso)); };
  const fileUrl = (id, n) => '/api/content-file?i=' + encodeURIComponent(id) + '&n=' + encodeURIComponent(n);
  const cover = (it) => (it.cover ? fileUrl(it.id, it.cover) : '');
  const title = (it) => it.topic || it.rubric || KIND[it.kind];
  const k = (n) => (n >= 10000 ? Math.round(n / 1000) + 'k' : n >= 1000 ? (Math.round(n / 100) / 10).toLocaleString('ro-RO') + 'k' : String(n || 0));
  const thumb = (it, cls) => '<span class="cn-th ' + (cls || '') + ' is-' + it.kind + '">' + (it.cover ? '<img src="' + esc(cover(it)) + '" alt="" loading="lazy">' : icon(it.kind === 'carousel' ? 'layers' : 'video')) + '</span>';
  const badge = (net) => '<i class="cn-net is-' + net + '">' + NET_S[net] + '</i>';

  // ------------------------------------------------------------------ the page
  function mount(p) {
    panel = p;
    panel.classList.add('k-panel', 'cn');
    panel.innerHTML = '<div class="k-head"><div><div class="k-eyebrow">Marketing</div><h2>Conținut</h2></div><div class="k-head-actions" data-cthead></div></div><div data-ctbody><div class="k-skel" style="height:420px"></div></div>';
    panel.addEventListener('click', (e) => {
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
  async function save(payload, btn) {
    if (btn) btn.disabled = true;
    try { S.busy = true; const r = await K.api('/api/portal-content', payload); S.d = r; paint(); return r; }
    catch (err) { K.ui().toast(K.errText(err, 'Nu am putut salva.'), 'error'); return null; }
    finally { S.busy = false; if (btn) btn.disabled = false; }
  }
  function entries() {
    const out = [];
    S.d.items.forEach((it) => (it.plan || []).forEach((e) => out.push({ it, e })));
    return out;
  }
  function paint() {
    if (!panel || !S.d) return;
    const st = S.d.settings;
    panel.querySelector('[data-cthead]').innerHTML = K.toggle('cton', st.on, st.on ? 'Postare automată' : 'Oprită') +
      '<button type="button" class="k-icon-btn" data-ctset aria-label="Setări">' + icon('sliders') + '</button>';
    panel.querySelector('[data-ctbody]').innerHTML = access() + summary() + week() + topWeek() + errors() + last();
    if (dr && openId) { const it = S.d.items.find((x) => x.id === openId); if (it) { const y = dr.body.scrollTop; dr.body.innerHTML = itemBody(it); dr.body.scrollTop = y; } }
  }
  function access() {
    const a = S.d.access;
    if (!a.connected) return '<p class="cn-line is-bad">' + icon('alert') + '<span>Facebook nu e conectat.</span><button type="button" class="k-btn is-ghost is-sm" data-ctgo>Integrări</button></p>';
    if (a.missing && a.missing.length) return '<p class="cn-line">' + icon('key') + '<span>Lipsesc permisiunile ' + esc(a.missing.join(', ')) + '</span><button type="button" class="k-btn is-ghost is-sm" data-ctgo>Reconectează</button></p>';
    return '';
  }
  function summary() {
    const s = S.d.status, c = s.counts || {};
    const until = s.until ? 'ajung până pe ' + dm(s.until) : 'coada e goală';
    const tag = (n, label, tone) => (n ? '<span class="k-tag ' + tone + '">' + n + ' ' + label + '</span>' : '');
    return '<section class="cn-sum' + (S.d.settings.on ? '' : ' is-off') + '"><div class="cn-sum-n"><b>' + (s.queued || 0) + '</b><span>în coadă</span></div>' +
      '<div class="cn-sum-t"><p><b>' + until + '</b>' + (s.daysAhead != null && s.until ? ' · ' + s.daysAhead + (s.daysAhead === 1 ? ' zi' : ' zile') : '') + '</p>' +
      '<div class="cn-tags">' + tag(c.posted, c.posted === 1 ? 'postat' : 'postate', 'is-good') + tag(c.posting, 'se publică', 'is-warn') + tag(c.error, c.error === 1 ? 'eroare' : 'erori', 'is-bad') +
      tag(s.drafts, s.drafts === 1 ? 'în lucru' : 'în lucru', '') + (S.d.settings.on ? '' : '<span class="k-tag is-warn">' + icon('power') + 'oprită</span>') + '</div></div></section>';
  }
  function week() {
    const days = []; for (let i = 0; i < 7; i++) days.push(addDay(S.d.today, i));
    const by = {};
    entries().forEach(({ it, e }) => {
      if (e.state === 'skipped') return;
      const d = roDay(e.at); if (!days.includes(d)) return;
      const t = fTime.format(new Date(e.at));
      ((by[d] = by[d] || {})[t] = by[d][t] || []).push({ it, e });
    });
    const slots = S.d.settings.slots;
    const col = (d, i) => {
      const times = [...new Set(slots.concat(Object.keys(by[d] || {})))].sort();
      const head = i === 0 ? 'Azi' : i === 1 ? 'Mâine' : fDow.format(new Date(d + 'T12:00:00Z')).replace('.', '');
      return '<div class="cn-day' + (i === 0 ? ' is-today' : '') + '"><h4>' + esc(head) + '<small>' + dm(d) + '</small></h4>' + times.map((t) => {
        const list = ((by[d] || {})[t] || []).sort((a, b) => 'igfbttyt'.indexOf(a.e.net) - 'igfbttyt'.indexOf(b.e.net));
        return '<div class="cn-slot"><time>' + t + '</time><div class="cn-chips">' + (list.length ? list.map(({ it, e }) =>
          '<button type="button" class="cn-chip is-' + e.state + '" data-ctitem="' + esc(it.id) + '" title="' + esc(NET[e.net] + ' · ' + title(it) + ' · ' + STATE[e.state]) + '">' + thumb(it) + badge(e.net) + (e.state === 'posted' ? '<em>' + icon('check') + '</em>' : e.state === 'error' ? '<em class="is-bad">' + icon('alert') + '</em>' : '') + '</button>').join('') : '<span class="cn-free"></span>') + '</div></div>';
      }).join('') + '</div>';
    };
    return '<section class="cn-sec"><h3>Următoarele 7 zile</h3><div class="cn-week">' + days.map(col).join('') + '</div></section>';
  }
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
    const bad = entries().filter(({ e }) => e.state === 'error' || (e.hold && e.state === 'planned')).sort((a, b) => b.e.at.localeCompare(a.e.at)).slice(0, 6);
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
    if (vid) return '<div class="cn-pv is-' + it.kind + '"><video src="' + esc(fileUrl(it.id, vid.name)) + '"' + (it.cover ? ' poster="' + esc(cover(it)) + '"' : '') + ' controls playsinline preload="none"></video></div>';
    const imgs = files.filter((f) => /^image\//.test(f.mime));
    return '<div class="cn-pv is-' + it.kind + (imgs.length > 1 ? ' is-many' : '') + '">' + imgs.map((f) => '<img src="' + esc(fileUrl(it.id, f.name)) + '" alt="" loading="lazy">').join('') + '</div>';
  }
  function itemBody(it) {
    const on = S.d.settings.nets;
    const plan = (it.plan || []).slice().sort((a, b) => a.at.localeCompare(b.at)).map((e) => {
      const can = on[e.net] && (e.state === 'planned' || e.state === 'error');
      return '<li class="cn-pl is-' + e.state + '"><div class="cn-pl-h">' + badge(e.net) + '<b>' + NET[e.net] + '</b><span class="k-tag ' + TONE[e.state] + '">' + STATE[e.state] + '</span></div>' +
        '<p>' + esc(when(e.postedAt || e.at)) + (e.url ? ' · <a href="' + esc(e.url) + '" target="_blank" rel="noopener">Deschide</a>' : '') + '</p>' +
        (e.error && e.state !== 'posted' ? '<p class="cn-err">' + esc(e.error) + (e.tries ? ' (' + e.tries + '/3)' : '') + '</p>' : '') + (e.hold && e.state === 'planned' ? '<p class="cn-err is-warn">' + esc(e.hold) + '</p>' : '') +
        (e.state === 'posted' && it.stats && it.stats[e.net] ? statLine(it.stats[e.net]) : '') +
        (can ? '<button type="button" class="k-btn is-outline is-sm" data-ctnow="' + e.net + '">' + icon('arrow') + 'Postează acum</button>' : '') + '</li>';
    }).join('');
    return preview(it) +
      (it.caption ? '<section class="cn-cap"><small>Text</small><p>' + esc(it.caption) + '</p></section>' : '') +
      '<ul class="cn-plan">' + plan + '</ul>';
  }
  function openItem(id) {
    const it = S.d.items.find((x) => x.id === id); if (!it) return;
    openId = id;
    const live = (it.plan || []).some((e) => !['posted', 'skipped', 'posting'].includes(e.state));
    dr = K.drawer({
      title: title(it), subtitle: esc([KIND[it.kind], it.rubric, it.keyword ? '„' + it.keyword + '”' : ''].filter(Boolean).join(' · ')), icon: it.kind === 'carousel' ? 'layers' : 'video', width: 520,
      body: itemBody(it), focus: false,
      footer: live ? '<button type="button" class="k-btn is-ghost" data-ctskip>' + icon('ban') + 'Scoate</button>' : '',
      onClose: () => { dr = null; openId = ''; },
      onMount(el) {
        el.addEventListener('click', async (e) => {
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
          if (e.target.closest('[data-ctskip]')) {
            if (!(await K.ui().confirm({ title: 'Scoți „' + title(it) + '”?', message: 'Nu se mai postează nicăieri.', confirmText: 'Scoate', danger: true }))) return;
            if (await save({ action: 'skip', id })) { K.ui().toast('Scos din coadă.', 'success'); if (dr) dr.close(); }
          }
        });
      },
    });
  }

  // ------------------------------------------------------------------ settings
  function openSettings() {
    const st = S.d.settings;
    const body = '<section class="cn-set"><h5>Rețele</h5>' + ['ig', 'fb', 'tt', 'yt'].map((n) => '<div class="cn-setr">' + badge(n) + '<b>' + NET[n] + '</b>' + K.toggle('net_' + n, st.nets[n]) + '</div>').join('') + '</section>' +
      '<section class="cn-set"><h5>Orele</h5><div class="cn-times">' + [0, 1, 2].map((i) => '<label class="k-field"><span>' + (i + 1) + '</span><input type="text" inputmode="numeric" maxlength="5" placeholder="hh:mm" pattern="[0-2][0-9]:[0-5][0-9]" data-ctslot value="' + esc(st.slots[i] || '') + '"></label>').join('') + '</div></section>' +
      '<section class="cn-set"><h5>Pauza între rețele</h5>' + K.seg('ctgap', [['1', '1 zi'], ['2', '2 zile'], ['3', '3 zile']], String(st.gapDays)) + '</section>';
    const d = K.drawer({
      title: 'Setări conținut', icon: 'sliders', width: 440, body, focus: false,
      footer: '<span class="k-grow"></span><button type="button" class="k-btn is-primary" data-ctsave>' + icon('check') + 'Salvează</button>',
      onMount(el) {
        el.addEventListener('click', async (e) => {
          const b = e.target.closest('[data-ctsave]'); if (!b) return;
          const nets = {}; ['ig', 'fb', 'tt', 'yt'].forEach((n) => { nets[n] = el.querySelector('input[name="net_' + n + '"]').checked; });
          const slots = [...el.querySelectorAll('[data-ctslot]')].map((x) => x.value.trim().replace(/^(\d):/, '0$1:')).filter(Boolean);
          if (slots.some((x) => !/^([01]\d|2[0-3]):[0-5]\d$/.test(x))) { K.ui().toast('Orele se scriu ca 10:00.', 'error'); return; }
          const gap = el.querySelector('input[name="ctgap"]').value;
          if (await save({ action: 'settings', nets, slots, gapDays: Number(gap) }, b)) { K.ui().toast('Salvat.', 'success'); d.close(); }
        });
      },
    });
  }

  K.section('continut', { mount, show() { load(); } });
})();
