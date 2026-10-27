// Centrul360 portal, the owners' layer (pairs with portal-delight.css): the moments worth a smile. Money in, a
// booking, a new lead (what portal-notif.js just received, K 'notif:fresh') throw a short burst of confetti from the
// bell and make it pulse; the Panou's pieces rise one after the other on the first paint of a visit. CSS does the
// moving (transforms and opacity only); this file only places the pieces. Nothing runs for the staff's accounts, nor
// for someone who asked for less motion.
(function () {
  'use strict';
  const K = window.K;
  if (!K) return;
  const calm = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const admin = () => document.documentElement.classList.contains('c360-admin');
  const COLORS = ['var(--accent)', 'var(--accent-2, #b9a8ff)', 'var(--accent-3, #6f63e0)', '#ffd166', '#06d6a0', '#ff6b70'];
  let last = 0;

  // a burst of 26 pieces from a point (the bell, or the middle of the screen), gone in a second
  function confetti(x, y) {
    if (calm() || !admin() || document.hidden) return;
    const now = Date.now();
    if (now - last < 1500) return; // one burst at a time
    last = now;
    const host = document.createElement('div');
    host.className = 'c360-confetti';
    host.style.transform = 'translate(' + Math.round(x) + 'px,' + Math.round(y) + 'px)';
    let html = '';
    for (let i = 0; i < 26; i++) {
      const a = (Math.PI * (0.15 + 0.7 * Math.random())) + Math.PI, r = 90 + Math.random() * 150; // upwards, a fan
      html += '<i style="--x:' + Math.round(Math.cos(a) * r) + 'px;--y:' + Math.round(Math.sin(a) * r) + 'px;--c:' + COLORS[i % COLORS.length] + ';--t:' + (0.8 + Math.random() * 0.5).toFixed(2) + 's;--d:' + (Math.random() * 0.12).toFixed(2) + 's"></i>';
    }
    host.innerHTML = html;
    document.body.appendChild(host);
    setTimeout(() => host.remove(), 1700);
  }
  function cheer() {
    const bell = document.querySelector('.c360-bell');
    const r = bell && bell.getBoundingClientRect();
    confetti(r ? r.left + r.width / 2 : window.innerWidth / 2, r ? r.top + r.height / 2 : 80);
    if (bell) { bell.classList.remove('is-cheer'); void bell.offsetWidth; bell.classList.add('is-cheer'); setTimeout(() => bell.classList.remove('is-cheer'), 1000); }
  }
  // what just arrived: money, a booking, a lead (the bell's live list, portal-notif.js)
  K.on('notif:fresh', (list) => {
    if (!Array.isArray(list)) return;
    if (list.some((n) => ['money', 'booking', 'lead'].includes(n.kind) || (n.kind === 'alert' && n.tone === 'good'))) cheer();
  });
  // the day's first payment recorded from this very screen is a moment too
  K.on('sale:recorded', () => cheer());

  // the Panou's pieces rise one after the other the first time it is painted in this visit
  let risen = false;
  K.on('section', (id) => {
    if (id !== 'panou' || risen || !admin()) return;
    risen = true;
    const p = document.getElementById('panel-panou');
    if (p) { p.classList.add('c360-stagger'); setTimeout(() => p.classList.remove('c360-stagger'), 1500); }
  });
})();
