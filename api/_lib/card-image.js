// The Card de Sărbători as a picture (the owner, 21.11; its VIP one, black and gold, 22.11: o.vip): the card she gets on WhatsApp, with her name (or the name of the one
// she gives it to), the credit, the code and the date it is valid until. The same card as on the site (v2/cs-card.css):
// raspberry rose, gold foil, the gold ribbon and bow, gold snowflakes, the fir sprig with red berries, and in its top left
// corner the gold holly sprig (the owner, 21.11: the Santa hat did not look good). Drawn as SVG here, made a PNG by resvg
// (WebAssembly): on Cloudflare the Worker gives it as globalThis.__C360_SVG2PNG (cf/card-png.js); in Node (the tests, a
// local run) the same package is loaded from node_modules. The fonts (Inter, Montserrat; OFL) are in card-fonts.gen.js.

const W = 1000, H = 631; // the card, 1.586 like the site's
const CW = 1200, CH = 900; // the picture: the card on a soft light, room for the shadow

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const lei = (n) => Math.round(Number(n) || 0).toLocaleString('ro-RO').replace(/ /g, '.');
const f1 = (n) => Math.round(n * 10) / 10;

// ---- the holly sprig, gold: two leaves with their spikes and a vein, three berries (also drawn on the site's card)
function leaf(L, Wd, n) {
  // n spikes on each side; the edge curves inwards between them, like a real holly leaf
  const pts = (sign) => {
    const out = [];
    for (let i = 1; i <= n; i++) { const t = i / (n + 1); out.push([t * L, sign * Math.sin(Math.PI * t) * Wd * (0.86 + 0.14 * Math.sin(i))]); }
    return out;
  };
  let d = 'M0 0';
  let prev = [0, 0];
  const up = pts(-1).concat([[L, 0]]);
  for (const p of up) {
    const mx = (prev[0] + p[0]) / 2, my = (prev[1] + p[1]) / 2 * 0.52;
    d += 'Q' + f1(mx) + ' ' + f1(my) + ' ' + f1(p[0]) + ' ' + f1(p[1]);
    prev = p;
  }
  const down = pts(1).reverse().concat([[0, 0]]);
  for (const p of down) {
    const mx = (prev[0] + p[0]) / 2, my = (prev[1] + p[1]) / 2 * 0.52;
    d += 'Q' + f1(mx) + ' ' + f1(my) + ' ' + f1(p[0]) + ' ' + f1(p[1]);
    prev = p;
  }
  return d + 'Z';
}
const LEAF = leaf(100, 30, 4);
// viewBox 0 0 200 150; ids prefixed with p (two cards on one page keep their own gradients)
function hollySvg(p) {
  const g = (id) => p + id;
  return '<svg viewBox="0 0 200 150" aria-hidden="true">' +
    '<defs><linearGradient id="' + g('Hl') + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff3c8"/><stop offset=".35" stop-color="#e8bf62"/><stop offset=".7" stop-color="#b8862e"/><stop offset="1" stop-color="#f4d68c"/></linearGradient>' +
    '<linearGradient id="' + g('Hd') + '" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#9a6a1f"/><stop offset="1" stop-color="#d8ab4f"/></linearGradient>' +
    '<radialGradient id="' + g('Hb') + '" cx=".34" cy=".32" r=".72"><stop offset="0" stop-color="#ff6b7c"/><stop offset=".55" stop-color="#d0142f"/><stop offset="1" stop-color="#7d0818"/></radialGradient></defs>' +
    '<g transform="translate(100 82) rotate(-152)"><path d="' + LEAF + '" fill="url(#' + g('Hl') + ')" stroke="#a87526" stroke-width="1.1"/><path d="M4 0Q50 -3 94 0" fill="none" stroke="url(#' + g('Hd') + ')" stroke-width="2.2" stroke-linecap="round"/></g>' +
    '<g transform="translate(100 82) rotate(-28)"><path d="' + LEAF + '" fill="url(#' + g('Hl') + ')" stroke="#a87526" stroke-width="1.1"/><path d="M4 0Q50 3 94 0" fill="none" stroke="url(#' + g('Hd') + ')" stroke-width="2.2" stroke-linecap="round"/></g>' +
    '<g transform="translate(100 82) rotate(-92) scale(.72)"><path d="' + LEAF + '" fill="url(#' + g('Hl') + ')" stroke="#a87526" stroke-width="1.4" opacity=".96"/><path d="M4 0Q50 2 94 0" fill="none" stroke="url(#' + g('Hd') + ')" stroke-width="2.6" stroke-linecap="round"/></g>' +
    '<circle cx="92" cy="92" r="11" fill="url(#' + g('Hb') + ')"/><circle cx="111" cy="95" r="10" fill="url(#' + g('Hb') + ')"/><circle cx="101" cy="108" r="10.5" fill="url(#' + g('Hb') + ')"/>' +
    '<circle cx="88.5" cy="88" r="3" fill="#fff" opacity=".8"/><circle cx="107.8" cy="91.2" r="2.7" fill="#fff" opacity=".8"/><circle cx="97.6" cy="104.2" r="2.8" fill="#fff" opacity=".8"/></svg>';
}

