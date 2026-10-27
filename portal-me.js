// Centrul360 portal - "Contul meu" (avatar menu, top right). Everyone manages their own account:
// profile photo, name / phone / email, user + password (confirmed with the current password) and
// preferences that follow the account to every device: accent colour, start page, text size, motion.
// Talks to /api/portal-account. Preferences are also kept on the device (c360_prefs) so portal.html
// applies them before the first paint.
(function () {
  'use strict';
  const K = window.K;
  const { esc, icon } = K;
  const ERR = {
    wrong_password: 'Parola actuală nu e corectă.',
    username_taken: 'Utilizatorul e deja folosit de altcineva.',
    invalid_username: 'Utilizatorul poate avea 3-40 de caractere: litere fără diacritice, cifre, punct, minus sau _. Fără spații.',
    weak_password: 'Parola nouă trebuie să aibă cel puțin 8 caractere.',
    invalid_email: 'Adresa de email nu pare corectă.',
    invalid_name: 'Scrie numele (cel puțin 2 litere).',
    invalid_file: 'Poza nu a putut fi folosită. Încearcă altă poză.',
    admin_login_in_vercel: 'Utilizatorul și parola contului de proprietar se schimbă din Vercel.',
  };
  const errText = (e) => ERR[e && e.code] || K.errText(e);
  const api = (action, body) => K.api('/api/portal-account', Object.assign({ action }, body || {}));

  // ------------------------------------------------------------------ preferences on this device
  function applyPrefs(p) {
    p = p || {};
    const root = document.documentElement;
    if (p.fontSize === 'lg' || p.fontSize === 'xl') root.setAttribute('data-fs', p.fontSize); else root.removeAttribute('data-fs');
    root.classList.toggle('c360-reduce', p.motion === 'reduced');
    try { localStorage.setItem('c360_prefs', JSON.stringify({ fontSize: p.fontSize || 'normal', motion: p.motion || 'normal' })); } catch (e) { /* private mode */ }
    // the accent colour follows the account: a device that still shows another one takes it over
    const A = window.C360Accent;
    if (A && (p.theme === 'light' || p.theme === 'dark') && A.theme() !== p.theme) A.setTheme(p.theme, true);
    if (A && p.accent && (p.accent.a || p.accent.id)) {
      const cur = A.state();
      if (cur.id !== p.accent.id || cur.a !== p.accent.a || (cur.mode === 'grad' && cur.b !== p.accent.b)) {
        const preset = A.PRESETS.find((x) => x.id === p.accent.id);
        A.apply(preset ? { id: preset.id, mode: preset.grad ? 'grad' : 'solid', a: preset.a, b: preset.b } : { id: 'custom', mode: p.accent.mode, a: p.accent.a, b: p.accent.b }, true, true);
      }
    }
  }
  let prefsTimer = 0;
  function savePrefs(patch) {
    const me = K.data && K.data.me;
    if (!me) return;
    me.prefs = Object.assign({}, me.prefs || {}, patch);
    clearTimeout(prefsTimer);
    // the word comes after the save, not before it (offline, or in a preview of someone's account, nothing is saved)
    prefsTimer = setTimeout(() => { api('prefs', { prefs: patch }).then(() => K.ui().toast('Salvat.', 'success')).catch((err) => K.ui().toast(errText(err), 'error')); }, 600);
  }
  // A colour picked anywhere (avatar menu or here) is saved on the account.
  if (window.C360Accent) window.C360Accent.onChange = (st) => savePrefs({ accent: { id: st.id, mode: st.mode, a: st.a, b: st.b || '' } });
  if (window.C360Accent) window.C360Accent.onTheme = (t) => savePrefs({ theme: t });

  // Square profile photo, 480 px, from the centre of whatever was picked / shot.
  async function squarePhoto(file) {
    let src;
    try { src = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
    catch (e) { src = await new Promise((ok, fail) => { const i = new Image(); i.onload = () => ok(i); i.onerror = fail; i.src = URL.createObjectURL(file); }); }
    const w = src.width || src.naturalWidth, h = src.height || src.naturalHeight, side = Math.min(w, h);
    const c = document.createElement('canvas');
    c.width = c.height = 480;
    c.getContext('2d').drawImage(src, (w - side) / 2, (h - side) / 2, side, side, 0, 0, 480, 480);
    return c.toDataURL('image/jpeg', 0.86);
  }

  // ------------------------------------------------------------------ the drawer
  function open() {
    const d = K.drawer({ title: 'Contul meu', icon: 'user', width: 560, body: '<div class="k-skel" style="height:280px"></div>', focus: false });
    let acc = null;
    api('get').then((j) => { acc = j.account; paint(); }).catch((e) => d.set({ body: K.empty('alert', 'Nu am putut deschide contul', errText(e)) }));

    function startOptions() {
      const seen = new Set();
      const opts = [['', 'Panou (implicit)']];
      document.querySelectorAll('#tabsNav button[data-tab]:not(.hidden)').forEach((b) => {
        const id = b.dataset.tab;
        if (!id || id === 'creative' || id === 'panou' || seen.has(id)) return;
        seen.add(id);
        const label = (b.querySelector('.c360-nav-label') || b).textContent.replace(/\s+/g, ' ').trim().replace(/\d+$/, '').trim();
        opts.push([id, label]);
      });
      return opts;
    }
    function heroHtml() {
      const role = K.roleLabel ? K.roleLabel(acc.role) : acc.role;
      return '<section class="me-hero">' +
        '<div class="me-photo">' + (acc.photo ? '<img src="' + esc(acc.photo) + '" alt="Poza de profil">' : K.avatar(acc.name || '?', 92)) + '</div>' +
        '<div class="me-id"><b>' + esc(acc.name) + '</b><span>' + esc(role) + (acc.location && acc.location !== '-' ? ' · ' + esc(acc.location) : '') + '</span>' +
          (acc.username ? '<small>' + icon('user') + 'Utilizator: <b>' + esc(acc.username) + '</b></small>' : '') +
          '<div class="me-photo-btns"><label class="k-btn is-sm is-outline"><input type="file" accept="image/*" data-photo hidden>' + icon('image') + (acc.photo ? 'Schimbă poza' : 'Pune o poză') + '</label>' +
          (acc.photo ? '<button type="button" class="k-btn is-sm is-danger" data-photo-del>' + icon('trash') + 'Șterge poza</button>' : '') + '</div>' +
        '</div></section>';
    }
    function paint() {
      const p = acc.prefs || {};
      const pwField = (name, label, ac) => K.field(label, '<div class="me-pw"><input name="' + name + '" type="password" autocomplete="' + ac + '" minlength="' + (name === 'currentPassword' ? 1 : 8) + '"><button type="button" class="k-icon-btn" data-showpw title="Arată parola" aria-label="Arată parola">' + icon('eye') + '</button></div>', 'full');
      d.set({
        title: 'Contul meu', lead: acc.photo ? '<span class="k-avatar has-photo" style="--s:42px"><img src="' + esc(acc.photo) + '" alt=""></span>' : K.avatar(acc.name || '?', 42), icon: '',
        body: heroHtml() +
          '<section class="k-section"><h4>' + icon('pen') + 'Date personale</h4><form class="k-form" data-profile>' +
            K.field('Numele afișat', '<input name="name" maxlength="100" required value="' + esc(acc.name) + '">', 'full', 'Așa apari în calendar, la încasări și în echipă.') +
            K.field('Telefon', '<input name="phone" type="tel" maxlength="30" value="' + esc(acc.phone) + '" placeholder="07xx xxx xxx">') +
            K.field('Email', '<input name="email" type="email" maxlength="120" value="' + esc(acc.email) + '" placeholder="nume@exemplu.ro">') +
          '</form><div class="k-form-actions"><button type="button" class="k-btn is-primary" data-save-profile>' + icon('check') + 'Salvează datele</button></div></section>' +
          '<section class="k-section"><h4>' + icon('shield') + 'Conectare</h4>' +
          (acc.canChangeLogin ?
            '<form class="k-form" data-user autocomplete="off">' + K.field('Utilizator nou', '<input name="username" autocomplete="username" maxlength="40" value="' + esc(acc.username) + '">', 'full', 'Fără spații și fără diacritice. Cu el te conectezi de acum.') +
              '<div class="full" data-user-pw hidden>' + pwField('currentPassword', 'Parola ta actuală (ca să confirmi)', 'current-password') + '</div></form>' +
              '<div class="k-form-actions"><button type="button" class="k-btn is-outline" data-save-user>' + icon('user') + 'Schimbă utilizatorul</button></div>' +
            '<div class="me-sep"></div>' +
            '<form class="k-form" data-pass autocomplete="off">' + pwField('currentPassword', 'Parola actuală', 'current-password') +
              pwField('newPassword', 'Parola nouă (cel puțin 8 caractere)', 'new-password') + pwField('confirm', 'Scrie din nou parola nouă', 'new-password') +
              '<div class="me-strength full" data-strength hidden><i></i><span></span></div></form>' +
              '<div class="k-form-actions"><button type="button" class="k-btn is-outline" data-save-pass>' + icon('shield') + 'Schimbă parola</button></div>'
            : '<p class="ct-hint">' + icon('info') + 'Utilizatorul și parola contului de proprietar se schimbă din Vercel (setările proiectului), ca să nu te poți bloca singur pe dinafară.</p>') +
          '</section>' +
          '<section class="k-section"><h4>' + icon('sparkles') + 'Preferințe</h4>' +
            '<div class="me-pref"><span>Culoarea portalului</span>' + (window.C360Accent ? window.C360Accent.menuHtml() : '') + '</div>' +
            '<div class="me-pref"><span>Pagina de start</span><select data-start>' + K.options(startOptions(), p.startPage || '') + '</select><small>Ce se deschide când intri în portal.</small></div>' +
            '<div class="me-pref"><span>Mărimea textului</span>' + K.seg('mefs', [['normal', 'Normal'], ['lg', 'Mare'], ['xl', 'Foarte mare']], p.fontSize || 'normal', 'is-big') + '</div>' +
            '<div class="me-pref"><span>Animații</span>' + K.seg('memotion', [['normal', 'Normale'], ['reduced', 'Reduse']], p.motion || 'normal', 'is-big') + '<small>„Reduse” face portalul mai liniștit și mai rapid pe telefoane mai vechi.</small></div>' +
          '</section>',
        footer: '<button type="button" class="k-btn is-danger is-sm" data-logout>' + icon('power') + 'Deconectare</button><span class="k-grow"></span><button type="button" class="k-btn" data-k-close2>Închide</button>',
        onMount(el) {
          const body = el.querySelector('.k-dbody');
          if (window.C360Accent) window.C360Accent.wire(body);
          el.querySelector('[data-k-close2]').addEventListener('click', () => d.close());
          el.querySelector('[data-logout]').addEventListener('click', () => { d.close(); fetch('/api/portal-logout', { method: 'POST' }).finally(() => { location.href = '/login'; }); });
          body.addEventListener('change', onChange);
          body.addEventListener('click', onClick);
          body.addEventListener('input', onInput);
        },
      });
    }
    // after a change: the header, the avatars and the owner's Echipa follow
    const refresh = (j) => { acc = j.account; paint(); if (K.reload) K.reload(); };

    async function onChange(e) {
      const t = e.target;
      if (t.matches('[data-photo]') && t.files && t.files[0]) {
        const lab = t.closest('label');
        lab.classList.add('is-busy');
        try { refresh(await api('photo_set', { dataUrl: await squarePhoto(t.files[0]) })); K.ui().toast('Poza de profil a fost salvată.', 'success'); }
        catch (err) { lab.classList.remove('is-busy'); K.ui().toast(errText(err), 'error'); }
        return;
      }
      if (t.matches('[data-start]')) { savePrefs({ startPage: t.value }); acc.prefs = Object.assign({}, acc.prefs, { startPage: t.value });  return; }
      if (t.name === 'mefs') { const p = Object.assign({}, acc.prefs, { fontSize: t.value }); acc.prefs = p; applyPrefs(p); savePrefs({ fontSize: t.value }); return; }
      if (t.name === 'memotion') { const p = Object.assign({}, acc.prefs, { motion: t.value }); acc.prefs = p; applyPrefs(p); savePrefs({ motion: t.value }); }
    }
    function onInput(e) {
      // the username form asks for the password only once the username is really changed
      if (e.target.name === 'username') { const pw = e.target.closest('form').querySelector('[data-user-pw]'); if (pw) pw.hidden = e.target.value.trim().toLowerCase() === String(acc.username || '').toLowerCase(); return; }
      if (e.target.name !== 'newPassword') return;
      const v = e.target.value, box = e.target.closest('form').querySelector('[data-strength]');
      const score = (v.length >= 8) + (v.length >= 12) + (/[A-Z]/.test(v) && /[a-z]/.test(v)) + /\d/.test(v) + /[^\w]/.test(v);
      const lvl = v.length < 8 ? 0 : score <= 2 ? 1 : score <= 3 ? 2 : 3;
      box.hidden = !v;
      box.dataset.lvl = lvl;
      box.querySelector('span').textContent = ['Prea scurtă', 'Acceptabilă', 'Bună', 'Foarte bună'][lvl];
    }
    async function onClick(e) {
      const t = e.target;
      const sp = t.closest('[data-showpw]');
      if (sp) { const inp = sp.parentElement.querySelector('input'); inp.type = inp.type === 'password' ? 'text' : 'password'; sp.classList.toggle('is-on', inp.type === 'text'); return; }
      if (t.closest('[data-photo-del]')) {
        if (!(await K.ui().confirm({ title: 'Ștergi poza de profil?', message: 'În locul ei apar din nou inițialele.', confirmText: 'Șterge', danger: true }))) return;
        try { refresh(await api('photo_delete')); } catch (err) { K.ui().toast(errText(err), 'error'); }
        return;
      }
      const b = t.closest('[data-save-profile], [data-save-user], [data-save-pass]');
      if (!b) return;
      await K.busy(b, async () => {
        try {
          if (b.matches('[data-save-profile]')) {
            refresh(await api('profile', K.formValues(d.el.querySelector('[data-profile]'))));
            K.ui().toast('Datele au fost salvate.', 'success');
          } else if (b.matches('[data-save-user]')) {
            const v = K.formValues(d.el.querySelector('[data-user]'));
            if (!v.currentPassword) { K.ui().toast('Scrie parola actuală ca să confirmi.', 'error'); return; }
            refresh(await api('username', v));
            K.ui().toast('Gata. De acum te conectezi cu utilizatorul ' + acc.username + '.', 'success');
          } else {
            const v = K.formValues(d.el.querySelector('[data-pass]'));
            if (v.newPassword.length < 8) { K.ui().toast(ERR.weak_password, 'error'); return; }
            if (v.newPassword !== v.confirm) { K.ui().toast('Cele două parole noi nu sunt la fel.', 'error'); return; }
            refresh(await api('password', { currentPassword: v.currentPassword, newPassword: v.newPassword }));
            K.ui().toast('Parola a fost schimbată.', 'success');
          }
        } catch (err) { K.ui().toast(errText(err), 'error'); }
      });
    }
  }

  K.openAccount = open;
  K.applyPrefs = applyPrefs;
})();
