// Shared helpers for the Facebook Lead Ads integration (api/fb-oauth-start.js,
// api/fb-oauth-callback.js, api/fb-connection-status.js, api/fb-disconnect.js,
// api/webhook-facebook-leads.js).
//
// data/fb-connection.json shape (written by fb-oauth-callback, read by the webhook and
// the status endpoint):
//   { pageId, pageName, pageAccessToken, pages: [{id,name,access_token}], connectedAt, connectedBy }
// An empty object ({}) means "not connected" — same "overwrite with {} to clear" pattern
// used elsewhere in this codebase for documents that don't have a natural empty list.
//
// This file contains a live secret (pageAccessToken) once connected — it's protected the
// same way employees.json's password hashes are: private Blob access, only ever read/written
// from requireAdmin-gated endpoints (or the signature-verified webhook), never sent to the
// browser.

const GRAPH_VERSION = 'v21.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

function isConfigured() {
  return Boolean(process.env.FB_APP_ID && process.env.FB_APP_SECRET);
}

async function loadConnection(readJSON) {
  const conn = await readJSON('data/fb-connection.json', {});
  return conn && conn.pageId && conn.pageAccessToken ? conn : {};
}

// Builds the absolute https origin this request was served on — same approach as
// api/mypos-checkout.js (`https://${req.headers.host}`), which is the only other place
// in this codebase that needs to build an absolute callback URL from the request.
function siteOrigin(req) {
  return `https://${req.headers.host}`;
}

// Facebook returns field_data as an array of { name, values: [v] } pairs. Form field
// names vary a lot between forms the owner builds in Meta's form editor, so this maps
// defensively across the common variants instead of assuming one exact set of names.
function extractLeadFields(fieldData) {
  const map = {};
  (fieldData || []).forEach((f) => {
    const key = String(f.name || '').toLowerCase().trim();
    const value = Array.isArray(f.values) ? f.values[0] : f.value;
    if (value !== undefined) map[key] = String(value).trim();
  });

  let name = map.full_name || map.name || '';
  if (!name) {
    const first = map.first_name || '';
    const last = map.last_name || '';
    name = `${first} ${last}`.trim();
  }

  const phone = map.phone_number || map.phone || map.telefon || '';
  const email = map.email || '';

  return { name, phone, email };
}

module.exports = { GRAPH_VERSION, GRAPH_BASE, isConfigured, loadConnection, siteOrigin, extractLeadFields };
