// Centrul360, the preview's liquid glass (the owner, 27.11: „da” to glass on what floats over the page). The header, the
// bottom bar, the cart's bar and the -50% pills on the photos bend what passes behind them at their rim, like a thick glass
// lens, instead of only blurring it. Only Chrome (Android, a computer) can bend the page behind an element (an SVG filter in
// backdrop-filter): there html gets .lg-on and each piece .lg (v2/lg.css: lighter tints, a light rim); Safari and Firefox
// keep everything exactly as it is. Every page loads it (v2/build.py, next to m3), live since the owner's „bun, publish” (27.11).
(function () {
  'use strict';
  var ua = navigator.userAgentData;
  if (!ua || !(ua.brands || []).some(function (b) { return /Chrom/.test(b.brand); })) return;
  try { if (matchMedia('(prefers-reduced-transparency: reduce)').matches) return; } catch (e) { /* an old browser: glass */ }
  var NS = 'http://www.w3.org/2000/svg';
  // each piece: how wide its rim is and how far the rim looks inward (px); before: what is done to the page behind first (the
  // bars carry words: blurred enough that nothing behind them reads, then bent at the rim), after: once bent
  var LOOK = {
    bar: { sel: '.top .bar', rim: 22, bend: 14, before: 'blur(14px) saturate(1.8)', after: 'brightness(1.03)' },
    dock: { sel: '.dock', rim: 22, bend: 14, before: 'blur(14px) saturate(1.8)', after: 'brightness(1.03)' },
    cart: { sel: '.sh-bar', rim: 22, bend: 14, before: 'blur(12px) saturate(1.6)', after: '' },
    pct: { sel: '.bft > .pct, .bfc .pct', rim: 10, bend: 6, before: '', after: 'blur(1px) saturate(1.5)' }
  };
  var KEYS = Object.keys(LOOK);
  document.documentElement.classList.add('lg-on');

  var svg = null, defs = null, made = {}, n = 0;
  function root() {
    if (svg) return;
    svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false');
    svg.setAttribute('width', '0'); svg.setAttribute('height', '0');
    svg.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;overflow:hidden;pointer-events:none';
    defs = document.createElementNS(NS, 'defs');
    svg.appendChild(defs);
    document.body.appendChild(svg);
  }
  // where each point of the piece looks: the middle straight through, the rim more and more inward, the way light bends
  // in a rounded glass edge (a quarter circle: gentle where the rim starts, steep at the very edge). Red = across, green =
  // down, 128 = stay; the map has the piece's own size and corners.
  function mapOf(w, h, r, rim) {
    var c = document.createElement('canvas');
    c.width = w; c.height = h;
    var g = c.getContext('2d'), im = g.createImageData(w, h), d = im.data;
    var hw = w / 2, hh = h / 2;
    r = Math.min(r, hw, hh); rim = Math.max(1, Math.min(rim, hw, hh));
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var px = x + 0.5 - hw, py = y + 0.5 - hh, qx = Math.abs(px) - (hw - r), qy = Math.abs(py) - (hh - r);
        var dist = r - Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) - Math.min(Math.max(qx, qy), 0);
        var nx = 0, ny = 0;
        if (qx > 0 && qy > 0) { var l = Math.hypot(qx, qy) || 1; nx = qx / l; ny = qy / l; } else if (qx > qy) nx = 1; else ny = 1;
        if (px < 0) nx = -nx;
        if (py < 0) ny = -ny;
        var t = dist < rim ? 1 - Math.max(dist, 0) / rim : 0, m = t ? 1 - Math.sqrt(1 - t * t) : 0;
        var i = (y * w + x) * 4;
        d[i] = Math.round(128 - nx * m * 127); d[i + 1] = Math.round(128 - ny * m * 127); d[i + 2] = 128; d[i + 3] = 255;
      }
    }
    g.putImageData(im, 0, 0);
    return c.toDataURL('image/png');
  }
  // one filter per size and corner (the pills of one page share theirs)
  function filterFor(w, h, r, k) {
    var L = LOOK[k], key = k + ':' + w + 'x' + h + ':' + r;
    if (made[key]) return made[key];
    root();
    var id = 'c360-lg-' + (++n), f = document.createElementNS(NS, 'filter');
    [['id', id], ['x', '0'], ['y', '0'], ['width', w], ['height', h], ['filterUnits', 'userSpaceOnUse'], ['primitiveUnits', 'userSpaceOnUse'],
      ['color-interpolation-filters', 'sRGB']].forEach(function (a) { f.setAttribute(a[0], String(a[1])); });
    var im = document.createElementNS(NS, 'feImage');
    [['href', mapOf(w, h, r, L.rim)], ['x', '0'], ['y', '0'], ['width', w], ['height', h], ['preserveAspectRatio', 'none'], ['result', 'map']]
      .forEach(function (a) { im.setAttribute(a[0], String(a[1])); });
    var dm = document.createElementNS(NS, 'feDisplacementMap');
    [['in', 'SourceGraphic'], ['in2', 'map'], ['scale', L.bend * 2], ['xChannelSelector', 'R'], ['yChannelSelector', 'G']]
      .forEach(function (a) { dm.setAttribute(a[0], String(a[1])); });
    f.appendChild(im); f.appendChild(dm); defs.appendChild(f);
    return (made[key] = id);
  }
  // the piece's own size (its layout box: a bump or a slide doesn't count) → its filter, then the blur after it
  function glass(el) {
    var k = el.getAttribute('data-lg'), w = el.offsetWidth, h = el.offsetHeight;
    if (!k || !w || !h) return;
    var r = Math.round(parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0);
    var v = (LOOK[k].before + ' url(#' + filterFor(w, h, r, k) + ') ' + LOOK[k].after).trim();
    if (el.style.backdropFilter !== v) { el.style.setProperty('backdrop-filter', v); el.style.setProperty('-webkit-backdrop-filter', v); }
    el.classList.add('lg');
  }
  var ro = 'ResizeObserver' in window ? new ResizeObserver(function (es) { es.forEach(function (e) { glass(e.target); }); }) : null;
  function scan() {
    KEYS.forEach(function (k) {
      document.querySelectorAll(LOOK[k].sel).forEach(function (el) {
        if (el.hasAttribute('data-lg')) return;
        el.setAttribute('data-lg', k);
        glass(el);
        if (ro) ro.observe(el);
      });
    });
  }
  var soon = 0;
  function later() { cancelAnimationFrame(soon); soon = requestAnimationFrame(scan); }
  function start() {
    scan();
    // the shop draws its cards and its bar later (and again on a filter): each new piece gets its glass as it arrives
    new MutationObserver(later).observe(document.body, { childList: true, subtree: true });
    if (!ro) addEventListener('resize', function () { document.querySelectorAll('[data-lg]').forEach(glass); }, { passive: true });
  }
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
})();