// the gold bow, the fir sprig, the flakes: the site's own drawings (v2/src/card-sarbatori.html), as they are
const BOW = '<defs><linearGradient id="kBg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff2c6"/><stop offset=".3" stop-color="#e6bb5c"/><stop offset=".62" stop-color="#b8862e"/><stop offset="1" stop-color="#f3d589"/></linearGradient><linearGradient id="kBd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a8782a"/><stop offset="1" stop-color="#7d5419"/></linearGradient></defs><path d="M95 80L66 140L80 131L88 146L104 84Z" fill="url(#kBg)"/><path d="M105 80L134 140L120 131L112 146L96 84Z" fill="url(#kBg)"/><path d="M100 72C72 26 18 14 18 50C18 84 70 86 100 72Z" fill="url(#kBg)"/><path d="M100 72C128 26 182 14 182 50C182 84 130 86 100 72Z" fill="url(#kBg)"/><path d="M96 70C76 44 44 34 38 50C46 62 74 70 96 70Z" fill="url(#kBd)" opacity=".55"/><path d="M104 70C124 44 156 34 162 50C154 62 126 70 104 70Z" fill="url(#kBd)" opacity=".55"/><path d="M30 44C40 30 60 30 74 40" fill="none" stroke="#fff8dc" stroke-opacity=".7" stroke-width="2.4" stroke-linecap="round"/><rect x="87" y="58" width="26" height="28" rx="9" fill="url(#kBg)"/><path d="M92 64C96 61 104 61 108 64" stroke="#fff8dc" stroke-opacity=".8" stroke-width="2" fill="none" stroke-linecap="round"/>';
function fir() {
  // the same branches as the site's sprig: a stem and needles both sides
  const br = (x1, y1, x2, y2, n) => {
    let s = '<path d="M' + x1 + ' ' + y1 + 'L' + x2 + ' ' + y2 + '" stroke="#5b3a1e" stroke-width="1.6" stroke-linecap="round"/>';
    for (let i = 0; i < n; i++) {
      const t = i / n, x = x1 + (x2 - x1) * t, y = y1 + (y2 - y1) * t, len = 15 * (1 - t * 0.4);
      const a = Math.atan2(y2 - y1, x2 - x1);
      const l1 = [x + Math.cos(a - 2.2) * len, y + Math.sin(a - 2.2) * len], l2 = [x + Math.cos(a + 2.2) * len, y + Math.sin(a + 2.2) * len];
      s += '<path d="M' + f1(x) + ' ' + f1(y) + 'L' + f1(l1[0]) + ' ' + f1(l1[1]) + '" stroke="' + (i % 2 ? '#2f7d52' : '#1f5c3e') + '" stroke-width="1.5" stroke-linecap="round"/>';
      s += '<path d="M' + f1(x) + ' ' + f1(y) + 'L' + f1(l2[0]) + ' ' + f1(l2[1]) + '" stroke="' + (i % 2 ? '#1f5c3e' : '#2f7d52') + '" stroke-width="1.5" stroke-linecap="round"/>';
    }
    return s;
  };
  return '<defs><radialGradient id="kBr" cx=".35" cy=".35" r=".7"><stop offset="0" stop-color="#ff5a6e"/><stop offset=".6" stop-color="#d0142f"/><stop offset="1" stop-color="#8c0a1f"/></radialGradient></defs><g fill="none">' +
    br(118, 98, 34, 40, 15) + br(118, 98, 70, 22, 11) + br(96, 84, 52, 78, 7) + '</g>' +
    [[80, 62, 5], [88, 58, 4.4], [84, 70, 4.6], [73, 57, 3.8]].map(([x, y, r]) => '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="url(#kBr)"/><circle cx="' + f1(x - r * 0.36) + '" cy="' + f1(y - r * 0.36) + '" r="' + f1(r * 0.28) + '" fill="#fff" opacity=".75"/>').join('');
}
function flake(cx, cy, r, op) {
  let d = '';
  for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; d += 'M' + f1(cx) + ' ' + f1(cy) + 'L' + f1(cx + Math.cos(a) * r) + ' ' + f1(cy + Math.sin(a) * r); }
  return '<path d="' + d + '" opacity="' + op + '"/>';
}
const STAR = 'M12 1.5l2.2 8.3 8.3 2.2-8.3 2.2-2.2 8.3-2.2-8.3L1.5 12l8.3-2.2z';

