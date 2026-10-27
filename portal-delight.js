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

  // Game Mode (avatar menu → switch): the game's code and styles load only when it is switched on; it stays on
  // across visits until switched off
  let gameLoading = null;
  const loadGame = () => gameLoading || (gameLoading = new Promise((ok, no) => {
    if (window.C360Game) { ok(); return; }
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = '/portal-game.css'; document.head.appendChild(l);
    const s = document.createElement('script'); s.src = '/portal-game.js'; s.onload = () => ok(); s.onerror = () => { gameLoading = null; no(new Error('game_load')); };
    document.head.appendChild(s);
  }));
  const gameOn = () => { try { return localStorage.getItem('c360_game') === '1'; } catch (e) { return false; } };
  // the game's sound has to be woken inside the tap itself (iPhone): the audio session plays even on silent, the
  // Web Audio context opens now (the game uses it), and a silent loop keeps the media channel open
  let silent = null;
  function audio() {
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* older Safari */ }
    try {
      const C = window.AudioContext || window.webkitAudioContext;
      if (C && !window.__gmAudio) window.__gmAudio = new C();
      const ctx = window.__gmAudio;
      if (ctx) {
        if (ctx.state !== 'running') ctx.resume().catch(() => {});
        const b = ctx.createBuffer(1, 1, 22050), s = ctx.createBufferSource();
        s.buffer = b; s.connect(ctx.destination); s.start(0);
      }
    } catch (e) { /* no Web Audio */ }
    try {
      if (!silent) { silent = new Audio('/game/sfx/silence.mp3'); silent.loop = true; silent.setAttribute('playsinline', ''); silent.volume = 0.01; }
      const p = silent.play(); if (p && p.catch) p.catch(() => {});
    } catch (e) { /* no media element */ }
  }
  window.C360GameBoot = {
    isOn: () => !!(window.C360Game && window.C360Game.isOpen()) || gameOn(),
    audio,
    audioOff() { try { if (silent) silent.pause(); } catch (e) { /* gone */ } },
    async toggle() {
      if (!admin()) return;
      if (!(window.C360Game && window.C360Game.isOpen())) audio();
      try { await loadGame(); } catch (e) { if (K.ui) K.ui().toast('Jocul nu s-a putut încărca. Încearcă din nou.', 'error'); return; }
      window.C360Game.toggle();
    },
  };
  let gameBooted = false;
  K.on('data', () => {
    if (gameBooted) return;
    gameBooted = true;
    if (admin() && gameOn()) loadGame().then(() => window.C360Game.enter(true)).catch(() => {});
  });

  // the Panou's pieces rise one after the other the first time it is painted in this visit
  let risen = false;
  K.on('section', (id) => {
    if (id !== 'panou' || risen || !admin()) return;
    risen = true;
    const p = document.getElementById('panel-panou');
    if (p) { p.classList.add('c360-stagger'); setTimeout(() => p.classList.remove('c360-stagger'), 1500); }
  });
})();
