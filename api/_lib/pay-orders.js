// Admin → Site → Comenzi și plăți (the owner, 27.11: „fiecare plată încercată / reușită, de unde a venit, cât a plătit, orice
// detaliu important, iar la cele nereușite un buton Trimite mesaj”): every order of the site's checkout (api/_lib/pay.js), read
// from the orders themselves, newest first. Only api/portal-orders.js (admin) calls this: the names and phones stay in the admin.
//   list({ days })   the rows and the totals of those days (Romania)
//   detail(id)       one order, all of it: her checkout's lines, the steps, the messages, the booking, where she came from
//   check(id)        myPOS asked now: its word, and a payment it confirms is marked paid (api/_lib/pay.js check)
const { readJSON } = require('./store');
const P = require('./pay');
const B = require('./booking');
const W = require('./pay-winback');

const KIND = { shop: 'Coș online', hold: 'Coș cu ora aleasă', treatment: 'Pagina tratamentului', offer: 'Ofertă', booking: 'Programare', card: 'Card de Sărbători', custom: 'Link de plată' };
const STATE = { paid: 'Plătită', partial: 'Plătită parțial', checking: 'De verificat în myPOS', refused: 'Plata nu a trecut', open: 'În curs', unfinished: 'Neterminată', later: 'A plătit altă comandă', clinic: 'Plătește la clinică', double: 'Plată dublă oprită' };
const p9 = (p) => String(p || '').replace(/\D/g, '').slice(-9);
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const dayRO = (ms) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Bucharest', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
const clean = (t) => String(t || '').replace(/^(Comandă online|Tratament online|Ofertă|Avans)\s*[·:]\s*/i, '').replace(/\s+/g, ' ').trim().slice(0, 140);
const DEV_OS = { ios: 'iPhone', android: 'Android', mac: 'Mac', win: 'Windows', linux: 'Linux' };
const DEV_BR = { ig: 'în Instagram', fb: 'în Facebook', tt: 'în TikTok', safari: 'Safari', chrome: 'Chrome', firefox: 'Firefox', edge: 'Edge', samsung: 'Samsung' };
const device = (code) => { const a = String(code || '').split(/[-:]/); return [DEV_OS[a[0]] || '', DEV_BR[a[1]] || ''].filter(Boolean).join(', '); };

// where she came from, in words (the reports' own rules: api/_lib/booking.js sourceAgain)
function sourceOf(o) {
  const s = B.sourceAgain(o.src) || null;
  if (!s) return { from: 'Nesalvat' };
  const t = s.tag || {};
  return { from: s.from || 'Direct', campaign: t.campaign || '', content: t.content || '', ad: t.ad || '', land: s.land || '', ref: s.ref || '', app: s.app || '', at: s.at || '' };
}

// one word for where the order stands
function stateOf(o, laterPaid) {
  if (o.status === 'paid') return 'paid';
  if (o.failWhy === 'clinic') return 'clinic';
  if (o.failWhy === 'double') return 'double';
  // a split order (over 990 lei, paid in parts, 28.11) with a part paid and the rest not: money came in, never „unpaid”
  if (Number(o.partsPaid) > 0) return 'partial';
  if (laterPaid) return 'later';
  if (o.status === 'open' && o.probable) return 'checking';
  if (o.refusedAt) return 'refused';
  if (o.status === 'open' && Date.now() - P.lastActivity(o) < 60 * 60e3) return 'open';
  return 'unfinished';
}

