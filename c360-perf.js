/* Performanța site-ului (Portal → Admin → Performanța site-ului): cât de repede s-a încărcat pagina pentru acest vizitator, măsurat de browser
   cu PerformanceObserver, cum definește Google Core Web Vitals (fără bibliotecă):
     LCP  largest-contentful-paint, ultima înainte de prima tastă sau atingere, ori înainte să se ascundă pagina
     INP  event timing (interactionId), cea mai lungă interacțiune, una ignorată la fiecare 50 (percentila 98)
     CLS  layout-shift fără atingere recentă, cea mai mare fereastră (pauze sub 1 s, cel mult 5 s)
     FCP  paint „first-contentful-paint”;  TTFB  responseStart (ambele de la activationStart, la paginile preîncărcate)
   plus greutatea paginii din Resource Timing (octeți pe tip, cele mai grele fișiere), erorile JavaScript, fișierele care nu
   s-au încărcat și apelurile eșuate la /api/ al site-ului. Pleacă o singură dată, când pagina se ascunde (sendBeacon la
   /api/site-perf); erorile și la câteva secunde după ce apar. Nimic personal: calea fără query, fără id, fără cookie, deci nu
   cere acordul pentru cookie-uri. Doar pe site (nu în portal); se pune pe o pagină cu un singur rând:
   <script src="/c360-perf.js" defer></script>; serverul adaugă dispozitivul, browserul și țara și scoate roboții.
   Aceeași logică ca în Summitlane (kit/shop/pages/pulse.js). */
