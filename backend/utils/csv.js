// ─────────────────────────────────────────────────────────────────────────────
// Minimal, correct CSV builder for the reports export (routes/reports.js).
//
// RFC-4180 quoting: a field is wrapped in double quotes when it contains a comma,
// a quote, or a newline, and any embedded quote is doubled. Everything is quoted-
// safe, so a seller name with a comma or a note with a line break can't shift the
// columns. Money is stored in paise, so callers pass a formatter for those fields —
// this module never guesses units.
// ─────────────────────────────────────────────────────────────────────────────

function cell(value) {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

// headers: [{ key, label }]; rows: array of objects. Returns a CSV string with a
// header line. A leading BOM so Excel opens UTF-8 (Tamil names) correctly.
function toCsv(headers, rows) {
  const head = headers.map((h) => cell(h.label)).join(',');
  const body = (rows || []).map((r) => headers.map((h) => cell(r[h.key])).join(',')).join('\r\n');
  return '﻿' + head + (body ? '\r\n' + body : '') + '\r\n';
}

// Paise → a plain rupee number string for a CSV cell (no ₹ symbol, no thousands
// separators — a spreadsheet wants a number it can sum).
function rupees(paise) {
  if (paise === null || paise === undefined || paise === '') return '';
  const n = Number(paise);
  return Number.isFinite(n) ? (n / 100).toFixed(2) : '';
}

module.exports = { toCsv, rupees };
