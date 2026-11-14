// Centrul360 reels v2: editing-craft scenes (14.11, the owner's editing reference: clean, tasteful, every visual event
// with its own sound, staggered on the music's grid, a guiding light-dot, a held ending).
//   writeon : a small line of text written by a glowing rose gold dot, a soft tick on every word, a quiet riser under it
//   panels  : vertical panels slam in one after another on the music's grid (a quarter beat), one vertical word each,
//             a tap on every panel, a soft riser under the sequence
//   titlecard : the final composition: a big title, a small accent, a three-line stack; a real before/after card (with
//             its consent line) overlapping the title for depth; held still, with micro-motion only
(function () {
  'use strict';
  const R = window.R2, V = R.V, { clamp, E, h, esc, place } = R;
  const T = R.at;
  const calm = (p) => E.inout(clamp(p));
  const dark = () => R.theme.palette && R.theme.palette.ink === '#ffffff';
  const DOT = 'background:radial-gradient(circle at 35% 30%,#ffffff 0%,#fbe3d9 35%,#eab5a5 70%,#cf8f7d 100%);box-shadow:0 0 18px 6px rgba(251,227,217,.55),0 0 2px 1px rgba(255,255,255,.9);border-radius:50%';

  V.writeon = (ctx, p) => {
    const st = ctx.stage();
    const txt = p.text || (ctx.lines[0] ? ctx.lines[0].cap : '');
    const line = h('div', 'tx abs', null, st); line.style.cssText += ';left:50px;width:760px;text-align:center;top:' + (p.y || 430) + 'px;font:600 ' + (p.size || 40) + 'px/1.2 var(--f-body);letter-spacing:.01em;color:var(--ink);white-space:nowrap';
    const words = txt.split(/\s+/).filter(Boolean);
    line.innerHTML = words.map((w) => '<span class="ww" style="opacity:0">' + esc(w) + '</span>').join(' ');
    const dot = h('div', 'abs', null, st); dot.style.cssText += ';width:16px;height:16px;margin:-8px 0 0 -8px;' + DOT;
    const ws = [...line.querySelectorAll('.ww')];
    const t0 = ctx.t0 + (p.lead || 0.35), step = p.step || 0.16;
    const times = ws.map((_, i) => (p.grid ? R.grid(t0 + i * step) : t0 + i * step));
    times.forEach((t, i) => { ctx.sfx(t, 'tick_soft', 0.5); R.event(t, i ? 'word' : 'write'); });
    ctx.sfx(t0 - 0.1, 'riser_soft', 0.35);
    ctx.focus(line);
    ctx.tick((t) => {
      const r = line.getBoundingClientRect(), sr = st.getBoundingClientRect();
      let x = r.left - sr.left - 10;
      ws.forEach((w, i) => { const q = calm((t - times[i]) / 0.18); w.style.opacity = q.toFixed(3); w.style.filter = q < 1 ? 'blur(' + ((1 - q) * 4).toFixed(1) + 'px)' : ''; if (t >= times[i]) { const wr = w.getBoundingClientRect(); x = wr.right - sr.left + 6 * q; } });
      const y = r.top - sr.top + r.height * 0.62;
      dot.style.left = x.toFixed(1) + 'px'; dot.style.top = y.toFixed(1) + 'px';
      dot.style.opacity = (calm((t - ctx.t0) / 0.25) * (1 - calm((t - times[times.length - 1] - 0.6) / 0.3))).toFixed(3);
    });
  };

  V.panels = (ctx, p) => {
    const st = ctx.stage();
    const words = p.words || ['Corp', 'Față', 'Piele', 'Grijă'];
    const n = words.length, w = Math.floor(760 / n), H = p.h || 860, top = p.top != null ? p.top : 20;
    const cols = p.colors || (dark() ? ['#ffffff', '#0b7f74'] : ['#14a596', '#ffffff']);
    const t0 = ctx.t0 + (p.lead || 0.15), every = p.every || 0.25; // a quarter-beat grid by default (R.grid)
    const els = words.map((wd, i) => {
      const c = cols[i % cols.length], ink = c === '#ffffff' ? '#0b7f74' : '#ffffff';
      const d = h('div', 'abs', '<div class="tx" style="position:absolute;left:50%;bottom:60px;transform:translateX(-50%) rotate(-90deg);transform-origin:50% 50%;white-space:nowrap;font:700 46px/1 var(--f-display);letter-spacing:-.01em;color:' + ink + '">' + esc(wd) + '</div>', st);
      place(d, 50 + i * w, top, w - 6, H); d.style.background = c; d.style.borderRadius = '14px'; d.style.boxShadow = '0 30px 50px -30px rgba(4,40,36,.45)';
      const t = R.grid(t0 + i * every); ctx.anim(d, 'slideD', t, { amt: 160, sfx: 'tap', gain: 0.6 }); R.event(t, 'panel');
      return d;
    });
    ctx.sfx(t0 - 0.2, 'riser_soft', 0.4);
    ctx.focus(els[n - 1]);
  };

  V.titlecard = (ctx, p) => {
    const st = ctx.stage();
    const title = h('div', 'tx abs', esc(p.title || 'Pas cu pas'), st); title.style.cssText += ';left:50px;width:760px;text-align:center;top:' + (p.y || 120) + 'px;font:900 150px/0.92 var(--f-display);letter-spacing:-.05em;color:var(--ink)';
    const acc = p.accent ? h('div', 'tx abs', esc(p.accent), st) : null;
    if (acc) acc.style.cssText += ';left:50px;width:760px;text-align:center;top:' + ((p.y || 120) + 500) + 'px;font:italic 500 64px/1 var(--f-serif);color:var(--rose2)';
    const stack = p.stack ? h('div', 'tx abs', p.stack.map((s) => '<div>' + esc(s) + '</div>').join(''), st) : null;
    if (stack) stack.style.cssText += ';left:50px;width:760px;text-align:center;top:' + ((p.y || 120) + 585) + 'px;font:600 26px/1.45 var(--f-body);letter-spacing:.12em;text-transform:uppercase;color:var(--mute)';
    let card = null, note = null;
    if (p.img) { // a real catalog photo (before | after), shown as it is, overlapping the title for depth
      card = h('div', 'abs', '<img src="' + R.ROOT + '/' + p.img + '" style="width:100%;height:100%;object-fit:cover;display:block">', st);
      card.style.cssText += ';left:180px;top:' + ((p.y || 120) + 112) + 'px;width:500px;height:338px;border-radius:24px;overflow:hidden;border:6px solid #fff;box-shadow:0 40px 70px -30px rgba(4,40,36,.55)';
      note = h('div', 'tx abs note', esc(p.note || 'Publicat cu acordul clientei. Rezultatele diferă de la o persoană la alta.'), st); place(note, 50, (p.y || 120) + 700); note.style.width = '760px';
    }
    const t0 = ctx.t0 + 0.05;
    ctx.anim(title, 'in', t0, { sfx: 'tap', gain: 0.6, amt: 40 });
    if (card) ctx.anim(card, 'slideL', R.grid(t0 + 0.25), { amt: -500, sfx: 'tap', gain: 0.5 });
    if (acc) ctx.anim(acc, 'in', R.grid(t0 + 0.5), { sfx: 'tick_soft', amt: 20 });
    if (stack) ctx.anim(stack, 'in', R.grid(t0 + 0.75), { sfx: 'tick_soft', amt: 16 });
    if (note) ctx.anim(note, 'fade', t0 + 0.9, { sfx: null });
    R.event(t0 + 1.0, 'hold');
    ctx.focus(card || title);
    ctx.tick((t) => { // the held ending: only micro-motion
      const k = 1 + 0.006 * Math.sin((t - ctx.t0) * 1.3);
      title.dataset.base = 'scale(' + k.toFixed(4) + ')';
      if (card) card.dataset.base = 'translateY(' + (Math.sin((t - ctx.t0) * 1.1) * 3).toFixed(2) + 'px) rotate(' + (-2 + 0.4 * Math.sin((t - ctx.t0) * 0.9)).toFixed(3) + 'deg)';
    });
  };
})();
