// Portat din adminul Summitlane (admin/assets/scene/renderer.js), pentru globul de la Admin → Site. Căile: /portal-scene/.
// One WebGL renderer for the whole admin (assets/vendor/three, r169, served from here: the CSP allows only 'self').
// Its canvas moves to the screen that is open (Acasă: the prism, Live: the globe); the other scene sleeps.
// One requestAnimationFrame for the active scene, only while it is on screen and the tab is visible; idle scenes draw at
// half rate, anything moving (a pulse, an arc, the pointer) gets every frame; the pixel ratio steps down when frames are
// slow (cap 1.5 on phones). Never runs with reduced motion: a scene then draws once, still.
export const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
export const isPhone = () => innerWidth < 1100;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const phoneDpr = () => Math.min(window.devicePixelRatio || 1, innerWidth < 1100 ? 1.5 : 2);
const NOGL = /[?&]nogl/.test(location.search);

export const GL = { T: null, r: null, canvas: null, p: null, soft: false };
export function loadGL() {
  if (GL.p) return GL.p;
  if (NOGL) return (GL.p = Promise.resolve(null));
  GL.p = import("/portal-scene/three.module.min.js").then((T) => {
    const opts = (aa) => ({ antialias: aa, alpha: false, powerPreference: "high-performance", stencil: false });
    try { GL.r = new T.WebGLRenderer(opts(!isPhone() && (window.devicePixelRatio || 1) < 2)); } catch (e) { return null; }
    // a software rasterizer (no GPU) cannot afford MSAA: recreate once without it, before any scene uses the context
    try {
      const gl = GL.r.getContext(), ext = gl.getExtension("WEBGL_debug_renderer_info"), name = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : "";
      GL.soft = /swiftshader|llvmpipe|software|basic render/i.test(name);
      if (GL.soft && gl.getContextAttributes().antialias) { GL.r.dispose(); GL.r.forceContextLoss(); GL.r = new T.WebGLRenderer(opts(false)); }
    } catch (e) {}
    GL.T = T; GL.canvas = GL.r.domElement; GL.r.setClearColor(0x000000, 1); GL.r.toneMapping = T.NoToneMapping;
    GL.canvas.setAttribute("aria-hidden", "true");
    GL.canvas.addEventListener("webglcontextlost", (e) => e.preventDefault());
    return GL;
  }).catch(() => null);
  return GL.p;
}

// ---- the frame loop ----
const LOOP = { s: null, raf: 0, odd: false, last: 0 };
export const active = () => LOOP.s;
function wantRun() { const s = LOOP.s; return !!(s && s.inView && !document.hidden && !reduced && s.host && s.host.isConnected); }
export { wantRun };
export function kick() { if (wantRun() && !LOOP.raf) { LOOP.last = performance.now(); LOOP.raf = requestAnimationFrame(frame); } }
function frame(now) {
  LOOP.raf = 0;
  const s = LOOP.s; if (!wantRun()) return;
  LOOP.raf = requestAnimationFrame(frame);
  LOOP.odd = !LOOP.odd;
  const busy = s.busy(now);
  if (!busy && LOOP.odd) return; // idle: about 30 fps
  const dt = clamp((now - LOOP.last) / 1000, 0, 0.05), gap = now - LOOP.last; LOOP.last = now;
  const t0 = performance.now();
  s.step(dt, now); GL.r.render(s.scene, s.camera);
  s.st.cpu = s.st.cpu * 0.9 + (performance.now() - t0) * 0.1;
  adapt(s, gap, busy);
}
function adapt(s, gap, busy) {
  const st = s.st, want = busy ? 16.7 : 33.4;
  st.n++; st.sum += gap / want;
  st.gaps.push(gap); if (st.gaps.length > 240) st.gaps.shift();
  if (st.n < 60) return;
  const r = st.sum / st.n; st.n = 0; st.sum = 0;
  const cap = s.maxDpr(), cur = st.dpr;
  if (r > 1.35 && cur > s.minDpr) { st.dpr = Math.max(s.minDpr, +(cur - 0.25).toFixed(2)); st.downAt = performance.now(); s.layout(); }
  else if (performance.now() - (st.downAt || 0) > 6000 && r < 1.02 && cur < cap && st.cpu < 4) { st.dpr = Math.min(cap, +(cur + 0.25).toFixed(2)); s.layout(); }
}
export function newStats(s) { s.st = { n: 0, sum: 0, cpu: 0, gaps: [], dpr: s.maxDpr() }; }
export function attach(s) {
  if (LOOP.s && LOOP.s !== s) detach(LOOP.s);
  LOOP.s = s;
  if (GL.canvas.parentNode !== s.host) s.host.insertBefore(GL.canvas, s.host.firstChild);
  s.layout(); s.renderOnce(); kick(); topOver();
}
export function detach(s) { if (LOOP.s === s) { LOOP.s = null; cancelAnimationFrame(LOOP.raf); LOOP.raf = 0; } topOver(); }
document.addEventListener("visibilitychange", kick);
// the sticky top bar drops its blur while a live canvas is under it (re-blurring every frame is the most expensive thing on the page)
function topOver() {
  const t = document.querySelector("header.topbar"), s = LOOP.s; if (!t) return;
  const r = s && s.host && s.host.isConnected ? s.host.getBoundingClientRect() : null;
  t.classList.toggle("over", !!(r && r.top < t.offsetHeight && r.bottom > 0));
}
addEventListener("scroll", topOver, { passive: true });
export function watchView(s, el) {
  if (s._io) s._io.disconnect();
  s._io = new IntersectionObserver((es) => { s.inView = es[es.length - 1].isIntersecting; kick(); }, { threshold: 0 });
  s._io.observe(el);
}
export function glStats() {
  const s = LOOP.s; if (!s || !GL.r) return { active: null };
  const g = s.st.gaps.slice(-120), srt = g.slice().sort((a, b) => a - b);
  return { active: s.name, dpr: GL.r.getPixelRatio(), cpu: +s.st.cpu.toFixed(2), avgGap: g.length ? +(g.reduce((a, b) => a + b, 0) / g.length).toFixed(1) : 0,
    p95: srt.length ? +srt[Math.floor(srt.length * 0.95)].toFixed(1) : 0, n: g.length, soft: GL.soft, aa: GL.r.getContext().getContextAttributes().antialias };
}

// ---- tilt (phones): the scene leans with the phone, after a tap (iOS asks first) ----
export const tilt = { x: 0, y: 0, on: false };
export function enableTilt() {
  const start = () => {
    if (tilt.on) return; tilt.on = true;
    addEventListener("deviceorientation", (e) => { if (e.gamma == null) return; tilt.x = clamp(e.gamma / 30, -1, 1); tilt.y = clamp(((e.beta || 50) - 50) / 30, -1, 1); kick(); });
  };
  const D = window.DeviceOrientationEvent;
  if (D && typeof D.requestPermission === "function") D.requestPermission().then((s) => { if (s === "granted") start(); }).catch(() => {});
  else start();
}
