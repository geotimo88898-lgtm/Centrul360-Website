// /api/portal-transformare: Admin → „Campanii” (the owner, 21.11; the section's key stays „transformare”): the campaigns
// of the registry (api/_lib/campaigns.js), one at a time. „Transformarea 360” (api/_lib/fc-campaign.js): the spots, the
// money, the funnel, each message, the people who answered, and the switches (on / pause, a test to one number).
// „Cardul de Sărbători” (api/_lib/card-kpi.js): read only, every number from the WhatsApp send to the payment. Admin only.
//   POST { campaign: 'card', action: 'get' | 'refresh' }    the card's campaign (any other campaign: Transformarea, below)
//   POST { action: 'get' }                                  everything the section shows
//   POST { action: 'arm', on }                              the campaign on (sends at the steps' hours) / off
//   POST { action: 'pause', on }                            pause / go on
//   POST { action: 'test', phone, name, step, city }        one step to one number, never counted
//   POST { action: 'person', k, status?, plan?, consultAt?, note? }
//   POST { action: 'add', name, phone, city, status, plan, consultAt }   a payment or a call that came another way
//   POST { action: 'extend', step }                         a step sends 2 more hours (to whoever hasn't got it)
//   POST { action: 'refresh' }                              the numbers again, now
const { requireAdmin } = require('./_lib/auth');
const FC = require('./_lib/fc-campaign');
const CAMPAIGNS = require('./_lib/campaigns');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const session = await requireAdmin(req, res);
  if (!session) return;
  const b = (req.method === 'POST' && req.body) || {};
  const a = String(b.action || 'get');
  const camp = CAMPAIGNS.find(String(b.campaign || ''));
  try {
    if (camp.key !== 'transformarea') {
      if (!['get', 'refresh'].includes(a)) { res.status(400).json({ error: 'bad_action' }); return; }
      res.status(200).json(Object.assign(await CAMPAIGNS.lib(camp).view({ fresh: a === 'refresh' }), { campaigns: CAMPAIGNS.names() }));
      return;
    }
    let r;
    if (a === 'arm') r = await FC.setFlags({ armed: !!b.on });
    else if (a === 'pause') r = await FC.setFlags({ paused: !!b.on });
    else if (a === 'test') r = await FC.sendTest(b);
    else if (a === 'person') r = await FC.setPerson(b);
    else if (a === 'add') r = await FC.addPerson(b);
    else if (a === 'extend') r = await FC.extend(b);
    else if (a === 'refresh') { await FC.aggregate(); r = { ok: true }; }
    else if (a !== 'get') { res.status(400).json({ error: 'bad_action' }); return; }
    if (r && r.error) { res.status(400).json({ error: 'failed', message: r.error }); return; }
    res.status(200).json(Object.assign(await FC.view(), { key: 'transformarea', campaigns: CAMPAIGNS.names() }));
  } catch (err) {
    console.error('portal-transformare', a, err.message);
    res.status(500).json({ error: 'failed', message: 'Nu am putut încărca acum. Încearcă din nou.' });
  }
};
