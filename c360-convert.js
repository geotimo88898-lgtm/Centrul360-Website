/* =========================================================================
   c360-convert.js — captare lead pe paginile de tratament
   Trimite în același webhook HighLevel ca quizul de pe prima pagină,
   cu aceeași structură de payload, ca leadurile să intre în același flux.

   Se montează în <div class="cvz-mount" data-interes="..." data-zone="..."></div>
   ========================================================================= */
(function () {
  'use strict';

  var WEBHOOK = "https://services.leadconnectorhq.com/hooks/vusqnbSprML4DKUMJ9QB/webhook-trigger/a5d2d666-96b0-47b9-87ab-f685ecf28e68";
  var WA = { 'Timișoara': '40750204243', 'Arad': '40750263054' };

  function digits(s) { return (s || '').replace(/\D/g, ''); }

  function build(mount) {
    var interes = mount.dataset.interes || 'Consultație';
    var titlu = mount.dataset.titlu || 'Vezi dacă tratamentul e potrivit pentru tine';
    var sub = mount.dataset.sub || 'Consultația e gratuită și fără obligații. Îți spunem sincer dacă nu ești un caz potrivit.';
    var b1 = mount.dataset.b1 || 'Evaluare a zonei și plan personalizat';
    var b2 = mount.dataset.b2 || 'Preț exact, comunicat înainte să începi';
    var b3 = mount.dataset.b3 || 'Fără obligația de a cumpăra ceva';

    mount.innerHTML =
      '<div class="cvz-capture">' +
        '<div>' +
          '<p class="cvz-eyebrow">Consultație gratuită</p>' +
          '<h3>' + titlu + '</h3>' +
          '<p class="cvz-sub">' + sub + '</p>' +
          '<ul class="cvz-bullets"><li>' + b1 + '</li><li>' + b2 + '</li><li>' + b3 + '</li></ul>' +
        '</div>' +
        '<form class="cvz-form" novalidate>' +
          '<input type="text" class="cvz-hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">' +
          '<div class="cvz-field"><label>Nume</label><input type="text" name="nume" autocomplete="name" placeholder="ex: Maria Popescu"></div>' +
          '<div class="cvz-field"><label>Telefon</label><input type="tel" name="telefon" autocomplete="tel" placeholder="ex: 07xx xxx xxx"></div>' +
          '<div class="cvz-field"><label>La ce clinică vii</label>' +
            '<div class="cvz-seg" data-name="oras">' +
              '<button type="button" data-value="Timișoara">Timișoara</button>' +
              '<button type="button" data-value="Arad">Arad</button>' +
            '</div>' +
          '</div>' +
          '<label class="cvz-consent"><input type="checkbox" name="consimtamant_whatsapp"><span>Sunt de acord să fiu contactată telefonic sau pe WhatsApp pentru programare.</span></label>' +
          '<button type="submit" class="cvz-submit">Rezervă consultația gratuită</button>' +
          '<p class="cvz-fine">Îți răspundem în aceeași zi lucrătoare. Datele sunt folosite exclusiv pentru programare.</p>' +
        '</form>' +
      '</div>';

    var form = mount.querySelector('form');
    var seg = mount.querySelector('.cvz-seg');
    var btn = mount.querySelector('.cvz-submit');
    var oras = '';

    seg.querySelectorAll('button').forEach(function (b) {
      b.addEventListener('click', function () {
        seg.querySelectorAll('button').forEach(function (x) { x.classList.remove('sel'); });
        b.classList.add('sel');
        seg.classList.remove('err');
        oras = b.dataset.value;
      });
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (form.querySelector('.cvz-hp').value) return;

      var nume = form.querySelector('[name="nume"]');
      var tel = form.querySelector('[name="telefon"]');
      var cons = form.querySelector('[name="consimtamant_whatsapp"]');
      var ok = true;

      if (!nume.value.trim()) { nume.closest('.cvz-field').classList.add('err'); ok = false; }
      else nume.closest('.cvz-field').classList.remove('err');

      if (digits(tel.value).length < 9) { tel.closest('.cvz-field').classList.add('err'); ok = false; }
      else tel.closest('.cvz-field').classList.remove('err');

      if (!oras) { seg.classList.add('err'); ok = false; }
      if (!cons.checked) { cons.closest('.cvz-consent').classList.add('err'); ok = false; }
      else cons.closest('.cvz-consent').classList.remove('err');

      if (!ok) return;

      btn.disabled = true;
      btn.textContent = 'Se trimite…';

      var payload = {
        nume: nume.value.trim(),
        telefon: tel.value.trim(),
        email: '',
        interes_principal: interes,
        zona: mount.dataset.zone || '',
        oras: oras,
        sursa: 'pagina-tratament',
        consimtamant_whatsapp: true,
        pagina: location.href
      };

      if (window.fbq) { try { fbq('track', 'Lead'); } catch (err) {} }
      if (window.gtag) { try { gtag('event', 'generate_lead', { value: 1 }); } catch (err) {} }

      function done() { window.location.href = 'multumesc-cadou.html'; }

      fetch(WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).then(done).catch(done);
    });
  }

  /* ---------- bară fixă pe mobil ---------- */
  function bar() {
    if (document.querySelector('.cvz-bar')) return;
    var mount = document.querySelector('.cvz-mount');
    var el = document.createElement('div');
    el.className = 'cvz-bar';
    el.innerHTML =
      '<a class="cvz-bar-a" href="#cvz-form">Consultație gratuită</a>' +
      '<a class="cvz-bar-b" href="https://wa.me/' + WA['Timișoara'] + '" target="_blank" rel="noopener">WhatsApp</a>';
    document.body.appendChild(el);
    if (mount) mount.id = 'cvz-form';
  }

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('.cvz-mount').forEach(build);
    bar();
  });
})();
