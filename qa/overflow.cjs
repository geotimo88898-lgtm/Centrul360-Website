// Layout overflow sweep for the portal (admin.centrul360.com). Opens every section of every role, the sub-tabs
// (K.seg) and the main drawers, at phone, tablet and desktop widths, dark and light, and lists what spills:
//   spill     a box that sticks out of its grid / flex parent or out of the card it sits in
//   text      text cut by its box (overflow hidden, no ellipsis) or running past its card
//   vclip     text cut at the bottom of a box with a fixed height
//   hscroll   the page scrolls sideways
// Ignored on purpose: horizontal scroll strips (overflow-x auto/scroll), absolute/fixed decorations, a visible
// ellipsis, boxes fully outside their clipping parent (closed carousels, slides).
//
// Run against the local harness (qa/README.md):  node qa/overflow.cjs [--base URL] [--roles admin,manager] [--widths 360,1440]
//   [--tabs panou,angajati] [--themes dark,light] [--out DIR] [--quick]
// Exit code 1 when anything is found; the full list is in DIR/overflow.json.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const flag = (k) => process.argv.includes('--' + k);
const BASE = arg('base', process.env.BASE || 'http://127.0.0.1:8787');
const QUICK = flag('quick'), VERBOSE = flag('verbose');
const WIDTHS = arg('widths', QUICK ? '360,768,1440' : '360,390,430,768,820,1024,1280,1440,1920').split(',').map(Number);
const THEMES = arg('themes', QUICK ? 'dark' : 'dark,light').split(',');
const ROLES = arg('roles', 'admin,manager,receptie,cosmetician').split(',');
const ONLY_TABS = arg('tabs', '') ? arg('tabs').split(',') : null;
const OUT = arg('out', path.join(__dirname, 'out'));
const MAX_STATES = Number(arg('max-states', 40));
// the harness's employees (qa/seed.cjs); override with --ids admin=e-x,manager=e-y
const IDS = Object.assign({ admin: 'e-adm', manager: 'e-mgr', receptie: 'e-rec', cosmetician: 'e-c1' },
  Object.fromEntries((arg('ids', '') || '').split(',').filter(Boolean).map((p) => p.split('='))));
// things that open a drawer or a dialog without changing data
const OPENERS = ['[data-emp]', '[data-lead]', '[data-appt]', '.k-table tbody tr[data-id]', '[data-client]', '[data-new]', '.pf-row [data-pf-open]', '[data-pf-costs]'];

process.env.PORTAL_SECRET = process.env.PORTAL_SECRET || 'dev-secret-only-local';
const auth = require('../api/_lib/auth.js');
const cookieFor = (id, role) => { let h; auth.setSessionCookie({ setHeader: (k, v) => { h = v; }, req: { headers: { host: 'localhost' } } }, id, role, null); return String(h).split(';')[0].split('=').slice(1).join('='); };

