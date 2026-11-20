// Centrul360 portal, „Regulament intern” (the owner, 17.11: in force from 18.11). Everyone reads the version in force
// here, drawn page by page (portal-pdf.js render), with „Descarcă”. Once per version, at the end of the text, a single
// „Am citit regulamentul” (the legal acknowledgement). The owner and the manager upload a new version (PDF) and see who
// confirmed which version and when, and who has not yet. The rules themselves are kept by the portal where they belong
// (who books, the leave form, Manager → Reguli), never as checklists here. API: api/portal-regulament.js.
(function () {
  'use strict';
  const K = window.K;
  if (!K) return;
  const { esc, icon } = K;
// the same page for the job description (the owner, 20.11): „Fișa postului”, read and confirmed by the cosmeticians
function make(C) {
  const S = { d: null, busy: false, url: '' };
  let panel = null;
  const api = (b) => K.api('/api/portal-regulament', Object.assign({ doc: C.doc }, b));

  const boss = () => !!(K.canManage && K.canManage());
  const when = (iso) => { try { return new Intl.DateTimeFormat('ro-RO', { timeZone: 'Europe/Bucharest', day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(iso)); } catch (e) { return ''; } };
  const whenHm = (iso) => { try { return when(iso) + ', ' + new Intl.DateTimeFormat('ro-RO', { timeZone: 'Europe/Bucharest', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)); } catch (e) { return ''; } };
  const size = (n) => (n > 1048576 ? (n / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');
  const ROLE = { cosmetician: 'Cosmeticiană', receptie: 'Recepție', manager: 'Manager' };

  function mount(p) {
    panel = p;
    panel.classList.add('k-panel', 'rg');
    panel.innerHTML = '<div class="k-head"><div><div class="k-eyebrow">Echipă</div><h2>' + esc(C.title) + '</h2></div><div class="k-head-actions" data-rghead></div></div>' +
      '<div data-rgbody><div class="k-skel" style="height:420px"></div></div>';
    panel.addEventListener('click', onClick);
    panel.addEventListener('change', onChange);
  }
  async function load() {
    try { S.d = await api({ action: 'get' }); paint(); }
    catch (err) { const b = panel && panel.querySelector('[data-rgbody]'); if (b) b.innerHTML = K.empty('alert', 'Nu am putut încărca ' + C.what, esc(K.errText(err))); }
  }
  const upBtn = () => '<label class="k-btn is-outline">' + icon('plus') + 'Versiune nouă<input type="file" accept="application/pdf,.pdf" data-rgup hidden></label>';
  function paint() {
    if (!panel || !S.d) return;
    const d = S.d, cur = d.current;
    panel.querySelector('[data-rghead]').innerHTML = (cur ? '<a class="k-btn is-outline" href="' + esc(cur.url) + '" download="' + C.file + '" data-pv-raw>' + icon('download') + 'Descarcă</a>' : '') + (boss() ? upBtn() : '');
    const body = panel.querySelector('[data-rgbody]');
    if (!cur) { body.innerHTML = '<section class="k-card">' + K.empty('book', C.Title + ' nu e încărcat' + (C.fem ? 'ă' : '') + ' încă', boss() ? 'Încarcă PDF-ul cu „Versiune nouă”.' : 'Apare aici imediat ce e încărcat.') + '</section>'; return; }
    // a repaint (her confirmation, a live refresh) keeps the pages already drawn; only the parts around them change
    const host = body.querySelector('[data-rgpages]');
    if (host && S.url === cur.url) {
      // only what changed (an open „Au confirmat” stays open through a live refresh)
      const put = (sel, html) => { const el = body.querySelector(sel); if (el && el.__h !== html) { el.innerHTML = html; el.__h = html; } };
      put('[data-rgwho]', boss() ? who() : '');
      put('[data-rgend]', ack());
      return;
    }
    const w = boss() ? who() : '', a = ack();
    body.innerHTML = '<div data-rgwho>' + w + '</div>' + meta(cur) +
      '<div class="rg-pages" data-rgpages><div class="rg-wait">Se deschide ' + C.what + '…</div></div><div data-rgend>' + a + '</div>';
    body.querySelector('[data-rgwho]').__h = w; body.querySelector('[data-rgend]').__h = a;
    draw(cur.url);
  }
  const meta = (cur) => '<p class="rg-meta" data-rgmeta>' + icon('file') + '<span>Versiunea ' + cur.n + ' · din ' + esc(when(cur.at)) + '</span></p>';
  // the text, page by page (portal-pdf.js); if it can't be drawn here, the file opens on its own
  async function draw(url) {
    const host = panel.querySelector('[data-rgpages]');
    if (!host) return;
    S.url = url;
    try {
      if (!window.C360Pdf || !window.C360Pdf.render) throw new Error('viewer');
      await window.C360Pdf.render(url, host);
    } catch (e) {
      if (host.isConnected) host.innerHTML = '<div class="rg-wait">' + C.Title + ' nu s-a putut afișa aici.<br><a class="k-btn is-outline is-sm" href="' + esc(url) + '" target="_blank" rel="noopener" data-pv-raw>Deschide PDF-ul</a></div>';
    }
  }
  // at the end of the text: her one confirmation (or when she gave it); nothing for the owner's own login
  function ack() {
    const me = S.d.me || {};
    if (me.must) return '<section class="rg-ack" data-rgack><p>' + C.ask + ' Confirmarea rămâne în portal, cu data.</p>' +
      '<button type="button" class="k-btn is-primary is-lg" data-rgok>' + icon('check') + C.ok + '</button></section>';
    if (me.at) return '<p class="rg-done">' + icon('checkCircle') + 'Ai confirmat pe ' + esc(whenHm(me.at)) + '.</p>';
    return '';
  }
  // the owner and the manager: who confirmed the version in force, who not yet, and the earlier versions
  function who() {
    const d = S.d, ppl = d.people || [], yes = ppl.filter((p) => p.at), no = ppl.filter((p) => !p.at);
    const pct = ppl.length ? Math.round(yes.length / ppl.length * 100) : 0;
    const row = (p) => '<li>' + K.avatar(p.name, 30) + '<span><b>' + esc(p.name) + '</b><small>' + esc([ROLE[p.role] || '', p.location].filter(Boolean).join(' · ')) + '</small></span>' +
      '<em>' + (p.at ? esc(whenHm(p.at)) : p.last ? 'a confirmat versiunea ' + p.last.n : 'încă nu') + '</em></li>';
    const old = (d.versions || []).slice(1);
    return '<section class="k-card rg-who"><div class="rg-who-h"><div class="lg-ring" style="--p:' + pct + '"><b>' + yes.length + '<small>/' + ppl.length + '</small></b></div>' +
        '<div><h3>Confirmări, versiunea ' + d.current.n + '</h3><p>' + (no.length ? K.plural(no.length, 'persoană n-a confirmat încă', 'persoane n-au confirmat încă') : 'Toată echipa a confirmat.') + '</p></div></div>' +
      (no.length ? '<h4 class="rg-h">Încă nu</h4><ul class="rg-people is-no">' + no.map(row).join('') + '</ul>' : '') +
      (yes.length ? '<details class="rg-more"' + (no.length ? '' : ' open') + '><summary>Au confirmat (' + yes.length + ')' + icon('down') + '</summary><ul class="rg-people">' + yes.map(row).join('') + '</ul></details>' : '') +
      (old.length ? '<details class="rg-more"><summary>Versiuni anterioare (' + old.length + ')' + icon('down') + '</summary><ul class="rg-vers">' +
        old.map((v) => '<li><a href="' + esc(v.url) + '" data-pdf-view data-pdf-title="' + esc(C.title) + ', versiunea ' + v.n + '">' + icon('file') + '<span><b>Versiunea ' + v.n + '</b><small>din ' + esc(when(v.at)) + ' · ' + esc(size(v.size)) + ' · ' + K.plural(v.confirmed, 'confirmare', 'confirmări') + '</small></span>' + icon('right') + '</a></li>').join('') +
      '</ul></details>' : '') + '</section>';
  }

  async function onClick(e) {
    const ok = e.target.closest('[data-rgok]');
    if (ok && !S.busy) {
      S.busy = true; ok.disabled = true;
      try {
        S.d = await api({ action: 'ack' });
        if (K.data && K.data[C.tab]) K.data[C.tab].must = false;
        K.badge(C.tab, 0);
        paint();
        K.ui().toast('Mulțumim. Confirmarea a fost salvată.', 'success');
      } catch (err) { ok.disabled = false; K.ui().toast(K.errText(err), 'error'); }
      finally { S.busy = false; }
    }
  }
  const asData = (file) => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(file); });
  async function onChange(e) {
    const up = e.target.closest('[data-rgup]');
    if (!up || !up.files || !up.files[0] || S.busy) return;
    const file = up.files[0]; up.value = '';
    if (!/pdf$/i.test(file.type) && !/\.pdf$/i.test(file.name)) { K.ui().toast('Se poate încărca doar un PDF.', 'error'); return; }
    if (file.size > 20 * 1024 * 1024) { K.ui().toast('Fișierul trece de 20 MB.', 'error'); return; }
    const n = S.d && S.d.current ? S.d.current.n + 1 : 1;
    if (!(await K.ui().confirm({ title: 'Încarci versiunea ' + n + '?', message: 'Toată echipa o vede de acum și confirmă din nou că a citit-o. Versiunile de dinainte rămân, cu data lor.', confirmText: 'Încarcă' }))) return;
    S.busy = true;
    try {
      const dataUrl = String(await asData(file)).replace(/^data:[^;]*;/, 'data:application/pdf;');
      S.d = await api({ action: 'upload', name: file.name.replace(/\.pdf$/i, ''), dataUrl });
      S.url = ''; paint();
      K.ui().toast('Versiunea ' + n + ' e încărcată.', 'success');
    } catch (err) { K.ui().toast(K.errText(err, (err.data && err.data.message) || 'Nu am putut încărca.'), 'error'); }
    finally { S.busy = false; }
  }

  K.on('remote', () => { if (panel && K.isActive(C.tab) && !S.busy) load(); });
  K.section(C.tab, { mount, show() { load(); } });
}
  make({ tab: 'regulament', doc: 'regulament', title: 'Regulament intern', Title: 'Regulamentul', what: 'regulamentul', fem: false, file: 'Regulament-intern-Centrul360.pdf',
    ask: 'Ai citit tot regulamentul?', ok: 'Am citit regulamentul' });
  make({ tab: 'fisapost', doc: 'fisa', title: 'Fișa postului', Title: 'Fișa postului', what: 'fișa postului', fem: true, file: 'Fisa-postului-Cosmetician-Centrul360.pdf',
    ask: 'Ai citit toată fișa postului?', ok: 'Am citit fișa postului' });
})();
