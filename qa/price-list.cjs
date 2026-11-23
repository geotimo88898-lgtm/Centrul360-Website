// The site's price list (v2/src/preturi.html) as data for the server: what a treatment costs when it is paid online
// (api/_lib/pay.js never takes a price from the browser). Only fixed prices: the offers' rows come from Admin → Oferte
// (data-prt-offer) and are left out; nothing „de la …”.
//   node qa/price-list.cjs           writes api/_lib/price-list.gen.json from the page
//   node qa/price-list.cjs --check   exits 1 when the page and the file differ (run it after changing a price on the page)
const fs = require('fs'), path = require('path');
const REPO = path.join(__dirname, '..');
const SRC = path.join(REPO, 'v2/src/preturi.html');
const OUT = path.join(REPO, 'api/_lib/price-list.gen.json');

const strip = (s) => String(s).replace(/<[^>]+>/g, ' ').replace(/\{\{\w+\}\}/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const slug = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\+/g, ' plus ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const leiOf = (s) => { const m = /(\d[\d.]*)\s*lei/.exec(strip(s)); return m ? Number(m[1].replace(/\./g, '')) : 0; };
const minsOf = (s) => { const m = /(\d+)(?:\s*-\s*(\d+))?\s*min/.exec(s || ''); return m ? Number(m[2] || m[1]) : 0; };
// the clinics: these groups are only in Timișoara (the page says so); the rest in both
const TM_ONLY = new Set(['ems', 'impachetare', 'epilare']);
const CAT = { faciale: 'faciale', hifu: 'faciale', radiofrecventa: 'faciale', rfsculpt: 'faciale', liposonix: 'corporale', ems: 'corporale', cavitatie: 'corporale', impachetare: 'corporale', epilare: 'epilare' };

function parse(html) {
  const out = [];
  const groups = html.split(/<div class="prt-grp" id="/).slice(1);
  for (const g of groups) {
    const gid = g.slice(0, g.indexOf('"'));
    const gname = strip((/<h3>([\s\S]*?)(<span class="prt-loc"|<\/h3>)/.exec(g) || [])[1] || gid);
    const cities = TM_ONLY.has(gid) ? ['Timișoara'] : ['Timișoara', 'Arad'];
    // treatments with tiers (1 ședință, 4 ședințe…)
    for (const it of g.split('<div class="prt-it">').slice(1)) {
      const name = strip((/<b>([\s\S]*?)<\/b>/.exec(it) || [])[1] || '');
      const dur = minsOf(strip((/<span class="prt-d">([\s\S]*?)<\/span>/.exec(it) || [])[1] || ''));
      const tr = (/<div class="prt-tr">([\s\S]*)$/.exec(it) || [])[1] || '';
      const tiers = tr.split(/<div(?= class="prt-of| ?>|>)/).slice(1);
      for (const t of tiers) {
        if (/data-prt-offer/.test(t.slice(0, 200))) continue; // an Admin offer: its price lives there
        const label = strip((/<span>([\s\S]*?)<\/span>/.exec(t) || [])[1] || '').replace(/\s*-\d+%$/, '').replace(/\s+-\d+%/, '');
        const bm = /<b>([\s\S]*?)<\/b>/.exec(t);
        if (!label || !bm) continue;
        const old = /<s>/.test(bm[1]) ? leiOf((/<s>([\s\S]*?)<\/s>/.exec(bm[1]) || [])[1]) : 0;
        const price = leiOf(bm[1].replace(/<s>[\s\S]*?<\/s>/, ''));
        if (!(price > 0)) continue;
        const n = Number((/(\d+)\s*ședin/.exec(label) || [])[1] || 1);
        out.push({ id: slug(gid + ' ' + name + ' ' + label), group: gid, title: gname + ' · ' + name + ' · ' + label, price, old, sessions: n,
          minutes: /full-body/.test(slug(name)) && gid === 'epilare' ? 90 : Math.min(Math.max(dur || 60, 15), 120), cat: CAT[gid] || 'corporale', cities });
      }
    }
    // the laser zones: one price for women, one for men
    for (const z of g.split('<div class="prt-z').slice(1)) {
      const zone = strip((/<span>([\s\S]*?)(<small>|<\/span>)/.exec(z) || [])[1] || '');
      const dur = minsOf(strip((/<\/span><small>([\s\S]*?)<\/small>/.exec(z) || [])[1] || ''));
      for (const [g2, who] of [['f', 'femei'], ['m', 'bărbați']]) {
        const p = leiOf((new RegExp('<b data-' + g2 + '>([\\s\\S]*?)<\\/b>').exec(z) || [])[1] || '');
        if (!(p > 0) || !zone) continue;
        out.push({ id: slug(gid + ' ' + zone + ' ' + g2), group: gid, title: 'Epilare laser · ' + zone + ' · ' + who + ' · 1 ședință', price: p, old: 0, sessions: 1,
          minutes: Math.min(Math.max(dur || 15, 15), 120), cat: 'epilare', cities });
      }
    }
  }
  const ids = new Set();
  out.forEach((x) => { if (ids.has(x.id)) throw new Error('two rows with the same id: ' + x.id); ids.add(x.id); });
  return out;
}

if (require.main === module) {
  const list = parse(fs.readFileSync(SRC, 'utf8'));
  const text = JSON.stringify({ from: 'v2/src/preturi.html', note: 'Generat de qa/price-list.cjs. Nu se editează de mână.', items: list }, null, 1) + '\n';
  if (process.argv.includes('--check')) {
    const same = fs.existsSync(OUT) && fs.readFileSync(OUT, 'utf8') === text;
    console.log(same ? 'price list: same as the page (' + list.length + ' rows)' : 'price list: DIFFERENT from the page, run node qa/price-list.cjs');
    process.exit(same ? 0 : 1);
  }
  fs.writeFileSync(OUT, text);
  console.log('price list:', list.length, 'rows →', path.relative(REPO, OUT));
}
module.exports = { parse, slug };