// ------------------------------------------------------------------ the check, inside the page
function measure(scope) {
  const out = [];
  const W = innerWidth;
  const de = document.scrollingElement || document.documentElement;
  const memo = new Map();
  const cs = (e) => { let s = memo.get(e); if (!s) { s = getComputedStyle(e); memo.set(e, s); } return s; };
  const scrollX = (e) => /auto|scroll/.test(cs(e).overflowX);
  const clipsX = (e) => /hidden|clip/.test(cs(e).overflowX);
  const clipsY = (e) => /hidden|clip/.test(cs(e).overflowY);
  const transparent = (c) => !c || c === 'transparent' || /rgba\(.*,\s*0\)$/.test(c);
  const visual = (e) => {
    if (e === document.body) return true;
    const s = cs(e);
    if (clipsX(e) || scrollX(e)) return true;
    if (!transparent(s.backgroundColor) || s.backgroundImage !== 'none' || s.boxShadow !== 'none') return true;
    if ((parseFloat(s.borderLeftWidth) > 0 && s.borderLeftStyle !== 'none') || (parseFloat(s.borderRightWidth) > 0 && s.borderRightStyle !== 'none')) return true;
    return false;
  };
  const inner = (e) => { const r = e.getBoundingClientRect(), s = cs(e); return { l: r.left + parseFloat(s.borderLeftWidth), r: r.right - parseFloat(s.borderRightWidth), t: r.top + parseFloat(s.borderTopWidth), b: r.bottom - parseFloat(s.borderBottomWidth) }; };
  const name = (e) => { if (!e || e.nodeType !== 1) return '?'; let s = e.tagName.toLowerCase(); if (e.id) s += '#' + e.id; const c = [...e.classList].filter((x) => !/^(is-|k-stagger|anim|in$|show)/.test(x)).slice(0, 3); if (c.length) s += '.' + c.join('.'); return s; };
  const where = (e) => { const p = []; let x = e; for (let i = 0; x && x !== document.body && i < 5; i++, x = x.parentElement) p.unshift(name(x)); return p.join(' > '); };
  const snippet = (e) => (e.innerText || e.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 70);
  const shown = (e) => e.checkVisibility ? e.checkVisibility({ opacityProperty: true, visibilityProperty: true }) : !!e.offsetParent;
  const ellipsis = (e) => cs(e).textOverflow === 'ellipsis' && clipsX(e);
  const skipTag = /^(SCRIPT|STYLE|LINK|META|BR|WBR|TEMPLATE|NOSCRIPT|OPTION|svg|path|g|circle|rect|line|polyline|polygon|ellipse|text|tspan|defs|use|clipPath|linearGradient|radialGradient|stop|mask|filter|foreignObject|symbol)$/;
  // per element: the nearest box with a visible edge (card, field, chip) and the nearest sideways scroller
  const ctx = new Map();
  const ctxOf = (e) => {
    if (!e || e === document.body || e === document.documentElement) return { v: document.body, sc: null };
    let c = ctx.get(e); if (c) return c;
    const up = ctxOf(e.parentElement);
    c = { v: visual(e) ? e : up.v, sc: scrollX(e) ? e : up.sc, fixed: up.fixed || /fixed|sticky/.test(cs(e).position), strip: up.strip || isStrip(e) };
    ctx.set(e, c); return c;
  };
  // a moving strip (ticker, marquee, carousel track) inside a clipping box is meant to be wider than the box
  const isStrip = (e) => { const p = e.parentElement, s = cs(e); if (!p || !clipsX(p)) return false; return (s.transform !== 'none' || /transform/.test(s.willChange) || (e.getAnimations && e.getAnimations().length > 0)) && e.getBoundingClientRect().width > p.getBoundingClientRect().width + 2; };
  const hits = (a, b) => a.right > b.l + 1 && a.left < b.r - 1 && a.bottom > b.t + 1 && a.top < b.b - 1;
  const roots = scope ? [...document.querySelectorAll(scope)] : [document.body];
  const els = roots.flatMap((r) => [...r.querySelectorAll('*')]);
  for (const el of els) {
    if (!scope && el.closest('.k-drawer-root, .c360-dialog-root')) continue;
    if (skipTag.test(el.tagName) || el.closest('svg, canvas, video, iframe, [aria-hidden="true"].k-skip')) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 3 || r.height < 3) continue;
    const s = cs(el);
    if (s.display === 'contents') continue;
    if (!shown(el)) continue;
    if (s.clip !== 'auto' && s.clip !== '' || s.clipPath !== 'none' && /inset|rect/.test(s.clipPath) && r.width < 4) continue;
    const parent = el.parentElement;
    if (!parent) continue;
    const pc = ctxOf(parent);
    if (pc.strip || ctxOf(el).strip) continue;
    const abs = /absolute|fixed/.test(s.position);
    // 1. a box that sticks out of its grid / flex parent or out of its card
    if (!abs && parent !== document.body && !scrollX(parent)) {
      const pi = inner(parent), ps = cs(parent);
      const lay = /grid|flex/.test(ps.display);
      const overR = r.right - pi.r, overL = pi.l - r.left;
      if (lay && (overR > 2 || overL > 2) && hits(r, pi)) {
        out.push({ kind: 'spill', px: Math.round(Math.max(overR, overL)), el: where(el), in: name(parent), text: snippet(el) });
      } else {
        const V = pc.v;
        if (V && V !== document.body && V !== el && !(pc.sc && V.contains(pc.sc) && pc.sc !== V)) {
          const vi = inner(V), pr = parent.getBoundingClientRect();
          const o2 = Math.max(r.right - vi.r, vi.l - r.left);
          const parentInside = parent === V || (pr.right <= vi.r + 1 && pr.left >= vi.l - 1);
          if (o2 > 2 && parentInside && hits(r, vi)) out.push({ kind: 'spill', px: Math.round(o2), el: where(el), in: name(V), text: snippet(el) });
        }
      }
    }
    // 2. text cut by its own box, or running out of the card
    const tn = [...el.childNodes].filter((n) => n.nodeType === 3 && n.textContent.trim());
    if (tn.length) {
      const ei = inner(el);
      const lim = clipsX(el) ? ei : (pc.v && pc.v !== document.body ? inner(ctxOf(el).v === el ? el : pc.v) : null);
      // a label placed on purpose around a dot or a marker (position absolute) is checked only when its own box clips it
      if (lim && !ellipsis(el) && !(pc.sc && !clipsX(el)) && !(abs && !clipsX(el))) {
        for (const n of tn) {
          const rg = document.createRange(); rg.selectNodeContents(n);
          const tr = rg.getBoundingClientRect();
          if (tr.width < 1) continue;
          const o = Math.max(tr.right - lim.r, lim.l - tr.left);
          if (o > 1.5) { out.push({ kind: 'text', px: Math.round(o), el: where(el), in: clipsX(el) ? 'own box' : name(pc.v), text: n.textContent.trim().slice(0, 70) }); break; }
        }
      }
      // cut at the bottom (a fixed height with overflow hidden), not a line clamp
      if (clipsY(el) && !/\d/.test(s.webkitLineClamp || '') && el.scrollHeight > el.clientHeight + 2 && s.whiteSpace !== 'nowrap' && el.clientHeight > 8)
        out.push({ kind: 'vclip', px: el.scrollHeight - el.clientHeight, el: where(el), in: 'own box', text: snippet(el) });
    }
  }
  if (!scope && de.scrollWidth > W + 1) {
    // who pushes the page wider than the screen
    const wide = [...els].filter((e) => { if (skipTag.test(e.tagName)) return false; const r = e.getBoundingClientRect(); if (r.right <= W + 1 || r.width < 3 || !shown(e)) return false; const c = ctxOf(e.parentElement); return !c.sc && !c.fixed; });
    const top = wide.filter((e) => !wide.includes(e.parentElement)).slice(0, 3).map(where).join(' | ');
    out.push({ kind: 'hscroll', px: de.scrollWidth - W, el: top || 'document', in: 'page', text: '' });
  }
  return out;
}

