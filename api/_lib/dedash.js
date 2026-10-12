// No long dashes anywhere the clients or the team read: "—" / "–" (and the "−" minus) become a
// comma or a plain hyphen, by context. The code and the pages are already clean; this catches text
// that lives in the data (offers edited in Admin, automation messages, notes) on its way out.
// Same rules as portal-kit.js → K.dedash.

const WORD = /[\p{L}\p{N}]/u;

function dedash(input) {
  if (typeof input !== 'string' || !/[—–−]/.test(input)) return input;
  let s = input.replace(/−/g, '-');
  s = s.replace(/(\d)[ \t ]*–[ \t ]*(\d)/g, '$1-$2').replace(/(\d)—(\d)/g, '$1-$2'); // ranges: 6-8, 10:00-11:30
  return s.replace(/[ \t ]*[—–][ \t ]*/g, (m, off, str) => {
    const prev = off > 0 ? str[off - 1] : '\n';
    const next = off + m.length < str.length ? str[off + m.length] : '\n';
    const spacedL = /^[ \t ]/.test(m), spacedR = /[ \t ]$/.test(m);
    if (!WORD.test(prev) && !WORD.test(next) && next !== '\n') return m.replace(/[—–]/, '-'); // placeholder / separator
    if (/[\n"'„“(\[]/.test(prev)) return (spacedL ? ' ' : '') + '- ';                        // bullet / attribution
    if (/[\n”)\]"']/.test(next)) return '';                                                  // end of the sentence
    if (!spacedL && !spacedR) return m.includes('–') ? '-' : ' - ';
    if (/[,.;:!?]/.test(prev)) return ' ';
    if (/[A-ZĂÂÎȘȚŞŢ]/.test(next)) return ' - ';                                             // "Titlu - Subtitlu"
    return ', ';
  });
}

// Every string inside an object / array (offers, feeds).
function dedashDeep(v) {
  if (typeof v === 'string') return dedash(v);
  if (Array.isArray(v)) return v.map(dedashDeep);
  if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) o[k] = dedashDeep(v[k]); return o; }
  return v;
}

module.exports = { dedash, dedashDeep };
