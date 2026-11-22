// „Organic → vânzări” (the owner, 21.11: the Card de Sărbători first; every organic touch can end in a sale, measured):
// per day and per source (the network × how she came: bio, story, dm, reel), what the site saw (visits, the card's
// checkout opened, sent to pay, cards paid and their lei, the site's lead-filter leads: api/_lib/site-funnel.js) and what
// the keyword messages did (comments and story replies answered privately, refused, her answer that made a lead:
// api/_lib/content-dm.js, data/content/dm.json). Only counts, nothing that names anyone.
//   view(days) → { ok, days: [{ day, sources: { <net:medium>: {...} }, dm: { ig|fb: {...} } }], total, dm }

const { readJSON } = require('./store');
const F = require('./site-funnel');

const NETS = ['instagram', 'facebook', 'tiktok', 'youtube'];
const MEDIUMS = ['bio', 'profil', 'story', 'dm', 'reel', 'post'];
const ro = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);

// an organic source: a network, with how she came when the link said it; „instagram” alone = the app's browser without
// tags (a post's or a profile's link, or an ad: Meta's in-app browser doesn't tell them apart)
function organic(src) {
  const [net, med] = String(src || '').split(':');
  if (!NETS.includes(net)) return '';
  if (med === 'paid' || med === 'cpc' || med === 'ads' || med === 'ad') return '';
  return med && MEDIUMS.includes(med) ? net + ':' + med : med ? net + ':altele' : net;
}

async function view(days) {
  const n = Array.isArray(days) ? days : Math.max(1, Math.min(60, Number(days) || 14));
  const [fun, dm] = await Promise.all([F.view(n), readJSON('data/content/dm.json', null).catch(() => null)]);
  const list = fun.days.map((d) => d.day);
  const add = (o, k, v) => { o[k] = (o[k] || 0) + (v == null ? 1 : v); };
  const total = {};
  const out = fun.days.map((d) => {
    const row = { day: d.day, sources: {}, dm: {} };
    Object.keys(d.sources || {}).forEach((src) => {
      const o = organic(src);
      if (!o) return;
      const r = row.sources[o] = row.sources[o] || {};
      const t = total[o] = total[o] || {};
      Object.keys(d.sources[src]).forEach((k) => { add(r, k, d.sources[src][k]); add(t, k, d.sources[src][k]); });
    });
    return row;
  });
  // the private messages: by the day they went (or were refused), her answer (a lead) on the day the message went
  const dmTotal = {};
  ((dm && dm.sent) || []).forEach((e) => {
    const i = list.indexOf(e && e.at ? ro(new Date(e.at)) : '');
    if (i < 0 || !e.channel) return;
    const r = out[i].dm[e.channel] = out[i].dm[e.channel] || {};
    const t = dmTotal[e.channel] = dmTotal[e.channel] || {};
    const via = e.via === 'message' ? 'stories' : 'comments';
    if (e.state === 'sent') { add(r, via); add(t, via); }
    if (e.state === 'refused') { add(r, 'refused'); add(t, 'refused'); }
    if (e.leadId) { add(r, 'replies'); add(t, 'replies'); }
  });
  return { ok: true, days: out, total, dm: dmTotal };
}

module.exports = { view, organic };
