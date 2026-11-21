// Centrul360 portal, Admin → „Lead filter” (the owner, 21.11): the leads of the lead-filter forms (one per clinic and
// zone, the package picked in the form), today or the last 7 days: per package, per zone, per clinic, with how many got
// the WhatsApp of their package, wrote back and are booked. API: api/portal-leadfilter.js (api/_lib/leadfilter.js).
(function () {
  'use strict';
  const K = window.K;
  if (!K) return;
  const { esc, icon } = K;
  const S = { d: null, span: 'week' };
  let panel = null;
  const lei = (t) => String(t).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const pct = (a, b) => (b ? Math.round((a / b) * 100) + '%' : '');

  function mount(p) {
    panel = p;
    panel.classList.add('k-panel', 'lf');
    panel.innerHTML = '<div class="k-head"><div><div class="k-eyebrow">Marketing</div><h2>Lead filter</h2>' +
      '<p class="k-lede">Leadurile din formularele cu pachete: ce zonă, ce pachet, ce oraș și ce s-a întâmplat după.</p></div>' +
      '<div class="k-head-actions"><div class="k-seg" data-lfspan>' + [['today', 'Azi'], ['week', '7 zile']].map(([v, l]) =>
        '<button type="button" data-v="' + v + '" class="' + (S.span === v ? 'is-on' : '') + '">' + l + '</button>').join('') + '</div></div></div>' +
      '<div data-lfbody><div class="k-skel" style="height:420px"></div></div>';
    panel.addEventListener('click', (e) => {
      const b = e.target.closest('[data-lfspan] > button');
      if (!b) return;
      S.span = b.dataset.v;
      panel.querySelectorAll('[data-lfspan] > button').forEach((x) => x.classList.toggle('is-on', x === b));
      paint();
    });
  }
  async function load() {
    try { S.d = await K.api('/api/portal-leadfilter', { action: 'get' }); paint(); }
    catch (err) { const b = panel && panel.querySelector('[data-lfbody]'); if (b) b.innerHTML = K.empty('alert', 'Nu am putut încărca lead filterul', esc(K.errText(err))); }
  }
  function stat(tone, ic, label, value, sub) {
    return '<div class="k-stat ' + tone + '"><div class="k-stat-top"><span class="k-stat-ic">' + icon(ic) + '</span>' + esc(label) + '</div>' +
      '<div class="k-stat-value">' + value + '</div><div class="k-stat-sub">' + sub + '</div></div>';
  }
  const pick = (o) => (o && o[S.span]) || { leads: 0, messaged: 0, replied: 0, booked: 0, hot: 0 };
  function rows(map, order, label) {
    const keys = order.filter((k) => map[k]).concat(Object.keys(map).filter((k) => !order.includes(k)));
    const list = keys.map((k) => [k, pick(map[k])]).filter(([, x]) => x.leads);
    if (!list.length) return '<p class="k-muted lf-none">Niciun lead încă.</p>';
    return '<div class="lf-rows">' + list.map(([k, x]) =>
      '<div class="lf-row"><span class="lf-row-l">' + esc(label(k)) + '</span>' +
      '<span class="lf-n"><b>' + esc(K.num(x.leads)) + '</b>leaduri</span>' +
      '<span class="lf-n"><b>' + esc(K.num(x.messaged)) + '</b>mesaj</span>' +
      '<span class="lf-n"><b>' + esc(K.num(x.replied)) + '</b>au scris<em>' + esc(pct(x.replied, x.messaged)) + '</em></span>' +
      '<span class="lf-n' + (x.booked ? ' is-good' : '') + '"><b>' + esc(K.num(x.booked)) + '</b>programate<em>' + esc(pct(x.booked, x.leads)) + '</em></span></div>').join('') + '</div>';
  }
  function paint() {
    if (!panel || !S.d) return;
    const d = S.d, t = pick({ today: d.today, week: d.week });
    const zl = Object.fromEntries((d.zones || []).map((z) => [z.key, z.label]));
    const tiers = (d.tiers || []).map(String);
    const ready = d.ready || {};
    const warn = !ready.packages ? '<p class="lf-warn">' + icon('info') + 'Pachetele nu sunt încărcate încă: formularele și mesajele pornesc după ce aprobăm oferta.</p>' : '';
    panel.querySelector('[data-lfbody]').innerHTML = warn +
      '<div class="k-grid c4 lf-top">' +
      stat('is-accent', 'users', 'Leaduri', esc(K.num(t.leads)), S.span === 'today' ? 'azi' : 'în ultimele 7 zile') +
      stat('is-warn', 'zap', 'Pachete mari', esc(K.num(t.hot)), '4.990 și 14.900: SUNĂ ACUM') +
      stat('is-info', 'chat', 'Au scris înapoi', esc(K.num(t.replied)), 'din ' + esc(K.num(t.messaged)) + ' cu mesajul trimis') +
      stat('is-good', 'calendar', 'Programate', esc(K.num(t.booked)), pct(t.booked, t.leads) ? pct(t.booked, t.leads) + ' din leaduri' : 'niciuna încă') + '</div>' +
      '<section class="k-card lf-card"><div class="k-card-head"><h3>' + icon('wallet') + 'Pe pachet</h3></div>' + rows(d.byTier || {}, tiers, (k) => (/^\d+$/.test(k) ? lei(k) + ' lei' : 'necunoscut')) + '</section>' +
      '<section class="k-card lf-card"><div class="k-card-head"><h3>' + icon('target') + 'Pe zonă</h3></div>' + rows(d.byZone || {}, Object.keys(zl), (k) => zl[k] || (k === '?' ? 'necunoscută' : k)) + '</section>' +
      '<section class="k-card lf-card"><div class="k-card-head"><h3>' + icon('pin') + 'Pe clinică</h3></div>' + rows(d.byCity || {}, ['Timișoara', 'Arad'], (k) => k) + '</section>';
  }
  K.section('leadfilter', { mount, show() { load(); } });
})();