// the two cards: the raspberry one, and the VIP one („Cardul VIP Transformarea 360”, the owner 22.11): black with gold, the
// same ribbon, bow, holly and sprig, its words in gold
const PAL = {
  rose: { back: ['#fff8f3', '#fbe9ea'], glow: ['#f4b8c6', '#e3c27a'], card: ['#ec87a6', '#d9497f', '#c2185b', '#9c0f4a', '#7e0b3c'], hi: '#ffcede', hiOp: '.55', lo: '#46001e',
    deep: '#46001c', base: '#5e0a2c', shadow: '#821436', dots: ['#ec87a6', '#e3c27a'], lines: '#ffebd2', label: 'CARDUL DE SĂRBĂTORI', sub: 'pentru orice tratament', creditSize: 12.6, ink: '#fff6ea', ink2: '#fff3e4' },
  vip: { back: ['#f7f3ea', '#ece3d1'], glow: ['#e3c27a', '#cfa75a'], card: ['#3a3229', '#221d18', '#14110e', '#0b0907', '#050403'], hi: '#fff1c9', hiOp: '.16', lo: '#000000',
    deep: '#000000', base: '#030201', shadow: '#2b2114', dots: ['#d9b465', '#e3c27a'], lines: '#ffe7a8', label: 'VIP · TRANSFORMAREA 360', sub: 'pentru tine și toată familia', creditSize: 10.8, ink: '#fbecc6', ink2: '#f1dfb4' },
};

