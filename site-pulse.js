/* Centrul360: the visit counter of the site (seen in the portal, Admin → Site). No cookie, nothing stored on this device,
   nothing that names anyone: the page, where the visit came from, phone or computer, how fast the page loaded.
   And the funnel (21.11): which source she came from (the link's utm, else the app she reads in, else the referrer) and the
   steps she took (a main button, the buying window, a lead, the payment page): window.C360P.ev('cta' | 'open' | 'start' |
   'lead' | 'pay'), counted once per visit on the server (api/_lib/site-funnel.js). */
(function () {
  try {
    if (navigator.webdriver || /^\/(portal|login|creative)/.test(location.pathname)) return;
    var ref = ''; try { ref = document.referrer ? new URL(document.referrer).hostname : ''; } catch (e) {}
    var q = {}; try { new URLSearchParams(location.search).forEach(function (v, k) { q[k] = v; }); } catch (e) {}
    var utm = q.utm_source || '';
    var ua = navigator.userAgent || '';
    // the source: the link's own words first (utm_source[:utm_medium]), then the app she reads in, then the site before
    var src = (function () {
      if (utm) return utm + (q.utm_medium ? ':' + q.utm_medium : '');
      if (/Instagram/i.test(ua)) return 'instagram';
      if (/FBAN|FBAV|FB_IAB/i.test(ua)) return 'facebook';
      if (/musical_ly|TikTok|Bytedance/i.test(ua)) return 'tiktok';
      var r = ref.replace(/^www\./, '');
      if (!r || /centrul360\.com$/.test(r)) return q.fbclid ? 'facebook' : 'direct';
      if (/instagram/.test(r)) return 'instagram';
      if (/facebook|fb\.(me|com)/.test(r)) return 'facebook';
      if (/tiktok/.test(r)) return 'tiktok';
      if (/youtube|youtu\.be/.test(r)) return 'youtube';
      if (/google\./.test(r)) return 'google';
      if (/whatsapp|wa\.me|l\.wl\.co/.test(r)) return 'whatsapp';
      return 'altele';
    })();
    var post = function (o) {
      var b = JSON.stringify(o);
      if (navigator.sendBeacon && navigator.sendBeacon('/api/site-pulse', new Blob([b], { type: 'application/json' }))) return;
      fetch('/api/site-pulse', { method: 'POST', body: b, headers: { 'content-type': 'application/json' }, keepalive: true }).catch(function () {});
    };
    var send = function (beat) {
      var nav = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
      post({ p: location.pathname, r: ref, u: utm, s: src, d: matchMedia('(max-width:720px)').matches ? 'm' : 'd', t: nav ? Math.round(nav.loadEventEnd || nav.domContentLoadedEventEnd || 0) : 0, h: beat ? 1 : 0 });
    };
    var sent = {};
    var ev = function (name) { if (!name || sent[name]) return; sent[name] = 1; post({ p: location.pathname, s: src, e: String(name) }); };
    window.C360P = { ev: ev, src: src };
    // a main button: the card (buy, reserve), the lead filter, a booking
    document.addEventListener('click', function (e) { if (e.target && e.target.closest && e.target.closest('[data-cs-buy],[data-cs-reserve],[data-lf],[data-book]')) ev('cta'); }, true);
    var go = function () { setTimeout(function () { send(false); }, 0); };
    if (document.readyState === 'complete') go(); else addEventListener('load', go);
    // while the page stays open and visible, a quiet "still here" every minute (for 30 minutes at most): the live view knows she is reading
    var n = 0, beat = setInterval(function () { if (++n > 30) { clearInterval(beat); return; } if (!document.hidden) send(true); }, 60000);
  } catch (e) { /* the site works the same without it */ }
})();
