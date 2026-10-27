/* ============================================================
   Centrul360, the free consultation, on every page.
   The site sells one thing first: the free consultation (+ a facial massage as a gift).
   Every "Consultație gratuită" / "Programează" / "Rezervă" button opens the same short form the
   homepage uses, same questions, same HighLevel webhook, same thank-you page, already filled in
   with what the page knows (the treatment, the city), so only one or two steps are left.
   Buttons that say "WhatsApp", "Întreabă" or a phone number keep working as before.
   ============================================================ */
(function () {
  'use strict';
  const WEBHOOK = 'https://services.leadconnectorhq.com/hooks/vusqnbSprML4DKUMJ9QB/webhook-trigger/a5d2d666-96b0-47b9-87ab-f685ecf28e68';
  const INTERESTS = ['Epilare laser', 'Slăbit / conturare corp', 'Fermitate față / anti-îmbătrânire', 'Ten problematic / pete / luminozitate', 'Celulită', 'Nu știu exact, vreau o recomandare'];
  const ZONES = {
    'Slăbit / conturare corp': ['Abdomen', 'Șolduri / coapse', 'Brațe', 'Bărbie / gât dublu'],
    'Fermitate față / anti-îmbătrânire': ['Gușă / bărbie', 'Riduri frunte', 'Zona ochilor', 'Obraji / linia maxilarului'],
    'Ten problematic / pete / luminozitate': ['Acnee / pori dilatați', 'Pete / pigmentare', 'Luminozitate / hidratare'],
    'Celulită': ['Coapse', 'Fese', 'Abdomen'],
    'Epilare laser': ['Picioare', 'Axilă', 'Zona bikini', 'Față (mustață/bărbie)', 'Full Body']
  };
  // what each page already tells us: [interest, zone, city]
  const PAGE = (location.pathname.split('/').pop() || 'index').replace(/\.html$/, '');
  const KNOWN = {
    'grasime-localizata': ['Slăbit / conturare corp', '', ''],
    'tonifiere-musculara': ['Slăbit / conturare corp', '', 'Timișoara'],
    'detox-drenaj': ['Slăbit / conturare corp', '', 'Timișoara'],
    'celulita': ['Celulită', '', ''],
    'riduri-linii-fine': ['Fermitate față / anti-îmbătrânire', '', ''],
    'gusa-barbie-dubla': ['Fermitate față / anti-îmbătrânire', 'Gușă / bărbie', ''],
    'ten-problematic': ['Ten problematic / pete / luminozitate', 'Acnee / pori dilatați', ''],
    'pete-pigmentare': ['Ten problematic / pete / luminozitate', 'Pete / pigmentare', ''],
    'ten-lipsit-de-stralucire': ['Ten problematic / pete / luminozitate', 'Luminozitate / hidratare', ''],
    'epilare-laser': ['Epilare laser', '', 'Timișoara'],
    'timisoara': ['', '', 'Timișoara'],
    'arad': ['', '', 'Arad']
  }[PAGE] || ['', '', ''];

  // the homepage already has the form in its hero: there, buttons just bring you to it
  const inline = document.getElementById('quizForm');

  const CSS = `
  .cq-root{ position:fixed; inset:0; z-index:200; display:flex; align-items:center; justify-content:center; padding:20px; visibility:hidden; }
  .cq-root.open{ visibility:visible; }
  .cq-bg{ position:absolute; inset:0; background:rgba(4,4,6,.72); opacity:0; transition:opacity .3s ease; }
  .cq-root.open .cq-bg{ opacity:1; }
  .cq{ position:relative; width:100%; max-width:440px; max-height:calc(100dvh - 40px); overflow:auto; background:#121216; border:1px solid rgba(255,255,255,.12); border-radius:24px;
    padding:22px 20px 20px; color:#f5f4f2; font-family:'Inter',system-ui,sans-serif; box-shadow:0 30px 80px -30px rgba(0,0,0,.9); transform:translateY(16px); opacity:0; transition:transform .35s cubic-bezier(.16,1,.3,1), opacity .3s ease; }
  .cq-root.open .cq{ transform:none; opacity:1; }
  @media (max-width:640px){ .cq-root{ align-items:flex-end; padding:0; } .cq{ max-width:none; border-radius:22px 22px 0 0; padding:20px 18px calc(18px + env(safe-area-inset-bottom)); max-height:92dvh; } }
  .cq-x{ position:absolute; top:8px; right:8px; width:44px; height:44px; border-radius:50%; border:0; background:rgba(255,255,255,.08); color:#fff; font-size:20px; line-height:1; cursor:pointer; }
  .cq-top{ padding-right:40px; }
  .cq-top b{ display:block; font-size:18px; font-weight:800; letter-spacing:-.02em; }
  .cq-top span{ display:block; margin-top:4px; font-size:13.5px; color:rgba(245,244,242,.6); line-height:1.45; }
  .cq-bar{ height:3px; border-radius:3px; background:rgba(255,255,255,.08); margin:16px 0 18px; overflow:hidden; }
  .cq-bar i{ display:block; height:100%; width:25%; background:#f5f4f2; border-radius:inherit; transition:width .35s ease; }
  .cq h3{ margin:0 0 12px; font-size:16.5px; font-weight:700; letter-spacing:-.01em; }
  .cq-opts{ display:grid; gap:8px; }
  .cq-opts.two{ grid-template-columns:1fr 1fr; }
  .cq-opt{ min-height:50px; padding:12px 14px; border-radius:14px; border:1px solid rgba(255,255,255,.12); background:rgba(255,255,255,.04); color:#f5f4f2; font:inherit; font-size:14.5px; font-weight:600; text-align:left; cursor:pointer; transition:border-color .15s, background-color .15s; }
  .cq-opt:hover{ border-color:rgba(255,255,255,.3); }
  .cq-opt.sel{ border-color:#f5f4f2; background:rgba(255,255,255,.1); }
  .cq-f{ margin-bottom:12px; }
  .cq-f label{ display:block; font-size:14px; color:rgba(245,244,242,.6); margin-bottom:6px; }
  .cq-f input{ width:100%; height:50px; padding:0 14px; border-radius:14px; border:1px solid rgba(255,255,255,.14); background:rgba(0,0,0,.25); color:#f5f4f2; font:inherit; font-size:16px; }
  .cq-f input:focus{ outline:none; border-color:#f5f4f2; }
  .cq-f.err input{ border-color:#e79a94; }
  .cq-msg{ display:none; color:#e79a94; font-size:14px; margin-top:5px; }
  .cq-f.err .cq-msg{ display:block; }
  .cq-ok{ display:flex; gap:10px; align-items:flex-start; font-size:14px; line-height:1.5; color:rgba(245,244,242,.6); cursor:pointer; margin-top:4px; }
  .cq-ok input{ width:18px; height:18px; margin:1px 0 0; flex:none; accent-color:#f5f4f2; }
  .cq-ok.err{ color:#e79a94; }
  .cq-nav{ display:flex; align-items:center; gap:10px; margin-top:18px; }
  .cq-back{ border:0; background:none; color:rgba(245,244,242,.6); font:inherit; font-size:14px; cursor:pointer; padding:12px 4px; }
  .cq-send{ margin-left:auto; flex:1; min-height:52px; border:0; border-radius:999px; background:#f5f4f2; color:#0b0b0d; font:inherit; font-size:15px; font-weight:700; cursor:pointer; }
  .cq-send:disabled{ opacity:.6; }
  .cq-foot{ margin-top:14px; font-size:12px; color:rgba(245,244,242,.45); text-align:center; }
  .cq-foot a{ color:rgba(245,244,242,.75); text-decoration:underline; text-underline-offset:3px; }
  .cq [hidden]{ display:none !important; }`;

  let root, state, offerNote = '';
  function build() {
    const st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    root = document.createElement('div');
    root.className = 'cq-root'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', 'Consultație gratuită');
    root.innerHTML = `<div class="cq-bg" data-cq-close></div>
      <form class="cq" novalidate>
        <button type="button" class="cq-x" data-cq-close aria-label="Închide">×</button>
        <div class="cq-top"><b>Consultație gratuită</b><span>+ un masaj facial cadou. Te sunăm noi pentru programare, fără obligații.</span></div>
        <div class="cq-bar"><i></i></div>
        <input type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px;width:1px;height:1px;opacity:0">
        <div data-s="interes"><h3>Ce te interesează cel mai mult?</h3><div class="cq-opts">${INTERESTS.map((v) => `<button type="button" class="cq-opt" data-v="${v}">${v}</button>`).join('')}</div></div>
        <div data-s="zona"><h3>Ce zonă te deranjează cel mai mult?</h3><div class="cq-opts" data-zones></div></div>
        <div data-s="oras"><h3>La ce clinică preferi să vii?</h3><div class="cq-opts two"><button type="button" class="cq-opt" data-v="Timișoara">Timișoara</button><button type="button" class="cq-opt" data-v="Arad">Arad</button></div></div>
        <div data-s="contact"><h3>Unde te sunăm?</h3>
          <div class="cq-f"><label for="cqN">Numele tău</label><input id="cqN" name="nume" autocomplete="name" placeholder="ex: Maria Popescu"><span class="cq-msg">Te rugăm scrie numele.</span></div>
          <div class="cq-f"><label for="cqT">Telefon (WhatsApp)</label><input id="cqT" name="telefon" type="tel" inputmode="tel" autocomplete="tel" placeholder="07xx xxx xxx"><span class="cq-msg">Te rugăm scrie un număr de telefon valid.</span></div>
          <div class="cq-f"><label for="cqE">Email (opțional)</label><input id="cqE" name="email" type="email" autocomplete="email" placeholder="maria@exemplu.ro"><span class="cq-msg">Te rugăm scrie o adresă de email validă.</span></div>
          <label class="cq-ok"><input type="checkbox" name="ok"><span>Sunt de acord să fiu contactat/ă telefonic sau pe WhatsApp de Centrul360, inclusiv cu oferte.</span></label>
        </div>
        <div class="cq-nav"><button type="button" class="cq-back" data-cq-back>← Înapoi</button><button type="submit" class="cq-send" data-cq-send>Trimite</button></div>
        <p class="cq-foot">Preferi să scrii? <a href="https://wa.me/40750452002?text=Buna%20ziua!%20As%20dori%20o%20consultatie%20gratuita." target="_blank" rel="noopener">WhatsApp</a></p>
      </form>`;
    document.body.appendChild(root);
    const form = root.querySelector('form');
    root.addEventListener('click', (e) => {
      if (e.target.closest('[data-cq-close]')) return close();
      if (e.target.closest('[data-cq-back]')) { if (state.i > 0) { state.i--; render(); } return; }
      const o = e.target.closest('.cq-opt');
      if (!o) return;
      const step = o.closest('[data-s]').dataset.s;
      o.parentElement.querySelectorAll('.cq-opt').forEach((b) => b.classList.toggle('sel', b === o));
      if (step === 'interes') { state.interes = o.dataset.v; state.zona = ''; buildPath(); }
      if (step === 'zona') state.zona = o.dataset.v;
      if (step === 'oras') state.oras = o.dataset.v;
      setTimeout(() => { state.i = Math.min(state.i + 1, state.path.length - 1); render(); }, 170);
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && root.classList.contains('open')) close(); });
    form.addEventListener('submit', submit);
  }
  function buildPath() {
    const zones = ZONES[state.interes] || [];
    root.querySelector('[data-zones]').innerHTML = zones.map((z) => `<button type="button" class="cq-opt${z === state.zona ? ' sel' : ''}" data-v="${z}">${z}</button>`).join('');
    // epilation is only in Timișoara: the city is already decided, so no city question
    const tmOnly = state.interes === 'Epilare laser';
    if (tmOnly) state.oras = 'Timișoara';
    root.querySelectorAll('[data-s="oras"] .cq-opt').forEach((b) => b.classList.toggle('sel', b.dataset.v === state.oras));
    state.path = ['interes'].concat(zones.length ? ['zona'] : [], tmOnly ? [] : ['oras'], ['contact']);
  }
  const waHref = () => (/arad/i.test(state.oras || '') ? 'https://wa.me/40750277394?text=Buna%20ziua!%20As%20dori%20o%20consultatie%20gratuita%20la%20clinica%20din%20Arad.' : 'https://wa.me/40750452002?text=Buna%20ziua!%20As%20dori%20o%20consultatie%20gratuita.');
  function render() {
    const cur = state.path[state.i];
    const wa = root.querySelector('.cq-foot a'); if (wa) wa.href = waHref();
    root.querySelectorAll('[data-s]').forEach((s) => { s.hidden = s.dataset.s !== cur; });
    root.querySelector('.cq-bar i').style.width = Math.round(((state.i + 1) / state.path.length) * 100) + '%';
    root.querySelector('[data-cq-back]').hidden = state.i === 0;
    root.querySelector('[data-cq-send]').hidden = cur !== 'contact';
    if (cur === 'contact') setTimeout(() => { const n = root.querySelector('#cqN'); if (n && !n.value && matchMedia('(hover:hover)').matches) n.focus(); }, 60);
  }
  // an offer / package name tells us the interest (and sometimes the zone and the city)
  function guess(name) {
    const n = (name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const g = ['', '', ''];
    if (/epilare|full body/.test(n)) { g[0] = 'Epilare laser'; if (/full body/.test(n)) g[1] = 'Full Body'; }
    else if (/celulit/.test(n)) g[0] = 'Celulită';
    else if (/gusa/.test(n)) { g[0] = 'Fermitate față / anti-îmbătrânire'; g[1] = 'Gușă / bărbie'; }
    else if (/hifu|lifting|riduri/.test(n)) g[0] = 'Fermitate față / anti-îmbătrânire';
    else if (/facial|ten|pete|acnee/.test(n)) g[0] = 'Ten problematic / pete / luminozitate';
    else if (/belly|abdomen/.test(n)) { g[0] = 'Slăbit / conturare corp'; g[1] = 'Abdomen'; }
    else if (/liposonix|cavitat|ems|detox|slab/.test(n)) g[0] = 'Slăbit / conturare corp';
    if (/arad/.test(n)) g[2] = 'Arad';
    else if (/timisoara|ems|epilare/.test(n)) g[2] = 'Timișoara';
    return g;
  }
  function open(source) {
    if (!root) build();
    offerNote = source || '';
    const g = guess(offerNote);
    state = { interes: g[0] || KNOWN[0], zona: g[0] ? g[1] : KNOWN[1], oras: g[2] || KNOWN[2], i: 0, path: [] };
    root.querySelectorAll('.cq-opt').forEach((b) => b.classList.remove('sel'));
    buildPath();
    // pre-filled answers are marked, and we start at the first question still open
    const mark = (step, v) => { const b = v && [...root.querySelectorAll(`[data-s="${step}"] .cq-opt`)].find((x) => x.dataset.v === v); if (b) b.classList.add('sel'); return !!b; };
    mark('interes', state.interes); mark('zona', state.zona); mark('oras', state.oras);
    const known = { interes: !!state.interes, zona: !!state.zona, oras: !!state.oras };
    state.i = Math.max(0, state.path.findIndex((s) => s === 'contact' || !known[s]));
    root.querySelector('[data-cq-send]').disabled = false;
    root.querySelector('[data-cq-send]').textContent = 'Trimite';
    render();
    root.classList.add('open');
    document.documentElement.style.overflow = 'hidden';
    // the phone's back button closes the form instead of leaving the page
    if (!pushed) { try { history.pushState({ cq: 1 }, '', location.href); pushed = true; } catch (e) { /* no history */ } }
  }
  let pushed = false;
  window.addEventListener('popstate', () => { if (pushed) { pushed = false; if (root) { root.classList.remove('open'); document.documentElement.style.overflow = ''; } } });
  function close() {
    root.classList.remove('open'); document.documentElement.style.overflow = '';
    if (pushed) { pushed = false; try { history.back(); } catch (e) { /* nothing */ } }
  }
  function submit(e) {
    e.preventDefault();
    const f = e.currentTarget;
    if (f.website.value) return;                         // honeypot
    const digits = (s) => (s || '').replace(/\D/g, '');
    const fld = (n) => f.querySelector(`[name="${n}"]`);
    let ok = true;
    const flag = (el, bad) => { el.closest('.cq-f, .cq-ok').classList.toggle('err', bad); if (bad) ok = false; };
    flag(fld('nume'), !fld('nume').value.trim());
    flag(fld('telefon'), digits(fld('telefon').value).length < 9);
    flag(fld('email'), !!fld('email').value.trim() && !fld('email').checkValidity());
    flag(fld('ok'), !fld('ok').checked);
    if (!ok) return;
    const btn = f.querySelector('[data-cq-send]'); btn.disabled = true; btn.textContent = 'Se trimite…';
    const payload = {
      nume: fld('nume').value.trim(), telefon: fld('telefon').value.trim(), email: fld('email').value.trim(),
      interes_principal: state.interes || 'Nu știu exact, vreau o recomandare', zona: state.zona, oras: state.oras,
      sursa: 'Website - Consultatie gratuita (' + PAGE + ')' + (offerNote ? ' - ' + offerNote : ''),
      consimtamant_whatsapp: true, pagina: location.href
    };
    const done = () => { location.href = '/multumesc-cadou' + (/arad/i.test(state.oras || '') ? '?oras=arad' : ''); };
    // nothing went through (no internet, a refusal): she is told, the button comes back, nothing is lost
    const failed = () => {
      btn.disabled = false; btn.textContent = 'Trimite';
      const foot = f.querySelector('.cq-foot');
      foot.innerHTML = '<span style="color:#e79a94">Nu am putut trimite. Verifică internetul și apasă din nou, sau scrie-ne pe </span><a href="' + waHref() + '" target="_blank" rel="noopener">WhatsApp</a>';
    };
    // to HighLevel (as before) and to the portal (Pipeline, the team's notification, the WhatsApp from the city's number)
    const send = (url) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).then((r) => r.ok, () => false);
    Promise.all([send(WEBHOOK), send('/api/site-lead')]).then((r) => (r[0] || r[1] ? done() : failed()), failed);
  }

  // Which buttons sell the consultation: booking verbs, unless they explicitly say WhatsApp / a phone.
  const BOOK = /consulta|programeaz|rezerv|vreau/i, KEEP = /whatsapp|întreab|intreab|sun[ăa]|\+40|navigh|indica/i;
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href*="wa.me"]');
    if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey) return;
    const label = (a.textContent || '').trim();
    if (!BOOK.test(label) || KEEP.test(label)) return;
    e.preventDefault();
    // offers / packages: keep which one was chosen, so reception knows
    let name = '';
    try {
      const txt = new URL(a.href).searchParams.get('text') || '';
      const m = /(?:rezerv[ăa]? oferta|pachetul|programul)\s+(.+?)\.?$/i.exec(txt);
      if (m) name = m[1].replace(/\s+la\s+\d+\s*lei$/i, '').replace(/\s*\(\d+\s*lei\)$/i, '');
    } catch (err) { /* keep going without it */ }
    if (!name) { const card = a.closest('.ocard, .pkg'); const h = card && card.querySelector('h3, h4'); name = h ? h.textContent : ''; }
    const pop = a.closest('.offpop, #offpop');                 // the offer pop-up on Oferte closes first
    if (pop) { pop.classList.remove('open'); pop.setAttribute('aria-hidden', 'true'); document.body.style.overflow = ''; }
    if (inline && !name) {                              // homepage: the form is right there in the hero
      const target = inline.closest('.quiz-card') || inline;
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    open(name ? name.trim().replace(/\s+/g, ' ').slice(0, 80) : '');
  });
  window.C360Consult = { open };
})();