// ------------------------------------------------------------------ walking the portal
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function settle(page, ms) { await sleep(ms || 500); await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))).catch(() => {}); }
async function setTheme(page, t) { await page.evaluate((t) => { if (t === 'light') document.documentElement.setAttribute('data-theme', 'light'); else document.documentElement.removeAttribute('data-theme'); }, t); }

// The portal lays some screens out in JS when they open (the calendar's phone week, the Panou): each group of widths
// gets its own walk, opened at the group's width, like a real phone, tablet or computer.
const GROUPS = [{ name: 'phone', vp: 390, mobile: true, widths: [] }, { name: 'tablet', vp: 820, mobile: false, widths: [] }, { name: 'desktop', vp: 1440, mobile: false, widths: [] }];
for (const w of WIDTHS) GROUPS[w < 700 ? 0 : w < 1200 ? 1 : 2].widths.push(w);
const vpOf = (w) => ({ width: w, height: w < 700 ? 844 : w < 1200 ? 1100 : 900 });
let G = GROUPS[2];

async function sweepState(page, label, results, shotDir, scope) {
  const t0 = Date.now(), n0 = results.length;
  for (const w of G.widths) {
    if (w !== page.viewportSize().width) { await page.setViewportSize(vpOf(w)); await settle(page, 450); }
    for (const t of THEMES) {
      await setTheme(page, t); await settle(page, 120);
      const found = await page.evaluate(measure, scope || null).catch((e) => [{ kind: 'error', px: 0, el: String(e.message).slice(0, 80), in: '', text: '' }]);
      for (const f of found) results.push(Object.assign({ state: label, width: w, theme: t }, f));
      if (found.length && shotDir && t === THEMES[0]) {
        const fn = (label + '_' + w).replace(/[^\w.-]+/g, '_') + '.png';
        if (!fs.existsSync(path.join(shotDir, fn))) await page.screenshot({ path: path.join(shotDir, fn), fullPage: false }).catch(() => {});
      }
    }
  }
  if (page.viewportSize().width !== G.vp) { await page.setViewportSize(vpOf(G.vp)); await settle(page, 300); }
  await setTheme(page, 'dark');
  if (VERBOSE) console.log('    ' + label + ': ' + (results.length - n0) + ' (' + ((Date.now() - t0) / 1000).toFixed(1) + 's)');
}

