// The Card de Sărbători as an ad picture, the layout of the card's best ad (the owner's favourite, 23.11: the picture of the
// 990 card's WhatsApp message, brand_asset/ads/card-990-wa.jpg), drawn here for any card on sale: 490, 990 and the VIP one.
// 1080x1350: the logo and the Google rating; the pill „Au mai rămas doar N carduri” (its bar follows N); „Plătești X lei.”
// in white and „Primești Y lei.” in gold script; the card itself (api/_lib/card-image.js, her name on it); the gold band of
// what paying online adds; one sentence at the bottom. Drawn as SVG and made a PNG by resvg, the same way as card-image.js
// (on Cloudflare globalThis.__C360_SVG2PNG, cf/card-png.js; in Node the package from node_modules). Its fonts: the card's
// (card-fonts.gen.js: Inter, Montserrat) and Fraunces Italic for the gold line (card-creative-fonts.gen.js); all OFL.
//   png({ tier: 490 | 990 | 9900, name, left }) → PNG (Buffer)       svgOf(same) → the SVG
// The facts on it are the site's (api/card-sarbatori.js, v2/cs-card.js): 490 → 1.000 lei, 990 → 2.500 lei, VIP 9.900 →
// 30.000 lei; online: BioLifting and Clubul 360 with the 490 and 990 ones, 10% less (8.910 lei) and Clubul 360 with the VIP.

const CI = require('./card-image');

const W = 1080, H = 1350;
const TIERS = {
  490: { pay: 490, get: 1000 },
  990: { pay: 990, get: 2500 },
  9900: { pay: 9900, get: 30000, vip: true, online: 8910 },
};
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const lei = (n) => Math.round(Number(n) || 0).toLocaleString('ro-RO').replace(/[\s  ]/g, '.');
const f1 = (n) => Math.round(n * 10) / 10;

// the fonts' advance widths (thousandths of an em), to size a line before drawing it (resvg has no measuring)
const CHARS = " !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~·ÂÎâîĂăȘșȚț";
const TAB = {
  i600: '252,321,523,644,650,1004,663,326,373,373,540,673,319,465,319,379,660,423,623,636,666,612,640,576,640,640,319,329,673,673,673,544,999,728,659,737,722,606,588,749,746,277,580,703,565,922,759,769,645,773,652,650,660,736,728,1020,720,713,652,373,379,373,481,469,351,574,624,582,624,591,389,626,612,262,262,569,262,900,612,609,624,624,397,549,353,612,587,839,569,588,566,455,359,455,673,319,728,277,574,262,728,574,650,549,660,353',
  i700: '237,338,552,649,655,1016,672,339,377,377,559,679,334,468,334,388,674,431,630,646,676,622,649,582,651,649,334,343,679,679,679,560,1016,747,662,740,722,607,587,750,747,281,584,719,565,932,762,770,648,777,657,655,668,732,747,1038,738,731,664,377,388,377,487,476,365,581,630,588,630,596,398,632,623,271,271,580,271,913,623,613,630,630,407,560,366,623,600,850,580,602,573,469,372,469,679,334,747,281,581,271,747,581,655,560,668,366',
  i800: '219,358,586,655,660,1029,683,354,382,382,582,686,352,471,352,400,692,441,638,657,688,634,662,588,664,662,352,360,686,686,686,579,1036,770,665,744,723,610,585,752,748,286,590,738,565,943,766,773,652,782,662,660,677,727,770,1059,761,752,679,382,400,382,493,484,382,588,638,595,638,601,410,639,635,283,283,593,283,927,635,619,638,638,420,573,382,635,615,863,594,618,581,486,388,486,686,352,770,286,588,283,770,588,660,573,677,382',
  fr: '157,278,254,551,483,576,600,129,310,309,540,458,180,266,182,389,618,386,531,500,511,507,552,430,507,548,247,250,434,458,434,394,727,554,598,597,672,576,541,649,707,336,324,640,502,775,602,688,595,690,615,522,516,608,536,854,578,522,550,325,374,324,302,352,173,462,465,385,460,388,248,430,478,248,220,472,232,716,484,440,450,440,368,358,270,484,450,662,471,409,409,332,224,329,485,600,554,336,462,248,554,462,522,358,516,270',
};
const ADV = {};
Object.keys(TAB).forEach((k) => { const v = TAB[k].split(',').map(Number); ADV[k] = {}; [...CHARS].forEach((c, i) => { ADV[k][c] = v[i] / 1000; }); });
function widthOf(str, font, size, ls) {
  const a = ADV[font];
  const s = [...String(str)];
  return s.reduce((w, c) => w + (a[c] == null ? 0.6 : a[c]), 0) * size + (ls || 0) * size * Math.max(0, s.length - 1);
}
// the biggest size up to `base` at which the line fits in `max` pixels
const fit = (str, font, base, max, ls) => Math.min(base, Math.floor(max / Math.max(1, widthOf(str, font, 1, ls)) * 10) / 10);

