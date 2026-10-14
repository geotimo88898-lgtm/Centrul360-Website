// Centrul360 portal, accent colour (avatar menu → "Culoare accent").
// Any colour or two-colour gradient works: the picked colour is tuned in OKLCH so it stays visible on
// the dark theme (lightness kept between 0.64 and 0.86; greys become a light neutral), the second
// stop is derived when there is none, and the text drawn on the accent (--accent-fg) is whichever of
// white / near-black reads best on both stops. Stored per device; portal.html applies the saved
// variables before first paint (c360_accent_v), so there is no flash of violet.
(function () {
  'use strict';
  const KEY = 'c360_accent', KEY_C = 'c360_accent_c', KEY_V = 'c360_accent_v';
  const PRESETS = [
    { id: 'violet', name: 'Violet', a: '#8c78ff', b: '#a78bfa' },
    { id: 'indigo', name: 'Indigo', a: '#818cf8', b: '#a5b4fc' },
    { id: 'ocean', name: 'Ocean', a: '#5b8cff', b: '#93b4ff' },
    { id: 'sky', name: 'Cer', a: '#38bdf8', b: '#7dd3fc' },
    { id: 'teal', name: 'Turcoaz', a: '#2dd4bf', b: '#5eead4' },
    { id: 'emerald', name: 'Smarald', a: '#34d399', b: '#6ee7b7' },
    { id: 'lime', name: 'Lime', a: '#a3e635', b: '#d9f99d' },
    { id: 'gold', name: 'Auriu', a: '#fbbf24', b: '#fde68a' },
    { id: 'sunset', name: 'Portocaliu', a: '#fb923c', b: '#fdba74' },
    { id: 'red', name: 'Roșu', a: '#f87171', b: '#fca5a5' },
    { id: 'coral', name: 'Coral', a: '#fb7185', b: '#fda4af' },
    { id: 'pink', name: 'Roz', a: '#f472b6', b: '#f9a8d4' },
    { id: 'fuchsia', name: 'Fucsia', a: '#e879f9', b: '#f0abfc' },
    { id: 'mono', name: 'Monocrom', a: '#f4f4f5', b: '#a1a1aa' },
    { id: 'aurora', name: 'Aurora', a: '#22d3ee', b: '#a78bfa', grad: true },
    { id: 'dusk', name: 'Apus', a: '#fb923c', b: '#f472b6', grad: true },
    { id: 'lagoon', name: 'Lagună', a: '#5b8cff', b: '#2dd4bf', grad: true },
    { id: 'lavender', name: 'Lavandă', a: '#a78bfa', b: '#f472b6', grad: true },
    { id: 'citrus', name: 'Citrice', a: '#a3e635', b: '#fbbf24', grad: true },
    { id: 'peach', name: 'Piersică', a: '#fb7185', b: '#fbbf24', grad: true },
  ];
  const DEFAULT = PRESETS[0];

  // ------------------------------------------------------------------ colour math (sRGB ⇄ OKLCH ⇄ HSV)
  const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
  function hexToRgb(hex) {
    let h = String(hex || '').trim().replace(/^#/, '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    if (!/^[0-9a-f]{6}$/i.test(h)) return null;
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  }
  const rgbToHex = (rgb) => '#' + rgb.map((v) => Math.round(clamp(v, 0, 1) * 255).toString(16).padStart(2, '0')).join('');
  const toLin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const fromLin = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(Math.max(c, 0), 1 / 2.4) - 0.055);
  function rgbToOklch(rgb) {
    const [r, g, b] = rgb.map(toLin);
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    const L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s;
    const A = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
    const B = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
    return [L, Math.hypot(A, B), (Math.atan2(B, A) * 180 / Math.PI + 360) % 360];
  }
  function oklchRaw([L, C, H]) {
    const a = C * Math.cos(H * Math.PI / 180), b = C * Math.sin(H * Math.PI / 180);
    const l = Math.pow(L + 0.3963377774 * a + 0.2158037573 * b, 3);
    const m = Math.pow(L - 0.1055613458 * a - 0.0638541728 * b, 3);
    const s = Math.pow(L - 0.0894841775 * a - 1.2914855480 * b, 3);
    return [
      4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s,
    ].map(fromLin);
  }
  const inGamut = (rgb) => rgb.every((v) => v >= -0.001 && v <= 1.001);
  // Out-of-gamut colours keep their lightness and hue and lose just enough chroma.
  function oklchToRgb([L, C, H]) {
    let rgb = oklchRaw([L, C, H]);
    if (inGamut(rgb)) return rgb.map((v) => clamp(v, 0, 1));
    let lo = 0, hi = C;
    for (let i = 0; i < 22; i++) { const mid = (lo + hi) / 2; if (inGamut(oklchRaw([L, mid, H]))) lo = mid; else hi = mid; }
    return oklchRaw([L, lo, H]).map((v) => clamp(v, 0, 1));
  }
  const lum = (rgb) => { const [r, g, b] = rgb.map(toLin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const contrast = (x, y) => { const a = lum(x), b = lum(y); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); };
  function hsvToRgb(h, s, v) {
    const f = (n) => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
    return [f(5), f(3), f(1)];
  }
  function rgbToHsv([r, g, b]) {
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    let h = 0;
    if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [(h * 60 + 360) % 360, mx ? d / mx : 0, mx];
  }

  // ------------------------------------------------------------------ colour → theme variables
  // Readable on the dark surfaces: saturated colours keep their hue and chroma, lightness is kept in
  // a band that shows up on near-black; greys (black, white, slate) become a light neutral.
  // On Light, the same colour a step darker (it has to read on white); greys become a dark neutral.
  const isLight = () => document.documentElement.getAttribute('data-theme') === 'light';
  function tone(rgb) {
    const [L, C, H] = rgbToOklch(rgb);
    if (isLight()) {
      if (C < 0.035) return oklchToRgb([clamp(L, 0.2, 0.34), C, H]);
      return oklchToRgb([clamp(L, 0.46, 0.62), C, H]);
    }
    if (C < 0.035) return oklchToRgb([clamp(L, 0.8, 0.96), C, H]);
    return oklchToRgb([clamp(L, 0.64, 0.86), C, H]);
  }
  function derive(aHex, bHex) {
    const A = tone(hexToRgb(aHex) || hexToRgb(DEFAULT.a));
    const [La, Ca, Ha] = rgbToOklch(A);
    const neutral = Ca < 0.035;
    const rawB = bHex && hexToRgb(bHex);
    const B = rawB ? tone(rawB) : neutral ? oklchToRgb([isLight() ? La + 0.2 : La - 0.2, Ca, Ha]) : oklchToRgb([Math.min(La + 0.07, isLight() ? 0.7 : 0.92), Ca * 0.85, Ha + 12]);
    const [, Cb, Hb] = rgbToOklch(B);
    // the deeper partner used for ambient glows and the eyebrow text gradient (still readable as text)
    const L3 = isLight() ? 0.5 : 0.6;
    const third = neutral ? oklchToRgb([L3, 0, 0]) : rawB ? oklchToRgb([L3, Cb * 0.9, Hb]) : oklchToRgb([L3, Ca * 0.9, Ha - 40]);
    // text on the accent: white or a near-black tinted with the hue, whichever reads better on BOTH stops
    const ink = oklchToRgb([0.17, Math.min(Ca, 0.05), Ha]);
    const score = (c) => Math.min(contrast(c, A), contrast(c, B), contrast(c, third)); // lava buttons blend all three
    const fg = score([1, 1, 1]) >= score(ink) ? [1, 1, 1] : ink;
    const rgba = (rgb, al) => 'rgba(' + rgb.map((v) => Math.round(v * 255)).join(',') + ',' + al + ')';
    return {
      '--accent': rgbToHex(A), '--accent-2': rgbToHex(B), '--accent-3': rgbToHex(third), '--accent-fg': rgbToHex(fg),
      '--accent-soft': rgba(A, 0.15), '--accent-dim': rgba(A, 0.16),
    };
  }

  // ------------------------------------------------------------------ state
  const read = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const write = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } };
  function state() {
    const id = read(KEY) || DEFAULT.id;
    const p = PRESETS.find((x) => x.id === id);
    if (p) return { id: p.id, mode: p.grad ? 'grad' : 'solid', a: p.a, b: p.b };
    let c = null;
    try { c = JSON.parse(read(KEY_C) || 'null'); } catch (e) { c = null; }
    if (c && hexToRgb(c.a)) return { id: 'custom', mode: c.mode === 'grad' && hexToRgb(c.b) ? 'grad' : 'solid', a: c.a, b: hexToRgb(c.b) ? c.b : '' };
    return { id: DEFAULT.id, mode: 'solid', a: DEFAULT.a, b: DEFAULT.b };
  }
  // A preset keeps its own second colour; a custom single colour gets a derived one.
  const varsOf = (st) => derive(st.a, st.id !== 'custom' || st.mode === 'grad' ? st.b : '');
  function apply(st, persist, fromAccount) {
    const vars = varsOf(st);
    const root = document.documentElement;
    root.removeAttribute('data-accent'); // old preset attribute (pre-2026-10)
    Object.keys(vars).forEach((k) => root.style.setProperty(k, vars[k]));
    if (persist) {
      write(KEY, st.id);
      write(KEY_C, JSON.stringify({ mode: st.mode, a: st.a, b: st.b }));
      write(KEY_V, JSON.stringify(vars));
      if (!fromAccount && typeof window.C360Accent.onChange === 'function') window.C360Accent.onChange(st); // saved on the account (Contul meu)
    }
    return vars;
  }
  // ------------------------------------------------------------------ Light / Dark
  const theme = () => (isLight() ? 'light' : 'dark');
  function setTheme(t, fromAccount) {
    const light = t === 'light';
    if (light === isLight() && read('c360_theme') === (light ? 'light' : 'dark')) return;
    const root = document.documentElement;
    root.classList.add('c360-theming'); // no transitions while it switches: the whole page changes in one frame
    if (light) root.setAttribute('data-theme', 'light'); else root.removeAttribute('data-theme');
    write('c360_theme', light ? 'light' : 'dark');
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', light ? '#f4f5f9' : '#07080b');
    apply(state(), true, true); // the accent, tuned for the theme
    void root.offsetHeight; // the new colours applied now, everywhere
    requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('c360-theming')));
    if (!fromAccount && typeof window.C360Accent.onTheme === 'function') window.C360Accent.onTheme(light ? 'light' : 'dark');
  }

  // First load after the update: an old preset key ("ocean") gets its variables saved once.
  if (!read(KEY_V)) apply(state(), !!read(KEY));

  // ------------------------------------------------------------------ menu section
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nameOf = (st) => (st.id === 'custom' ? (st.mode === 'grad' ? 'Gradient personalizat' : 'Culoare personalizată') : (PRESETS.find((p) => p.id === st.id) || DEFAULT).name);
  const PLUS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>';
  const DROP = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14.5 6.5 3 3M4 20l1-4 9.5-9.5a2.1 2.1 0 0 1 3 3L8 19l-4 1z"/></svg>';
  const SWAP = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7h11l-3-3M17 17H6l3 3"/></svg>';

  function menuHtml() {
    const st = state();
    return '<div class="acc" data-acc>' +
      '<div class="k-menu-label acc-label">Temă</div>' +
      '<div class="acc-theme" role="radiogroup" aria-label="Temă">' + [['dark', 'Dark'], ['light', 'Light']].map(([v, l]) =>
        '<button type="button" role="radio" aria-checked="' + (theme() === v) + '" class="' + (theme() === v ? 'is-on' : '') + '" data-theme-set="' + v + '"><i class="is-' + v + '"></i>' + l + '</button>').join('') + '</div>' +
      '<div class="k-menu-label acc-label">Culoare accent<span data-acc-name>' + esc(nameOf(st)) + '</span></div>' +
      '<div class="acc-grid" role="radiogroup" aria-label="Culoare accent">' +
      PRESETS.map((p) => '<button type="button" role="radio" aria-checked="' + (p.id === st.id) + '" class="acc-sw' + (p.grad ? ' is-grad' : '') + (p.id === st.id ? ' is-on' : '') + '" data-acc-id="' + p.id + '" title="' + esc(p.name) + '" aria-label="' + esc(p.name) + '" style="--a:' + p.a + ';--b:' + p.b + '"></button>').join('') +
      '<button type="button" role="radio" aria-checked="' + (st.id === 'custom') + '" class="acc-sw is-custom' + (st.id === 'custom' ? ' is-on' : '') + '" data-acc-custom title="Orice culoare" aria-label="Alege orice culoare"' +
      (st.id === 'custom' ? ' style="--a:' + st.a + ';--b:' + (st.mode === 'grad' ? st.b : st.a) + '"' : '') + '>' + PLUS + '</button>' +
      '</div>' +
      '<div class="acc-panel" data-acc-panel hidden>' +
      '<div class="acc-modes"><button type="button" data-acc-mode="solid">O culoare</button><button type="button" data-acc-mode="grad">Gradient</button></div>' +
      '<div class="acc-stops" data-acc-stops>' +
      '<button type="button" data-acc-stop="a"><i></i><span>Culoarea 1</span></button>' +
      '<button type="button" class="acc-swap" data-acc-swap title="Inversează culorile" aria-label="Inversează culorile">' + SWAP + '</button>' +
      '<button type="button" data-acc-stop="b"><i></i><span>Culoarea 2</span></button></div>' +
      '<div class="acc-sv" data-acc-sv><i data-acc-sv-thumb></i></div>' +
      '<div class="acc-hue" data-acc-hue><i data-acc-hue-thumb></i></div>' +
      '<div class="acc-hexrow"><span class="acc-chip" data-acc-chip></span><input data-acc-hex maxlength="7" spellcheck="false" autocomplete="off" aria-label="Codul culorii (ex. #8c78ff)">' +
      (window.EyeDropper ? '<button type="button" class="acc-drop" data-acc-drop title="Ia o culoare de pe ecran" aria-label="Ia o culoare de pe ecran">' + DROP + '</button>' : '') + '</div>' +
      '<div class="acc-preview" aria-hidden="true"><span class="acc-pv-btn">Programează</span><span class="acc-pv-tag">Confirmată</span><span class="acc-pv-bar"><i></i></span></div>' +
      '<p class="acc-note">Ajustăm singuri luminozitatea și culoarea textului, ca totul să rămână citibil pe orice culoare.</p>' +
      '<button type="button" class="acc-reset" data-acc-reset>Revino la violet</button>' +
      '</div></div>';
  }

  let lastDrag = 0;
  function wire(root) {
    const box = root.querySelector('[data-acc]');
    if (!box) return;
    const panel = box.querySelector('[data-acc-panel]');
    const sv = box.querySelector('[data-acc-sv]'), hue = box.querySelector('[data-acc-hue]'), hex = box.querySelector('[data-acc-hex]');
    let st = state();
    // the picker edits the colour the person chose (not the tuned one) for stop a or b
    const ed = { stop: 'a', h: 0, s: 0, v: 0 };
    const cur = () => (ed.stop === 'b' ? st.b : st.a);
    function loadStop() {
      const [h, s, v] = rgbToHsv(hexToRgb(cur()) || [0, 0, 0]);
      if (s > 0.001 && v > 0.001) ed.h = h; // a grey keeps the hue the slider was on
      ed.s = s; ed.v = v;
    }
    function paint() {
      sv.style.setProperty('--h', ed.h);
      sv.querySelector('[data-acc-sv-thumb]').style.cssText = 'left:' + (ed.s * 100) + '%;top:' + ((1 - ed.v) * 100) + '%;background:' + cur();
      hue.querySelector('[data-acc-hue-thumb]').style.cssText = 'left:' + (ed.h / 360 * 100) + '%;background:hsl(' + ed.h + ',100%,50%)';
      if (document.activeElement !== hex) hex.value = cur().toUpperCase();
      box.querySelector('[data-acc-chip]').style.background = cur();
      box.querySelectorAll('[data-acc-mode]').forEach((b) => b.classList.toggle('is-on', b.dataset.accMode === st.mode));
      box.querySelector('[data-acc-stops]').hidden = st.mode !== 'grad';
      box.querySelectorAll('[data-acc-stop]').forEach((b) => {
        b.classList.toggle('is-on', b.dataset.accStop === ed.stop);
        b.querySelector('i').style.background = b.dataset.accStop === 'b' ? st.b : st.a;
      });
      box.querySelector('[data-acc-name]').textContent = nameOf(st);
      const custom = box.querySelector('[data-acc-custom]');
      if (st.id === 'custom') { custom.style.setProperty('--a', st.a); custom.style.setProperty('--b', st.mode === 'grad' ? st.b : st.a); }
      box.querySelectorAll('.acc-sw').forEach((b) => {
        const on = b.dataset.accId ? b.dataset.accId === st.id : st.id === 'custom';
        b.classList.toggle('is-on', on); b.setAttribute('aria-checked', on);
      });
    }
    let raf = 0, dirty = false;
    function commit(persist) {
      if (persist) { cancelAnimationFrame(raf); raf = 0; apply(st, true); paint(); return; }
      dirty = true;
      if (!raf) raf = requestAnimationFrame(() => { raf = 0; if (dirty) { dirty = false; apply(st, false); } paint(); });
    }
    function setCur(hexVal, persist) {
      if (!hexToRgb(hexVal)) return;
      if (st.id !== 'custom') st = { id: 'custom', mode: st.mode, a: st.a, b: st.b };
      st[ed.stop] = hexVal;
      commit(persist);
    }
    const fromHsv = () => rgbToHex(hsvToRgb(ed.h, ed.s, ed.v));
    function openPanel(yes) {
      panel.hidden = !yes;
      box.classList.toggle('is-custom-open', yes);
      if (yes) {
        if (st.id !== 'custom') st = { id: 'custom', mode: st.mode, a: st.a, b: st.b || derive(st.a, '')['--accent-2'] };
        ed.stop = 'a'; loadStop(); commit(true);
        panel.scrollIntoView({ block: 'nearest' });
      }
    }

    box.addEventListener('click', (e) => {
      const th = e.target.closest('[data-theme-set]');
      if (th) {
        setTheme(th.dataset.themeSet);
        box.querySelectorAll('[data-theme-set]').forEach((b) => { const on = b.dataset.themeSet === theme(); b.classList.toggle('is-on', on); b.setAttribute('aria-checked', on); });
        return;
      }
      const p = e.target.closest('[data-acc-id]');
      if (p) {
        const pr = PRESETS.find((x) => x.id === p.dataset.accId);
        st = { id: pr.id, mode: pr.grad ? 'grad' : 'solid', a: pr.a, b: pr.b };
        openPanel(false); commit(true);
        return;
      }
      if (e.target.closest('[data-acc-custom]')) { openPanel(panel.hidden); return; }
      const m = e.target.closest('[data-acc-mode]');
      if (m) {
        const mode = m.dataset.accMode;
        if (mode === st.mode) return;
        st = { id: 'custom', mode, a: st.a, b: st.b };
        // a fresh gradient starts from a visibly different second colour
        if (mode === 'grad' && (!hexToRgb(st.b) || st.b === st.a)) { const [L, C, H] = rgbToOklch(hexToRgb(st.a)); st.b = rgbToHex(oklchToRgb([L, Math.max(C, 0.12), H + 60])); }
        ed.stop = 'a'; loadStop(); commit(true);
        return;
      }
      const s = e.target.closest('[data-acc-stop]');
      if (s) { ed.stop = s.dataset.accStop; loadStop(); paint(); return; }
      if (e.target.closest('[data-acc-swap]')) { st = { id: 'custom', mode: st.mode, a: st.b, b: st.a }; loadStop(); commit(true); return; }
      if (e.target.closest('[data-acc-reset]')) {
        st = { id: DEFAULT.id, mode: 'solid', a: DEFAULT.a, b: DEFAULT.b };
        openPanel(false); commit(true);
        return;
      }
      if (e.target.closest('[data-acc-drop]')) {
        new window.EyeDropper().open().then((r) => { if (r && hexToRgb(r.sRGBHex)) { setCur(r.sRGBHex.toLowerCase(), true); loadStop(); paint(); } }).catch(() => {});
      }
    });

    // dragging on the square (saturation × brightness) and the hue bar
    function drag(el, onPos) {
      el.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        try { el.setPointerCapture(e.pointerId); } catch (err) { /* pointer already gone */ }
        const move = (ev) => { const r = el.getBoundingClientRect(); if (!r.width || !r.height) return; onPos(clamp((ev.clientX - r.left) / r.width, 0, 1), clamp((ev.clientY - r.top) / r.height, 0, 1)); };
        const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); lastDrag = Date.now(); commit(true); };
        el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
        move(e);
      });
    }
    drag(sv, (x, y) => { ed.s = x; ed.v = 1 - y; setCur(fromHsv(), false); });
    drag(hue, (x) => { ed.h = x * 360; if (ed.s < 0.05) ed.s = 0.85; if (ed.v < 0.3) ed.v = 0.95; setCur(fromHsv(), false); });
    // keyboard: arrows move the thumbs too
    sv.tabIndex = 0; hue.tabIndex = 0;
    sv.setAttribute('role', 'slider'); sv.setAttribute('aria-label', 'Saturație și luminozitate');
    hue.setAttribute('role', 'slider'); hue.setAttribute('aria-label', 'Nuanță');
    sv.addEventListener('keydown', (e) => {
      const d = { ArrowLeft: [-0.03, 0], ArrowRight: [0.03, 0], ArrowUp: [0, 0.03], ArrowDown: [0, -0.03] }[e.key];
      if (!d) return; e.preventDefault(); ed.s = clamp(ed.s + d[0], 0, 1); ed.v = clamp(ed.v + d[1], 0, 1); setCur(fromHsv(), true);
    });
    hue.addEventListener('keydown', (e) => {
      const d = { ArrowLeft: -4, ArrowRight: 4, ArrowDown: -4, ArrowUp: 4 }[e.key];
      if (!d) return; e.preventDefault(); ed.h = (ed.h + d + 360) % 360; setCur(fromHsv(), true);
    });
    hex.addEventListener('input', () => {
      let v = hex.value.trim(); if (v && v[0] !== '#') v = '#' + v;
      if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(v)) { setCur(rgbToHex(hexToRgb(v)), true); loadStop(); paint(); }
    });
    hex.addEventListener('blur', () => { hex.value = cur().toUpperCase(); });
    hex.addEventListener('keydown', (e) => { if (e.key === 'Enter') hex.blur(); e.stopPropagation(); });

    loadStop(); paint();
    if (st.id === 'custom') { panel.hidden = false; box.classList.add('is-custom-open'); }
  }

  window.C360Accent = { PRESETS, derive, menuHtml, wire, state, apply, contrast, hexToRgb, theme, setTheme, justDragged: () => Date.now() - lastDrag < 400 };
})();