async function closeOverlays(page) {
  await page.evaluate(() => {
    document.querySelectorAll('.k-drawer-root [data-k-close]').forEach((b) => { if (b.offsetParent) b.click(); });
    document.querySelectorAll('.c360-dialog-root [data-cancel], .c360-dialog-root .is-cancel').forEach((b) => b.click());
    document.querySelectorAll('.sx-intro').forEach((o) => o.remove());
  }).catch(() => {});
  await page.keyboard.press('Escape').catch(() => {});
  await settle(page, 350);
}

// the sub-tabs visible in the open section: [{seg, v, label}]
const segsIn = (page) => page.evaluate(() => {
  const p = document.querySelector('main > .panel.active') || document.querySelector('.panel.active');
  if (!p) return [];
  return [...p.querySelectorAll('[data-k-seg]')].filter((s) => s.offsetParent && !s.closest('form, .k-drawer-root, .c360-dialog-root'))
    .map((s) => ({ seg: s.dataset.kSeg, on: (s.querySelector('button.is-on') || {}).dataset?.v || '', big: /is-big|tabs/.test(s.className), opts: [...s.querySelectorAll(':scope > button')].map((b) => ({ v: b.dataset.v, label: b.textContent.trim().slice(0, 24) })) }))
    .filter((s) => s.opts.length && s.opts.length <= 9);
});
const clickSeg = (page, seg, v) => page.evaluate(([seg, v]) => {
  const p = document.querySelector('main > .panel.active') || document;
  const b = p.querySelector('[data-k-seg="' + seg + '"] > button[data-v="' + v + '"]');
  if (b) b.click(); return !!b;
}, [seg, v]);

async function openers(page, label, results, shotDir) {
  for (const sel of OPENERS) {
    const ok = await page.evaluate((sel) => {
      const p = document.querySelector('main > .panel.active');
      const el = p && [...p.querySelectorAll(sel)].find((x) => x.offsetParent && !x.closest('form'));
      if (!el) return false; el.click(); return true;
    }, sel);
    if (!ok) continue;
    await settle(page, 1300);
    const open = await page.evaluate(() => !!document.querySelector('.k-drawer-root.is-open, .k-drawer-root .k-drawer.is-open, .c360-dialog-root') || [...document.querySelectorAll('.k-drawer')].some((d) => d.offsetParent && d.getBoundingClientRect().width > 50));
    if (open) await sweepState(page, label + ' + ' + sel, results, shotDir, '.k-drawer-root .k-drawer, .c360-dialog-root');
    await closeOverlays(page);
  }
}

