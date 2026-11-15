// Once (the owner, 15.11): week 16-22.11 starts with the reels he approved, not with the first four he rejected.
//  (a) out of the queue: the four old reels of week 2026-11-16 made on 12.11, matched by their topic and the day they
//      were made, nothing else (content.js skip: dropped, nothing of them goes out);
//  (b) in their place: the four reels he approved while they were made (drafts with all their files, in week
//      2026-11-23, no texts yet): their texts per network (the rules of reels/PRODUCER.md „Textele pe rețele”), then
//      'ready' into week 2026-11-16, so they wait for his look in Content → Transit (pending: he approves them himself).
// The posting switch is not touched (it stays as it is: off). Run by the automations' clock and the portal's pulse;
// an item whose 'ready' is refused (its problems kept here) is tried again, three times at most.
// data/content-swap-once.json: { done, at, out: [ids], in: { <id>: { ok, problems?, tries } } }

const { readJSON, writeJSON } = require('./store');
const C = require('./content');

const KEY = 'data/content-swap-once.json';
const WEEK = '2026-11-16';
const OLD_DAY = '2026-11-12';
const OLD = ['HIFU pe gușă, în 30 de secunde', 'Gușa e doar de la kilograme?', 'Nuki vs. burtica', 'Cazul 18: gușă, o ședință HIFU'];

// the texts, one per network (TikTok short with 3-5 hashtags, YouTube a title with #shorts, Instagram the longer story
// with the hashtags after an empty line, Facebook a message with a question and one hashtag); the comment word „360”
// only on the cream reel, whose video ends with it
const NEW = {
  // gușă: why many slim women have a double chin (fat, skin laxity, genetics); HIFU tightens the SMAS, best at 8-12 weeks
  'ed07799b-35d8-400a-9d18-e1639cb518da': {
    captions: {
      tt: 'Gușa nu vine mereu din kilograme 👀 E un amestec de grăsime, piele lăsată și genetică. #gusa #barbiedubla #hifu #centrul360',
      yt: 'De ce apare gușa și la femeile fără kilograme în plus #shorts',
      ig: 'Multe femei au gușă chiar dacă nu au niciun kilogram în plus. De ce?\n\nSub bărbie se strânge un mic depozit de grăsime, care de multe ori nu pleacă doar cu sport. Cu anii, pielea își pierde din fermitate, iar genetica contează și ea. Așa că gușa e, de fapt, un amestec de grăsime și piele lăsată.\n\nHIFU duce energie într-un strat profund de sub piele, numit SMAS, unde țesutul se strânge și se formează colagen nou. Efectul se vede cel mai bine după 8-12 săptămâni.\n\nSalvează clipul, ca să-l ai la îndemână 🤍\n\n#gusa #barbiedubla #hifu #fermitate #centrul360',
      fb: 'Ne întrebați des: de unde vine gușa, dacă nu sunt kilograme în plus? 🤔 Gușa nu ține doar de greutate. E un mic depozit de grăsime, piele care își pierde din fermitate cu anii și, da, puțină genetică. Voi ați știut asta? #gusa',
    },
    firstComment: 'Ați știut că și genetica contează la gușă? 🥰',
  },
  // caz real: one Liposonix session on the hips (the site's catalog, Timișoara)
  '93b3ec65-38a9-4899-b899-4cad7b23920a': {
    captions: {
      tt: 'O singură ședință de Liposonix pe șolduri, înainte și după ✨ Rezultatele diferă de la o persoană la alta. #liposonix #solduri #inaintesidupa #centrul360',
      yt: 'O ședință de Liposonix pe șolduri: înainte și după #shorts',
      ig: 'Acesta e rezultatul după o singură ședință de Liposonix pe șolduri, în clinica din Timișoara.\n\nGrăsimea de pe șolduri de multe ori nu pleacă nici cu alimentație atentă și mișcare. Liposonix concentrează ultrasunetele direct în stratul de grăsime, fără să atingă pielea, iar corpul elimină treptat celulele distruse. Diferența se vede de obicei după 6-8 săptămâni.\n\nCa rezultatul să se păstreze, contează un stil de viață echilibrat. Rezultatele diferă de la o persoană la alta.\n\n#liposonix #solduri #inaintesidupa #timisoara #centrul360',
      fb: 'Un caz real din clinica din Timișoara: o singură ședință de Liposonix pe șolduri. Diferența a apărut treptat, în câteva săptămâni, pe măsură ce corpul a eliminat singur celulele de grăsime. Rezultatele diferă de la o persoană la alta. Ce zonă ați vrea să vedeți data viitoare? #liposonix',
    },
    firstComment: 'Ce zonă ați vrea să vedeți în următorul caz? 💞',
  },
  // EMS: a session lying down, up to 20.000 contractions, a cure of 6-8 sessions, only in Timișoara
  '9c5225ed-b0a1-411c-aba5-06ad4fc82567': {
    captions: {
      tt: 'Antrenamentul la care stai întinsă 😮 Până la 20.000 de contracții într-o ședință. Doar în Timișoara. #ems #tonifiere #timisoara #centrul360',
      yt: 'EMS, antrenamentul la care stai întinsă #shorts',
      ig: 'Există un antrenament la care stai întinsă, iar mușchiul lucrează mai mult decât ar putea la sală.\n\nEMS, adică electrostimularea magnetică, trimite impulsuri care fac mușchiul să se contracte singur: până la 20.000 de contracții într-o singură ședință. Contracțiile sunt intense, iar tu stai relaxată tot timpul. De obicei e o cură de 6-8 ședințe.\n\nEMS se face doar în clinica din Timișoara. Trimite-i clipul prietenei cu care tot amâni sala 💪\n\n#ems #tonifiere #abdomen #timisoara #centrul360',
      fb: 'Știați că există un antrenament la care stai întinsă? 😄 Se numește EMS și, într-o singură ședință, mușchiul face până la 20.000 de contracții. Se face doar în clinica din Timișoara. Cu cine ați încerca prima dată? #ems',
    },
    firstComment: 'Voi cu cine ați merge la prima ședință de EMS? 💞',
  },
  // cremă: the cream works on the surface; HIFU and radiofrequency reach the deep layers, new collagen, best at 8-12 weeks
  '8428b277-6c0f-440c-9256-0f42aab897c6': {
    captions: {
      tt: 'Crema ta lucrează doar la suprafață 🧴 Fermitatea se hotărăște mai jos, în straturile profunde. #fermitate #hifu #radiofrecventa #centrul360',
      yt: 'De ce crema nu ajunge acolo unde se hotărăște fermitatea #shorts',
      ig: 'Crema de față lucrează doar la suprafață. Fermitatea pielii se hotărăște mai jos, în straturile profunde, unde cu vârsta se produce tot mai puțin colagen și elastină.\n\nHIFU și radiofrecvența duc energie controlată exact acolo și pornesc producția de colagen nou. Colagenul are nevoie de timp, așa că efectul maxim apare la 8-12 săptămâni de la ședință.\n\nScrie 360 în comentarii și îți spunem ce s-ar potrivi pielii tale 🤍\n\n#fermitate #colagen #hifu #radiofrecventa #centrul360',
      fb: 'Crema e importantă, dar lucrează doar la suprafață. Fermitatea se joacă în straturile profunde ale pielii, acolo unde ajung HIFU și radiofrecvența și pornesc colagenul nou, cu efect maxim la 8-12 săptămâni. Scrie 360 în comentarii dacă vrei să afli ce s-ar potrivi pielii tale. #fermitate',
    },
    firstComment: 'Voi ce cremă folosiți acum și ce ați vrea să se schimbe la pielea voastră? 🥰',
    keyword: '360',
  },
};

