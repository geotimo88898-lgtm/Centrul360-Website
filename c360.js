/* ============================================================
   Centrul360 — shared service-page interactions (c360.js)
   ============================================================ */
(function(){
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ----- menu overlay ----- */
  const menuOverlay = document.getElementById('menuOverlay');
  const menuBtn = document.getElementById('menuBtn');
  const menuClose = document.getElementById('menuClose');
  const dds = [...document.querySelectorAll('.menu-dd')];
  function collapseDD(){ dds.forEach(dd=>{ dd.classList.remove('open'); const t=dd.querySelector('.menu-dd-trigger'); t && t.setAttribute('aria-expanded','false'); }); }
  function openMenu(){ if(!menuOverlay) return; menuOverlay.classList.add('open'); menuOverlay.setAttribute('aria-hidden','false'); menuBtn.setAttribute('aria-expanded','true'); document.body.style.overflow='hidden'; }
  function closeMenu(){ if(!menuOverlay) return; menuOverlay.classList.remove('open'); menuOverlay.setAttribute('aria-hidden','true'); menuBtn.setAttribute('aria-expanded','false'); document.body.style.overflow=''; collapseDD(); }
  menuBtn && menuBtn.addEventListener('click', openMenu);
  menuClose && menuClose.addEventListener('click', closeMenu);
  menuOverlay && menuOverlay.querySelectorAll('[data-menu-close]').forEach(a=>a.addEventListener('click', closeMenu));
  document.addEventListener('keydown', e=>{ if(e.key==='Escape' && menuOverlay && menuOverlay.classList.contains('open')) closeMenu(); });
  dds.forEach(dd=>{ const t=dd.querySelector('.menu-dd-trigger'); t && t.addEventListener('click', ()=>{ const open=dd.classList.toggle('open'); t.setAttribute('aria-expanded', open?'true':'false'); }); });
  // auto-open the dropdown that contains the current page
  document.querySelectorAll('.menu-dd .menu-sub-link.is-current').forEach(l=>{ const dd=l.closest('.menu-dd'); if(dd){ dd.classList.add('open'); const t=dd.querySelector('.menu-dd-trigger'); t && t.setAttribute('aria-expanded','true'); } });

  /* ----- reveal on scroll ----- */
  const io = new IntersectionObserver((es)=>{ es.forEach(e=>{ if(e.isIntersecting){ e.target.classList.add('in'); io.unobserve(e.target); } }); }, { threshold:0.08, rootMargin:'0px 0px -6% 0px' });
  document.querySelectorAll('.reveal').forEach(el=>io.observe(el));

  /* ----- animated count-up ----- */
  function fmt(v, decimals){ return decimals ? v.toFixed(decimals).replace('.', ',') : Math.round(v).toLocaleString('ro-RO'); }
  function runCount(el){
    const target = parseFloat(el.dataset.count);
    const decimals = parseInt(el.dataset.decimals || '0', 10);
    const suffix = el.dataset.suffix || '';
    if(reduceMotion){ el.textContent = fmt(target, decimals) + suffix; return; }
    const dur = 1400, start = performance.now();
    function tick(now){ const p = Math.min((now - start)/dur, 1); const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt(target * eased, decimals) + suffix; if(p < 1) requestAnimationFrame(tick); }
    requestAnimationFrame(tick);
  }
  const countIO = new IntersectionObserver((es)=>{ es.forEach(e=>{ if(e.isIntersecting){ runCount(e.target); countIO.unobserve(e.target); } }); }, { threshold:0.5 });
  document.querySelectorAll('.num[data-count]').forEach(el=>countIO.observe(el));

  /* ----- before/after compare sliders ----- */
  document.querySelectorAll('[data-ba]').forEach(ba=>{
    const wrap = ba.querySelector('.ba-before-wrap');
    const div  = ba.querySelector('.ba-divider');
    const handle = ba.querySelector('.ba-handle');
    if(!wrap || !div || !handle) return;
    let pos = 50, dragging = false;
    function set(p){ pos = Math.max(0, Math.min(100, p)); wrap.style.width = pos+'%'; div.style.left = pos+'%'; handle.style.left = pos+'%'; handle.setAttribute('aria-valuenow', Math.round(pos)); }
    function fromEvent(x){ const r = ba.getBoundingClientRect(); set(((x - r.left)/r.width)*100); }
    ba.addEventListener('pointerdown', e=>{ dragging = true; ba.setPointerCapture(e.pointerId); fromEvent(e.clientX); });
    ba.addEventListener('pointermove', e=>{ if(dragging) fromEvent(e.clientX); });
    ba.addEventListener('pointerup', ()=>{ dragging = false; });
    ba.addEventListener('pointercancel', ()=>{ dragging = false; });
    handle.addEventListener('keydown', e=>{ if(e.key==='ArrowLeft'){ set(pos-4); e.preventDefault(); } if(e.key==='ArrowRight'){ set(pos+4); e.preventDefault(); } });
    let hinted = false;
    const hintIO = new IntersectionObserver((es)=>{ es.forEach(en=>{ if(en.isIntersecting && !hinted && !reduceMotion){ hinted = true;
      set(62); setTimeout(()=>set(38), 360); setTimeout(()=>set(50), 720); } }); }, { threshold:0.4 });
    hintIO.observe(ba);
    set(50);
  });

  /* ----- scroll-reveal video (clip-path inset opens as it scrolls into view) ----- */
  document.querySelectorAll('[data-revealvid]').forEach(box=>{
    const inner = box.querySelector('.revealvid-inner');
    const video = box.querySelector('video');
    if(!inner) return;
    const lerp=(a,b,t)=>a+(b-a)*t, clamp=v=>Math.max(0,Math.min(1,v));
    let ticking=false;
    function apply(){
      ticking=false;
      const r = box.getBoundingClientRect(), vh = innerHeight || document.documentElement.clientHeight;
      const p = reduceMotion ? 1 : clamp((vh - r.top) / (vh*0.78));
      const iy=lerp(35,0,p), ix=lerp(42,0,p), rd=lerp(60,16,p);
      inner.style.clipPath = `inset(${iy}% ${ix}% ${iy}% ${ix}% round ${rd}px)`;
      inner.style.transform = `translateY(${lerp(7,0,p)}%)`;
    }
    function onScroll(){ if(!ticking){ ticking=true; requestAnimationFrame(apply); } }
    if(video){
      const vio = new IntersectionObserver(es=>es.forEach(e=>{
        if(e.isIntersecting){ const pr=video.play(); pr && pr.catch && pr.catch(()=>{}); } else { video.pause(); }
      }), { threshold:0.01 });
      vio.observe(box);
    }
    window.addEventListener('scroll', onScroll, { passive:true });
    window.addEventListener('resize', onScroll);
    apply();
  });

  /* ----- tech scrollytelling: rotate device (frame seq) + show one small title at a time ----- */
  (function(){
    const ts = document.querySelector('[data-techscroll]');
    if(!ts) return;
    const clamp=v=>Math.max(0,Math.min(1,v));
    const ccos = [...ts.querySelectorAll('.cco')];
    const fill = ts.querySelector('.th-progress span');
    const seq = ts.querySelector('[data-seq-count]');
    let frames=[], N=0, lastIdx=-1;
    if(seq){
      N = parseInt(seq.dataset.seqCount, 10) || 0;
      const base = seq.dataset.seqBase, ext = seq.dataset.seqExt || '.jpg';
      const pad = n => String(n).padStart(3, '0');
      for(let i=1;i<=N;i++){ const im = new Image(); im.decoding='async'; im.src = base + pad(i) + ext; frames.push(im); }
    }
    function showFrame(p){
      if(!N) return;
      const idx = Math.max(0, Math.min(N-1, Math.round(p*(N-1))));
      if(idx !== lastIdx){ const s = frames[idx] && frames[idx].src; if(s) seq.src = s; lastIdx = idx; }
    }
    let ticking=false, lastA=-1;
    function apply(){
      ticking=false;
      const total = ts.offsetHeight - innerHeight;
      const p = clamp((-ts.getBoundingClientRect().top) / Math.max(1, total));
      if(fill) fill.style.width = (p*100).toFixed(1)+'%';
      showFrame(p);
      const ai = Math.max(0, Math.min(ccos.length-1, Math.floor(p*ccos.length - 1e-9)));
      if(ai !== lastA){ ccos.forEach((c,i)=> c.classList.toggle('cur', i===ai)); lastA = ai; }
    }
    function onScroll(){ if(!ticking){ ticking=true; requestAnimationFrame(apply); } }
    window.addEventListener('scroll', onScroll, { passive:true });
    window.addEventListener('resize', onScroll);
    apply();
  })();

  /* ----- vertical animated timeline (fill draws down, dots light up on scroll) ----- */
  (function(){
    const tl = document.querySelector('[data-timeline]');
    if(!tl) return;
    const fill = tl.querySelector('.tl-fill');
    const items = [...tl.querySelectorAll('.tl-item')];
    const clamp=v=>Math.max(0,Math.min(1,v));
    if(reduceMotion){ items.forEach(i=>i.classList.add('on')); if(fill) fill.style.height='100%'; return; }
    let ticking=false;
    function apply(){
      ticking=false;
      const r = tl.getBoundingClientRect();
      const start = innerHeight*0.78, end = innerHeight*0.42;
      const p = clamp((start - r.top) / Math.max(1, (r.height + (start - end))));
      if(fill) fill.style.height = (p*100).toFixed(1)+'%';
      const fillY = r.top + p*r.height;
      items.forEach(it=>{ const d = it.querySelector('.tl-dot'); const dr = d.getBoundingClientRect();
        it.classList.toggle('on', (dr.top + dr.height/2) <= fillY + 2); });
    }
    function onScroll(){ if(!ticking){ ticking=true; requestAnimationFrame(apply); } }
    window.addEventListener('scroll', onScroll, { passive:true });
    window.addEventListener('resize', onScroll);
    apply();
  })();

  /* ----- faq accordion ----- */
  document.querySelectorAll('.faq-item').forEach(item=>{
    const q = item.querySelector('.faq-q'); const a = item.querySelector('.faq-a');
    if(!q || !a) return;
    q.addEventListener('click', ()=>{
      const open = item.classList.toggle('open');
      q.setAttribute('aria-expanded', open?'true':'false');
      a.style.maxHeight = open ? a.scrollHeight + 'px' : '0px';
    });
  });

  /* ----- reviews carousel arrows ----- */
  const track = document.getElementById('reviewsTrack');
  if(track){
    document.querySelectorAll('.rev-arrow').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const dir = parseInt(btn.dataset.revDir, 10);
        const card = track.querySelector('.review-card');
        const step = card ? card.getBoundingClientRect().width + 20 : 320;
        track.scrollBy({ left: dir*step, behavior:'smooth' });
      });
    });
    const prev = document.querySelector('.rev-prev'), next = document.querySelector('.rev-next');
    function updateArrows(){ if(!prev || !next) return; prev.disabled = track.scrollLeft <= 4; next.disabled = track.scrollLeft + track.clientWidth >= track.scrollWidth - 4; }
    track.addEventListener('scroll', updateArrows); window.addEventListener('resize', updateArrows); updateArrows();
  }

  /* ----- package toggle (1 ședință / 6 ședințe) ----- */
  document.querySelectorAll('[data-ptoggle]').forEach(group=>{
    const btns = group.querySelectorAll('.ptoggle button[data-show]');
    const sets = group.querySelectorAll('.pkgs[data-set]');
    btns.forEach(b=>b.addEventListener('click', ()=>{
      btns.forEach(x=>{ x.classList.remove('is-on'); x.setAttribute('aria-selected','false'); });
      b.classList.add('is-on'); b.setAttribute('aria-selected','true');
      sets.forEach(s=>{ const on = s.dataset.set === b.dataset.show; s.hidden = !on;
        if(on && !reduceMotion){ s.classList.remove('swap'); void s.offsetWidth; s.classList.add('swap'); } });
    }));
  });

  /* ----- google reviews modal ----- */
  const gmaps = document.getElementById('gmapsModal');
  const gOpen = document.getElementById('gmapsOpen');
  function openG(){ if(!gmaps) return; gmaps.classList.add('open'); gmaps.setAttribute('aria-hidden','false'); document.body.style.overflow='hidden'; }
  function closeG(){ if(!gmaps) return; gmaps.classList.remove('open'); gmaps.setAttribute('aria-hidden','true'); document.body.style.overflow=''; }
  gOpen && gOpen.addEventListener('click', openG);
  gmaps && gmaps.querySelectorAll('[data-gmaps-close]').forEach(el=>el.addEventListener('click', closeG));
  document.addEventListener('keydown', e=>{ if(e.key==='Escape' && gmaps && gmaps.classList.contains('open')) closeG(); });

  /* ----- sticky mobile booking bar (reveals after hero) ----- */
  const bookbar = document.getElementById('bookbar');
  if(bookbar){
    const sentinel = document.querySelector('.hero') || document.body;
    const barIO = new IntersectionObserver((es)=>{ es.forEach(e=>{ bookbar.classList.toggle('show', !e.isIntersecting); }); }, { threshold:0 });
    barIO.observe(sentinel);
  }
})();
