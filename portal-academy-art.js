// Traininguri → Cazuri: a photo of the client for each of the twelve practice cases (academy-cases/<id>.webp: a
// fictional woman of that age with that problem, made with the image generator, so marked "Ilustrativ"); the
// plan and the aim under it once she has answered.
// A case without a photo (one the owner adds) gets a drawing, in the style of the "Cum funcționează" diagrams on the
// site (skin, fat and muscle in section; the face in profile; the hair follicles; the two cities). Still, no motion:
// the case is read at her own pace. Two states, so the drawing never gives the answer away:
//   before she answers: only the client's problem
//   after (and for the owner): the plan at work on it, with a legend (each treatment in the colour it has in the
//   drawing, and what we aim for)
// Words live in the legend, not in the drawing, so they stay readable on a phone. A case the owner adds gets a
// drawing too, from its category and the treatments in its plan.
//   window.C360CaseArt.html(caseObj, plan) → <figure> markup
(function () {
  'use strict';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let uid = 0;
  // a label inside the drawing: big, few words
  const T = (x, y, text, fill, anchor) => '<text x="' + x + '" y="' + y + '" font-size="17" letter-spacing="1.2" fill="' + fill + '"' + (anchor ? ' text-anchor="' + anchor + '"' : '') + '>' + esc(text) + '</text>';
  const bubbleW = (t) => Math.round(t.length * 11.4 + 34);
  const bubble = (x, y, t, bg, fg) => '<rect x="' + x + '" y="' + y + '" width="' + bubbleW(t) + '" height="36" rx="14" fill="' + (bg || '#e9e6e1') + '"/>' +
    '<text x="' + (x + bubbleW(t) / 2) + '" y="' + (y + 24) + '" text-anchor="middle" font-size="16" letter-spacing="1.2" fill="' + (fg || '#2a2420') + '">' + esc(t) + '</text>';
  const svg = (inner) => '<svg viewBox="0 0 600 330" aria-hidden="true">' + inner + '</svg>';
  const C = { lipo: '#ff9a66', cav: '#ffffff', ems: '#9fd0ff', heat: '#ff8a5c', hifu: '#ff8a5c', rf: '#ffb27a', needle: '#9fd0ff', clean: '#ffffff', hydra: '#9fd0ff', glow: '#fff1d6', laser: '#ff7a4a', none: '#8b8798' };

  // ------------------------------------------------------------------ body, in section
  function corp(o, plan) {
    const p = 'ta' + (++uid);
    const fx = plan ? (o.fx || []) : [];
    const rows = o.small ? [[250, 168], [300, 176], [350, 168]]
      : [[90, 150], [150, 158], [210, 150], [270, 158], [330, 150], [390, 158], [450, 150], [510, 158], [120, 204], [180, 210], [240, 204], [300, 210], [360, 204], [420, 210], [480, 204]];
    const lob = rows.map(([x, y]) => '<ellipse cx="' + x + '" cy="' + y + '" rx="' + (o.small ? 20 : 26) + '" ry="' + (o.small ? 15 : 20) + '" fill="#f2d79e" stroke="#c99f5c" stroke-width="1.4"/>').join('');
    const skin = o.dimples
      ? '<path d="M-10 92 C10 92 20 104 40 104 C60 104 70 92 90 92 C110 92 120 104 140 104 C160 104 170 92 190 92 C210 92 220 104 240 104 C260 104 270 92 290 92 C310 92 320 104 340 104 C360 104 370 92 390 92 C410 92 420 104 440 104 C460 104 470 92 490 92 C510 92 520 104 540 104 C560 104 570 92 610 92" stroke="url(#' + p + 'S)" stroke-width="36" fill="none"/>'
      : '<rect x="0" y="74" width="600" height="40" fill="url(#' + p + 'S)"/><rect x="0" y="74" width="600" height="2" fill="#f1dccd" opacity=".7"/>';
    let eff = '';
    if (fx.includes('heat')) eff += '<rect x="0" y="62" width="600" height="68" fill="url(#' + p + 'H)"/>';
    if (fx.includes('lipo')) eff += '<polygon points="150,20 230,20 196,176 184,176" fill="url(#' + p + 'C)"/><circle cx="190" cy="176" r="34" fill="url(#' + p + 'G)"/>';
    if (fx.includes('cav')) eff += [[285, 150], [312, 178], [338, 150], [300, 206], [328, 212]].map(([x, y], i) => '<circle cx="' + x + '" cy="' + y + '" r="' + (6 + (i % 3) * 3) + '" fill="none" stroke="#ffffff" stroke-width="2.2"/>').join('');
    if (fx.includes('ems')) eff += '<g fill="none" stroke="#9fd0ff" stroke-width="2.6">' + [[40, 30, 10, 1], [140, 56, 16, .7], [232, 84, 22, .5]].map(([y, rx, ry, op]) => '<ellipse cx="460" cy="' + y + '" rx="' + rx + '" ry="' + ry + '" opacity="' + op + '"/>').join('') + '</g>' +
      '<g stroke="#ffffff" stroke-width="2.2" opacity=".85">' + [380, 420, 460, 500, 540].map((x) => '<path d="M' + x + ' 264 v14"/>').join('') + '</g>';
    return svg('<defs>' +
      '<linearGradient id="' + p + 'S" gradientUnits="userSpaceOnUse" x1="0" y1="72" x2="0" y2="116"><stop offset="0" stop-color="#dcbca5"/><stop offset=".18" stop-color="#c49c84"/><stop offset="1" stop-color="#9c735f"/></linearGradient>' +
      '<linearGradient id="' + p + 'C" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity=".05"/><stop offset=".4" stop-color="#cfe6ff" stop-opacity=".35"/><stop offset="1" stop-color="#ff9a66" stop-opacity=".65"/></linearGradient>' +
      '<radialGradient id="' + p + 'G"><stop offset="0" stop-color="#ffb07a" stop-opacity=".95"/><stop offset="1" stop-color="#ff9a66" stop-opacity="0"/></radialGradient>' +
      '<linearGradient id="' + p + 'H" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff8a5c" stop-opacity="0"/><stop offset=".5" stop-color="#ff8a5c" stop-opacity=".45"/><stop offset="1" stop-color="#ff8a5c" stop-opacity="0"/></linearGradient></defs>' +
      '<rect x="0" y="100" width="600" height="160" fill="#e6c48a"/>' + lob +
      '<rect x="0" y="252" width="600" height="78" fill="#7d302c"/>' + [4, 154, 304, 454].map((x) => '<rect x="' + x + '" y="258" width="142" height="26" rx="13" fill="' + (fx.includes('ems') ? '#bd5a52' : '#a3463f') + '" stroke="#7d302c" stroke-width="1.5"/>').join('') +
      skin + eff +
      T(16, 52, 'PIELE', '#e9e6e1') + T(16, 244, 'GRĂSIME', '#7a5a2c') + T(16, 316, o.weak && !plan ? 'MUȘCHI SLĂBIȚI' : 'MUȘCHI', '#f3d9d4'));
  }

  // ------------------------------------------------------------------ the face, in profile
  const FACE_BACK = 'M300 40 C258 34 214 46 192 76 C172 104 168 140 182 166 C192 186 206 196 212 214 C218 236 222 276 226 330 L292 330 ';
  const FACE_NOSE = 'C342 186 344 176 340 170 C346 166 346 158 340 154 C346 150 348 144 342 140 C354 134 356 126 350 120 C342 110 338 100 336 92 C334 64 324 46 300 40 Z';
  const FACE_SOFT = FACE_BACK + 'C288 292 288 268 292 252 C300 244 318 240 322 228 C328 214 334 202 334 194 ' + FACE_NOSE;
  const FACE_FIRM = FACE_BACK + 'C290 288 290 264 296 250 C306 230 328 214 336 202 C340 196 342 190 342 186 ' + FACE_NOSE;
  function face(o, plan) {
    const p = 'ta' + (++uid);
    const fx = plan ? (o.fx || []) : [];
    let eff = '';
    if (fx.includes('glow')) eff += '<ellipse cx="282" cy="140" rx="74" ry="84" fill="url(#' + p + 'W)"/>';
    if (fx.includes('hifu')) eff += '<polygon points="384,40 444,40 336,206 322,198" fill="url(#' + p + 'C)"/>' +
      [[296, 214], [310, 206], [322, 196], [308, 186], [294, 198]].map(([x, y]) => '<ellipse cx="' + x + '" cy="' + y + '" rx="5.5" ry="4" fill="#ff8a5c"/>').join('');
    if (fx.includes('rf')) eff += '<g fill="none" stroke="#ffb27a" stroke-width="2.6" stroke-linecap="round">' + [0, 1, 2].map((i) => '<path d="M248 ' + (150 + i * 14) + ' q22 -14 44 0" opacity="' + (1 - i * 0.25) + '"/>').join('') + '</g>';
    if (fx.includes('needle')) eff += [[244, 128], [258, 136], [272, 128], [244, 146], [258, 154], [272, 146], [258, 118]].map(([x, y]) => '<circle cx="' + x + '" cy="' + y + '" r="2.6" fill="#9fd0ff"/>').join('');
    if (fx.includes('lift')) eff += '<g stroke="#ffffff" stroke-width="3.2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M318 292 V256 M308 266 L318 256 L328 266"/><path d="M346 282 V246 M336 256 L346 246 L356 256"/></g>';
    const marks = '<g opacity="' + (plan ? '.3' : '1') + '">' +
      '<g stroke="#7a5444" stroke-width="1.8" fill="none" stroke-linecap="round">' +
      (o.wrinkles ? '<path d="M252 86 q18 -4 36 0"/><path d="M248 97 q20 -4 40 0"/><path d="M296 132 q-10 18 -4 30"/><path d="M294 106 q-8 4 -16 2"/><path d="M296 112 q-8 3 -14 1"/>' : '') +
      (o.chin && !plan ? '<path d="M282 238 q14 7 26 -3"/>' : '') + '</g></g>';
    // what she shows: an arrow to the problem (before she answers)
    const point = !plan && o.point ? '<path d="M' + o.point[0] + ' ' + o.point[1] + ' L' + o.point[2] + ' ' + o.point[3] + '" stroke="#e9e6e1" stroke-width="1.6" stroke-dasharray="4 4"/>' + T(o.point[0] + 8, o.point[1] + 6, o.point[4], '#e9e6e1') : '';
    return svg('<defs>' +
      '<linearGradient id="' + p + 'F" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#b78c74"/><stop offset=".55" stop-color="#d4b098"/><stop offset="1" stop-color="#e4c7b2"/></linearGradient>' +
      '<linearGradient id="' + p + 'C" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff" stop-opacity=".05"/><stop offset="1" stop-color="#ff9a66" stop-opacity=".55"/></linearGradient>' +
      '<radialGradient id="' + p + 'W"><stop offset="0" stop-color="#fff6e8" stop-opacity=".55"/><stop offset="1" stop-color="#fff6e8" stop-opacity="0"/></radialGradient>' +
      '<linearGradient id="' + p + 'R" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4a342b"/><stop offset="1" stop-color="#2c1f1a"/></linearGradient></defs>' +
      '<g transform="translate(-22 0)"><path d="' + (plan && (o.fx || []).includes('lift') ? FACE_FIRM : FACE_SOFT) + '" fill="url(#' + p + 'F)" stroke="#f1dccd" stroke-width="1.5" stroke-opacity=".6"/>' +
      '<path d="M322 60 C318 44 300 34 276 34 C236 34 196 50 180 84 C164 118 166 160 178 196 C188 228 192 262 186 292 C204 288 216 270 218 246 C220 222 212 200 206 180 C198 152 200 124 214 100 C232 72 270 60 322 60 Z" fill="url(#' + p + 'R)"/>' +
      '<path d="M318 98 q8 -3 14 1" stroke="#5a3f33" stroke-width="2" fill="none" stroke-linecap="round"/></g>' +
      marks + eff + point);
  }

  // ------------------------------------------------------------------ skin close-up (pores, texture, glow)
  function skin(o, plan) {
    const p = 'ta' + (++uid);
    const fx = plan ? (o.fx || []) : [];
    const pores = [110, 210, 310, 410, 510];
    const surf = 'M-10 118 C40 112 60 124 110 118 C160 112 180 126 210 118 C260 110 280 124 310 118 C360 112 380 126 410 118 C460 110 480 124 510 118 C560 112 580 124 610 118';
    let eff = '';
    if (fx.includes('clean')) eff += pores.map((x) => '<path d="M' + x + ' 104 V78 M' + (x - 8) + ' 86 L' + x + ' 78 L' + (x + 8) + ' 86" stroke="#ffffff" stroke-width="2.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>').join('');
    if (fx.includes('needle')) eff += [160, 260, 360, 460].map((x) => '<rect x="' + (x - 1.5) + '" y="84" width="3" height="58" rx="1.5" fill="#cfe6ff"/><path d="M' + (x - 6) + ' 146 h12" stroke="#9fd0ff" stroke-width="2.2"/>').join('');
    if (fx.includes('hydra')) eff += [140, 240, 340, 440, 540].map((x) => '<path d="M' + x + ' 52 c-7 12 -9 16 -9 21 a9 9 0 0 0 18 0 c0 -5 -2 -9 -9 -21 z" fill="#9fd0ff"/>').join('');
    if (fx.includes('glow')) eff += '<path d="' + surf + '" stroke="#fff1d6" stroke-width="4" fill="none" opacity=".75"/>' +
      [[90, 70, 9], [200, 92, 6], [300, 64, 8], [520, 86, 7], [610 - 40, 60, 5]].map(([x, y, r]) => '<path d="M' + x + ' ' + (y - r) + ' Q' + x + ' ' + y + ' ' + (x + r) + ' ' + y + ' Q' + x + ' ' + y + ' ' + x + ' ' + (y + r) + ' Q' + x + ' ' + y + ' ' + (x - r) + ' ' + y + ' Q' + x + ' ' + y + ' ' + x + ' ' + (y - r) + ' Z" fill="#fff1d6"/>').join('');
    const marks = '<g opacity="' + (plan ? '.3' : '1') + '">' +
      (o.plugs ? pores.map((x) => '<ellipse cx="' + x + '" cy="128" rx="7" ry="9" fill="#e9d48a"/>').join('') : '') +
      (o.red ? pores.map((x) => '<circle cx="' + x + '" cy="132" r="18" fill="#e0675d" opacity=".28"/>').join('') : '') +
      (o.flakes ? [60, 160, 250, 350, 450, 560].map((x, i) => '<path d="M' + x + ' 114 l14 -6 l10 5 l-12 5 z" fill="#f3e1d2" opacity=".9" transform="rotate(' + (i % 2 ? -8 : 6) + ' ' + x + ' 112)"/>').join('') : '') +
      (o.pigment ? [80, 190, 290, 380, 480].map((x) => '<ellipse cx="' + x + '" cy="150" rx="16" ry="6" fill="#8c5a3c" opacity=".55"/>').join('') : '') + '</g>';
    return svg('<defs>' +
      '<linearGradient id="' + p + 'E" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e6c8b3"/><stop offset="1" stop-color="#cfa48c"/></linearGradient>' +
      '<linearGradient id="' + p + 'W" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff8ec" stop-opacity=".8"/><stop offset="1" stop-color="#fff8ec" stop-opacity="0"/></linearGradient></defs>' +
      '<rect x="0" y="118" width="600" height="212" fill="#c98e86"/>' +
      '<g stroke="#e8b9b0" stroke-width="1.8" fill="none" opacity=".8"><path d="M-10 220 C80 214 160 228 260 220 S460 214 610 224"/><path d="M-10 252 C100 246 200 258 320 250 S500 246 610 254"/>' +
      (plan ? '<path d="M-10 236 C90 230 180 242 290 236 S470 230 610 238" stroke="#ffe1cf"/><path d="M-10 268 C110 262 210 274 330 266 S510 262 610 270" stroke="#ffe1cf"/><path d="M-10 204 C100 198 220 210 330 204 S520 198 610 206" stroke="#ffe1cf"/>' : '') + '</g>' +
      '<path d="' + surf + ' V170 H-10 Z" fill="url(#' + p + 'E)"/>' +
      pores.map((x) => '<path d="M' + (x - 9) + ' 118 C' + (x - 9) + ' 150 ' + (x + 9) + ' 150 ' + (x + 9) + ' 118" fill="#a8786a"/>').join('') +
      marks + eff +
      T(16, 40, (plan ? o.topPlan : o.top) || 'SUPRAFAȚA PIELII', plan ? '#ffe1cf' : '#e9e6e1') + T(16, 312, plan ? 'COLAGEN NOU' : 'COLAGEN', plan ? '#ffe1cf' : '#f3d9d4'));
  }

  // ------------------------------------------------------------------ laser hair removal
  function laser(o, plan) {
    const p = 'ta' + (++uid);
    const xs = [110, 210, 310, 410, 510];
    return svg('<defs>' +
      '<linearGradient id="' + p + 'S" gradientUnits="userSpaceOnUse" x1="0" y1="96" x2="0" y2="136"><stop offset="0" stop-color="#ead2bf"/><stop offset="1" stop-color="#c9a089"/></linearGradient>' +
      '<linearGradient id="' + p + 'L" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff5a4a" stop-opacity=".08"/><stop offset="1" stop-color="#ff7a4a" stop-opacity=".8"/></linearGradient></defs>' +
      '<rect x="0" y="136" width="600" height="194" fill="#d9a996"/><rect x="0" y="96" width="600" height="40" fill="url(#' + p + 'S)"/>' +
      xs.map((x, i) => {
        const growing = !plan || i % 2 === 0; // the hairs grow in phases: the laser catches only the ones growing now
        return '<path d="M' + (x - 10) + ' 136 C' + (x - 10) + ' 220 ' + (x + 10) + ' 220 ' + (x + 10) + ' 136" fill="#c78b78"/>' +
          '<ellipse cx="' + x + '" cy="226" rx="13" ry="16" fill="' + (plan && growing ? '#ff8a5c' : '#4a3226') + '"/>' +
          '<path d="M' + x + ' 222 C' + (x - 2) + ' 176 ' + (x + 3) + ' 132 ' + (x + 12) + ' 60" stroke="#3a2a22" stroke-width="4" fill="none" stroke-linecap="round"' + (plan && !growing ? ' opacity=".4"' : '') + '/>' +
          (plan && growing ? '<rect x="' + (x - 12) + '" y="30" width="24" height="196" fill="url(#' + p + 'L)"/>' : '');
      }).join('') +
      T(16, 290, 'RĂDĂCINA', '#5a2f2b'));
  }

  // ------------------------------------------------------------------ a case where we don't treat (safety first)
  function stop(o, plan) {
    const figure = o.kind === 'pregnant'
      ? '<circle cx="214" cy="78" r="24" fill="#d4b098"/><path d="M204 100 C194 112 188 130 190 160 C192 190 196 214 200 240 C204 272 204 300 202 330 L238 330 C240 300 242 276 244 252 C278 248 298 214 292 182 C286 156 264 142 242 138 C236 122 230 110 222 102 Z" fill="#d4b098"/>' +
        '<path d="M262 190 c-4 -7 -15 -4 -14 4 c1 7 14 15 14 15 s13 -8 14 -15 c1 -8 -10 -11 -14 -4 z" fill="#ff8aa0"/>'
      : '<circle cx="230" cy="74" r="26" fill="#d4b098"/><path d="M178 116 C198 104 262 104 282 116 C296 166 292 236 284 330 L176 330 C168 236 164 166 178 116 Z" fill="#d4b098"/>' +
        '<path d="M242 184 c-6 -10 -22 -6 -20 6 c2 10 20 22 20 22 s18 -12 20 -22 c2 -12 -14 -16 -20 -6 z" fill="#ff8aa0"/><rect x="250" y="132" width="20" height="15" rx="3" fill="#9fb3c8" stroke="#ffffff" stroke-width="1.2"/><path d="M256 147 q-6 16 -12 34" stroke="#9fb3c8" stroke-width="1.6" fill="none"/>';
    const after = plan
      ? '<g fill="none" stroke="#9fd0ff" stroke-width="2.6" opacity=".75">' + [0, 1, 2].map((i) => '<path d="M' + (540 - i * 18) + ' 132 q-16 30 0 60"/>').join('') + '</g>' +
        '<path d="M372 104 l54 -18 l54 18 v46 c0 40 -28 64 -54 76 c-26 -12 -54 -36 -54 -76 z" fill="#2b2238" stroke="#ffe1cf" stroke-width="2.6"/><path d="M426 122 v46 M426 190 v1" stroke="#ffe1cf" stroke-width="6" stroke-linecap="round"/>'
      : bubble(320, 112, o.wants) + '<path d="M332 140 l-22 14 l26 -4 z" fill="#e9e6e1"/>';
    return svg(figure + after);
  }

  // ------------------------------------------------------------------ Arad and Timișoara
  function city(o, plan) {
    const pin = (x, y, c) => '<path d="M' + x + ' ' + y + ' c0 -18 -16 -26 -16 -40 a16 16 0 0 1 32 0 c0 14 -16 22 -16 40 z" fill="' + c + '"/><circle cx="' + x + '" cy="' + (y - 40) + '" r="6" fill="#1c1a26"/>';
    return svg('<path d="M40 250 C120 210 160 170 250 180 C340 190 380 230 470 196 C520 178 560 150 600 140" stroke="#3a3550" stroke-width="18" fill="none" stroke-linecap="round"/>' +
      (plan ? '<path d="M150 196 C210 176 260 178 320 192 C380 206 420 214 452 200" stroke="#ffe1cf" stroke-width="3" fill="none" stroke-dasharray="8 7" stroke-linecap="round"/>' : '') +
      pin(150, 196, '#ff9a66') + T(150, 230, 'ARAD', '#e9e6e1', 'middle') +
      pin(452, 200, '#9fd0ff') + T(452, 234, 'TIMIȘOARA', '#e9e6e1', 'middle') +
      (plan ? bubble(410, 96, 'EMS', '#9fd0ff', '#14202c') : bubble(86, 92, 'VREA EMS') + '<path d="M140 128 l10 12 l8 -12 z" fill="#e9e6e1"/>'));
  }

  // ------------------------------------------------------------------ the twelve cases
  // keys: the treatments in the drawing, each with its colour · aim: the line under them
  const ART = {
    'caz-abdomen-tm': [corp, { fx: ['lipo', 'cav', 'ems', 'heat'], weak: true }, [['Liposonix', C.lipo], ['Cavitație', C.cav], ['EMS', C.ems], ['Împachetare', C.heat]], 'Abdomen mai plat și mai ferm'],
    'caz-abdomen-ar': [corp, { fx: ['lipo', 'cav', 'heat'] }, [['Liposonix', C.lipo], ['Cavitație', C.cav], ['Radiofrecvență', C.heat]], 'Talie mai subțire, abdomen mai ferm'],
    'caz-riduri-50': [face, { fx: ['hifu', 'rf', 'lift'], wrinkles: true, chin: true, point: [400, 80, 290, 88, 'RIDURI'] }, [['HIFU', C.hifu], ['RF Sculpt', C.rf], ['Antirid', C.glow]], 'Piele mai fermă, contur mai clar'],
    'caz-gusa': [face, { fx: ['hifu', 'lift'], chin: true, point: [400, 250, 316, 238, 'GUȘĂ'] }, [['HIFU', C.hifu], ['RF Sculpt', C.rf]], 'Linia mandibulei mai definită'],
    'caz-acnee': [skin, { fx: ['clean', 'needle'], plugs: true, red: true, top: 'PORI PLINI, INFLAMAȚIE', topPlan: 'PORI CURAȚAȚI' }, [['Sebum Off', C.clean], ['Microneedling', C.needle]], 'Pori mai curați, urme estompate'],
    'caz-celulita-tm': [corp, { fx: ['cav', 'ems', 'heat'], dimples: true }, [['Cavitație', C.cav], ['EMS', C.ems], ['Împachetare și RF', C.heat]], 'Piele mai netedă, picioare mai ușoare'],
    'caz-slaba': [corp, { fx: ['lipo', 'cav'], small: true }, [['Liposonix', C.lipo], ['Cavitație', C.cav]], 'Flancuri mai fine, cu un program mic'],
    'caz-sarcina': [stop, { kind: 'pregnant', wants: 'VREA LIPOSONIX' }, [['Contraindicație: nu se face', C.none]], 'Revenim după alăptare, cu un follow-up'],
    'caz-pacemaker': [stop, { kind: 'pacemaker', wants: 'VREA EMS' }, [['Contraindicație: fără EMS', C.none]], 'O îndrumi să vorbească cu medicul'],
    'caz-arad-ems': [city, {}, [['EMS doar în Timișoara', C.ems], ['Sau ce avem în Arad', C.lipo]], 'Orașul se verifică mereu'],
    'caz-epilare': [laser, {}, [['Laser pe rădăcină', C.laser], ['Firele în repaus, la ședința următoare', C.none]], 'Seria întreagă, la 4-6 săptămâni'],
    'caz-ten-tern': [skin, { fx: ['hydra', 'needle', 'glow'], flakes: true, pigment: true, top: 'TEN OBOSIT, PETE', topPlan: 'TEN LUMINOS' }, [['Hidratare', C.hydra], ['Microneedling', C.needle], ['Restart', C.glow]], 'Ten luminos și odihnit la nuntă'],
  };
  const FACE_KEY = { 'hifu-mic': 'HIFU', 'hifu-ff': 'HIFU', 'rfs-gusa': 'RF Sculpt', 'rfs-ff': 'RF Sculpt', 'rf-mic': 'Radiofrecvență', 'rf-ff': 'Radiofrecvență', antirid: 'Antirid', hidratare: 'Hidratare', restart: 'Restart', sebum: 'Sebum Off', redness: 'Redness', 'mn-pdrn': 'Microneedling', 'mn-ochi': 'Microneedling' };
  const BODY_KEY = { lipo: 'Liposonix', cav: 'Cavitație', 'ems-1': 'EMS', 'ems-2': 'EMS', impachetare: 'Împachetare', 'rf-corp': 'Radiofrecvență', 'hifu-corp': 'HIFU' };
  const KEY_C = { HIFU: C.hifu, 'RF Sculpt': C.rf, Radiofrecvență: C.heat, Microneedling: C.needle, Liposonix: C.lipo, Cavitație: C.cav, EMS: C.ems, Împachetare: C.heat, Hidratare: C.hydra, 'Sebum Off': C.clean };
  // a case without its own drawing: one from its category and the treatments in its plan
  function generic(c) {
    const uniq = (a) => a.filter((x, i) => x && a.indexOf(x) === i).slice(0, 4);
    const aim = c.result ? String(c.result).split('.')[0] : '';
    if (c.group === 'epilare') return [laser, {}, [['Laser pe rădăcină', C.laser]], aim];
    const map = c.group === 'fata' ? FACE_KEY : BODY_KEY;
    const names = uniq((c.program || []).map((l) => map[l.price]));
    const keys = names.map((n) => [n, KEY_C[n] || C.glow]);
    const fx = [];
    if (c.group === 'fata') {
      if (names.includes('HIFU')) fx.push('hifu');
      if (names.some((x) => /RF|Radio/.test(x))) fx.push('rf');
      if (names.includes('Microneedling')) fx.push('needle');
      if (!fx.length) fx.push('glow');
      return [face, { fx, wrinkles: true }, keys, aim];
    }
    if (names.includes('Liposonix')) fx.push('lipo');
    if (names.includes('Cavitație')) fx.push('cav');
    if (names.includes('EMS')) fx.push('ems');
    if (names.some((x) => x === 'Împachetare' || x === 'Radiofrecvență')) fx.push('heat');
    return [corp, { fx }, keys, aim];
  }
  const PHOTOS = ['caz-abdomen-tm', 'caz-abdomen-ar', 'caz-riduri-50', 'caz-gusa', 'caz-acnee', 'caz-celulita-tm', 'caz-slaba', 'caz-sarcina', 'caz-pacemaker', 'caz-arad-ems', 'caz-epilare', 'caz-ten-tern'];
  function html(c, plan) {
    const [scene, o, keys, aim] = ART[c.id] || generic(c);
    if (PHOTOS.includes(c.id)) {
      const src = '/academy-cases/' + c.id + '.webp';
      const legend = plan && ((keys && keys.length) || aim)
        ? '<figcaption class="ta-key"><em class="ta-key-l">Planul</em>' + (keys || []).map(([t]) => '<span class="ta-chip">' + esc(t) + '</span>').join('') + (aim ? '<b>' + esc(aim) + '</b>' : '') + '</figcaption>'
        : '';
      return '<figure class="ta is-photo"><div class="ta-ph"><span class="ta-ph-bg" style="background-image:url(' + src + ')"></span>' +
        '<img src="' + src + '" alt="' + esc(c.title || '') + '" width="800" height="993" decoding="async"></div><em class="ta-tag">Ilustrativ</em>' + legend + '</figure>';
    }
    const legend = plan && ((keys && keys.length) || aim)
      ? '<figcaption class="ta-key">' + (keys || []).map(([t, col]) => '<span><i style="background:' + col + '"></i>' + esc(t) + '</span>').join('') +
        (aim ? '<b>' + esc(aim) + '</b>' : '') + '</figcaption>'
      : '';
    return '<figure class="ta">' + scene(o, !!plan) + '<em class="ta-tag">Ilustrativ</em>' + legend + '</figure>';
  }

  const st = document.createElement('style');
  st.textContent = `
figure.ta{ margin:0 0 1.1rem; border-radius:16px; overflow:hidden; background:radial-gradient(120% 90% at 30% 0%, #241d33 0%, #12101a 60%, #0c0b12 100%); border:1px solid var(--line); position:relative; }
figure.ta svg{ display:block; width:100%; height:auto; }
figure.ta svg text{ font-family:Inter, system-ui, sans-serif; font-weight:700; }
figure.ta .ta-tag{ position:absolute; top:9px; right:12px; font-style:normal; font-size:10px; font-weight:700; letter-spacing:.14em; text-transform:uppercase; color:rgba(255,255,255,.42); }
figure.ta .ta-key{ display:flex; flex-wrap:wrap; align-items:center; gap:.4rem .9rem; padding:.7rem .9rem .8rem; border-top:1px solid rgba(255,255,255,.1); font-size:.82rem; color:#e9e6e1; }
figure.ta .ta-key span{ display:inline-flex; align-items:center; gap:.4rem; }
figure.ta .ta-key i{ width:10px; height:10px; border-radius:50%; flex:none; box-shadow:0 0 0 2px rgba(255,255,255,.08); }
figure.ta .ta-key b{ flex-basis:100%; font-weight:600; color:#ffe1cf; }
figure.ta.is-photo .ta-ph{ position:relative; overflow:hidden; background:#0c0b12; }
figure.ta.is-photo .ta-ph-bg{ position:absolute; inset:-24px; background:center / cover no-repeat; filter:blur(22px) brightness(.45) saturate(1.1); }
figure.ta.is-photo img{ position:relative; display:block; margin:0 auto; width:auto; max-width:100%; height:auto; max-height:min(460px, 62vh); aspect-ratio:800 / 993; object-fit:cover; }
figure.ta.is-photo .ta-tag{ z-index:1; color:rgba(255,255,255,.75); background:rgba(0,0,0,.35); padding:.2rem .45rem; border-radius:6px; }
figure.ta .ta-key-l{ font-style:normal; font-size:.72rem; font-weight:700; letter-spacing:.1em; text-transform:uppercase; color:rgba(233,230,225,.6); }
figure.ta .ta-chip{ padding:.2rem .6rem; border-radius:999px; background:rgba(255,255,255,.1); font-weight:600; }
`;
  document.head.appendChild(st);

  window.C360CaseArt = { html };
})();