(function () {
  if (!/(^|\.)centrul360\.com$/.test(location.hostname) || /^(admin|staff)\./.test(location.hostname) || /bot|headless|lighthouse|pagespeed/i.test(navigator.userAgent)) return;
  var P = window.performance; if (!P || !P.getEntriesByType || !window.JSON) return;
  var ENDPOINT = "/api/site-perf", SAMPLE = 1; // fiecare vizită e măsurată; SAMPLE mai mic când crește traficul
  var measure = Math.random() < SAMPLE;
  var nav = P.getEntriesByType("navigation")[0] || null, act = (nav && nav.activationStart) || 0, restored = false;
  var hiddenAt = document.visibilityState === "hidden" ? 0 : Infinity;
  try { P.getEntriesByType("visibility-state").forEach(function (e) { if (e.name === "hidden" && e.startTime < hiddenAt) hiddenAt = e.startTime; }); } catch (e) {}
  var types = (window.PerformanceObserver && PerformanceObserver.supportedEntryTypes) || [];
  function obs(type, cb, opt) {
    if (types.indexOf(type) < 0) return null;
    try { var o = new PerformanceObserver(function (l) { cb(l.getEntries()); }), q = { type: type, buffered: true }; if (opt) for (var k in opt) q[k] = opt[k]; o.observe(q); return o; } catch (e) { return null; }
  }
  var V = {};
  if (nav && nav.responseStart > 0) V.ttfb = Math.max(nav.responseStart - act, 0);
  obs("paint", function (L) { L.forEach(function (e) { if (e.name === "first-contentful-paint" && e.startTime < hiddenAt) V.fcp = Math.max(e.startTime - act, 0); }); });
  // LCP: stops at the first key press or click (the browser stops too), or when hidden
  var lcpDone = false, lcpO = obs("largest-contentful-paint", lcpTake);
  function lcpTake(L) { if (lcpDone) return; L.forEach(function (e) { if (e.startTime < hiddenAt) V.lcp = Math.max(e.startTime - act, 0); }); }
  function lcpStop() { if (lcpDone || !lcpO) return; try { lcpTake(lcpO.takeRecords()); lcpO.disconnect(); } catch (e) {} lcpDone = true; }
  ["keydown", "click"].forEach(function (t) { addEventListener(t, function () { setTimeout(lcpStop, 0); }, { once: true, capture: true }); });
  // CLS: session windows
  var cls = 0, sv = 0, sFirst = 0, sLast = 0, clsO = obs("layout-shift", function (L) {
    L.forEach(function (e) { if (e.hadRecentInput) return; if (sv && e.startTime - sLast < 1000 && e.startTime - sFirst < 5000) { sv += e.value; sLast = e.startTime; } else { sv = e.value; sFirst = sLast = e.startTime; } if (sv > cls) cls = sv; });
  });
  // INP: the longest interactions (kept 10), one skipped for every 50 interactions
  var seen = {}, long = [], nInter = 0;
  function inter(L) {
    L.forEach(function (e) {
      if (!e.interactionId) return;
      var x = seen[e.interactionId];
      if (!x) { nInter++; x = seen[e.interactionId] = { d: e.duration }; long.push(x); } else if (e.duration > x.d) x.d = e.duration;
    });
    long.sort(function (a, b) { return b.d - a.d; }); if (long.length > 10) long.length = 10;
  }
  var evO = obs("event", inter, { durationThreshold: 40 }); obs("first-input", inter);
  function inp() {
    try { if (evO) inter(evO.takeRecords()); } catch (e) {}
    if (!long.length) return null;
    var n = P.interactionCount || nInter;
    return long[Math.min(long.length - 1, Math.floor(n / 50))].d;
  }
  // page weight: what the browser loaded for this page (compressed body size, also when it came from the cache)
  try { if (P.setResourceTimingBufferSize) P.setResourceTimingBufferSize(600); } catch (e) {}
  var EXT = { js: "js", mjs: "js", css: "css", png: "img", jpg: "img", jpeg: "img", gif: "img", webp: "img", avif: "img", svg: "img", ico: "img", woff: "font", woff2: "font", ttf: "font", otf: "font", mp4: "media", webm: "media", mov: "media", m4a: "media", mp3: "media", m3u8: "media", html: "html" };
  function short(u) { try { var x = new URL(u, location.href); return (x.origin === location.origin ? "" : x.host) + x.pathname; } catch (e) { return String(u || "").split(/[?#]/)[0].slice(0, 120); } }
  function typeOf(r) {
    var u; try { u = new URL(r.name); } catch (e) { return "other"; }
    if (u.origin === location.origin && /^\/api\//.test(u.pathname)) return "api";
    var ext = (u.pathname.match(/\.([a-z0-9]+)$/i) || [])[1], it = r.initiatorType;
    if (ext && EXT[ext.toLowerCase()]) return EXT[ext.toLowerCase()];
    if (it === "script") return "js"; if (it === "img" || it === "image") return "img"; if (it === "video" || it === "audio") return "media";
    if (it === "link" && /fonts\.googleapis/.test(u.host)) return "css"; if (/fonts\.gstatic/.test(u.host)) return "font";
    if (it === "beacon" || it === "fetch" || it === "xmlhttprequest") return "api";
    return "other";
  }
  function weight() {
    var w = { html: 0, js: 0, css: 0, img: 0, font: 0, media: 0, other: 0, req: 1 }, by = {};
    if (nav) w.html = nav.encodedBodySize || nav.transferSize || 0;
    P.getEntriesByType("resource").forEach(function (r) {
      var t = typeOf(r); if (t === "api") return;
      var s = r.encodedBodySize || r.transferSize || 0; w.req++; w[t] += s;
      var k = short(r.name), x = by[k] = by[k] || { u: k, t: t, s: 0, d: 0 }; x.s += s; x.d = Math.max(x.d, r.duration);
    });
    var top = Object.keys(by).map(function (k) { return by[k]; }).filter(function (x) { return x.s > 0; }).sort(function (a, b) { return b.s - a.s; }).slice(0, 6);
    top.forEach(function (x) { x.d = Math.round(x.d); });
    return { w: w, top: top };
  }
  // errors: deduped, at most 5 different ones per page view, counted
  var E = {}, EL = [], flushT = 0, flushes = 0;
  // nothing personal leaves the page: no email, no long number, no query string inside a message
  function clean(x) { return String(x == null ? "" : x).replace(/[^\s@]+@[^\s@]+\.[a-z]{2,}/gi, "<email>").replace(/(https?:\/\/[^\s?#"']+)[?#][^\s"']*/g, "$1").replace(/\d{5,}/g, "#"); }
  var resSeen = {};
  function err(t, m, s) {
    m = clean(m).slice(0, 200); if (!m) return;
    if (t === "res") { if (resSeen[m]) return; resSeen[m] = 1; } // one failed file counts once, whoever saw it
    var k = t + "|" + m + "|" + s, x = E[k];
    if (x) { x.c++; } else { if (EL.length >= 5) return; x = E[k] = { t: t, m: m, s: String(s || "").slice(0, 160), c: 1, sent: 0 }; EL.push(x); }
    if (!flushT && flushes < 3) flushT = setTimeout(function () { flushT = 0; flushes++; var e = pending(); if (e.length) beacon({ p: location.pathname, e: e }); }, 3000);
  }
  function pending() { var out = []; EL.forEach(function (x) { if (x.c > x.sent) { out.push({ t: x.t, m: x.m, s: x.s, c: x.c - x.sent }); x.sent = x.c; } }); return out; }
  var EXTN = /^(chrome|moz|safari(-web)?|ms-browser)-extension:/;
  addEventListener("error", function (ev) {
    var tg = ev.target;
    if (tg && tg !== window && tg.nodeType === 1) { // a file that did not load (image, script, style, video)
      var u = tg.currentSrc || tg.src || tg.href; if (!u || EXTN.test(u)) return;
      return err("res", tg.tagName.toLowerCase() + " " + short(u), short(u));
    }
    if (ev.filename && EXTN.test(ev.filename)) return;
    err("js", ev.message || (ev.error && ev.error.message) || "Error", ev.filename ? short(ev.filename) + ":" + (ev.lineno || 0) + ":" + (ev.colno || 0) : "");
  }, true);
  addEventListener("unhandledrejection", function (ev) {
    var r = ev.reason, m = r && r.message ? (r.name && r.name !== "Error" ? r.name + ": " : "") + r.message : String(r);
    var st = r && r.stack ? String(r.stack) : "", at = st.match(/(https?:\/\/[^\s)]+):(\d+):(\d+)/);
    if (at && EXTN.test(at[1])) return;
    err("promise", m, at ? short(at[1]) + ":" + at[2] + ":" + at[3] : "");
  });
  // files that failed before this script ran (it loads last): broken images on the page, and where the browser tells the
  // status (Resource Timing), scripts, styles and images answered with an error
  function early() {
    try { Array.prototype.forEach.call(document.images, function (im) { var u = im.currentSrc || im.src; if (im.complete && !im.naturalWidth && u && !/^data:/.test(u)) err("res", "img " + short(u), short(u)); }); } catch (e) {}
    try { P.getEntriesByType("resource").forEach(function (r) { var it = r.initiatorType; if (r.responseStatus >= 400 && (it === "img" || it === "script" || it === "link" || it === "css")) err("res", (it === "css" ? "link" : it) + " " + short(r.name), short(r.name)); }); } catch (e) {}
  }
  if (document.readyState === "complete") early(); else addEventListener("load", early);
  // this site's own /api/ calls that failed: after this script through fetch, before it from Resource Timing (where known)
  var QUIET = /^\/api\/site-perf\b/;
  function apiFail(method, path, what) { err("api", method + " " + path + " " + what, "browser"); }
  try {
    P.getEntriesByType("resource").forEach(function (r) {
      if (!r.responseStatus || r.responseStatus < 500 || (r.initiatorType !== "fetch" && r.initiatorType !== "xmlhttprequest")) return;
      var u = new URL(r.name); if (u.origin === location.origin && /^\/api\//.test(u.pathname) && !QUIET.test(u.pathname)) apiFail("GET", u.pathname, r.responseStatus);
    });
  } catch (e) {}
  var of = window.fetch;
  if (of) window.fetch = function (input, init) {
    var p = of.apply(this, arguments);
    try {
      var url = typeof input === "string" ? input : (input && input.url) || String(input), u = new URL(url, location.href);
      var method = String((init && init.method) || (input && input.method) || "GET").toUpperCase();
      if (u.origin === location.origin && /^\/api\//.test(u.pathname) && !QUIET.test(u.pathname))
        p.then(function (r) { if (r.status >= 500) apiFail(method, u.pathname, r.status); }, function (e) { apiFail(method, u.pathname, e && e.name === "AbortError" ? "oprit, prea lent" : "fără răspuns"); });
    } catch (e) {}
    return p;
  };
  function beacon(b) {
    var s = JSON.stringify(b);
    try { if (!(navigator.sendBeacon && navigator.sendBeacon(ENDPOINT, s))) of.call(window, ENDPOINT, { method: "POST", body: s, keepalive: true }).catch(function () {}); } catch (e) {}
  }
  var sent = false;
  function report() {
    if (sent) { var e0 = pending(); if (e0.length) beacon({ p: location.pathname, e: e0 }); return; }
    sent = true; lcpStop();
    var b = { p: location.pathname, n: restored ? "restore" : document.prerendering || act > 0 ? "prerender" : (nav && nav.type) || "", c: (navigator.connection && navigator.connection.effectiveType) || "" };
    if (measure) {
      var v = {}, i = inp();
      ["ttfb", "fcp", "lcp"].forEach(function (k) { if (V[k] != null) v[k] = Math.round(V[k]); });
      if (clsO && (v.fcp != null || v.lcp != null)) v.cls = Math.round(cls * 1000);
      if (i != null) v.inp = Math.round(i);
      b.v = v; if (!restored) { var W = weight(); b.w = W.w; b.r = W.top; }
    }
    var e = pending(); if (e.length) b.e = e;
    beacon(b);
  }
  addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden") { hiddenAt = Math.min(hiddenAt, P.now()); report(); } }, true);
  addEventListener("pagehide", report, true);
  // a page restored from the back/forward cache is a new view: measured again from the restore (no paint, no file loads)
  addEventListener("pageshow", function (ev) {
    if (!ev.persisted) return;
    sent = false; restored = true; lcpDone = true; V = {}; cls = 0; sv = 0; seen = {}; long = []; nInter = 0; act = 0; hiddenAt = Infinity; nav = null;
    var t = ev.timeStamp; requestAnimationFrame(function () { requestAnimationFrame(function () { V.fcp = V.lcp = Math.max(P.now() - t, 0); }); });
  }, true);
})();
