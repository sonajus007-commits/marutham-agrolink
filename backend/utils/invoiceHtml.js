// ─────────────────────────────────────────────────────────────────────────────
// invoiceHtml.js — renders a Marutham AgroLink invoice as a complete, printable
// A4 HTML document. One self-contained page per seller, plus a platform-services
// page for the delivery / handling / multi-seller charges. Mirrors the approved
// design; every field is data-driven and blanks itself when data is absent.
// ─────────────────────────────────────────────────────────────────────────────
const {
  computeParty,
  invoiceNumber,
  panOf,
  DOC_TITLE,
} = require('./invoiceModel');

const esc = (s) =>
  String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const line = (label, val) => (val ? `<dt>${esc(label)}</dt><dd>${esc(val)}</dd>` : '');
const rowAlways = (label, val) => `<dt>${esc(label)}</dt><dd>${val ? esc(val) : '&nbsp;'}</dd>`;

// ── Amount → words (Indian system) ───────────────────────────────────────────
function inWords(num) {
  const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const two = (n) => (n < 20 ? a[n] : b[Math.floor(n / 10)] + (n % 10 ? ' ' + a[n % 10] : ''));
  const three = (n) => (n >= 100 ? a[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' : '') : '') + (n % 100 ? two(n % 100) : '');
  let rupees = Math.floor(num);
  const paise = Math.round((num - rupees) * 100);
  let out = '';
  if (rupees === 0) out = 'Zero';
  const cr = Math.floor(rupees / 10000000); rupees %= 10000000;
  const lk = Math.floor(rupees / 100000); rupees %= 100000;
  const th = Math.floor(rupees / 1000); rupees %= 1000;
  if (cr) out += two(cr) + ' Crore ';
  if (lk) out += two(lk) + ' Lakh ';
  if (th) out += two(th) + ' Thousand ';
  if (rupees) out += three(rupees);
  out = out.trim() + ' Rupees';
  if (paise) out += ' and ' + two(paise) + ' Paise';
  return out + ' only';
}

function statusPill(status) {
  const m = {
    PAID: ['st-paid', 'Paid'], UNPAID: ['st-unpaid', 'Unpaid'],
    'PARTIALLY PAID': ['st-partial', 'Partially paid'],
    CANCELLED: ['st-cancel', 'Cancelled'], REFUNDED: ['st-refund', 'Refunded'],
  };
  const [cls, txt] = m[status] || m.UNPAID;
  return `<span class="status ${cls}"><span class="dot"></span>${esc(txt.toUpperCase())}</span>`;
}

// ── Components ───────────────────────────────────────────────────────────────
function InvoiceHeader(ctx, party) {
  const p = ctx.platform;
  return `
  <div class="ihead">
    <div class="logo">
      <div class="logomark">${p.emoji}</div>
      <div>
        <div class="wordmark">${esc(p.short)}</div>
        <div class="legalname">${esc(p.name)}</div>
      </div>
    </div>
    <div class="titlebox">
      ${party.isPlatform ? '<div class="doctype">PLATFORM SERVICES</div>' : ''}
      <div class="doctitle combo">${esc(DOC_TITLE)}</div>
      <div class="dotorig">ORIGINAL FOR RECIPIENT</div>
      ${statusPill(ctx.order.payStatus)}
    </div>
  </div>
  <div class="brandbar"></div>`;
}

function SellerSection(party) {
  const a = party.address;
  const isP = party.isPlatform;
  const tag = isP ? '<span class="taglet retail">PLATFORM · SERVICE PROVIDER</span>'
    : party.type === 'Retailer' ? '<span class="taglet retail">RETAILER</span>'
      : '<span class="taglet">FARMER · DIRECT</span>';
  return `
  <div class="card">
    <h4><span class="ic">${isP ? '🏢' : '🚜'}</span> ${isP ? 'Service provided by' : 'Sold by / Seller'}</h4>
    <div class="who">${esc(party.name)}</div>
    <div class="sub">${esc([a.village, a.district].filter(Boolean).join(', '))}<br>${esc([a.state, a.pincode].filter(Boolean).join(' – '))}</div>
    <dl class="kv">
      ${line('Login ID', party.login)}
      ${rowAlways('PAN', panOf(party))}
      ${rowAlways('GSTIN', party.gstin)}
      ${rowAlways('FSSAI', party.fssai)}
    </dl>
    ${tag}
  </div>`;
}

function CustomerSection(ctx) {
  const c = ctx.consumer;
  const a = c.address || {};
  const addr = [
    a.house, a.street, a.landmark ? 'Landmark: ' + a.landmark : '',
    [a.city, a.district].filter(Boolean).join(', '),
    [a.state, a.pincode].filter(Boolean).join(' – '),
  ].filter(Boolean).map(esc).join('<br>');
  return `
  <div class="card">
    <h4><span class="ic">📍</span> Billed &amp; shipped to</h4>
    <div class="who">${esc(c.name)}</div>
    <div class="sub">${addr}</div>
    <dl class="kv">
      ${line('Customer ID', c.login)}
      ${line('Mobile', c.phone)}
    </dl>
  </div>`;
}

function InvoiceInfoCard(ctx, party) {
  const sellerLabel = party.isPlatform ? 'Platform Invoice No.' : 'Seller Invoice No.';
  return `
  <div class="card">
    <h4><span class="ic">🧾</span> Invoice information</h4>
    <dl class="kv stack">
      ${line(sellerLabel, invoiceNumber(party, ctx.ymd, ctx.seq))}
      ${line('Platform Invoice Ref.', ctx.platformRef)}
      ${line('Invoice Date', ctx.order.invoiceDate)}
      ${line('Order No.', ctx.order.code)}
      ${line('Order Date', ctx.order.date)}
      ${line('Place of supply', party.address.state)}
      ${line('Place of delivery', (ctx.consumer.address || {}).state)}
    </dl>
  </div>`;
}

function InfoStrip(ctx) {
  const o = ctx.order;
  const cells = [
    ['Payment method', o.payMethod],
    ['Payment status', o.payStatusLabel],
    ['Delivery agent', o.agent],
    ['Delivered on', o.deliveredOn],
    ['Order code', o.code],
  ];
  return `<div class="infostrip">${cells.map(([l, v]) => `
    <div class="cell"><div class="l">${esc(l)}</div><div class="v">${esc(v || '—')}</div></div>`).join('')}</div>`;
}

function ItemTable(party, comp) {
  const isP = party.isPlatform;
  const rows = comp.lines.map((l, i) => `
    <tr>
      <td class="l tabular">${i + 1}</td>
      <td class="l">
        <div class="pname">${esc(l.name)}</div>
        <div class="pmeta">${esc(l.variant || '')}
          ${isP ? '<span class="chip">Platform service</span>'
            : (l.category ? `<span class="chip">${esc(l.category)}</span>` : '')}
          ${l.remarks ? `<span class="chip">${esc(l.remarks)}</span>` : ''}
        </div>
      </td>
      <td class="hsn">${esc(l.hsn || l.sac || '—')}</td>
      <td class="tabular">${l.qty} ${esc(l.unit || '')}</td>
      <td class="tabular">${inr(l.rate)}</td>
      <td class="tabular">${l.discount ? '–' + inr(l.discount) : '—'}</td>
      <td class="tabular">${inr(l.taxable)}</td>
      <td class="gstpct ${l.gstRate === 0 ? 'gst-exempt' : ''}">${l.gstRate === 0 ? 'NIL' : l.gstRate + '%'}</td>
      <td class="tabular">${comp.inter ? '—' : inr(l.cgst)}</td>
      <td class="tabular">${comp.inter ? '—' : inr(l.sgst)}</td>
      <td class="tabular">${comp.inter ? inr(l.igst) : '—'}</td>
      <td class="amt tabular">${inr(l.amount)}</td>
    </tr>`).join('');
  const label = isP ? 'Platform service charges — taxable supply'
    : comp.anyTax ? 'Items — taxable supply' : 'Items — GST-exempt supply';
  return `
  <div class="sectlabel">${label}</div>
  <div class="tablewrap">
    <table class="items">
      <thead><tr>
        <th class="l">#</th><th class="l">${isP ? 'Service &amp; details' : 'Product &amp; details'}</th><th>HSN/SAC</th>
        <th>Qty</th><th>${isP ? 'Charge' : 'Unit price'}</th><th>Disc.</th><th>Taxable</th>
        <th>GST</th><th>CGST</th><th>SGST</th><th>IGST</th><th>Amount</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

function OrderSummary(ctx, party, comp) {
  const isP = party.isPlatform;
  const paid = ctx.order.payStatus === 'PAID';
  const row = (lbl, val, cls = '') => `<div class="srow ${cls}"><span class="lbl">${esc(lbl)}</span><span class="val">${val}</span></div>`;
  const optRow = (lbl, amt, cls = '') => (amt > 0 ? row(lbl, inr(amt), cls) : '');
  const grand = comp.grand;
  const unit = isP ? 'services' : 'items';
  const taxRows = comp.inter ? optRow('IGST', comp.igst) : optRow('CGST', comp.cgst) + optRow('SGST', comp.sgst);
  const body = comp.inclusive ? `
    ${row('Charges (' + comp.lines.length + ' ' + unit + ', incl. GST)', inr(comp.subTotal))}
    ${isP && ctx.order.deliveryWaived ? row('Delivery', 'WAIVED · order ≥ ₹400', 'free') : ''}
    <div class="srow" style="border-bottom:0;padding-bottom:0"><span class="lbl" style="font-size:10px;color:var(--faint)">GST included in the above</span><span class="val"></span></div>
    ${row('&nbsp;&nbsp;Taxable value', inr(comp.taxable))}
    ${taxRows}
    ${optRow('&nbsp;&nbsp;CESS', comp.cess)}
    ${party.roundOff ? row('Round off', (party.roundOff < 0 ? '–' : '+') + inr(Math.abs(party.roundOff))) : ''}
    ${row('Grand total', inr(grand), 'grand')}
  ` : `
    ${row('Sub-total (' + comp.lines.length + ' ' + unit + ')', inr(comp.subTotal))}
    ${comp.lineDisc > 0 ? row('Item discount', '–' + inr(comp.lineDisc), 'disc') : ''}
    ${row('Taxable value', inr(comp.taxable))}
    ${taxRows}
    ${optRow('CESS', comp.cess)}
    ${party.roundOff ? row('Round off', (party.roundOff < 0 ? '–' : '+') + inr(Math.abs(party.roundOff))) : ''}
    ${row('Grand total', inr(grand), 'grand')}
  `;
  return `
  <div class="summary">
    ${body}
    ${paid ? row('Amount paid (' + esc(ctx.order.payMethod) + ')', inr(grand), 'paidrow') : row('Amount payable', inr(grand), 'duerow')}
    ${paid ? row('Amount pending', inr(0)) : ''}
    <div class="amount-words">Amount in words: <b>${esc(inWords(grand))}</b></div>
  </div>`;
}

function Verify(ctx) {
  return `
  <div class="verify">
    <div>
      <div class="qr">${ctx.qrDataUri ? `<img src="${ctx.qrDataUri}" width="72" height="72" alt="Invoice verification QR">` : fauxQR()}</div>
      <div class="qcap">Invoice copy</div>
    </div>
    <div class="note">
      <b>Scan to view this invoice copy.</b><br>
      Links to the digital copy of ${esc(ctx.order.code)} for verification.
    </div>
  </div>`;
}

// A static faux-QR placeholder (deterministic grid). Real QR/IRN slots in later.
function fauxQR() {
  let seed = 42;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  const n = 13, cells = [];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const eye = (x < 4 && y < 4) || (x > n - 5 && y < 4) || (x < 4 && y > n - 5);
    if (eye) continue;
    if (rnd() > 0.5) cells.push(`<rect x="${x}" y="${y}" width="1" height="1"/>`);
  }
  const eye = (ox, oy) => `<rect x="${ox}" y="${oy}" width="3" height="3" fill="none" stroke="#16211b" stroke-width="0.6"/><rect x="${ox + 1}" y="${oy + 1}" width="1" height="1"/>`;
  return `<svg viewBox="0 0 13 13" width="64" height="64" xmlns="http://www.w3.org/2000/svg" fill="#16211b">
    ${cells.join('')}${eye(0, 0)}${eye(10, 0)}${eye(0, 10)}</svg>`;
}

function Terms(ctx) {
  return `
  <div class="terms">
    <h3>Terms, roles &amp; responsibilities</h3>
    <div class="roleline"><b>Platform role.</b> ${esc(ctx.platform.name)} operates a digital marketplace connecting farmers, vendors and consumers, and facilitates product discovery, ordering, payment collection and logistics coordination. Ownership of the agricultural produce remains with the respective seller until delivery is completed, unless otherwise required by applicable law.</div>
    <div class="termgrid">
      <div>
        <h5>Seller is responsible for</h5>
        <ul><li>Product quality &amp; freshness</li><li>Correct weight &amp; quantity</li><li>Food safety &amp; legal compliance</li><li>Proper packaging before dispatch</li><li>Accurate product descriptions</li><li>Holding applicable licences</li></ul>
      </div>
      <div>
        <h5>Marutham AgroLink is responsible for</h5>
        <ul><li>Running the marketplace platform</li><li>Payment processing &amp; order management</li><li>Customer support &amp; complaints</li><li>Delivery coordination</li><li><b>Resolving delivery-related failures</b></li><li>Refunds from logistics/platform issues per the Refund Policy</li><li>Protecting customer data</li></ul>
      </div>
      <div>
        <h5>Consumer should</h5>
        <ul><li>Verify products upon delivery</li><li>Report issues within the complaint window</li><li>Provide accurate delivery details</li><li>Follow return &amp; refund policies</li></ul>
      </div>
      <div>
        <h5>Good to know</h5>
        <ul><li>Fresh produce is GST-exempt; taxed items show HSN &amp; GST split</li><li>Each seller is invoiced separately (see page no.)</li><li>Platform fees are shown apart from seller revenue</li><li>Charges are inclusive of applicable GST</li></ul>
      </div>
    </div>
  </div>`;
}

function Footer(ctx, party, comp, pageNo, pageCount) {
  const p = ctx.platform;
  const docWord = comp.anyTax ? 'tax invoice' : 'bill of supply';
  const which = party.isPlatform ? 'Platform-services invoice' : `Seller ${pageNo} of ${pageCount - 1}`;
  return `
  <div class="foot">
    <div class="footbar">
      <div class="thanks">Thank you for shopping with ${esc(p.short)} 🌾</div>
      <div class="footmeta">
        Customer care ${esc(p.care)} · ${esc(p.email)}<br>${esc(p.web)}
      </div>
    </div>
    <div class="genline">Generated electronically — no signature required. This is a computer-generated ${docWord}.</div>
  </div>
  <div class="pageno">${which} &nbsp;·&nbsp; <b>Page ${pageNo} of ${pageCount}</b></div>`;
}

function PartyInvoiceSheet(ctx, party, pageNo, pageCount) {
  const comp = computeParty(party, (ctx.consumer.address || {}).state);
  return `
  <section class="sheet">
    ${InvoiceHeader(ctx, party)}
    <div class="grid3">
      ${SellerSection(party)}
      ${CustomerSection(ctx)}
      ${InvoiceInfoCard(ctx, party)}
    </div>
    ${InfoStrip(ctx)}
    ${ItemTable(party, comp)}
    <div class="lower">${OrderSummary(ctx, party, comp)}</div>
    ${Verify(ctx)}
    ${Terms(ctx)}
    ${Footer(ctx, party, comp, pageNo, pageCount)}
  </section>`;
}

// ── Full document ────────────────────────────────────────────────────────────
function renderInvoiceHtml(ctx) {
  const pageCount = ctx.parties.length;
  const sheets = ctx.parties.map((party, i) => PartyInvoiceSheet(ctx, party, i + 1, pageCount)).join('');
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Invoice ${esc(ctx.order.code)} — ${esc(ctx.platform.short)}</title>
<style>${STYLE}</style>
</head><body>
<div class="actionbar">
  <span>Invoice ${esc(ctx.order.code)}</span>
  <button class="btn" onclick="window.print()" type="button">Print / Save PDF</button>
</div>
<div class="canvas">${sheets}</div>
</body></html>`;
}

// ── Styles (ported from the approved design) ─────────────────────────────────
const STYLE = `
  :root{
    --canvas:#e8ebe4; --paper:#ffffff; --ink:#16211b; --muted:#667066; --faint:#8a938a;
    --rule:#e6eae1; --rule-strong:#d0d7cb; --wash:#f5f8f2; --wash2:#eef3ea;
    --forest:#1b5e20; --forest-mid:#2e7d32; --leaf:#43a047; --leaf-soft:#e4f2e4;
    --amber-ink:#8a6d00; --amber-soft:#fbf3d6;
    --paid:#1b7a3e; --paid-soft:#e2f2e6; --due:#9a6a00; --due-soft:#fbf1d4;
    --cancel:#b3261e; --cancel-soft:#fbe6e4; --refund:#3a5a8a; --refund-soft:#e6edf6;
    --shadow:0 1px 2px rgba(20,40,25,.08), 0 12px 34px rgba(20,40,25,.14);
    --sans:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,"Noto Sans",sans-serif;
    --serif:"Iowan Old Style","Palatino Linotype",Palatino,"Book Antiqua",Georgia,"Times New Roman",serif;
  }
  @media (prefers-color-scheme: dark){ :root{ --canvas:#0e1512; } }
  *{ box-sizing:border-box; } html,body{ margin:0; }
  body{ background:var(--canvas); color:var(--ink); font-family:var(--sans); font-size:14px; line-height:1.5;
    -webkit-font-smoothing:antialiased; text-rendering:optimizeLegibility; }
  .tabular{ font-variant-numeric:tabular-nums lining-nums; }
  .actionbar{ position:sticky; top:0; z-index:20; display:flex; align-items:center; justify-content:space-between;
    gap:16px; padding:10px 18px; background:#12241a; color:#eaf3ec; font-size:13px; }
  .btn{ appearance:none; border:0; cursor:pointer; background:#fff; color:#12241a; font:inherit; font-weight:600;
    padding:8px 16px; border-radius:8px; }
  .btn:hover{ background:#eef3ea; } .btn:focus-visible{ outline:2px solid #7fd694; outline-offset:2px; }
  .canvas{ padding:28px 16px 60px; }
  .sheet{ background:var(--paper); color:var(--ink); width:210mm; min-height:297mm; margin:0 auto 26px;
    padding:13mm 13mm 12mm; position:relative; box-shadow:var(--shadow); border-radius:2px;
    display:flex; flex-direction:column; }
  .ihead{ display:flex; justify-content:space-between; gap:20px; align-items:flex-start; }
  .logo{ display:flex; gap:11px; align-items:center; }
  .logomark{ width:46px; height:46px; border-radius:12px; flex:none;
    background:linear-gradient(150deg,var(--forest-mid),var(--forest)); display:grid; place-items:center;
    color:#fff; font-size:24px; box-shadow:inset 0 0 0 1px rgba(255,255,255,.15); }
  .wordmark{ font-family:var(--serif); font-size:22px; font-weight:600; color:var(--forest); line-height:1.05; }
  .legalname{ font-size:11px; color:var(--muted); margin-top:2px; }
  .titlebox{ text-align:right; min-width:180px; }
  .doctype{ font-size:9px; letter-spacing:1.6px; color:var(--muted); font-weight:700; }
  .doctitle{ font-family:var(--serif); font-size:23px; font-weight:700; color:var(--ink); line-height:1; margin-top:2px; }
  .doctitle.combo{ font-size:15px; line-height:1.2; letter-spacing:.2px; text-wrap:balance; max-width:220px; margin-left:auto; }
  .dotorig{ font-size:9px; letter-spacing:1.4px; color:var(--faint); margin-top:3px; }
  .status{ display:inline-flex; align-items:center; gap:6px; margin-top:9px; font-size:11.5px; font-weight:700;
    letter-spacing:.4px; padding:5px 12px; border-radius:999px; border:1px solid transparent; }
  .status .dot{ width:7px; height:7px; border-radius:50%; background:currentColor; }
  .st-paid{ color:var(--paid); background:var(--paid-soft); border-color:#bfe3c9; }
  .st-unpaid,.st-partial{ color:var(--due); background:var(--due-soft); border-color:#ecdca0; }
  .st-cancel{ color:var(--cancel); background:var(--cancel-soft); border-color:#f0c5c1; }
  .st-refund{ color:var(--refund); background:var(--refund-soft); border-color:#c7d4e8; }
  .brandbar{ height:3px; border-radius:2px; margin:11px 0 0; background:linear-gradient(90deg,var(--forest),var(--leaf) 60%,var(--amber-ink)); }
  .grid3{ display:grid; grid-template-columns:1fr 1fr 1fr; gap:11px; margin-top:13px; }
  .card{ background:var(--wash); border:1px solid var(--rule); border-radius:10px; padding:11px 13px; }
  .card h4{ margin:0 0 7px; font-size:9px; letter-spacing:1.3px; text-transform:uppercase; color:var(--forest);
    font-weight:700; display:flex; align-items:center; gap:6px; }
  .card h4 .ic{ font-size:11px; }
  .who{ font-size:13px; font-weight:700; color:var(--ink); line-height:1.25; }
  .sub{ font-size:11px; color:var(--muted); line-height:1.5; margin-top:2px; }
  .kv{ display:grid; grid-template-columns:auto 1fr; gap:2px 8px; margin-top:7px; font-size:10px; }
  .kv dt{ color:var(--faint); white-space:nowrap; }
  .kv dd{ margin:0; color:var(--ink); text-align:right; font-weight:600; white-space:nowrap; }
  /* Stacked variant — label on its own line, value on a single full-width line
     below it, so long invoice / reference numbers stay on one line without
     squeezing the label into a wrapped, gappy column. */
  .kv.stack{ display:block; }
  .kv.stack dt{ margin-top:5px; font-size:9px; }
  .kv.stack dt:first-child{ margin-top:0; }
  .kv.stack dd{ text-align:left; margin-top:0; font-size:10px; font-variant-numeric:tabular-nums; }
  .taglet{ display:inline-block; font-size:9px; font-weight:700; letter-spacing:.4px; padding:2px 7px;
    border-radius:5px; background:var(--leaf-soft); color:var(--forest); margin-top:6px; }
  .taglet.retail{ background:var(--amber-soft); color:var(--amber-ink); }
  .infostrip{ margin-top:12px; display:grid; grid-template-columns:repeat(5,1fr); border:1px solid var(--rule);
    border-radius:10px; overflow:hidden; background:var(--wash); }
  .infostrip .cell{ padding:8px 11px; border-right:1px solid var(--rule); }
  .infostrip .cell:nth-child(5n){ border-right:0; }
  .infostrip .cell .l{ font-size:8.5px; letter-spacing:.7px; text-transform:uppercase; color:var(--faint); }
  .infostrip .cell .v{ font-size:11.5px; font-weight:600; color:var(--ink); margin-top:2px; }
  .sectlabel{ font-size:9px; letter-spacing:1.3px; text-transform:uppercase; color:var(--forest); font-weight:700; margin:16px 0 7px; }
  .tablewrap{ overflow-x:auto; }
  table.items{ width:100%; border-collapse:collapse; font-size:10.5px; }
  table.items thead th{ background:var(--forest); color:#fff; font-weight:600; text-align:right; padding:7px 8px;
    font-size:9px; letter-spacing:.4px; white-space:nowrap; }
  table.items thead th:first-child, table.items thead th.l{ text-align:left; }
  table.items tbody td{ padding:8px; border-bottom:1px solid var(--rule); vertical-align:top; text-align:right; }
  table.items tbody td.l{ text-align:left; }
  table.items tbody tr:nth-child(even){ background:var(--wash); }
  .pname{ font-weight:700; color:var(--ink); font-size:11px; }
  .pmeta{ color:var(--muted); font-size:9.5px; line-height:1.5; margin-top:2px; }
  .pmeta .chip{ display:inline-block; background:var(--wash2); border:1px solid var(--rule); border-radius:4px;
    padding:0 5px; margin:2px 4px 0 0; color:var(--muted); font-size:9px; }
  .hsn{ font-variant-numeric:tabular-nums; font-weight:600; color:var(--ink); }
  .gstpct{ font-weight:700; } .gst-exempt{ color:var(--leaf); }
  td.amt{ font-weight:700; }
  .lower{ display:flex; justify-content:flex-end; margin-top:14px; }
  .lower .summary{ width:min(410px,100%); }
  .summary{ border:1px solid var(--rule); border-radius:10px; padding:5px 14px; align-self:start; }
  .srow{ display:flex; justify-content:space-between; align-items:baseline; padding:6px 0; font-size:11.5px; border-bottom:1px dashed var(--rule); }
  .srow:last-child{ border-bottom:0; }
  .srow .lbl{ color:var(--muted); }
  .srow .val{ font-variant-numeric:tabular-nums; font-weight:600; color:var(--ink); }
  .srow.free .val{ color:var(--leaf); font-weight:700; } .srow.disc .val{ color:var(--leaf); }
  .srow.grand{ margin-top:2px; padding:11px 0 9px; border-top:2px solid var(--forest); border-bottom:0; }
  .srow.grand .lbl{ font-size:13px; font-weight:700; color:var(--ink); }
  .srow.grand .val{ font-size:18px; font-weight:800; color:var(--forest); }
  .srow.paidrow .val{ color:var(--paid); } .srow.duerow .val{ color:var(--due); }
  .amount-words{ font-size:10px; color:var(--muted); margin-top:8px; padding-top:8px; border-top:1px solid var(--rule); }
  .amount-words b{ color:var(--ink); }
  .verify{ display:grid; grid-template-columns:auto 1fr; gap:14px; align-items:center; margin-top:14px;
    padding:12px 14px; border:1px dashed var(--rule-strong); border-radius:10px; background:var(--wash); }
  .qr{ width:78px; height:78px; border-radius:8px; background:#fff; border:1px solid var(--rule); display:grid; place-items:center; }
  .qcap{ font-size:8.5px; letter-spacing:.4px; text-transform:uppercase; color:var(--faint); text-align:center; margin-top:4px; }
  .verify .note{ font-size:10px; color:var(--muted); line-height:1.5; } .verify .note b{ color:var(--ink); }
  .terms{ margin-top:16px; border-top:1px solid var(--rule-strong); padding-top:11px; }
  .terms h3{ font-size:10px; letter-spacing:1.2px; text-transform:uppercase; color:var(--forest); margin:0 0 8px; }
  .termgrid{ display:grid; grid-template-columns:repeat(4,1fr); gap:12px; }
  .termgrid h5{ margin:0 0 5px; font-size:10px; color:var(--ink); font-weight:700; }
  .termgrid ul{ margin:0; padding-left:14px; } .termgrid li{ font-size:9px; color:var(--muted); line-height:1.5; margin-bottom:2px; }
  .roleline{ font-size:9.5px; color:var(--muted); line-height:1.55; margin-bottom:9px; } .roleline b{ color:var(--ink); }
  .foot{ margin-top:auto; padding-top:12px; }
  .footbar{ display:flex; justify-content:space-between; align-items:center; gap:12px; border-top:2px solid var(--forest); padding-top:9px; flex-wrap:wrap; }
  .thanks{ font-family:var(--serif); font-size:13px; color:var(--forest); font-weight:600; }
  .footmeta{ font-size:9.5px; color:var(--muted); text-align:right; line-height:1.5; }
  .genline{ text-align:center; font-size:9px; color:var(--faint); margin-top:8px; }
  .pageno{ position:absolute; bottom:6mm; right:13mm; font-size:9px; color:var(--faint); font-variant-numeric:tabular-nums; }
  .pageno b{ color:var(--muted); }
  @media (max-width:900px){
    .sheet{ width:100%; min-height:0; padding:20px 16px 40px; }
    .grid3{ grid-template-columns:1fr; } .infostrip{ grid-template-columns:1fr 1fr; }
    .infostrip .cell:nth-child(2n){ border-right:0; } .lower{ justify-content:stretch; }
    .termgrid{ grid-template-columns:1fr 1fr; } .ihead{ flex-direction:column; } .titlebox{ text-align:left; }
    .doctitle.combo{ margin-left:0; }
  }
  @page{ size:A4; margin:0; }
  @media print{
    :root{ --canvas:#fff; } .actionbar{ display:none !important; } body{ background:#fff; } .canvas{ padding:0; }
    .sheet{ box-shadow:none; margin:0; border-radius:0; width:auto; min-height:297mm; break-after:page; page-break-after:always; }
    .sheet:last-child{ break-after:auto; page-break-after:auto; }
    .lower,.verify,.terms,.grid3,tr{ break-inside:avoid; page-break-inside:avoid; }
    thead{ display:table-header-group; }
  }
`;

module.exports = { renderInvoiceHtml };
