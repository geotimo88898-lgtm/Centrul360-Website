// WhatsApp sending through Meta's WhatsApp Cloud API — the one place that talks to Meta.
//
// Turned on by two Vercel environment variables (never stored in the app's data):
//   WHATSAPP_TOKEN     permanent access token of the WhatsApp Business app (System User token)
//   WHATSAPP_PHONE_ID  the "Phone number ID" from WhatsApp → API Setup
// Without them sendWhatsApp() returns { sent:false } and the automation turns the message into a
// one-tap task in Sarcini instead (see _lib/workflows.js).
//
// Meta's rule: a business may write free text only within 24 h of the client's last message.
// Everything else (reminders, confirmations) must use a template approved in WhatsApp Manager —
// a step can name one (`template`); its {variabile} are sent, in order, as the template's {{1}}, {{2}} …

const GRAPH = 'https://graph.facebook.com/v21.0';

function whatsappConfigured() {
  return !!(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID);
}

// Romanian numbers as Meta wants them: country code, digits only (0722 123 456 → 40722123456).
function toE164(phone) {
  let d = String(phone || '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length === 10 && d.startsWith('0')) d = '40' + d.slice(1);
  if (d.length === 9 && d.startsWith('7')) d = '40' + d;
  return d.length >= 10 ? d : '';
}

async function sendWhatsApp({ phone, text, template, params }) {
  if (!whatsappConfigured()) return { sent: false, error: 'not_configured' };
  const to = toE164(phone);
  if (!to) return { sent: false, error: 'telefon invalid' };
  const body = template
    ? { messaging_product: 'whatsapp', to, type: 'template', template: { name: template, language: { code: 'ro' },
        components: params && params.length ? [{ type: 'body', parameters: params.map((p) => ({ type: 'text', text: String(p).slice(0, 1000) })) }] : [] } }
    : { messaging_product: 'whatsapp', to, type: 'text', text: { body: String(text || '').slice(0, 4000) } };
  try {
    const r = await fetch(`${GRAPH}/${encodeURIComponent(process.env.WHATSAPP_PHONE_ID)}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const code = j && j.error && j.error.code;
      // 131047 = outside the 24 h window (needs a template); 132001 = template missing / not approved.
      const why = code === 131047 ? 'în afara ferestrei de 24h — e nevoie de șablon' : code === 132001 ? 'șablonul nu există / nu e aprobat' : 'cod ' + (code || r.status);
      return { sent: false, error: why };
    }
    return { sent: true, id: j.messages && j.messages[0] && j.messages[0].id };
  } catch (err) {
    return { sent: false, error: 'rețea' };
  }
}

module.exports = { sendWhatsApp, whatsappConfigured, toE164 };
