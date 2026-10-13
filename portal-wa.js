// Centrul360 portal - WhatsApp for the admin: the template editor (like HighLevel: name, category,
// header, message with {prenume} {data}…, footer, buttons, a live WhatsApp preview) and the window
// that connects a number (Timișoara / Arad). Used by Automatizări (Șabloane WhatsApp, the WhatsApp
// step of a flow) and Integrări (WhatsApp). Data: /api/portal-wa (tokens never come back here).
(function () {
  'use strict';
  const K = window.K;
  const { esc, icon } = K;
  const W = { d: null, p: null };

  const STATUS = {
    DRAFT: ['Ciornă', ''], PENDING: ['În verificare la Meta', 'info'], APPROVED: ['Aprobat', 'good'], REJECTED: ['Respins', 'bad'],
    PAUSED: ['Pus pe pauză de Meta', 'warn'], DISABLED: ['Dezactivat de Meta', 'bad'], DELETED: ['Șters din Meta', 'bad'],
  };
  const CAT = { UTILITY: 'Utilitate · confirmări, remindere, informații', MARKETING: 'Marketing · oferte, reveniri, promoții' };
  const VLABEL = { prenume: 'Prenume', nume: 'Nume complet', telefon: 'Telefon', procedura: 'Procedura (din formular)', interes: 'Interesul', tratament: 'Tratamentul',
    locatie: 'Orașul', adresa: 'Adresa clinicii', zi: 'Zi (azi / mâine / joi)', data: 'Data', ora: 'Ora', link_recenzie: 'Link recenzie' };
  const BTN = { QUICK_REPLY: 'Răspuns rapid', URL: 'Link', PHONE_NUMBER: 'Apel' };

  async function load(force) {
    if (!W.p || force) W.p = K.api('/api/portal-wa').then((d) => { W.d = d; return d; }).catch((e) => { W.p = null; throw e; });
    return W.p;
  }
  async function post(body) {
    const d = await K.api('/api/portal-wa', body);
    W.d = d; W.p = Promise.resolve(d);
    K.emit('wa', d);
    return d;
  }
  const tag = (status) => { const s = STATUS[status] || [status || '', '']; return '<span class="k-tag' + (s[1] ? ' is-' + s[1] : '') + '">' + esc(s[0]) + '</span>'; };
  // "Timișoara: Aprobat · Arad: În verificare", or one word when both say the same
  function cityTags(t) {
    const c = t.cities || {};
    const on = Object.keys(c).filter((k) => c[k]);
    if (!on.length) return tag(t.status);
    const same = on.every((k) => c[k] === c[on[0]]);
    return same ? tag(c[on[0]]) : on.map((k) => '<span class="wa-city">' + esc(k) + '</span>' + tag(c[k])).join(' ');
  }

  // the message as the client sees it, with example values
  function bubble(t, sample) {
    const v = sample || (W.d && W.d.sample) || {};
    const fill = (s) => esc(String(s || '')).replace(/\{(\w+)\}/g, (m, k) => (k in v ? '<mark>' + esc(v[k]) + '</mark>' : '<mark class="is-bad">' + m + '</mark>')).replace(/\{\{(\d+)\}\}/g, '<mark class="is-bad">{{$1}}</mark>');
    return '<div class="wa-phone"><div class="wa-bubble">' +
      (t.header ? '<b class="wa-h">' + esc(t.header) + '</b>' : '') +
      '<div class="wa-b">' + (fill(t.text || t.body) || '<span class="k-muted">Mesajul…</span>') + '</div>' +
      (t.footer ? '<small class="wa-f">' + esc(t.footer) + '</small>' : '') +
      '<span class="wa-time">11:02</span></div>' +
      ((t.buttons || []).length ? '<div class="wa-btns">' + t.buttons.map((b) => '<span>' + icon(b.type === 'URL' ? 'link' : b.type === 'PHONE_NUMBER' ? 'phone' : 'chat') + esc(b.text || BTN[b.type]) + '</span>').join('') + '</div>' : '') +
      '</div>';
  }

  // ------------------------------------------------------------------ the template editor
  // opts.onSaved(id, data): after a save (the builder selects the new template)
  async function edit(tpl, opts) {
    const o = opts || {};
    let d;
    try { d = await load(); } catch (e) { K.ui().toast(K.errText(e), 'error'); return; }
    const t = tpl ? JSON.parse(JSON.stringify(tpl)) : { label: '', category: 'UTILITY', header: '', text: 'Bună, {prenume}! ', footer: '', buttons: [], map: [], editable: true, status: 'DRAFT' };
    const canEdit = t.editable !== false;
    const vars = d.vars || Object.keys(VLABEL);
    const chips = '<div class="au-vars-chips wa-chips">' + vars.map((k) => '<button type="button" data-var="{' + k + '}" title="' + esc(VLABEL[k] || k) + '">{' + k + '}</button>').join('') + '</div>';
    const btnRow = (b, i) => '<div class="wa-btn-row" data-bi="' + i + '"><select data-bf="type">' + K.options(Object.keys(BTN).map((k) => [k, BTN[k]]), b.type) + '</select>' +
      '<input data-bf="text" maxlength="25" placeholder="Textul butonului" value="' + esc(b.text || '') + '">' +
      (b.type === 'URL' ? '<input data-bf="url" placeholder="https://…" value="' + esc(b.url || '') + '">' : b.type === 'PHONE_NUMBER' ? '<input data-bf="phone" placeholder="+40750204243" value="' + esc(b.phone || '') + '">' : '') +
      '<button type="button" class="k-icon-btn" data-brm="' + i + '" aria-label="Scoate butonul">' + icon('x') + '</button></div>';
    const formHtml = () => (canEdit
      ? '<div class="k-form wa-form">' +
          K.field('Numele șablonului', '<input data-tf="label" maxlength="80" placeholder="ex. Confirmare programare" value="' + esc(t.label) + '">', 'full', 'Pentru tine. Meta primește un nume fără diacritice, ex. confirmare_programare.') +
          K.field('Categoria', '<select data-tf="category">' + K.options(Object.keys(CAT).map((k) => [k, CAT[k]]), t.category) + '</select>', 'full', 'Utilitate: confirmări și remindere (se aprobă mai ușor, costă mai puțin). Marketing: orice ofertă sau invitație.') +
          K.field('Antet (opțional)', '<input data-tf="header" maxlength="60" placeholder="ex. Programarea ta la Centrul360" value="' + esc(t.header || '') + '">', 'full') +
          K.field('Mesajul', '<textarea data-tf="text" rows="7" maxlength="1024" placeholder="Bună, {prenume}! …">' + esc(t.text || '') + '</textarea>', 'full', 'Variabilele se completează singure pentru fiecare clientă. Mesajul nu poate începe sau se termina cu o variabilă.') +
          chips +
          K.field('Subsol (opțional)', '<input data-tf="footer" maxlength="60" placeholder="ex. Centrul360 · Timișoara & Arad" value="' + esc(t.footer || '') + '">', 'full') +
          '<div class="k-field full"><span>Butoane (opțional)</span><div data-btns>' + (t.buttons || []).map(btnRow).join('') + '</div>' +
            ((t.buttons || []).length < 5 ? '<button type="button" class="k-btn is-ghost is-sm" data-badd>' + icon('plus') + 'Adaugă un buton</button>' : '') + '</div>' +
        '</div>'
      : '<div class="wa-locked">' + icon('info') + '<span>Șablonul e trimis la Meta: textul nu se mai schimbă (fă o copie dacă vrei altul). Poți schimba numele și ce variabilă completează fiecare loc.</span></div>' +
        '<div class="k-form wa-form">' + K.field('Numele șablonului', '<input data-tf="label" maxlength="80" value="' + esc(t.label) + '">', 'full') +
          ((t.map || []).length ? '<div class="k-field full"><span>Variabilele</span>' + t.map.map((k, i) => '<label class="wa-map"><b>{{' + (i + 1) + '}}</b><select data-map="' + i + '">' + K.options([['', 'Alege…']].concat(vars.map((x) => [x, VLABEL[x] || x])), k) + '</select></label>').join('') + '</div>' : '') +
        '</div>');
    const ready = d.ready;
    const dr = K.drawer({
      title: tpl ? 'Șablon: ' + (t.label || '') : 'Șablon WhatsApp nou', icon: 'chat', width: 760,
      subtitle: canEdit ? 'Scrie-l ca pe un mesaj obișnuit. Meta îl verifică o singură dată, apoi pleacă singur din automatizări.' : 'Trimis la Meta · ' + (STATUS[t.status] || [t.status])[0],
      body: '<div class="wa-edit"><div data-wform>' + formHtml() + '</div><aside class="wa-side"><small>Așa îl primește clienta</small><div data-wprev>' + bubble(t) + '</div>' +
        (t.reason ? '<p class="wa-reason">' + icon('alert') + 'Meta: ' + esc(t.reason) + '</p>' : '') +
        (!ready && canEdit ? '<p class="k-muted wa-note">' + icon('info') + 'WhatsApp nu e conectat încă: îl salvezi ca ciornă și îl trimiți la aprobare după ce conectezi numerele (Integrări → WhatsApp).</p>' : '') + '</aside></div>',
      footer: '<span class="k-grow"></span><button type="button" class="k-btn" data-cancel>Renunță</button>' +
        '<button type="button" class="k-btn' + (ready && canEdit ? '' : ' is-primary') + '" data-save>' + icon('check') + (canEdit ? 'Salvează ciorna' : 'Salvează') + '</button>' +
        (ready && canEdit ? '<button type="button" class="k-btn is-primary" data-send>' + icon('zap') + 'Salvează și trimite la aprobare</button>' : ''),
      onMount(el) {
        let last = null;
        const prev = () => { el.querySelector('[data-wprev]').innerHTML = bubble(t); };
        const repaint = () => { el.querySelector('[data-wform]').innerHTML = formHtml(); prev(); };
        el.addEventListener('focusin', (e) => { if (e.target.matches('[data-tf="text"]')) last = e.target; });
        el.addEventListener('input', (e) => {
          const f = e.target;
          if (f.dataset.tf) { t[f.dataset.tf] = f.value; prev(); }
          const row = f.closest('[data-bi]');
          if (row && f.dataset.bf) { t.buttons[Number(row.dataset.bi)][f.dataset.bf] = f.value; if (f.dataset.bf === 'type') repaint(); else prev(); }
        });
        el.addEventListener('change', (e) => {
          const f = e.target;
          if (f.dataset.tf === 'category') t.category = f.value;
          if (f.dataset.map != null) t.map[Number(f.dataset.map)] = f.value;
          const row = f.closest('[data-bi]');
          if (row && f.dataset.bf === 'type') { t.buttons[Number(row.dataset.bi)].type = f.value; repaint(); }
        });
        el.addEventListener('click', (e) => {
          const vb = e.target.closest('[data-var]');
          if (vb) {
            const ta = last && last.isConnected ? last : el.querySelector('[data-tf="text"]');
            if (!ta) return;
            const a = ta.selectionStart != null ? ta.selectionStart : ta.value.length;
            ta.value = ta.value.slice(0, a) + vb.dataset.var + ta.value.slice(ta.selectionEnd != null ? ta.selectionEnd : a);
            ta.focus(); ta.selectionStart = ta.selectionEnd = a + vb.dataset.var.length;
            t.text = ta.value; prev();
            return;
          }
          if (e.target.closest('[data-badd]')) { t.buttons = (t.buttons || []).concat([{ type: 'QUICK_REPLY', text: '' }]); return repaint(); }
          const rm = e.target.closest('[data-brm]'); if (rm) { t.buttons.splice(Number(rm.dataset.brm), 1); return repaint(); }
          if (e.target.closest('[data-cancel]')) dr.close();
        });
        const saveIt = (submit) => async (ev) => K.busy(ev.currentTarget, async () => {
          try {
            const r = await post({ action: 'tpl_save', submit, template: { id: tpl && tpl.id, label: t.label, category: t.category, header: t.header, body: t.text, footer: t.footer, buttons: t.buttons, map: t.map } });
            dr.close();
            if (r.submitError) K.ui().toast('Salvat, dar Meta: ' + r.submitError, 'error');
            else K.ui().toast(submit ? 'Trimis la Meta. Vezi starea în Șabloane WhatsApp (de obicei câteva minute).' : 'Salvat.', 'success');
            if (o.onSaved) o.onSaved(r.savedId, r);
          } catch (err) { K.ui().toast(err.data && err.data.message ? err.data.message : K.errText(err), 'error'); }
        });
        el.querySelector('[data-save]').addEventListener('click', saveIt(false));
        const send = el.querySelector('[data-send]'); if (send) send.addEventListener('click', saveIt(true));
      },
    });
    return dr;
  }

  // ------------------------------------------------------------------ connect a number
  async function connect(city, opts) {
    const o = opts || {};
    let d;
    try { d = await load(); } catch (e) { K.ui().toast(K.errText(e), 'error'); return; }
    let found = null;
    const n = (d.numbers || {})[city] || {};
    const paint = (el) => {
      el.querySelector('[data-found]').innerHTML = !found ? '' : found.length
        ? '<div class="k-field full"><span>Alege numărul pentru ' + esc(city) + '</span><div class="wa-found">' + found.map((x, i) => '<label class="fb-check"><input type="radio" name="wa_num" value="' + i + '"' + (n.phoneId === x.phoneId ? ' checked' : '') + '><span>' + esc(x.display || x.phoneId) + '<small>' + esc(x.name || '') + (x.quality ? ' · calitate ' + esc(x.quality) : '') + '</small></span></label>').join('') + '</div></div>'
        : '<p class="k-muted">' + icon('info') + 'Nu am găsit numere. Verifică tokenul sau scrie ID-ul contului WhatsApp Business.</p>';
      el.querySelector('[data-connect]').hidden = !(found && found.length);
    };
    const dr = K.drawer({
      title: 'Conectează numărul ' + city, icon: 'chat', width: 560,
      subtitle: 'Numărul de WhatsApp Business al clinicii din ' + city + '. De pe el pleacă mesajele automatizărilor și răspunsurile din Mesaje.',
      body: '<div class="k-form wa-form">' +
        K.field('Token WhatsApp' + (d.tokenSaved ? ' (opțional, există deja unul salvat)' : ''), '<textarea data-tok rows="3" placeholder="Token permanent de System User" autocomplete="off"></textarea>', 'full',
          'Business Settings → Utilizatori de sistem → Generează token, cu whatsapp_business_messaging și whatsapp_business_management, pentru aplicația cu WhatsApp. Numerele trebuie atribuite utilizatorului de sistem.') +
        K.field('ID cont WhatsApp Business (opțional)', '<input data-waba inputmode="numeric" placeholder="îl caut singur; dacă nu, din WhatsApp Manager → Setări cont" value="' + esc(n.wabaId || '') + '">', 'full') +
        '<div class="k-field full"><button type="button" class="k-btn is-outline" data-discover>' + icon('search') + 'Caută numerele</button></div>' +
        '<div data-found></div></div>',
      footer: '<span class="k-grow"></span><button type="button" class="k-btn" data-cancel>Renunță</button><button type="button" class="k-btn is-primary" data-connect hidden>' + icon('check') + 'Conectează ' + esc(city) + '</button>',
      onMount(el) {
        el.querySelector('[data-cancel]').addEventListener('click', () => dr.close());
        el.querySelector('[data-discover]').addEventListener('click', (ev) => K.busy(ev.currentTarget, async () => {
          try {
            const r = await K.api('/api/portal-wa', { action: 'discover', city, token: el.querySelector('[data-tok]').value.trim(), wabaId: el.querySelector('[data-waba]').value.trim() });
            found = r.found || [];
            if (r.message && !found.length) K.ui().toast(r.message, 'info');
            paint(el);
          } catch (err) { K.ui().toast(err.data && err.data.message ? err.data.message : K.errText(err), 'error'); }
        }));
        el.querySelector('[data-connect]').addEventListener('click', (ev) => K.busy(ev.currentTarget, async () => {
          const pick = el.querySelector('input[name="wa_num"]:checked');
          if (!pick) { K.ui().toast('Alege numărul.', 'error'); return; }
          const x = found[Number(pick.value)];
          try {
            await post({ action: 'connect', city, token: el.querySelector('[data-tok]').value.trim(), wabaId: x.wabaId, phoneId: x.phoneId });
            dr.close();
            K.ui().toast('Numărul ' + city + ' e conectat.', 'success');
            if (o.onDone) o.onDone();
          } catch (err) { K.ui().toast(err.data && err.data.message ? err.data.message : K.errText(err), 'error'); }
        }));
      },
    });
  }

  window.C360Wa = { load, post, edit, connect, tag, cityTags, bubble, STATUS, CAT, VLABEL, get d() { return W.d; } };
})();
