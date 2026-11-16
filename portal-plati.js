// Centrul360 portal, the owner's Plăți și cheltuieli (Echipa → Costuri și plăți, api/portal-plati.js):
//   Plăți        the month's payments by day, a big „Plătit” tick on each (who / when, a note, taken back with a tap)
//   Cheltuieli   the variable expenses kept as records (several a month, summed), and what is read by itself
//   Costuri      Costuri lunare (portal-money.js), the month's lines and the profit
// The days and the sums come from the server, only for the owner: nothing of it is in this file.
(function () {
  'use strict';
  const K = window.K;
  if (!K) return;
  const { esc, icon } = K;
  const PL = { sub: 'plati', month: K.thisMonth(), data: null, box: null, seq: 0 };
  try { const s = localStorage.getItem('c360-pl-sub'); if (['plati', 'chelt', 'costuri'].includes(s)) PL.sub = s; } catch (e) { /* private mode */ }
  const costsMount = K.mountCosts; // portal-money.js: Costuri lunare
  const roDay = (iso) => { const t = Date.parse(iso); return Number.isFinite(t) ? K.dateShort(new Date(t).toLocaleDateString('sv-SE', { timeZone: 'Europe/Bucharest' })) : ''; };
  const roTime = (iso) => { const t = Date.parse(iso); return Number.isFinite(t) ? new Date(t).toLocaleTimeString('ro-RO', { timeZone: 'Europe/Bucharest', hour: '2-digit', minute: '2-digit' }) : ''; };
  const readAt = (iso) => { if (!iso) return ''; const d = new Date(Date.parse(iso)).toLocaleDateString('sv-SE', { timeZone: 'Europe/Bucharest' }); return d === K.today() ? 'azi la ' + roTime(iso) : roDay(iso) + ', ' + roTime(iso); };

  K.mountCosts = (box) => {
    PL.box = box;
    box.innerHTML = '<div class="pf-subnav">' + K.seg('plsub', [['plati', 'Plăți', 'checkCircle'], ['chelt', 'Cheltuieli', 'receipt'], ['costuri', 'Costuri lunare', 'sliders']], PL.sub) + '</div><div data-pf-pane></div>';
    showSub();
  };
  function showSub() {
    const pane = PL.box && PL.box.querySelector('[data-pf-pane]');
    if (!pane) return;
    try { localStorage.setItem('c360-pl-sub', PL.sub); } catch (e) { /* private mode */ }
    pane.classList.toggle('pf-narrow', PL.sub !== 'costuri'); // the payments and the records read best not too wide
    if (PL.sub === 'costuri') {
      // Costuri lunare goes up to this month; it keeps the month the owner looks at here
      const m = PL.month > K.thisMonth() ? K.thisMonth() : PL.month;
      if (K.setCostsMonth) K.setCostsMonth(m);
      pane.innerHTML = '<div data-pf-costs></div>';
      if (costsMount) costsMount(pane.firstChild);
      return;
    }
    pane.innerHTML = '<div class="k-skel" style="height:420px"></div>';
    load();
  }
  async function load() {
    const n = ++PL.seq, month = PL.month;
    try {
      const d = await K.api('/api/portal-plati?month=' + encodeURIComponent(month));
      if (n !== PL.seq) return;
      PL.data = d; PL.month = d.month;
      paint();
    } catch (err) {
      const pane = PL.box && PL.box.querySelector('[data-pf-pane]');
      if (pane && n === PL.seq) pane.innerHTML = K.empty('alert', 'Nu am putut încărca plățile', K.errText(err));
    }
  }
  function paint() {
    const pane = PL.box && PL.box.querySelector('[data-pf-pane]');
    if (!pane || !PL.data) return;
    pane.innerHTML = monthNav() + (PL.sub === 'chelt' ? cheltHtml() : platiHtml());
  }
  function monthNav() {
    const d = PL.data;
    return '<div class="pf-top"><div class="k-month"><button type="button" class="k-icon-btn" data-pf-m="-1" aria-label="Luna anterioară"' + (d.month <= d.first ? ' disabled' : '') + '>' + icon('left') + '</button><b>' + esc(K.monthLabel(d.month)) + '</b>' +
      '<button type="button" class="k-icon-btn" data-pf-m="1" aria-label="Luna următoare"' + (d.month >= d.last ? ' disabled' : '') + '>' + icon('right') + '</button></div>' +
      '<span class="pf-private">' + icon('shield') + 'Doar tu vezi</span></div>';
  }

  // ------------------------------------------------------------------ Plăți
  const MON_S = K.MON_S;
  const dayBadge = (r) => {
    if (!r.due) return '<span class="pf-day is-none" aria-hidden="true">' + icon('calendar') + '</span>';
    const d = +r.due.slice(8, 10), m = MON_S[+r.due.slice(5, 7) - 1];
    return '<span class="pf-day"><b>' + d + '</b><small>' + m + '</small></span>';
  };
  function stateText(r) {
    if (r.paid) return 'Plătit ' + roDay(r.paid.at) + (r.paid.byName ? ' · ' + esc(r.paid.byName) : '');
    if (r.state === 'late') return r.due ? (r.left === -1 ? 'Întârziată, era ieri' : 'Întârziată ' + K.plural(-r.left, 'zi', 'zile')) : 'Neplătită';
    if (r.state === 'today') return 'Azi';
    if (r.state === 'soon') return r.left === 1 ? 'Mâine' : 'În ' + r.left + ' zile';
    if (r.state === 'nodate') return 'Fără dată';
    return 'Pe ' + K.dateShort(r.due);
  }
  function detail(r) {
    if (r.group === 'sal') {
      const ex = (r.extras || []).map((x) => K.lei(x.lei) + ' ' + x.label).join(' + ');
      return esc(r.sub) + (ex ? ' · ' + K.lei(r.base) + ' + ' + esc(ex) : '');
    }
    if (r.eur != null && r.lei != null) return K.num(r.eur) + ' € la cursul de azi';
    if (r.from) return 'suma din ' + esc(K.MON[+r.from.slice(5, 7) - 1]);
    if (r.key === 'taxes') return r.entries ? K.plural(r.entries, 'sumă', 'sume') + ' în Cheltuieli' : 'TVA, contribuții, impozite';
    return '';
  }
  function rowHtml(r) {
    const amount = r.lei != null ? '<span class="pf-amt">' + K.lei(r.paid && r.paid.lei != null ? r.paid.lei : r.lei) + '</span>'
      : r.key === 'taxes' ? '<button type="button" class="pf-amt is-btn" data-pf-tax>' + icon('plus') + 'Sumă</button>'
      : '<button type="button" class="pf-amt is-btn" data-pf-go="costuri">de completat</button>';
    const dt = detail(r);
    return '<li class="pf-row is-' + r.state + '" data-key="' + esc(r.key) + '">' + dayBadge(r) +
      '<div class="pf-main"><div class="pf-line"><b class="pf-name">' + (r.group === 'sal' ? '<span class="pf-kind">Salariu</span>' : '') + esc(r.label) + '</b>' + amount + '</div>' +
      '<div class="pf-sub"><span class="pf-st">' + stateText(r) + '</span>' + (dt ? '<span class="pf-dt">' + dt + '</span>' : '') +
      (r.paid ? '<button type="button" class="pf-note" data-pf-note>' + (r.paid.note ? '„' + esc(r.paid.note) + '”' : icon('pen') + 'notă') + '</button>' : '') + '</div></div>' +
      '<button type="button" class="pf-tick' + (r.paid ? ' is-on' : '') + '" data-pf-tick aria-pressed="' + (r.paid ? 'true' : 'false') + '" aria-label="' + (r.paid ? 'Plătit. Atinge ca să anulezi' : 'Marchează plătit') + '">' + icon('check') + '<span>' + (r.paid ? 'Plătit' : 'Bifează') + '</span></button></li>';
  }
  function platiHtml() {
    const d = PL.data, s = d.summary;
    const pct = s.count ? Math.round((s.paidCount / s.count) * 100) : 0;
    const tile = (cls, label, value, sub) => '<div class="pf-tile ' + cls + '"><span>' + label + '</span><b>' + value + '</b>' + (sub ? '<small>' + sub + '</small>' : '') + '</div>';
    const late = d.rows.filter((r) => r.state === 'late'), open = d.rows.filter((r) => !r.paid && r.state !== 'late'), paid = d.rows.filter((r) => r.paid);
    const list = (title, rows) => rows.length ? '<section class="pf-group"><h4>' + title + '<span>' + rows.length + '</span></h4><ul class="pf-list">' + rows.map(rowHtml).join('') + '</ul></section>' : '';
    return '<div class="pf-sum">' +
        tile('is-good', 'Plătit', K.lei(s.paid), s.paidCount + ' din ' + s.count) +
        tile('', 'De plătit', K.lei(s.toPay), s.missing ? K.plural(s.missing, 'fără sumă', 'fără sumă') : (s.soon ? s.soon + ' în curând' : '')) +
        tile(s.late ? 'is-bad' : 'is-calm', 'Întârziate', s.late ? K.lei(s.lateLei) : '0', s.late ? K.plural(s.late, 'plată', 'plăți') : 'nimic') +
        '<i class="pf-bar"><i style="width:' + pct + '%"></i></i></div>' +
      (d.rows.length ? list('Întârziate', late) + list(d.current || d.month > d.today.slice(0, 7) ? 'De plătit' : 'Neplătite', open) + list('Plătite', paid)
        : K.empty('wallet', 'Nicio plată luna asta', 'Completează Costuri lunare și salariile în Echipa.')) +
      '<p class="pf-foot">Salariile sunt cele pe ' + esc(K.MON[+d.salariesFor.slice(5, 7) - 1]) + ', plătite în ' + esc(K.MON[+d.month.slice(5, 7) - 1]) + ', în ziua din fișa fiecăruia (Echipa → Oameni → Ziua salariului). Sumele fixe vin din Costuri lunare.</p>';
  }

  // ------------------------------------------------------------------ Cheltuieli variabile
  const kindLabel = (line, k) => { const x = (line.kinds || []).find(([v]) => v === k); return x ? x[1] : ''; };
  function cheltHtml() {
    const d = PL.data;
    const autoRow = (a) => {
      const src = a.error && a.lei == null ? '<span class="is-err">' + (/nu poate fi citit/.test(a.error) ? esc(a.src) + ' nu poate fi citit acum' : esc(a.src) + ' nu răspunde: ' + esc(a.error)) + '. Scrie suma în Costuri lunare.</span>'
        : a.over != null ? 'scrisă de tine în Costuri lunare' : a.none ? 'WhatsApp nu e conectat' : a.key === 'payroll' ? 'din Salariu, se actualizează singur'
        : 'din ' + esc(a.src) + (a.at ? ', actualizat ' + esc(readAt(a.at)) : '') + (a.saved ? ' (ultima citire)' : '');
      return '<li class="pf-auto"><div class="pf-main"><b class="pf-name">' + esc(a.label) + '</b><small>' + src + '</small></div><span class="pf-amt">' + (a.lei != null ? K.lei(a.lei) : '-') + '</span></li>';
    };
    const recCard = (line) => '<section class="k-card pf-rec" data-line="' + esc(line.key) + '"><div class="pf-rec-head"><div class="pf-main"><b class="pf-name">' + esc(line.label) + '</b>' + (line.hint ? '<small>' + esc(line.hint) + '</small>' : '') + '</div>' +
        '<span class="pf-amt">' + K.lei(line.total, 2) + '</span></div>' +
        (line.entries.length ? '<ul class="pf-ents">' + line.entries.map((e) => '<li><span class="pf-ent-d">' + (e.date ? esc(K.dateShort(e.date)) : '-') + '</span><span class="pf-ent-n">' +
          (e.kind && line.kinds ? '<em>' + esc(kindLabel(line, e.kind)) + '</em>' : '') + esc(e.note || (e.kind ? '' : '-')) + '</span><b>' + K.lei(e.lei, 2) + '</b>' +
          '<button type="button" class="k-icon-btn pf-del" data-pf-del="' + esc(e.id) + '" aria-label="Șterge">' + icon('trash') + '</button></li>').join('') + '</ul>' : '') +
        '<button type="button" class="pf-add" data-pf-add>' + icon('plus') + 'Adaugă</button></section>';
    const total = d.rec.reduce((a, l) => a + l.total, 0) + d.autos.reduce((a, x) => a + (Number(x.lei) || 0), 0);
    const tax = d.rec.find((l) => l.key === 'taxes');
    const taxSal = tax ? tax.entries.filter((e) => e.kind === 'salarii').reduce((a, e) => a + Number(e.lei), 0) : 0;
    return '<div class="pf-sum is-one"><div class="pf-tile"><span>Cheltuieli variabile · ' + esc(K.monthLabel(d.month)) + '</span><b>' + K.lei(total) + '</b>' + (taxSal ? '<small>' + K.lei(total - taxSal) + ' în costurile lunii</small>' : '') + '</div></div>' +
      (d.autos.length ? '<section class="k-card pf-rec"><div class="pf-rec-head"><div class="pf-main"><b class="pf-name">' + icon('zap') + 'Se completează singure</b></div></div><ul class="pf-autos">' + d.autos.map(autoRow).join('') + '</ul></section>' : '') +
      '<div class="pf-recs">' + d.rec.map(recCard).join('') + '</div>' +
      (taxSal ? '<p class="pf-foot">Taxele din salarii (' + K.lei(taxSal) + ') nu se mai scad din profit: sunt deja în Salarii brute.</p>' : '<p class="pf-foot">Tot ce scrii aici intră în costurile lunii, deci în profit și în bonus. La taxe, „Din salarii” nu se mai scade o dată: e deja în Salarii brute.</p>');
  }
  function openAdd(lineKey) {
    const line = PL.data.rec.find((l) => l.key === lineKey);
    if (!line) return;
    const d = PL.data, t = K.today();
    const date = t.slice(0, 7) === d.month ? t : d.month + '-01';
    const dr = K.drawer({
      title: line.label, icon: 'receipt', width: 460, subtitle: esc(K.monthLabel(d.month)),
      body: '<form class="k-form pf-form" data-pf-form>' +
        K.field('Suma', '<div class="k-money"><input name="lei" type="number" inputmode="decimal" min="0" step="0.01" placeholder="0" required></div>', 'full') +
        (line.kinds ? K.field('Ce fel', K.seg('kind', line.kinds, line.kinds[0][0], 'is-big'), 'full', '„Din salarii” (contribuții și impozit) e deja în Salarii brute, nu se scade încă o dată din profit.') : '') +
        K.field('Data', '<input name="date" type="date" value="' + esc(date) + '" min="' + esc(d.month + '-01') + '" max="' + esc(d.month + '-' + K.pad(K.daysIn(d.month))) + '">', 'full') +
        K.field('Notă', '<input name="note" maxlength="200" placeholder="ex. factura de curent">', 'full') + '</form>',
      footer: '<span class="k-grow"></span><button type="button" class="k-btn" data-cancel>Renunță</button><button type="button" class="k-btn is-primary" data-ok>' + icon('check') + 'Adaugă</button>',
      onMount(el) {
        const f = el.querySelector('[data-pf-form]');
        setTimeout(() => { try { f.lei.focus(); } catch (e) { /* */ } }, 80);
        el.querySelector('[data-cancel]').addEventListener('click', () => dr.close());
        f.addEventListener('submit', (e) => { e.preventDefault(); el.querySelector('[data-ok]').click(); });
        el.querySelector('[data-ok]').addEventListener('click', (e) => K.busy(e.currentTarget, async () => {
          const v = K.formValues(f);
          const lei = Number(String(v.lei || '').replace(',', '.'));
          if (!(lei > 0)) { K.ui().toast('Scrie suma.', 'error'); f.lei.focus(); return; }
          try {
            await K.api('/api/portal-plati', { action: 'rec_add', month: d.month, line: line.key, lei, date: v.date, note: v.note, kind: v.kind });
            dr.close(); K.ui().toast('Adăugat.', 'success'); load();
          } catch (err) { K.ui().toast(K.errText(err), 'error'); }
        }));
      },
    });
  }

  // ------------------------------------------------------------------ taps
  document.addEventListener('change', (e) => {
    if (!PL.box || !PL.box.contains(e.target) || e.target.name !== 'plsub') return;
    if (PL.sub === 'costuri' && K.costsMonth) PL.month = K.costsMonth();
    PL.sub = e.target.value; showSub();
  });
  document.addEventListener('click', async (e) => {
    if (!PL.box || !PL.box.contains(e.target) || !PL.data) return;
    const mv = e.target.closest('[data-pf-m]');
    if (mv) { PL.month = K.addMonths(PL.month, +mv.dataset.pfM); load(); return; }
    const go = e.target.closest('[data-pf-go]');
    if (go) { const b = PL.box.querySelector('[data-k-seg="plsub"] button[data-v="' + go.dataset.pfGo + '"]'); if (b) b.click(); return; }
    if (e.target.closest('[data-pf-tax]')) return openAdd('taxes');
    const add = e.target.closest('[data-pf-add]');
    if (add) return openAdd(add.closest('[data-line]').dataset.line);
    const del = e.target.closest('[data-pf-del]');
    if (del) {
      const line = del.closest('[data-line]').dataset.line, id = del.dataset.pfDel;
      if (!(await K.ui().confirm({ title: 'Ștergi suma?', message: id === 'legacy' ? 'E suma scrisă înainte în Costuri lunare; se scoate de acolo.' : 'Se scade din costurile lunii.', confirmText: 'Șterge', danger: true }))) return;
      return K.busy(del, async () => { try { await K.api('/api/portal-plati', { action: 'rec_del', month: PL.month, line, id }); load(); } catch (err) { K.ui().toast(K.errText(err), 'error'); } });
    }
    const row = e.target.closest('.pf-row');
    if (!row) return;
    const key = row.dataset.key, r = PL.data.rows.find((x) => x.key === key);
    if (!r) return;
    if (e.target.closest('[data-pf-note]')) {
      const note = await K.ui().prompt({ title: 'Notă la ' + r.label, label: 'Notă (opțional)', value: (r.paid && r.paid.note) || '', confirmText: 'Salvează' });
      if (note == null) return;
      try { await K.api('/api/portal-plati', { action: 'note', month: PL.month, key, note }); load(); } catch (err) { K.ui().toast(K.errText(err), 'error'); }
      return;
    }
    const tick = e.target.closest('[data-pf-tick]');
    if (!tick) return;
    if (r.paid && !(await K.ui().confirm({ title: 'Scoți bifa?', message: r.label + ' rămâne de plătit.', confirmText: 'Scoate bifa' }))) return;
    // at once on the screen, then saved (a failed save puts it back)
    const was = r.paid;
    r.paid = was ? null : { at: new Date().toISOString(), byName: '', lei: r.lei };
    row.outerHTML = rowHtml(Object.assign(r, { state: r.paid ? 'paid' : r.state === 'paid' ? 'later' : r.state }));
    try {
      await K.api('/api/portal-plati', { action: was ? 'unpay' : 'pay', month: PL.month, key });
      if (!was && K.ui().toast) K.ui().toast(r.label + ': plătit.', 'success');
    } catch (err) { K.ui().toast(K.errText(err), 'error'); }
    load();
  });
})();
