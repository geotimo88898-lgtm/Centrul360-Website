// POST /api/portal-offer-pdf, one offer of the Calculator ofertă as a one-page A4 PDF (the owner, 23.11): the desk downloads it
// and sends it to the client on WhatsApp. Anyone signed in. Only what the calculator holds: the program (treatment, zone,
// sessions, the list price, the subtotal), the total at list price, then that one offer (its name, the discount, what she
// pays, the installments), the duration and the result when they were filled in, and the clinic's contact. No validity date,
// no promises, no reviews.
//   { offer: offerData() (portal-academy.js), page: 0-3, client: her name (optional) } → application/pdf
// Drawn as SVG with the site's fonts (Inter, Montserrat: api/_lib/card-fonts.gen.js), made a PNG by resvg (the card's own
// renderer, api/_lib/card-image.js render) and put on an A4 page by pdf-lib: the Romanian letters come out right, which
// pdf-lib's standard fonts can't do.

const { PDFDocument } = require('pdf-lib');
const { requireAuth } = require('./_lib/auth');

const CLINIC = {
  tm: { name: 'Timișoara', addr: 'Str. Bucegi 7, Timișoara', tel: '0750 452 002', hours: 'L-V 09:00-20:00' },
  ar: { name: 'Arad', addr: 'Str. Ioan Alexandru 16-18, Arad', tel: '0750 277 394', hours: 'L-V 11:00-19:00' },
};
const MONTHS = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clip = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const lei = (n) => Math.round(num(n)).toLocaleString('ro-RO').replace(/\s/g, '.') + ' lei';
const dec = (n) => String(Math.round(num(n) * 100) / 100).replace('.', ',');
const roToday = () => { const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest', year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(new Date()).map((x) => [x.type, x.value])); return Number(p.day) + ' ' + MONTHS[Number(p.month) - 1] + ' ' + p.year; };
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

// the page: 1240 × 1754 px (A4 at 150 dpi), drawn at 2× for a sharp print
const PW = 1240, PH = 1754, SC = 2;
const INK = '#0b0b0d', MUTE = '#5d6167', LINE = '#e6e7ea', TEAL = '#0f9083', TINT = '#eef8f6';

// a text cut to a width (a rough measure: Inter's average letter)
const fit = (t, px, size) => { const max = Math.floor(px / (size * 0.53)); const s = String(t || ''); return s.length > max ? s.slice(0, Math.max(1, max - 1)).trim() + '…' : s; };
// lines of at most a width
function wrap(t, px, size) {
  const max = Math.floor(px / (size * 0.5)), out = [];
  let cur = '';
  String(t || '').split(/\s+/).filter(Boolean).forEach((w) => { if ((cur + ' ' + w).trim().length > max) { if (cur) out.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); });
  if (cur) out.push(cur);
  return out;
}
const T = (x, y, s, o) => '<text x="' + x + '" y="' + y + '" font-family="' + ((o && o.f) || 'Inter') + '" font-size="' + ((o && o.size) || 22) + '" font-weight="' + ((o && o.w) || 400) + '" fill="' + ((o && o.c) || INK) + '"' + (o && o.a ? ' text-anchor="' + o.a + '"' : '') + (o && o.ls ? ' letter-spacing="' + o.ls + '"' : '') + '>' + esc(s) + '</text>';

function svgOf(d) {
  const M = 90, W = PW - M * 2;
  const c = CLINIC[d.city] || null;
  let y = 0, s = '';
  // the head: the mark and the name, the clinic's contact on the right
  s += '<g transform="translate(' + M + ' 92) scale(' + (64 / 550) + ') translate(-130 -130)" fill="none" stroke="' + TEAL + '" stroke-width="22"><circle cx="405" cy="405" r="262"/><ellipse cx="405" cy="405" rx="104" ry="207"/><ellipse cx="405" cy="405" rx="207" ry="113"/></g>';
  s += '<text x="' + (M + 82) + '' + '" y="136" font-family="Montserrat" font-size="30" fill="' + INK + '"><tspan font-weight="800">CENTRUL360</tspan><tspan font-weight="300">.COM</tspan></text>';
  if (c) {
    s += T(PW - M, 108, 'Clinica ' + c.name, { size: 21, w: 700, a: 'end' }) + T(PW - M, 138, c.addr, { size: 19, c: MUTE, a: 'end' }) +
      T(PW - M, 166, c.tel + ' · ' + c.hours, { size: 19, c: MUTE, a: 'end' });
  } else s += T(PW - M, 120, 'Timișoara și Arad', { size: 20, c: MUTE, a: 'end' });
  s += '<rect x="' + M + '" y="206" width="' + W + '" height="2" fill="' + LINE + '"/>';
  // the title
  y = 300;
  s += T(M, y, 'Oferta ta personalizată', { size: 56, w: 800, ls: -1.2 });
  y += 50;
  s += T(M, y, [d.client ? 'Pentru ' + d.client : '', roToday(), c ? 'Clinica ' + c.name : ''].filter(Boolean).join(' · '), { size: 23, c: MUTE });
  // the program
  y += 76;
  s += T(M, y, 'PROGRAMUL RECOMANDAT', { size: 18, w: 700, c: TEAL, ls: 2.4 });
  y += 26;
  // treatment and zone from the left; sessions, the price and the subtotal by their right edge
  const X = { name: M + 20, zone: M + 420, ses: M + 690, unit: M + 880, sub: PW - M - 20 };
  const head = (x, t, a) => T(x, y + 34, t, { size: 17, w: 600, c: MUTE, a });
  s += '<rect x="' + M + '" y="' + y + '" width="' + W + '" height="52" rx="12" fill="#f4f5f6"/>';
  s += head(X.name, 'Tratament') + head(X.zone, 'Zona') + head(X.ses, 'Ședințe', 'end') + head(X.unit, 'Preț / ședință', 'end') + head(X.sub, 'Subtotal', 'end');
  y += 52;
  d.lines.forEach((l) => {
    const h = 62;
    s += T(X.name, y + 40, fit(l.name, 380, 22), { size: 22, w: 600 }) + T(X.zone, y + 40, fit(l.zone || '', 240, 21), { size: 21, c: MUTE }) +
      T(X.ses, y + 40, dec(l.sessions), { size: 22, a: 'end' }) + T(X.unit, y + 40, lei(l.unit), { size: 22, a: 'end' }) + T(X.sub, y + 40, lei(l.sub), { size: 22, w: 600, a: 'end' });
    y += h;
    s += '<rect x="' + M + '" y="' + y + '" width="' + W + '" height="1.5" fill="' + LINE + '"/>';
  });
  y += 50;
  const custom = d.lines.some((l) => l.custom); // a price per session set by the desk: not the list price any more
  s += T(X.name, y, custom ? 'Total' : 'Total la preț de listă', { size: 24, w: 600 }) + T(X.sub, y, lei(d.total), { size: 30, w: 800, a: 'end' });
  // the offer
  y += 56;
  const p = d.page, half = p.index >= 2;
  const boxH = 250 + (p.parts ? 44 : 0) + (half ? 40 : 0);
  s += '<rect x="' + M + '" y="' + y + '" width="' + W + '" height="' + boxH + '" rx="26" fill="' + TINT + '" stroke="#bfe5df" stroke-width="2"/>';
  let oy = y + 62;
  s += T(M + 40, oy, 'OFERTA', { size: 18, w: 700, c: TEAL, ls: 2.4 });
  s += '<rect x="' + (PW - M - 40 - 170) + '" y="' + (oy - 34) + '" width="170" height="48" rx="24" fill="' + TEAL + '"/>' + T(PW - M - 40 - 85, oy - 2, '-' + dec(p.off) + '% reducere', { size: 20, w: 700, c: '#ffffff', a: 'middle' });
  oy += 52;
  s += T(M + 40, oy, p.name, { size: 34, w: 800, ls: -0.4 });
  if (half) { oy += 40; s += T(M + 40, oy, 'Jumătate din program: ' + lei(d.half) + (d.lines.some((l) => l.custom) ? '' : ' la preț de listă'), { size: 21, c: MUTE }); }
  oy += 78;
  s += T(M + 40, oy, 'Plătești', { size: 24, c: MUTE }) + T(M + 150, oy, lei(p.pay), { size: 58, w: 800, ls: -1.2, c: INK });
  if (p.parts) { oy += 48; s += T(M + 40, oy, lei(p.pay / p.parts) + ' la fiecare din primele ' + p.parts + ' ședințe', { size: 24, w: 600, c: TEAL }); }
  y += boxH;
  // the duration, the result (only when filled in)
  if (d.duration || d.result) {
    y += 64;
    if (d.duration) { s += T(M, y, 'Durata estimată', { size: 18, w: 700, c: TEAL, ls: 1.6 }) + T(M + 260, y, d.duration, { size: 23, w: 600 }); y += 46; }
    if (d.result) {
      s += T(M, y, 'Rezultat estimat', { size: 18, w: 700, c: TEAL, ls: 1.6 });
      wrap(d.result, W - 260, 23).slice(0, 4).forEach((ln, i) => { s += T(M + 260, y + i * 34, ln, { size: 23 }); });
      y += 34 * Math.min(4, wrap(d.result, W - 260, 23).length) + 12;
    }
  }
  // the foot
  s += '<rect x="' + M + '" y="' + (PH - 150) + '" width="' + W + '" height="2" fill="' + LINE + '"/>';
  s += T(M, PH - 104, 'Rezultatele diferă de la o persoană la alta.', { size: 20, c: MUTE });
  s += T(PW - M, PH - 104, 'www.centrul360.com', { size: 20, w: 600, c: INK, a: 'end' });
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + PW * SC + '" height="' + PH * SC + '" viewBox="0 0 ' + PW + ' ' + PH + '"><rect width="' + PW + '" height="' + PH + '" fill="#ffffff"/>' + s + '</svg>';
}

// the offer as the calculator sends it, cleaned; page: which of the 4
function clean(b) {
  const o = (b && b.offer) || {};
  const k = Math.max(0, Math.min(3, Math.round(num(b && b.page))));
  const pages = Array.isArray(o.pages) ? o.pages : [];
  const pg = pages[k];
  const lines = (Array.isArray(o.lines) ? o.lines : []).slice(0, 14).map((l) => ({ name: clip(l.name, 80), zone: clip(l.zone, 60), sessions: num(l.sessions), unit: num(l.unit), sub: num(l.sub), custom: !!l.custom })).filter((l) => l.name);
  if (!pg || !lines.length) return null;
  const parts = Math.max(0, Math.min(24, Math.round(num(pg.parts))));
  // the offer's name as the calculator says it (an edited offer may be paid all today or in other installments)
  const NAME = [0, 1, 2, 3].map((i) => (i < 2 ? 'Tot programul' : 'Jumătate de program') + (parts ? ', în ' + parts + ' rate' : ', plătit azi'));
  return { city: o.city === 'ar' || o.city === 'tm' ? o.city : '', total: num(o.total), half: num(o.half), duration: clip(o.duration, 60), result: clip(o.result, 300), lines,
    client: clip(b.client, 60), page: { index: k, name: NAME[k], off: num(pg.off), pay: num(pg.pay), parts } };
}

async function build(d) {
  const png = await require('./_lib/card-image').render(svgOf(d));
  const doc = await PDFDocument.create();
  doc.setTitle('Oferta ta personalizată · Centrul360');
  doc.setAuthor('Centrul360');
  const img = await doc.embedPng(png);
  const page = doc.addPage([595.28, 841.89]);
  page.drawImage(img, { x: 0, y: 0, width: 595.28, height: 841.89 });
  return Buffer.from(await doc.save());
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return; }
  const session = await requireAuth(req, res);
  if (!session) return;
  let b = req.body || {};
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
  const d = clean(b);
  if (!d) { res.status(400).json({ error: 'no_offer' }); return; }
  try {
    const pdf = await build(d);
    const name = 'Oferta-Centrul360-' + (fold(d.client) || roToday().replace(/\s+/g, '-')) + '-' + (d.page.index + 1) + '.pdf';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="' + name + '"');
    res.status(200).send(pdf);
  } catch (err) {
    console.error('offer pdf:', err.message);
    res.status(500).json({ error: 'failed' });
  }
};
module.exports.svgOf = svgOf;
module.exports.clean = clean;
module.exports.build = build;
