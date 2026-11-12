// Centrul360 reels v2: the endings. Each type: lead (pause before its spoken line), start (when its shot begins),
// total (when the reel ends), build(ctx, spec) (its shot), noCaptions (its own text replaces the captions).
//   loop    : no CTA; the last frame flows into the first (the hook's opening state, already in motion)
//   comment : a keyword typed into a comment bar, sent, then the comment appears
//   site    : a fictional, clean browser types centrul360.com; REAL screenshots of the live pages (site.cjs), a gentle
//             scroll and a tap on one relevant section; never invented site content
//   ask     : a question to the audience, answer chips, no keyword
(function () {
  'use strict';
  const R = window.R2;
  const { clamp, E, h, esc, place, fit } = R;
  const END = R.END = {};
  const endLine = (lines) => lines.find((L) => L.role === 'end');
  const lastStory = (lines) => lines.filter((L) => L.role !== 'end').pop();

  // ------------------------------------------------------------------ loop
  END.loop = {
    lead: 0.2, noCaptions: true,
    start: (lines, total, spec) => total - (spec.dur || 1.25),
    total: (lines, last, spec) => (lastStory(lines) ? lastStory(lines).t1 : last) + (spec.hold != null ? spec.hold : 1.0) + (spec.dur || 1.25),
    build(ctx, spec, shots) {
      const hook = shots[0], total = R.total;
      // the hook again, built as if it started at the reel's end: what it shows before its start is frame 0
      const shift = total; // frame `total` of the clone = frame 0 of the hook
      const proxy = { i: ctx.shot.i, el: ctx.shot.el, vis: hook.vis, t0: hook.t0 + shift, t1: hook.t1 + shift, ticks: ctx.shot.ticks, layers: ctx.shot.layers, owner: ctx.shot,
        lines: hook.lines.map((L) => Object.assign({}, L, { t0: L.t0 + shift, t1: L.t1 + shift, words: L.words.map((w) => Object.assign({}, w, { t: w.t + shift })) })) };
      const pctx = R.makeCtx(proxy);
      (R.V[hook.vis.type] || R.V['type-pop'])(pctx, hook.vis);
      ctx.shot.focus = proxy.focus;
      // the camera: the hook's camera must be at rest at its start (push/none), the loop shot holds still
      if (!['push', 'none', 'parallax'].includes(hook.cam)) hook.cam = 'push';
      ctx.shot.cam = 'loop0';
      R.CAM.loop0 = () => { const c = R.CAM[hook.cam](0, 1); return c; };
      ctx.shot.tr = spec.tr || 'zoom-through';
      ctx.shot.trDur = (R.TR[ctx.shot.tr] || {}).dur || 0.45;
      R.cue(total - 0.75, 'whoosh_r', 0.7, { prio: 3 }); // rises into the hit of frame 0 when the video loops
      R.event(ctx.shot.t0, 'loop');
    },
  };

  // ------------------------------------------------------------------ comment
  END.comment = {
    lead: 0.3, noCaptions: true,
    start: (lines) => { const L = endLine(lines); return L ? L.t0 - 0.12 : lastStory(lines).t1 + 0.3; },
    total: (lines, last) => { const L = endLine(lines); return Math.max(last + 1.2, (L ? L.t0 + L.dur * 0.6 : last) + 0.12 * 8 + 2.0); },
    build(ctx, spec) {
      const st = ctx.stage();
      const kwd = spec.keyword || R.script.keyword || 'INFO';
      const t0 = ctx.t0 + 0.08;
      const l1 = h('div', 'tx abs disp', esc(spec.title || 'Scrie în comentarii'), st); l1.style.cssText += ';left:0;width:860px;text-align:center;font-size:66px';
      const kw = h('div', 'tx abs num', '«' + esc(kwd) + '»', st); kw.style.cssText += ';left:0;width:860px;text-align:center'; fit(kw, 820, 220, 190, 90);
      const bar = h('div', 'cbar', '<span class="av">' + R.icon('user-round') + '</span><span class="txt"><span class="ph">Adaugă un comentariu…</span></span><span class="send">' + R.icon('send') + '</span>', st); bar.style.left = '20px'; bar.style.width = '820px';
      const l2 = spec.line ? h('div', 'tx abs lab', R.rich(spec.line), st) : null; if (l2) { l2.style.cssText += ';left:20px;width:820px;text-align:center;font-size:40px;color:var(--mute)'; }
      const els = [l1, kw, bar, l2].filter(Boolean), hs = els.map((e) => e.offsetHeight), sum = hs.reduce((a, b) => a + b, 0) + 40 * (els.length - 1);
      let y = (900 - sum) / 2 - 60; els.forEach((e, i) => { e.style.top = y + 'px'; y += hs[i] + 40; });
      ctx.anim(l1, 'in', t0); ctx.anim(kw, 'slam', t0 + 0.2, { sfx: 'impact', gain: 0.5 }); ctx.anim(bar, 'slideU', t0 + 0.4, { amt: 200 }); 
      const L0 = ctx.lines[0], strip = (x) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      const kw0 = L0 ? L0.words.find((w) => strip(w.w).replace(/[^a-z]/g, '') === strip(kwd).replace(/[^a-z]/g, '')) : null;
      const txt = bar.querySelector('.txt'), word = kwd, tt = Math.max(t0 + 0.9, kw0 ? kw0.t : 0), step = 0.12;
      for (let i = 0; i < word.length; i++) { R.cue(tt + i * step, 'key', 0.5); }
      R.event(tt, 'type'); R.event(tt + word.length * step * 0.5, 'type');
      const tSend = tt + word.length * step + 0.3;
      ctx.anim(bar.querySelector('.send'), 'pop', tSend, { sfx: 'click', gain: 0.7 });
      // the comment lands above the bar, with a heart
      const cm = h('div', 'cmt', '<span class="av" style="background:var(--acc2)"></span><div class="b"><small>tu · acum</small>' + esc(word) + '</div>', st);
      cm.style.left = '20px'; cm.style.top = (parseFloat(bar.style.top) + 150) + 'px';
      if (l2) { l2.style.top = (parseFloat(bar.style.top) + 300) + 'px'; ctx.anim(l2, 'in', tSend + 1.1, { sfx: null, event: true }); }
      const heart = h('div', 'abs ico', R.icon('heart'), cm); heart.style.cssText += ';left:' + (110 + word.length * 26 + 60) + 'px;top:40px;width:64px;height:64px;color:var(--bad)';
      ctx.anim(cm, 'slideU', tSend + 0.25, { amt: 80, sfx: 'bubble', gain: 0.6 }); ctx.anim(heart, 'pop', tSend + 0.8, { sfx: 'pop', gain: 0.5 });
      ctx.anim(kw, 'bump', Math.max(tSend + 1.6, ctx.L(0, 0.88)), { amt: 0.1, event: true }); ctx.sfx(Math.max(tSend + 1.6, ctx.L(0, 0.88)), 'sparkle', 0.45);
      ctx.focus(kw);
      ctx.tick((t) => { const n = clamp(Math.floor((t - tt) / step) + 1, 0, word.length); const v = t < tt ? '' : word.slice(0, n); const blink = t % 0.8 < 0.4; const key = v + blink + (t < tSend);
        if (txt.dataset.v !== key) { txt.dataset.v = key; txt.innerHTML = (v ? esc(v) : (t < tt - 0.3 ? '<span class="ph">Adaugă un comentariu…</span>' : '')) + (t < tSend && t > tt - 0.3 ? '<i style="opacity:' + (blink ? 1 : 0) + '"></i>' : ''); } if (t >= tSend + 0.1) txt.innerHTML = ''; });
    },
  };

  // ------------------------------------------------------------------ ask
  END.ask = {
    lead: 0.3, noCaptions: true,
    start: (lines) => { const L = endLine(lines); return L ? L.t0 - 0.12 : lastStory(lines).t1 + 0.3; },
    total: (lines, last) => last + 1.6,
    build(ctx, spec) {
      const st = ctx.stage();
      const L = ctx.lines[0];
      const q = R.kt(spec.q || (L ? L.capRich : ''), st); q.style.left = '0'; q.style.width = '860px'; fit(q, 820, 420, 120, 54); q.style.top = '80px';
      [...q.querySelectorAll('.w')].forEach((w, i) => ctx.anim(w, 'pop', L && L.words[i] ? L.words[i].t - 0.04 : ctx.t0 + i * 0.1, { gain: 0.3, sfx: i % 2 ? null : undefined, event: true }));
      const opts = (spec.options || []).map((o, i) => { const d = h('div', 'tx abs', '<span class="chip ' + (i % 2 ? 'soft' : 'acc') + '" style="font-size:40px;padding:22px 34px">' + R.rich(o) + '</span>', st); d.style.left = '0'; d.style.width = '860px'; d.style.textAlign = 'center'; d.style.top = (q.offsetTop + q.offsetHeight + 80 + i * 120) + 'px'; ctx.anim(d, 'pop', (L ? L.t1 : ctx.t0 + 1) - 0.4 + i * 0.25, { gain: 0.45 }); return d; });
      ctx.focus(q);
      return opts;
    },
  };

  // ------------------------------------------------------------------ site: a fictional browser with real screenshots of the live site
  // spec.pages: [{ key: "home#rezultate" | ..., path: "/grasime-localizata", scroll: px, tap: {x, y, w, h} (page px), label }]
  END.site = {
    lead: 0.3,
    start: (lines) => { const L = endLine(lines); return L ? L.t0 - 0.12 : lastStory(lines).t1 + 0.3; },
    total: (lines, last, spec) => { const L = endLine(lines); const t0 = L ? L.t0 - 0.12 : last + 0.3; return Math.max(last + 0.7, t0 + (spec.dur || 5.2)); },
    build(ctx, spec) {
      const el = ctx.el;
      const bx = 84, by = 300, bw = 812, bh = 880; // inside the safe zone (x ≤ 920) and above the captions
      const brw = h('div', 'brw', '<div class="bar"><div class="dots"><i></i><i></i><i></i></div><div class="url">' + R.icon('lock') + '<span class="u"></span></div></div><div class="prog"></div><div class="view"></div>', el);
      place(brw, bx, by, bw, bh);
      const u = brw.querySelector('.u'), prog = brw.querySelector('.prog'), view = brw.querySelector('.view');
      const scale = 780 / 780; // screenshots are 390 css px at DPR 2 = 780 px wide; the view is 812 wide
      const SS = R.siteShots || {};
      const pages = (spec.pages || []).map((pg) => { const m = SS.shots && SS.shots[pg.key]; const d = h('div', 'abs', null, view); d.style.cssText += ';left:0;top:0;width:812px;height:762px;overflow:hidden;opacity:0';
        const navH = SS.nav ? SS.nav.h * 812 / SS.nav.w : 0;
        if (m) { d.style.background = '#f7fafa'; const img = h('img', null, null, d); img.src = '../site/' + m.file; img.style.width = '812px'; img.style.height = (m.h * 812 / m.w) + 'px'; img.style.top = navH + 'px'; d._img = img; d._h = m.h * 812 / m.w; d._m = m; d._navH = navH;
          if (SS.nav && pg.nav !== false) { const nv = h('img', null, null, d); nv.src = '../site/' + SS.nav.file; nv.style.cssText = 'position:absolute;left:0;top:0;width:812px;height:' + (SS.nav.h * 812 / SS.nav.w) + 'px'; } }
        else { d.innerHTML = '<div style="position:absolute;inset:0;display:grid;place-items:center;background:#fafafa"><div style="font:800 46px/1 Inter Variable,sans-serif;color:#222">centrul360.com</div></div>'; d._h = 762; }
        return Object.assign(d, { pg }); });
      const domain = spec.domain || 'centrul360.com';
      const t0 = ctx.t0 + 0.05;
      ctx.anim(brw, 'slideU', t0, { amt: 900, dur: 0.6, sfx: 'swoosh_up', gain: 0.6 });
      const tType = t0 + 0.55, step = 0.065;
      for (let i = 0; i < domain.length; i++) R.cue(tType + i * step, 'key', 0.45);
      R.event(tType, 'type'); R.event(tType + domain.length * step * 0.5, 'type');
      const tEnter = tType + domain.length * step + 0.15;
      R.cue(tEnter, 'click', 0.7);
      // page 1 loads, scrolls; page 2 (the path is typed after the domain), scrolls, a tap on the section
      const tL1 = tEnter + 0.35;
      const p2 = pages[1];
      const path2 = p2 ? (p2.pg.url || p2.pg.path || '').replace(/^\/$/, '') : '';
      const tNav = tL1 + (spec.home || 1.1);
      const step2 = 0.032, tEnter2 = tNav + path2.length * step2 + 0.1, tL2 = tEnter2 + 0.3;
      if (p2) { for (let i = 0; i < path2.length; i += 3) R.cue(tNav + i * step2, 'key', 0.3); R.cue(tEnter2, 'click', 0.6); R.event(tNav, 'type'); R.event(tL2, 'load'); }
      R.cue(tL1, 'shimmer', 0.35); R.event(tL1, 'load');
      const last = pages[pages.length - 1];
      const tTap = (p2 ? tL2 : tL1) + (spec.tapAfter || 1.2);
      const tap = h('div', 'tap', null, el); const ring = h('div', 'ring', null, el);
      const tapBox = (d) => (d && typeof d.pg.tap === 'string' ? ((d._m || {}).taps || {})[d.pg.tap] : d && d.pg.tap) || null;
      if (last && tapBox(last)) { R.cue(tTap, 'click', 0.6); R.cue(tTap + 0.1, 'pop', 0.4); R.event(tTap, 'tap'); }
      ctx.focus(brw);
      ctx.tick((t) => {
        const typed = t < tType ? '' : domain.slice(0, clamp(Math.floor((t - tType) / step) + 1, 0, domain.length));
        const typed2 = p2 && t >= tNav ? path2.slice(0, clamp(Math.floor((t - tNav) / step2) + 1, 0, path2.length)) : '';
        const blink = t % 0.8 < 0.4 && (t < tEnter || (p2 && t >= tNav - 0.2 && t < tEnter2));
        const val = typed + typed2;
        const key = val + blink;
        if (u.dataset.v !== key) { u.dataset.v = key; u.innerHTML = (val ? esc(val) : '<span class="ph">Caută sau scrie o adresă</span>') + (blink ? '<span class="caret"></span>' : ''); }
        // progress bars
        const pr = (a) => clamp((t - a) / 0.35);
        const pp = t >= tEnter && t < tL1 + 0.2 ? pr(tEnter) : p2 && t >= tEnter2 && t < tL2 + 0.2 ? pr(tEnter2) : 0;
        prog.style.width = (E.out(pp) * 812).toFixed(1) + 'px'; prog.style.opacity = pp > 0 && pp < 1 ? '1' : (pp >= 1 ? (1 - clamp((t - (t < tL2 ? tL1 : tL2)) / 0.2)).toFixed(2) : '0');
        pages.forEach((d, i) => {
          const tl = i === 0 ? tL1 : tL2, tEnd = i === 0 && p2 ? tL2 : 1e9;
          const vis = t >= tl && t < tEnd + 0.25;
          if (!vis) { d.style.opacity = '0'; return; }
          const q = E.out(clamp((t - tl) / 0.45));
          const outq = t > tEnd ? E.in(clamp((t - tEnd) / 0.25)) : 0;
          d.style.opacity = (q * (1 - outq)).toFixed(3);
          d.style.clipPath = 'inset(0 0 ' + ((1 - q) * 100).toFixed(1) + '% 0)';
          d.style.transform = 'scale(' + (1.03 - 0.03 * q).toFixed(4) + ') translateX(' + (-outq * 120).toFixed(1) + 'px)';
          d.style.filter = q < 1 ? 'blur(' + ((1 - q) * 8).toFixed(2) + 'px)' : '';
          if (d._img) { const tb = tapBox(d), nh = d._navH || 0, kk = 812 / 780; const sc = d.pg.scroll != null ? d.pg.scroll * kk : tb ? Math.max(0, Math.min(d._h + nh - 762, nh + (tb.y + tb.h / 2) * kk - (762 + nh) / 2)) : 0; const sq = E.inout(clamp((t - tl - 0.35) / (d.pg.scrollDur || 1.1))); const yy = -sc * sq; d._img.style.transform = 'translateY(' + yy.toFixed(1) + 'px)'; d._y = yy; }
        });
        // the tap and the highlight ring on the section (page px → screen)
        if (last && tapBox(last) && t >= tTap - 0.5) {
          const tp = tapBox(last), k = 812 / 780;
          const sx = bx + (tp.x + tp.w / 2) * k, sy = Math.min(by + bh - 120, by + 118 + (last._navH || 0) + (tp.y + tp.h / 2) * k + (last._y || 0));
          const qm = E.inout(clamp((t - tTap + 0.5) / 0.5));
          place(tap, sx + (1 - qm) * 160, sy + (1 - qm) * 220); tap.style.opacity = (qm * (t > tTap + 1.4 ? 0 : 1)).toFixed(3);
          const pr2 = clamp((t - tTap) / 0.25); tap.style.transform = 'scale(' + (1 - 0.25 * Math.sin(Math.PI * pr2)).toFixed(3) + ')';
          const rq = E.back(clamp((t - tTap - 0.1) / 0.4));
          { const rx = bx + tp.x * k - 12, ry = Math.max(by + 118 + (last._navH || 0) - 4, by + 118 + (last._navH || 0) + tp.y * k + (last._y || 0) - 12); const rb = Math.min(by + bh - 14, by + 118 + (last._navH || 0) + (tp.y + tp.h) * k + (last._y || 0) + 12); place(ring, rx, ry, tp.w * k + 24, Math.max(40, rb - ry)); }
          ring.style.opacity = (rq > 0 ? 1 : 0).toString(); ring.style.transform = 'scale(' + (0.9 + 0.1 * rq).toFixed(3) + ')';
        } else { tap.style.opacity = '0'; ring.style.opacity = '0'; }
      });
    },
  };
})();