// the fonts by their own family names (resvg matches a family by name: „Inter” alone is only the Bold one, „Montserrat”
// alone none), so each weight is asked by its name
const FAM = { 500: 'Inter Medium', 600: 'Inter SemiBold', 700: 'Inter', 800: 'Inter ExtraBold' };
const fam = (w) => FAM[w] || 'Inter';
// the card's own words in the weights it means (its logo: Montserrat ExtraBold and Light)
const cardFonts = (svg) => svg
  .replace(/<tspan font-weight="800">CENTRUL360<\/tspan><tspan font-weight="300">\.COM<\/tspan>/g, '<tspan font-family="Montserrat ExtraBold">CENTRUL360</tspan><tspan font-family="Montserrat Light">.COM</tspan>')
  .replace(/font-family="Inter" font-weight="(\d+)"/g, (m, w) => 'font-family="' + fam(Number(w)) + '"')
  .replace(/<tspan([^>]*) font-weight="(\d+)"/g, (m, a, w) => '<tspan' + a + ' font-family="' + fam(Number(w)) + '"');
// the card of card-image.js without its light background (its own drop shadow stays), tilted like the ad's
function card(t, name) {
  let svg = CI.svgOf({ credit: t.get, name: String(name || '').trim() || 'Pentru tine', code: '', valid: '30.06.2027', vip: !!t.vip });
  svg = svg.replace(/<rect width="1200" height="900" fill="url\(#kBack\)"\/><rect width="1200" height="900" fill="url\(#kGlow\)"\/>/, '')
    .replace(/(<\/defs>)((?:<circle [^>]*opacity="\.7"\/>)+)/, '$1');
  const inner = cardFonts(svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, ''));
  return '<g transform="translate(540 780) rotate(-4) scale(0.672) translate(-600 -465.5)">' + inner + '</g>';
}
const LOGO = '<circle cx="405" cy="405" r="262"/><ellipse cx="405" cy="405" rx="104" ry="207"/><ellipse cx="405" cy="405" rx="207" ry="113"/>';
const GOOGLE = '<path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/>';
const GIFT = '<rect x="3.5" y="8" width="17" height="4.5" rx="1"/><path d="M5 12.5V20h14v-7.5M12 8v12M12 8c-1.5-3.5-5.5-4-5.5-1.5S10 8 12 8zm0 0c1.5-3.5 5.5-4 5.5-1.5S14 8 12 8z"/>';

