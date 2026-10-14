// Centrul360 portal, "Activitate" (Admin): every change the team makes anywhere in the portal, in words,
// newest first: who, what, to whom, what changed, where. Filters: period, person, section, search; the
// people row counts each one's changes. Live: a change anywhere shows up here by itself.
// Data: /api/portal-activity (api/_lib/activity.js writes the lines).
(function () {
  'use strict';
  const K = window.K;
  const { esc, icon } = K;
  const A = { days: '1', who: '', area: '', q: '', lines: [], loaded: false };
  let panel, timer = 0;

  function mount(p) {
    panel = p;
    panel.classList.add('k-panel', 'ac');
    panel.innerHTML =
      '<div class="k-head"><div><div class="k-eyebrow">Admin</div><h2>Activitate</h2></div>' +
      '<div class="k-head-actions">' + K.seg('acdays', [['1', 'Azi'], ['7', '7 zile'], ['30', '30 zile']], A.days) + '</div></div>' +
      '<div class="ac-filters"><input type="search" data-acq placeholder="Caută (clientă, ce s-a schimbat…)" autocomplete="off">' +
        '<select data-acwho></select><select data-acarea></select></div>' +
      '<div class="ac-people" data-acpeople></div>' +
      '<div data-acfeed><div class="k-skel" style="height:320px"></div></div>';
    panel.addEventListener('change', (e) => {
      if (e.target.name === 'acdays') { A.days = e.target.value; load(); }
      if (e.target.matches('[data-acwho]')) { A.who = e.target.value; paint(); }
      if (e.target.matches('[data-acarea]')) { A.area = e.target.value; paint(); }
    });
    panel.addEventListener('input', (e) => { if (e.target.matches('[data-acq]')) { A.q = e.target.value; paint(); } });
    panel.addEventListener('click', (e) => {
      const p = e.target.closest('[data-acperson]');
      if (p) { A.who = A.who === p.dataset.acperson ? '' : p.dataset.acperson; panel.querySelector('[data-acwho]').value = A.who; return paint(); }
      const row = e.target.closest('[data-acgo]');
      if (row && row.dataset.acgo) K.go(row.dataset.acgo);
    });
  }

  async function load() {
    try {
      const j = await K.api('/api/portal-activity?days=' + encodeURIComponent(A.days));
      A.lines = j.lines || [];
      A.loaded = true;
      paint();
    } catch (err) {
      panel.querySelector('[data-acfeed]').innerHTML = K.empty('alert', 'Nu am putut încărca activitatea', K.errText(err));
    }
  }

  const norm = (s) => (K.norm ? K.norm(s) : String(s || '').toLowerCase());
  function filtered() {
    const q = norm(A.q);
    return A.lines.filter((l) => (!A.who || l.by === A.who) && (!A.area || l.area === A.area) &&
      (!q || norm([l.name, l.verb, l.subject, l.detail, l.area].join(' ')).includes(q)));
  }
  const hm = (iso) => { const d = new Date(iso); return K.pad(d.getHours()) + ':' + K.pad(d.getMinutes()); };
  const dayKey = (iso) => K.iso(new Date(iso));
  function dayLabel(day) {
    const t = K.today();
    return day === t ? 'Azi' : day === K.addDays(t, -1) ? 'Ieri' : K.dateLong(day);
  }

  function paint() {
    if (!panel || !A.loaded) return;
    // the selects: the people and the sections in the period
    const people = new Map(), areas = new Set();
    A.lines.forEach((l) => { if (!people.has(l.by)) people.set(l.by, l.name); areas.add(l.area); });
    const who = panel.querySelector('[data-acwho]'), area = panel.querySelector('[data-acarea]');
    who.innerHTML = K.options([['', 'Toată echipa']].concat([...people].map(([id, n]) => [id, n])), A.who);
    area.innerHTML = K.options([['', 'Toate secțiunile']].concat([...areas].sort().map((a) => [a, a])), A.area);
    const list = filtered();
    // how much each one did (in the period and the section / search chosen)
    const count = new Map();
    A.lines.filter((l) => (!A.area || l.area === A.area)).forEach((l) => count.set(l.by, (count.get(l.by) || 0) + 1));
    panel.querySelector('[data-acpeople]').innerHTML = [...count].sort((a, b) => b[1] - a[1]).map(([id, n]) =>
      '<button type="button" class="ac-person' + (A.who === id ? ' is-on' : '') + '" data-acperson="' + esc(id) + '">' + K.avatar(people.get(id), 30) +
      '<span><b>' + esc(people.get(id)) + '</b><small>' + n + (n === 1 ? ' modificare' : ' modificări') + '</small></span></button>').join('');
    const feed = panel.querySelector('[data-acfeed]');
    if (!list.length) {
      feed.innerHTML = K.empty('clock', A.lines.length ? 'Nimic pentru filtrul ăsta' : 'Nicio modificare în perioada asta', '');
      return;
    }
    let last = '', html = '';
    list.slice(0, 600).forEach((l) => {
      const d = dayKey(l.at);
      if (d !== last) { html += (last ? '</ol>' : '') + '<h4 class="ac-day">' + esc(dayLabel(d)) + '</h4><ol class="ac-feed">'; last = d; }
      html += '<li class="' + (l.go ? 'is-link' : '') + '" data-acgo="' + esc(l.go || '') + '">' + K.avatar(l.name, 32) +
        '<div class="ac-main"><span><b>' + esc(l.name) + '</b> ' + esc(l.verb) + (l.subject ? ' <b>' + esc(l.subject) + '</b>' : '') + '</span>' +
        (l.detail ? '<small>' + esc(l.detail) + '</small>' : '') + '</div>' +
        '<div class="ac-side"><span class="k-tag">' + esc(l.area) + '</span><time>' + hm(l.at) + '</time></div></li>';
    });
    feed.innerHTML = html + '</ol>' + (list.length > 600 ? '<p class="k-muted ac-more">Se văd primele 600. Alege o perioadă mai scurtă sau o persoană.</p>' : '');
  }

  // live: a change anywhere comes in by itself (the line is written a moment after the change)
  K.on('remote', () => {
    if (!panel || !K.isActive('activitate')) return;
    load();
    clearTimeout(timer); timer = setTimeout(load, 2500);
  });

  K.section('activitate', { mount, show() { load(); } });
})();
