/**
 * Per-order invoice as a PDF, streamed straight to the HTTP response.
 *
 * Money here is PAISE, exactly as stored — this path never goes through the
 * res.json override that convertMoney hooks, so it divides by 100 itself. The
 * standard PDF fonts (Helvetica) do not carry the ₹ glyph (U+20B9); it would
 * render as a blank box, so every amount is prefixed "Rs." instead.
 *
 * The charge lines mirror deriveOrderCharges (packages/lib/src/orders.ts): the
 * consumer market fee is the RESIDUAL total − item_total − handling − delivery,
 * NOT the `market_fee` column (that is platform revenue and must never appear on
 * a customer's bill).
 */
const PDFDocument = require('pdfkit');

const FOREST = '#0d1f16';
const LEAF = '#2e7d32';
const GRAY = '#6b7280';
const RULE = '#d1d5db';

const rs = (paise) => 'Rs. ' + (Number(paise || 0) / 100).toFixed(2);

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

/** One-line postal address from a delivery_address object. */
function addressLines(addr) {
  if (!addr || typeof addr !== 'object') return [];
  const parts = [
    [addr.house_no, addr.street1].filter(Boolean).join(', '),
    addr.street2,
    addr.landmark,
    [addr.village_town, addr.city].filter(Boolean).join(', '),
    [addr.district, addr.state].filter(Boolean).join(', '),
    addr.pincode,
  ];
  return parts.map((p) => (p == null ? '' : String(p)).trim()).filter(Boolean);
}

/**
 * Stream a PDF invoice for `order` to `res`.
 *
 * @param res   Express response — headers are set here and the doc is piped in.
 * @param order The parent (or standalone) order row, raw paise.
 * @param sellerGroups [{ seller_name, items: [{name, qty, unit, price}] }] — one
 *              group for a single-seller order, one per child for a split parent.
 */