async function readAll(days) {
  const since = Date.now() - Math.max(1, Math.min(120, Number(days) || 30)) * 864e5;
  // the newest 500 at most (one screen's reads stay well inside a request's limits)
  const idx = ((await readJSON(P.INDEX, [])) || []).filter((x) => x && x.id && Date.parse(x.at) >= since).slice(-500);
  const out = [];
  for (let i = 0; i < idx.length; i += 16) {
    const part = await Promise.all(idx.slice(i, i + 16).map((x) => P.readOrder(x.id).then((r) => r.data, () => null)));
    part.forEach((o) => { if (o && !o.test && o.kind !== 'test') out.push(o); });
  }
  return out.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

function rowOf(o, ctx) {
  const k = p9(o.phone);
  const laterPaid = o.status !== 'paid' && !!k && (ctx.paidBy.get(k) || []).some((t) => t >= String(o.createdAt || ''));
  const state = stateOf(o, laterPaid);
  const msgs = k ? ctx.sent.filter((x) => x.p9 === k) : [];
  const last = msgs[msgs.length - 1] || null;
  const canMsg = !['paid', 'partial', 'clinic', 'double', 'later', 'checking'].includes(state) && k.length === 9 && k !== '700000000' && W.sentDay({ sent: msgs }, o.phone) !== dayRO(Date.now());
  return {
    id: o.id, at: o.createdAt, kind: o.kind, kindLabel: KIND[o.kind] || o.kind, title: clean(o.title), amount: r2(o.amount), full: r2(o.full || o.amount), city: o.city || '',
    state, stateLabel: STATE[state], paidAt: o.paidAt || '', name: o.name || '', phone: o.phone || '', src: sourceOf(o).from,
    tries: k ? (ctx.byPhone.get(k) || 0) : 1, msg: last ? { at: last.at, by: last.by || 'toate' } : null, gift: o.gift ? o.gift.name : '', canMsg, lead: o.leadId || '',
    deposit: !!(o.bonusText && /avans/i.test(o.bonusText)) || /^Avans/i.test(String(o.title || '')),
    parts: Array.isArray(o.parts) && o.parts.length ? { count: o.parts.length, paid: Number(o.partsPaid) || 0, paidLei: r2(o.parts.filter((x) => x.paidAt).reduce((t, x) => t + Number(x.amount), 0)) } : null,
  };
}

async function ctxOf(orders) {
  const doc = await W.load();
  const paidBy = new Map(), byPhone = new Map();
  for (const o of orders) {
    const k = p9(o.phone);
    if (!k) continue;
    byPhone.set(k, (byPhone.get(k) || 0) + 1);
    if (o.status === 'paid') paidBy.set(k, (paidBy.get(k) || []).concat(String(o.createdAt || '')));
  }
  return { sent: doc.sent || [], gifts: doc.gifts || [], paidBy, byPhone };
}

async function list(opts) {
  const days = Math.max(1, Math.min(120, Number(opts && opts.days) || 30));
  const orders = await readAll(days);
  const ctx = await ctxOf(orders);
  const rows = orders.map((o) => rowOf(o, ctx));
  const sum = (f) => r2(rows.filter(f).reduce((s, r) => s + r.amount, 0));
  // a sum paid in parts and left halfway (28.11): what came in counts as paid online, what is left as unfinished
  const lost = (r) => ['unfinished', 'refused', 'partial'].includes(r.state);
  const inLei = (r) => (r.state === 'partial' && r.parts ? r.parts.paidLei : 0), leftLei = (r) => r2(r.amount - inLei(r));
  const lostPhones = new Set(rows.filter(lost).map((r) => p9(r.phone)).filter(Boolean));
  return {
    days, at: new Date().toISOString(), rows,
    totals: {
      paid: rows.filter((r) => r.state === 'paid').length, paidLei: r2(sum((r) => r.state === 'paid') + rows.reduce((s, r) => s + inLei(r), 0)),
      lost: rows.filter(lost).length, lostLei: r2(rows.filter(lost).reduce((s, r) => s + leftLei(r), 0)), lostPeople: lostPhones.size,
      checking: rows.filter((r) => r.state === 'checking').length, open: rows.filter((r) => r.state === 'open').length,
      messaged: rows.filter((r) => lost(r) && r.msg).length, gifts: rows.filter((r) => r.gift).length,
      all: rows.length,
    },
  };
}

const STEP = { ua: 'A deschis plata', prep: 'Pagina de plată nu s-a pregătit', tap: 'A apăsat „Plătește”', tab: 'Pagina myPOS nu s-a deschis într-un tab nou' };
const TAP = { link: '', go: '', 'go-self': ' (în aceeași pagină)', late: ' (după o așteptare)' };
async function detail(id) {
  const { data: o } = await P.readOrder(id);
  if (!o || o.test) return { error: 'not_found' };
  const k = p9(o.phone);
  // her other orders (the same phone), for the tries and „a plătit altă comandă”
  const idx = ((await readJSON(P.INDEX, [])) || []).filter((x) => x && Date.parse(x.at) >= Date.parse(o.createdAt) - 14 * 864e5).slice(-300);
  const mine = [];
  for (let i = 0; i < idx.length; i += 16) {
    const part = await Promise.all(idx.slice(i, i + 16).map((x) => P.readOrder(x.id).then((r) => r.data, () => null)));
    part.forEach((x) => { if (x && !x.test && k && p9(x.phone) === k) mine.push(x); });
  }
  const ctx = await ctxOf(mine.length ? mine : [o]);
  const row = rowOf(o, ctx);
  const ph = await W.forPhone(o.phone);
  const steps = [{ at: o.createdAt, t: 'A început plata', d: (KIND[o.kind] || o.kind) + ', ' + r2(o.amount) + ' lei' }];
  for (const s of o.trace || []) {
    if (s.step === 'ua') steps.push({ at: s.at, t: STEP.ua, d: device(s.code) });
    else if (s.step === 'tap') steps.push({ at: s.at, t: STEP.tap + (TAP[s.code] || '') });
    else if (STEP[s.step]) steps.push({ at: s.at, t: STEP[s.step], d: s.code || '', tone: 'warn' });
  }
  if (o.notice && o.notice.at) steps.push({ at: o.notice.at, t: 'A lăsat numele și telefonul' });
  if (o.request && o.request.at) steps.push({ at: o.request.at, t: 'Pagina de plată myPOS făcută' });
  if (o.refusedAt) steps.push({ at: o.refusedAt, t: 'Plata nu a trecut la myPOS (cardul sau limita lui)', tone: 'bad' });
  if (o.probable) steps.push({ at: o.probable.at, t: 'Bani intrați în myPOS, de potrivit cu comanda', tone: 'warn' });
  if (o.recovery && o.recovery.state === 'sent') steps.push({ at: o.recovery.at, t: 'Reamintire automată pe WhatsApp' });
  ph.sent.forEach((m) => steps.push({ at: m.at, t: 'Mesaj de readucere trimis' + (m.by === 'toate' ? ' (la toate, 27.11)' : ' (din admin)') + (m.id === o.id ? '' : ', pentru altă comandă a ei') }));
  ph.failed.forEach((m) => steps.push({ at: m.at, t: 'Mesajul de readucere nu a plecat', d: m.error, tone: 'bad' }));
  if (o.status === 'expired' && o.failWhy === 'clinic') steps.push({ at: o.expiredAt || o.activityAt || o.createdAt, t: 'A ales să plătească la clinică' });
  if (o.paidAt) steps.push({ at: o.paidAt, t: 'Plătit online', d: r2(o.amount) + ' lei', tone: 'good' });
  if (o.gift) steps.push({ at: o.gift.at, t: 'Cadou: ' + o.gift.name, tone: 'good' });
  steps.sort((a, b) => (String(a.at) < String(b.at) ? -1 : 1));
  // her checkout as she left it (the lines, the hour held) and her booking
  const c = await W.checkoutOf(o).catch(() => null);
  let booking = null;
  let apptId = o.kind === 'booking' ? o.ref : '';
  if ((o.kind === 'shop' || o.kind === 'hold') && o.ref) { const h = await require('./booking-holds').get(o.ref).catch(() => null); if (h) { apptId = h.bookingId || ''; if (h.date) booking = { date: h.date, time: h.time || '', held: !h.bookingId }; } }
  if (apptId) {
    const a = ((await readJSON('data/appointments.json', [])) || []).find((x) => x && x.id === apptId);
    if (a) booking = { date: a.date, time: a.time || '', status: a.status || '', city: a.location || a.city || '', note: String(a.note || '').slice(0, 300), held: false };
  }
  const others = mine.filter((x) => x.id !== o.id).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 8)
    .map((x) => ({ id: x.id, at: x.createdAt, title: clean(x.title), amount: r2(x.amount), state: STATE[stateOf(x, false)] }));
  return {
    row, steps, source: sourceOf(o), lines: c ? c.lines : [], hour: c ? c.hour : '', giftToday: ph.giftToday, others, booking,
    pay: { provider: o.provider === 'requests' ? 'Pagină de plată myPOS' : 'Formularul de card myPOS', hasPage: !!(o.request && o.request.code), bonus: o.bonusText || '', consent: !!o.consent },
    message: row.canMsg ? W.TPL.body.replace('{prenume}', String(o.name || '').trim().split(/\s+/)[0] || 'dragă').replace('{serviciu}', clean(o.title).slice(0, 60) || 'comanda ta') : '',
  };
}

async function check(id) {
  const { data: o } = await P.readOrder(id);
  if (!o || o.test) return { error: 'not_found' };
  if (o.status === 'paid') return { ok: true, state: 'paid', said: 'Plătită' };
  let said = '';
  if (o.provider === 'requests') {
    try { const w = await P.requestWords(o); said = w.none ? 'nicio pagină de plată făcută' : (w.words || []).join(', ') || 'nimic'; } catch (e) { return { error: 'mypos', detail: String(e.message || '').slice(0, 120) }; }
  }
  const r = await P.check(o.id, o.key).catch((e) => ({ error: e.message }));
  const { data: o2 } = await P.readOrder(id);
  const WORD = { Paid: 'plătită', Pending: 'deschisă, neplătită', Seen: 'văzută, neplătită', Failed: 'încercată, plata nu a trecut', Expired: 'expirată', Cancelled: 'anulată' };
  return { ok: true, state: o2 && o2.status === 'paid' ? 'paid' : 'open', said: said ? said.split(', ').map((x) => WORD[x] || x).join(', ') : (r && r.status) || '', error: r && r.error };
}

module.exports = { list, detail, check, KIND, STATE };
