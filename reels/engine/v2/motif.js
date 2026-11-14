// Centrul360 reels v2: the guiding motif (14.11, the editing reference: one small element leads the eye from scene to
// scene). Script "motif": "dot": a small rose gold light-dot that, on every cut, travels from the old scene's main
// element to the new one's and settles into it (a match cut through a shared point), with its own quiet ping.
(function () {
  'use strict';
  const R = window.R2, { clamp, E, h } = R;
  const M = R.motif = {};
  M.build = (S, shots) => {
    if (S.motif !== 'dot') return;
    const d = h('div', null, null, document.getElementById('fx'));
    d.style.cssText = 'position:absolute;left:0;top:0;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;display:none;pointer-events:none;' +
      'background:radial-gradient(circle at 35% 30%,#ffffff 0%,#fbe3d9 35%,#eab5a5 70%,#cf8f7d 100%);box-shadow:0 0 18px 6px rgba(251,227,217,.55),0 0 2px 1px rgba(255,255,255,.9)';
    M.el = d;
    M.legs = shots.filter((s, i) => i > 0 && !s.end && shots[i - 1].focusRect && s.focusRect).map((s) => {
      const p = shots[s.i - 1].focusRect, q = s.focusRect;
      R.cue(s.t0 + 0.24, 'dot', 0.35, { prio: 2.5 }); R.event(s.t0 + 0.24, 'motif');
      return { a: s.t0 - 0.34, b: s.t0 + 0.24, p: [p.x, p.y], q: [q.x, q.y] };
    });
  };
  M.draw = (t) => {
    if (!M.el) return;
    const L = M.legs.find((l) => t >= l.a && t <= l.b + 0.3);
    if (!L) { M.el.style.display = 'none'; return; }
    const u = E.inout(clamp((t - L.a) / (L.b - L.a)));
    const x = L.p[0] + (L.q[0] - L.p[0]) * u, y = L.p[1] + (L.q[1] - L.p[1]) * u - Math.sin(Math.PI * u) * 90;
    const settle = clamp((t - L.b) / 0.3); // it lands and melts into the new scene's element
    M.el.style.display = 'block';
    M.el.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px) scale(' + ((1 + 0.3 * Math.sin(Math.PI * u)) * (1 + 1.6 * settle)).toFixed(3) + ')';
    M.el.style.opacity = (clamp((t - L.a) / 0.12) * (1 - settle)).toFixed(3);
  };
})();
