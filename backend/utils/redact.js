// ─────────────────────────────────────────────────────────────────────────────
// Response redaction — strips fields that must never travel in a general payload.
//
// `delivery_code` (the soft delivery OTP, migration 052) is the whole reason this
// exists: the code proves the parcel reached the right customer, so it must reach
// ONLY that customer — never the courier. Order rows are read with select('*') in
// many places (order detail, tracking, every "order: updated" response), and an
// agent legitimately reads some of them. Auditing each one is fragile, so instead
// this runs once over EVERY response (server.js) and removes the raw field
// everywhere. The owner is handed the code back deliberately, under a different key
// (`otp`) the handler sets, which this does not touch.
//
// Runs alongside convertMoney/convertTimestamps in the res.json override, so it
// walks the same nested shapes (arrays, {order}, {orders:[…]}, parts, history).
// ─────────────────────────────────────────────────────────────────────────────

const REDACTED = new Set(['delivery_code']);

function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (value !== null && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (REDACTED.has(k)) continue; // drop it entirely
      out[k] = redact(v);
    }
    return out;
  }
  return value;
}

module.exports = { redact };
