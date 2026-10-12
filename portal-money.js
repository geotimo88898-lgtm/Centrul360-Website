// Centrul360 portal — money: "Încasări" (front desk + owner) and "Comisionul meu" (staff).
// Încasări: month view with live stats, daily bars (click a day to filter), payment-method donut,
// top treatments, per-cosmetician split (owner), a day-grouped list, CSV + print, and a one-screen
// "new payment" drawer that prices itself from the shared Offers and closes the loop with the
// Calendar (paying from an appointment marks it Finalizată). Comisionul meu: earnings, "Bonusurile
// mele" (every bonus this account can win this month) and the sale log with live commission estimate.
(function () {
  'use strict';
  const K = window.K;
  const { esc, icon } = K;
  const METHODS = { card: { label: 'Card', ic: 'card', color: 'var(--accent)' }, cash: { label: 'Cash', ic: 'cash', color: 'var(--good)' }, transfer: { label: 'Transfer', ic: 'bank', color: 'var(--info)' } };
  const SALE_STATUS = { pending: { label: 'În așteptare', tone: 'warn' }, approved: { label: 'Aprobată', tone: 'good' }, rejected: { label: 'Respinsă', tone: 'bad' } };
  const cat = (k) => (K.cats && K.cats[k]) || k || '';
  const sum = (list) => list.reduce((a, s) => a + Number(s.amount || 0), 0);

  // Offer → treatment category (portal categories are finer than the site's 3).
  function offerCategory(o) {
    const t = K.norm(o.title + ' ' + (o.description || ''));
    if (/epilare|laser/.test(t)) return 'epilare-laser';
    if (/liposonix/.test(t)) return 'liposonix';
    if (/hifu/.test(t)) return 'hifu';
    if (/\bems\b|electrostim|tonifiere/.test(t)) return 'ems-tonifiere';
    if (/rf sculpt|radiofrecv/.test(t)) return 'radiofrecventa';
    if (/celulit/.test(t)) return 'celulita';
    if (/detox|drenaj/.test(t)) return 'detox-drenaj';
    if (/facial|restart|glow|hidratare|ten/.test(t)) return 'tratament-facial';
    return 'altele';
  }
  function offerChips(selectedTitle) {
    const offers = (K.data && K.data.offers) || [];
    if (!offers.length) return '';
    return '<div class="mo-offers" data-offers>' + offers.map((o) =>
      '<button type="button" data-offer="' + esc(o.id) + '" class="' + (o.title === selectedTitle ? 'is-on' : '') + '"><b>' + esc(o.title) + '</b><span>' + K.lei(o.priceNew) +
      (o.priceOld > o.priceNew ? '<s>' + K.lei(o.priceOld) + '</s>' : '') + '</span></button>').join('') + '</div>';
  }
  const catChips = (sel) => '<div class="k-cat-grid" data-cats>' + Object.keys(K.cats).map((k) => '<button type="button" data-cat="' + k + '" class="' + (k === sel ? 'is-on' : '') + '">' + esc(K.cats[k]) + '</button>').join('') +
    '<input type="hidden" name="category" value="' + esc(sel || '') + '"></div>';
  function wireCats(el) {
    el.querySelector('[data-cats]').addEventListener('click', (e) => {
      const b = e.target.closest('[data-cat]');
      if (!b) return;
      el.querySelectorAll('[data-cat]').forEach((x) => x.classList.toggle('is-on', x === b));
      el.querySelector('input[name=category]').value = b.dataset.cat;
      el.querySelector('input[name=category]').dispatchEvent(new Event('change', { bubbles: true }));
    });
  }
  function setCat(el, k) { el.querySelectorAll('[data-cat]').forEach((x) => x.classList.toggle('is-on', x.dataset.cat === k)); el.querySelector('input[name=category]').value = k; }

  // =====================================================================================
  // ÎNCASĂRI
  // =====================================================================================
  const S = { month: K.thisMonth(), day: '', method: '', q: '' };
  let panel;

  function mountIncasari(p) {
    panel = p;
    panel.classList.add('k-panel', 'mo');
    panel.innerHTML =
      '<div class="k-head"><div><div class="k-eyebrow">Clinică</div><h2>Încasări</h2><p class="k-lede">Fiecare plată, în timp real. Click pe o zi din grafic ca s-o vezi separat.</p></div>' +
      '<div class="k-head-actions"><button type="button" class="k-btn is-outline" data-act="csv">' + icon('download') + 'Export</button>' +
      '<button type="button" class="k-btn is-outline" data-act="print">' + icon('printer') + 'Printează</button>' +
      '<button type="button" class="k-btn is-accent" data-act="new">' + icon('plus') + 'Încasare<kbd>N</kbd></button></div></div>' +
      '<div class="mo-monthbar"><div class="k-month"><button type="button" class="k-icon-btn" data-m="-1" aria-label="Luna anterioară">' + icon('left') + '</button><b data-month></b>' +
      '<button type="button" class="k-icon-btn" data-m="1" aria-label="Luna următoare">' + icon('right') + '</button></div><span class="k-live">live</span></div>' +
      '<div data-body></div>';
    panel.addEventListener('click', onClick);
    panel.addEventListener('input', (e) => { if (e.target.matches('[data-q]')) { S.q = e.target.value; renderList(); } });
    document.addEventListener('keydown', (e) => {
      if (!K.isActive('incasari') || K.drawerOpen || K.typing(document.activeElement) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (document.querySelector('.c360-dialog-root, .c360-palette-root')) return;
      if (e.key.toLowerCase() === 'n') { e.preventDefault(); openNew({}); }
      if (e.key === '/') { e.preventDefault(); const q = panel.querySelector('[data-q]'); if (q) q.focus(); }
    });
  }
  function onClick(e) {
    const a = e.target.closest('[data-act]');
    if (a) {
      if (a.dataset.act === 'new') return openNew({});
      if (a.dataset.act === 'csv') return exportCsv();
      if (a.dataset.act === 'print') return printMonth();
      if (a.dataset.act === 'clear-day') { S.day = ''; return render(); }
    }
    const m = e.target.closest('[data-m]');
    if (m) { S.month = K.addMonths(S.month, +m.dataset.m); S.day = ''; return render(); }
    const meth = e.target.closest('[data-method]');
    if (meth) { S.method = S.method === meth.dataset.method ? '' : meth.dataset.method; return renderList(); }
    const row = e.target.closest('[data-pay]');
    if (row) openPayment(row.dataset.pay);
  }

  const monthRows = () => ((K.data && K.data.incasari) || []).filter((s) => K.monthOf(s.date) === S.month);
  function render() {
    if (!panel || !K.data) return;
    panel.querySelector('[data-month]').textContent = K.monthLabel(S.month);
    const rows = monthRows();
    const all = K.data.incasari || [];
    const today = K.today();
    const isCur = S.month === K.thisMonth();
    const dom = isCur ? Number(today.slice(8, 10)) : K.daysIn(S.month);
    const prevM = K.addMonths(S.month, -1);
    const prevRows = all.filter((s) => K.monthOf(s.date) === prevM && Number(s.date.slice(8, 10)) <= dom);
    const total = sum(rows), prevTotal = sum(prevRows);
    const monday = K.mondayOf(today);
    const todayRows = all.filter((s) => s.date === today);
    const weekRows = all.filter((s) => s.date >= monday && s.date <= today);
    const avg = rows.length ? total / rows.length : 0;
    const days = K.daysIn(S.month);
    const daily = Array.from({ length: days }, (_, i) => sum(rows.filter((s) => Number(s.date.slice(8, 10)) === i + 1)));
    const byMethod = Object.keys(METHODS).map((k) => ({ k, v: sum(rows.filter((s) => s.method === k)) }));
    const byCat = {};
    rows.forEach((s) => { byCat[s.category] = (byCat[s.category] || 0) + Number(s.amount || 0); });
    const topCats = Object.keys(byCat).sort((a, b) => byCat[b] - byCat[a]).slice(0, 5);
    const byPerson = {};
    rows.forEach((s) => { const n = s.performedByName && s.performedByName !== '—' ? s.performedByName : 'Neatribuit'; byPerson[n] = (byPerson[n] || 0) + Number(s.amount || 0); });
    const people = Object.keys(byPerson).sort((a, b) => byPerson[b] - byPerson[a]);
    const pct = (a, b) => { if (!b) return a ? '<span class="k-delta is-up">' + icon('arrowUp') + 'nou</span>' : ''; const p = Math.round(((a - b) / b) * 100); return '<span class="k-delta ' + (p > 0 ? 'is-up' : p < 0 ? 'is-down' : 'is-flat') + '">' + icon(p >= 0 ? 'arrowUp' : 'arrowDown') + Math.abs(p) + '%</span>'; };

    panel.querySelector('[data-body]').innerHTML =
      '<div class="k-grid c4 k-stagger">' +
        '<div class="k-stat is-accent"><div class="k-stat-top"><span class="k-stat-ic">' + icon('wallet') + '</span>Azi</div><div class="k-stat-value" data-count="' + sum(todayRows) + '" data-fmt="lei" data-key="mo-today">0</div><div class="k-stat-sub">' + K.plural(todayRows.length, 'încasare', 'încasări') + '</div></div>' +
        '<div class="k-stat is-info"><div class="k-stat-top"><span class="k-stat-ic">' + icon('calendar') + '</span>Săptămâna aceasta</div><div class="k-stat-value" data-count="' + sum(weekRows) + '" data-fmt="lei" data-key="mo-week">0</div><div class="k-stat-sub">' + K.plural(weekRows.length, 'încasare', 'încasări') + ' · de luni</div></div>' +
        '<div class="k-stat is-good"><div class="k-stat-top"><span class="k-stat-ic">' + icon('trend') + '</span>' + esc(K.monthLabel(S.month)) + '</div><div class="k-stat-value" data-count="' + total + '" data-fmt="lei" data-key="mo-month-' + S.month + '">0</div><div class="k-stat-sub">' + pct(total, prevTotal) + 'vs ' + K.MON_S[Number(prevM.slice(5)) - 1] + '. (aceleași zile)</div>' + K.spark(daily.slice(0, dom), { color: 'var(--good)' }) + '</div>' +
        '<div class="k-stat"><div class="k-stat-top"><span class="k-stat-ic">' + icon('receipt') + '</span>Bon mediu</div><div class="k-stat-value" data-count="' + Math.round(avg) + '" data-fmt="lei" data-key="mo-avg">0</div><div class="k-stat-sub">' + K.plural(rows.length, 'încasare', 'încasări') + ' luna aceasta</div></div>' +
      '</div>' +
      '<div class="mo-row">' +
        '<section class="k-card"><div class="k-card-head"><h3>' + icon('trend') + 'Pe zile</h3><span class="k-sub">click pe o zi ca s-o filtrezi</span></div><div data-chart></div></section>' +
        '<section class="k-card mo-split"><div class="k-card-head"><h3>' + icon('card') + 'Metode de plată</h3></div>' +
          '<div class="mo-donut">' + K.donut(byMethod.map((x) => ({ value: x.v, color: METHODS[x.k].color, label: METHODS[x.k].label })), { size: 150, stroke: 16, inner: '<b>' + K.lei(total) + '</b><span>total</span>' }) +
          '<div class="mo-legend">' + byMethod.map((x) => '<button type="button" data-method="' + x.k + '" class="' + (S.method === x.k ? 'is-on' : '') + '"><i style="background:' + METHODS[x.k].color + '"></i>' + METHODS[x.k].label + '<b>' + K.lei(x.v) + '</b><small>' + (total ? Math.round((x.v / total) * 100) : 0) + '%</small></button>').join('') + '</div></div>' +
          '<div class="k-divider"></div><div class="k-card-head" style="margin-bottom:.6rem"><h3>' + icon('sparkles') + 'Top tratamente</h3></div>' +
          (topCats.length ? topCats.map((k) => '<div class="mo-bar"><span>' + esc(cat(k)) + '</span><b>' + K.lei(byCat[k]) + '</b><div class="k-bar"><i style="--w:' + (byCat[k] / byCat[topCats[0]]) * 100 + '%"></i></div></div>').join('') : '<p class="k-muted">Nicio încasare luna aceasta.</p>') +
        '</section>' +
      '</div>' +
      (K.data.isAdmin && people.length ? '<section class="k-card mo-people"><div class="k-card-head"><h3>' + icon('users') + 'Pe cine a efectuat tratamentul</h3></div><div class="mo-people-grid">' +
        people.map((n) => '<div class="mo-person">' + K.avatar(n, 34) + '<div><b>' + esc(n) + '</b><span>' + K.lei(byPerson[n]) + ' · ' + Math.round((byPerson[n] / (total || 1)) * 100) + '%</span><div class="k-bar"><i style="--w:' + (byPerson[n] / byPerson[people[0]]) * 100 + '%"></i></div></div></div>').join('') + '</div></section>' : '') +
      '<section class="k-card"><div class="k-toolbar"><label class="k-search">' + icon('search') + '<input data-q placeholder="Caută client sau tratament…" value="' + esc(S.q) + '"></label>' +
        '<div class="k-chips">' + Object.keys(METHODS).map((k) => '<button type="button" class="k-chip' + (S.method === k ? ' is-on' : '') + '" data-method="' + k + '">' + icon(METHODS[k].ic) + METHODS[k].label + '</button>').join('') + '</div>' +
        (S.day ? '<button type="button" class="k-chip is-on" data-act="clear-day">' + esc(K.dateLong(S.day)) + icon('x') + '</button>' : '') + '</div>' +
        '<div data-list></div></section>';

    K.chart(panel.querySelector('[data-chart]'), {
      labels: daily.map((_, i) => String(i + 1)), height: 220, format: K.lei, highlight: S.day ? Number(S.day.slice(8, 10)) - 1 : (isCur ? dom - 1 : -1),
      axis: (v) => (v >= 1000 ? (Math.round(v / 100) / 10).toLocaleString('ro-RO') + 'k' : Math.round(v)),
      series: [{ name: 'Încasări', values: daily, color: 'var(--accent)', kind: 'bar' }],
      tip: (i) => { const d = S.month + '-' + K.pad(i + 1); const r = rows.filter((s) => s.date === d); return '<b>' + esc(K.dateLong(d)) + '</b><span>' + K.lei(daily[i]) + ' · ' + K.plural(r.length, 'încasare', 'încasări') + '</span>'; },
      onClick: (i) => { const d = S.month + '-' + K.pad(i + 1); S.day = S.day === d ? '' : d; render(); },
    });
    K.countAll(panel);
    renderList();
  }

  function filtered() {
    const q = K.norm(S.q);
    return monthRows().filter((s) => (!S.day || s.date === S.day) && (!S.method || s.method === S.method) &&
      (!q || K.norm(s.client + ' ' + s.treatment + ' ' + cat(s.category) + ' ' + (s.performedByName || '')).includes(q)));
  }
  function renderList() {
    const el = panel && panel.querySelector('[data-list]');
    if (!el) return;
    panel.querySelectorAll('.k-chip[data-method], .mo-legend [data-method]').forEach((b) => b.classList.toggle('is-on', b.dataset.method === S.method));
    const rows = filtered().slice().sort((a, b) => (a.date !== b.date ? (a.date < b.date ? 1 : -1) : (a.createdAt < b.createdAt ? 1 : -1)));
    if (!rows.length) {
      el.innerHTML = K.empty('receipt', S.q || S.day || S.method ? 'Nimic pentru filtrul ales' : 'Nicio încasare în ' + K.monthLabel(S.month).toLowerCase(),
        S.q || S.day || S.method ? 'Schimbă filtrul sau caută altceva.' : 'Prima plată a lunii apare aici imediat ce o salvezi.',
        '<button type="button" class="k-btn is-primary" data-act="new">' + icon('plus') + 'Încasare nouă</button>');
      return;
    }
    const days = [];
    rows.forEach((s) => { const d = days[days.length - 1]; if (d && d.date === s.date) d.rows.push(s); else days.push({ date: s.date, rows: [s] }); });
    el.innerHTML = '<div class="mo-total">' + K.plural(rows.length, 'încasare', 'încasări') + ' · <b>' + K.lei(sum(rows)) + '</b></div>' +
      days.map((d) => '<div class="k-day"><span>' + esc(K.relDay(d.date) === K.dateLong(d.date) ? K.dateLong(d.date) : K.relDay(d.date) + ' · ' + K.dateShort(d.date)) + '</span><b>' + K.lei(sum(d.rows)) + '</b></div>' +
        '<div class="k-list">' + d.rows.map((s) => {
          const m = METHODS[s.method] || METHODS.card;
          return '<div class="k-row is-click" data-pay="' + esc(s.id) + '"><span class="k-icon-chip" style="color:' + m.color + '">' + icon(m.ic) + '</span>' +
            '<div class="k-row-main"><div class="k-row-title">' + esc(s.client || '—') + '</div><div class="k-row-sub">' + esc(s.treatment) + ' · ' + esc(cat(s.category)) +
            (s.performedByName && s.performedByName !== '—' ? ' · ' + esc(s.performedByName) : '') + '</div></div>' +
            '<div class="k-row-end"><span class="k-tag">' + m.label + '</span><span class="k-amount">' + K.lei(s.amount, 2) + '</span></div></div>';
        }).join('') + '</div>').join('');
  }

  // ---------------- new payment
  function openNew(pre) {
    pre = pre || {};
    const emp = K.data.activeEmployees || [];
    let picker;
    const d = K.drawer({
      title: 'Încasare nouă', icon: 'wallet', width: 560,
      subtitle: pre.appt ? 'Din programarea de ' + esc(K.relDay(pre.appt.date).toLowerCase()) + ' ' + esc(pre.appt.time || '') + ' — se marchează Finalizată' : 'Apare imediat în Încasări, pentru toată echipa',
      body: '<form class="k-form" data-form>' +
        K.field('Client', '<input name="clientName" required maxlength="150" placeholder="Caută sau scrie un nume nou" value="' + esc(pre.clientName || '') + '">') +
        K.field('Telefon', '<input name="clientPhone" type="tel" required maxlength="30" placeholder="07xx xxx xxx" value="' + esc(pre.clientPhone || '') + '">') +
        ((K.data.offers || []).length ? K.field('Ofertă (completează prețul)', offerChips(pre.treatment), 'full') : '') +
        K.field('Sumă', '<div class="k-money"><input name="amount" type="number" inputmode="decimal" min="0" step="0.01" required placeholder="0" value="' + esc(pre.amount || '') + '"></div>', 'full') +
        K.field('Metodă de plată', K.seg('method', Object.keys(METHODS).map((k) => [k, METHODS[k].label, METHODS[k].ic]), pre.method || 'card', 'is-big'), 'full') +
        K.field('Tratament / pachet', '<input name="treatment" required maxlength="200" value="' + esc(pre.treatment || '') + '" placeholder="ex: LipoSonix 2 zone">', 'full') +
        K.field('Categorie', catChips(pre.category || ''), 'full') +
        K.field('Data', '<input name="date" type="date" required value="' + esc(pre.date || K.today()) + '">') +
        K.field('Efectuat de', '<select name="performedBy"><option value="">—</option>' + K.options(emp.map((e) => [e.id, e.name]), pre.performedBy || '') + '</select>') +
        '</form>',
      footer: '<span class="k-grow k-muted" data-hint>Nu creează comision pentru nimeni.</span><button type="button" class="k-btn" data-cancel>Renunță</button><button type="button" class="k-btn is-accent" data-save>' + icon('check') + 'Salvează încasarea</button>',
      focus: false,
      onMount(el) {
        const f = el.querySelector('[data-form]');
        picker = K.clientPicker(f.clientName, f.clientPhone);
        wireCats(el);
        setTimeout(() => (pre.clientName ? f.amount : f.clientName).focus(), 300);
        const offersEl = el.querySelector('[data-offers]');
        const pre0 = offersEl && offersEl.querySelector('.is-on');
        if (pre0 && !f.amount.value) f.amount.value = (K.data.offers.find((x) => x.id === pre0.dataset.offer) || {}).priceNew || '';
        if (offersEl) offersEl.addEventListener('click', (e) => {
          const b = e.target.closest('[data-offer]');
          if (!b) return;
          const o = K.data.offers.find((x) => x.id === b.dataset.offer);
          offersEl.querySelectorAll('[data-offer]').forEach((x) => x.classList.toggle('is-on', x === b));
          f.treatment.value = o.title;
          f.amount.value = o.priceNew;
          setCat(el, offerCategory(o));
          f.amount.animate([{ transform: 'scale(1.04)' }, { transform: 'none' }], { duration: 260, easing: 'ease-out' });
        });
        el.querySelector('[data-cancel]').addEventListener('click', () => d.close());
        f.addEventListener('submit', (e) => { e.preventDefault(); el.querySelector('[data-save]').click(); });
        el.querySelector('[data-save]').addEventListener('click', (e) => K.busy(e.currentTarget, async () => {
          const v = K.formValues(f);
          if (!(Number(v.amount) > 0)) { K.ui().toast('Introdu suma.', 'error'); f.amount.focus(); return; }
          if (!v.clientName || !v.clientPhone) { K.ui().toast('Completează clientul și telefonul.', 'error'); return; }
          if (!v.treatment) { K.ui().toast('Completează tratamentul.', 'error'); f.treatment.focus(); return; }
          if (!v.category) { K.ui().toast('Alege categoria.', 'error'); return; }
          try {
            await K.api('/api/portal-sale', Object.assign({ source: 'incasare' }, v, { amount: Number(v.amount) }));
            // Paid from an appointment → close the loop in the Calendar.
            if (pre.appt && pre.appt.id && pre.appt.status !== 'finalizata') {
              const a = pre.appt;
              await K.api('/api/portal-appointments', { action: 'update', id: a.id, date: a.date, time: a.time, clientId: a.clientId, clientName: a.clientName, clientPhone: a.clientPhone,
                treatment: a.treatment, category: a.category, location: a.location, cosmeticianId: a.cosmeticianId || '', status: 'finalizata' }).catch(() => {});
            }
            d.close();
            K.ui().toast('Încasat ' + K.lei(v.amount, 2) + ' · ' + v.clientName, 'success');
            S.month = K.monthOf(v.date);
            K.reload();
          } catch (err) { K.ui().toast(K.errText(err), 'error'); }
        }));
      },
    });
  }

  // ---------------- view / edit (owner) one payment
  function openPayment(id) {
    const s = (K.data.incasari || []).find((x) => x.id === id);
    if (!s) return;
    const m = METHODS[s.method] || METHODS.card;
    const admin = K.data.isAdmin;
    const emp = K.data.activeEmployees || [];
    const d = K.drawer({
      title: K.lei(s.amount, 2), lead: '<span class="k-dicon" style="background:' + m.color + '">' + icon(m.ic) + '</span>',
      subtitle: esc(s.client) + ' · ' + esc(K.dateLong(s.date)),
      body: admin ? '<form class="k-form" data-form>' +
          K.field('Sumă', '<div class="k-money"><input name="amount" type="number" min="0" step="0.01" value="' + esc(s.amount) + '"></div>', 'full') +
          K.field('Metodă', K.seg('method', Object.keys(METHODS).map((k) => [k, METHODS[k].label, METHODS[k].ic]), s.method, 'is-big'), 'full') +
          K.field('Client', '<input name="client" maxlength="150" value="' + esc(s.client) + '">') +
          K.field('Data', '<input name="date" type="date" value="' + esc(s.date) + '">') +
          K.field('Tratament', '<input name="treatment" maxlength="200" value="' + esc(s.treatment) + '">', 'full') +
          K.field('Categorie', catChips(s.category), 'full') +
          K.field('Efectuat de', '<select name="performedBy"><option value="">—</option>' + K.options(emp.map((e) => [e.id, e.name]), s.performedBy || '') + '</select>', 'full') +
          '</form>' + '<p class="k-muted">Înregistrată de ' + esc(s.employeeName || '—') + (s.createdAt ? ' · ' + esc(K.ago(s.createdAt)) : '') + '</p>'
        : '<dl class="k-kv"><dt>Client</dt><dd>' + esc(s.client) + '</dd><dt>Tratament</dt><dd>' + esc(s.treatment) + '</dd><dt>Categorie</dt><dd>' + esc(cat(s.category)) + '</dd>' +
          '<dt>Metodă</dt><dd>' + m.label + '</dd><dt>Efectuat de</dt><dd>' + esc(s.performedByName || '—') + '</dd><dt>Înregistrată de</dt><dd>' + esc(s.employeeName || '—') + '</dd></dl>' +
          '<div class="mo-note">' + icon('info') + 'O greșeală? Corecturile le face administratorul — spune-i ce trebuie modificat.</div>',
      footer: admin ? '<button type="button" class="k-btn is-danger is-sm" data-del>' + icon('trash') + 'Șterge</button><span class="k-grow"></span><button type="button" class="k-btn is-primary" data-save>' + icon('check') + 'Salvează</button>' : '',
      onMount(el) {
        if (!admin) return;
        wireCats(el);
        const f = el.querySelector('[data-form]');
        el.querySelector('[data-save]').addEventListener('click', (e) => K.busy(e.currentTarget, async () => {
          const v = K.formValues(f);
          try { await K.api('/api/portal-incasari', Object.assign({ action: 'update', id: s.id }, v, { amount: Number(v.amount) })); d.close(); K.ui().toast('Încasare corectată.', 'success'); K.reload(); }
          catch (err) { K.ui().toast(K.errText(err), 'error'); }
        }));
        el.querySelector('[data-del]').addEventListener('click', async () => {
          if (!(await K.ui().confirm({ title: 'Ștergi încasarea?', message: K.lei(s.amount, 2) + ' · ' + s.client + ' dispare din toate totalurile. Nu se poate recupera.', confirmText: 'Șterge', danger: true }))) return;
          try { await K.api('/api/portal-incasari', { action: 'delete', id: s.id }); d.close(); K.ui().toast('Încasare ștearsă.', 'success'); K.reload(); }
          catch (err) { K.ui().toast(K.errText(err), 'error'); }
        });
      },
    });
  }

  function exportCsv() {
    const rows = filtered().slice().sort((a, b) => (a.date < b.date ? -1 : 1));
    if (!rows.length) { K.ui().toast('Nimic de exportat pentru filtrul ales.', 'info'); return; }
    K.csv('incasari-' + S.month + (S.day ? '-' + S.day.slice(8) : '') + '.csv', [['Data', 'Client', 'Tratament', 'Categorie', 'Sumă (lei)', 'Metodă', 'Efectuat de', 'Înregistrat de']]
      .concat(rows.map((s) => [s.date, s.client, s.treatment, cat(s.category), String(s.amount).replace('.', ','), (METHODS[s.method] || {}).label || s.method, s.performedByName || '', s.employeeName || ''])));
  }
  function printMonth() {
    const rows = filtered().slice().sort((a, b) => (a.date < b.date ? -1 : 1));
    const w = window.open('', '_blank', 'width=900,height=700');
    if (!w) { K.ui().toast('Permite ferestrele pop-up ca să printezi.', 'error'); return; }
    const byM = Object.keys(METHODS).map((k) => METHODS[k].label + ': ' + K.lei(sum(rows.filter((s) => s.method === k)), 2)).join(' · ');
    w.document.write('<!doctype html><html lang="ro"><head><meta charset="utf-8"><title>Încasări ' + esc(K.monthLabel(S.month)) + '</title><style>' +
      'body{font:13px/1.45 Inter,system-ui,sans-serif;color:#111;margin:32px}h1{font-size:20px;margin:0 0 4px}p{color:#555;margin:0 0 18px}' +
      'table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:7px 8px;border-bottom:1px solid #ddd}th{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#666}' +
      'td.n{text-align:right;font-variant-numeric:tabular-nums}tfoot td{font-weight:700;border-top:2px solid #111}</style></head><body>' +
      '<h1>Centrul360 — Încasări ' + esc(S.day ? K.dateLong(S.day) : K.monthLabel(S.month)) + '</h1><p>' + esc(byM) + '</p><table><thead><tr><th>Data</th><th>Client</th><th>Tratament</th><th>Metodă</th><th>Efectuat de</th><th class="n">Sumă</th></tr></thead><tbody>' +
      rows.map((s) => '<tr><td>' + esc(K.dateShort(s.date)) + '</td><td>' + esc(s.client) + '</td><td>' + esc(s.treatment) + '</td><td>' + esc((METHODS[s.method] || {}).label || '') + '</td><td>' + esc(s.performedByName || '') + '</td><td class="n">' + K.lei(s.amount, 2) + '</td></tr>').join('') +
      '</tbody><tfoot><tr><td colspan="5">Total · ' + rows.length + ' încasări</td><td class="n">' + K.lei(sum(rows), 2) + '</td></tr></tfoot></table>' +
      '<script>window.onload=function(){window.print();}<\/script></body></html>');
    w.document.close();
  }

  K.section('incasari', { mount: mountIncasari, show: render, data() { if (panel && K.isActive('incasari')) render(); } });
  K.on('incasari:new', (pre) => openNew(pre || {}));
  K.on('incasari:day', (d) => { if (!d) return; S.month = K.monthOf(d); S.day = d; render(); });

  // =====================================================================================
  // COMISIONUL MEU
  // =====================================================================================
  const C = { month: K.thisMonth() };
  let cpanel;
  function rateOf(category) { const D = K.data; return category === 'retail' ? D.retailRate : ((D.commissionRates || {})[category] || 0); }

  function mountComision(p) {
    cpanel = p;
    cpanel.classList.add('k-panel', 'mo');
    cpanel.innerHTML =
      '<div class="k-head"><div><div class="k-eyebrow">Echipă</div><h2>Comisionul meu</h2><p class="k-lede">Loghează în aceeași zi fiecare vânzare făcută de tine. Administratorul o aprobă și comisionul se calculează automat.</p></div>' +
      '<div class="k-head-actions"><button type="button" class="k-btn is-accent" data-act="new">' + icon('plus') + 'Loghează o vânzare<kbd>N</kbd></button></div></div>' +
      '<div data-body></div>';
    cpanel.addEventListener('click', (e) => {
      if (e.target.closest('[data-act="new"]')) return openSale({});
      const m = e.target.closest('[data-m]');
      if (m) { C.month = K.addMonths(C.month, +m.dataset.m); renderComision(); }
    });
    document.addEventListener('keydown', (e) => {
      if (!K.isActive('comision') || K.drawerOpen || K.typing(document.activeElement) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key.toLowerCase() === 'n') { e.preventDefault(); openSale({}); }
    });
  }

  // Every bonus this account can win this month, in one place.
  function bonusesHtml() {
    const D = K.data;
    const items = [];
    const cg = D.companyGoal || {};
    if (cg.reward) {
      const pct = cg.target ? Math.min(100, (cg.current / cg.target) * 100) : 0;
      items.push({ ic: 'target', title: 'Obiectivul clinicii', sub: K.lei(cg.current) + ' din ' + K.lei(cg.target) + ' — se plătește tuturor', pct, reward: cg.reward, won: pct >= 100 });
    }
    const rb = D.raceBonus || { leaderboard: [] };
    if (rb.reward) {
      const lb = rb.leaderboard || [];
      const meRow = lb.find((r) => r.employeeId === D.me.id) || { count: 0 };
      const rank = lb.findIndex((r) => r.employeeId === D.me.id) + 1;
      const leading = rank === 1 && meRow.count > 0;
      items.push({ ic: 'trophy', title: 'Bonus de viteză · ' + cat(rb.category), sub: meRow.count + ' din ' + rb.target + (rank ? ' · locul ' + rank : '') + (leading ? ' — conduci!' : ''), pct: rb.target ? Math.min(100, (meRow.count / rb.target) * 100) : 0, reward: rb.reward, won: leading && meRow.count >= rb.target });
    }
    (D.myGoals || []).forEach((g) => {
      const pct = g.target > 0 ? Math.min(100, (g.current / g.target) * 100) : 0;
      const ron = /incasari|comision/.test(g.metric);
      items.push({ ic: 'star', title: g.title, sub: (ron ? K.lei(g.current) + ' din ' + K.lei(g.target) : g.current + ' din ' + g.target), pct, reward: g.reward || 0, won: pct >= 100 });
    });
    if (!items.length) return K.empty('gift', 'Niciun bonus activ luna aceasta', 'Când administratorul îți setează obiective cu bonus, le vezi aici.');
    const possible = items.reduce((a, x) => a + (x.reward || 0), 0);
    const won = items.filter((x) => x.won).reduce((a, x) => a + (x.reward || 0), 0);
    return '<div class="mo-bonus-head"><div><span>Deblocat</span><b data-count="' + won + '" data-fmt="lei" data-key="mo-bwon">0</b></div><div><span>Posibil luna aceasta</span><b>' + K.lei(possible) + '</b></div></div>' +
      '<div class="mo-bonuses">' + items.map((x) => '<div class="mo-bonus' + (x.won ? ' is-won' : '') + '">' + K.ring(x.pct, { size: 54, stroke: 6, color: x.won ? 'var(--good)' : 'var(--accent)', color2: x.won ? 'var(--good)' : 'var(--accent-2)', inner: icon(x.won ? 'check' : x.ic) }) +
        '<div><b>' + esc(x.title) + '</b><span>' + esc(x.sub) + '</span></div>' + (x.reward ? '<em>' + (x.won ? '' : '+') + K.lei(x.reward) + '</em>' : '') + '</div>').join('') + '</div>';
  }

  function renderComision() {
    if (!cpanel || !K.data) return;
    const D = K.data;
    const sales = (D.mySales || []);
    const inMonth = sales.filter((s) => K.monthOf(s.date) === C.month);
    const approved = inMonth.filter((s) => s.status === 'approved');
    const pending = sales.filter((s) => s.status === 'pending');
    const comm = approved.reduce((a, s) => a + Number(s.commission || 0), 0);
    const pendEst = pending.reduce((a, s) => a + Number(s.amount || 0) * rateOf(s.category) / 100, 0);
    const rejected = inMonth.filter((s) => s.status === 'rejected').length;
    cpanel.querySelector('[data-body]').innerHTML =
      '<div class="k-grid c4 k-stagger">' +
        '<div class="k-stat is-good"><div class="k-stat-top"><span class="k-stat-ic">' + icon('percent') + '</span>Comision aprobat</div><div class="k-stat-value" data-count="' + comm + '" data-fmt="lei" data-key="mo-c-' + C.month + '">0</div><div class="k-stat-sub">' + esc(K.monthLabel(C.month)) + '</div></div>' +
        '<div class="k-stat is-warn"><div class="k-stat-top"><span class="k-stat-ic">' + icon('clock') + '</span>În așteptare</div><div class="k-stat-value" data-count="' + Math.round(pendEst) + '" data-fmt="lei" data-key="mo-pend">0</div><div class="k-stat-sub">' + K.plural(pending.length, 'vânzare', 'vânzări') + ' · estimat</div></div>' +
        '<div class="k-stat is-accent"><div class="k-stat-top"><span class="k-stat-ic">' + icon('receipt') + '</span>Vânzări aprobate</div><div class="k-stat-value" data-count="' + approved.length + '" data-key="mo-appr">0</div><div class="k-stat-sub">' + K.lei(approved.reduce((a, s) => a + Number(s.amount || 0), 0)) + ' vândut</div></div>' +
        '<div class="k-stat' + (rejected ? ' is-bad' : '') + '"><div class="k-stat-top"><span class="k-stat-ic">' + icon('ban') + '</span>Respinse</div><div class="k-stat-value" data-count="' + rejected + '" data-key="mo-rej">0</div><div class="k-stat-sub">luna aceasta</div></div>' +
      '</div>' +
      '<div class="mo-row is-flip">' +
        '<section class="k-card"><div class="k-card-head"><h3>' + icon('gift') + 'Bonusurile mele</h3><span class="k-sub">' + esc(K.monthLabel(K.thisMonth())) + '</span></div>' + bonusesHtml() + '</section>' +
        '<section class="k-card"><div class="k-card-head"><h3>' + icon('receipt') + 'Vânzările mele</h3><div class="k-month"><button type="button" class="k-icon-btn" data-m="-1">' + icon('left') + '</button><b>' + esc(K.monthLabel(C.month)) + '</b><button type="button" class="k-icon-btn" data-m="1">' + icon('right') + '</button></div></div>' +
          (inMonth.length ? '<div class="k-list">' + inMonth.slice().sort((a, b) => (a.date < b.date ? 1 : -1)).map((s) => {
            const st = SALE_STATUS[s.status] || { label: s.status, tone: '' };
            return '<div class="k-row"><span class="k-icon-chip is-' + st.tone + '">' + icon(s.status === 'approved' ? 'check' : s.status === 'rejected' ? 'ban' : 'clock') + '</span>' +
              '<div class="k-row-main"><div class="k-row-title">' + esc(s.treatment) + '</div><div class="k-row-sub">' + esc(K.dateShort(s.date)) + ' · ' + esc(cat(s.category)) + (s.client ? ' · ' + esc(s.client) : '') + ' · ' + K.lei(s.amount) + (s.decisionNote ? '<span class="mo-reason">' + esc(s.decisionNote) + '</span>' : '') + '</div></div>' +
              '<div class="k-row-end"><span class="k-tag is-' + st.tone + '">' + st.label + '</span><span class="k-amount">' + (s.status === 'approved' ? '+' + K.lei(s.commission, 2) : s.status === 'pending' ? '~' + K.lei(Number(s.amount) * rateOf(s.category) / 100) : '—') + '</span></div></div>';
          }).join('') + '</div>' : K.empty('receipt', 'Nicio vânzare în ' + K.monthLabel(C.month).toLowerCase(), 'Ai recomandat un pachet sau un produs și clienta l-a cumpărat? Loghează-l aici.', '<button type="button" class="k-btn is-primary" data-act="new">' + icon('plus') + 'Loghează o vânzare</button>')) +
        '</section>' +
      '</div>';
    K.countAll(cpanel);
  }

  function openSale(pre) {
    let picker;
    const d = K.drawer({
      title: 'Loghează o vânzare', icon: 'percent', width: 560, subtitle: 'Merge la aprobare. Comisionul se calculează automat.', focus: false,
      body: '<form class="k-form" data-form>' +
        ((K.data.offers || []).length ? K.field('Ofertă (completează automat)', offerChips(''), 'full') : '') +
        K.field('Ce ai vândut', '<input name="treatment" required maxlength="200" placeholder="ex: Pachet HIFU 3 ședințe, cremă fermitate…">', 'full') +
        K.field('Categorie', catChips(''), 'full') +
        K.field('Sumă încasată', '<div class="k-money"><input name="amount" type="number" inputmode="decimal" min="0" step="0.01" required placeholder="0"></div>', 'full') +
        '<div class="mo-estimate full" data-est>' + icon('percent') + '<span>Alege categoria și suma ca să vezi comisionul estimat.</span></div>' +
        K.field('Data', '<input name="date" type="date" required value="' + K.today() + '">') +
        K.field('Client (opțional)', '<input name="clientName" maxlength="150" placeholder="Caută sau scrie">') +
        K.field('Telefon (doar client nou)', '<input name="clientPhone" type="tel" maxlength="30">') +
        K.field('Notă (opțional)', '<input name="note" maxlength="300">') +
        '</form>',
      footer: '<span class="k-grow"></span><button type="button" class="k-btn" data-cancel>Renunță</button><button type="button" class="k-btn is-accent" data-save>' + icon('check') + 'Trimite la aprobare</button>',
      onMount(el) {
        const f = el.querySelector('[data-form]');
        picker = K.clientPicker(f.clientName, f.clientPhone);
        wireCats(el);
        setTimeout(() => f.treatment.focus(), 300);
        const est = () => {
          const v = K.formValues(f), amt = Number(v.amount) || 0;
          const box = el.querySelector('[data-est]');
          if (!v.category || !amt) { box.innerHTML = icon('percent') + '<span>Alege categoria și suma ca să vezi comisionul estimat.</span>'; box.classList.remove('is-ready'); return; }
          const r = rateOf(v.category);
          box.innerHTML = icon('percent') + '<span>Comision estimat: <b>' + K.lei(amt * r / 100, 2) + '</b> (' + r + '% la ' + esc(cat(v.category)) + ')</span>';
          box.classList.add('is-ready');
        };
        f.addEventListener('input', est);
        f.addEventListener('change', est);
        const offersEl = el.querySelector('[data-offers]');
        if (offersEl) offersEl.addEventListener('click', (e) => {
          const b = e.target.closest('[data-offer]');
          if (!b) return;
          const o = K.data.offers.find((x) => x.id === b.dataset.offer);
          offersEl.querySelectorAll('[data-offer]').forEach((x) => x.classList.toggle('is-on', x === b));
          f.treatment.value = o.title; f.amount.value = o.priceNew; setCat(el, offerCategory(o)); est();
        });
        el.querySelector('[data-cancel]').addEventListener('click', () => d.close());
        el.querySelector('[data-save]').addEventListener('click', (e) => K.busy(e.currentTarget, async () => {
          const v = K.formValues(f);
          if (!v.treatment) { K.ui().toast('Scrie ce ai vândut.', 'error'); f.treatment.focus(); return; }
          if (!v.category) { K.ui().toast('Alege categoria.', 'error'); return; }
          if (!(Number(v.amount) > 0)) { K.ui().toast('Introdu suma.', 'error'); f.amount.focus(); return; }
          const payload = { source: 'comision', date: v.date, category: v.category, treatment: v.treatment, amount: Number(v.amount), note: v.note };
          if (picker.id()) payload.clientId = picker.id();
          else if (v.clientName && v.clientPhone) { payload.clientName = v.clientName; payload.clientPhone = v.clientPhone; }
          try { await K.api('/api/portal-sale', payload); d.close(); K.ui().toast('Vânzare trimisă la aprobare.', 'success'); K.reload(); }
          catch (err) { K.ui().toast(K.errText(err), 'error'); }
        }));
      },
    });
  }

  K.section('comision', { mount: mountComision, show: renderComision, data() { if (cpanel && K.isActive('comision')) renderComision(); } });
  K.on('comision:new', () => openSale({}));
})();
