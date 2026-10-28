// Centrul360 · Game Mode (admins only; loaded on demand by portal-delight.js, styles in portal-game.css, data from
// /api/portal-game). The clinic as a mobile game with fixed rules nobody sets: the stage on Hormozi's Scaling Roadmap,
// the empire on the map (tap a city), the season's boss, the race with last month, the garage in 3D (unlocked when the
// game's treasury could buy it twice), the team's player cards, missions with XP and hundreds of badges. Entered and
// left by the "Game Mode" switch of the avatar menu, through diagonal bands of lava.
(function () {
  'use strict';
  const K = window.K;
  if (!K || window.C360Game) return;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ro = (n, d) => Number(n || 0).toLocaleString('ro-RO', { maximumFractionDigits: d || 0 });
  const lei = (n) => ro(Math.round(Number(n) || 0)) + ' lei';
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const calm = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const store = { get: (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } } };
  const toast = (m, t) => { try { K.ui().toast(m, t || 'info'); } catch (e) { /* no toasts */ } };
  const clinici = (n) => (n === 1 ? '1 clinică' : n + de(n) + 'clinici');
  const yearsTxt = (months) => { const y = Math.round(months / 12); return y <= 1 ? 'un an' : y + de(y) + 'ani'; };
  const de = (n) => { const a = Math.abs(Number(n) || 0), r = a % 100; return a >= 20 && (r === 0 || r >= 20) ? ' de ' : ' '; }; // 20 de zile, 3 zile

  // ------------------------------------------------------------------ icons (24px, stroke)
  const IC = {
    coins: '<circle cx="8" cy="8" r="6"/><path d="M18.09 10.37A6 6 0 1 1 10.34 18"/><path d="M7 6h1v4"/><path d="m16.71 13.88.7.71-2.82 2.82"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    bolt: '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>',
    rocket: '<path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
    crown: '<path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7zM5 20h14"/>',
    diamond: '<path d="M6 3h12l4 6-10 13L2 9z"/><path d="M11 3 8 9l4 13 4-13-3-6M2 9h20"/>',
    gem: '<path d="M6 3h12l4 6-10 13L2 9z"/><path d="M2 9h20"/>',
    flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
    trend: '<path d="m22 7-8.5 8.5-5-5L2 17"/><path d="M16 7h6v6"/>',
    phone: '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/>',
    magnet: '<path d="m6 15-4-4 6.75-6.77a7.79 7.79 0 0 1 11 11L13 22l-4-4 6.39-6.36a2.14 2.14 0 0 0-3-3L6 15M5 8l4 4M12 15l4 4"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    map: '<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3z"/><path d="M9 3v15M15 6v15"/>',
    globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
    flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7"/>',
    sword: '<path d="M14.5 17.5 3 6V3h3l11.5 11.5M13 19l6-6M16 16l4 4M19 21l2-2"/>',
    key: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3"/>',
    lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    sound: '<path d="M11 5 6 9H2v6h4l5 4zM15.54 8.46a5 5 0 0 1 0 7.07M19.07 4.93a10 10 0 0 1 0 14.14"/>',
    mute: '<path d="M11 5 6 9H2v6h4l5 4zM23 9l-6 6M17 9l6 6"/>',
    trophy: '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18M4 22h16M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22M18 2H6v7a6 6 0 0 0 12 0V2z"/>',
    castle: '<path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6M9 10h.01M15 10h.01"/>',
    car: '<path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/>',
    house: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
    watch: '<circle cx="12" cy="12" r="6"/><path d="M12 10v2l1 1M16.13 7.66l-.81-4.05a2 2 0 0 0-2-1.61h-2.68a2 2 0 0 0-2 1.61l-.78 4.05M7.88 16.36l.8 4a2 2 0 0 0 2 1.61h2.72a2 2 0 0 0 2-1.61l.81-4.05"/>',
    plane: '<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>',
    star: '<path d="m12 2 3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    pen: '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z"/>',
    play: '<path d="m6 3 14 9-14 9z"/>',
    trash: '<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    up: '<path d="m18 15-6-6-6 6"/>',
    down: '<path d="m6 9 6 6 6-6"/>',
    scroll: '<path d="M8 21h12a2 2 0 0 0 2-2v-2H10v2a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v3h4"/><path d="M19 17V5a2 2 0 0 0-2-2H4"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.09-3.09a2 2 0 0 0-2.82 0L6 21"/>',
    camera: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    power: '<path d="M18.36 6.64a9 9 0 1 1-12.73 0M12 2v10"/>',
    eye: '<path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
    book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15z"/><path d="M20 17v5H6.5A2.5 2.5 0 0 1 4 19.5"/>',
    medal: '<circle cx="12" cy="15" r="6"/><path d="M8.2 10.2 5 2h4l3 6 3-6h4l-3.2 8.2"/><path d="m12 12.4.9 1.9 2.1.3-1.5 1.4.4 2.1-1.9-1-1.9 1 .4-2.1-1.5-1.4 2.1-.3z"/>',
    mountain: '<path d="m8 3 4 8 5-5 5 15H2L8 3z"/>',
    music: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
    sparkles: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/><path d="M5 2l.6 1.4L7 4l-1.4.6L5 6l-.6-1.4L3 4l1.4-.6z"/>',
    heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
    gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 0 1 0 5"/>',
    drop: '<path d="M12 2.7l5.7 5.6a8 8 0 1 1-11.3 0z"/>',
    wallet: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
    chart: '<path d="M3 3v18h18"/><path d="M7 16v-4M12 16V8M17 16V5"/>',
    repeat: '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
    anchor: '<circle cx="12" cy="5" r="3"/><path d="M12 22V8M5 12H2a10 10 0 0 0 20 0h-3"/>',
    compass: '<circle cx="12" cy="12" r="10"/><path d="m16.2 7.8-2.1 6.3-6.3 2.1 2.1-6.3z"/>',
    yacht: '<path d="M2 18c1.5 1.3 3 2 4.5 2s3-.7 4.5-2c1.5 1.3 3 2 4.5 2s3-.7 4.5-2"/><path d="M4 15 3 11h18l-3 4"/><path d="M7 11V7h7l3 4"/><path d="M10 7V4"/>',
  };
  const ic = (n, cls) => '<svg class="gi' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" aria-hidden="true">' + (IC[n] || IC.star) + '</svg>';
  const KIND_IC = { car: 'car', house: 'house', watch: 'watch', trip: 'plane', yacht: 'yacht', jet: 'plane', other: 'star' };
  const imgOf = (img) => (img ? '/game/img/' + encodeURIComponent(img) + '.webp' : '');
  const srcOf = (g) => imgOf(g.img);
  const depthOf = (g) => '/game/img/' + encodeURIComponent(g.img) + '-depth.png';

  // ------------------------------------------------------------------ the map of Romania (Natural Earth 1:50m, projected)
  const RO_PATH = "M862.1 447.6 L873.2 463.4 L887.6 471.6 L920.3 480.5 L923.0 479.5 L923.4 477.9 L921.1 475.5 L920.7 472.6 L922.2 468.9 L926.8 468.9 L934.4 472.1 L948.5 467.3 L969.0 454.9 L988.0 452.3 L1005.5 459.7 L1014.3 468.4 L1020.0 476.6 L1018.1 486.6 L1017.0 492.9 L1012.4 519.1 L1009.3 528.8 L1004.4 539.9 L950.4 552.9 L953.8 546.8 L952.7 535.7 L950.4 527.5 L955.3 519.9 L943.5 517.2 L938.2 521.2 L934.0 528.6 L937.5 544.9 L931.8 554.2 L929.5 559.2 L929.1 571.3 L925.7 576.6 L924.9 582.2 L933.7 580.8 L929.9 591.1 L913.5 611.2 L907.8 623.1 L909.3 670.6 L902.1 698.8 L901.7 707.2 L884.6 707.5 L879.3 707.0 L863.3 702.8 L845.0 695.1 L834.4 680.6 L827.5 670.0 L812.3 674.8 L809.3 673.5 L805.1 668.5 L793.3 665.0 L779.2 665.0 L746.9 646.0 L743.5 642.6 L718.0 646.0 L680.3 655.3 L651.4 667.1 L621.4 687.7 L609.2 703.6 L595.1 712.0 L575.3 718.1 L539.6 715.7 L502.7 707.8 L462.8 699.3 L441.1 704.1 L411.8 700.6 L368.0 690.4 L335.3 687.2 L303.0 693.3 L297.7 688.8 L296.2 683.5 L297.7 676.1 L302.2 670.0 L309.8 665.5 L314.0 661.1 L314.4 656.3 L305.7 648.7 L287.8 638.4 L280.2 632.0 L278.7 630.4 L277.9 624.6 L274.5 620.2 L267.2 616.7 L261.9 610.7 L258.1 601.9 L258.9 593.8 L264.2 586.1 L271.4 582.7 L279.8 583.7 L283.6 581.4 L282.1 576.1 L273.7 569.2 L258.5 560.8 L242.9 565.3 L226.9 582.9 L215.5 585.8 L208.7 574.0 L196.1 566.8 L178.2 564.7 L167.2 560.2 L163.4 553.4 L155.4 548.1 L138.3 542.6 L137.9 537.0 L141.0 536.0 L147.0 535.4 L155.0 534.1 L156.6 531.2 L156.6 528.6 L150.1 524.9 L143.6 522.5 L140.2 520.1 L137.9 517.5 L137.5 514.9 L139.4 512.7 L142.1 512.7 L144.8 511.2 L145.9 504.6 L149.7 499.3 L152.0 497.4 L152.0 493.7 L149.3 490.0 L145.9 486.9 L140.6 485.0 L124.2 479.5 L115.9 471.8 L110.9 471.6 L102.5 467.3 L94.2 460.5 L86.6 451.0 L78.6 444.9 L76.3 442.5 L76.3 440.2 L77.4 437.5 L77.4 434.6 L75.5 425.4 L76.7 415.4 L76.3 406.4 L76.3 402.2 L74.8 400.8 L73.3 402.2 L71.4 404.0 L69.4 404.3 L63.4 397.7 L55.8 383.9 L50.8 379.5 L40.9 373.1 L32.6 367.8 L26.5 356.5 L20.0 347.5 L24.2 343.8 L48.1 338.8 L59.2 343.8 L64.5 342.0 L69.4 337.8 L72.1 334.6 L72.5 330.9 L74.8 326.7 L83.1 324.6 L104.4 327.2 L113.2 321.1 L116.2 317.7 L118.1 310.6 L120.4 304.5 L128.0 301.3 L128.0 296.1 L126.9 290.3 L131.4 277.1 L134.1 271.8 L138.3 269.7 L143.6 265.7 L152.8 257.0 L150.5 249.6 L152.4 244.1 L161.9 230.6 L169.1 217.7 L169.1 211.1 L170.2 205.3 L176.3 199.2 L183.2 191.0 L191.9 165.7 L195.4 161.5 L201.1 156.7 L205.2 152.0 L205.6 135.3 L209.8 130.6 L217.8 125.0 L225.4 116.3 L231.9 106.3 L236.4 101.3 L242.9 100.2 L250.1 96.0 L257.7 94.7 L265.3 96.5 L270.3 95.5 L277.5 90.5 L295.8 71.7 L298.4 68.0 L302.2 65.4 L317.5 59.1 L321.3 52.5 L326.2 46.7 L333.0 47.2 L354.7 61.4 L377.9 60.6 L382.1 61.2 L383.6 61.4 L386.3 62.8 L417.5 69.9 L422.1 69.1 L423.6 68.3 L435.7 74.4 L446.8 73.6 L457.4 69.4 L468.5 68.0 L478.3 70.4 L486.0 78.9 L505.7 96.3 L511.4 102.9 L520.6 102.1 L530.5 98.7 L540.7 87.0 L571.9 73.6 L595.5 70.4 L618.7 64.9 L645.7 61.2 L653.3 50.4 L657.9 42.7 L660.9 29.0 L675.4 25.0 L689.1 22.4 L694.0 20.5 L703.9 20.0 L711.5 21.1 L723.7 27.9 L732.1 36.4 L735.5 43.2 L742.7 52.7 L750.3 66.2 L758.7 84.1 L760.2 93.1 L763.6 102.9 L769.7 114.8 L781.5 127.9 L783.4 130.6 L788.7 139.8 L799.0 160.4 L807.8 168.6 L815.4 177.6 L818.8 186.5 L824.5 194.7 L837.0 205.5 L847.3 215.3 L855.7 243.5 L861.4 256.7 L865.2 266.8 L863.3 286.8 L865.6 295.5 L861.0 311.4 L852.3 343.0 L850.4 368.1 L851.9 381.8 L851.9 390.5 L854.2 396.1 L856.4 407.7 L856.8 417.7 L853.8 420.6 L849.2 423.0 L847.7 425.1 L851.5 429.6 L856.8 438.1 L862.1 447.6Z";
  const CITY_XY = {"Timișoara": [122.2, 402.3], "Arad": [133.2, 335.7], "Oradea": [197.3, 205.0], "Cluj-Napoca": [377.4, 246.8], "Sibiu": [430.4, 394.7], "Brașov": [585.0, 418.4], "București": [639.3, 603.2], "Iași": [797.7, 188.0], "Constanța": [906.9, 643.8], "Craiova": [395.5, 617.9], "Deva": [300.9, 381.8], "Baia Mare": [373.3, 112.2], "Suceava": [655.5, 113.0], "Galați": [840.6, 449.9], "Pitești": [509.0, 537.9], "Târgu Mureș": [476.1, 282.2]};

  // ------------------------------------------------------------------ sound: recorded effects + a music loop, through
  // the Web Audio context opened by the tap on the switch (portal-delight.js), so the iPhone plays it (also on silent:
  // the audio session is "playback"); effects that did not load yet are made on the spot
  const Sfx = (() => {
    const NAMES = ['whoosh-in', 'whoosh-out', 'impact', 'tap', 'tab', 'coin', 'claim', 'tension', 'unlock', 'level', 'trophy', 'hit', 'boss-down', 'error'];
    let ctx = null, sfxBus = null, musicBus = null, loading = null, musicBuf = null, musicP = null, musicSrc = null, musicWanted = false;
    const buf = {};
    let on = store.get('c360_game_sound', '1') !== '0';
    let musicOn = store.get('c360_game_music', '1') !== '0';
    const ac = () => {
      try {
        if (!ctx) {
          ctx = window.__gmAudio || null;
          if (!ctx) { const C = window.AudioContext || window.webkitAudioContext; if (!C) return null; ctx = window.__gmAudio = new C(); }
          const comp = ctx.createDynamicsCompressor();
          comp.connect(ctx.destination);
          sfxBus = ctx.createGain(); sfxBus.gain.value = 0.9; sfxBus.connect(comp);
          musicBus = ctx.createGain(); musicBus.gain.value = 0; musicBus.connect(comp);
        }
        if (ctx.state === 'suspended' || ctx.state === 'interrupted') ctx.resume().catch(() => {});
        return ctx;
      } catch (e) { return null; }
    };
    const fetchBuf = (name) => fetch('/game/sfx/' + name + '.mp3').then((r) => (r.ok ? r.arrayBuffer() : null))
      .then((ab) => (ab ? new Promise((ok) => { try { const p = ctx.decodeAudioData(ab, ok, () => ok(null)); if (p && p.then) p.then(ok, () => ok(null)); } catch (e) { ok(null); } }) : null)).catch(() => null);
    function preload() {
      if (loading || !ac()) return loading;
      loading = Promise.all(NAMES.map((n) => fetchBuf(n).then((b) => { if (b) buf[n] = b; })));
      return loading;
    }
    // the effects made on the spot (when a file is missing)
    const tone = (f, at, dur, type, vol, f2) => {
      const c = ac(); if (!c) return;
      const t = c.currentTime + at, o = c.createOscillator(), g = c.createGain();
      o.type = type || 'sine'; o.frequency.setValueAtTime(f, t);
      if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(sfxBus); o.start(t); o.stop(t + dur + 0.05);
    };
    let noiseBuf = null;
    const noise = (at, dur, f1, f2, vol, q) => {
      const c = ac(); if (!c) return;
      if (!noiseBuf) { noiseBuf = c.createBuffer(1, c.sampleRate * 1.5, c.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
      const t = c.currentTime + at, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
      s.buffer = noiseBuf; f.type = 'bandpass'; f.Q.value = q || 1;
      f.frequency.setValueAtTime(f1, t); f.frequency.exponentialRampToValueAtTime(f2, t + dur);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.35); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f); f.connect(g); g.connect(sfxBus); s.start(t); s.stop(t + dur + 0.05);
    };
    const SYNTH = {
      'whoosh-in': () => { noise(0, 0.75, 250, 5000, 0.55, 0.9); tone(120, 0, 0.6, 'sine', 0.2, 45); },
      'whoosh-out': () => noise(0, 0.6, 4500, 300, 0.45, 0.9),
      impact: () => { tone(150, 0, 0.6, 'sine', 0.7, 35); noise(0, 0.3, 900, 150, 0.4, 0.7); },
      tap: () => tone(720, 0, 0.05, 'triangle', 0.06, 520),
      tab: () => tone(420, 0, 0.09, 'sine', 0.06, 780),
      coin: () => { tone(988, 0, 0.08, 'square', 0.07); tone(1319, 0.07, 0.22, 'square', 0.07); },
      claim: () => [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, i * 0.07, 0.3, 'triangle', 0.12)),
      tension: () => { tone(55, 0, 2.2, 'sawtooth', 0.06, 110); noise(0, 2.2, 200, 1200, 0.05, 2); },
      unlock: () => { [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, i * 0.1, 0.55, 'triangle', 0.2)); tone(1567.98, 0.42, 1.2, 'sine', 0.12); noise(0.38, 1.1, 3000, 9000, 0.14, 0.5); tone(65.4, 0.38, 1.2, 'sine', 0.5, 40); },
      level: () => { [392, 523.25, 659.25, 783.99, 1046.5, 1318.5].forEach((f, i) => tone(f, i * 0.075, 0.32, 'square', 0.06)); tone(1567.98, 0.45, 0.9, 'triangle', 0.12); },
      trophy: () => { [1318.5, 1567.98, 2093].forEach((f, i) => tone(f, i * 0.06, 0.6, 'sine', 0.1)); },
      hit: () => { tone(120, 0, 0.3, 'sawtooth', 0.12, 45); noise(0, 0.18, 1400, 250, 0.3, 0.8); },
      'boss-down': () => { noise(0, 1.2, 2000, 100, 0.5, 0.6); [392, 523.25, 659.25, 783.99].forEach((f, i) => tone(f, 0.3 + i * 0.05, 1.2, 'triangle', 0.15)); },
      error: () => { tone(220, 0, 0.1, 'square', 0.06); tone(180, 0.12, 0.12, 'square', 0.06); },
    };
    function play(name, vol) {
      if (!on) return;
      const c = ac(); if (!c) return;
      const b = buf[name];
      if (!b) { if (SYNTH[name]) SYNTH[name](); preload(); return; }
      try { const s = c.createBufferSource(), g = c.createGain(); s.buffer = b; g.gain.value = vol == null ? 1 : vol; s.connect(g); g.connect(sfxBus); s.start(); } catch (e) { /* nothing */ }
    }
    async function music(want) {
      musicWanted = want;
      const c = ac(); if (!c) return;
      const t = c.currentTime;
      if (!want || !on || !musicOn) {
        musicBus.gain.cancelScheduledValues(t); musicBus.gain.setTargetAtTime(0, t, 0.25);
        if (musicSrc) { const s = musicSrc; musicSrc = null; setTimeout(() => { try { s.stop(); } catch (e) { /* stopped */ } }, 1200); }
        return;
      }
      if (musicSrc) { musicBus.gain.setTargetAtTime(0.3, t, 0.6); return; }
      if (!musicBuf) musicBuf = await (musicP || (musicP = fetchBuf('music').then((x) => { musicP = null; return x; })));
      if (!musicBuf || !musicWanted || !on || !musicOn || musicSrc) return;
      const s = c.createBufferSource(); s.buffer = musicBuf; s.loop = true; s.connect(musicBus); s.start();
      musicSrc = s;
      musicBus.gain.setValueAtTime(0, c.currentTime); musicBus.gain.setTargetAtTime(0.3, c.currentTime, 1.2);
    }
    // the music steps back while something big happens
    function duck(ms) { if (!musicSrc || !ctx) return; const t = ctx.currentTime; musicBus.gain.setTargetAtTime(0.06, t, 0.1); musicBus.gain.setTargetAtTime(0.3, t + ms / 1000, 0.8); }
    return {
      get on() { return on; }, get musicOn() { return musicOn; },
      unlock() { ac(); preload(); },
      set(v) { on = !!v; store.set('c360_game_sound', on ? '1' : '0'); music(musicWanted); if (on) play('tap'); },
      setMusic(v) { musicOn = !!v; store.set('c360_game_music', musicOn ? '1' : '0'); music(musicWanted); },
      music, duck, play, preload,
      suspend() { try { if (ctx && ctx.state === 'running') ctx.suspend(); } catch (e) { /* nothing */ } },
      resume() { try { if (ctx && ctx.state !== 'running') ctx.resume(); } catch (e) { /* nothing */ } },
      whoosh() { play('whoosh-in'); }, whooshOut() { play('whoosh-out'); }, impact() { play('impact'); }, coin() { play('coin', 0.65); }, tap() { play('tap', 1); },
      tab() { play('tab', 0.8); }, hit() { play('hit', 0.8); }, fanfare() { play('unlock'); }, level() { play('level'); }, tension() { play('tension'); },
      trophy() { play('trophy'); }, claim() { play('claim'); }, bossDown() { play('boss-down'); }, error() { play('error', 0.75); },
    };
  })();
  const buzz = (p) => { try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) { /* no motor */ } };

  // ------------------------------------------------------------------ the cars in 3D: the real photo and its depth map
  // (game/img/<id>-depth.png) in a WebGL shader: the camera orbits a little by itself and follows the finger or the
  // mouse; the near parts move more than the far ones, a light sweeps over the body. Without WebGL: the photo.
  const Car3D = (() => {
    const VS = 'attribute vec2 p;varying vec2 v;void main(){v=p*0.5+0.5;v.y=1.0-v.y;gl_Position=vec4(p,0.0,1.0);}';
    const FS = '#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#else\nprecision mediump float;\n#endif\nvarying vec2 v;uniform sampler2D img,dep;uniform vec2 off;uniform float zoom,sat,bright,time,focus,hasDep;uniform vec2 px;' +
      'void main(){vec2 uv=(v-0.5)/zoom+0.5;vec2 p=uv;float d=0.5;' +
      'if(hasDep>0.5){for(int i=0;i<7;i++){d=texture2D(dep,p).r;p=uv+off*(d-focus)*0.06;}}' +
      'vec4 c=texture2D(img,clamp(p,0.002,0.998));' +
      'float g=dot(c.rgb,vec3(0.299,0.587,0.114));c.rgb=mix(vec3(g),c.rgb,sat)*bright;' +
      'if(hasDep>0.5){float dx=texture2D(dep,p+vec2(px.x,0.0)).r-texture2D(dep,p-vec2(px.x,0.0)).r;float dy=texture2D(dep,p+vec2(0.0,px.y)).r-texture2D(dep,p-vec2(0.0,px.y)).r;' +
      'vec3 n=normalize(vec3(-dx*9.0,-dy*9.0,1.0));float a=time*0.55;vec3 L=normalize(vec3(cos(a)*0.9+off.x*0.6,0.35+off.y*0.4,0.75));' +
      'float spec=pow(max(dot(reflect(-L,n),vec3(0.0,0.0,1.0)),0.0),28.0)*smoothstep(0.45,0.8,d);' +
      'float sweep=smoothstep(0.08,0.0,abs(uv.x-fract(time*0.09)*1.6+0.3-uv.y*0.25))*smoothstep(0.5,0.85,d)*0.35;' +
      'c.rgb+=vec3(1.0,0.95,0.88)*(spec*0.55+sweep)*sat;}' +
      'float vg=smoothstep(1.15,0.35,length((v-0.5)*vec2(1.25,1.0)));c.rgb*=mix(0.55,1.0,vg);gl_FragColor=vec4(c.rgb,1.0);}';
    function create(canvas) {
      const gl = canvas.getContext('webgl', { premultipliedAlpha: false, antialias: false, preserveDrawingBuffer: false }) || canvas.getContext('experimental-webgl');
      if (!gl) return null;
      const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null; };
      const vs = sh(gl.VERTEX_SHADER, VS), fs = sh(gl.FRAGMENT_SHADER, FS);
      if (!vs || !fs) return null;
      const prog = gl.createProgram(); gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
      gl.useProgram(prog);
      const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(prog, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      const U = {}; ['img', 'dep', 'off', 'zoom', 'sat', 'bright', 'time', 'focus', 'hasDep', 'px'].forEach((k) => { U[k] = gl.getUniformLocation(prog, k); });
      gl.uniform1i(U.img, 0); gl.uniform1i(U.dep, 1);
      const tex = (unit) => { const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); return t; };
      const tImg = tex(0), tDep = tex(1);
      const st = { ox: 0, oy: 0, tx: 0, ty: 0, drag: null, zoom: 1.04, zoomTo: 1.04, sat: 0, satTo: 0, bright: 0.5, brightTo: 0.5, hasDep: 0, raf: 0, t0: performance.now(), visible: true, id: '' };
      canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); dead = true; cancelAnimationFrame(st.raf); const h = canvas.closest('.gm-slide, .card'); if (h) h.classList.remove('is-3d'); });
      const loadImg = (src) => new Promise((ok) => { if (!src) { ok(null); return; } const i = new Image(); i.decoding = 'async'; i.onload = () => ok(i); i.onerror = () => ok(null); i.src = src; });
      // the depth map small and soft: sharp steps in it would tear the picture at the car's edges
      function soft(im) {
        try {
          const c = document.createElement('canvas'), w = 512, h = Math.round(512 * im.height / im.width), x = c.getContext('2d');
          c.width = w; c.height = h; x.filter = 'blur(3px)'; x.drawImage(im, 0, 0, w, h);
          return c;
        } catch (e) { return im; }
      }
      function size() {
        const dpr = Math.min(2, window.devicePixelRatio || 1), w = canvas.clientWidth, h = canvas.clientHeight;
        if (w && h && (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr))) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); }
        gl.viewport(0, 0, canvas.width, canvas.height);
      }
      let dead = false;
      function frame(now) {
        if (dead) return;
        st.raf = requestAnimationFrame(frame);
        if (!st.visible || document.hidden) return;
        const t = (now - st.t0) / 1000;
        if (!st.drag && !(st.hoverAt && now - st.hoverAt < 1500)) { st.tx = Math.sin(t * 0.42) * 0.85; st.ty = Math.sin(t * 0.29) * 0.35; }
        const k = st.drag ? 0.25 : 0.05;
        st.ox += (st.tx - st.ox) * k; st.oy += (st.ty - st.oy) * k;
        st.zoom += (st.zoomTo - st.zoom) * 0.06; st.sat += (st.satTo - st.sat) * 0.05; st.bright += (st.brightTo - st.bright) * 0.05;
        size();
        gl.uniform2f(U.off, st.ox, st.oy); gl.uniform1f(U.zoom, st.zoom); gl.uniform1f(U.sat, st.sat); gl.uniform1f(U.bright, st.bright);
        gl.uniform1f(U.time, t % 600); gl.uniform1f(U.focus, 0.62); gl.uniform1f(U.hasDep, st.hasDep); gl.uniform2f(U.px, 1 / 700, 1 / 438);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
      const pt = (e) => (e.touches ? e.touches[0] : e);
      const down = (e) => { const p = pt(e); st.drag = { x: p.clientX, y: p.clientY, ox: st.tx, oy: st.ty }; };
      const move = (e) => { if (!st.drag) return; const p = pt(e), r = canvas.getBoundingClientRect(); st.tx = clamp(st.drag.ox + (p.clientX - st.drag.x) / r.width * 3, -1.4, 1.4); st.ty = clamp(st.drag.oy + (p.clientY - st.drag.y) / r.height * 2, -0.8, 0.8); };
      const up = () => { st.drag = null; };
      const hover = (e) => { if (e.pointerType !== 'mouse' || st.drag) return; const r = canvas.getBoundingClientRect(); st.tx = ((e.clientX - r.left) / r.width - 0.5) * 2.2; st.ty = ((e.clientY - r.top) / r.height - 0.5) * 1.2; st.hoverAt = performance.now(); };
      canvas.addEventListener('pointerdown', down); window.addEventListener('pointermove', move, { passive: true }); window.addEventListener('pointerup', up); canvas.addEventListener('pointermove', hover);
      canvas.addEventListener('touchstart', down, { passive: true }); window.addEventListener('touchmove', move, { passive: true }); window.addEventListener('touchend', up);
      return {
        async set(id, imgUrl, depthUrl, unlocked) {
          st.id = id;
          const [im, dp] = await Promise.all([loadImg(imgUrl), loadImg(depthUrl)]);
          if (dead || gl.isContextLost() || st.id !== id || !im) return false;
          gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tImg); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, im);
          gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, tDep);
          if (dp) gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, gl.LUMINANCE, gl.UNSIGNED_BYTE, soft(dp));
          st.hasDep = dp ? 1 : 0;
          st.sat = 0; st.bright = 0.2; st.zoom = 1.25;
          this.mode(unlocked);
          if (!st.raf) st.raf = requestAnimationFrame(frame);
          return true;
        },
        mode(unlocked) { st.satTo = unlocked ? 1 : 0.08; st.brightTo = unlocked ? 1.05 : 0.62; st.zoomTo = 1.04; },
        reveal() { st.satTo = 1; st.brightTo = 1.15; st.zoomTo = 1.0; setTimeout(() => { st.brightTo = 1.05; }, 900); },
        dolly(z) { st.zoomTo = z; },
        visible(v) { st.visible = v; },
        destroy() { dead = true; cancelAnimationFrame(st.raf); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('touchmove', move); window.removeEventListener('touchend', up);
          try { const x = gl.getExtension('WEBGL_lose_context'); if (x) x.loseContext(); } catch (e) { /* gone */ } },
      };
    }
    return { create };
  })();

  // ------------------------------------------------------------------ embers rising behind everything (canvas, ~30 fps)
  const Fx = (() => {
    let cv = null, cx = null, parts = [], raf = 0, last = 0, w = 0, h = 0;
    const COLS = ['255,77,157', '177,77,255', '255,138,61', '255,209,102', '109,92,255'];
    const size = () => { const dpr = Math.min(1.5, window.devicePixelRatio || 1); w = cv.clientWidth; h = cv.clientHeight; cv.width = w * dpr; cv.height = h * dpr; cx.setTransform(dpr, 0, 0, dpr, 0, 0); };
    const spawn = (anyY) => ({ x: Math.random() * w, y: anyY ? Math.random() * h : h + 10, r: 0.6 + Math.random() * 2.2, vy: 0.15 + Math.random() * 0.55, vx: (Math.random() - 0.5) * 0.25, a: 0.25 + Math.random() * 0.6, c: COLS[(Math.random() * COLS.length) | 0], t: Math.random() * 6.28 });
    const tick = (now) => {
      raf = requestAnimationFrame(tick);
      if (now - last < 32 || document.hidden) return;
      last = now;
      cx.clearRect(0, 0, w, h);
      cx.globalCompositeOperation = 'lighter';
      parts.forEach((p, i) => {
        p.y -= p.vy; p.t += 0.02; p.x += p.vx + Math.sin(p.t) * 0.2;
        if (p.y < -10) parts[i] = spawn(false);
        const g = cx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 4);
        g.addColorStop(0, 'rgba(' + p.c + ',' + p.a + ')'); g.addColorStop(1, 'rgba(' + p.c + ',0)');
        cx.fillStyle = g; cx.beginPath(); cx.arc(p.x, p.y, p.r * 4, 0, 6.283); cx.fill();
      });
    };
    return {
      start(canvas) {
        if (calm()) return;
        cv = canvas; cx = cv.getContext('2d'); size();
        const n = w < 600 ? 34 : 54;
        parts = Array.from({ length: n }, () => spawn(true));
        window.addEventListener('resize', size);
        raf = requestAnimationFrame(tick);
      },
      stop() { cancelAnimationFrame(raf); window.removeEventListener('resize', size); parts = []; cv = null; },
    };
  })();

  // ------------------------------------------------------------------ confetti (a burst from a point, gold and lava)
  function confetti(x, y, n, gold) {
    if (calm()) return;
    const cv = document.createElement('canvas');
    cv.className = 'gm-confetti';
    document.body.appendChild(cv);
    const dpr = Math.min(2, window.devicePixelRatio || 1), W = window.innerWidth, H = window.innerHeight;
    cv.width = W * dpr; cv.height = H * dpr;
    const cx = cv.getContext('2d'); cx.scale(dpr, dpr);
    const cols = gold ? ['#ffd166', '#fff2b8', '#f5a524', '#ffe08a', '#ff8a3d', '#ffffff'] : ['#6d5cff', '#b14dff', '#ff4d9d', '#ff8a3d', '#ffd166', '#3de0ff'];
    const P = Array.from({ length: n || 160 }, () => {
      const a = Math.random() * Math.PI * 2, s = 4 + Math.random() * 11;
      return { x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 6, r: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.4, w: 5 + Math.random() * 7, h: 3 + Math.random() * 5, c: cols[(Math.random() * cols.length) | 0], life: 0 };
    });
    const t0 = performance.now();
    (function step(now) {
      const t = now - t0;
      cx.clearRect(0, 0, W, H);
      P.forEach((p) => {
        p.vy += 0.28; p.vx *= 0.985; p.x += p.vx; p.y += p.vy; p.r += p.vr;
        cx.save(); cx.translate(p.x, p.y); cx.rotate(p.r); cx.globalAlpha = Math.max(0, 1 - t / 2600);
        cx.fillStyle = p.c; cx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.r * 2)) + 1); cx.restore();
      });
      if (t < 2700) requestAnimationFrame(step); else cv.remove();
    })(t0);
  }

  // ------------------------------------------------------------------ state
  const S = { d: null, open: false, root: null, tab: store.get('c360_game_tab', 'imperiu'), last: new Map(), timer: 0, gi: -1, filter: 'all', busy: false, cer: false, credits: null, sheet: null };
  const api = (body) => K.api('/api/portal-game', body);
  async function load() {
    const d = await K.api('/api/portal-game');
    S.d = d; S.loadedAt = Date.now(); // the countdowns and the next refresh count from here
    return d;
  }

  // ------------------------------------------------------------------ count-ups and bars
  function hydrate(scope, fresh) {
    scope.querySelectorAll('[data-n]').forEach((el) => {
      const to = Number(el.dataset.n) || 0, key = el.dataset.k || '', fmt = el.dataset.f || '';
      const from = fresh || !S.last.has(key) ? (el.dataset.from != null ? Number(el.dataset.from) : 0) : S.last.get(key);
      S.last.set(key, to);
      const out = (v) => { el.textContent = fmt === 'lei' ? ro(Math.round(v)) : fmt === 'pct' ? Math.round(v) + '%' : fmt === 'x' ? ro(v, 1) : ro(Math.round(v)); };
      if (calm() || from === to) { out(to); return; }
      const t0 = performance.now(), dur = 1300;
      (function step(now) {
        const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 4);
        out(from + (to - from) * e);
        if (k < 1) requestAnimationFrame(step);
      })(t0);
    });
    requestAnimationFrame(() => requestAnimationFrame(() => {
      scope.querySelectorAll('[data-w]').forEach((el) => { el.style.width = (clamp(Number(el.dataset.w) || 0, 0, 1) * 100) + '%'; });
      scope.querySelectorAll('[data-ring]').forEach((el) => { const c = Number(el.dataset.c); el.style.strokeDashoffset = String(c * (1 - clamp(Number(el.dataset.ring) || 0, 0, 1))); });
      scope.querySelectorAll('[data-p]').forEach((el) => { el.style.setProperty('--p', clamp(Number(el.dataset.p) || 0, 0, 1)); });
    }));
  }
  const num = (v, key, f, from) => '<span class="gm-num" data-n="' + (Number(v) || 0) + '" data-k="' + esc(key) + '"' + (f ? ' data-f="' + f + '"' : '') + (from != null ? ' data-from="' + from + '"' : '') + '>0</span>';
  const bar = (p, cls) => '<div class="gm-bar' + (cls ? ' ' + cls : '') + '"><i data-w="' + clamp(Number(p) || 0, 0, 1) + '"></i></div>';
  const ring = (p, size, stroke, label) => {
    const r = (size - stroke) / 2, c = 2 * Math.PI * r;
    return '<div class="gm-ring" style="width:' + size + 'px;height:' + size + 'px"><svg viewBox="0 0 ' + size + ' ' + size + '"><circle class="bg" cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" stroke-width="' + stroke + '"/>' +
      '<circle class="fg" cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" stroke-width="' + stroke + '" stroke-dasharray="' + c + '" stroke-dashoffset="' + c + '" data-ring="' + p + '" data-c="' + c + '"/></svg>' + (label || '') + '</div>';
  };
  let riseI = 0;
  const rise = () => ' gm-rise" style="--i:' + (riseI++);

  // ------------------------------------------------------------------ the shell
  const DEFS = '<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>' +
    '<linearGradient id="gmLavaStroke" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6d5cff"/><stop offset=".5" stop-color="#ff4d9d"/><stop offset="1" stop-color="#ff8a3d"/></linearGradient>' +
    '<linearGradient id="gmGoldStroke" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff2b8"/><stop offset=".5" stop-color="#ffd166"/><stop offset="1" stop-color="#f5a524"/></linearGradient>' +
    '<linearGradient id="gmEdge" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6d5cff"/><stop offset=".45" stop-color="#c04dff"/><stop offset=".75" stop-color="#ff4d9d"/><stop offset="1" stop-color="#ff8a3d"/></linearGradient>' +
    '<radialGradient id="gmLand" cx="40%" cy="40%" r="75%"><stop offset="0" stop-color="#2b2156"/><stop offset=".6" stop-color="#151030"/><stop offset="1" stop-color="#0b0918"/></radialGradient>' +
    '<pattern id="gmDots" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.6" fill="rgba(177,77,255,.45)"/></pattern>' +
    '<filter id="gmGlow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="10" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>' +
    '<radialGradient id="gmOrb" cx="40%" cy="35%" r="65%"><stop offset="0" stop-color="#fff"/><stop offset=".35" stop-color="#ff9ad0"/><stop offset=".7" stop-color="#ff4d9d"/><stop offset="1" stop-color="#8b1d5b"/></radialGradient>' +
    '<radialGradient id="gmBossCore" cx="50%" cy="42%" r="58%"><stop offset="0" stop-color="#fff3c4"/><stop offset=".3" stop-color="#ff8a3d"/><stop offset=".72" stop-color="#ff2d55"/><stop offset="1" stop-color="#4a0014"/></radialGradient>' +
    '<linearGradient id="gmCarYou" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#6d5cff"/><stop offset=".55" stop-color="#ff4d9d"/><stop offset="1" stop-color="#ff8a3d"/></linearGradient>' +
    '<linearGradient id="gmCarGhost" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#1b6dff"/><stop offset="1" stop-color="#3de0ff"/></linearGradient>' +
    '<clipPath id="gmRoClip"><path d="' + RO_PATH + '"/></clipPath>' +
    '</defs></svg>';
  const TABS = [['imperiu', 'Imperiu', 'castle'], ['misiuni', 'Misiuni', 'scroll'], ['garaj', 'Garaj', 'car'], ['echipa', 'Echipa', 'users'], ['insigne', 'Insigne', 'medal']];
  const RAR = ['Comun', 'Rar', 'Epic', 'Legendar', 'Mitic'];

  function avatarHtml() {
    const me = (K.data && K.data.me) || {};
    return me.photo ? '<img src="' + esc(me.photo) + '" alt="">' : '<span>' + esc(String(me.name || 'A').trim().charAt(0).toUpperCase()) + '</span>';
  }
  function mount() {
    const root = document.createElement('div');
    root.className = 'gm';
    root.setAttribute('role', 'application');
    root.setAttribute('aria-label', 'Game Mode');
    root.innerHTML = '<div class="gm-bg"><i></i><i></i><i></i><div class="gm-grid"></div></div><canvas class="gm-fx"></canvas><div class="gm-scan"></div>' + DEFS +
      '<header class="gm-hud">' +
        '<button type="button" class="gm-lvl" data-act="level" aria-label="Nivelul"><svg class="ring" viewBox="0 0 58 58"><circle cx="29" cy="29" r="26" fill="none" stroke="rgba(255,255,255,.1)" stroke-width="4"/>' +
          '<circle class="fg" cx="29" cy="29" r="26" fill="none" stroke="url(#gmLavaStroke)" stroke-width="4" stroke-linecap="round" stroke-dasharray="163.4" stroke-dashoffset="163.4" style="transition:stroke-dashoffset 1.4s cubic-bezier(.16,1,.3,1)"/></svg>' +
          '<span class="hex"><span><small>NIV</small><b data-lv>1</b></span></span></button>' +
        '<button type="button" class="gm-xp" data-act="stage"><div class="gm-xp-top"><b data-title>Etapa</b><span data-xptxt></span></div><div class="gm-xpbar"><i></i></div></button>' +
        '<button type="button" class="gm-gold" data-act="treasury" aria-label="Trezoreria">' + ic('coins') + '<span data-treasury>0</span></button>' +
        '<button type="button" class="gm-hud-btn is-av" data-act="menu" aria-label="Profil">' + avatarHtml() + '</button>' +
      '</header>' +
      '<main class="gm-main"></main>' +
      '<nav class="gm-nav">' + TABS.map(([id, label, i]) => '<button type="button" data-tab="' + id + '"' + (id === 'garaj' ? ' class="big"' : '') + '>' +
        (id === 'garaj' ? '<span class="orb">' + ic(i) + '</span>' : ic(i)) + '<span>' + label + '</span></button>').join('') + '</nav>';
    document.body.appendChild(root);
    document.documentElement.classList.add('gm-on');
    S.root = root;
    root.addEventListener('click', onClick);
    // the first touch inside the game wakes the sound (a game opened by itself at page load, without a tap)
    const wake = () => {
      if (S.audioOk) return;
      if (window.C360GameBoot && window.C360GameBoot.audio) window.C360GameBoot.audio();
      Sfx.unlock(); Sfx.music(true);
      const ctx = window.__gmAudio;
      if (ctx && ctx.state === 'running') { S.audioOk = true; ['pointerup', 'touchend', 'click', 'keydown'].forEach((t) => root.removeEventListener(t, wake, true)); }
    };
    ['pointerup', 'touchend', 'click', 'keydown'].forEach((t) => root.addEventListener(t, wake, { capture: true, passive: true }));
    Fx.start(root.querySelector('.gm-fx'));
    return root;
  }
  const short = (n) => { n = Number(n) || 0; const a = Math.abs(n); return (n < 0 ? '-' : '') + (a >= 1e6 ? ro(a / 1e6, a >= 1e7 ? 0 : 1) + ' mil.' : a >= 1e4 ? ro(Math.round(a / 1000)) + 'k' : ro(Math.round(a))); };

  function paintHud() {
    const d = S.d; if (!d || !S.root) return;
    const L = d.level, hud = S.root.querySelector('.gm-hud');
    hud.querySelector('.gm-lvl').className = 'gm-lvl t' + Math.min(5, Math.floor(d.stage.i / 2));
    hud.querySelector('[data-lv]').textContent = L.level;
    hud.querySelector('[data-title]').textContent = d.stage.name;
    hud.querySelector('[data-xptxt]').textContent = ro(L.xp - L.from) + ' / ' + ro(L.to - L.from) + ' XP';
    const tr = hud.querySelector('[data-treasury]'); tr.textContent = short(d.treasury); tr.parentElement.classList.toggle('is-neg', d.treasury < 0);
    requestAnimationFrame(() => {
      hud.querySelector('.gm-xpbar i').style.setProperty('--p', L.progress);
      hud.querySelector('.gm-lvl .fg').style.strokeDashoffset = String(163.4 * (1 - L.progress));
    });
    const dots = { misiuni: d.missions.claimable, insigne: d.badges.filter((t) => t.isNew).length, garaj: d.goals.filter((g) => g.isNew).length };
    S.root.querySelectorAll('.gm-nav [data-tab]').forEach((b) => {
      b.classList.toggle('is-on', b.dataset.tab === S.tab);
      const n = dots[b.dataset.tab] || 0, old = b.querySelector('.dot');
      if (old) old.remove();
      if (n) b.insertAdjacentHTML('beforeend', '<span class="dot">' + (n > 99 ? '99+' : n) + '</span>');
    });
  }

  // ------------------------------------------------------------------ screens
  function show(tab, opts) {
    opts = opts || {};
    if (!S.root || !S.d) return;
    if (!SCREENS[tab]) tab = 'imperiu';
    const main = S.root.querySelector('.gm-main');
    const old = main.querySelector('.gm-screen:not(.is-out)');
    const same = old && old.dataset.screen === tab;
    if (!same && !opts.silent) Sfx.tab();
    if (!same && S.car) { S.car.destroy(); S.car = null; }
    S.tab = tab; store.set('c360_game_tab', tab);
    riseI = 0;
    const html = '<div class="gm-wrap is-' + tab + '">' + SCREENS[tab](S.d) + '</div>';
    if (same && opts.static) {
      const top = old.scrollTop;
      old.classList.add('gm-static');
      if (tab === 'garaj' && S.car) refreshGarage(old); // the garage keeps its 3D car: only what changed is redrawn
      else { old.innerHTML = html; after(tab, old, false, true); }
      old.scrollTop = top;
      paintHud();
      return;
    }
    const el = document.createElement('div');
    el.className = 'gm-screen is-in'; el.dataset.screen = tab;
    el.innerHTML = html;
    if (old) { old.classList.add('is-out'); setTimeout(() => old.remove(), 220); }
    main.appendChild(el);
    after(tab, el, true);
    paintHud();
  }
  function after(tab, el, fresh, quiet) {
    hydrate(el, false);
    if (tab === 'garaj') wireGarage(el, fresh || quiet);
    if (tab === 'imperiu') wireMap(el);
    if (tab === 'imperiu' && fresh) {
      const em = el.querySelector('.gm-boss-em');
      if (em && S.d.season.today > 0) setTimeout(() => { em.classList.add('is-hit'); Sfx.hit(); const b = el.querySelector('.gm-hp b'); if (b) b.classList.add('is-flash'); }, 700);
    }
  }

  const BOSS_SVG = '<svg viewBox="0 0 100 100" aria-hidden="true">' +
    '<path d="M20 40 L4 8 L34 28 Z" fill="#ff4d5e"/><path d="M80 40 L96 8 L66 28 Z" fill="#ff4d5e"/>' +
    '<path d="M28 26 L34 8 L43 19 L50 2 L57 19 L66 8 L72 26 Z" fill="#ffd166" stroke="#a5650a" stroke-width="1.5"/>' +
    '<circle class="core" cx="50" cy="58" r="34" fill="url(#gmBossCore)"/>' +
    '<g class="eye"><ellipse cx="50" cy="54" rx="17" ry="9.5" fill="#14000a"/><ellipse cx="50" cy="54" rx="4.5" ry="8.5" fill="#ffd166"/></g>' +
    '<path d="M33 74 L37.5 81 L42 74 L46.5 81 L51 74 L55.5 81 L60 74 L64.5 81 L68 74" stroke="#14000a" stroke-width="3.2" fill="none" stroke-linejoin="round"/></svg>';
  const CAR = (fill) => '<svg viewBox="0 0 64 24" aria-hidden="true"><path d="M3 17C3 14 6 12.5 10 12l10-1c4-3 10-5 18-5 6 0 10 2 14 5l7 1.5c2.5.5 3 2.5 3 4.5v1H3z" fill="url(#' + fill + ')"/>' +
    '<path d="M24 11c4-2.5 8-3.5 13-3.5h3l1 3.5z" fill="rgba(10,8,20,.75)"/><path d="M58 13.5h3" stroke="#fff" stroke-width="1.5" stroke-linecap="round"/>' +
    '<circle cx="15" cy="18" r="4.6" fill="#0b0918"/><circle cx="15" cy="18" r="2" fill="#bbb"/><circle cx="50" cy="18" r="4.6" fill="#0b0918"/><circle cx="50" cy="18" r="2" fill="#bbb"/></svg>';
  const fmtDay = (day) => { const p = String(day || '').split('-'); return p.length === 3 ? Number(p[2]) + ' ' + ['ian', 'feb', 'mar', 'apr', 'mai', 'iun', 'iul', 'aug', 'sep', 'oct', 'nov', 'dec'][Number(p[1]) - 1] : ''; };
  const cap = (s) => String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1);
  const pct = (v) => Math.round((Number(v) || 0) * 100) + '%';

  function imperiu(d) {
    const s = d.season, m = d.money, e = d.engine, race = d.race, st = d.stage;
    let h = '';
    h += '<section class="gm-card gm-hero a-hero' + rise() + '"><span class="gm-eyebrow">Încasat în ' + esc(d.monthLabel.split(' ')[0]) + (e.partial ? ' (din ' + esc(fmtDay(e.from)) + ')' : '') + '</span>' +
      '<span class="gm-big">' + num(m.month, 'h-month', 'lei') + '<small>LEI</small></span>' +
      '<div class="gm-chips"><span class="gm-chip is-good">' + ic('bolt') + 'Azi ' + num(m.today, 'h-today', 'lei') + ' lei</span>' +
      '<span class="gm-chip">' + ic('trend') + 'Spre ' + num(m.projected, 'h-proj', 'lei') + ' lei</span>' +
      '<span class="gm-chip">' + ic('clock') + 'Ieri ' + lei(m.yesterday) + '</span></div></section>';
    // the stage on Hormozi's roadmap: a ladder of 10
    h += '<section class="gm-card gm-roadmap a-stage is-tap' + rise() + '" data-act="stage"><div class="gm-card-h"><h3>' + ic('mountain') + 'Etapa ' + st.i + ' · ' + esc(st.name) + '</h3><span class="gm-chip">' + short(st.yearPace) + ' lei/an</span></div>' +
      '<div class="gm-ladder">' + st.all.map((x) => '<i class="' + (x.i < st.i ? 'is-done' : x.i === st.i ? 'is-now' : '') + '" style="--i:' + x.i + '"></i>').join('') + '</div>' +
      (st.next ? '<div class="gm-stage-next"><span>Spre <b>' + esc(st.next.name) + '</b>: ' + short(st.next.min) + ' lei/an</span><span class="gm-num">' + Math.round(st.next.progress * 100) + '%</span></div>' + bar(st.next.progress) +
        '<p class="gm-note">' + esc(st.focus) + (st.next.eta ? ' În ritmul de acum ajungi acolo în <b>' + esc(st.next.eta.label) + '</b>.' : '') + '</p>' : '<p class="gm-note">Ultima etapă.</p>') + '</section>';
    if (s.target) {
      const left = Math.max(0, s.target - s.done);
      h += '<section class="gm-card gm-boss a-boss is-tap' + rise() + '" data-act="boss"><div class="gm-boss-em">' + BOSS_SVG + '</div><div>' +
        '<span class="gm-eyebrow">' + esc(s.label) + ' · bossul</span><h4>' + esc(s.boss) + '</h4>' +
        '<div class="gm-hp"><i data-w="' + (1 - s.pct) + '" style="width:100%"></i><b style="left:' + ((1 - s.pct) * 100) + '%;width:' + Math.min(30, (s.today / s.target) * 100) + '%"></b></div>' +
        '<div class="gm-hp-txt"><span>HP <span class="gm-num">' + lei(left) + '</span></span><span>' + (s.daysLeft === 1 ? '1 zi' : s.daysLeft + de(s.daysLeft) + 'zile') + '</span></div>' +
        '<p class="gm-note" style="margin-top:.45rem">' + (s.defeated ? '<b>Învins.</b> Tot ce intră acum e bonus de sezon.' : 'Lovitura de azi: <b>' + lei(s.today) + '</b>. Ritmul care îl doboară: <b>' + lei(s.needPerDay) + ' pe zi</b>.') + '</p></div>' +
        (s.defeated ? '<span class="gm-stamp">ÎNVINS</span>' : '') + '</section>';
    }
    h += '<section class="gm-card gm-map a-map' + rise() + '"><div class="gm-card-h"><h3>' + ic('map') + 'Imperiul</h3><span class="gm-chip">' + d.locations + (d.locations === 1 ? ' clinică' : ' clinici') + ' · ' + (d.staff === 1 ? '1 om' : d.staff + de(d.staff) + 'oameni') + '</span></div>' +
      '<div class="gm-map-box" data-mapbox>' + mapSvg(d) + '<button type="button" class="gm-map-back" data-act="map-out" hidden>' + ic('x') + 'Toată harta</button></div>' +
      '<div class="gm-map-legend">' + d.map.active.map((c) => '<button type="button" class="gm-chip" data-city="' + esc(c.name) + '">' + stars(c.stars, true) + esc(c.name) + '</button>').join('') +
        (d.map.next ? '<button type="button" class="gm-chip is-gold" data-city="' + esc(d.map.next) + '">' + ic('lock') + esc(d.map.next) + ' · ' + Math.round(d.map.readiness * 100) + '%</button>' : '') + '</div>' +
      '<p class="gm-note">Atinge un oraș.</p></section>';
    if (d.derby) {
      const [a, b] = d.derby;
      const row = (k, label, f) => '<div class="r"><b class="' + (a[k] > b[k] ? 'w' : '') + '">' + f(a[k]) + '</b><span>' + label + '</span><b class="' + (b[k] > a[k] ? 'w' : '') + '">' + f(b[k]) + '</b></div>';
      h += '<section class="gm-card gm-derby a-derby' + rise() + '"><div class="gm-card-h"><h3>' + ic('sword') + 'Derby-ul săptămânii</h3><span class="gm-chip">' + a.points + ' : ' + b.points + '</span></div>' +
        '<div class="vs"><span class="' + (a.points > b.points ? 'lead' : '') + '">' + esc(a.name) + '</span><i>VS</i><span class="' + (b.points > a.points ? 'lead' : '') + '">' + esc(b.name) + '</span></div>' +
        row('revenue', 'Încasat', (v) => short(v)) + row('booked', 'Programări', ro) + row('came', 'Cliente venite', ro) + row('upsells', 'Upselluri', ro) + '</section>';
    }
    if (d.constraint) {
      const c = d.constraint;
      const v = c.unit === '%' ? Math.round(c.value) + '%' : c.unit === 'min' ? ro(c.value) + ' min' : ro(c.value);
      const t = c.unit === '%' ? c.target + '%' : c.unit === 'min' ? c.target + ' min' : ro(c.target);
      h += '<section class="gm-card gm-constraint a-con' + rise() + '"><div class="gm-card-h"><h3>' + ic('target') + 'Blocajul de acum</h3><span class="gm-chip is-bad">cea mai slabă verigă</span></div>' +
        '<div class="big"><b>' + esc(c.label) + '</b><span><span class="gm-num">' + v + '</span> / ținta ' + t + '</span></div>' + bar(c.lower ? clamp(c.target / Math.max(0.1, c.value), 0, 1) : clamp(c.value / c.target, 0, 1)) +
        '<p class="gm-note">' + esc(c.tip) + ' Hormozi: rezolvi câte un blocaj pe rând, întâi pe cel mai slab.</p></section>';
    }
    if (race.mode) {
      const fin = Math.max(race.rivalEnd || 0, race.you[race.you.length - 1] || 0, 1) * 1.04;
      const youV = race.you[race.dayNo - 1] || 0, rivV = race.rival[race.dayNo - 1] || 0;
      h += '<section class="gm-card gm-race a-race' + rise() + '"><div class="gm-card-h"><h3>' + ic('flag') + 'Cursa lunii</h3><span class="gm-chip">ziua ' + race.dayNo + ' din ' + race.days + '</span></div>' +
        '<div class="gm-track"><div class="gm-lane"><span class="tag">TU</span><span class="car" data-p="' + youV / fin + '">' + CAR('gmCarYou') + '</span></div>' +
        '<div class="gm-lane is-ghost"><span class="tag">' + esc(race.rivalLabel.toUpperCase()) + '</span><span class="car" data-p="' + rivV / fin + '">' + CAR('gmCarGhost') + '</span></div></div>' +
        '<div class="gm-race-sum"><span class="gm-eyebrow">' + (race.lead >= 0 ? 'Ești în față cu' : 'Ești în urmă cu') + '</span><span class="gm-num ' + (race.lead >= 0 ? 'is-up' : 'is-down') + '">' + (race.lead >= 0 ? '+' : '') + lei(Math.abs(race.lead)) + '</span></div></section>';
    }
    const rev = Math.max(1, e.revenue);
    let acc = 0;
    const row = (cls, label, v, a, w, i) => '<div class="row ' + cls + '"><span>' + label + '</span><div class="bar"><i style="--a:' + clamp(a, 0, 1) + ';--w:' + clamp(w, 0, 1) + ';--i:' + i + '"></i></div><span class="gm-num">' + lei(v) + '</span></div>';
    const outs = [['Salarii', e.payroll], ['Salariul tău', e.owner], ['Reclame', e.ads], ['Costuri clinici', e.fixed], ['Consumabile', e.consumables]];
    h += '<section class="gm-card gm-engine a-engine' + rise() + '"><div class="gm-card-h"><h3>' + ic('bolt') + 'Motorul lunii</h3>' + (e.margin != null ? '<span class="gm-chip ' + (e.profit >= 0 ? 'is-gold' : 'is-bad') + '">marjă ' + Math.round(e.margin) + '%</span>' : '') + '</div>' +
      row('rev', 'Încasări', e.revenue, 0, 1, 0) +
      outs.map(([label, v], i) => { acc += v; return row('out', '- ' + label, v, 1 - acc / rev, v / rev, i + 1); }).join('') +
      row('profit' + (e.profit < 0 ? ' is-neg' : ''), 'Profit', e.profit, 0, Math.max(0, e.profit) / rev, 6) +
      '<p class="gm-note">Luna întreagă, în ritmul de acum' + (e.partial ? ', socotită din ' + esc(fmtDay(e.from)) : '') + '. Costurile clinicilor sunt cele reale (chiria cu utilitățile, contabilitatea, leasingul aparatelor). Salariul tău de manager și consumabilele sunt standardul jocului. Înainte de impozit.' + (e.adsEstimated ? ' Reclamele nu s-au putut citi acum: sunt estimate ' + (e.adsStd ? 'la ' + Math.round(d.rules.std.adsRatio * 100) + '% din încasări (standardul jocului).' : 'din ultima lună cunoscută.') : '') + '</p></section>';
    const g = d.goals.find((x) => x.id === d.nextGoal);
    if (g) {
      h += '<section class="gm-card gm-teaser a-teaser is-tap' + rise() + '" data-act="goal" data-id="' + esc(g.id) + '"><div class="pic">' + (CUT[g.img] ? '<img class="cut" src="' + esc(cutOf(g)) + '" alt="" loading="lazy" onerror="this.remove()">' : '<img src="' + esc(srcOf(g)) + '" alt="" loading="lazy" onerror="this.remove()">') + '</div>' +
        '<div><span class="gm-eyebrow">Următorul din garaj</span><h4>' + esc(g.name) + '</h4><span class="gm-chip">' + ic('clock') + esc(etaShort(g)) + '</span></div>' +
        ring(g.progress, 58, 5, '<span class="gm-num">' + Math.round(g.progress * 100) + '%</span>') + '</section>';
    }
    return h;
  }
  const etaShort = (g) => (g.unlocked ? 'Deblocat' : !g.eta || !g.eta.month ? 'departe, în ritmul de acum' : g.eta.inMonths <= 0 ? 'luna asta' : g.eta.inMonths >= 24 ? 'peste ' + yearsTxt(g.eta.inMonths) : esc(g.eta.label));
  const stars = (n, small) => '<span class="gm-stars' + (small ? ' is-sm' : '') + '">' + [0, 1, 2, 3, 4].map((i) => '<i class="' + (i < n ? 'on' : '') + '" style="--i:' + i + '">' + ic('star') + '</i>').join('') + '</span>';

  // ------------------------------------------------------------------ the map: tap a city, the map flies to it
  function mapSvg(d) {
    const act = d.map.active, maxRev = Math.max(1, ...act.map((a) => a.revenue));
    let s = '<svg class="ro" viewBox="0 0 1040 740" role="img" aria-label="Harta imperiului" data-map>' +
      '<path class="ro-land" d="' + RO_PATH + '"/><rect class="ro-grid" x="0" y="0" width="1040" height="740" clip-path="url(#gmRoClip)"/><path class="ro-edge" d="' + RO_PATH + '"/>';
    d.map.locked.forEach((c, i) => {
      const xy = CITY_XY[c]; if (!xy) return;
      const next = c === d.map.next;
      s += '<g class="gm-city is-locked' + (next ? ' is-next' : '') + '" data-city="' + esc(c) + '">' +
        '<circle cx="' + xy[0] + '" cy="' + xy[1] + '" r="34" fill="transparent"/>' +
        (next ? '<circle class="ring" cx="' + xy[0] + '" cy="' + xy[1] + '" r="30" fill="none" stroke="#ffd166" stroke-width="3" stroke-dasharray="10 9"/>' : '') +
        '<circle cx="' + xy[0] + '" cy="' + xy[1] + '" r="' + (next ? 11 : 7) + '" fill="' + (next ? 'rgba(255,209,102,.25)' : '#221d3d') + '" stroke="' + (next ? '#ffd166' : '#4c4870') + '" stroke-width="2.5"/>' +
        (next ? '<text x="' + (xy[0] + 44) + '" y="' + (xy[1] - 22) + '" font-size="40">' + esc(c) + '</text><text class="sub" x="' + (xy[0] + 44) + '" y="' + (xy[1] + 12) + '" font-size="30" fill="#ffd166">' + Math.round(d.map.readiness * 100) + '% pregătit</text>'
          : '<text class="mini" x="' + (xy[0] + 14) + '" y="' + (xy[1] + 8) + '" font-size="22">' + esc(c) + '</text>') + '</g>';
    });
    const byNorth = act.map((a) => a.name).sort((x, y) => ((CITY_XY[x] || [0, 999])[1] - (CITY_XY[y] || [0, 999])[1]));
    act.forEach((a, i) => {
      const xy = CITY_XY[a.name] || [300 + i * 120, 300];
      const r = 16 + 20 * Math.sqrt(a.revenue / maxRev);
      const up = byNorth.indexOf(a.name) % 2 === 0;
      const lx = xy[0] + 96, ly = xy[1] + (up ? -46 : 92);
      s += '<g class="gm-city is-active" data-city="' + esc(a.name) + '" style="--i:' + i + '">' +
        '<circle cx="' + xy[0] + '" cy="' + xy[1] + '" r="' + (r + 26) + '" fill="transparent"/>' +
        '<circle class="beacon" cx="' + xy[0] + '" cy="' + xy[1] + '" r="' + r + '" fill="none" stroke="#ff4d9d" stroke-width="3"/>' +
        '<circle cx="' + xy[0] + '" cy="' + xy[1] + '" r="' + (r + 10) + '" fill="rgba(255,77,157,.18)"/>' +
        '<circle class="orb" cx="' + xy[0] + '" cy="' + xy[1] + '" r="' + r + '" fill="url(#gmOrb)" filter="url(#gmGlow)"/>' +
        '<path class="lead" d="M' + (xy[0] + r * 0.7) + ' ' + (xy[1] + (up ? -r * 0.7 : r * 0.7)) + ' L' + (lx - 10) + ' ' + (ly - 14) + '" stroke="rgba(255,255,255,.4)" stroke-width="2.5" fill="none" stroke-dasharray="5 6"/>' +
        '<text x="' + lx + '" y="' + ly + '" font-size="46">' + esc(a.name) + '</text>' +
        '<text class="sub" x="' + lx + '" y="' + (ly + 40) + '" font-size="34">' + esc(lei(a.revenue)) + (a.today ? ' · azi +' + esc(ro(a.today)) : '') + '</text></g>';
    });
    return s + '</svg>';
  }
  function wireMap(el) {
    const svg = el.querySelector('[data-map]');
    if (!svg) return;
    svg._vb = [0, 0, 1040, 740];
  }
  function flyTo(svg, to, ms) {
    if (!svg) return;
    const from = svg._vb || [0, 0, 1040, 740], t0 = performance.now(), dur = calm() ? 1 : ms || 900;
    cancelAnimationFrame(svg._fly);
    (function step(now) {
      const k = Math.min(1, (now - t0) / dur), e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      const v = from.map((f, i) => f + (to[i] - f) * e);
      svg.setAttribute('viewBox', v.map((x) => x.toFixed(1)).join(' '));
      svg._vb = v;
      if (k < 1) svg._fly = requestAnimationFrame(step);
    })(t0);
  }
  function zoomCity(name) {
    const svg = S.root && S.root.querySelector('[data-map]');
    const xy = CITY_XY[name], g = svg && svg.querySelector('.gm-city[data-city="' + (window.CSS && CSS.escape ? CSS.escape(name) : name) + '"]');
    if (svg && xy) {
      // the box around the city and its label, in the upper part of the map (the sheet rises over the lower part)
      let bb = null; try { bb = g && g.getBBox(); } catch (e) { /* not rendered */ }
      if (!bb || !bb.width) bb = { x: xy[0] - 40, y: xy[1] - 40, width: 80, height: 80 };
      const w = clamp(bb.width * 1.35, 420, 900), h = w * 740 / 1040;
      flyTo(svg, [clamp(bb.x + bb.width / 2 - w / 2, -60, 1100 - w), clamp(bb.y - h * 0.1, -60, 800 - h), w, h]);
      svg.classList.add('is-zoom');
      svg.querySelectorAll('.gm-city').forEach((g) => g.classList.toggle('is-focus', g.dataset.city === name));
      const back = S.root.querySelector('[data-act="map-out"]'); if (back) back.hidden = false;
      const box = svg.closest('.gm-card'), sc = box && box.closest('.gm-screen');
      if (box && sc) sc.scrollTo({ top: Math.max(0, box.offsetTop - 8), behavior: calm() ? 'auto' : 'smooth' });
    }
    Sfx.play('whoosh-out', 0.45); buzz(10);
  }
  function zoomOut() {
    const svg = S.root && S.root.querySelector('[data-map]');
    if (!svg) return;
    flyTo(svg, [0, 0, 1040, 740], 700);
    svg.classList.remove('is-zoom');
    svg.querySelectorAll('.gm-city').forEach((g) => g.classList.remove('is-focus'));
    const back = S.root.querySelector('[data-act="map-out"]'); if (back) back.hidden = true;
  }

  // ------------------------------------------------------------------ the garage: a 3D showroom
  // the cars cut out of their pictures (game/img/<id>-cut.webp), each one standing on a floating platform built here
  const CUT = { m4: 1, gt3rs: 1, svj: 1 };
  const cutOf = (g) => (CUT[g.img] ? '/game/img/' + encodeURIComponent(g.img) + '-cut.webp' : '');
  function showroom(g, i) {
    return '<div class="gm-room"><div class="plat"><i class="under"></i><i class="side"></i><i class="top"></i></div>' +
      '<div class="car"><i class="shadow"></i><img class="body" src="' + esc(cutOf(g)) + '" alt="" loading="' + (i < 2 ? 'eager' : 'lazy') + '" decoding="async"></div></div>';
  }
  function goalStage(g, i) {
    return '<button type="button" class="gm-slide ' + (g.unlocked ? 'is-unlocked' : 'is-locked') + '" data-slide="' + i + '" data-id="' + esc(g.id) + '">' +
      '<div class="gm-stage' + (CUT[g.img] ? ' is-room' : '') + '">' + (CUT[g.img] ? showroom(g, i) : '<img src="' + esc(srcOf(g)) + '" alt="" loading="' + (i < 2 ? 'eager' : 'lazy') + '" decoding="async" onerror="this.remove()">') +
        (g.unlocked ? '<span class="won">DEBLOCAT</span>' : '<span class="lock">' + ic('lock') + Math.round(g.progress * 100) + '%</span>') +
        '<div class="cap"><div><h4>' + esc(g.name) + '</h4><small>' + lei(g.price) + ' · ' + clinici(g.clinics) + '</small></div></div></div>' +
      '<div class="gm-floor"></div></button>';
  }
  function garaj(d) {
    const won = d.goals.filter((g) => g.unlocked).length;
    let h = '<div class="gm-title' + rise() + '"><div><span class="gm-eyebrow">Dacă nu-l poți cumpăra de două ori, nu-l cumpăra</span><h2>Garajul</h2></div><small>' + won + ' / ' + d.goals.length + ' deblocate</small></div>';
    h += '<button type="button" class="gm-card gm-vault is-tap' + rise() + '" data-act="treasury"><span class="gm-eyebrow">Trezoreria jocului</span><b class="' + (d.treasury < 0 ? 'neg' : '') + '">' + num(d.treasury, 'vault', 'lei') + ' lei</b><small>profitul strâns de afacere din ' + esc(fmtDay(d.start)) + ', după impozit</small></button>';
    h += '<div class="gm-show' + rise() + '" data-show>' + d.goals.map(goalStage).join('') + '</div>';
    h += '<div class="gm-arrows' + rise() + '"><button type="button" data-gstep="-1" aria-label="Înapoi">' + ic('up') + '</button><button type="button" data-gstep="1" aria-label="Înainte">' + ic('up') + '</button></div>';
    h += '<div class="gm-dots' + rise() + '">' + d.goals.map((g) => '<i class="' + (g.unlocked ? 'is-won' : '') + '"></i>').join('') + '</div>';
    h += '<section class="gm-card gm-detail' + rise() + '" data-detail></section>';
    return h;
  }
  function goalDetail(g) {
    if (!g) return '';
    const cond = g.conditions.map((c) => '<div class="c"><div class="c-top"><span><i class="ok' + (c.ok ? ' is-on' : '') + '">' + (c.ok ? ic('check') : '') + '</i>' + esc(c.label) + '</span><span class="gm-num">' +
      (c.unit === 'lei' ? short(c.value) + ' / ' + short(c.target) + ' lei' : ro(c.value) + ' / ' + ro(c.target)) + '</span></div>' + bar(c.progress, c.ok ? 'is-green' : '') + '</div>').join('');
    const short_ = g.eta && g.eta.clinicsShort ? ' Și mai trebuie ' + (g.eta.clinicsShort === 1 ? 'o clinică' : clinici(g.eta.clinicsShort)) + ': mai multe clinici, mai mult profit.' : '';
    const eta = g.unlocked
      ? '<div class="gm-eta">' + ic('trophy') + '<div><b>Deblocat</b><small>' + esc(new Date(g.unlockedAt).toLocaleDateString('ro-RO', { day: 'numeric', month: 'long', year: 'numeric' })) + '. Afacerea l-ar plăti de două ori.</small></div></div>'
      : '<div class="gm-eta">' + ic('clock') + '<div><b>' + (g.eta && g.eta.month ? (g.eta.inMonths <= 0 ? 'Luna asta' : esc(cap(g.eta.label))) : 'Încă departe') + '</b><small>' +
        (g.eta && g.eta.month ? 'Ajungi acolo ' + (g.eta.inMonths >= 12 ? 'în cam ' + yearsTxt(g.eta.inMonths) + ', ' : '') + 'în ritmul de acum' + (S.d.growth.known ? ' (' + (S.d.growth.rate >= 0 ? '+' : '') + ro(S.d.growth.rate, 1) + '% pe lună).' : ', cu o creștere prudentă de 3% pe lună.') : 'Cu profitul de acum nu se apropie. Crește profitul lunar.') + short_ + '</small></div></div>';
    return '<div class="gm-card-h"><h3>' + ic(KIND_IC[g.kind] || 'star') + esc(g.name) + '</h3><span class="gm-chip' + (g.unlocked ? ' is-gold' : '') + '">' + lei(g.price) + '</span></div>' +
      '<div class="gm-cond">' + cond + '</div>' + eta +
      '<div class="gm-acts"><button type="button" class="gm-btn ' + (g.unlocked ? 'is-gold' : 'is-lava') + '" data-act="replay" data-id="' + esc(g.id) + '">' + ic(g.unlocked ? 'play' : 'eye') + (g.unlocked ? 'Revezi deblocarea' : 'Cum va arăta deblocarea') + '</button></div>' +
      '<p class="gm-note">Pe telefon glisezi între mașini; pe calculator le schimbi cu săgețile.</p>' + creditOf(g);
  }
  function creditOf(g) {
    const c = S.credits && S.credits[g.img];
    return c ? '<p class="gm-credit">Foto: ' + esc(c.author) + ' · ' + esc(c.license) + ' · decupată și redimensionată · <a href="' + esc(c.source) + '" target="_blank" rel="noopener">Wikimedia Commons</a></p>' : '';
  }
  function wireGarage(el, fresh) {
    const show = el.querySelector('[data-show]');
    if (!show) return;
    const slides = Array.from(show.querySelectorAll('.gm-slide'));
    const dots = Array.from(el.querySelectorAll('.gm-dots i'));
    const detail = el.querySelector('[data-detail]');
    // one WebGL canvas, moved onto the slide in front
    const cv = document.createElement('canvas');
    cv.className = 'gm-3d';
    if (S.car) { S.car.destroy(); S.car = null; }
    if (!calm()) S.car = Car3D.create(cv);
    let cur = -1, raf = 0;
    const pick = () => {
      raf = 0;
      const mid = show.getBoundingClientRect().left + show.clientWidth / 2;
      let bestI = 0, bd = Infinity;
      slides.forEach((s, i) => {
        const r = s.getBoundingClientRect(), c = r.left + r.width / 2, dd = c - mid;
        if (Math.abs(dd) < bd) { bd = Math.abs(dd); bestI = i; }
      });
      if (bestI !== cur) {
        cur = bestI; S.gi = bestI;
        const g = S.d.goals[bestI];
        slides.forEach((s, i) => s.classList.toggle('is-on', i === bestI));
        dots.forEach((x, i) => x.classList.toggle('is-on', i === bestI));
        detail.classList.add('is-swap');
        setTimeout(() => { detail.innerHTML = goalDetail(g); detail.classList.remove('is-swap'); hydrate(detail, true); }, fresh ? 0 : 120);
        if (S.car && !CUT[g.img]) {
          const stage = slides[bestI].querySelector('.gm-stage');
          stage.insertBefore(cv, stage.firstChild.nextSibling);
          slides.forEach((x) => x.classList.remove('is-3d')); // the photo comes back where the canvas left
          S.car.set(g.id, srcOf(g), depthOf(g), g.unlocked).then((ok) => { if (ok && S.gi === bestI) slides[bestI].classList.add('is-3d'); });
        }
        if (!fresh) { Sfx.tap(); buzz(6); }
        fresh = false;
      }
    };
    show.addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(pick); }, { passive: true });
    const start = S.gi >= 0 ? Math.min(S.gi, slides.length - 1) : Math.max(0, S.d.goals.findIndex((g) => g.id === S.d.nextGoal));
    requestAnimationFrame(() => {
      const s = slides[start];
      if (s) show.scrollLeft = s.offsetLeft - (show.clientWidth - s.clientWidth) / 2;
      pick();
    });
  }
  function refreshGarage(el) {
    const d = S.d, fresh = document.createElement('div');
    fresh.innerHTML = garaj(d);
    const swap = (sel) => { const a = el.querySelector(sel), b = fresh.querySelector(sel); if (a && b) a.innerHTML = b.innerHTML; };
    swap('.gm-title'); swap('.gm-vault');
    el.querySelectorAll('.gm-slide').forEach((s, i) => {
      const g = d.goals[i]; if (!g) return;
      s.classList.toggle('is-unlocked', g.unlocked); s.classList.toggle('is-locked', !g.unlocked);
      const tag = s.querySelector('.gm-stage .won, .gm-stage .lock');
      if (tag) tag.outerHTML = g.unlocked ? '<span class="won">DEBLOCAT</span>' : '<span class="lock">' + ic('lock') + Math.round(g.progress * 100) + '%</span>';
    });
    el.querySelectorAll('.gm-dots i').forEach((x, i) => x.classList.toggle('is-won', !!(d.goals[i] && d.goals[i].unlocked)));
    const det = el.querySelector('[data-detail]'); if (det) det.innerHTML = goalDetail(d.goals[S.gi]);
    hydrate(el, false);
    if (S.car && d.goals[S.gi]) S.car.mode(d.goals[S.gi].unlocked);
  }
  function garageStep(dir) {
    const show_ = S.root && S.root.querySelector('[data-show]'); if (!show_) return;
    const slides = show_.querySelectorAll('.gm-slide');
    const to = slides[clamp((S.gi < 0 ? 0 : S.gi) + dir, 0, slides.length - 1)];
    if (to) show_.scrollTo({ left: to.offsetLeft - (show_.clientWidth - to.clientWidth) / 2, behavior: calm() ? 'auto' : 'smooth' });
  }

  // ------------------------------------------------------------------ the team
  const FORM_IC = { up: 'up', down: 'down', flat: '' };
  function card(t, i, big) {
    const face = '<div class="face front"><div class="rt"><b>' + t.rating + '</b><span>' + esc(t.pos) + '</span>' + (FORM_IC[t.form] ? '<i class="' + t.form + '">' + ic(FORM_IC[t.form]) + '</i>' : '') + '</div>' +
      '<div class="lv">NIV ' + t.level + '</div>' +
      '<div class="ph">' + (t.photo ? '<img src="' + esc(t.photo) + '" alt="" loading="lazy">' : esc(String(t.name || '?').charAt(0).toUpperCase())) + '</div>' +
      '<div class="nm">' + esc(String(t.name || '').split(' ')[0]) + '</div>' +
      '<div class="at">' + t.attrs.map((a) => '<span><b>' + a.v + '</b>' + esc(a.k) + '</span>').join('') + '</div></div>';
    const st = t.stats;
    const row = (l, v) => '<div><span>' + l + '</span><b>' + v + '</b></div>';
    const back = '<div class="face back"><div class="bk"><h5>' + esc(String(t.name || '').split(' ')[0]) + '</h5>' +
      (t.role === 'cosmetician' ? row('Încasări', ro(st.rev30)) + row('Upselluri', st.ups) + row('Cliente', st.clients)
        : row('Programări', st.made) + row('Viteză', st.speed == null ? '-' : st.speed + ' min') + row('Upselluri', st.ups)) +
      row('Venite', st.showRate == null ? '-' : st.showRate + '%') + row('Prezență', st.presence == null ? '-' : st.presence + '%') + '<small>30 de zile · ' + esc(t.city || '') + '</small></div></div>';
    return '<button type="button" class="gm-pc t-' + t.tier + (big ? '' : ' gm-rise') + '" style="--i:' + i + '" data-pc aria-label="' + esc(t.name) + ', rating ' + t.rating + '"><div class="in">' + face + back + '</div></button>';
  }
  function echipa(d) {
    if (!d.team.length) return '<div class="gm-title' + rise() + '"><div><span class="gm-eyebrow">Jucătorii</span><h2>Echipa</h2></div></div><section class="gm-card' + rise() + '"><p class="gm-note">Încă nu e nimeni în echipă.</p></section>';
    const mvp = d.team[0];
    let h = '<div class="gm-title' + rise() + '"><div><span class="gm-eyebrow">Ultimele 30 de zile</span><h2>Echipa</h2></div><small>atinge un card</small></div>';
    h += '<section class="gm-card gm-mvp' + rise() + '"><span class="glow"></span>' + card(mvp, 0, true) + '<div><span class="crown">' + ic('crown') + 'MVP</span><h3>' + esc(mvp.name) + '</h3>' +
      '<p>Cel mai bun rating din echipă: <b>' + mvp.rating + '</b>. ' + (mvp.form === 'up' ? 'Formă în creștere în ultima săptămână.' : mvp.form === 'down' ? 'Săptămâna asta a încetinit puțin.' : 'Formă constantă.') + '</p></div></section>';
    h += '<div class="gm-team">' + d.team.slice(1).map((t, i) => card(t, i + 3)).join('') + '</div>';
    h += '<p class="gm-note' + rise() + '">Ratingul vine din date reale: încasări, upselluri, programări, cliente venite, viteza la leaduri și prezență. Aur de la 80, mov de la 88.</p>';
    return h;
  }

  // ------------------------------------------------------------------ missions
  const hms = (ms) => { const s = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return (h >= 24 ? Math.floor(h / 24) + 'z ' + (h % 24) + 'h' : String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(x).padStart(2, '0')); };
  function mission(x) {
    const v = x.unit === 'lei' ? lei(x.value) + ' / ' + lei(x.target) : x.unit === '%' ? x.value + '% / ' + x.target + '%' : ro(x.value) + ' / ' + ro(x.target);
    return '<div class="gm-card gm-m' + (x.claimed ? ' is-claimed' : x.done ? ' is-done' : '') + rise() + '"><div class="ic">' + ic(x.icon) + '</div><div><h4>' + esc(x.title) + '</h4>' +
      '<div class="row">' + bar(x.progress, x.done ? 'is-gold' : '') + '<span class="gm-num">' + v + '</span></div>' +
      '<div class="rw"><span class="xp">+' + x.xp + ' XP</span>' +
      (x.claimed ? '<span class="gm-chip is-good">' + ic('check') + 'Revendicat</span>' : x.done ? '<button type="button" class="gm-btn is-gold is-sm gm-claim" data-act="claim" data-id="' + esc(x.id) + '" data-xp="' + x.xp + '">' + ic('star') + 'Revendică</button>' : (x.hint ? '<span class="hint">' + esc(x.hint) + '</span>' : '')) +
      '</div></div></div>';
  }
  function misiuni(d) {
    const M = d.missions;
    return '<div class="gm-title' + rise() + '"><div><span class="gm-eyebrow">XP din treaba de zi cu zi</span><h2>Misiuni</h2></div>' + (M.claimable ? '<small style="color:#ffd166">' + M.claimable + ' de revendicat</small>' : '') + '</div>' +
      '<div class="gm-cols"><div class="gm-col"><div class="gm-card-h' + rise() + '" style="margin:0 0 .75rem"><h3>' + ic('bolt') + 'Azi</h3><span class="gm-timer" data-timer="d">' + ic('clock') + hms(M.dailyResetIn) + '</span></div>' +
      '<div class="gm-mis">' + M.daily.map(mission).join('') + '</div></div>' +
      '<div class="gm-col"><div class="gm-card-h' + rise() + '" style="margin:0 0 .75rem"><h3>' + ic('calendar') + 'Săptămâna asta</h3><span class="gm-timer" data-timer="w">' + ic('clock') + hms(M.weeklyResetIn) + '</span></div>' +
      '<div class="gm-mis">' + M.weekly.map(mission).join('') + '</div></div></div>';
  }

  // ------------------------------------------------------------------ the badges: hundreds, each on one real number
  const badge = (t, i) => '<button type="button" class="gm-t' + (t.got ? ' is-got' : '') + (t.secret && !t.got ? ' is-secret' : '') + '" data-r="' + t.rank + '" data-badge="' + esc(t.id) + '" style="--i:' + (i || 0) + '">' +
    '<span class="gm-badge"><span class="hx"></span><span class="hx2"></span>' + ic(t.secret && !t.got ? 'sparkles' : t.icon) + (t.isNew ? '<span class="new">NOU</span>' : '') + '</span>' +
    '<span class="nm">' + (t.secret && !t.got ? '???' : esc(t.name)) + '</span>' + (t.got || t.secret ? '' : '<span class="mini" style="--p:' + t.progress + '"><i></i></span>') + '</button>';
  function insigne(d) {
    const all = d.badges, got = all.filter((t) => t.got).length;
    const cats = [['all', 'Toate'], ['got', 'Câștigate'], ['near', 'Aproape']].concat([...new Map(all.map((t) => [t.cat, t.catLabel]))]);
    let list = all;
    if (S.filter === 'got') list = all.filter((t) => t.got);
    else if (S.filter === 'near') list = all.filter((t) => !t.got && !t.secret && t.progress >= 0.5).sort((a, b) => b.progress - a.progress);
    else if (S.filter !== 'all') list = all.filter((t) => t.cat === S.filter);
    if (S.filter !== 'near') list = list.slice().sort((a, b) => (b.got - a.got) || (a.rank - b.rank) || (b.progress - a.progress));
    const byR = [0, 1, 2, 3, 4].map((r) => [all.filter((t) => t.rank === r && t.got).length, all.filter((t) => t.rank === r).length]);
    return '<div class="gm-title' + rise() + '"><div><span class="gm-eyebrow">Colecția ta</span><h2>Insigne</h2></div><small>' + got + ' / ' + all.length + '</small></div>' +
      '<div class="gm-count' + rise() + '">' + bar(got / Math.max(1, all.length), 'is-gold') + '<span class="gm-num">' + Math.round(got / Math.max(1, all.length) * 100) + '%</span></div>' +
      '<div class="gm-rar' + rise() + '">' + byR.map(([g, n], r) => '<span data-r="' + r + '"><i></i>' + RAR[r] + ' <b>' + g + '/' + n + '</b></span>').join('') + '</div>' +
      '<div class="gm-filters' + rise() + '">' + cats.map(([k, l]) => '<button type="button" data-filter="' + k + '" class="' + (S.filter === k ? 'is-on' : '') + '">' + esc(l) + '</button>').join('') + '</div>' +
      '<div class="gm-tro' + rise() + '">' + (list.length ? list.map((t, i) => badge(t, Math.min(i, 24))).join('') : '<p class="gm-note">Nimic aici încă.</p>') + '</div>';
  }
  const SCREENS = { imperiu, garaj, echipa, misiuni, insigne };

  // ------------------------------------------------------------------ sheets
  function sheet(html, onMount, onClose, cls) {
    closeSheet(true);
    const root = document.createElement('div');
    root.className = 'gm-sheet-root' + (cls ? ' ' + cls : '');
    root.innerHTML = '<div class="gm-sheet-bg"></div><div class="gm-sheet" role="dialog" aria-modal="true"><div class="grab"></div><button type="button" class="x" data-x aria-label="Închide">' + ic('x') + '</button>' + html + '</div>';
    document.body.appendChild(root);
    S.sheet = root; root._onClose = onClose;
    root.querySelector('.gm-sheet-bg').addEventListener('click', () => closeSheet());
    root.querySelector('[data-x]').addEventListener('click', () => closeSheet());
    const push = () => { if (S.sheet !== root) return; try { history.pushState({ gms: 1 }, '', location.href); root._pushed = true; } catch (e) { /* no history */ } };
    if (S.popPending) setTimeout(push, 120); else push();
    hydrate(root, true);
    if (onMount) onMount(root.querySelector('.gm-sheet'), root);
    Sfx.tap();
    return root;
  }
  function closeSheet(silent, fromPop) {
    const r = S.sheet; if (!r) return;
    S.sheet = null;
    if (r._onClose) r._onClose();
    if (r._pushed && !fromPop) { S.popPending = true; setTimeout(() => { S.popPending = false; }, 400); try { history.back(); } catch (e) { S.popPending = false; } }
    if (silent) { r.remove(); return; }
    r.classList.add('is-out');
    setTimeout(() => r.remove(), 260);
  }
  window.addEventListener('popstate', () => {
    if (S.popPending) { S.popPending = false; return; }
    if (S.sheet) closeSheet(false, true);
  });
  document.addEventListener('keydown', (e) => {
    if (!S.open || (e.target.closest && e.target.closest('input, select, textarea'))) return;
    if (e.key === 'Escape') { if (S.sheet) closeSheet(); else { const m = document.querySelector('.gm-menu'); if (m) m.remove(); } return; }
    if (S.sheet || S.cer) return;
    const n = Number(e.key);
    if (n >= 1 && n <= 5) { show(TABS[n - 1][0]); return; }
    if (S.tab === 'garaj' && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) { e.preventDefault(); garageStep(e.key === 'ArrowRight' ? 1 : -1); }
  });

  // a clinic: its stars, its numbers, its people; the next city: the declared checklist
  function spark(list) {
    const w = 300, h = 70, max = Math.max(1, ...list);
    const pts = list.map((v, i) => [i * (w / Math.max(1, list.length - 1)), h - 6 - (v / max) * (h - 14)]);
    const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
    return '<svg class="gm-spark" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none"><defs><linearGradient id="gmSparkFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="rgba(255,77,157,.45)"/><stop offset="1" stop-color="rgba(255,77,157,0)"/></linearGradient></defs>' +
      '<path d="' + line + ' L' + w + ' ' + h + ' L0 ' + h + 'Z" fill="url(#gmSparkFill)"/><path class="ln" d="' + line + '" fill="none" stroke="url(#gmLavaStroke)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" pathLength="1"/></svg>';
  }
  // the map flies to the city first, then its sheet rises (low, so the zoomed map stays in sight)
  function citySheet(name) {
    if (S.citing) return;
    S.citing = true;
    zoomCity(name);
    setTimeout(() => { S.citing = false; if (S.open && !S.cer) citySheetNow(name); }, calm() ? 0 : 750);
  }
  function citySheetNow(name) {
    const d = S.d, a = d.map.active.find((x) => x.name === name);
    const onClose = () => zoomOut();
    if (a) {
      const nextStar = a.nextStar ? '<div class="gm-starnext"><span>Următoarea stea la <b>' + lei(a.nextStar) + '</b> pe lună</span><span class="gm-num">' + Math.round(clamp(a.projected / a.nextStar, 0, 1) * 100) + '%</span></div>' + bar(clamp(a.projected / a.nextStar, 0, 1)) : '<p class="gm-note"><b>Cinci stele.</b> Clinică de top.</p>';
      sheet('<span class="gm-eyebrow">Clinica</span><h3>' + esc(a.name) + '</h3>' + stars(a.stars) + nextStar +
        '<div class="gm-kv">' +
        '<div><small>Luna asta</small><b>' + lei(a.revenue) + '</b></div><div><small>Azi</small><b>' + lei(a.today) + '</b></div>' +
        '<div><small>Pe lună, în ritmul de acum</small><b>' + lei(a.projected) + '</b></div><div><small>Profit estimat</small><b class="' + (a.profit < 0 ? 'neg' : 'pos') + '">' + lei(a.profit) + (a.margin != null ? ' · ' + pct(a.margin) : '') + '</b></div>' +
        '</div>' +
        '<div class="gm-rings">' +
          '<div>' + ring(clamp(a.occupancy, 0, 1), 78, 7, '<span class="gm-num">' + pct(a.occupancy) + '</span>') + '<small>Calendar ocupat</small></div>' +
          '<div>' + ring(a.showRate == null ? 0 : a.showRate / 100, 78, 7, '<span class="gm-num">' + (a.showRate == null ? '-' : a.showRate + '%') + '</span>') + '<small>Cliente venite</small></div>' +
          '<div>' + ring(clamp(a.share, 0, 1), 78, 7, '<span class="gm-num">' + pct(a.share) + '</span>') + '<small>Din încasări</small></div>' +
        '</div>' +
        '<div class="gm-sec"><h4>Ultimele 30 de zile</h4>' + spark(a.spark) + '<div class="gm-spark-k"><span>' + (a.leads30 === 1 ? '1 lead' : a.leads30 + de(a.leads30) + 'leaduri') + '</span><span>' + (a.visits30 === 1 ? '1 vizită' : a.visits30 + de(a.visits30) + 'vizite') + '</span></div></div>' +
        (a.top.length ? '<div class="gm-sec"><h4>Ce se vinde</h4>' + a.top.map((t, i) => '<div class="gm-topt"><span>' + (i + 1) + '. ' + esc(t.name) + '</span><b>' + lei(t.lei) + '</b>' + bar(t.lei / a.top[0].lei) + '</div>').join('') + '</div>' : '') +
        '<div class="gm-sec"><h4>Echipa clinicii</h4><div class="gm-people">' + (a.people.length ? a.people.map((p) => '<span class="t-' + p.tier + '"><i>' + (p.photo ? '<img src="' + esc(p.photo) + '" alt="">' : esc(p.name.charAt(0))) + '</i><b>' + p.rating + '</b><small>' + esc(p.name.split(' ')[0]) + '</small></span>').join('') : '<p class="gm-note">Nimeni încă.</p>') + '</div></div>',
      (el) => { const ln = el.querySelector('.gm-spark .ln'); if (ln) requestAnimationFrame(() => ln.classList.add('is-on')); }, onClose, 'is-city');
      return;
    }
    const m = d.map, next = name === m.next;
    const fmtC = (v, unit) => (v == null ? 'încă nu' : unit === '%' ? pct(v) : unit === 'lei' ? short(v) + ' lei' : unit === 'x' ? ro(v, 1) + 'x' : ro(v));
    const list = m.checklist.map((x) => {
      const v = fmtC(x.value, x.unit), t = fmtC(x.target, x.unit);
      return '<div class="gm-check' + (x.ok ? ' is-ok' : '') + '"><div class="c-top"><span><i class="ok' + (x.ok ? ' is-on' : '') + '">' + (x.ok ? ic('check') : '') + '</i>' + esc(x.label) + '</span><span class="gm-num">' + v + ' / ' + t + '</span></div>' + bar(x.progress, x.ok ? 'is-green' : '') + '<small>' + esc(x.why) + '</small></div>';
    }).join('');
    const ready = next && m.ready;
    sheet('<span class="gm-eyebrow">' + (ready ? 'Următorul oraș · gata de deschis' : next ? 'Următorul oraș · blocat' : 'Oraș blocat') + '</span><h3>' + esc(name) + '</h3>' +
      '<div class="gm-lockbig' + (ready ? ' is-open' : '') + '">' + ic(ready ? 'flag' : 'lock') + '</div>' +
      (next ? '<div class="gm-need"><small>Ca să aibă sens a ' + (d.locations + 1) + '-a clinică, fiecare clinică de acum încasează cel puțin</small><b>' + (m.revPerClinicNeed ? lei(m.revPerClinicNeed) + ' pe lună' : 'încă nu se poate calcula') + '</b><small>' + esc(d.rules.expand_short) + '</small></div>' +
        '<div class="gm-rings one">' + ring(m.readiness, 96, 8, '<span class="gm-num">' + Math.round(m.readiness * 100) + '%</span>') + '<div><b>Pregătire</b><small>' + (m.eta ? 'În ritmul de acum: <b>' + esc(cap(m.eta.label)) + '</b>' : 'În ritmul de acum nu se apropie.') + '</small><small>Investiția: ' + lei(m.investment) + '</small></div></div>' +
        '<div class="gm-sec"><h4>Regulile (aceleași pentru toți)</h4>' + list + '</div>'
        : '<p class="gm-note">Vine după ' + esc(m.next || 'orașul următor') + ', în ordinea: ' + esc(m.locked.slice(0, m.locked.indexOf(name) + 1).join(', ')) + '. Se deblochează cu aceleași reguli: calendare pline, marjă, profit sănătos în fiecare clinică, clienta nouă care își plătește reclama, bani de deschidere fără datorii și echipă completă.</p>'), null, onClose, 'is-city');
  }
  function badgeSheet(id) {
    const t = S.d.badges.find((x) => x.id === id); if (!t) return;
    const hidden = t.secret && !t.got;
    sheet('<div class="gm-bsheet">' + badge(Object.assign({}, t, { isNew: false })) +
      '<span class="gm-chip ' + (t.rank >= 3 ? 'is-gold' : '') + '">' + RAR[t.rank] + ' · +' + t.xp + ' XP · ' + esc(t.catLabel) + '</span><h3>' + (hidden ? 'Insignă secretă' : esc(t.name)) + '</h3><p class="gm-note" style="margin:0">' + (hidden ? 'Se dezvăluie când o câștigi.' : esc(t.desc)) + '</p>' +
      (t.got ? '<p class="gm-note">Câștigată pe <b>' + esc(new Date(t.at).toLocaleDateString('ro-RO', { day: 'numeric', month: 'long', year: 'numeric' })) + '</b>.</p>'
        : hidden ? '' : '<div style="width:100%;margin-top:.6rem">' + bar(t.progress) + '</div><p class="gm-note">' + (t.value == null ? 'Încă nu se poate măsura.' : (t.op === 'lte' ? 'acum ' + ro(t.value, 1) + ', ținta ' + ro(t.target, 1) : (Number.isInteger(t.target) && t.target >= 100 ? ro(Math.floor(t.value)) : ro(Math.floor(t.value * 10) / 10, 1)) + ' din ' + ro(t.target))) + '</p>') + '</div>', (el) => {
      const b = el.querySelector('.gm-badge'); if (b) b.classList.add('is-big');
    });
  }
  function rulesSheet() {
    const d = S.d, R = d.rules;
    sheet('<span class="gm-eyebrow">Game Mode</span><h3>Cum se joacă</h3>' +
      '<p class="gm-note">Jocul citește doar portalul. Nimic nu se setează: regulile sunt aceleași pentru toți și nu se schimbă din mers.</p>' +
      '<div class="gm-sec"><h4>Etapele (Scaling Roadmap, Alex Hormozi)</h4><div class="gm-stages">' + d.stage.all.map((s) => '<div class="' + (s.i === d.stage.i ? 'is-now' : s.i < d.stage.i ? 'is-done' : '') + '"><b>' + s.i + '</b><span>' + esc(s.name) + '</span><small>' + (s.min > 1 ? 'de la ' + short(s.min) + ' lei/an' : s.i ? 'primele încasări' : 'început') + '</small></div>').join('') + '</div><p class="gm-note">' + esc(R.stage) + '</p></div>' +
      '<div class="gm-sec"><h4>Trezoreria</h4><p class="gm-note">' + esc(R.treasury) + '</p></div>' +
      '<div class="gm-sec"><h4>Garajul</h4><p class="gm-note">' + esc(R.garage) + '</p></div>' +
      '<div class="gm-sec"><h4>Orașul următor</h4><p class="gm-note">' + esc(R.expand) + '</p></div>' +
      '<div class="gm-sec"><h4>Stelele clinicilor</h4><p class="gm-note">După încasările pe lună ale fiecărei clinici: ' + R.stars.map((s, i) => (i + 1) + ' stea' + (i ? 'le' : '') + ' de la ' + short(s) + ' lei').join(', ') + '.</p></div>' +
      '<div class="gm-sec"><h4>Bossul sezonului</h4><p class="gm-note">' + esc(R.boss) + '</p></div>' +
      '<div class="gm-sec"><h4>XP și niveluri</h4><p class="gm-note">10 lei încasați = 1 XP. Plus misiunile revendicate și insignele: comun 50, rar 150, epic 400, legendar 1.000, mitic 2.500 XP.</p></div>');
  }
  function treasurySheet() {
    const d = S.d, e = d.engine;
    sheet('<span class="gm-eyebrow">Trezoreria jocului</span><h3 class="' + (d.treasury < 0 ? 'neg' : '') + '">' + lei(d.treasury) + '</h3>' +
      '<p class="gm-note">' + esc(d.rules.treasury) + '</p>' +
      (() => {
        const gross = d.months.reduce((n, m) => n + m.realProfit, 0), tax = gross > 0 ? gross * d.rules.tax : 0;
        return '<div class="gm-sec"><h4>Lună de lună</h4>' + d.months.map((m) => '<div class="gm-topt"><span>' + esc(cap(m.label)) + (m.current ? ' (până azi)' : '') + (m.opened ? ' · o clinică nouă' : '') + '</span><b class="' + (m.realProfit < 0 ? 'neg' : 'pos') + '">' + lei(m.realProfit) + '</b></div>').join('') +
          '<div class="gm-topt"><span>Impozit ' + Math.round(d.rules.tax * 100) + '% pe profit</span><b class="neg">' + lei(-tax) + '</b></div>' +
          (d.debt ? '<div class="gm-topt"><span>Datorii la stat</span><b class="neg">' + lei(-d.debt) + '</b></div>' : '') +
          '<div class="gm-topt"><span><b>Trezoreria</b></span><b class="' + (d.treasury < 0 ? 'neg' : 'pos') + '">' + lei(d.treasury) + '</b></div></div>';
      })() +
      '<div class="gm-kv"><div><small>Profit pe lună, după impozit, în ritmul de acum</small><b>' + lei(e.fullMonthNet) + '</b></div><div><small>Regula garajului</small><b>de 2 ori prețul, din profitul a ' + (d.rules.garageMonths || 3) + ' luni</b></div></div>');
  }
  function stageSheet() {
    const d = S.d, st = d.stage, L = d.level;
    sheet('<span class="gm-eyebrow">Etapa ' + st.i + ' · nivel ' + L.level + '</span><h3>' + esc(st.name) + '</h3>' +
      '<p class="gm-note">' + esc(st.focus) + '</p>' +
      '<div class="gm-kv"><div><small>Ritmul anual</small><b>' + lei(st.yearPace) + '</b></div><div><small>Următoarea etapă</small><b>' + (st.next ? esc(st.next.name) : '-') + '</b></div>' +
      (st.next ? '<div><small>Pragul ei</small><b>' + short(st.next.min) + ' lei/an</b></div><div><small>În ritmul de acum</small><b>' + (st.next.eta ? esc(cap(st.next.eta.label)) : 'departe') + '</b></div>' : '') + '</div>' +
      '<div class="gm-sec"><h4>Nivelul ' + L.level + '</h4>' + bar(L.progress) + '<p class="gm-note">' + ro(L.xp - L.from) + ' din ' + ro(L.to - L.from) + ' XP până la nivelul ' + (L.level + 1) + '. Din încasări: ' + ro(L.sources.revenue) + ' XP, misiuni: ' + ro(L.sources.missions) + ', insigne: ' + ro(L.sources.badges) + '.</p></div>' +
      '<div class="gm-acts"><button type="button" class="gm-btn is-sm" data-sheet-rules>' + ic('book') + 'Cum se joacă</button></div>', (el) => { el.querySelector('[data-sheet-rules]').addEventListener('click', () => rulesSheet()); });
  }
  function bossSheet() {
    const s = S.d.season;
    sheet('<span class="gm-eyebrow">' + esc(s.label) + '</span><h3>' + esc(s.boss) + '</h3><div class="gm-kv">' +
      '<div><small>Viața bossului</small><b>' + lei(s.target) + '</b></div><div><small>Lovituri până acum</small><b>' + lei(s.done) + '</b></div>' +
      '<div><small>Rămas</small><b>' + lei(Math.max(0, s.target - s.done)) + '</b></div><div><small>Zile rămase</small><b>' + s.daysLeft + '</b></div>' +
      '<div><small>Ritm necesar</small><b>' + lei(s.needPerDay) + '/zi</b></div><div><small>În ritmul de acum</small><b>' + lei(s.pace) + '</b></div></div>' +
      '<p class="gm-note">' + (s.defeated ? '<b>Învins</b> pe ' + esc(new Date(s.defeatedAt).toLocaleDateString('ro-RO', { day: 'numeric', month: 'long' })) + '. Tot ce intră acum e bonus de sezon.' : s.pace >= s.target ? 'În ritmul ăsta <b>îl dobori</b> înainte de final.' : 'În ritmul ăsta mai lipsesc <b>' + lei(s.target - s.pace) + '</b> la final de sezon.') + ' ' + esc(S.d.rules.boss) + '</p>');
  }

  // ------------------------------------------------------------------ the in-game menu (the switch back, sound, music, rules)
  function menu() {
    const old = document.querySelector('.gm-menu');
    if (old) { old.remove(); return; }
    const me = (K.data && K.data.me) || {};
    const m = document.createElement('div');
    m.className = 'gm-menu';
    m.innerHTML = '<div class="head"><span class="gm-hud-btn is-av">' + avatarHtml() + '</span><div><b>' + esc(me.name || '') + '</b><small>' + (S.d ? 'Nivel ' + S.d.level.level + ' · ' + esc(S.d.stage.name) : 'Game Mode') + '</small></div></div>' +
      '<button type="button" class="it" data-m="off">' + ic('bolt') + 'Game Mode<span class="gm-sw is-on"><i></i></span></button>' +
      '<button type="button" class="it" data-m="sound">' + ic(Sfx.on ? 'sound' : 'mute') + 'Sunete<span class="gm-sw' + (Sfx.on ? ' is-on' : '') + '"><i></i></span></button>' +
      '<button type="button" class="it" data-m="music">' + ic('music') + 'Muzică<span class="gm-sw' + (Sfx.musicOn ? ' is-on' : '') + '"><i></i></span></button>' +
      '<button type="button" class="it" data-m="rules">' + ic('book') + 'Cum se joacă</button>' +
      '<button type="button" class="it" data-m="intro">' + ic('play') + 'Revezi introducerea</button>';
    document.body.appendChild(m);
    m.addEventListener('click', (e) => {
      const b = e.target.closest('[data-m]'); if (!b) return;
      const what = b.dataset.m;
      if (what === 'off') { b.querySelector('.gm-sw').classList.remove('is-on'); setTimeout(() => { m.remove(); exit(); }, 220); return; }
      if (what === 'sound') { Sfx.set(!Sfx.on); b.querySelector('.gm-sw').classList.toggle('is-on', Sfx.on); return; }
      if (what === 'music') { Sfx.setMusic(!Sfx.musicOn); b.querySelector('.gm-sw').classList.toggle('is-on', Sfx.musicOn); Sfx.tap(); return; }
      m.remove();
      if (!S.d) return;
      if (what === 'rules') rulesSheet();
      if (what === 'intro') intro(true);
    });
    setTimeout(() => document.addEventListener('click', function off(e) { if (!e.target.closest('.gm-menu') && !e.target.closest('[data-act="menu"]')) { m.remove(); document.removeEventListener('click', off); } }), 0);
  }

  // ------------------------------------------------------------------ clicks
  function onClick(e) {
    const tab = e.target.closest('.gm-nav [data-tab]');
    if (tab) { buzz(8); if (tab.dataset.tab !== S.tab) show(tab.dataset.tab); else { const sc = S.root.querySelector('.gm-screen:not(.is-out)'); if (sc) sc.scrollTo({ top: 0, behavior: 'smooth' }); } return; }
    const pc = e.target.closest('[data-pc]');
    if (pc) { pc.classList.toggle('is-flip'); Sfx.tap(); buzz(6); return; }
    const city = e.target.closest('[data-city]');
    if (city) { citySheet(city.dataset.city); return; }
    const bd = e.target.closest('[data-badge]');
    if (bd && !bd.closest('.gm-cer')) { badgeSheet(bd.dataset.badge); return; }
    const fl = e.target.closest('[data-filter]');
    if (fl) { S.filter = fl.dataset.filter; show('insigne', { static: true, silent: true }); Sfx.tap(); return; }
    const gs = e.target.closest('[data-gstep]');
    if (gs) { garageStep(Number(gs.dataset.gstep)); return; }
    const slide = e.target.closest('.gm-slide[data-id]');
    if (slide && !slide.classList.contains('is-on')) { const sh = slide.parentElement; sh.scrollTo({ left: slide.offsetLeft - (sh.clientWidth - slide.clientWidth) / 2, behavior: 'smooth' }); return; }
    const a = e.target.closest('[data-act]');
    if (!a) return;
    const act = a.dataset.act;
    if (act === 'menu') { menu(); return; }
    if (!S.d) return;
    if (act === 'level' || act === 'stage') { stageSheet(); return; }
    if (act === 'treasury') { treasurySheet(); return; }
    if (act === 'boss') { bossSheet(); return; }
    if (act === 'map-out') { zoomOut(); return; }
    if (act === 'goal') { S.gi = S.d.goals.findIndex((g) => g.id === a.dataset.id); show('garaj'); return; }
    if (act === 'replay') { const g = S.d.goals.find((x) => x.id === a.dataset.id); if (g) unlockCer(g, true); return; }
    if (act === 'claim') { claim(a); return; }
  }

  // ------------------------------------------------------------------ claiming a mission: coins fly into the XP bar
  async function claim(btn) {
    if (btn.classList.contains('is-busy')) return;
    btn.classList.add('is-busy');
    try {
      const r = await api({ action: 'claim', id: btn.dataset.id });
      btn.disabled = true; // done: the list redraws after the coins
      Sfx.claim();
      const from = btn.getBoundingClientRect(), to = S.root.querySelector('.gm-xpbar').getBoundingClientRect();
      const fx = from.left + from.width / 2, fy = from.top + from.height / 2, tx = to.left + to.width * 0.6, ty = to.top + to.height / 2;
      const fl = document.createElement('div'); fl.className = 'gm-floatxp'; fl.textContent = '+' + r.xp + ' XP'; fl.style.left = fx + 'px'; fl.style.top = (fy - 20) + 'px';
      document.body.appendChild(fl); setTimeout(() => fl.remove(), 1500);
      buzz([12, 30, 12]);
      const n = calm() ? 0 : 9;
      for (let i = 0; i < n; i++) {
        const c = document.createElement('div'); c.className = 'gm-coin'; c.textContent = 'XP';
        document.body.appendChild(c);
        const mx = (fx + tx) / 2 + (Math.random() - 0.5) * 160, my = Math.min(fy, ty) - 80 - Math.random() * 120;
        const anim = c.animate([
          { transform: 'translate(' + fx + 'px,' + fy + 'px) scale(.4)', opacity: 0 },
          { transform: 'translate(' + (fx + (Math.random() - 0.5) * 60) + 'px,' + (fy - 30) + 'px) scale(1.1)', opacity: 1, offset: 0.15 },
          { transform: 'translate(' + mx + 'px,' + my + 'px) scale(1)', opacity: 1, offset: 0.55 },
          { transform: 'translate(' + tx + 'px,' + ty + 'px) scale(.5)', opacity: 0.2 },
        ], { duration: 900 + i * 60, delay: i * 55, easing: 'cubic-bezier(.5,0,.2,1)', fill: 'forwards' });
        anim.onfinish = () => { c.remove(); Sfx.coin(); const xb = S.root && S.root.querySelector('.gm-xpbar'); if (xb) { xb.classList.remove('is-bump'); void xb.offsetWidth; xb.classList.add('is-bump'); } };
      }
      await sleep(n ? 1300 : 200);
      await refresh();
    } catch (e) {
      btn.classList.remove('is-busy');
      Sfx.error();
      toast(e.code === 'already_claimed' ? 'Misiunea e deja revendicată.' : e.code === 'not_done' ? 'Misiunea nu e gata încă.' : e.code === 'mission_gone' ? (String(btn.dataset.id).startsWith('w:') ? 'Misiunea a expirat: a început o săptămână nouă.' : 'Misiunea a expirat: a început o zi nouă.') : 'Nu am putut revendica. Încearcă din nou.', 'error');
      refresh();
    }
  }

  // ------------------------------------------------------------------ ceremonies
  function letters(text) { return String(text).split('').map((ch, i) => ch === ' ' ? ' ' : '<span style="--i:' + i + '">' + esc(ch) + '</span>').join(''); }
  function cer(html, opts) {
    return new Promise((done) => {
      const el = document.createElement('div');
      el.className = 'gm-cer';
      el.innerHTML = '<div class="rays"></div><div class="shock"></div><div class="flash"></div><div class="box">' + html + '</div>';
      document.body.appendChild(el);
      S.cer = true;
      Sfx.duck((opts.delay || 600) + 3000);
      if (opts.onMount) opts.onMount(el);
      let closed = false;
      const close = () => { if (closed) return; closed = true; el.classList.add('is-out'); if (opts.onClose) opts.onClose(); setTimeout(() => { el.remove(); S.cer = false; done(); }, 340); };
      const boom = () => {
        el.classList.add('is-boom');
        const box = el.querySelector('.card, .bighex, .trow, .gm-boss-em') || el;
        const r = box.getBoundingClientRect();
        confetti(r.left + r.width / 2, r.top + r.height / 2, 190, opts.gold !== false);
        setTimeout(() => confetti(window.innerWidth * 0.2, window.innerHeight * 0.3, 70, opts.gold !== false), 260);
        setTimeout(() => confetti(window.innerWidth * 0.8, window.innerHeight * 0.3, 70, opts.gold !== false), 420);
        (opts.sound || Sfx.fanfare)();
        if (opts.onBoom) opts.onBoom(el);
        buzz([40, 60, 40, 60, 120]);
      };
      setTimeout(boom, calm() ? 50 : opts.delay || 600);
      el.addEventListener('click', (e) => { if (e.target.closest('[data-close]') || el.classList.contains('is-boom')) close(); });
    });
  }
  function unlockCer(g, preview) {
    Sfx.tension();
    let car = null, boomed = false;
    const pre = preview && !g.unlocked;
    return cer('<div class="kicker">' + (pre ? 'AȘA VA ARĂTA' : 'OBIECTIV DEBLOCAT') + '</div>' +
      '<div class="card">' + (CUT[g.img] ? showroom(g, 0) : '<img src="' + esc(srcOf(g)) + '" alt="" onerror="this.remove()"><canvas class="gm-3d"></canvas>') + '<div class="chain"><div class="padlock"><div class="shk"></div><div class="bd"></div></div></div></div>' +
      '<h2 class="gold">' + letters('DEBLOCAT') + '</h2><div class="sub">' + esc(g.name) + (pre ? '<br><small style="color:#a29fc4">' + esc(etaShort(g)) + '</small>' : '') + '</div>' +
      '<button type="button" class="gm-btn is-gold cta" data-close>' + (pre ? ic('car') + 'Înapoi în garaj' : ic('trophy') + 'Spectaculos') + '</button>', {
      delay: 2400,
      onMount(el) {
        const cv = el.querySelector('.gm-3d');
        if (!calm() && !CUT[g.img]) { car = Car3D.create(cv); if (car) car.set(g.id, srcOf(g), depthOf(g), false).then((ok) => { if (ok) { el.querySelector('.card').classList.add('is-3d'); if (boomed) car.reveal(); else car.dolly(1.3); } }); }
      },
      onBoom() { boomed = true; if (car) car.reveal(); },
      onClose() { if (car) setTimeout(() => car.destroy(), 400); },
    });
  }
  function levelCer(from, to) {
    return cer('<div class="kicker">NIVEL NOU</div><div class="bighex">' + to + '</div><h2 class="gold">' + letters('NIVELUL ' + to) + '</h2>' +
      '<div class="sub">De la nivelul ' + from + ' la ' + to + '.</div><button type="button" class="gm-btn is-lava cta" data-close>' + ic('bolt') + 'Continuă</button>', { delay: 650, sound: Sfx.level });
  }
  function stageCer(ev) {
    return cer('<div class="kicker">ETAPĂ NOUĂ · SCALING ROADMAP</div><div class="bighex gold">' + ev.to + '</div><h2 class="gold">' + letters(String(ev.name).toUpperCase()) + '</h2>' +
      '<div class="sub">' + esc(S.d.stage.focus) + '</div><button type="button" class="gm-btn is-gold cta" data-close>' + ic('mountain') + 'Mai departe</button>', { delay: 900, sound: Sfx.level });
  }
  function badgesCer(list) {
    const xp = list.reduce((n, t) => n + t.xp, 0);
    const top = list.slice().sort((a, b) => b.rank - a.rank).slice(0, 8);
    return cer('<div class="kicker">' + (list.length === 1 ? 'INSIGNĂ NOUĂ' : list.length + de(list.length).toUpperCase() + 'INSIGNE NOI') + '</div><div class="trow">' + top.map((t, i) => badge(Object.assign({}, t, { isNew: false, secret: false }), i)).join('') + '</div>' +
      '<h2 class="gold">' + letters('+' + ro(xp) + ' XP') + '</h2><div class="sub">' + esc(top.map((t) => t.name).slice(0, 3).join(', ')) + (list.length > 3 ? ' și încă ' + (list.length - 3) : '') + '</div>' +
      '<button type="button" class="gm-btn is-gold cta" data-close>' + ic('medal') + 'Le iau</button>', { delay: 700, sound: Sfx.trophy });
  }
  function bossCer(b) {
    return cer('<div class="kicker">' + esc(String(b.label || 'SEZON').toUpperCase()) + ' · CÂȘTIGAT</div><div class="gm-boss-em" style="width:140px;height:140px;filter:grayscale(.6)">' + BOSS_SVG + '</div><h2 class="gold">' + letters('BOSS ÎNVINS') + '</h2>' +
      '<div class="sub">' + esc(b.boss) + ' a căzut: ținta de ' + lei(b.target) + ' e atinsă.</div><button type="button" class="gm-btn is-gold cta" data-close>' + ic('sword') + 'Următorul sezon</button>', { delay: 900, sound: Sfx.bossDown });
  }

  // the first time: what the game is, in five steps
  function intro(again) {
    return new Promise((done) => {
      const d = S.d;
      const steps = [
        ['bolt', 'Afacerea ta e jocul', 'Fiecare 10 lei încasați fac 1 XP. Nimic nu se setează: jocul citește doar portalul, cu reguli fixe, aceleași pentru toți.'],
        ['mountain', 'Etapa ' + d.stage.i + ': ' + d.stage.name, 'Etapele vin din Scaling Roadmap-ul lui Alex Hormozi, după ritmul anual al încasărilor. Acum: ' + short(d.stage.yearPace) + ' lei pe an.'],
        ['car', 'Garajul', 'Dacă nu-l poți cumpăra de două ori, nu-l cumpăra. Cele trei mașini se deblochează din profitul real și cu mai multe clinici: cu cât ai mai multe, cu atât faci mai mulți bani.'],
        ['map', 'Imperiul', 'Orașul următor se aprinde când cifrele spun că are sens: calendare pline, profit sănătos în fiecare clinică, bani de deschidere și fără datorii.'],
        ['medal', d.badges.length + ' de insigne', 'Misiuni zilnice, un boss în fiecare sezon, insigne pentru tot ce construiești. Hai să începem.'],
      ];
      let i = 0;
      const el = document.createElement('div');
      el.className = 'gm-intro';
      const paint = () => {
        const [icn, t, p] = steps[i];
        el.innerHTML = '<div class="gm-intro-in" style="--i:' + i + '"><div class="orb">' + ic(icn) + '</div><span class="gm-eyebrow">' + (i + 1) + ' / ' + steps.length + '</span><h2>' + esc(t) + '</h2><p>' + esc(p) + '</p>' +
          '<div class="dots">' + steps.map((_, k) => '<i class="' + (k === i ? 'on' : '') + '"></i>').join('') + '</div>' +
          '<button type="button" class="gm-btn is-lava" data-next>' + (i < steps.length - 1 ? 'Mai departe' : 'Începe jocul') + ic('up', 'r90') + '</button>' +
          (i < steps.length - 1 ? '<button type="button" class="gm-intro-skip" data-skip>Sari peste</button>' : '') + '</div>';
      };
      const end = () => { el.classList.add('is-out'); setTimeout(() => el.remove(), 400); if (!again) api({ action: 'seen', intro: true }).catch(() => {}); Sfx.claim(); done(); };
      paint();
      document.body.appendChild(el);
      el.addEventListener('click', (e) => {
        if (e.target.closest('[data-skip]')) { end(); return; }
        if (e.target.closest('[data-next]')) { Sfx.tab(); buzz(8); if (++i >= steps.length) end(); else paint(); }
      });
    });
  }
  async function ceremonies() {
    if (S.cerRun || S.cer || !S.d || !S.open) return;
    S.cerRun = true;
    try { await ceremoniesNow(); } finally { S.cerRun = false; }
  }
  async function ceremoniesNow() {
    const ev = S.d.events || {};
    const seen = {};
    const on = () => S.open;
    if (ev.intro && on()) { await intro(false); }
    if (ev.stageUp && on()) { await stageCer(ev.stageUp); seen.stage = ev.stageUp.to; }
    if (ev.levelUp && on()) { await levelCer(ev.levelUp.from, ev.levelUp.to); seen.level = ev.levelUp.to; }
    for (const id of ev.goals || []) { const g = S.d.goals.find((x) => x.id === id); if (g && on()) await unlockCer(g, false); }
    if (ev.goals && ev.goals.length && on()) seen.goals = ev.goals;
    if (ev.boss && on()) { await bossCer(ev.boss); seen.season = ev.boss.id; }
    const tr = (ev.badges || []).map((id) => S.d.badges.find((t) => t.id === id)).filter(Boolean);
    if (tr.length && on()) { await badgesCer(tr); seen.badges = ev.badges; }
    if (!on()) return;
    if (Object.keys(seen).length) {
      try { await api(Object.assign({ action: 'seen' }, seen)); } catch (e) { /* next time */ }
      S.d.events = {};
      (seen.badges || []).forEach((id) => { const t = S.d.badges.find((x) => x.id === id); if (t) t.isNew = false; });
      (seen.goals || []).forEach((id) => { const g = S.d.goals.find((x) => x.id === id); if (g) g.isNew = false; });
      paintHud();
      if (S.tab === 'insigne') show(S.tab, { static: true, silent: true });
    } else S.d.events = {};
  }

  // ------------------------------------------------------------------ live: the game follows the clinic
  async function refresh() {
    if (!S.open) return;
    try { await load(); } catch (e) { return; }
    if (!S.root) return;
    show(S.tab, { static: true, silent: true });
    ceremonies();
  }
  function tickTimers() {
    if (!S.root || !S.d) return;
    S.root.querySelectorAll('[data-timer]').forEach((el) => {
      const M = S.d.missions, ms = (el.dataset.timer === 'd' ? M.dailyResetIn : M.weeklyResetIn) - (Date.now() - S.loadedAt);
      el.innerHTML = ic('clock') + hms(ms);
    });
  }

  // ------------------------------------------------------------------ the transition in and out
  function wipe(rev, word, sub) {
    const w = document.createElement('div');
    w.className = 'gm-wipe' + (rev ? ' is-rev' : '');
    w.innerHTML = '<div class="tilt">' + Array.from({ length: 6 }, (_, i) => '<div class="band" style="--i:' + i + '"></div>').join('') + '</div>' +
      '<div class="glitch"></div><div class="ring"></div><div class="logo"><div><b>' + esc(word) + '</b><small>' + esc(sub) + '</small></div></div>';
    document.body.appendChild(w);
    void w.offsetWidth;
    w.classList.add('is-in');
    return w;
  }
  function fonts() {
    if (document.getElementById('gm-font')) return;
    const l = document.createElement('link');
    l.id = 'gm-font'; l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@500;600;700&display=swap';
    document.head.appendChild(l);
  }
  function onVisibility() {
    if (!S.open) return;
    const boot = window.C360GameBoot;
    if (boot && boot.audioPause) boot.audioPause(document.hidden); // the silent loop holds the phone's audio only while the game is in sight
    if (document.hidden) Sfx.suspend(); else { Sfx.resume(); if (Date.now() - S.loadedAt > 20000 && !S.cerRun) refresh(); }
  }
  async function enter(quick) {
    if (S.open) return;
    S.open = true;
    store.set('c360_game', '1');
    fonts();
    Sfx.unlock();
    document.addEventListener('visibilitychange', onVisibility);
    const dataP = load().then(() => true, (e) => { console.error(e); S.loadErr = e; return false; });
    const credP = fetch('/game/img/credits.json').then((r) => (r.ok ? r.json() : null)).then((c) => { S.credits = c; }, () => {});
    if (quick || calm()) {
      const root = mount();
      root.classList.add('is-enter');
      const ok = await dataP;
      if (!ok) { failOpen(); return; }
      show(S.tab, { silent: true });
      Sfx.music(true);
      S.cerT = setTimeout(ceremonies, 900);
      startLive();
      return;
    }
    Sfx.whoosh(); buzz(18);
    const w = wipe(false, 'GAME MODE', 'CENTRUL360');
    await sleep(560);
    w.classList.add('is-logo'); Sfx.impact(); buzz([30, 30, 70]);
    const root = mount();
    S.audioOk = true;
    const ok = await Promise.race([dataP, sleep(1500).then(() => null)]);
    await sleep(420);
    root.classList.add('is-enter');
    w.classList.remove('is-in', 'is-logo'); w.classList.add('is-out');
    setTimeout(() => w.remove(), 900);
    Sfx.whooshOut();
    const ready = ok === null ? await dataP : ok;
    await credP;
    if (!ready) { failOpen(); return; }
    show(S.tab, { silent: true });
    Sfx.music(true);
    S.cerT = setTimeout(ceremonies, 1300);
    startLive();
  }
  function failOpen() {
    toast('Jocul nu s-a putut încărca acum. Încearcă din nou.', 'error');
    teardown();
    const e = S.loadErr || {};
    if (e.status === 403 || e.code === 'forbidden') store.set('c360_game', '0'); // not an admin any more: the switch goes off
  }
  function startLive() {
    clearInterval(S.timer);
    S.timer = setInterval(() => {
      tickTimers();
      if (!document.hidden && Date.now() - S.loadedAt > 45000 && !S.sheet && !S.cer && !S.cerRun && !S.citing) refresh();
    }, 1000);
  }
  function teardown() {
    clearInterval(S.timer);
    clearTimeout(S.cerT);
    document.querySelectorAll('.gm-intro, .gm-cer').forEach((x) => x.remove());
    S.cer = false; S.cerRun = false;
    Fx.stop();
    Sfx.music(false);
    if (S.car) { S.car.destroy(); S.car = null; }
    closeSheet(true);
    document.removeEventListener('visibilitychange', onVisibility);
    const m = document.querySelector('.gm-menu'); if (m) m.remove();
    if (S.root) S.root.remove();
    S.root = null; S.open = false;
    document.documentElement.classList.remove('gm-on');
    if (window.C360GameBoot && window.C360GameBoot.audioOff) window.C360GameBoot.audioOff();
  }
  async function exit() {
    if (!S.open) return;
    clearTimeout(S.cerT);
    store.set('c360_game', '0');
    if (calm()) { teardown(); return; }
    Sfx.whoosh(); buzz(18);
    Sfx.music(false);
    const w = wipe(true, 'BUSINESS', 'ÎNAPOI LA PORTAL');
    if (S.root) S.root.classList.add('is-leave');
    await sleep(600);
    w.classList.add('is-logo'); Sfx.impact();
    teardown();
    await sleep(650);
    w.classList.remove('is-in', 'is-logo'); w.classList.add('is-out');
    Sfx.whooshOut();
    setTimeout(() => w.remove(), 900);
    if (K.reload) K.reload();
  }

  window.C360Game = { enter, exit, isOpen: () => S.open, toggle: () => (S.open ? exit() : enter()) };
})();
