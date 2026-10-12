// Builds the one-page "Cerere de concediu" PDF generated on approval (api/portal-leave.js,
// action: 'decide'). Pure pdf-lib — no external template file, no native binaries.
//
// Diacritics note: pdf-lib's built-in Standard-14 fonts (Helvetica etc.) only support the
// WinAnsi (Windows-1252) encoding, which does NOT contain the Romanian comma-below letters
// ă/â/î/ș/ț (or even the cedilla variants ş/ţ). Embedding a custom Unicode font would need a
// font file + fontkit, which this project doesn't carry. So this document's text has its
// diacritics stripped (ă→a, ș→s, ț→t, …) via Unicode NFD normalization — it reads as plain
// Romanian without diacritics, which is legible and avoids pdf-lib throwing on encode. This is
// a presentation compromise, not a legal one; see the printed notice at the bottom of the page.
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

const stripDiacritics = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '');

const TYPE_LABELS = {
  odihna: 'Concediu de odihna',
  fara_plata: 'Concediu fara plata',
  medical: 'Concediu medical',
  alta: 'Alt tip de concediu',
};

function formatDateRO(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return stripDiacritics(iso || '');
  const [y, m, d] = iso.split('-').map(Number);
  const MON = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];
  return d + ' ' + MON[m - 1] + ' ' + y;
}

// employee: { name, role, location, cnp? } (cnp optional — omitted from the PDF when absent)
// request: { type, startDate, endDate, workDays, reason, requestedAt }
async function buildLeaveRequestPdf(employee, request) {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]); // A4
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const italic = await doc.embedFont(StandardFonts.HelveticaOblique);

  const margin = 56;
  const width = page.getWidth() - margin * 2;
  let y = page.getHeight() - 60;
  const ink = rgb(0.08, 0.08, 0.1);
  const muted = rgb(0.4, 0.4, 0.42);

  const draw = (text, opts) => {
    const o = opts || {};
    const f = o.font || font;
    const size = o.size || 11;
    const color = o.color || ink;
    const t = stripDiacritics(text);
    if (o.center) {
      const tw = f.widthOfTextAtSize(t, size);
      page.drawText(t, { x: margin + (width - tw) / 2, y, size, font: f, color });
    } else {
      page.drawText(t, { x: margin, y, size, font: f, color });
    }
    y -= o.gap || size + 8;
  };

  draw('CENTRUL360', { font: bold, size: 18, center: true });
  draw('Timisoara & Arad', { font, size: 10, color: muted, center: true, gap: 28 });
  draw('CERERE DE CONCEDIU', { font: bold, size: 15, center: true, gap: 34 });

  const row = (label, value) => {
    draw(label, { font: bold, size: 10.5, color: muted, gap: 15 });
    draw(value || '-', { font, size: 12.5, gap: 22 });
  };

  row('Numele si prenumele angajatului', employee.name || '-');
  row('Functia / rolul', employee.role || '-');
  row('Locatia', employee.location || '-');
  if (employee.cnp) row('CNP', employee.cnp);
  row('Tipul de concediu', TYPE_LABELS[request.type] || request.type);
  row('Perioada', formatDateRO(request.startDate) + '  -  ' + formatDateRO(request.endDate));
  row('Numarul de zile (zile calendaristice, luni-vineri)', String(request.workDays));
  if (request.reason) row('Motivul', request.reason);
  row('Data cererii', formatDateRO((request.requestedAt || '').slice(0, 10)));

  y -= 30;
  const half = width / 2;
  draw('____________________________', { gap: 16 });
  const leftY = y + 16;
  page.drawText(stripDiacritics('Semnatura angajat'), { x: margin, y: leftY - 16, size: 10.5, font, color: ink });
  page.drawText('____________________________', { x: margin + half, y: leftY, size: 11, font, color: ink });
  page.drawText(stripDiacritics('Semnatura aprobare / angajator'), { x: margin + half, y: leftY - 16, size: 10.5, font, color: ink });
  y = leftY - 50;

  draw(
    'Document generat automat de portal - se semneaza olograf si se arhiveaza conform procedurilor interne.',
    { font: italic, size: 9, color: muted },
  );

  const bytes = await doc.save();
  return Buffer.from(bytes);
}

module.exports = { buildLeaveRequestPdf, TYPE_LABELS, stripDiacritics };
