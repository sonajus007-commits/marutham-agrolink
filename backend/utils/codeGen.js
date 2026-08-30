// ── District code lookup (3-letter) ───────────────────────────────────────────
// Add new districts here as the platform expands.
const DISTRICT_CODES = {
  // Tamil Nadu
  'Pudukkottai':     'PDK',
  'Chennai':         'CHN',
  'Tiruchirappalli': 'TRY',
  'Thanjavur':       'TNJ',
  'Madurai':         'MDU',
  'Sivaganga':       'SVG',
  'Coimbatore':      'CBE',
  'Salem':           'SLM',
  'Tirunelveli':     'TNV',
  'Vellore':         'VLR',
  'Erode':           'ERD',
  'Tiruppur':        'TPR',
  'Dindigul':        'DDL',
  'Kanchipuram':     'KPM',
  'Villupuram':      'VPM',
  'Cuddalore':       'CDL',
  'Nagapattinam':    'NGP',
  'Karur':           'KRR',
  'Namakkal':        'NMK',
  'Dharmapuri':      'DPR',
  'Krishnagiri':     'KRG',
  'Perambalur':      'PBR',
  'Ariyalur':        'ARL',
  'Theni':           'THN',
  'Virudhunagar':    'VDN',
  'Ramanathapuram':  'RMD',
  'Thoothukudi':     'TUT',
  'Tiruvarur':       'TVR',
  'Nilgiris':        'NLG',
  'Kallakurichi':    'KLK',
  'Tenkasi':         'TKS',
  'Ranipet':         'RNP',
  'Tirupattur':      'TPT',
  'Chengalpattu':    'CPT',
  'Mayiladuthurai':  'MYD',
  // Karnataka
  'Bengaluru':       'BLR',
  'Mysuru':          'MYS',
  'Mangaluru':       'MNG',
  // Kerala
  'Thiruvananthapuram': 'TVM',
  'Kochi':           'KCH',
  'Kozhikode':       'KZD',
  // Andhra Pradesh
  'Visakhapatnam':   'VSP',
  'Vijayawada':      'VJW',
};

// ── State code lookup (2-letter) ───────────────────────────────────────────────
const STATE_CODES = {
  'Tamil Nadu':      'TN',
  'Karnataka':       'KA',
  'Kerala':          'KL',
  'Andhra Pradesh':  'AP',
  'Telangana':       'TS',
  'Maharashtra':     'MH',
  'Delhi':           'DL',
  'Puducherry':      'PY',
};

function distCode(district) {
  return DISTRICT_CODES[district] || district.replace(/\s+/g, '').slice(0, 3).toUpperCase();
}

function stateCode(state) {
  return STATE_CODES[state] || (state || 'XX').replace(/\s+/g, '').slice(0, 2).toUpperCase();
}

// IST date string in YYMMDD — orders are placed in India so the daily counter
// resets at midnight IST (UTC+05:30), not UTC.
function dateIST() {
  const ist = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  const yy = String(ist.getUTCFullYear()).slice(-2);
  const mm = String(ist.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(ist.getUTCDate()).padStart(2, '0');
  return yy + mm + dd;
}

// Calls the next_code_seq PostgreSQL function, which atomically increments a
// per-(district, date, type) counter using INSERT ON CONFLICT DO UPDATE.
// Two concurrent calls on the same row are serialized by the row-level lock
// PostgreSQL acquires during the UPDATE path — no duplicate sequence is possible.
async function nextSeq(supabase, dc, date, type) {
  const { data, error } = await supabase.rpc('next_code_seq', {
    p_district_code: dc,
    p_date: date,
    p_type: type,
  });
  if (error) throw new Error(`Code sequence error (${dc}/${date}/${type}): ${error.message}`);
  return data;
}

// ORDER code: ORD + consumerDistrictCode + YYMMDD + 6-digit daily seq
// e.g. ORDPDK260625000001
async function generateOrderCode(supabase, consumerDistrict) {
  const dc   = distCode(consumerDistrict);
  const date = dateIST();
  const seq  = await nextSeq(supabase, dc, date, 'order');
  return `ORD${dc}${date}${String(seq).padStart(6, '0')}`;
}

// RETURN code: RET + districtCode + YYMMDD + 6-digit daily seq (return counter)
// District code and date are INHERITED from the parent order's code so the
// return is always traceable back to its origin district and order date.
// Parent order code format: ORD + distCode(3) + date(6) + seq
async function generateReturnCode(supabase, parentOrderCode) {
  if (!parentOrderCode || parentOrderCode.length < 12) {
    throw new Error(
      `Parent order code "${parentOrderCode}" uses old format — cannot inherit district/date.`
    );
  }
  const dc   = parentOrderCode.slice(3, 6);
  const date = parentOrderCode.slice(6, 12);
  const seq  = await nextSeq(supabase, dc, date, 'return');
  return `RET${dc}${date}${String(seq).padStart(6, '0')}`;
}

// A 4-digit delivery confirmation code (soft OTP), shown only to the customer.
// crypto.randomInt is unbiased across 1000–9999; the code is a confirmation token,
// not a secret store, so 4 digits is the right ergonomics/strength trade-off.
const crypto = require('crypto');
function generateDeliveryCode() {
  return String(crypto.randomInt(1000, 10000));
}

module.exports = { generateOrderCode, generateReturnCode, generateDeliveryCode, distCode, stateCode };