function streamInvoice(res, order, sellerGroups) {
  const doc = new PDFDocument({ size: 'A4', margin: 48 });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="invoice-${order.code || 'order'}.pdf"`,
  );
  doc.pipe(res);

  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const width = right - left;

  // ── Header ────────────────────────────────────────────────────────────────
  doc.fillColor(FOREST).font('Helvetica-Bold').fontSize(20).text('Marutham AgroLink', left, 48);
  doc.fillColor(GRAY).font('Helvetica').fontSize(9)
    .text('Farm-fresh produce, direct from the source', left, 74);

  doc.fillColor(FOREST).font('Helvetica-Bold').fontSize(16)
    .text('INVOICE', left, 50, { width, align: 'right' });
  doc.fillColor(GRAY).font('Helvetica').fontSize(10)
    .text(order.code || '', left, 72, { width, align: 'right' });

  doc.moveTo(left, 100).lineTo(right, 100).strokeColor(RULE).lineWidth(1).stroke();

  // ── Meta + Bill-to ──────────────────────────────────────────────────────────
  let y = 116;
  doc.fontSize(9).fillColor(GRAY).font('Helvetica-Bold').text('BILL TO', left, y);
  doc.fillColor(FOREST).font('Helvetica').fontSize(11).text(order.consumer_name || '—', left, y + 13);
  let by = y + 28;
  if (order.consumer_phone) {
    doc.fillColor(GRAY).fontSize(9).text(order.consumer_phone, left, by);
    by += 13;
  }
  for (const line of addressLines(order.delivery_address)) {
    doc.fillColor(GRAY).fontSize(9).text(line, left, by, { width: width / 2 - 10 });
    by = doc.y;
  }

  // Right column: order facts
  const rx = left + width / 2;
  const rw = width / 2;
  const fact = (label, value, yy) => {
    doc.fillColor(GRAY).font('Helvetica').fontSize(9).text(label, rx, yy, { width: rw, align: 'left' });
    doc.fillColor(FOREST).font('Helvetica-Bold').fontSize(9)
      .text(value, rx, yy, { width: rw, align: 'right' });
  };
  fact('Order date', fmtDate(order.created_at), y);
  fact('Payment', order.pay_method || '—', y + 15);
  fact('Payment status', order.pay_status || '—', y + 30);
  if (order.delivered_at) fact('Delivered', fmtDate(order.delivered_at), y + 45);

  y = Math.max(by, y + 60) + 14;

  // ── Items table ─────────────────────────────────────────────────────────────
  const col = { item: left, qty: left + width * 0.5, price: left + width * 0.68, amt: left };
  const amtW = width;
  const priceRight = { width: width * 0.86, align: 'right' };

  const header = (yy) => {
    doc.fillColor(GRAY).font('Helvetica-Bold').fontSize(8.5);
    doc.text('ITEM', col.item, yy);
    doc.text('QTY', col.qty, yy, { width: width * 0.16, align: 'right' });
    doc.text('UNIT PRICE', col.qty, yy, { width: width * 0.34, align: 'right' });
    doc.text('AMOUNT', col.amt, yy, { width: amtW, align: 'right' });
    doc.moveTo(left, yy + 14).lineTo(right, yy + 14).strokeColor(RULE).lineWidth(0.7).stroke();
  };
  header(y);
  y += 22;

  const rowH = 20;
  const ensureSpace = (need) => {
    if (y + need > doc.page.height - doc.page.margins.bottom - 120) {
      doc.addPage();
      y = doc.page.margins.top;
      header(y);
      y += 22;
    }
  };

  const multiSeller = sellerGroups.length > 1;
  for (const group of sellerGroups) {
    if (multiSeller) {
      ensureSpace(rowH);
      doc.fillColor(LEAF).font('Helvetica-Bold').fontSize(9)
        .text(group.seller_name || 'Seller', col.item, y);
      y += 16;
    }
    for (const it of group.items) {
      ensureSpace(rowH);
      const lineTotal = Number(it.price || 0) * Number(it.qty || 0);
      doc.fillColor(FOREST).font('Helvetica').fontSize(9.5);
      doc.text(it.name || '—', col.item, y, { width: width * 0.48 });
      doc.text(`${it.qty} ${it.unit || ''}`.trim(), col.qty, y, { width: width * 0.16, align: 'right' });
      doc.text(rs(it.price), col.qty, y, { width: width * 0.34, align: 'right' });
      doc.text(rs(lineTotal), col.amt, y, { width: amtW, align: 'right' });
      y += rowH;
    }
  }

  doc.moveTo(left, y).lineTo(right, y).strokeColor(RULE).lineWidth(0.7).stroke();
  y += 12;

  // ── Charge summary ──────────────────────────────────────────────────────────
  const itemTotal = Number(order.item_total || 0);
  const handling = Number(order.handling || 0);
  const delivery = Number(order.delivery || 0);
  const total = Number(order.total || 0);
  const residual = total - itemTotal - handling - delivery;
  const marketFee = residual > 0.5 ? residual : 0; // half-paisa floor kills float noise
  const saved = Number(order.saved || 0);

  const sumRow = (label, value, opts = {}) => {
    ensureSpace(rowH);
    const lblFont = opts.bold ? 'Helvetica-Bold' : 'Helvetica';
    const size = opts.bold ? 12 : 9.5;
    doc.fillColor(opts.color || (opts.bold ? FOREST : GRAY)).font(lblFont).fontSize(size)
      .text(label, rx, y, { width: rw * 0.55 });
    doc.fillColor(opts.color || FOREST).font('Helvetica-Bold').fontSize(size)
      .text(value, rx, y, { width: rw, align: 'right' });
    y += opts.bold ? rowH + 2 : rowH - 2;
  };

  sumRow('Item Total', rs(itemTotal));
  sumRow('Handling charges', rs(handling));
  sumRow('Multiple Seller Fees', rs(marketFee));
  sumRow('Delivery', delivery > 0 ? rs(delivery) : 'FREE', delivery > 0 ? {} : { color: LEAF });
  doc.moveTo(rx, y).lineTo(right, y).strokeColor(RULE).lineWidth(1).stroke();
  y += 8;
  sumRow('Total', rs(total), { bold: true });
  if (saved > 0) sumRow('You saved (vs market rate)', rs(saved), { color: LEAF });

  // ── Footer ────────────────────────────────────────────────────────────────
  const fy = doc.page.height - doc.page.margins.bottom - 40;
  doc.moveTo(left, fy).lineTo(right, fy).strokeColor(RULE).lineWidth(0.7).stroke();
  doc.fillColor(GRAY).font('Helvetica').fontSize(8)
    .text(
      'This is a computer-generated invoice and does not require a signature. ' +
        'Thank you for supporting local farmers.',
      left, fy + 8, { width, align: 'center' },
    );

  doc.end();
}

module.exports = { streamInvoice };
