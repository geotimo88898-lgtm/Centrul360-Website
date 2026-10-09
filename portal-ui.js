// Centrul360 portal — interaction layer (pairs with portal-theme.css).
// Progressive enhancement: the portal keeps working if this file fails, except the dialogs,
// which portal.html calls through window.c360 (confirm / prompt / toast).
(function () {
  'use strict';
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(pointer: fine)').matches;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } },
  };

  // =====================================================================================
  // Toasts — replace window.alert() with non-blocking animated notifications.
  // =====================================================================================
  let toastHost;
  function toast(message, kind) {
    if (!toastHost) {
      toastHost = document.createElement('div');
      toastHost.className = 'c360-toasts';
      toastHost.setAttribute('role', 'status');
      toastHost.setAttribute('aria-live', 'polite');
      document.body.appendChild(toastHost);
    }
    const tone = kind || (/nu am putut|eroare|invalid/i.test(message) ? 'error' : 'info');
    const el = document.createElement('div');
    el.className = 'c360-toast is-' + tone;
    el.innerHTML = '<span class="c360-toast-dot"></span><span class="c360-toast-text">' + esc(message) + '</span>' +
      '<button class="c360-toast-x" aria-label="Închide">×</button>';
    toastHost.appendChild(el);
    const close = () => {
      el.classList.add('is-leaving');
      setTimeout(() => el.remove(), reduceMotion ? 0 : 220);
    };
    el.querySelector('.c360-toast-x').addEventListener('click', close);
    setTimeout(close, tone === 'error' ? 6000 : 3800);
  }
  window.alert = (msg) => toast(String(msg));

  // =====================================================================================
  // Dialogs — confirm / prompt as animated modals that return Promises.
  // =====================================================================================
  function dialog(opts) {
    return new Promise((resolve) => {
      const previous = document.activeElement;
      const root = document.createElement('div');
      root.className = 'c360-dialog-root';
      const field = opts.kind === 'prompt'
        ? (opts.options
          ? '<select class="c360-dialog-input" data-field>' + opts.options.map(([v, l]) =>
            '<option value="' + esc(v) + '"' + (String(opts.value) === String(v) ? ' selected' : '') + '>' + esc(l) + '</option>').join('') + '</select>'
          : opts.multiline
            ? '<textarea class="c360-dialog-input" data-field rows="4">' + esc(opts.value || '') + '</textarea>'
            : '<input class="c360-dialog-input" data-field type="' + (opts.type || 'text') + '" value="' + esc(opts.value || '') + '" autocomplete="off">')
        : '';
      root.innerHTML =
        '<div class="c360-dialog-backdrop" data-cancel></div>' +
        '<div class="c360-dialog" role="dialog" aria-modal="true" aria-labelledby="c360-dlg-title">' +
        (opts.danger ? '<div class="c360-dialog-icon is-danger"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg></div>' : '') +
        '<h3 class="c360-dialog-title" id="c360-dlg-title">' + esc(opts.title || 'Ești sigur?') + '</h3>' +
        (opts.message ? '<p class="c360-dialog-msg">' + esc(opts.message) + '</p>' : '') +
        (field ? '<label class="c360-dialog-label">' + (opts.label ? esc(opts.label) : '') + field + '</label>' : '') +
        '<div class="c360-dialog-actions">' +
        '<button type="button" class="c360-btn is-ghost" data-cancel>' + esc(opts.cancelText || 'Anulează') + '</button>' +
        '<button type="button" class="c360-btn ' + (opts.danger ? 'is-danger' : 'is-primary') + '" data-ok>' + esc(opts.confirmText || 'Confirmă') + '</button>' +
        '</div></div>';
      document.body.appendChild(root);
      document.documentElement.classList.add('c360-noscroll');
      const input = root.querySelector('[data-field]');
      if (input && input.tagName === 'SELECT') enhanceSelect(input);
      requestAnimationFrame(() => root.classList.add('is-open'));

      const finish = (ok) => {
        root.classList.remove('is-open');
        root.classList.add('is-closing');
        document.removeEventListener('keydown', onKey, true);
        document.documentElement.classList.remove('c360-noscroll');
        setTimeout(() => { root.remove(); if (previous && previous.focus) previous.focus(); }, reduceMotion ? 0 : 200);
        if (opts.kind === 'prompt') resolve(ok ? input.value : null);
        else resolve(!!ok);
      };
      const onKey = (e) => {
        if (e.key === 'Escape') { e.preventDefault(); finish(false); }
        else if (e.key === 'Enter' && !(input && input.tagName === 'TEXTAREA' && !e.ctrlKey && !e.metaKey)) {
          if (root.querySelector('.c360-select.is-open')) return; // let the dropdown take Enter
          e.preventDefault(); finish(true);
        } else if (e.key === 'Tab') {
          // keep focus inside the dialog
          const f = Array.from(root.querySelectorAll('button, input, textarea, [tabindex="0"]')).filter((x) => x.offsetParent !== null);
          if (!f.length) return;
          const first = f[0], last = f[f.length - 1];
          if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
          else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
      };
      document.addEventListener('keydown', onKey, true);
      root.querySelectorAll('[data-cancel]').forEach((b) => b.addEventListener('click', () => finish(false)));
      root.querySelector('[data-ok]').addEventListener('click', () => finish(true));
      setTimeout(() => {
        const target = input && input.tagName !== 'SELECT' ? input : root.querySelector(opts.danger ? '[data-cancel].c360-btn' : '[data-ok]');
        if (target) { target.focus(); if (target.select && input === target) target.select(); }
      }, 30);
    });
  }
  window.c360 = {
    toast,
    confirm: (opts) => dialog(Object.assign({ kind: 'confirm' }, typeof opts === 'string' ? { message: opts } : opts)),
    prompt: (opts) => dialog(Object.assign({ kind: 'prompt' }, typeof opts === 'string' ? { title: opts } : opts)),
  };

  // =====================================================================================
  // Custom dropdowns — every <select> gets an animated listbox; the native select stays the
  // source of truth (value, change events, form submit), so existing portal code is untouched.
  // =====================================================================================
  const enhanced = new WeakMap();
  const valueDesc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');
  const indexDesc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'selectedIndex');
  // Code that sets select.value directly fires no event — re-sync the custom label when it does.
  Object.defineProperty(HTMLSelectElement.prototype, 'value', {
    get() { return valueDesc.get.call(this); },
    set(v) { valueDesc.set.call(this, v); const s = enhanced.get(this); if (s) s.sync(); },
    configurable: true,
  });
  Object.defineProperty(HTMLSelectElement.prototype, 'selectedIndex', {
    get() { return indexDesc.get.call(this); },
    set(v) { indexDesc.set.call(this, v); const s = enhanced.get(this); if (s) s.sync(); },
    configurable: true,
  });

  let openSelect = null;
  function enhanceSelect(sel) {
    if (!finePointer || enhanced.has(sel) || sel.multiple || sel.size > 1 || sel.closest('.print-sheet')) return;
    const wrap = document.createElement('div');
    wrap.className = 'c360-select';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'c360-select-btn';
    btn.setAttribute('aria-haspopup', 'listbox');
    btn.setAttribute('aria-expanded', 'false');
    btn.innerHTML = '<span class="c360-select-label"></span><svg class="c360-select-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';
    const list = document.createElement('div');
    list.className = 'c360-select-list';
    list.setAttribute('role', 'listbox');
    sel.parentNode.insertBefore(wrap, sel);
    wrap.appendChild(sel);
    wrap.appendChild(btn);
    wrap.appendChild(list);
    sel.classList.add('c360-select-native');
    sel.tabIndex = -1;
    sel.setAttribute('aria-hidden', 'true');

    let active = -1;
    const options = () => Array.from(sel.options);
    function sync() {
      const o = sel.options[sel.selectedIndex];
      btn.querySelector('.c360-select-label').textContent = o ? o.textContent : '—';
      btn.disabled = sel.disabled;
      wrap.classList.toggle('is-placeholder', !o || o.value === '');
    }
    function render() {
      list.innerHTML = options().map((o, i) =>
        '<div class="c360-option' + (o.selected ? ' is-selected' : '') + (o.disabled ? ' is-disabled' : '') + '" role="option" data-i="' + i + '" aria-selected="' + o.selected + '">' +
        '<span>' + esc(o.textContent) + '</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5L20 7"/></svg></div>').join('');
    }
    function highlight(i) {
      const items = list.querySelectorAll('.c360-option');
      items.forEach((x) => x.classList.remove('is-active'));
      if (items[i]) { items[i].classList.add('is-active'); items[i].scrollIntoView({ block: 'nearest' }); }
      active = i;
    }
    function open() {
      if (openSelect && openSelect !== api) openSelect.close();
      render();
      const r = btn.getBoundingClientRect();
      wrap.classList.toggle('drop-up', window.innerHeight - r.bottom < 260 && r.top > 260);
      wrap.classList.add('is-open');
      btn.setAttribute('aria-expanded', 'true');
      highlight(sel.selectedIndex);
      openSelect = api;
    }
    function close() {
      wrap.classList.remove('is-open');
      btn.setAttribute('aria-expanded', 'false');
      if (openSelect === api) openSelect = null;
    }
    function choose(i) {
      const o = sel.options[i];
      if (!o || o.disabled) return;
      if (sel.selectedIndex !== i) {
        indexDesc.set.call(sel, i);
        sel.dispatchEvent(new Event('input', { bubbles: true }));
        sel.dispatchEvent(new Event('change', { bubbles: true }));
      }
      sync();
      close();
      btn.focus();
    }
    btn.addEventListener('click', () => (wrap.classList.contains('is-open') ? close() : open()));
    list.addEventListener('mousedown', (e) => e.preventDefault());
    list.addEventListener('click', (e) => { const it = e.target.closest('.c360-option'); if (it) choose(+it.dataset.i); });
    list.addEventListener('mousemove', (e) => { const it = e.target.closest('.c360-option'); if (it && +it.dataset.i !== active) highlight(+it.dataset.i); });
    let typed = '', typedAt = 0;
    btn.addEventListener('keydown', (e) => {
      const isOpen = wrap.classList.contains('is-open');
      const n = sel.options.length;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (!isOpen) { open(); return; }
        let i = active;
        do { i = (i + (e.key === 'ArrowDown' ? 1 : -1) + n) % n; } while (sel.options[i] && sel.options[i].disabled && i !== active);
        highlight(i);
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (isOpen) choose(active); else open();
      } else if (e.key === 'Escape' && isOpen) {
        e.preventDefault(); e.stopPropagation(); close();
      } else if (e.key === 'Tab' && isOpen) {
        close();
      } else if (e.key.length === 1) {
        const now = Date.now();
        typed = (now - typedAt > 700 ? '' : typed) + e.key.toLowerCase();
        typedAt = now;
        const i = options().findIndex((o) => o.textContent.trim().toLowerCase().startsWith(typed));
        if (i >= 0) { if (isOpen) highlight(i); else choose(i); }
      }
    });
    sel.addEventListener('change', sync);
    // Options are often rebuilt by the portal (innerHTML) — keep the label in step.
    new MutationObserver(() => { sync(); if (wrap.classList.contains('is-open')) render(); })
      .observe(sel, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'selected'] });
    const api = { sync, close };
    enhanced.set(sel, api);
    sync();
  }
  document.addEventListener('mousedown', (e) => {
    if (openSelect && !e.target.closest('.c360-select.is-open')) openSelect.close();
  });
  function enhanceAll(root) {
    (root || document).querySelectorAll('select').forEach(enhanceSelect);
  }

  // =====================================================================================
  // Sidebar: brand, gliding indicator, collapsible icon rail (Ctrl/Cmd + B), avatar.
  // =====================================================================================
  function mountBrand() {
    const brand = document.querySelector('header.topbar .brand');
    if (!brand || brand.dataset.c360) return;
    brand.dataset.c360 = '1';
    brand.innerHTML =
      '<button class="c360-rail-toggle" type="button" aria-label="Strânge meniul" title="Strânge meniul (Ctrl+B)">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9 4v16"/></svg></button>' +
      '<picture><source srcset="/brand_asset/portal/logo-white.png" media="(prefers-color-scheme: dark)">' +
      '<img class="brand-logo" src="/brand_asset/portal/logo-black.png" alt="Centrul360"></picture>' +
      '<span class="brand-sep"></span><span class="brand-sub">Admin</span>';
    brand.querySelector('.c360-rail-toggle').addEventListener('click', toggleRail);
  }

  // One coherent icon set (Lucide geometry, 1.75 stroke) — every section gets its own icon.
  const ICONS = {
    panou: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
    incasare: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
    comision: '<line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>',
    incasari: '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M14 8H8"/><path d="M16 12H8"/><path d="M13 16H8"/>',
    programari: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/>',
    pipeline: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M8 7v7M12 7v4M16 7v9"/>',
    automatizari: '<path d="M11 18H3M15 6H3M11 12H3"/><path d="m16 12 2 2 4-4M16 18l2 2 4-4"/>',
    resurse: '<path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/>',
    fise: '<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8" rx="1"/>',
    aprobari: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
    angajati: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    oferte: '<path d="M12.59 2.59A2 2 0 0 0 11.17 2H4a2 2 0 0 0-2 2v7.17a2 2 0 0 0 .59 1.42l8.7 8.7a2.43 2.43 0 0 0 3.42 0l6.58-6.58a2.43 2.43 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r="1"/>',
    setari: '<path d="M20 7h-9M14 17H5"/><circle cx="17" cy="17" r="3"/><circle cx="7" cy="7" r="3"/>',
    creative: '<path d="M9.94 15.5A2 2 0 0 0 8.5 14.06l-6.14-1.58a.5.5 0 0 1 0-.96L8.5 9.94A2 2 0 0 0 9.94 8.5l1.58-6.14a.5.5 0 0 1 .96 0L14.06 8.5A2 2 0 0 0 15.5 9.94l6.14 1.58a.5.5 0 0 1 0 .96L15.5 14.06a2 2 0 0 0-1.44 1.44l-1.58 6.14a.5.5 0 0 1-.96 0z"/><path d="M20 3v4M22 5h-4M4 17v2M5 18H3"/>',
  };
  const svgIcon = (inner) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">' + inner + '</svg>';

  let nav, indicator;
  function placeIndicator(instant) {
    if (!nav || !indicator) return;
    const active = nav.querySelector('button[data-tab].active');
    if (!active || active.offsetParent === null || window.innerWidth <= 720) { indicator.style.opacity = '0'; return; }
    if (instant || reduceMotion) indicator.style.transition = 'none';
    indicator.style.transform = 'translateY(' + active.offsetTop + 'px)';
    indicator.style.height = active.offsetHeight + 'px';
    indicator.style.opacity = '1';
    if (instant || reduceMotion) requestAnimationFrame(() => { indicator.style.transition = ''; });
  }
  function mountNav() {
    nav = document.getElementById('tabsNav');
    if (!nav || nav.querySelector('.c360-indicator')) return;
    // Wrap each label text in a span so it can fade when the rail collapses; use it as tooltip too.
    nav.querySelectorAll('button[data-tab]').forEach((b) => {
      const label = b.textContent.trim();
      b.setAttribute('data-label', label);
      const icon = ICONS[b.dataset.tab];
      const old = b.querySelector('svg');
      if (icon && old) old.outerHTML = svgIcon(icon);
      Array.from(b.childNodes).forEach((n) => {
        if (n.nodeType === 3 && n.textContent.trim()) {
          const s = document.createElement('span');
          s.className = 'c360-nav-label';
          s.textContent = n.textContent.trim();
          b.replaceChild(s, n);
        }
      });
    });
    indicator = document.createElement('span');
    indicator.className = 'c360-indicator';
    nav.prepend(indicator);
    nav.classList.add('has-indicator');
    new MutationObserver(() => { placeIndicator(false); updateTitle(); revealActiveChip(); })
      .observe(nav, { subtree: true, attributes: true, attributeFilter: ['class'] });
    window.addEventListener('resize', () => placeIndicator(true));
    placeIndicator(true);
  }
  function setRail(collapsed) {
    document.documentElement.classList.toggle('c360-rail', collapsed);
    store.set('c360_rail', collapsed ? '1' : '0');
    const t = document.querySelector('.c360-rail-toggle');
    if (t) t.setAttribute('aria-label', collapsed ? 'Extinde meniul' : 'Strânge meniul');
    setTimeout(() => placeIndicator(true), reduceMotion ? 0 : 320);
  }
  function toggleRail() { setRail(!document.documentElement.classList.contains('c360-rail')); }
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'b' && window.innerWidth > 720) {
      e.preventDefault(); toggleRail();
    }
  });

  function mountAvatar() {
    const who = document.querySelector('header.topbar .who');
    const nameEl = document.getElementById('whoName');
    if (!who || !nameEl || document.querySelector('.c360-avatar')) return;
    const av = document.createElement('span');
    av.className = 'c360-avatar';
    who.parentNode.insertBefore(av, who.nextSibling);
    const paint = () => {
      const n = nameEl.textContent.trim();
      av.textContent = n ? n.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase() : '';
      av.style.display = n ? '' : 'none';
    };
    new MutationObserver(paint).observe(nameEl, { childList: true, characterData: true, subtree: true });
    paint();
  }

  function revealActiveChip() {
    if (window.innerWidth > 720 || !nav) return;
    const active = nav.querySelector('button[data-tab].active');
    if (active) active.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', inline: 'center', block: 'nearest' });
  }
  function updateTitle() {
    const active = nav && nav.querySelector('button[data-tab].active');
    const label = active ? (active.getAttribute('data-label') || active.textContent).trim() : '';
    document.title = (label ? label + ' · ' : '') + 'Centrul360 Admin';
  }

  // =====================================================================================
  // Count-up: dashboard numbers roll up to their value when the Panou is shown.
  // =====================================================================================
  function countUp(el) {
    const text = el.textContent;
    const m = text.match(/-?\d[\d.\s]*(?:,\d+)?/);
    if (!m || reduceMotion) return;
    const target = parseFloat(m[0].replace(/[.\s]/g, '').replace(',', '.'));
    if (!isFinite(target) || target === 0) return;
    const decimals = (m[0].split(',')[1] || '').length;
    const fmt = (v) => v.toLocaleString('ro-RO', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    const t0 = performance.now(), dur = 1100;
    const step = (now) => {
      const p = Math.min(1, (now - t0) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = text.replace(m[0], fmt(target * eased));
      if (p < 1) requestAnimationFrame(step); else el.textContent = text;
    };
    requestAnimationFrame(step);
  }
  function animatePanou() {
    const panel = document.getElementById('panel-panou');
    if (!panel || !panel.classList.contains('active')) return;
    panel.querySelectorAll('#companyGoalCurrent, #panouApptTally b, #panouApptTally strong, #panouApptTally [style*="font-size"], .lb-count')
      .forEach(countUp);
  }

  // =====================================================================================
  // Command palette (Ctrl/Cmd + K): jump to any section or run an action by typing.
  // =====================================================================================
  function paletteItems() {
    const items = [];
    if (nav) nav.querySelectorAll('button[data-tab]').forEach((b) => {
      if (b.classList.contains('hidden') || getComputedStyle(b).display === 'none') return;
      const label = b.getAttribute('data-label') || b.textContent.trim();
      items.push({ group: 'Mergi la', label, icon: ICONS[b.dataset.tab] || ICONS.panou, run: () => b.click() });
    });
    const creative = nav && nav.querySelector('button[data-tab="creative"]:not(.hidden)');
    if (creative) items.push({ group: 'Acțiuni', label: 'Comandă creative noi', icon: ICONS.creative, run: () => creative.click() });
    items.push({ group: 'Acțiuni', label: document.documentElement.classList.contains('c360-rail') ? 'Extinde meniul' : 'Strânge meniul',
      icon: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9 4v16"/>', hint: 'Ctrl B', run: toggleRail });
    items.push({ group: 'Acțiuni', label: 'Reîncarcă datele', icon: '<path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5"/>', run: () => location.reload() });
    // Sections can contribute their own entries (portal-pipeline.js adds "Lead nou" and every lead by name).
    (window.c360PaletteProviders || []).forEach((fn) => { try { items.push(...fn()); } catch (e) { /* a broken provider must not kill Ctrl+K */ } });
    const logout = document.getElementById('logoutBtn');
    if (logout) items.push({ group: 'Cont', label: 'Deconectare', icon: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>', run: () => logout.click() });
    return items;
  }
  function openPalette() {
    if (document.querySelector('.c360-palette-root')) return;
    const all = paletteItems();
    const root = document.createElement('div');
    root.className = 'c360-palette-root';
    root.innerHTML =
      '<div class="c360-dialog-backdrop" data-close></div>' +
      '<div class="c360-palette" role="dialog" aria-modal="true" aria-label="Paletă de comenzi">' +
      '<div class="c360-palette-search">' + svgIcon('<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>') +
      '<input type="text" placeholder="Caută o secțiune sau o acțiune…" autocomplete="off" spellcheck="false"><kbd>Esc</kbd></div>' +
      '<div class="c360-palette-list" role="listbox"></div></div>';
    document.body.appendChild(root);
    const input = root.querySelector('input');
    const list = root.querySelector('.c360-palette-list');
    let shown = all, active = 0;
    const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    function render() {
      const q = norm(input.value.trim());
      // Forgiving match: substring first, then letters-in-order (so "incasare" still finds "Încasează").
      const fuzzy = (text) => { let k = 0; for (const ch of text) if (ch === q[k]) k++; return k >= Math.min(q.length, Math.max(3, q.length - 2)); };
      shown = q ? all.filter((i) => norm(i.label).includes(q) || norm(i.group).includes(q))
        .concat(all.filter((i) => !norm(i.label).includes(q) && !norm(i.group).includes(q) && fuzzy(norm(i.label)))).slice(0, 40)
        : all.filter((i) => i.group !== 'Leaduri'); // lead names only show up once you type
      active = Math.min(active, Math.max(0, shown.length - 1));
      let html = '', group = '';
      shown.forEach((it, i) => {
        if (it.group !== group) { group = it.group; html += '<div class="c360-palette-group">' + esc(group) + '</div>'; }
        html += '<div class="c360-palette-item' + (i === active ? ' is-active' : '') + '" data-i="' + i + '" role="option">' +
          svgIcon(it.icon) + '<span>' + esc(it.label) + '</span>' + (it.hint ? '<kbd>' + esc(it.hint) + '</kbd>' : '') + '</div>';
      });
      list.innerHTML = html || '<div class="c360-palette-empty">Nimic găsit pentru „' + esc(input.value) + '”</div>';
    }
    const close = () => {
      root.classList.remove('is-open');
      setTimeout(() => root.remove(), reduceMotion ? 0 : 180);
      document.removeEventListener('keydown', onKey, true);
    };
    const run = (i) => { const it = shown[i]; if (!it) return; close(); setTimeout(it.run, 60); };
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); active = (active + 1) % Math.max(1, shown.length); render(); list.querySelector('.is-active')?.scrollIntoView({ block: 'nearest' }); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); active = (active - 1 + shown.length) % Math.max(1, shown.length); render(); list.querySelector('.is-active')?.scrollIntoView({ block: 'nearest' }); }
      else if (e.key === 'Enter') { e.preventDefault(); run(active); }
    };
    document.addEventListener('keydown', onKey, true);
    input.addEventListener('input', () => { active = 0; render(); });
    list.addEventListener('click', (e) => { const it = e.target.closest('.c360-palette-item'); if (it) run(+it.dataset.i); });
    list.addEventListener('mousemove', (e) => { const it = e.target.closest('.c360-palette-item'); if (it && +it.dataset.i !== active) { active = +it.dataset.i; render(); } });
    root.querySelector('[data-close]').addEventListener('click', close);
    render();
    input.focus(); // immediately, so keystrokes right after Ctrl+K are not lost
    requestAnimationFrame(() => root.classList.add('is-open'));
  }
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); }
  });
  function mountSearchButton() {
    const right = document.querySelector('header.topbar > div:last-child');
    if (!right || document.querySelector('.c360-search-btn')) return;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'c360-search-btn';
    b.innerHTML = svgIcon('<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>') + '<span>Caută</span><kbd>Ctrl K</kbd>';
    b.addEventListener('click', openPalette);
    right.insertBefore(b, right.firstChild);
  }

  // ---- connection status ----
  window.addEventListener('offline', () => toast('Ești offline. Modificările nu se salvează până revine conexiunea.', 'error'));
  window.addEventListener('online', () => toast('Conexiunea a revenit.', 'success'));

  // =====================================================================================
  // App entrance, busy buttons, boot.
  // =====================================================================================
  function watchAppReveal() {
    const app = document.getElementById('app');
    if (!app) return;
    const reveal = () => {
      if (app.classList.contains('hidden')) return false;
      app.classList.add('c360-enter');
      placeIndicator(true);
      updateTitle();
      enhanceAll(app);
      setTimeout(animatePanou, 80);
      return true;
    };
    if (reveal()) return;
    const mo = new MutationObserver(() => { if (reveal()) mo.disconnect(); });
    mo.observe(app, { attributes: true, attributeFilter: ['class'] });
  }
  function wireBusyButtons() {
    document.addEventListener('submit', (e) => {
      const btn = e.target.querySelector('button[type=submit].pill, button.pill:not([type])');
      if (!btn) return;
      btn.classList.add('is-busy');
      setTimeout(() => btn.classList.remove('is-busy'), 1500);
    }, true);
  }

  function init() {
    if (store.get('c360_rail') === '1' && window.innerWidth > 720) document.documentElement.classList.add('c360-rail');
    mountBrand();
    mountNav();
    mountAvatar();
    mountSearchButton();
    watchAppReveal();
    wireBusyButtons();
    updateTitle();
    enhanceAll(document);
    // Selects are created all the time by the portal (edit rows, forms) — enhance them as they appear.
    new MutationObserver((muts) => {
      for (const m of muts) m.addedNodes.forEach((n) => {
        if (n.nodeType !== 1) return;
        if (n.tagName === 'SELECT') enhanceSelect(n); else if (n.querySelectorAll) enhanceAll(n);
      });
    }).observe(document.body, { childList: true, subtree: true });
    if (nav) nav.addEventListener('click', (e) => { if (e.target.closest('button[data-tab="panou"]')) setTimeout(animatePanou, 60); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => placeIndicator(true));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
