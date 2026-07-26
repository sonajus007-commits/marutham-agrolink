// ─────────────────────────────────────────────────────────────────────────────
// Invoice model — the pure, DB-free logic behind a Marutham AgroLink invoice.
//
// It knows nothing about Express or Supabase: give it plain order / seller /
// consumer data (money in RUPEES) and it returns computed "party" invoices with
// GST rolled up, plus the invoice-number strings. The route does the DB work and
// invoiceHtml.js turns the result into a page.
//
// Money convention: this module works in RUPEES (numbers with paise as decimals).
// The route divides the stored paise by 100 before handing data in.
// ─────────────────────────────────────────────────────────────────────────────
const { distCode, stateCode } = require('./codeGen');

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

// ── Central, configurable tax engine ─────────────────────────────────────────
// Goods carry an HSN (looked up here); services carry an explicit gstRate + SAC.
// Until the product master gains HSN/GST columns, every produce line resolves to
// 0% (exempt) — which is correct for fresh agricultural produce.
const TAX_ENGINE = {
  table: {
    '0702': { rate: 0, category: 'EXEMPT' }, // vegetables
    '0703': { rate: 0, category: 'EXEMPT' }, // onions
    '0709': { rate: 0, category: 'EXEMPT' }, // leafy veg
    '0803': { rate: 0, category: 'EXEMPT' }, // bananas
    '1508': { rate: 5, category: 'TAXABLE' }, // groundnut oil
    '0409': { rate: 5, category: 'TAXABLE' }, // honey
  },
  lookup(hsn) {
    return this.table[hsn] || { rate: 0, category: 'EXEMPT' };
  },
  // line.inclusive === true ⇒ the price ALREADY contains GST (tax is extracted);
  // otherwise GST is added on top.
  computeLine(line, interState) {
    const meta =
      line.gstRate != null
        ? { rate: line.gstRate, category: line.gstRate > 0 ? 'TAXABLE' : 'EXEMPT' }
        : this.lookup(line.hsn);
    const gross = round2(line.qty * line.rate - (line.discount || 0));
    let taxable;
    let tax;
    if (line.inclusive) {
      taxable = round2(gross / (1 + meta.rate / 100));
      tax = round2(gross - taxable);
    } else {
      taxable = gross;
      tax = round2(taxable * (meta.rate / 100));
    }
    const cgst = interState ? 0 : round2(tax / 2);
    const sgst = interState ? 0 : round2(tax - cgst); // remainder keeps CGST+SGST == tax
    const igst = interState ? tax : 0;
    return {
      ...line,
      taxable,
      gstRate: meta.rate,
      cgst,
      sgst,
      igst,
      cess: 0,
      amount: round2(taxable + tax),
    };
  },
};

// ── Per-party rollup (a seller or the platform) ──────────────────────────────
function computeParty(party, consumerState) {
  const inter = party.address.state !== consumerState;
  const lines = party.lines.map((l) => TAX_ENGINE.computeLine(l, inter));
  const anyTax = lines.some((l) => l.gstRate > 0);
  const inclusive = lines.length > 0 && lines.every((l) => l.inclusive);
  const subTotal = round2(lines.reduce((s, l) => s + l.qty * l.rate, 0));
  const lineDisc = round2(lines.reduce((s, l) => s + (l.discount || 0), 0));
  const taxable = round2(lines.reduce((s, l) => s + l.taxable, 0));
  const cgst = round2(lines.reduce((s, l) => s + l.cgst, 0));
  const sgst = round2(lines.reduce((s, l) => s + l.sgst, 0));
  const igst = round2(lines.reduce((s, l) => s + l.igst, 0));
  const cess = round2(lines.reduce((s, l) => s + l.cess, 0));
  const grand = round2(taxable + cgst + sgst + igst + cess + (party.roundOff || 0));
  return { inter, lines, anyTax, inclusive, subTotal, lineDisc, taxable, cgst, sgst, igst, cess, grand };
}

// ── Login IDs & invoice numbers ──────────────────────────────────────────────
const stripId = (login) => String(login || '').replace(/_/g, '');

// Platform login code = MA + state + district, e.g. MATNPDK.
function platformLogin(platform) {
  return 'MA' + stateCode(platform.address.state) + distCode(platform.address.district);
}

// Seller invoice no. = LoginID(no _) + INV + YYYYMMDD + 6-digit seq.
// Platform charges invoice = LoginID + PLT + INV + YYYYMMDD + seq.
function invoiceNumber(party, ymd, seq) {
  const seg = party.isPlatform ? 'PLT' : '';
  return stripId(party.login) + seg + 'INV' + ymd + String(seq).padStart(6, '0');
}

// Order-level platform reference (no PLT) — the invoice for the whole order.
function platformInvoiceRef(platform, ymd, seq) {
  return stripId(platformLogin(platform)) + 'INV' + ymd + String(seq).padStart(6, '0');
}

// Combined statutory heading printed on every page.
const DOC_TITLE = 'Tax Invoice / Bill of Supply / Cash Memo';

// PAN sits inside the GSTIN (chars 3–12); else use a supplied PAN.
function panOf(party) {
  if (party.gstin && party.gstin.length >= 12) return party.gstin.slice(2, 12).toUpperCase();
  return party.pan || null;
}

// IST date → YYYYMMDD (invoices are issued in India).
function ymdIST(date) {
  const ist = new Date(new Date(date).getTime() + 5.5 * 60 * 60 * 1000);
  const yyyy = ist.getUTCFullYear();
  const mm = String(ist.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(ist.getUTCDate()).padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
}

// Trailing 6-digit daily sequence from an order code (ORD…YYMMDD######).
function seqFromCode(code) {
  const m = String(code || '').match(/(\d{6})$/);
  return m ? parseInt(m[1], 10) : 0;
}

module.exports = {
  round2,
  TAX_ENGINE,
  computeParty,
  platformLogin,
  invoiceNumber,
  platformInvoiceRef,
  panOf,
  ymdIST,
  seqFromCode,
  DOC_TITLE,
};