const madeOn = (it) => { const t = Date.parse(it.createdAt || ''); return t ? [new Date(t).toISOString().slice(0, 10), require('./content-plan').roDay(t)] : []; };
// the four old ones: the topic (folded: diacritics and case aside) and the day they were made, in week 2026-11-16
const isOld = (it) => !it.removed && !it.dropped && it.week === WEEK && OLD.some((t) => C.fold(t).trim() === C.fold(it.topic).trim()) && madeOn(it).includes(OLD_DAY);

async function run() {
  const st = (await readJSON(KEY, null)) || {};
  if (st.done) return { skipped: true };
  const s = { out: st.out || [], in: st.in || {} };
  // (a) out
  const list = await C.items();
  for (const it of list.filter(isOld)) { await C.skip(it.id, ''); s.out.push(it.id); }
  // (b) in: the texts on the draft, week 16.11, waiting for his look, then ready
  for (const id of Object.keys(NEW)) {
    const cur = s.in[id] || { tries: 0 };
    if (cur.ok || cur.tries >= 3) continue;
    const x = NEW[id];
    const { out: found } = await C.update((l) => {
      const it = C.findItem(l, id);
      if (!it || it.removed || it.dropped) return false;
      if (it.state !== 'draft') return it.state;
      it.captions = Object.assign({}, it.captions || {}, x.captions);
      it.firstComment = x.firstComment;
      if (x.keyword && !it.keyword) it.keyword = x.keyword;
      it.week = WEEK;
      it.review = 'pending';
      delete it.reviewedAt; delete it.approvedAt; delete it.undo;
      return 'draft';
    });
    if (!found) { s.in[id] = { ok: false, tries: cur.tries + 1, problems: ['nu există (sau e scos)'] }; continue; }
    if (found === 'ready') { s.in[id] = { ok: true, tries: cur.tries + 1, already: true }; continue; }
    try {
      const r = await C.ready(id);
      s.in[id] = Object.assign({ ok: true, tries: cur.tries + 1, plan: (r.plan || []).map((e) => e.net + ' ' + e.at) }, r.warnings ? { warnings: r.warnings } : {});
    } catch (e) {
      s.in[id] = { ok: false, tries: cur.tries + 1, problems: (e.extra && e.extra.problems) || [e.message] };
    }
  }
  const done = Object.keys(NEW).every((id) => s.in[id] && (s.in[id].ok || s.in[id].tries >= 3));
  await writeJSON(KEY, Object.assign(s, { done, at: new Date().toISOString() }));
  return { done, out: s.out.length, in: Object.keys(s.in).filter((id) => s.in[id].ok).length };
}

module.exports = { run, KEY, NEW, OLD, isOld };
