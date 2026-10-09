// POST /api/fb-manual-connect — admin-only fallback for connecting the Facebook Page
// when the OAuth flow (fb-oauth-start / fb-oauth-callback) can't be used because Meta's
// dashboard isn't offering a Pages/Lead Ads use case for this app (seen in practice when
// the app's attached Business Portfolio isn't verified yet). The admin instead gets a
// User Access Token with the needed permissions from Graph API Explorer
// (developers.facebook.com/tools/explorer — works for any Admin/Developer/Tester on the
// app regardless of which "use cases" are configured, since it's a sandbox tool, not the
// OAuth dialog), and pastes it here. Does the same two things fb-oauth-callback does:
// resolve the admin's Pages + Page Access Token, subscribe the chosen Page to this app's
// leadgen webhook, and store the connection — just skipping the broken OAuth hop.

const { readJSON, writeJSON } = require('./_lib/store');
const { requireAdmin } = require('./_lib/auth');
const { GRAPH_BASE, isConfigured } = require('./_lib/facebook');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const session = requireAdmin(req, res);
  if (!session) return;

  if (!isConfigured()) {
    res.status(400).json({ error: 'fb_not_configured' });
    return;
  }

  const { userAccessToken } = req.body || {};
  if (!userAccessToken || typeof userAccessToken !== 'string') {
    res.status(400).json({ error: 'missing_token' });
    return;
  }

  try {
    // List the Pages this token's user manages — each entry already carries its own
    // (non-expiring) Page Access Token, same as the OAuth path.
    const accountsUrl = `${GRAPH_BASE}/me/accounts?${new URLSearchParams({
      access_token: userAccessToken,
    })}`;
    const accountsResp = await fetch(accountsUrl);
    const accountsData = await accountsResp.json();
    const pages = (accountsData && accountsData.data) || [];
    if (!accountsResp.ok) {
      console.error('fb-manual-connect: /me/accounts failed', accountsData);
      res.status(400).json({ error: 'token_invalid', details: accountsData && accountsData.error });
      return;
    }
    if (pages.length === 0) {
      res.status(400).json({ error: 'no_pages' });
      return;
    }

    const primary = pages[0];

    // Subscribe the Page to this app's leadgen webhook — without this, Facebook never
    // sends leadgen events even though the Webhooks product is configured.
    const subscribeUrl = `${GRAPH_BASE}/${primary.id}/subscribed_apps`;
    const subscribeResp = await fetch(subscribeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        subscribed_fields: 'leadgen',
        access_token: primary.access_token,
      }),
    });
    const subscribeData = await subscribeResp.json();
    if (!subscribeResp.ok || !subscribeData.success) {
      console.error('fb-manual-connect: page webhook subscription failed', subscribeData);
      res.status(400).json({ error: 'subscribe_failed', details: subscribeData && subscribeData.error });
      return;
    }

    await writeJSON('data/fb-connection.json', {
      pageId: primary.id,
      pageName: primary.name,
      pageAccessToken: primary.access_token,
      pages: pages.map((p) => ({ id: p.id, name: p.name, access_token: p.access_token })),
      connectedAt: new Date().toISOString(),
      connectedBy: session.employeeId,
      connectedVia: 'manual',
    });

    res.status(200).json({ ok: true, pageName: primary.name });
  } catch (err) {
    console.error('fb-manual-connect error:', err.message);
    res.status(500).json({ error: 'connect_failed' });
  }
};
