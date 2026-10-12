// POST /api/portal-config — admin-only config updates (Setări → Reguli comision,
// Bonus de viteză lunar, Obiectiv de companie, Conținut). One endpoint, partial updates:
// the client sends only the section(s) it's editing, merged onto the stored config.

const { readJSON, writeJSON } = require('./_lib/store');
const { requireAdmin } = require('./_lib/auth');
const { defaultConfig, defaultSops } = require('./_lib/defaults');

const SOP_ROLES = ['receptie', 'cosmetician', 'toti'];
// SOP edits from "SOP & Resurse" (admin): { receptie:[...], cosmetician:[...], toti:[...] }, each
// SOP { id, title, icon, when, steps[] }. Roles not sent are left untouched.
function cleanSops(input, current) {
  const out = Object.assign({}, current);
  SOP_ROLES.forEach((role) => {
    if (!Array.isArray(input[role])) return;
    out[role] = input[role].slice(0, 30).map((s, i) => ({
      id: /^[a-z0-9-]{1,40}$/.test(s && s.id) ? s.id : role.charAt(0) + '-' + Date.now().toString(36) + i,
      title: String((s && s.title) || '').trim().slice(0, 120) || 'SOP fără titlu',
      icon: /^[a-zA-Z]{1,20}$/.test(s && s.icon) ? s.icon : 'file',
      when: String((s && s.when) || '').trim().slice(0, 160),
      steps: (Array.isArray(s && s.steps) ? s.steps : []).map((x) => String(x).trim().slice(0, 600)).filter(Boolean).slice(0, 25),
    }));
  });
  return out;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const session = requireAdmin(req, res);
  if (!session) return;

  const { commissionRates, retailRate, raceBonus, companyGoal, resources, sops } = req.body || {};

  try {
    const configRaw = await readJSON('data/config.json', null);
    const config = configRaw || defaultConfig();

    if (commissionRates && typeof commissionRates === 'object') {
      Object.keys(commissionRates).forEach((k) => {
        const v = Number(commissionRates[k]);
        if (Number.isFinite(v) && v >= 0 && v <= 100) config.commissionRates[k] = v;
      });
    }
    if (retailRate !== undefined) {
      const v = Number(retailRate);
      if (Number.isFinite(v) && v >= 0 && v <= 100) config.retailRate = v;
    }
    if (raceBonus && typeof raceBonus === 'object') {
      config.raceBonus = {
        category: raceBonus.category || config.raceBonus.category,
        target: Number.isFinite(Number(raceBonus.target)) ? Number(raceBonus.target) : config.raceBonus.target,
        reward: Number.isFinite(Number(raceBonus.reward)) ? Number(raceBonus.reward) : config.raceBonus.reward,
        month: raceBonus.month || config.raceBonus.month,
      };
    }
    if (companyGoal && typeof companyGoal === 'object') {
      config.companyGoal = {
        target: Number.isFinite(Number(companyGoal.target)) ? Number(companyGoal.target) : config.companyGoal.target,
        reward: Number.isFinite(Number(companyGoal.reward)) ? Number(companyGoal.reward) : config.companyGoal.reward,
        month: companyGoal.month || config.companyGoal.month,
      };
    }
    if (resources && typeof resources === 'object') {
      ['upsellPackages', 'upcomingOffers', 'receptionScripts', 'treatmentProtocols', 'treatmentReference'].forEach((key) => {
        if (Array.isArray(resources[key])) {
          config.resources[key] = resources[key].map((s) => String(s).slice(0, 1000)).slice(0, 100);
        }
      });
    }

    if (sops && typeof sops === 'object') config.sops = cleanSops(sops, config.sops || defaultSops());

    await writeJSON('data/config.json', config);
    res.status(200).json({ ok: true, config });
  } catch (err) {
    console.error('portal-config error:', err.message);
    res.status(500).json({ error: 'config_failed' });
  }
};
