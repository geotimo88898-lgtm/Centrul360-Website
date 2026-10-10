// GET /api/portal-leave-pdf?id=<leaveRequestId> — streams the generated "Cerere de concediu"
// PDF for an approved leave request. Scoped to the admin or the employee who requested it (the
// Blob itself is private — this is the only way to fetch its bytes).

const { readJSON, readBinary } = require('./_lib/store');
const { requireAuth } = require('./_lib/auth');

module.exports = async (req, res) => {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'method_not_allowed' });
    return;
  }

  const session = requireAuth(req, res);
  if (!session) return;

  const id = String((req.query || {}).id || '');
  if (!id) { res.status(400).json({ error: 'missing_id' }); return; }

  try {
    const requests = await readJSON('data/leave-requests.json', []);
    const request = requests.find((r) => r.id === id);
    if (!request || !request.pdfBlobPath) { res.status(404).json({ error: 'request_not_found' }); return; }
    if (session.role !== 'admin' && request.employeeId !== session.employeeId) {
      res.status(403).json({ error: 'forbidden' });
      return;
    }
    const buffer = await readBinary(request.pdfBlobPath);
    if (!buffer) { res.status(404).json({ error: 'pdf_not_found' }); return; }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="cerere-concediu-' + id.slice(0, 8) + '.pdf"');
    res.status(200).send(buffer);
  } catch (err) {
    console.error('portal-leave-pdf error:', err.message);
    res.status(500).json({ error: 'pdf_failed' });
  }
};