// ---- the card: { credit, name, code, valid, mark, vip } → SVG of the whole picture (mark: „Rezervat” in place of the code)
function svgOf(o) {
  const P = o.vip ? PAL.vip : PAL.rose;
  const credit = lei(o.credit), code = String(o.code || ''), valid = o.valid || '30.06.2027';
  let name = String(o.name || '').trim() || 'Pentru tine';
  if (name.length > 30) name = name.slice(0, 29).trim() + '…';
  const u = W / 100; // one cqw of the site's card
  const gold = 'url(#kGold)';
  const x0 = (CW - W) / 2, y0 = 150;
  const nameSize = Math.min(3.7 * u, (44 * u) / (0.58 * name.length)); // never under the date
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + CW + '" height="' + CH + '" viewBox="0 0 ' + CW + ' ' + CH + '">' +
    '<defs>' +
      '<linearGradient id="kBack" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + P.back[0] + '"/><stop offset="1" stop-color="' + P.back[1] + '"/></linearGradient>' +
      '<radialGradient id="kGlow" cx=".5" cy=".46" r=".5"><stop offset="0" stop-color="' + P.glow[0] + '" stop-opacity=".55"/><stop offset=".6" stop-color="' + P.glow[1] + '" stop-opacity=".16"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>' +
      '<linearGradient id="kCard" x1="0" y1="0" x2="1" y2="1" gradientTransform="rotate(8 .5 .5)">' + [0, 0.26, 0.54, 0.78, 1].map((x, i) => '<stop offset="' + x + '" stop-color="' + P.card[i] + '"/>').join('') + '</linearGradient>' +
      '<radialGradient id="kHi" cx=".18" cy=".08" r=".7"><stop offset="0" stop-color="' + P.hi + '" stop-opacity="' + P.hiOp + '"/><stop offset="1" stop-color="' + P.hi + '" stop-opacity="0"/></radialGradient>' +
      '<radialGradient id="kLo" cx="1" cy="1" r=".75"><stop offset="0" stop-color="' + P.lo + '" stop-opacity=".5"/><stop offset="1" stop-color="' + P.lo + '" stop-opacity="0"/></radialGradient>' +
      '<linearGradient id="kGold" x1="0" y1="0" x2="1" y2=".2"><stop offset="0" stop-color="#ffe9a8"/><stop offset=".22" stop-color="#fff8dc"/><stop offset=".42" stop-color="#ffd978"/><stop offset=".6" stop-color="#fff3c4"/><stop offset=".8" stop-color="#f6c75a"/><stop offset="1" stop-color="#ffe7a0"/></linearGradient>' +
      '<linearGradient id="kRibV" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#9c6d22"/><stop offset=".14" stop-color="#e2b458"/><stop offset=".34" stop-color="#fff0c2"/><stop offset=".52" stop-color="#e9c06a"/><stop offset=".74" stop-color="#b4832b"/><stop offset=".9" stop-color="#f1d38a"/><stop offset="1" stop-color="#a8782a"/></linearGradient>' +
      '<linearGradient id="kRibH" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9c6d22"/><stop offset=".14" stop-color="#e2b458"/><stop offset=".34" stop-color="#fff0c2"/><stop offset=".52" stop-color="#e9c06a"/><stop offset=".74" stop-color="#b4832b"/><stop offset=".9" stop-color="#f1d38a"/><stop offset="1" stop-color="#a8782a"/></linearGradient>' +
      '<linearGradient id="kFg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff0c2"/><stop offset=".5" stop-color="#e2b458"/><stop offset="1" stop-color="#b4832b"/></linearGradient>' +
      '<pattern id="kLines" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(25)"><rect width="2" height="14" fill="' + P.lines + '" fill-opacity=".07"/></pattern>' +
      '<linearGradient id="kLineMask" x1="0" y1="0" x2="1" y2="0"><stop offset=".25" stop-color="#fff" stop-opacity="0"/><stop offset=".75" stop-color="#fff" stop-opacity="1"/></linearGradient>' +
      '<mask id="kLm"><rect width="' + W + '" height="' + H + '" fill="url(#kLineMask)"/></mask>' +
      '<clipPath id="kClip"><rect width="' + W + '" height="' + H + '" rx="44"/></clipPath>' +
      '<filter id="kSh" x="-20%" y="-20%" width="140%" height="160%"><feGaussianBlur stdDeviation="34"/></filter>' +
      '<filter id="kDrop" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="10" stdDeviation="10" flood-color="' + P.deep + '" flood-opacity=".42"/></filter>' +
      '<filter id="kTxt" x="-5%" y="-20%" width="110%" height="140%"><feDropShadow dx="0" dy="2.2" stdDeviation="0" flood-color="' + P.deep + '" flood-opacity=".7"/><feDropShadow dx="0" dy="0" stdDeviation="3" flood-color="' + P.deep + '" flood-opacity=".4"/></filter>' +
    '</defs>' +
    '<rect width="' + CW + '" height="' + CH + '" fill="url(#kBack)"/><rect width="' + CW + '" height="' + CH + '" fill="url(#kGlow)"/>' +
    // snow points on the light around it
    [[120, 120, 5], [1080, 110, 4], [1110, 760, 5], [80, 700, 4], [600, 70, 3], [300, 820, 3], [930, 840, 4]].map(([x, y, r], i) => '<circle cx="' + x + '" cy="' + y + '" r="' + r + '" fill="' + (i % 2 ? P.dots[1] : P.dots[0]) + '" opacity=".7"/>').join('') +
    // the shadow under the card
    '<ellipse cx="' + (CW / 2) + '" cy="' + (y0 + H + 18) + '" rx="420" ry="40" fill="' + P.shadow + '" opacity=".32" filter="url(#kSh)"/>' +
    '<g transform="translate(' + x0 + ' ' + y0 + ')">' +
      '<rect x="0" y="8" width="' + W + '" height="' + H + '" rx="44" fill="' + P.base + '"/>' +
      '<g clip-path="url(#kClip)">' +
        '<rect width="' + W + '" height="' + H + '" fill="url(#kCard)"/><rect width="' + W + '" height="' + H + '" fill="url(#kHi)"/><rect width="' + W + '" height="' + H + '" fill="url(#kLo)"/>' +
        '<rect width="' + W + '" height="' + H + '" fill="url(#kLines)" mask="url(#kLm)" opacity=".9"/>' +
        '<g fill="none" stroke="url(#kFg)" stroke-width="4" stroke-linecap="round">' + (o.vip ? '' : flake(555, 132, 22, 0.5)) + flake(940, 347, 40, 0.55) + flake(965, 50, 18, 0.45) + flake(28, 391, 18, 0.4) + '</g>' +
        // the ribbon round it, with its soft shadow
        '<rect x="' + (75 * u + 4) + '" y="0" width="' + (6.6 * u) + '" height="' + H + '" fill="' + P.deep + '" opacity=".22"/>' +
        '<rect x="' + (75 * u) + '" y="0" width="' + (6.6 * u) + '" height="' + H + '" fill="url(#kRibV)"/>' +
        '<rect x="0" y="' + (19.6 * u + 6) + '" width="' + W + '" height="' + (4.4 * u) + '" fill="' + P.deep + '" opacity=".22"/>' +
        '<rect x="0" y="' + (19.6 * u) + '" width="' + W + '" height="' + (4.4 * u) + '" fill="url(#kRibH)"/>' +
        '<g transform="translate(' + (W + 1.5 * u - 27 * u) + ' ' + (H + 2 * u - 22.5 * u) + ') scale(' + (27 * u / 120) + ')" filter="url(#kDrop)">' + fir() + '</g>' +
        '<g fill="#ffe7a8">' + [[92, 6, 2.4], [70, 40, 2.2], [2.6, 44, 2]].map(([x, y, s]) => '<path transform="translate(' + (x * u) + ' ' + (y * u) + ') scale(' + (s * u / 24) + ')" d="' + STAR + '"/>').join('') + '</g>' +
      '</g>' +
      '<rect x=".5" y=".5" width="' + (W - 1) + '" height="' + (H - 1) + '" rx="44" fill="none" stroke="#f2cf7e" stroke-opacity=".45" stroke-width="2"/>' +
      '<g transform="translate(' + (62.8 * u) + ' ' + (7 * u) + ') scale(' + (31 * u / 200) + ')" filter="url(#kDrop)">' + BOW + '</g>' +
      // the words
      '<g transform="translate(' + (20.5 * u) + ' ' + (4.4 * u) + ')"><g transform="scale(' + (6.4 * u / 550) + ') translate(-130 -130)" fill="none" stroke="#f3d589" stroke-width="16"><circle cx="405" cy="405" r="262"/><ellipse cx="405" cy="405" rx="104" ry="207"/><ellipse cx="405" cy="405" rx="207" ry="113"/></g>' +
        '<text x="' + (8.4 * u) + '" y="' + (4.55 * u) + '" font-family="Montserrat" font-size="' + (3.5 * u) + '" fill="#fff6ea"><tspan font-weight="800">CENTRUL360</tspan><tspan font-weight="300">.COM</tspan></text></g>' +
      '<g transform="translate(' + (7 * u) + ' ' + (13.4 * u) + ')"><path transform="scale(' + (3.2 * u / 24) + ')" d="' + STAR + '" fill="#ffe7a8"/>' +
        '<text x="' + (4.7 * u) + '" y="' + (2.5 * u) + '" font-family="Inter" font-weight="700" font-size="' + (2.5 * u) + '" letter-spacing="' + (0.45 * u) + '" fill="#f7dc97">' + esc(P.label) + '</text></g>' +
      '<g filter="url(#kTxt)"><text x="' + (6.6 * u) + '" y="' + (37 * u) + '" font-family="Inter" font-weight="800" fill="' + gold + '">' +
        '<tspan font-size="' + (5 * u) + '" font-weight="700">Credit </tspan><tspan font-size="' + (P.creditSize * u) + '" letter-spacing="' + (-0.055 * P.creditSize * u) + '">' + esc(credit) + '</tspan><tspan font-size="' + (6.6 * u) + '" dx="' + (1.6 * u) + '"> lei</tspan></text></g>' +
      '<text x="' + (6.6 * u) + '" y="' + (42.4 * u) + '" font-family="Inter" font-weight="600" font-size="' + (2.8 * u) + '" fill="' + P.ink2 + '">' + esc(P.sub) + '</text>' +
      // the code: what the desk types
      // a reserved card (not paid yet: card-sarbatori.js reservedMsg) has no code, only its mark; a card not paid has neither
      (code ? '<text x="' + (7 * u) + '" y="' + (49 * u) + '" font-family="Inter" fill="' + P.ink + '"><tspan font-weight="600" font-size="' + (2.05 * u) + '" letter-spacing="' + (0.34 * u) + '" fill="#f7dc97" fill-opacity=".85">COD </tspan><tspan dx="' + (0.8 * u) + '" font-weight="700" font-size="' + (2.9 * u) + '" letter-spacing="' + (0.16 * u) + '">' + esc(code) + '</tspan></text>' : o.mark ? '<g transform="translate(' + (7 * u) + ' ' + (44 * u) + ')"><rect width="' + (String(o.mark).length * (2.2 * u * 0.72 + 0.34 * u) + 3.6 * u) + '" height="' + (4.8 * u) + '" rx="' + (2.4 * u) + '" fill="#fff6ea" fill-opacity=".14" stroke="#f7dc97" stroke-opacity=".75" stroke-width="2"/>' +
        '<text x="' + (1.8 * u) + '" y="' + (3.27 * u) + '" font-family="Inter" font-weight="700" font-size="' + (2.2 * u) + '" letter-spacing="' + (0.34 * u) + '" fill="#f7dc97">' + esc(String(o.mark).toUpperCase()) + '</text></g>' : '') +
      '<text x="' + (7 * u) + '" y="' + (H - 5 * u - 4.7 * u) + '" font-family="Inter" font-weight="600" font-size="' + (2.05 * u) + '" letter-spacing="' + (0.34 * u) + '" fill="#f7dc97" fill-opacity=".85">PE NUMELE</text>' +
      '<text x="' + (7 * u) + '" y="' + (H - 5 * u) + '" font-family="Inter" font-weight="600" font-size="' + nameSize + '" fill="' + P.ink + '">' + esc(name) + '</text>' +
      '<text x="' + (74 * u) + '" y="' + (H - 5 * u - 4.7 * u) + '" text-anchor="end" font-family="Inter" font-weight="600" font-size="' + (2.05 * u) + '" letter-spacing="' + (0.34 * u) + '" fill="#f7dc97" fill-opacity=".85">VALABIL PÂNĂ LA</text>' +
      '<text x="' + (74 * u) + '" y="' + (H - 5 * u) + '" text-anchor="end" font-family="Inter" font-weight="500" font-size="' + (3.7 * u) + '" fill="' + P.ink + '">' + esc(valid) + '</text>' +
      // the holly on its corner, over the edge
      '<g transform="translate(' + (-5.4 * u) + ' ' + (-7.3 * u) + ') scale(' + (26 * u / 200) + ')" filter="url(#kDrop)">' + hollySvg('k').replace(/^<svg[^>]*>|<\/svg>$/g, '') + '</g>' +
    '</g></svg>';
}

// ---- SVG → PNG
let nodeReady = null;
async function nodeRender(svg, fonts) {
  const R = require('@resvg/resvg-wasm');
  if (!nodeReady) nodeReady = R.initWasm(require('fs').readFileSync(require.resolve('@resvg/resvg-wasm/index_bg.wasm')));
  await nodeReady;
  const r = new R.Resvg(svg, { font: { fontBuffers: fonts, defaultFontFamily: 'Inter', loadSystemFonts: false }, fitTo: { mode: 'original' } });
  return Buffer.from(r.render().asPng());
}
let fontBufs = null;
function fonts() {
  if (!fontBufs) fontBufs = require('./card-fonts.gen.js').map((b64) => new Uint8Array(Buffer.from(b64, 'base64')));
  return fontBufs;
}
async function png(o) {
  const svg = svgOf(o);
  if (typeof globalThis.__C360_SVG2PNG === 'function') return Buffer.from(await globalThis.__C360_SVG2PNG(svg, fonts()));
  return nodeRender(svg, fonts());
}

module.exports = { svgOf, png, hollySvg, W, H };
