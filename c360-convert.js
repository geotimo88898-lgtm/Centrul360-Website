/* =========================================================================
   c360-convert.js, the treatment pages' "Consultație gratuită" block and the bottom bar on a phone:
   both open the online booking (c360-book.js) on the free consultation.
   Mounted in <div class="cvz-mount" data-titlu="..." data-sub="..."></div>
   ========================================================================= */
(function () {
  'use strict';

  // The treatment pages' "Consultație gratuită" block: the copy stays, the call-back form became the online booking
  // (the owner, 5.11: "direct să programeze"): she picks her clinic and the booking (c360-book.js) opens on the free
  // consultation's free hours.
  function build(mount) {
    var titlu = mount.dataset.titlu || 'Vezi dacă tratamentul e potrivit pentru tine';
    var sub = mount.dataset.sub || 'Consultația e gratuită și fără obligații. Îți spunem sincer dacă nu ești un caz potrivit.';
    var b1 = mount.dataset.b1 || 'Evaluare a zonei și plan personalizat';
    var b2 = mount.dataset.b2 || 'Preț exact, comunicat înainte să începi';
    var b3 = mount.dataset.b3 || 'Fără obligația de a cumpăra ceva';
    var city = function (c, addr) {
      return '<button type="button" class="cvz-bk-city" data-book data-book-service="consult" data-book-city="' + c + '">' +
        '<span><b>' + c + '</b><small>' + addr + '</small></span><i aria-hidden="true">→</i></button>';
    };
    mount.innerHTML =
      '<div class="cvz-capture">' +
        '<div>' +
          '<p class="cvz-eyebrow">Consultație gratuită</p>' +
          '<h3>' + titlu + '</h3>' +
          '<p class="cvz-sub">' + sub + '</p>' +
          '<ul class="cvz-bullets"><li>' + b1 + '</li><li>' + b2 + '</li><li>' + b3 + '</li></ul>' +
        '</div>' +
        '<div class="cvz-form cvz-book">' +
          '<p class="cvz-bk-h">Programează-te online</p>' +
          '<p class="cvz-bk-sub">Alegi clinica, apoi ziua și ora libere din calendar. Durează 30 de secunde.</p>' +
          city('Timișoara', 'Str. Bucegi 7') + city('Arad', 'Str. Ioan Alexandru 16-18') +
          '<p class="cvz-fine">Consultația e gratuită și fără obligații. Confirmarea o primești pe WhatsApp.</p>' +
        '</div>' +
      '</div>';
  }

  /* ---------- bară fixă pe mobil ---------- */
  function bar() {
    if (document.querySelector('.cvz-bar')) return;
    var mount = document.querySelector('.cvz-mount');
    var el = document.createElement('div');
    el.className = 'cvz-bar';
    el.innerHTML =
      '<a class="cvz-bar-a" href="/programare" data-book data-book-service="consult">Programează-te online</a>';
    document.body.appendChild(el);
    if (mount) mount.id = 'cvz-form';
    // one bar at the bottom, not two stacked: this one replaces the page's own booking bar
    var old = document.getElementById('bookbar');
    if (old) old.remove();
    // the booking opens right where the visitor is (c360-book.js), on the free consultation
  }

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('.cvz-mount').forEach(build);
    bar();
  });
})();