function svgOf(o) {
  const tier = Number(o && o.tier);
  const t = TIERS[tier];
  if (!t) throw new Error('card-creative: tier ' + (o && o.tier));
  const left = Math.max(1, Math.round(Number(o.left) || 0));
  const vip = !!t.vip;

  // the rating: its size as the ad's (265 px wide), the G before it
  const RATING = '5,0 · 300+ recenzii Google';
  const gs = fit(RATING, 'i600', 24, 268, 0), gw = widthOf(RATING, 'i600', gs, 0);

  // the pill: the number in its circle, the words, the bar (what is left of 10)
  const words = (left === 1 ? 'A mai rămas doar 1 card' : 'Au mai rămas doar ' + left + ' carduri') + (vip ? ' VIP' : '');
  const ps = fit(words, 'i700', 30, 620, -0.01);
  const tw = widthOf(words, 'i700', ps, -0.01);
  const pw = 11 + 60 + 21 + tw + 29, px = (W - pw) / 2, tx = px + 92;
  const frac = Math.min(1, left / 10);

  // the headline
  const l1 = 'Plătești ' + lei(t.pay) + ' lei.', l2 = 'Primești ' + lei(t.get) + ' lei.';
  const s1 = fit(l1, 'i800', 99, 900, -0.045), s2 = fit(l2, 'fr', 116, 930, -0.035);
  const g2 = widthOf(l2, 'fr', s2, -0.035);

  // the band: what paying online adds
  const band = vip
    ? { label: 'BONUS LA PLATA ONLINE', main: '10%: plătești ' + lei(t.online) + ' lei', minus: true, sub: 'și acces în Clubul 360' }
    : { label: 'BONUS LA PLATA ONLINE, PE SITE', main: '+ o ședință de BioLifting cadou', sub: 'și acces în Clubul 360' };
  const ms = fit((band.minus ? '-' : '') + band.main, 'i800', 40, 790, -0.02);

  // the sentence at the bottom (its gold words: the card's name, „orice tratament”)
  const b1a = vip ? 'Cardul VIP Transformarea 360' : 'Cardul de Sărbători', b1b = vip ? ', pentru tine și cei dragi.' : ', pentru tine sau pentru cei dragi.';
  const b2a = 'Îl poți folosi pentru ', b2b = 'orice tratament', b2c = ' din clinică.';
  const bs = Math.min(fit(b1a + b1b, 'i700', 36, 1010, -0.017), fit(b2a + b2b + b2c, 'i700', 36, 1010, -0.017));

  const G = (id, stops, x1, x2) => '<linearGradient id="' + id + '" gradientUnits="userSpaceOnUse" x1="' + f1(x1) + '" y1="0" x2="' + f1(x2) + '" y2="0">' +
    stops.map(([o2, c]) => '<stop offset="' + o2 + '" stop-color="' + c + '"/>').join('') + '</linearGradient>';
  const GOLD = [[0, '#c9a45e'], [0.18, '#dcbd80'], [0.45, '#f2dfb4'], [0.55, '#efd9a8'], [0.72, '#d7b26c'], [1, '#bf9f6e']];
  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '">' +
    '<defs>' +
      '<linearGradient id="zBg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1a1517"/><stop offset=".45" stop-color="#141011"/><stop offset="1" stop-color="#0a0809"/></linearGradient>' +
      '<radialGradient id="zTop" cx=".5" cy=".12" r=".5"><stop offset="0" stop-color="#3a1f2b" stop-opacity=".55"/><stop offset="1" stop-color="#3a1f2b" stop-opacity="0"/></radialGradient>' +
      '<radialGradient id="zGlow" cx="540" cy="770" r="520" gradientUnits="userSpaceOnUse" gradientTransform="translate(540 770) scale(1 .82) translate(-540 -770)">' +
        '<stop offset="0" stop-color="' + (vip ? '#5a4220' : '#8c1440') + '" stop-opacity=".62"/><stop offset=".55" stop-color="' + (vip ? '#3a2a14' : '#5a0d2a') + '" stop-opacity=".28"/><stop offset="1" stop-color="#140c10" stop-opacity="0"/></radialGradient>' +
      G('zGold2', GOLD, 540 - g2 / 2, 540 + g2 / 2) +
      G('zGoldB', [[0, '#d6b26a'], [0.5, '#f2deb0'], [1, '#d3ad66']], 0, W) +
      '<linearGradient id="zBand" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#c08f33"/><stop offset=".3" stop-color="#e2bd72"/><stop offset=".5" stop-color="#fbecc6"/><stop offset=".68" stop-color="#e5bf72"/><stop offset="1" stop-color="#c69538"/></linearGradient>' +
      '<linearGradient id="zBandHi" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff6dc" stop-opacity=".35"/><stop offset=".5" stop-color="#fff6dc" stop-opacity="0"/><stop offset="1" stop-color="#7a5518" stop-opacity=".18"/></linearGradient>' +
      '<filter id="zPillGlow" x="-20%" y="-60%" width="140%" height="220%"><feGaussianBlur stdDeviation="9"/></filter>' +
      '<filter id="zBandGlow" x="-10%" y="-40%" width="120%" height="180%"><feGaussianBlur stdDeviation="14"/></filter>' +
    '</defs>' +
    // the background: dark, a little lighter at the top, the glow behind the card
    '<rect width="' + W + '" height="' + H + '" fill="url(#zBg)"/><rect width="' + W + '" height="' + H + '" fill="url(#zTop)"/>' +
    '<rect width="' + W + '" height="' + H + '" fill="url(#zGlow)"/>' +
    // the logo and the rating
    '<g transform="translate(65 51) scale(' + f1(40 / 524 * 1000) / 1000 + ') translate(-143 -143)" fill="none" stroke="#fcf5e9" stroke-width="30">' + LOGO + '</g>' +
    '<text x="120" y="82.5" font-size="31" fill="#fcf5e9"><tspan font-family="Montserrat ExtraBold">CENTRUL360</tspan><tspan font-family="Montserrat Light">.COM</tspan></text>' +
    '<g transform="translate(' + f1(1015 - gw - 34) + ' 60) scale(' + 23 / 48 + ')">' + GOOGLE + '</g>' +
    '<text x="1015" y="82" text-anchor="end" font-family="Inter SemiBold" font-size="' + gs + '" fill="#fcf5e9">' + RATING + '</text>' +
    // the pill
    '<rect x="' + f1(px - 2) + '" y="136" width="' + f1(pw + 4) + '" height="89" rx="44.5" fill="none" stroke="#e0457f" stroke-width="8" opacity=".75" filter="url(#zPillGlow)"/>' +
    '<rect x="' + f1(px) + '" y="138" width="' + f1(pw) + '" height="85" rx="42.5" fill="#fff6ec" stroke="#b8406f" stroke-width="3"/>' +
    '<circle cx="' + f1(px + 41) + '" cy="180.5" r="30" fill="#e2195f"/>' +
    '<text x="' + f1(px + 41) + '" y="193" text-anchor="middle" font-family="Inter ExtraBold" font-size="' + (left > 9 ? 28 : 35) + '" fill="#ffffff">' + left + '</text>' +
    '<text x="' + f1(tx) + '" y="184" font-family="Inter" font-size="' + ps + '" letter-spacing="' + f1(-0.01 * ps) + '" fill="#160a0d">' + esc(words) + '</text>' +
    '<rect x="' + f1(tx) + '" y="199" width="' + f1(tw) + '" height="8" rx="4" fill="#f7cfcf"/>' +
    '<rect x="' + f1(tx) + '" y="199" width="' + f1(Math.max(8, tw * frac)) + '" height="8" rx="4" fill="#e2195f"/>' +
    // the headline
    '<text x="540" y="347" text-anchor="middle" font-family="Inter ExtraBold" font-size="' + s1 + '" letter-spacing="' + f1(-0.045 * s1) + '" fill="#fcf5e9">' + esc(l1) + '</text>' +
    '<text x="540" y="457" text-anchor="middle" font-family="Fraunces C360" font-style="italic" font-size="' + s2 + '" letter-spacing="' + f1(-0.035 * s2) + '" fill="url(#zGold2)">' + esc(l2) + '</text>' +
    // the card
    card(t, o.name) +
    // the band
    '<rect x="70" y="1072" width="940" height="128" rx="28" fill="#e2b458" opacity=".55" filter="url(#zBandGlow)"/>' +
    '<rect x="64" y="1064" width="951" height="140" rx="28" fill="url(#zBand)"/><rect x="64" y="1064" width="951" height="140" rx="28" fill="url(#zBandHi)"/>' +
    '<circle cx="126.5" cy="1133.5" r="32.5" fill="#2a1a08"/>' +
    '<g transform="translate(108.5 1115.5) scale(1.5)" fill="none" stroke="#efd08a" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">' + GIFT + '</g>' +
    '<text x="184" y="1103" font-family="Inter" font-size="20" letter-spacing="3.4" fill="#4b2b00">' + esc(band.label) + '</text>' +
    (band.minus ? '<rect x="186" y="' + f1(1146 - ms * 0.33) + '" width="' + f1(ms * 0.42) + '" height="' + f1(ms * 0.1) + '" rx="1.5" fill="#1e1206"/>' : '') +
    '<text x="' + (band.minus ? f1(186 + ms * 0.52) : 184) + '" y="1146" font-family="Inter ExtraBold" font-size="' + ms + '" letter-spacing="' + f1(-0.02 * ms) + '" fill="#1e1206">' + esc(band.main) + '</text>' +
    '<text x="184" y="1179" font-family="Inter SemiBold" font-size="24" fill="#3d2508">' + esc(band.sub) + '</text>' +
    // the sentence
    '<text x="540" y="1282" text-anchor="middle" font-family="Inter" font-size="' + bs + '" letter-spacing="' + f1(-0.017 * bs) + '" fill="#fcf5e9"><tspan font-family="Inter ExtraBold" fill="url(#zGoldB)">' + esc(b1a) + '</tspan>' + esc(b1b) + '</text>' +
    '<text x="540" y="1329" text-anchor="middle" font-family="Inter" font-size="' + bs + '" letter-spacing="' + f1(-0.017 * bs) + '" fill="#fcf5e9">' + esc(b2a) + '<tspan font-family="Inter ExtraBold" fill="url(#zGoldB)">' + esc(b2b) + '</tspan>' + esc(b2c) + '</text>' +
    '</svg>';
}

// ---- SVG → PNG, with the card's fonts and the gold line's
let fontBufs = null;
function fonts() {
  if (!fontBufs) fontBufs = require('./card-fonts.gen.js').concat(require('./card-creative-fonts.gen.js')).map((b64) => new Uint8Array(Buffer.from(b64, 'base64')));
  return fontBufs;
}
let nodeReady = null;
async function render(svg) {
  if (typeof globalThis.__C360_SVG2PNG === 'function') return Buffer.from(await globalThis.__C360_SVG2PNG(svg, fonts()));
  const R = require('@resvg/resvg-wasm');
  if (!nodeReady) nodeReady = R.initWasm(require('fs').readFileSync(require.resolve('@resvg/resvg-wasm/index_bg.wasm')));
  await nodeReady;
  const r = new R.Resvg(svg, { font: { fontBuffers: fonts(), defaultFontFamily: 'Inter', loadSystemFonts: false }, fitTo: { mode: 'original' } });
  return Buffer.from(r.render().asPng());
}
async function png(o) { return render(svgOf(o)); }

module.exports = { svgOf, png, render, TIERS, W, H };
