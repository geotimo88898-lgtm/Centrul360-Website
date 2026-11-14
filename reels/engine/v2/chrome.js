// Centrul360 reels v2: the frame "chrome" that makes a reel one designed piece (the data-viz reference, 14.11):
//   - a thin header strip under the top safe zone: the section's label (uppercase, tracked) and "PASUL 03", a hairline
//   - a scrubber at the bottom for the whole reel: one tick per idea, a rose gold ball that advances, the reel's title
//     and "Pasul 3 din 10" under it
//   - a huge faint ghost numeral of the step, behind everything
// Centred on the frame axis (x 160..920). Script: "chrome": { "title": "…", "unit": "Pasul" } (false: off); each visual
// can carry "hdr" (the section label); a data-viz scene's own header moves up into the strip.
(function () {
  'use strict';
  const R = window.R2, { clamp, E, h, esc } = R;
  const calm = (p) => E.inout(clamp(p));
  const pad = (n) => String(n).padStart(2, '0');
  const C = R.chrome = {};
  C.build = (S, shots, total) => {
    const cf = S.chrome;
    if (!cf) return;
    document.body.dataset.chrome = '1';
    const story = shots.filter((s) => !s.end);
    const N = story.length;
    const fr = h('div', 'chr', null, document.getElementById('chrome'));
    fr.innerHTML = '<div class="chr-h"><span class="l a"></span><span class="l b"></span><b class="r"></b></div><i class="chr-rule"></i>' +
      '<div class="chr-s"><i class="trk"></i><i class="fil"></i>' + story.map((_, i) => '<i class="tk" style="left:' + (i / Math.max(1, N - 1) * 100).toFixed(3) + '%"></i><em style="left:' + (i / Math.max(1, N - 1) * 100).toFixed(3) + '%">' + pad(i + 1) + '</em>').join('') + '<i class="ball"></i></div>' +
      '<div class="chr-f"><span>' + esc(cf.title || '') + '</span><span class="n"></span></div>';
    const gh = h('div', 'chr-ghost', '<span class="a"></span><span class="b"></span>', document.getElementById('bg'));
    const label = (s) => { const v = s.vis || {}; return v.hdr || (s.lines[0] && s.lines[0].b.hdr) || v.header || ''; };
    story.forEach((s, i) => { s.hdr = label(s) || (i ? story[i - 1].hdr : ''); s.k = i; });
    const endShot = shots.find((s) => s.end);
    C.st = { fr, gh, story, N, endShot, total, unit: cf.unit || 'Pasul', la: fr.querySelector('.l.a'), lb: fr.querySelector('.l.b'), r: fr.querySelector('.r'), n: fr.querySelector('.chr-f .n'), fil: fr.querySelector('.fil'), ball: fr.querySelector('.ball'), tks: [...fr.querySelectorAll('.tk')], ems: [...fr.querySelectorAll('.chr-s em')], ga: gh.querySelector('.a'), gb: gh.querySelector('.b'), loop: R.endType === 'loop', hideEnd: cf.hideEnd != null ? cf.hideEnd : R.endType !== 'loop' };
    // each idea's change of label is a small event (a tick on the scrubber)
    story.forEach((s, i) => { if (i) R.event(s.t0 + 0.05, 'chrome'); });
  };
  C.draw = (t) => {
    const Z = C.st; if (!Z) return;
    const { story, N } = Z;
    let k = 0; story.forEach((s, i) => { if (t >= s.t0) k = i; });
    const s = story[k], nx = story[k + 1];
    const inEnd = Z.endShot && t >= Z.endShot.t0;
    // the playhead: between this idea's tick and the next one, by the time spent in it
    const span = (nx ? nx.t0 : (Z.endShot ? Z.endShot.t0 : Z.total)) - s.t0;
    let u = (k + clamp((t - s.t0) / Math.max(0.1, span))) / Math.max(1, N - 1);
    if (k === N - 1) u = 1;
    if (inEnd && Z.loop) u = 1 - calm((t - Z.endShot.t0) / 0.6); // the loop comes back to the start
    u = clamp(u);
    Z.fil.style.transform = 'scaleX(' + u.toFixed(4) + ')';
    Z.ball.style.left = (u * 100).toFixed(3) + '%';
    const cur = inEnd && Z.loop ? 0 : k;
    Z.tks.forEach((e, i) => e.classList.toggle('on', i <= cur));
    Z.ems.forEach((e, i) => e.classList.toggle('on', i === cur));
    // the header label: the old one leaves up, the new one comes in (calm, 0.35 s)
    const lab = inEnd && Z.loop ? story[0].hdr : s.hdr, prev = inEnd && Z.loop ? s.hdr : k ? story[k - 1].hdr : '';
    const t0 = inEnd && Z.loop ? Z.endShot.t0 : s.t0;
    const q = k || (inEnd && Z.loop) ? calm((t - t0) / 0.4) : 1;
    if (Z.la.textContent !== lab) Z.la.textContent = lab;
    if (Z.lb.textContent !== prev) Z.lb.textContent = prev;
    Z.la.style.opacity = q.toFixed(3); Z.la.style.transform = 'translateY(' + ((1 - q) * 18).toFixed(1) + 'px)';
    Z.lb.style.opacity = (prev !== lab ? 1 - q : 0).toFixed(3); Z.lb.style.transform = 'translateY(' + (-q * 18).toFixed(1) + 'px)';
    const right = (!inEnd && s.hdrRight && s.hdrRight()) || Z.unit.toUpperCase() + ' ' + pad(cur + 1);
    if (Z.r.textContent !== right) Z.r.textContent = right;
    const nn = Z.unit + ' ' + (cur + 1) + ' din ' + N; if (Z.n.textContent !== nn) Z.n.textContent = nn;
    // the ghost numeral (hidden where a scene has its own)
    const own = !!(s.el && s.el.querySelector('.dv-ghost'));
    const ga = pad(cur + 1), gb = pad(Math.max(1, cur));
    if (Z.ga.textContent !== ga) Z.ga.textContent = ga;
    if (Z.gb.textContent !== gb) Z.gb.textContent = gb;
    const gq = cur ? calm((t - t0) / 0.6) : 1;
    Z.ga.style.transform = 'translateY(' + ((1 - gq) * 160).toFixed(1) + 'px)'; Z.ga.style.opacity = gq.toFixed(3);
    Z.gb.style.transform = 'translateY(' + (-gq * 160).toFixed(1) + 'px)'; Z.gb.style.opacity = (cur && gb !== ga ? 1 - gq : 0).toFixed(3);
    const show = Z.hideEnd && inEnd ? 1 - calm((t - Z.endShot.t0) / 0.4) : 1;
    Z.fr.style.opacity = show.toFixed(3);
    Z.gh.style.opacity = (show * (own ? 0 : 1)).toFixed(3);
  };
})();
