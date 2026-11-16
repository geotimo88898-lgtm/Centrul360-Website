// Traininguri → „Portalul”: how to use the portal, lesson by lesson, for each role (the owner, 7.11). The lessons
// themselves live in portal-guide-map.js (C360GuideMap.LESSONS, the same map Nuki answers from, 16.11); this file only
// draws them. Every label in „quotes” is the exact text on the screen; each lesson ends with a button that takes her
// to the place itself (K.place, the guide map's places).
//   window.C360Guide.lessons(role) → [lesson] · .html(role, cur, done, icon) → markup · .KEY (what she learned, this device)
(function () {
  'use strict';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const GM = () => window.C360GuideMap;
  function lessons(role) { return GM() ? GM().lessons(role) : []; }
  const KEY = 'c360_guide_done_v1';
  function html(role, cur, done, icon) {
    const list = lessons(role);
    if (!list.length) return '';
    const n = list.filter((x) => done.has(x.id)).length;
    const i = Math.max(0, Math.min(list.length - 1, cur));
    const x = list[i];
    return '<div class="tr-jhead"><div><b>' + n + ' din ' + list.length + '</b><span>lecții învățate</span></div><div class="tr-jbar"><i style="--w:' + Math.round(n / list.length * 100) + '%"></i></div></div>' +
      '<div class="gd-list">' + list.map((l, k) => '<button type="button" class="gd-l' + (done.has(l.id) ? ' is-done' : '') + (k === i ? ' is-cur' : '') + '" data-glesson="' + k + '" style="--i:' + k + '">' +
        '<span class="gd-ic">' + (done.has(l.id) ? icon('check') : icon(l.ic)) + '</span><b>' + esc(l.t) + '</b></button>').join('') + '</div>' +
      '<div class="tr-step gd-step" data-gsheet>' +
        '<div class="tr-step-top"><span class="tr-step-stage">Portalul</span><span class="tr-step-n">Lecția ' + (i + 1) + ' din ' + list.length + '</span></div>' +
        '<h3 class="tr-step-t"><span>' + icon(x.ic) + '</span>' + esc(x.t) + '</h3>' +
        '<div class="tr-whybox"><b>La ce e bun?</b><span>' + esc(x.what) + '</span></div>' +
        '<ul class="tr-dos">' + x.do.map((d, k) => '<li style="--k:' + k + '"><i>' + (k + 1) + '</i>' + esc(d) + '</li>').join('') + '</ul>' +
        (x.know.length ? '<div class="tr-more"><b>' + icon('info') + 'Bine de știut</b><ul>' + x.know.map((m) => '<li>' + esc(m) + '</li>').join('') + '</ul></div>' : '') +
        (x.never ? '<div class="tr-never">' + icon('alert') + '<span>' + esc(x.never) + '</span></div>' : '') +
        '<div class="tr-golinks"><button type="button" class="k-btn is-outline" data-gplace="' + esc(x.place) + '">' + esc(x.goL) + icon('right') + '</button></div>' +
        '<div class="tr-step-nav"><button type="button" class="k-btn is-ghost" data-glesson="' + (i - 1) + '"' + (i ? '' : ' disabled') + '>' + icon('left') + 'Înapoi</button><span class="k-grow"></span>' +
          '<button type="button" class="k-btn is-primary is-lg tr-got" data-gdone="' + i + '">' + (done.has(x.id) ? icon('check') + 'Învățat' : 'Am înțeles') + (i < list.length - 1 ? icon('right') : '') + '</button></div>' +
      '</div>';
  }
  window.C360Guide = { lessons, html, KEY };
})();
