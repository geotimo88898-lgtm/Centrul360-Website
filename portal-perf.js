// Centrul360 portal, "Performanța site-ului" (Admin): cât de repede se încarcă site-ul la oamenii reali, ce se strică, cum
// răspunde serverul și cât de grele sunt paginile. Totul din /api/portal-perf (api/_lib/perf.js), măsurat, niciodată
// inventat: gol până la prima vizită. Se reîmprospătează la 15 secunde cât e deschis; nu redesenează dacă nu s-a schimbat nimic.
// Aceeași logică și aceleași cuvinte ca ecranul din adminul Summitlane, în aspectul portalului (K, portal-kit).
// Singur: își pune butonul în meniu (Admin, după Activitate), panoul și stilul; în portal.html e doar un rând <script>,
// înaintea lui portal-core.js.
(function () {
  'use strict';
  const K = window.K;
  if (!K) return;
  const { esc } = K;
  const TAB = 'performanta';

  // ---------- butonul, panoul, stilul ----------
  function inject() {
    const nav = document.getElementById('tabsNav'), main = document.querySelector('#app main');
    if (!nav || !main || nav.querySelector('[data-tab="' + TAB + '"]')) return;
    const b = document.createElement('button');
    b.dataset.tab = TAB; b.className = 'admin-only hidden';
    b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 16a8 8 0 1 1 16 0"/><path d="m12 16 4-5"/><path d="M4 20h16"/></svg>Performanța site-ului';
    const after = nav.querySelector('[data-tab="activitate"]');
    if (after) after.after(b); else nav.appendChild(b);
    const s = document.createElement('section');
    s.className = 'panel admin-only hidden'; s.id = 'panel-' + TAB;
    main.appendChild(s);
    const st = document.createElement('style');
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  const M = {
    lcp: { ab: 'LCP', nm: 'Încărcarea', say: 'Cât așteaptă omul până vede partea principală a paginii.', good: 'sub 2,5 s', fix: 'Poza sau video-ul de sus apare greu: fă-l mai mic, preîncarcă-l și nu-l ascunde după o animație.' },
    inp: { ab: 'INP', nm: 'Reacția', say: 'Cât durează până pagina răspunde la o atingere.', good: 'sub 200 ms', fix: 'Pagina răspunde greu la atingere: mai puțin JavaScript la apăsare, animațiile abia după răspuns.' },
    cls: { ab: 'CLS', nm: 'Stabilitatea', say: 'Cât sare pagina în timp ce se încarcă.', good: 'sub 0,10', fix: 'Pagina sare cât se încarcă: dă înălțime fixă pozelor, video-ului și bannerelor, fonturile fără salt.' },
    fcp: { ab: 'FCP', nm: 'Primul conținut', say: 'Când apare primul text sau prima poză.', good: 'sub 1,8 s', fix: 'Primul text apare târziu: mai puține fișiere care blochează afișarea (CSS, fonturi, scripturi în head).' },
    ttfb: { ab: 'TTFB', nm: 'Serverul', say: 'Cât durează până sosește primul octet al paginii.', good: 'sub 0,8 s', fix: 'Serverul trimite pagina greu: pagina din cache, mai puțin lucru la fiecare cerere.' }
  };
  const ORDER = ['lcp', 'inp', 'cls', 'fcp', 'ttfb'];
  const TH = { lcp: [2500, 4000], inp: [200, 500], cls: [100, 250], fcp: [1800, 3000], ttfb: [800, 1800] };
  const DEV = { m: 'Telefon', t: 'Tabletă', d: 'Calculator' };
  const KIND = { home: 'Prima pagină', service: 'Paginile tratamentelor', offers: 'Oferte și prețuri', booking: 'Programarea', thanks: 'Mulțumim (după programare)', results: 'Rezultate și echipa', city: 'Paginile orașelor', legal: 'Termeni și confidențialitate', other: 'Alte pagini' };
  const TGT = { home: 'Prima pagină', service: 'Pagina unui tratament', booking: 'Programarea', offers: 'Ofertele (API)', portal: 'Portalul' };
  const TGT_SAY = { home: 'nimeni nu poate deschide site-ul', service: 'paginile tratamentelor nu se deschid', booking: 'nimeni nu se poate programa', offers: 'ofertele și prețurile nu apar', portal: 'echipa nu poate intra în portal' };
  const ERRT = { js: 'Eroare JavaScript', promise: 'Eroare JavaScript', res: 'Fișier neîncărcat', api: 'Apel API eșuat' };
  const PARTS = [['img', 'Imagini'], ['media', 'Video'], ['js', 'JavaScript'], ['css', 'CSS'], ['font', 'Fonturi'], ['html', 'HTML'], ['other', 'Altele']];
  const CTRY = { RO: 'România', MD: 'Moldova', DE: 'Germania', IT: 'Italia', ES: 'Spania', FR: 'Franța', GB: 'Marea Britanie', AT: 'Austria', HU: 'Ungaria', US: 'SUA', NL: 'Olanda', BE: 'Belgia', IE: 'Irlanda' };
  const S = { period: 'today', metric: 'lcp', d: null, key: '', busy: false, timer: 0 };
  let panel;

  const fmt = (m, v) => (v == null ? '-' : m === 'cls' ? (v / 1000).toFixed(2).replace('.', ',') : v >= 1000 ? (v / 1000).toFixed(v >= 10000 ? 0 : 1).replace('.', ',') + ' s' : Math.round(v) + ' ms');
  const ms = (v) => fmt('ms', v);
  const bytes = (b) => (b == null ? '-' : b >= 1048576 ? (b / 1048576).toFixed(b >= 10 * 1048576 ? 0 : 1).replace('.', ',') + ' MB' : b >= 1024 ? Math.round(b / 1024) + ' KB' : b + ' B');
  const rate = (m, v) => (v == null ? 'na' : v <= TH[m][0] ? 'good' : v <= TH[m][1] ? 'ni' : 'poor');
  const pct = (x, d) => (x == null || !isFinite(x) ? '-' : (x * 100).toFixed(d || 0).replace('.', ',') + '%');
  const nf = (n) => Math.round(Number(n) || 0).toLocaleString('ro-RO');
  const ro = (n, one, many) => (n === 1 ? '1 ' + one : n + (n % 100 >= 20 || (n && n % 100 === 0) ? ' de ' : ' ') + many);
  const at = (t) => { const d = new Date(t), hm = K.pad(d.getHours()) + ':' + K.pad(d.getMinutes()), day = K.iso(d); return (day === K.today() ? 'azi' : day === K.addDays(K.today(), -1) ? 'ieri' : K.dateShort(day)) + ', ' + hm; };
  const low = (t) => (/^(JavaScript|CSS|HTML)$/.test(t) ? t : t.toLowerCase());
  const tag = (m, v) => '<span class="k-tag pf-t-' + rate(m, v) + '" title="' + M[m].nm + '">' + M[m].ab + ' ' + fmt(m, v) + '</span>';
  const tile = (lbl, val, p, extra) => '<div class="k-card pf-tile"><span class="pf-l">' + lbl + '</span><b class="pf-v">' + val + '</b><p>' + p + '</p>' + (extra || '') + '</div>';
  function delta(cur, prev, lower, asPct) {
    if (cur == null || prev == null || !isFinite(cur) || !isFinite(prev) || (!cur && !prev)) return '';
    const d = cur - prev;
    if (Math.abs(d) < (asPct ? 0.005 : 1)) return '<span class="pf-d">la fel ca înainte</span>';
    const good = lower == null ? null : lower ? d < 0 : d > 0;
    const t = asPct ? (d > 0 ? '+' : '-') + Math.round(Math.abs(d) * 100) + ' puncte' : prev ? (d > 0 ? '+' : '-') + Math.round(Math.abs(d) / prev * 100) + '%' : (d > 0 ? '+' : '-') + nf(Math.abs(d));
    return '<span class="pf-d' + (good == null ? '' : good ? ' is-up' : ' is-down') + '">' + t + ' față de perioada de dinainte</span>';
  }

  function mount(p) {
    panel = p;
    panel.classList.add('k-panel', 'pf');
    panel.innerHTML = '<div class="k-head"><div><div class="k-eyebrow">Admin</div><h2>Performanța site-ului <span class="k-live">Live</span></h2>' +
      '<p class="k-lede">Cât de repede se încarcă site-ul la oamenii reali, ce se strică și cum răspunde serverul.</p></div>' +
      '<div class="k-head-actions">' + K.seg('pfperiod', [['today', 'Azi'], ['7d', '7 zile'], ['30d', '30 zile']], S.period) +
      '<button type="button" class="k-btn is-sm" data-pfprobe>Verifică serverul acum</button></div></div><div data-pfbody><div class="k-skel" style="height:320px"></div></div>';
    panel.addEventListener('change', (e) => { if (e.target.name === 'pfperiod') { S.period = e.target.value; load(true); } });
    panel.addEventListener('click', async (e) => {
      const m = e.target.closest('[data-pfm]');
      if (m) { S.metric = m.dataset.pfm; paint(); return; }
      const b = e.target.closest('[data-pfprobe]');
      if (!b || b.disabled) return;
      b.disabled = true; b.classList.add('is-busy');
      try {
        const r = await K.api('/api/portal-perf', { action: 'probe' });
        const bad = (r.r || []).filter((x) => !(x.code >= 200 && x.code < 400)).length;
        K.ui().toast(bad ? 'Am verificat ' + r.r.length + ' adrese: ' + bad + ' nu răspund.' : 'Am verificat ' + r.r.length + ' adrese: toate răspund.', bad ? 'error' : undefined);
        await load(true);
      } catch (err) { K.ui().toast(K.errText(err, 'Verificarea n-a mers. Încearcă din nou.'), 'error'); }
      b.disabled = false; b.classList.remove('is-busy');
    });
  }
  async function load(force) {
    if (S.busy && !force) return;
    S.busy = true;
    try {
      const d = await K.api('/api/portal-perf?period=' + S.period);
      const key = JSON.stringify(d);
      if (force || key !== S.key) { S.key = key; S.d = d; paint(); }
    } catch (err) {
      if (!S.d) panel.querySelector('[data-pfbody]').innerHTML = K.empty('alert', 'Nu am putut încărca măsurătorile', esc(K.errText(err, 'Încearcă din nou.')));
    }
    S.busy = false;
    clearTimeout(S.timer);
    S.timer = setTimeout(() => { if (K.isActive(TAB) && !document.hidden) load(); }, 15000);
  }

  function paint() {
    const j = S.d, body = panel && panel.querySelector('[data-pfbody]');
    if (!j || !body) return;
    const V = j.views || { n: 0, good: 0, poor: 0 }, PV = j.prev_views, et = j.errors.tot || {}, ep = j.errors.prev || {};
    let eN = 0, epN = 0; Object.keys(et).forEach((k) => { eN += et[k].n; }); Object.keys(ep).forEach((k) => { epN += ep[k]; });
    const srv = j.servers.list || [], probed = srv.some((x) => x.last), down = srv.filter((x) => x.last && !x.last.up).length;
    let tUp = 0, tN = 0; srv.forEach((x) => { tUp += x.up || 0; tN += x.n || 0; });
    const fast = V.n ? V.good / V.n : null, pfast = PV && PV.n ? PV.good / PV.n : null;
    let h = '<div class="pf-tiles">' +
      tile('Vizite rapide', fast == null ? '-' : '<span class="pf-' + (fast >= 0.75 ? 'good' : fast >= 0.5 ? 'ni' : 'poor') + '">' + pct(fast) + '</span>',
        V.n ? 'Din 100 de vizite, ' + Math.round(fast * 100) + ' au avut toate cifrele în verde. ' + (V.poor ? Math.round(100 * V.poor / V.n) + ' au avut cel puțin una în roșu.' : 'Niciuna în roșu.') : 'Apar la prima vizită măsurată.', delta(fast, pfast, false, true)) +
      tile('Vizite măsurate', nf(V.n), V.n ? 'Pagini deschise de oameni reali, măsurate de telefonul sau calculatorul lor.' : 'Încă nicio vizită măsurată în perioadă.', PV ? delta(V.n, PV.n, null) : '') +
      tile('Erori', eN ? '<span class="pf-poor">' + nf(eN) + '</span>' : '0', eN ? 'JavaScript, fișiere neîncărcate și apeluri API eșuate, la vizitatori.' : 'Nicio eroare la vizitatori. Bine.', delta(eN, epN, true)) +
      tile('Serverul', !probed ? '-' : down ? '<span class="pf-poor">' + down + ' nu ' + (down === 1 ? 'răspunde' : 'răspund') + '</span>' : '<span class="pf-good">Răspunde</span>',
        !probed ? 'Apasă „Verifică serverul acum” pentru prima verificare.' : 'Verificat ' + esc(at(j.servers.last || Date.now())) + '. ' + (tN ? 'A răspuns la ' + pct(tUp / tN, 1) + ' din verificări în perioadă.' : '')) + '</div>';
    h += sec('Ce trebuie reparat', 'în ordinea impactului') + fixHtml(j.fix || [], V.n || probed || eN);
    if (!V.n && !eN && !probed) { body.innerHTML = h + '<div class="k-card">' + K.empty('sparkles', 'Încă nicio vizită măsurată', 'Viteza, erorile și greutatea paginilor apar aici după ce paginile site-ului au rândul <code>&lt;script src="/c360-perf.js" defer&gt;</code> și intră primii vizitatori. Nicio cifră inventată.') + '</div>'; return; }
    h += sec('Core Web Vitals', '75 din 100 de vizite au avut cel mult cifra asta, cum măsoară Google') + '<div class="pf-vit">' + ORDER.map((m) => {
      const x = j.vitals[m], p = j.prev[m];
      return '<div class="k-card pf-vt"><span class="pf-l">' + M[m].ab + ' · ' + M[m].nm + '</span><b class="pf-v pf-' + (x ? x.rate : 'na') + '">' + fmt(m, x && x.p75) + '</b><p>' + esc(M[m].say) + ' Bine: ' + M[m].good + '.' +
        (x ? '' : m === 'inp' ? ' Apare după prima atingere (Safari vechi nu o măsoară).' : ' Încă nicio măsurare.') + '</p>' + (x ? tri(x) : '') + (x && p != null ? delta(x.p75, p, true) : '') + '</div>';
    }).join('') + '</div>';
    const tr = j.trend, any = (tr.m[S.metric] || []).some((x) => x != null);
    h += '<div class="k-card pf-tr"><div class="pf-sec"><h3>În timp, ' + (tr.by === 'hour' ? 'pe ore' : 'pe zile') + '</h3><div class="k-chips">' + ORDER.map((m) => '<button type="button" class="k-chip' + (m === S.metric ? ' is-on' : '') + '" data-pfm="' + m + '">' + M[m].ab + '</button>').join('') + '</div></div>' +
      (any ? chart(tr, S.metric) + '<p class="pf-cap"><span><i class="pf-sw"></i>' + M[S.metric].ab + ' la 75 din 100 de vizite</span><span><i class="pf-sw is-th"></i>pragul bun (' + M[S.metric].good + ')</span></p>' : '<p class="k-muted pf-none">Încă nicio măsurare ' + M[S.metric].ab + ' în perioadă.</p>') + '</div>';
    h += '<div class="pf-g2"><div>' + sec('Pe pagini') + '<div class="k-card pf-list">' + (j.kinds.length ? j.kinds.map((k) =>
      '<div class="pf-row"><div><b>' + esc(KIND[k.kind] || k.kind) + '</b><small>' + ro(k.v.n, 'vizită', 'vizite') + (k.v.n ? ' · ' + pct(k.v.good / k.v.n) + ' rapide' : '') + '</small></div><div class="pf-tags">' + ['lcp', 'inp', 'cls'].map((m) => (k.m[m] ? tag(m, k.m[m].p75) : '')).join('') + '</div></div>').join('') : '<p class="k-muted">Încă nicio pagină măsurată.</p>') + '</div></div>' +
      '<div>' + sec('Pe dispozitiv') + '<div class="k-card">' + (j.devs.length ? j.devs.map((x) => '<div class="pf-dev"><div class="pf-devh"><b>' + DEV[x.dev] + '</b><span class="k-muted">' + ro(x.v.n, 'vizită', 'vizite') + ' · ' + pct(x.v.n / (V.n || 1)) + ' din total</span></div><div class="pf-devm">' +
        ['lcp', 'inp', 'cls', 'ttfb'].map((m) => { const s = x.m[m]; return '<div><span>' + M[m].ab + '</span><b class="pf-' + (s ? s.rate : 'na') + '">' + fmt(m, s && s.p75) + '</b></div>'; }).join('') + '</div></div>').join('') : '<p class="k-muted">Apare la prima vizită.</p>') + '</div></div></div>';
    if (j.countries.length) {
      const mx = j.countries[0].n || 1;
      h += sec('Pe țări', 'după numărul de vizite') + '<div class="k-card pf-ctry">' + j.countries.map((c) => '<div class="pf-cr"><span>' + esc(CTRY[c.country] || c.country) + '</span><span class="pf-cb"><i style="width:' + Math.max(3, 100 * c.n / mx) + '%"></i></span><b>' + nf(c.n) + '</b><span class="pf-tags">' + ['lcp', 'inp'].map((m) => (c.m[m] ? tag(m, c.m[m].p75) : '')).join('') + '</span></div>').join('') + '</div>';
    }
    h += sec('Ultimele vizite măsurate', 'cele mai noi sus') + '<div class="k-card pf-list">' + (j.stream.length ? j.stream.slice(0, 20).map((r) =>
      '<div class="pf-row"><div><b class="pf-mono">' + esc(r.page) + '</b><small>' + esc([at(r.at), DEV[r.dev], r.br, CTRY[r.country] || r.country, r.kb ? bytes(r.kb * 1024) : ''].filter(Boolean).join(' · ')) + '</small></div><div class="pf-tags">' + ['lcp', 'inp', 'cls'].map((m) => (r[m] != null ? tag(m, r[m]) : '')).join('') + '</div></div>').join('')
      : '<p class="k-muted">Fiecare pagină deschisă apare aici, cu viteza ei, la câteva secunde după ce omul pleacă de pe ea.</p>') + '</div>';
    const tE = (t) => (t === 'js' ? { n: (et.js ? et.js.n : 0) + (et.promise ? et.promise.n : 0), g: (et.js ? et.js.g : 0) + (et.promise ? et.promise.g : 0) } : et[t] || { n: 0, g: 0 });
    const pE = (t) => (t === 'js' ? (ep.js || 0) + (ep.promise || 0) : ep[t] || 0);
    h += sec('Erori la vizitatori') + '<div class="pf-tiles is-3">' + [['js', 'Erori JavaScript', 'Cod care s-a oprit în browserul omului.'], ['res', 'Fișiere neîncărcate', 'Poze, video, scripturi sau stiluri care n-au venit.'], ['api', 'Apeluri API eșuate', 'Programare, oferte, formular: serverul n-a răspuns bine.']].map(([k, l, say]) => {
      const x = tE(k);
      return tile(l, x.n ? '<span class="pf-poor">' + nf(x.n) + '</span>' : '0', x.n ? say + ' ' + ro(x.g, 'problemă diferită', 'probleme diferite') + '.' : 'Niciuna în perioadă.', delta(x.n, pE(k), true));
    }).join('') + '</div><div class="k-card pf-list">' + (j.errors.groups.length ? j.errors.groups.map((e) =>
      '<div class="pf-row"><div><b><span class="k-tag ' + (e.type === 'api' ? 'pf-t-poor' : 'is-warn') + '">' + ERRT[e.type] + '</span> <span class="pf-mono pf-msg">' + esc(e.msg) + '</span></b><small>' + esc([e.page, e.br, e.src && e.src !== 'browser' ? e.src : ''].filter(Boolean).join(' · ')) + '</small><small>Prima dată ' + esc(at(e.first)) + ', ultima ' + esc(at(e.last)) + '</small></div><div class="pf-n"><b>' + nf(e.n) + '</b><small>' + (e.n === 1 ? 'dată' : 'ori') + '</small></div></div>').join('')
      : '<p class="k-muted">Nicio eroare în perioadă. Erorile JavaScript, fișierele care nu se încarcă și apelurile API eșuate apar aici, grupate, cu numărul de vizite atinse.</p>') + '</div>';
    h += sec('Serverul', j.servers.last ? 'ultima verificare ' + at(j.servers.last) : 'încă neverificat') + '<div class="k-card pf-list">' + srv.map((x) => {
      const st = !x.last ? ['', 'neverificat'] : !x.last.up ? ['pf-t-poor', x.last.code ? 'cod ' + x.last.code : 'nu răspunde'] : [x.last.ms > 2500 ? 'pf-t-ni' : 'pf-t-good', ms(x.last.ms)];
      const stat = x.n ? pct(x.up / x.n, 1) + ' disponibil · ' + ro(x.n, 'verificare', 'verificări') + (x.p50 != null ? ' · p50 ' + ms(x.p50) + ', p95 ' + ms(x.p95) : '') : 'fără verificări în perioadă';
      return '<div class="pf-row"><div><b>' + esc(TGT[x.target] || x.target) + ' <span class="pf-mono k-muted">' + esc(String(x.path || '').replace(/^https?:\/\//, '')) + '</span></b><small>' + esc(stat) + '</small></div>' + spark(x.spark) + '<span class="k-tag ' + st[0] + '">' + esc(st[1]) + '</span></div>';
    }).join('') + '</div><p class="k-muted pf-note">Portalul cere fiecare adresă de pe internet, ca un vizitator: în fiecare oră, cel mult o dată la 10 minute cât sunt oameni pe site și când apeși „Verifică serverul acum”. Timpul e până la ultimul octet.</p>';
    h += sec('Greutatea paginilor', 'cât descarcă un vizitator, în medie');
    if (j.weight.length) {
      const mx = Math.max.apply(null, j.weight.map((w) => w.avg).concat([1]));
      h += '<div class="k-card"><div class="pf-leg">' + PARTS.map(([k, l]) => '<span><i class="pf-c-' + k + '"></i>' + l + '</span>').join('') + '</div>' + j.weight.map((w) => {
        const big = PARTS.slice().sort((a, b) => (w.parts[b[0]] || 0) - (w.parts[a[0]] || 0))[0];
        return '<div class="pf-w"><div class="pf-wh"><div><b>' + esc(KIND[w.kind] || w.kind) + '</b><small>' + ro(w.req, 'fișier', 'fișiere') + ' · cel mai mult: ' + low(big[1]) + ' ' + bytes(w.parts[big[0]]) + '</small></div><b class="pf-nw">' + bytes(w.avg) + '</b></div>' +
          '<div class="pf-stack" style="width:' + Math.max(4, 100 * w.avg / mx) + '%">' + PARTS.map(([k, l]) => (w.parts[k] ? '<i class="pf-c-' + k + '" style="flex:' + w.parts[k] + '" title="' + l + ' ' + bytes(w.parts[k]) + '"></i>' : '')).join('') + '</div></div>';
      }).join('') + '</div>';
      if (j.heavy.length) h += sec('Cele mai grele fișiere') + '<div class="k-card pf-list">' + j.heavy.map((r) => '<div class="pf-row"><div><b class="pf-mono">' + esc(r.url) + '</b><small>' + esc([KIND[r.kind] || r.kind, (PARTS.find((p) => p[0] === r.type) || ['', 'Altele'])[1], 'încărcat în ' + ms(r.ms), ro(r.n, 'vizită', 'vizite')].join(' · ')) + '</small></div><div class="pf-n"><b>' + bytes(r.avg) + '</b></div></div>').join('') + '</div>';
    } else h += '<div class="k-card"><p class="k-muted">Greutatea vine din browserul vizitatorilor: HTML, JavaScript, CSS, imagini, fonturi și video, pe fiecare pagină.</p></div>';
    body.innerHTML = h;
  }
  function sec(t, aside) { return '<div class="pf-sec"><h3>' + t + '</h3>' + (aside ? '<span class="k-muted">' + esc(aside) + '</span>' : '') + '</div>'; }
  function tri(x) {
    return '<span class="pf-tri"><i class="is-g" style="flex:' + (x.good || 0) + '"></i><i class="is-n" style="flex:' + (x.ni || 0) + '"></i><i class="is-p" style="flex:' + (x.poor || 0) + '"></i></span>' +
      '<span class="pf-trit"><b class="pf-good">' + pct(x.good / x.n) + '</b> bun · <b class="pf-ni">' + pct(x.ni / x.n) + '</b> mediu · <b class="pf-poor">' + pct(x.poor / x.n) + '</b> slab</span>';
  }
  function spark(pts) {
    const v = (pts || []).map((p) => p[1]).filter((x) => x != null);
    if (v.length < 3) return '';
    const mx = Math.max.apply(null, v.concat([1])), W = 90, H = 24;
    return '<svg class="pf-spark" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" aria-label="Timpul de răspuns, 48 de ore"><polyline points="' + v.map((x, i) => (i * W / (v.length - 1)).toFixed(1) + ',' + (H - 2 - x * (H - 4) / mx).toFixed(1)).join(' ') + '" fill="none" stroke="var(--muted)" stroke-width="1.3" vector-effect="non-scaling-stroke"/></svg>';
  }
  function chart(tr, m) {
    const ys = tr.m[m] || [], n = ys.length, thr = TH[m][0], W = 600, H = 200, P = 6;
    const mx = Math.max.apply(null, ys.filter((x) => x != null).concat([thr * 1.25]));
    const X = (i) => (n < 2 ? W / 2 : P + i * (W - 2 * P) / (n - 1)), Y = (v) => H - 4 - v * (H - 16) / mx;
    const segs = []; let cur = [];
    ys.forEach((v, i) => { if (v == null) { if (cur.length) segs.push(cur); cur = []; } else cur.push([X(i), Y(v), v, i]); }); if (cur.length) segs.push(cur);
    const col = { good: 'var(--good)', ni: 'var(--warn)', poor: 'var(--bad)', na: 'var(--muted)' };
    const lbl = (i) => { const s = tr.x[i]; return tr.by === 'hour' ? s.slice(11) + ':00' : K.dateShort(s); };
    const ax = n ? [0, Math.floor((n - 1) / 2), n - 1].filter((x, i, a) => a.indexOf(x) === i) : [];
    return '<div class="pf-chart"><svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" role="img" aria-label="' + M[m].ab + ' în timp"><line x1="0" x2="' + W + '" y1="' + Y(thr).toFixed(1) + '" y2="' + Y(thr).toFixed(1) + '" stroke="var(--good)" stroke-width="1.5" stroke-dasharray="5 5" vector-effect="non-scaling-stroke"/>' +
      segs.map((s) => '<polyline points="' + s.map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ') + '" fill="none" stroke="var(--fg)" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>').join('') +
      segs.map((s) => s.map((p) => '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="3.2" fill="var(--paper)" stroke="' + col[rate(m, p[2])] + '" stroke-width="2" vector-effect="non-scaling-stroke"><title>' + lbl(p[3]) + ' · ' + fmt(m, p[2]) + '</title></circle>').join('')).join('') +
      '</svg><div class="pf-axis">' + ax.map((i) => '<span>' + esc(lbl(i)) + '</span>').join('') + '</div></div>';
  }
  function fixHtml(L, anyData) {
    if (!L.length) return '<div class="k-card"><p class="k-muted">' + (anyData ? 'Nimic de reparat acum: toate cifrele măsurate în perioadă sunt în verde și serverul răspunde.' : 'Aici vin, în ordine, lucrurile care încetinesc sau strică programările: întâi ce atinge cei mai mulți oameni, programarea și paginile tratamentelor înaintea restului.') + '</p></div>';
    return '<div class="k-card pf-list">' + L.map((f, i) => {
      const sev = f.sev >= 3 ? ['pf-t-poor', 'Urgent'] : f.sev === 2 ? ['is-warn', 'Important'] : ['', 'De urmărit'];
      let t = '', say = '';
      if (f.kind === 'down') { t = (TGT[f.target] || f.target) + ' nu răspunde'; say = esc('Ultima verificare, ' + at(f.at) + ': ' + (f.code ? 'cod ' + f.code : 'niciun răspuns') + '. Cât e așa, ' + (TGT_SAY[f.target] || 'pagina nu se deschide') + '.'); }
      else if (f.kind === 'uptime') { t = (TGT[f.target] || f.target) + ' a căzut din când în când'; say = esc('A răspuns la ' + pct(f.up, 1) + ' din ' + nf(f.n) + ' verificări în perioadă. Bine e peste 99,5%.'); }
      else if (f.kind === 'slowsrv') { t = 'Serverul răspunde încet: ' + (TGT[f.target] || f.target).toLowerCase(); say = esc('La 5 din 100 de verificări a durat peste ' + ms(f.p95) + '. Bine e sub 1 s.'); }
      else if (f.kind === 'vital') { t = (KIND[f.page] || f.page) + ' pe ' + DEV[f.dev].toLowerCase() + ': ' + M[f.metric].nm.toLowerCase() + ' ' + fmt(f.metric, f.p75); say = esc(Math.round(f.slow * 100) + ' din 100 de vizite au simțit-o (bine: ' + M[f.metric].good + '). ' + M[f.metric].fix + (f.few ? ' Puține vizite încă (' + nf(f.n) + ').' : '')); }
      else if (f.kind === 'error') { t = (ERRT[f.type] || 'Eroare') + ' pe ' + (f.page || '/'); say = '<span class="pf-mono pf-msg">' + esc(f.msg) + '</span> · ' + esc(ro(f.n, 'dată', 'ori') + ', ultima ' + at(f.last)); }
      else { const big = PARTS.slice().sort((a, b) => (f.parts[b[0]] || 0) - (f.parts[a[0]] || 0))[0]; t = (KIND[f.page] || f.page) + ': ' + bytes(f.avg) + ' de descărcat'; say = esc('Pe telefon, cu internet mobil, înseamnă secunde în plus. Cel mai mult: ' + low(big[1]) + ' (' + bytes(f.parts[big[0]]) + ').'); }
      return '<div class="pf-row pf-fix"><span class="pf-rank">' + (i + 1) + '</span><div><b><span class="k-tag ' + sev[0] + '">' + sev[1] + '</span> ' + esc(t) + '</b><small class="pf-say">' + say + '</small></div></div>';
    }).join('') + '</div>';
  }

  const CSS = '.pf .pf-sec{display:flex;justify-content:space-between;align-items:baseline;gap:.3rem 1rem;flex-wrap:wrap;margin:1.6rem 0 .7rem}.pf .pf-sec h3{margin:0;font-size:1.15rem;letter-spacing:-.02em}.pf .pf-sec .k-muted{font-size:.8rem}' +
    '.pf .pf-tr .pf-sec{margin-top:0}.pf-good{color:var(--good)}.pf-ni{color:var(--warn)}.pf-poor{color:var(--bad)}.pf-na{color:var(--muted)}' +
    '.pf .k-tag.pf-t-good{background:var(--good-soft);color:var(--good)}.pf .k-tag.pf-t-ni{background:var(--warn-soft);color:var(--warn)}.pf .k-tag.pf-t-poor{background:var(--bad-soft);color:var(--bad)}' +
    '.pf-tiles{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.8rem}.pf-tiles.is-3{grid-template-columns:repeat(3,minmax(0,1fr));margin-bottom:.8rem}' +
    '.pf-tile,.pf-vt{display:flex;flex-direction:column;gap:.4rem}.pf-l{font-size:.78rem;font-weight:650;color:var(--muted)}.pf-v{font-size:1.9rem;font-weight:700;letter-spacing:-.03em;line-height:1.1;font-variant-numeric:tabular-nums}' +
    '.pf-tile p,.pf-vt p{margin:0;color:var(--muted);font-size:.82rem;line-height:1.45}.pf-d{font-size:.74rem;font-weight:650;color:var(--muted);margin-top:auto}.pf-d.is-up{color:var(--good)}.pf-d.is-down{color:var(--bad)}' +
    '.pf-vit{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:.8rem}.pf-vt .pf-v{font-size:1.6rem}' +
    '.pf-tri{display:flex;height:6px;gap:2px;border-radius:3px;overflow:hidden}.pf-tri i{display:block;min-width:0}.pf-tri .is-g{background:var(--good)}.pf-tri .is-n{background:var(--warn)}.pf-tri .is-p{background:var(--bad)}.pf-trit{font-size:.74rem;color:var(--muted)}' +
    '.pf-tr{margin-top:1.4rem}.pf-chart svg{display:block;width:100%;height:220px;overflow:visible}.pf-axis{display:flex;justify-content:space-between;font-size:.74rem;color:var(--muted);margin-top:.4rem}' +
    '.pf-cap{display:flex;flex-wrap:wrap;gap:.3rem 1.2rem;font-size:.8rem;color:var(--muted);margin:.6rem 0 0}.pf-cap span{display:inline-flex;align-items:center;gap:.5rem;white-space:nowrap}.pf-sw{display:inline-block;width:18px;height:2px;background:var(--fg)}.pf-sw.is-th{background:repeating-linear-gradient(90deg,var(--good) 0 5px,transparent 5px 10px)}.pf-none{text-align:center;padding:1.5rem 0}' +
    '.pf-g2{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:1rem;align-items:start}' +
    '.pf-list{padding:.2rem 1.1rem}.pf-row{display:flex;align-items:center;justify-content:space-between;gap:.8rem 1rem;padding:.75rem 0;border-top:1px solid var(--line)}.pf-row:first-child{border-top:0}.pf-row>div:first-child{min-width:0;flex:1}' +
    '.pf-row b{display:block;font-weight:620;font-size:.9rem;overflow-wrap:anywhere}.pf-row small{display:block;color:var(--muted);font-size:.78rem;margin-top:.15rem;overflow-wrap:anywhere}.pf-tags{display:flex;flex-wrap:wrap;gap:.35rem;justify-content:flex-end}' +
    '.pf-n{text-align:right;flex:none}.pf-n b{font-size:1rem}.pf-mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-weight:500}.pf-msg{font-size:.8rem}' +
    '.pf-fix{justify-content:flex-start;align-items:flex-start}.pf-rank{width:28px;height:28px;flex:none;border-radius:50%;display:grid;place-items:center;background:var(--fg);color:var(--ink);font-weight:700;font-size:.8rem}.pf-say{line-height:1.45}' +
    '.pf-dev{padding:.7rem 0;border-top:1px solid var(--line)}.pf-dev:first-child{border-top:0;padding-top:0}.pf-devh{display:flex;justify-content:space-between;gap:.6rem;flex-wrap:wrap;align-items:baseline}.pf-devh .k-muted{font-size:.78rem}' +
    '.pf-devm{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.4rem;margin-top:.5rem}.pf-devm div{background:var(--glass);border-radius:10px;padding:.45rem .6rem;display:grid;gap:.1rem}.pf-devm span{font-size:.68rem;font-weight:700;letter-spacing:.06em;color:var(--muted)}' +
    '.pf-ctry{display:grid;gap:.7rem}.pf-cr{display:grid;grid-template-columns:minmax(90px,160px) minmax(0,1fr) 48px auto;gap:.8rem;align-items:center;font-size:.88rem}.pf-cr>b{text-align:right}.pf-cr .pf-tags{flex-wrap:nowrap}.pf-cb{height:8px;border-radius:4px;background:var(--glass-2);overflow:hidden}.pf-cb i{display:block;height:100%;background:var(--accent);border-radius:4px}' +
    '.pf-spark{width:90px;height:24px;flex:none}.pf-note{font-size:.8rem;margin:.6rem 0 0;max-width:70ch}' +
    '.pf-leg{display:flex;flex-wrap:wrap;gap:.4rem 1rem;font-size:.75rem;color:var(--muted);margin-bottom:.5rem}.pf-leg span{display:inline-flex;align-items:center;gap:.35rem}.pf-leg i{width:10px;height:10px;border-radius:3px;display:inline-block}' +
    '.pf-w{padding:.7rem 0;border-top:1px solid var(--line)}.pf-leg+.pf-w{border-top:0}.pf-wh{display:flex;justify-content:space-between;gap:.8rem;align-items:flex-start}.pf-wh>div{min-width:0}.pf-wh b{display:block}.pf-wh small{display:block;color:var(--muted);font-size:.78rem}.pf-nw{white-space:nowrap;flex:none}' +
    '.pf-stack{display:flex;height:12px;gap:1px;margin-top:.5rem;min-width:16px;border-radius:4px;overflow:hidden}.pf-stack i{display:block;min-width:2px}' +
    '.pf-c-img{background:var(--accent)}.pf-c-media{background:var(--accent-3)}.pf-c-js{background:var(--warn)}.pf-c-css{background:var(--info)}.pf-c-font{background:var(--good)}.pf-c-html{background:var(--fg)}.pf-c-other{background:var(--muted-2)}' +
    '@media (max-width:1100px){.pf-vit{grid-template-columns:repeat(3,minmax(0,1fr))}.pf-tiles{grid-template-columns:repeat(2,minmax(0,1fr))}}' +
    '@media (max-width:760px){.pf-vit{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}.pf-vit>:last-child{grid-column:1/-1}.pf-v{font-size:1.5rem}.pf-g2,.pf-tiles.is-3{grid-template-columns:minmax(0,1fr)}' +
    '.pf-row{flex-wrap:wrap}.pf-row>div:first-child{flex-basis:100%}.pf-tags{justify-content:flex-start}.pf-fix{flex-wrap:nowrap}.pf-fix>div{flex-basis:auto}.pf-spark{display:none}.pf-chart svg{height:180px}' +
    '.pf-cr{grid-template-columns:minmax(0,1fr) 40px;row-gap:.35rem}.pf-cb{grid-column:1/-1;grid-row:2}.pf-cr .pf-tags{grid-column:1/-1}.pf-devm{grid-template-columns:repeat(2,minmax(0,1fr))}}';

  inject();
  K.section(TAB, { mount, show() { load(true); } });
})();
