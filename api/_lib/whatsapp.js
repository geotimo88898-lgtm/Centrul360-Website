// Single point where a real WhatsApp send will be wired in later.
//
// STUB: wire real WhatsApp Cloud API sending here later (Meta access token + phone
// number ID). Currently a no-op — automation tasks are surfaced in the portal
// ("Automatizări" tab) for an employee to action by hand (send the WhatsApp message
// themselves, then mark the task done). No env vars, API tokens, or external fetch()
// calls here on purpose — this file is the one place to change when that step happens.
async function sendWhatsApp(task) {
  console.log('[whatsapp-stub] would send:', task && task.text);
  return { sent: false, stub: true };
}

module.exports = { sendWhatsApp };
