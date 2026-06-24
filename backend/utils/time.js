const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // UTC+5:30

// Timestamp field names that should be converted to IST in API responses.
// Date-only fields (price_date, image_date) are intentionally excluded.
const TIMESTAMP_FIELDS = new Set([
  'created_at', 'updated_at', 'ts',
  'picked_up_at', 'eta_ts', 'delivered_at',
  'cancelled_at', 'rated_at', 'paid_at',
  'requested_at', 'decided_at', 'cutoff_ts',
]);

function toIST(utcString) {
  if (!utcString) return utcString;
  const ms = new Date(utcString).getTime();
  if (isNaN(ms)) return utcString; // not a valid date — leave untouched
  const istDate = new Date(ms + IST_OFFSET_MS);
  // Format as ISO 8601 with explicit +05:30 offset
  return istDate.toISOString().replace('Z', '+05:30');
}

// Recursively walk any object/array and convert known timestamp fields in-place.
function convertTimestamps(value) {
  if (Array.isArray(value)) {
    return value.map(convertTimestamps);
  }
  if (value !== null && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = TIMESTAMP_FIELDS.has(k) ? toIST(v) : convertTimestamps(v);
    }
    return out;
  }
  return value;
}

module.exports = { toIST, convertTimestamps };
