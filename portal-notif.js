// Centrul360 portal - notifications for the team (the bell, top right). One short line for every
// decision about them (a request approved or rejected, whatever its kind: leave, overtime day,
// commission; overtime paid) and live bonus reminders (reached, or close, with the days left).
// They come with /api/portal-data (data.notifications); what was already seen is remembered on
// this device (stored ones by time, live bonus ones by id).
(function () {
  'use strict';
  const K = window.K;
  const { esc, icon } = K;
  const IC = { leave: 'calendar', time: 'clock', commission: 'percent', paid: 'wallet', bonus: 'trophy' };
  let btn = null;

  const key = () => 'c360_notif_' + ((K.data && K.data.me && K.data.me.id) || '');
  function seen() { try { return Object.assign({ at: '', ids: [] }, JSON.parse(localStorage.getItem(key()) || '{}')); } catch (e) { return { at: '', ids: [] }; } }
  function markAll(list) {
    const s = { at: new Date().toISOString(), ids: list.filter((n) => n.live).map((n) => n.id).slice(0, 100) };
    try { localStorage.setItem(key(), JSON.stringify(s)); } catch (e) { /* private mode */ }
  }
  const items = () => (K.data && K.data.notifications) || [];
  const isNew = (n, s) => (n.live ? !s.ids.includes(n.id) : String(n.at) > s.at);
  const unread = () => { const s = seen(); return items().filter((n) => isNew(n, s)).length; };

  function mountBell() {
    if (btn || !K.data || K.data.isAdmin) return;
    const right = document.querySelector('header.topbar > div:last-child');
    if (!right) return;
    btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'c360-bell';
    btn.setAttribute('aria-label', 'Notificări');
    btn.innerHTML = icon('bell') + '<span class="c360-bell-n" hidden></span>';
    const search = right.querySelector('.c360-search-btn');
    right.insertBefore(btn, search ? search.nextSibling : right.firstChild);
    btn.addEventListener('click', open);
  }
  function paintBadge() {
    if (!btn) return;
    const n = unread(), b = btn.querySelector('.c360-bell-n');
    b.hidden = !n; b.textContent = n > 9 ? '9+' : String(n);
    btn.classList.toggle('has-new', !!n);
    btn.setAttribute('aria-label', n ? 'Notificări, ' + n + ' noi' : 'Notificări');
  }

  function open() {
    const list = items(), s = seen();
    const row = (n) => '<button type="button" class="nt-item is-' + esc(n.tone || 'info') + (isNew(n, s) ? ' is-new' : '') + '"' + (n.go ? ' data-go-to="' + esc(n.go) + '"' : '') + '>' +
      '<span class="nt-ic">' + icon(IC[n.kind] || 'bell') + '</span>' +
      '<span class="nt-body"><b>' + esc(n.title) + '</b>' + (n.text ? '<span>' + esc(n.text) + '</span>' : '') + '<small>' + (n.live ? 'luna aceasta' : esc(K.ago(n.at))) + '</small></span></button>';
    const live = list.filter((n) => n.live), past = list.filter((n) => !n.live);
    const d = K.drawer({
      title: 'Notificări', icon: 'bell', width: 460,
      subtitle: 'Cererile tale și bonusurile, pe scurt.',
      body: (list.length ? (live.length ? '<h4 class="nt-h">' + icon('trophy') + 'Bonusuri</h4><div class="nt-list">' + live.map(row).join('') + '</div>' : '') +
          (past.length ? '<h4 class="nt-h">' + icon('bell') + 'Răspunsuri la cereri</h4><div class="nt-list">' + past.map(row).join('') + '</div>' : '')
        : K.empty('bell', 'Nicio notificare', 'Aici apar răspunsurile la cererile tale și cât mai ai până la bonusuri.')),
      onMount(el) {
        el.querySelector('.k-dbody').addEventListener('click', (e) => {
          const go = e.target.closest('[data-go-to]');
          if (go) { d.close(); K.go(go.dataset.goTo); }
        });
      },
    });
    markAll(list);
    paintBadge();
  }

  K.on('data', () => { mountBell(); paintBadge(); });
  K.openNotifications = open;
})();