async function sweepRole(browser, role, results, shotDir, tabsIn) {
  const ctx = await browser.newContext({ viewport: vpOf(G.vp), deviceScaleFactor: 1, isMobile: G.mobile, hasTouch: G.mobile || G.name === 'tablet' });
  await ctx.addCookies([{ name: 'c360_portal_session', value: cookieFor(IDS[role], role), domain: new URL(BASE).hostname, path: '/', httpOnly: true, secure: false }]);
  const page = await ctx.newPage();
  page.on('dialog', (d) => d.dismiss().catch(() => {}));
  await page.route(/googletagmanager|facebook\.net|connect\.facebook/, (r) => r.abort());
  await page.goto(BASE + '/#panou', { waitUntil: 'domcontentloaded' });
  await settle(page, 4000);
  await closeOverlays(page);
  const tabs = tabsIn || await page.evaluate(() => [...document.querySelectorAll('#tabsNav button[data-tab]')].map((b, i) => ({ i, tab: b.dataset.tab, route: b.dataset.route || '', label: b.textContent.trim() }))
    .filter((t, i, a) => { const b = document.querySelectorAll('#tabsNav button[data-tab]')[t.i]; return b.offsetParent && !b.classList.contains('hidden') && a.findIndex((x) => x.tab === t.tab && x.route === t.route) === i; }));
  for (const t of G.widths.length ? tabs : []) {
    let states = 0;
    if (ONLY_TABS && !ONLY_TABS.includes(t.tab)) continue;
    const base = role + ' / ' + t.label;
    await page.evaluate((i) => document.querySelectorAll('#tabsNav button[data-tab]')[i].click(), t.i);
    await settle(page, 2200); await closeOverlays(page);
    await sweepState(page, base, results, shotDir); states++;
    await openers(page, base, results, shotDir);
    // the sub-tabs, one level, and the second level under the section's main tabs
    const seen = new Set();
    const walk = async (prefix, depth) => {
      const segs = await segsIn(page);
      for (const s of segs) {
        if (seen.has(s.seg) || states >= MAX_STATES) continue;
        seen.add(s.seg);
        for (const o of s.opts) {
          if (o.v === s.on) continue;
          if (!(await clickSeg(page, s.seg, o.v))) continue;
          await settle(page, 1400); await closeOverlays(page);
          const lab = prefix + ' > ' + o.label;
          await sweepState(page, lab, results, shotDir); states++;
          if (s.big) await openers(page, lab, results, shotDir);
          if (s.big && depth < 2) await walk(lab, depth + 1);
        }
        if (s.on) { await clickSeg(page, s.seg, s.on); await settle(page, 900); }
      }
    };
    await walk(base, 1);
  }
  await ctx.close();
  return tabs;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const shotDir = path.join(OUT, 'shots'); fs.mkdirSync(shotDir, { recursive: true });
  const browser = await chromium.launch();
  const results = [];
  for (const role of ROLES) {
    let tabs = null;
    // desktop first: it lists the sections from the side menu
    for (const g of [GROUPS[2], GROUPS[0], GROUPS[1]]) {
      if (!g.widths.length && tabs) continue;
      G = g; if (g.widths.length) console.log(role + ' (' + g.name + ')');
      try { tabs = await sweepRole(browser, role, results, shotDir, tabs); }
      catch (e) { console.error('  ' + role + ' (' + g.name + ') stopped: ' + String(e.message).split('\n')[0]); results.push({ state: role + ' / (' + g.name + ')', width: 0, theme: '', kind: 'error', px: 0, el: String(e.message).split('\n')[0].slice(0, 120), in: '', text: '' }); }
    }
  }
  await browser.close();
  // one line per problem: the same box (same place, same container), with the pages, widths and themes it shows at
  const groups = new Map();
  for (const r of results) {
    const key = [r.kind, r.el.replace(/\.(active|has-indicator)\b/g, ''), r.in].join(' | ');
    let g = groups.get(key);
    if (!g) groups.set(key, g = { kind: r.kind, el: r.el, in: r.in, text: r.text, px: 0, pages: new Set(), roles: new Set(), widths: new Set(), themes: new Set() });
    g.px = Math.max(g.px, r.px); g.pages.add(r.state.split(' / ').slice(1).join(' / ')); g.roles.add(r.state.split(' / ')[0]); g.widths.add(r.width); g.themes.add(r.theme);
  }
  const list = [...groups.values()].map((g) => ({ ...g, pages: [...g.pages], roles: [...g.roles], widths: [...g.widths].sort((a, b) => a - b), themes: [...g.themes] }))
    .sort((a, b) => a.pages[0].localeCompare(b.pages[0]));
  fs.writeFileSync(path.join(OUT, 'overflow.json'), JSON.stringify({ at: new Date().toISOString(), base: BASE, widths: WIDTHS, themes: THEMES, count: list.length, list }, null, 1));
  for (const g of list) console.log('[' + g.kind + '] ' + g.pages.slice(0, 3).join('; ') + (g.pages.length > 3 ? ' (+' + (g.pages.length - 3) + ')' : '') + ' :: ' + g.el + ' (in ' + g.in + ', ' + g.px + 'px) @' + g.widths.join(',') + ' ' + g.roles.join(',') + (g.text ? ' "' + g.text.slice(0, 50) + '"' : ''));
  console.log(list.length ? list.length + ' overflow problem(s), details in ' + path.join(OUT, 'overflow.json') : 'clean: no overflow');
  process.exit(list.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
