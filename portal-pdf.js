// Centrul360 portal, PDFs inside the app (the owner, 5.11: "când deschid un PDF nu mai pot să-l închid sau să revin"):
// a PDF the portal links to (forms, guides, a leave's PDF, a file on a client's sheet) opens over the page, drawn by
// pdf.js page by page, with "Înapoi" on top (and the phone's back button) to return where she was, and "Descarcă".
// Works the same in the browser, the installed app and the phone app, where a PDF used to replace the whole window.
(function () {
  'use strict';
  const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
  const WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  const CSS = `
  .pv-root{ position:fixed; inset:0; z-index:400; display:flex; flex-direction:column; background:rgba(10,10,14,.96); -webkit-backdrop-filter:blur(8px); backdrop-filter:blur(8px); }
  .pv-bar{ display:flex; align-items:center; gap:.6rem; padding:calc(.6rem + env(safe-area-inset-top)) .8rem .6rem; border-bottom:1px solid rgba(255,255,255,.1); color:#f5f4f2; font-family:inherit; }
  .pv-bar b{ flex:1; min-width:0; font-size:.92rem; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .pv-btn{ display:inline-flex; align-items:center; gap:.4rem; height:38px; padding:0 .9rem; border-radius:999px; border:1px solid rgba(255,255,255,.14); background:rgba(255,255,255,.08); color:#f5f4f2; font:inherit; font-size:.86rem; font-weight:600; cursor:pointer; text-decoration:none; }
  .pv-btn:hover{ background:rgba(255,255,255,.15); }
  .pv-pages{ flex:1; overflow:auto; -webkit-overflow-scrolling:touch; padding:1rem .6rem calc(1.5rem + env(safe-area-inset-bottom)); display:flex; flex-direction:column; align-items:center; gap:.8rem; }
  .pv-pages canvas{ max-width:100%; height:auto !important; background:#fff; border-radius:6px; box-shadow:0 10px 30px -12px rgba(0,0,0,.8); }
  .pv-msg{ margin:auto; color:rgba(245,244,242,.7); font-size:.9rem; text-align:center; line-height:1.6; }`;
  let root = null, pushed = false;

  function loadLib() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    return new Promise((ok, no) => {
      const s = document.createElement('script'); s.src = PDFJS; s.async = true;
      s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = WORKER; ok(window.pdfjsLib); };
      s.onerror = () => no(new Error('pdf.js'));
      document.head.appendChild(s);
    });
  }
  function close(fromHistory) {
    if (!root) return;
    root.remove(); root = null;
    document.documentElement.style.overflow = '';
    if (pushed && !fromHistory) { pushed = false; try { history.back(); } catch (e) { /* none */ } }
    pushed = false;
  }
  window.addEventListener('popstate', () => { if (root) close(true); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && root) close(); });

  async function view(url, title) {
    if (!document.getElementById('pv-css')) { const st = document.createElement('style'); st.id = 'pv-css'; st.textContent = CSS; document.head.appendChild(st); }
    close(true);
    root = document.createElement('div');
    root.className = 'pv-root'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true');
    const esc = (s) => String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    root.innerHTML = '<div class="pv-bar"><button type="button" class="pv-btn" data-pv-close>← Înapoi</button><b>' + esc(title || 'Document') + '</b>' +
      '<a class="pv-btn" href="' + esc(url) + '" download data-pv-raw>Descarcă</a></div><div class="pv-pages"><div class="pv-msg">Se deschide documentul…</div></div>';
    document.body.appendChild(root);
    document.documentElement.style.overflow = 'hidden';
    root.querySelector('[data-pv-close]').addEventListener('click', () => close());
    try { history.pushState({ pv: 1 }, '', location.href); pushed = true; } catch (e) { /* no history */ }
    const pages = root.querySelector('.pv-pages');
    const me = root;
    try {
      const lib = await loadLib();
      const doc = await lib.getDocument({ url, withCredentials: true }).promise;
      if (root !== me) return;
      pages.innerHTML = '';
      const ratio = Math.min(2, window.devicePixelRatio || 1);
      const width = Math.min(pages.clientWidth - 12, 900);
      for (let n = 1; n <= doc.numPages; n++) {
        if (root !== me) return;
        const page = await doc.getPage(n);
        const base = page.getViewport({ scale: 1 });
        const vp = page.getViewport({ scale: (width / base.width) * ratio });
        const c = document.createElement('canvas');
        c.width = vp.width; c.height = vp.height; c.style.width = (vp.width / ratio) + 'px';
        pages.appendChild(c);
        await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
      }
    } catch (e) {
      if (root === me) pages.innerHTML = '<div class="pv-msg">Documentul nu s-a putut afișa aici.<br><a class="pv-btn" style="margin-top:12px" href="' + esc(url) + '" target="_blank" rel="noopener">Deschide-l separat</a></div>';
    }
  }

  // every PDF link of the portal opens here (unless it is the viewer's own Descarcă, or a modified click)
  const isPdf = (a) => {
    const h = a.getAttribute('href') || '';
    return a.hasAttribute('data-pdf-view') || /\.pdf(\?|#|$)/i.test(h) || /\/api\/portal-leave-pdf/.test(h);
  };
  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button > 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
    const a = e.target.closest('a[href]');
    if (!a || a.hasAttribute('data-pv-raw') || a.hasAttribute('download') || !isPdf(a)) return;
    e.preventDefault();
    view(a.href, a.getAttribute('data-pdf-title') || a.getAttribute('title') || (a.textContent || '').trim() || 'Document');
  }, true);
  window.C360Pdf = { view, close };
})();
