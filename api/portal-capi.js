// /api/portal-capi, admin only (Admin → Integrări → Conversions API): what the server sends to Meta (_lib/meta-capi.js).
// The token is the one kept for the ads (Integrări → Facebook); it never comes back from here.
//   GET                                                  the settings, the mode, the Pipeline's stages with their Meta step,
//                                                        whether the ads token is there, the last events sent
//   POST { action: 'save', pixelId, on, testCode, map }  the settings ("Trimite live" has its own action); pixelId empty
//                                                        = no pixel yet: nothing is sent
//   POST { action: 'live', live }                        "Trimite live" on or off
//   POST { action: 'check' }                             can the token reach the pixel? (reads its name, changes nothing)
//   POST { action: 'test' }                              one event to Test Events (only with a test code set)

const { readJSON, writeJSON } = require('./_lib/store');
const { requireAdmin } = require('./_lib/auth');
const C = require('./_lib/meta-capi');

async function payload() {
  const [cfg, stages, status, conn] = await Promise.all([
    C.loadConfig(), C.loadStages(), C.loadStatus(), require('./_lib/facebook').loadConnection(readJSON).catch(() => ({})),
  ]);
  const map = C.stageEvents(stages, cfg.map);
  return {
    ok: true,
    config: { pixelId: cfg.pixelId, on: cfg.on, testCode: cfg.testCode, live: cfg.live, liveAt: cfg.liveAt, savedAt: cfg.savedAt },
    mode: C.modeOf(cfg),
    token: !!(conn && conn.userToken),
    events: C.CRM_EVENTS,
    stages: stages.map((s, i) => ({ id: s.id, name: s.name || s.id, kind: s.kind || 'open', event: map.get(s.id) || '', auto: s.kind === 'lost' ? '' : C.defaultEvent(stages, i) })),
    status,
  };
}

module.exports = async (req, res) => {
  // public, no login: only non-secret facts (the web pixel's id is in every page anyway), so the site can be given it
  if (req.method === 'GET' && req.query && req.query.public) {
    res.setHeader('Cache-Control', 'no-store');
    const [px, cfg, diag] = await Promise.all([require('./_lib/pixel-once').status(), C.loadConfig(), require('./_lib/pixel-diag').status()]);
    res.status(200).json({ ok: true, pixel: px, capi: { pixelId: cfg.pixelId, mode: C.modeOf(cfg) }, diag });
    return;
  }
  const session = await requireAdmin(req, res);
  if (!session) return;
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method === 'GET') { res.status(200).json(await payload()); return; }
    if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return; }
    const body = req.body || {};

    if (body.action === 'save') {
      const pixelId = String(body.pixelId || '').replace(/\s+/g, ''); // empty: no pixel, nothing is sent
      const testCode = String(body.testCode || '').trim();
      if (pixelId && !C.PIXEL_RE.test(pixelId)) { res.status(400).json({ error: 'invalid_pixel' }); return; }
      if (testCode && !C.TEST_RE.test(testCode)) { res.status(400).json({ error: 'invalid_test_code' }); return; }
      const doc = (await readJSON(C.CFG_KEY, {})) || {};
      const stages = await C.loadStages();
      const ids = new Set(stages.map((s) => s.id));
      const map = C.cleanMap(body.map && typeof body.map === 'object' ? body.map : doc.map);
      Object.keys(map).forEach((k) => { if (!ids.has(k)) delete map[k]; });
      Object.assign(doc, { pixelId, on: body.on !== false, testCode, map, savedAt: new Date().toISOString(), savedBy: session.employeeId });
      await writeJSON(C.CFG_KEY, doc);
      res.status(200).json(await payload());
      return;
    }
    if (body.action === 'live') {
      const doc = (await readJSON(C.CFG_KEY, {})) || {};
      doc.live = body.live === true;
      doc.liveAt = new Date().toISOString();
      doc.liveBy = session.employeeId;
      await writeJSON(C.CFG_KEY, doc);
      res.status(200).json(await payload());
      return;
    }
    if (body.action === 'check') {
      const r = await C.checkPixel(await C.loadConfig());
      res.status(200).json(Object.assign({ check: r }, await payload()));
      return;
    }
    if (body.action === 'test') {
      const r = await C.testEvent(await C.loadConfig(), req);
      res.status(200).json(Object.assign({ test: r }, await payload()));
      return;
    }
    res.status(400).json({ error: 'invalid_action' });
  } catch (err) {
    console.error('portal-capi error:', err.message);
    res.status(500).json({ error: 'capi_failed' });
  }
};
