/* Centrul360: the visit counter of the site (seen in the portal, Admin → Site). No cookie, nothing stored on this device,
   nothing that names anyone: the page, where the visit came from, phone or computer, how fast the page loaded. */
(function () {
  try {
    if (navigator.webdriver || /^\/(portal|login|creative)/.test(location.pathname)) return;
    var ref = ''; try { ref = document.referrer ? new URL(document.referrer).hostname : ''; } catch (e) {}
    var utm = ''; try { utm = new URLSearchParams(location.search).get('utm_source') || ''; } catch (e) {}
    var send = function (beat) {
      var nav = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
      var b = JSON.stringify({ p: location.pathname, r: ref, u: utm, d: matchMedia('(max-width:720px)').matches ? 'm' : 'd', t: nav ? Math.round(nav.loadEventEnd || nav.domContentLoadedEventEnd || 0) : 0, h: beat ? 1 : 0 });
      if (navigator.sendBeacon && navigator.sendBeacon('/api/site-pulse', new Blob([b], { type: 'application/json' }))) return;
      fetch('/api/site-pulse', { method: 'POST', body: b, headers: { 'content-type': 'application/json' }, keepalive: true }).catch(function () {});
    };
    var go = function () { setTimeout(function () { send(false); }, 0); };
    if (document.readyState === 'complete') go(); else addEventListener('load', go);
    // while the page stays open and visible, a quiet "still here" every minute (for 30 minutes at most): the live view knows she is reading
    var n = 0, beat = setInterval(function () { if (++n > 30) { clearInterval(beat); return; } if (!document.hidden) send(true); }, 60000);
  } catch (e) { /* the site works the same without it */ }
})();
