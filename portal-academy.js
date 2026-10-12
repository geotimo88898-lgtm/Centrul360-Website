// Centrul360 portal — "Traininguri": the team's manuals (sales, booking, treatment room). Each
// chapter is a card: read it here, or download it as a branded PDF; the whole manual downloads as
// one PDF too. The owner edits any chapter in place. Content: api/_lib/academy.js (first version),
// saved edits live in config.academy (api/portal-config.js).
(function () {
  'use strict';
  const K = window.K;
  const { esc, icon } = K;

  const A = { manual: '' };
  let panel;

  // ------------------------------------------------------------------ body → html
  // "## " sub-heading · "- " bullet · "1. " step · "> " what to say · "! " rule · else paragraph
  function bodyHtml(lines) {
    let out = '', list = '';
    const close = () => { if (list) { out += '</' + list + '>'; list = ''; } };
    const open = (tag) => { if (list !== tag) { close(); out += '<' + tag + '>'; list = tag; } };
    (lines || []).forEach((raw) => {
      const l = String(raw);
      let m;
      if (l.indexOf('## ') === 0) { close(); out += '<h5>' + esc(l.slice(3)) + '</h5>'; }
      else if (l.indexOf('- ') === 0) { open('ul'); out += '<li>' + esc(l.slice(2)) + '</li>'; }
      else if ((m = /^(\d+)\.\s+(.*)$/.exec(l))) { open('ol'); out += '<li>' + esc(m[2]) + '</li>'; }
      else if (l.indexOf('> ') === 0) { close(); out += '<blockquote class="ac-say">' + esc(l.slice(2)) + '</blockquote>'; }
      else if (l.indexOf('! ') === 0) { close(); out += '<p class="ac-rule">' + esc(l.slice(2)) + '</p>'; }
      else { close(); out += '<p>' + esc(l) + '</p>'; }
    });
    close();
    return out;
  }

  const manuals = () => ((K.data && K.data.academy && K.data.academy.manuals) || []);
  const current = () => manuals().find((m) => m.id === A.manual) || manuals()[0];
  const num = (i) => String(i + 1).padStart(2, '0');

  // ------------------------------------------------------------------ PDF (html2pdf, loaded on first use)
  // Rendered by the browser, so Romanian diacritics come out exactly as on screen.
  let libP = null;
  function lib() {
    if (window.html2pdf) return Promise.resolve(window.html2pdf);
    if (!libP) libP = new Promise((ok, fail) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
      s.onload = () => ok(window.html2pdf); s.onerror = () => { libP = null; fail(new Error('pdf_lib')); };
      document.head.appendChild(s);
    });
    return libP;
  }
  const fileSafe = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-');

  function chapterDoc(m, c, i) {
    return '<section class="pdf-ch">' +
      '<div class="pdf-kicker">' + esc(m.title) + ' · Capitolul ' + num(i) + '</div>' +
      '<h2>' + esc(c.title) + '</h2>' + (c.summary ? '<p class="pdf-sum">' + esc(c.summary) + '</p>' : '') +
      '<div class="pdf-body">' + bodyHtml(c.body) + '</div></section>';
  }
  function docShell(inner) {
    return '<div class="pdf-doc"><header class="pdf-brand"><img src="/brand_asset/logo-mark.png" alt=""><b>CENTRUL360</b><span>Uz intern</span></header>' + inner + '</div>';
  }
  async function downloadPdf(m, chapterIndex, btn) {
    const one = chapterIndex != null;
    const inner = one ? chapterDoc(m, m.chapters[chapterIndex], chapterIndex)
      : '<section class="pdf-cover"><div class="pdf-kicker">Centrul360 · Training</div><h1>' + esc(m.title) + '</h1><p>' + esc(m.lede || '') + '</p>' +
        '<ol class="pdf-toc">' + m.chapters.map((c, i) => '<li><b>' + num(i) + '</b> ' + esc(c.title) + '</li>').join('') + '</ol></section>' +
        m.chapters.map((c, i) => '<div class="html2pdf__page-break"></div>' + chapterDoc(m, c, i)).join('');
    const host = document.createElement('div');
    host.className = 'pdf-host';
    host.innerHTML = docShell(inner);
    document.body.appendChild(host);
    const name = fileSafe(m.title) + (one ? '-' + num(chapterIndex) + '-' + fileSafe(m.chapters[chapterIndex].title) : '') + '.pdf';
    const run = async () => {
      try {
        const h2p = await lib();
        await h2p().set({
          margin: [12, 12, 14, 12], filename: name,
          image: { type: 'jpeg', quality: 0.95 },
          html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
          pagebreak: { mode: ['css', 'legacy'], avoid: ['li', 'blockquote', '.ac-rule', 'h5', '.pdf-sum'] },
        }).from(host.firstChild).save();
      } catch (err) {
        K.ui().toast('Nu am putut face PDF-ul. Verifică internetul și reîncearcă.', 'error');
      } finally { host.remove(); }
    };
    return btn ? K.busy(btn, run) : run();
  }

  // ------------------------------------------------------------------ section
  function mount(p) {
    panel = p;
    panel.classList.add('k-panel', 'ac');
    panel.innerHTML =
      '<div class="k-head"><div><div class="k-eyebrow">Echipă</div><h2>Traininguri</h2>' +
      '<p class="k-lede">Tot ce trebuie să știi ca să vinzi, să programezi și să lucrezi în cabină. Citește aici sau descarcă orice capitol ca PDF.</p></div></div>' +
      '<div class="ac-manuals" data-manuals></div><div data-manual></div>';
    panel.addEventListener('click', onClick);
  }
  function render() {
    if (!panel || !K.data) return;
    const all = manuals();
    if (!all.length) { panel.querySelector('[data-manual]').innerHTML = K.empty('book', 'Niciun training încă', ''); return; }
    const m = current();
    A.manual = m.id;
    panel.querySelector('[data-manuals]').innerHTML = all.map((x) =>
      '<button type="button" class="ac-mcard' + (x.id === m.id ? ' is-on' : '') + '" data-m="' + esc(x.id) + '"><span class="k-icon-chip is-accent">' + icon(x.icon || 'book') + '</span>' +
      '<div><b>' + esc(x.title) + '</b><span>' + x.chapters.length + ' capitole</span></div></button>').join('');
    panel.querySelector('[data-manual]').innerHTML =
      '<div class="ac-head"><div><h3>' + esc(m.title) + '</h3><p>' + esc(m.lede || '') + '</p></div><div class="ac-head-actions">' +
      (K.data.isAdmin ? '<button type="button" class="k-btn is-outline is-sm" data-edit>' + icon('pen') + 'Editează</button>' : '') +
      '<button type="button" class="k-btn is-primary is-sm" data-pdf-all>' + icon('download') + 'Descarcă tot manualul (PDF)</button></div></div>' +
      '<div class="ac-grid">' + m.chapters.map((c, i) =>
        '<article class="ac-ch" style="animation-delay:' + (i * 0.03).toFixed(2) + 's"><div class="ac-num">' + num(i) + '</div>' +
        '<h4>' + esc(c.title) + '</h4><p>' + esc(c.summary || '') + '</p>' +
        '<footer><button type="button" class="k-btn is-outline is-sm" data-read="' + i + '">' + icon('book') + 'Citește</button>' +
        '<button type="button" class="k-btn is-sm" data-pdf="' + i + '">' + icon('download') + 'Descarcă PDF</button></footer></article>').join('') + '</div>';
  }

  function read(i) {
    const m = current(), c = m.chapters[i];
    const d = K.drawer({
      title: c.title, icon: 'book', width: 720, subtitle: m.title + ' · Capitolul ' + num(i),
      body: '<div class="ac-read">' + (c.summary ? '<p class="ac-sum">' + esc(c.summary) + '</p>' : '') + bodyHtml(c.body) + '</div>',
      footer: (i > 0 ? '<button type="button" class="k-btn" data-prev>' + icon('left') + 'Înapoi</button>' : '') + '<span class="k-grow"></span>' +
        '<button type="button" class="k-btn is-outline" data-pdf>' + icon('download') + 'Descarcă PDF</button>' +
        (i < m.chapters.length - 1 ? '<button type="button" class="k-btn is-primary" data-next>Capitolul următor' + icon('right') + '</button>' : ''),
      onMount(el) {
        el.querySelector('[data-pdf]').addEventListener('click', (ev) => downloadPdf(m, i, ev.currentTarget));
        const nx = el.querySelector('[data-next]'), pv = el.querySelector('[data-prev]');
        if (nx) nx.addEventListener('click', () => { d.close(); setTimeout(() => read(i + 1), 180); });
        if (pv) pv.addEventListener('click', () => { d.close(); setTimeout(() => read(i - 1), 180); });
      },
    });
  }

  function edit() {
    const m = current();
    let list = JSON.parse(JSON.stringify(m.chapters));
    const d = K.drawer({
      title: 'Editează · ' + m.title, icon: 'pen', width: 760,
      subtitle: 'Pe fiecare rând: „## ” subtitlu · „- ” listă · „1. ” pas · „> ” ce spune fata · „! ” regulă importantă · restul e text.',
      body: '<div data-chs></div><button type="button" class="k-btn is-outline rs-add" data-add>' + icon('plus') + 'Adaugă capitol</button>',
      footer: '<span class="k-grow k-muted">Se vede imediat la toată echipa.</span><button type="button" class="k-btn" data-cancel>Renunță</button><button type="button" class="k-btn is-primary" data-save>' + icon('check') + 'Salvează</button>',
      onMount(el) {
        const box = el.querySelector('[data-chs]');
        const readForm = () => box.querySelectorAll('[data-i]').forEach((row) => {
          const x = list[+row.dataset.i];
          x.title = row.querySelector('[data-f="title"]').value;
          x.summary = row.querySelector('[data-f="summary"]').value;
          x.body = row.querySelector('[data-f="body"]').value.split('\n').map((s) => s.trim()).filter(Boolean);
        });
        const paint = () => {
          box.innerHTML = list.map((x, i) => '<div class="rs-ed" data-i="' + i + '"><div class="rs-ed-head"><b class="ac-num is-sm">' + num(i) + '</b>' +
            '<input data-f="title" value="' + esc(x.title) + '" placeholder="Titlul capitolului">' +
            '<button type="button" class="k-icon-btn" data-up="' + i + '"' + (i ? '' : ' disabled') + '>' + icon('up') + '</button><button type="button" class="k-icon-btn" data-down="' + i + '"' + (i < list.length - 1 ? '' : ' disabled') + '>' + icon('down') + '</button>' +
            '<button type="button" class="k-icon-btn" data-rm="' + i + '">' + icon('trash') + '</button></div>' +
            '<input data-f="summary" value="' + esc(x.summary || '') + '" placeholder="Pe scurt, despre ce e capitolul">' +
            '<textarea data-f="body" rows="' + Math.min(24, Math.max(6, x.body.length + 2)) + '" placeholder="Conținutul, un rând pe linie">' + esc(x.body.join('\n')) + '</textarea></div>').join('');
        };
        paint();
        el.addEventListener('click', (ev) => {
          const b = ev.target.closest('[data-up],[data-down],[data-rm],[data-add]');
          if (!b) return;
          readForm();
          if (b.hasAttribute('data-add')) list.push({ id: '', title: '', summary: '', body: [] });
          if (b.dataset.up) { const i = +b.dataset.up; [list[i - 1], list[i]] = [list[i], list[i - 1]]; }
          if (b.dataset.down) { const i = +b.dataset.down; [list[i + 1], list[i]] = [list[i], list[i + 1]]; }
          if (b.dataset.rm) list.splice(+b.dataset.rm, 1);
          paint();
        });
        el.querySelector('[data-cancel]').addEventListener('click', () => d.close());
        el.querySelector('[data-save]').addEventListener('click', (ev) => K.busy(ev.currentTarget, async () => {
          readForm();
          const clean = list.filter((x) => x.title.trim() || x.body.length);
          try { await K.api('/api/portal-config', { academy: { manualId: m.id, chapters: clean } }); d.close(); K.ui().toast('Salvat.', 'success'); K.reload(); }
          catch (err) { K.ui().toast(K.errText(err), 'error'); }
        }));
      },
    });
  }

  function onClick(e) {
    const t = e.target;
    const mb = t.closest('[data-m]');
    if (mb) { A.manual = mb.dataset.m; return render(); }
    const rd = t.closest('[data-read]');
    if (rd) return read(+rd.dataset.read);
    const pdf = t.closest('[data-pdf]');
    if (pdf) return downloadPdf(current(), +pdf.dataset.pdf, pdf);
    const all = t.closest('[data-pdf-all]');
    if (all) return downloadPdf(current(), null, all);
    if (t.closest('[data-edit]')) return edit();
  }

  // ------------------------------------------------------------------ styles
  const css = `
.ac-manuals{ display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:.7rem; margin-bottom:1.3rem; }
.ac-mcard{ display:flex; align-items:center; gap:.75rem; text-align:left; padding:.85rem 1rem; border-radius:16px; background:var(--paper); border:1px solid var(--line); cursor:pointer; color:inherit; font:inherit; transition:border-color .2s ease, transform .2s ease; }
.ac-mcard:hover{ transform:translateY(-1px); }
.ac-mcard.is-on{ border-color:var(--accent, #6a4dff); box-shadow:0 0 0 1px var(--accent, #6a4dff) inset; }
.ac-mcard b{ display:block; font-size:.95rem; } .ac-mcard span{ font-size:.78rem; color:var(--muted); }
.ac-head{ display:flex; flex-wrap:wrap; align-items:flex-end; justify-content:space-between; gap:.8rem; margin-bottom:1rem; }
.ac-head h3{ margin:0 0 .2rem; font-size:1.25rem; } .ac-head p{ margin:0; color:var(--muted); max-width:46rem; font-size:.9rem; }
.ac-head-actions{ display:flex; gap:.5rem; flex-wrap:wrap; }
.ac-grid{ display:grid; grid-template-columns:repeat(auto-fill,minmax(260px,1fr)); gap:.8rem; }
.ac-ch{ display:flex; flex-direction:column; gap:.45rem; padding:1rem 1.05rem; border-radius:16px; background:var(--paper); border:1px solid var(--line); box-shadow:var(--shadow-sm); animation:k-rise .4s var(--ease) both; }
.ac-ch h4{ margin:0; font-size:1rem; line-height:1.3; } .ac-ch p{ margin:0; color:var(--muted); font-size:.85rem; line-height:1.5; flex:1; }
.ac-ch footer{ display:flex; gap:.45rem; flex-wrap:wrap; margin-top:.35rem; }
.ac-num{ font-size:.72rem; font-weight:700; letter-spacing:.12em; color:var(--accent, #6a4dff); }
.ac-num.is-sm{ min-width:1.6rem; }
.ac-read{ font-size:.93rem; line-height:1.6; }
.ac-read h5{ margin:1.2rem 0 .4rem; font-size:.95rem; }
.ac-read ul, .ac-read ol{ margin:.3rem 0 .6rem; padding-left:1.25rem; } .ac-read li{ margin:.25rem 0; }
.ac-sum{ color:var(--muted); }
.ac-say{ margin:.5rem 0; padding:.6rem .85rem; border-left:3px solid var(--accent, #6a4dff); background:var(--glass); border-radius:0 10px 10px 0; font-style:italic; }
.ac-rule{ margin:.6rem 0; padding:.6rem .85rem; border-radius:10px; background:rgba(234,88,12,.12); border:1px solid rgba(234,88,12,.35); font-weight:600; }
.pdf-host{ position:fixed; left:-10000px; top:0; }
.pdf-doc{ width:180mm; background:#fff; color:#17171c; font-family:Inter, system-ui, -apple-system, 'Segoe UI', Arial, sans-serif; font-size:11pt; line-height:1.55; }
.pdf-brand{ display:flex; align-items:center; gap:8px; padding-bottom:8px; margin-bottom:14px; border-bottom:1px solid #e3e3ea; }
.pdf-brand img{ width:22px; height:22px; } .pdf-brand b{ letter-spacing:.08em; font-size:10pt; } .pdf-brand span{ margin-left:auto; padding-right:2px; font-size:8pt; color:#8a8a96; white-space:nowrap; }
.pdf-kicker{ font-size:8pt; font-weight:700; letter-spacing:.14em; text-transform:uppercase; color:#6a4dff; margin-bottom:4px; }
.pdf-doc h1{ font-size:26pt; margin:6px 0 10px; } .pdf-doc h2{ font-size:17pt; margin:0 0 6px; }
.pdf-cover p{ color:#55555f; font-size:12pt; } .pdf-toc{ list-style:none; padding:0; margin:22px 0 0; } .pdf-toc li{ padding:6px 0; border-bottom:1px solid #eee; } .pdf-toc b{ color:#6a4dff; margin-right:8px; }
.pdf-sum{ color:#55555f; margin:0 0 10px; }
.pdf-body h5{ font-size:11.5pt; margin:14px 0 4px; } .pdf-body p{ margin:6px 0; } .pdf-body ul, .pdf-body ol{ margin:4px 0 8px; padding-left:18px; } .pdf-body li{ margin:3px 0; }
.pdf-body .ac-say{ margin:6px 0; padding:7px 10px; border-left:3px solid #6a4dff; background:#f3f1ff; border-radius:0 8px 8px 0; font-style:italic; }
.pdf-body .ac-rule{ margin:8px 0; padding:7px 10px; border-radius:8px; background:#fff3eb; border:1px solid #f6c3a2; font-weight:600; }
@media (max-width:640px){ .ac-head-actions .k-btn{ flex:1; } .ac-grid{ grid-template-columns:1fr; } }
`;
  const st = document.createElement('style');
  st.textContent = css;
  document.head.appendChild(st);

  K.section('traininguri', { mount, show: render, data() { if (panel && K.isActive('traininguri')) render(); } });
})();
