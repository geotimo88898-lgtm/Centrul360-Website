// POST /api/portal-config — admin-only config updates (Setări → Reguli comision,
// Bonus de viteză lunar, Obiectiv de companie, Conținut). One endpoint, partial updates:
// the client sends only the section(s) it's editing, merged onto the stored config.

const { readJSON, writeJSON } = require('./_lib/store');
const { requireAdmin } = require('./_lib/auth');
const { defaultConfig } = require('./_lib/defaults');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const session = requireAdmin(req, res);
  if (!session) return;

  const { commissionRates, retailRate, raceBonus, companyGoal, resources } = req.body || {};

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
      ['upsellPackages', 'upcomingOffers', 'receptionScripts', 'treatmentProtocols'].forEach((key) => {
        if (Array.isArray(resources[key])) {
          config.resources[key] = resources[key].map((s) => String(s).slice(0, 1000)).slice(0, 100);
        }
      });
    }

    await writeJSON('data/config.json', config);
    res.status(200).json({ ok: true, config });
  } catch (err) {
    console.error('portal-config error:', err.message);
    res.status(500).json({ error: 'config_failed' });
  }
};
