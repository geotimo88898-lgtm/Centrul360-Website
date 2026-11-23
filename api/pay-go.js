// /api/pay-go: the tap on „Plătesc” (the Partners way, c360-pay.js) as a form sent to a new tab. This tab does the rest by
// itself: her name and phone saved on the order, the order's myPOS page made (or the one made before), then it goes there. The
// page behind does nothing more (iOS stops it as soon as the new tab opens: 23.11, the card orders left without a request).
// A card whose page can't be made goes to its own PayLink (same sum). Anything else: a small page that says what failed.
//   POST (form or JSON) { orderId, key, name?, phone?, notice? }   → text/html, sent in two parts: „Se deschide plata…” at once,
//   then location.replace(<myPOS page>) or what failed (a bad request before that: the error page with its status)
// Same origin only; the key is the order's secret; name and phone only in the body, never in a URL or a log.
const P = require('./_lib/pay');

const ourOrigin = (o) => !o || /^https:\/\/([\w-]+\.)?centrul360\.com$/.test(o) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o);
// myPOS's pages are https (the local test stand-in is on localhost)
const okUrl = (u) => /^https:\/\//.test(String(u || '')) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(String(u || ''));
const tries = new Map(); // ip → [times] (per warm instance)
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SAY = {
  not_found: 'Nu am găsit plata. Închide fila și încearcă din nou din pagină.',
  not_open: 'Plata asta nu mai e deschisă. Închide fila și încearcă din nou din pagină.',
  already_paid: 'E deja plătită. Mulțumim!',
  off: 'Plata online nu e pornită acum. Poți plăti în clinică.',
  missing_contact: 'Lipsesc numele și telefonul. Întoarce-te la plată și scrie-le.',
  missing_name: 'Lipsește numele. Întoarce-te la plată și scrie-l.',
  bad_phone: 'Numărul de telefon nu pare corect. Întoarce-te la plată și verifică-l.',
  has_booking: 'Ai deja o programare în ziua asta. Pentru încă una, scrie-ne pe WhatsApp.',
  too_many: 'Prea multe încercări într-un timp scurt. Încearcă din nou peste câteva minute.',
  forbidden: 'Plata se deschide doar din site-ul Centrul360.',
};
const CSS = '<style>body{margin:0;background:#f6f4ef;color:#1d1d1f;font:16px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}main{max-width:420px;margin:0 auto;padding:56px 20px}' +
  'h1{font-size:22px;margin:0 0 10px}p{margin:0 0 20px;color:#4a4a4f}button,a.b{display:block;width:100%;box-sizing:border-box;padding:15px 18px;border:0;border-radius:14px;background:#0f9083;color:#fff;font:600 16px system-ui,sans-serif;text-align:center;text-decoration:none;cursor:pointer}' +
  'small{display:block;margin-top:18px;color:#8a8a8f;font-size:12px}.sp{width:34px;height:34px;margin:0 0 22px;border:3px solid #cfe7e3;border-top-color:#0f9083;border-radius:50%;animation:r .8s linear infinite}@keyframes r{to{transform:rotate(360deg)}}</style>';
const top = () => '<!doctype html><html lang="ro"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Plata</title>' + CSS + '</head><body>';
function failHtml(code, extra) {
  const msg = SAY[code] || 'myPOS nu a răspuns cum trebuie. Banii nu au fost luați. Încearcă din nou peste un minut.';
  return '<main>' +
    '<h1>' + (code === 'already_paid' ? 'Plătit' : 'Plata nu s-a deschis') + '</h1><p>' + esc(msg) + '</p>' +
    '<button type="button" id="b">Înapoi la plată</button>' + (extra ? '<small>' + esc(extra) + '</small>' : '') +
    // the tab opened by the site closes (she is back on the payment screen); opened in place (an app's browser): back
    '<script>document.getElementById("b").onclick=function(){try{window.close()}catch(e){}setTimeout(function(){if(history.length>1)history.back();else location.href="/"},250)}</script>' +
    '</main>';
}
function page(res, status, code, extra) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('X-Robots-Tag', 'noindex');
  res.end(top() + failHtml(code, extra) + '</body></html>');
}
// the wait, shown at once (the tab is never blank while myPOS is asked): the page is sent in two parts, its end says where to go
const WAIT = '<main id="w"><div class="sp"></div><h1>Se deschide plata securizată myPOS…</h1><p>Câteva secunde.</p></main><!--' + ' '.repeat(1200) + '-->';
const goTo = (url) => '<script>location.replace(' + JSON.stringify(url).replace(/</g, '\\u003c') + ')</script><main><a class="b" href="' + esc(url) + '">Deschide plata myPOS</a></main></body></html>';

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!ourOrigin(String(req.headers.origin || ''))) { page(res, 403, 'forbidden'); return; }
  if (req.method !== 'POST') { page(res, 405, 'not_found'); return; }
  let b = req.body || {};
  if (typeof b === 'string') { try { b = /^\s*\{/.test(b) ? JSON.parse(b) : Object.fromEntries(new URLSearchParams(b)); } catch (e) { b = {}; } }
  if (Buffer.isBuffer(b)) { try { b = Object.fromEntries(new URLSearchParams(b.toString('utf8'))); } catch (e) { b = {}; } }
  const ip = String(req.headers['x-forwarded-for'] || req.headers['cf-connecting-ip'] || '').split(',')[0].trim() || 'x';
  const now = Date.now(), mine = (tries.get(ip) || []).filter((t) => now - t < 10 * 60e3);
  if (mine.length >= 30) { page(res, 429, 'too_many'); return; }
  tries.set(ip, mine.concat(now));
  const id = String(b.orderId || '').slice(0, 40), key = String(b.key || '').slice(0, 80);
  if (!P.validId(id) || !key) { page(res, 404, 'not_found'); return; }
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('X-Robots-Tag', 'noindex');
  res.write(top() + WAIT);
  const failed = (code, extra) => { res.end('<style>#w{display:none}</style>' + failHtml(code, extra) + '</body></html>'); };
  try {
    // her name and phone (when the page sent them): saved first, as the screen would have (not again when already there)
    let pre = await P.readOrder(id);
    if (b.name || b.phone) {
      const o = pre.data;
      const d9 = (x) => String(x || '').replace(/\D/g, '').slice(-9);
      const same = o && o.phone && d9(o.phone) === d9(b.phone) && String(o.name || '') === String(b.name || '').trim().slice(0, 100);
      if (!same) {
        const c = await P.contact(id, key, { name: b.name, phone: b.phone, notice: String(b.notice || 'whatsapp-confirmation'), consent: true });
        if (c.error && c.error !== 'not_open') { failed(c.error); P.later(P.trace(id, key, 'go-contact', c.error)); return; }
        if (c._order) pre = { data: c._order };
      }
    }
    const r = await P.link(id, key, pre);
    if (r.ok && okUrl(r.url)) { res.end(goTo(r.url)); return; }
    // a card: its own PayLink, same sum (never a dead end)
    const fb = r.error && !['not_found', 'already_paid', 'not_open'].includes(r.error) ? await P.cardFallback(id, key) : null;
    if (fb) { res.end(goTo(fb)); P.later(P.trace(id, key, 'go-paylink', r.error)); return; }
    failed(r.error || 'failed', r.status ? 'Cod myPOS: ' + r.status : '');
    P.later(P.trace(id, key, 'go-fail', r.error || 'failed'));
  } catch (e) {
    console.error('pay-go:', e.message);
    failed('failed');
  }
};
