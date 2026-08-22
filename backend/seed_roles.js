require('dotenv').config();
const bcrypt = require('bcryptjs');
const supabase = require('./db/supabase');
const { distCode, stateCode } = require('./utils/codeGen');

const PASSWORD  = 'Seed@1234';
const STATE     = 'Tamil Nadu';
const DISTRICT  = 'Pudukkottai';
const CITY      = 'Pudukkottai';
const PINCODE   = '622001';
const STREET1   = '1 Agrolink Nagar';

const ROLE_PREFIXES = {
  consumer:           'CN',
  farmer:             'FR',
  'Delivery Agent':   'DA',
  'VCO':              'VC',
  'District Manager': 'DM',
  'Hub Manager':      'HM',
  'Hub Incharge':     'HI',
  'Regional Manager': 'RM',
  'State Head':       'SH',
  'Head Office':      'HO',
};

const STATE_LEVEL_ROLES = new Set(['Regional Manager', 'State Head', 'Head Office']);

function toAlphaCounter(n) {
  const letter = String.fromCharCode(64 + Math.ceil(n / 99));
  const num    = ((n - 1) % 99) + 1;
  return letter + String(num).padStart(2, '0');
}

function fromAlphaCounter(s) {
  if (!/^[A-Z]\d{2}$/.test(s)) return 0;
  return (s.charCodeAt(0) - 64 - 1) * 99 + parseInt(s.slice(1));
}

async function getLoginId(role, adminRole, fname) {
  const rp    = (role === 'admin' ? ROLE_PREFIXES[adminRole] : ROLE_PREFIXES[role]) || 'US';
  const sc    = stateCode(STATE);
  const dc    = distCode(DISTRICT);
  const name3 = (fname || 'USR').replace(/[^a-zA-Z]/g, '').slice(0, 3).toUpperCase().padEnd(3, 'X');
  const isStateLevel = role === 'admin' && STATE_LEVEL_ROLES.has(adminRole);
  const base  = isStateLevel ? `${rp}${sc}_${name3}` : `${rp}${sc}${dc}_${name3}`;

  const { data, error } = await supabase
    .from('users')
    .select('login_id')
    .like('login_id', `${base}%`);

  if (error) throw new Error(`Login ID lookup failed: ${error.message}`);

  let maxN = 0;
  (data || []).forEach(row => {
    const n = fromAlphaCounter(row.login_id.slice(base.length));
    if (n > maxN) maxN = n;
  });

  return `${base}${toAlphaCounter(maxN + 1)}`;
}

// village_town is the fulfilment village: an order takes it from the FARMER, and a
// VCO's queue is scoped to orders whose village equals the VCO's village_town. So
// the seed farmer and the seed VCO must share one, or every VCO queue is empty and
// the VerifySheet is unreachable. Delivery Agent gets it too so pickup scoping lines
// up. Roles whose queues are not village-scoped (management) leave it null.
const USERS = [
  { role: 'consumer',  adminRole: null,               fname: 'Kavitha',  lname: 'R',  phone: '9811100001' },
  { role: 'farmer',    adminRole: null,               fname: 'Murugan',  lname: 'S',  phone: '9811100002', village: DISTRICT },
  { role: 'admin',     adminRole: 'Delivery Agent',   fname: 'Selvam',   lname: 'P',  phone: '9811100003', village: DISTRICT },
  { role: 'admin',     adminRole: 'VCO',              fname: 'Priya',    lname: 'K',  phone: '9811100004', village: DISTRICT },
  { role: 'admin',     adminRole: 'District Manager', fname: 'Arun',     lname: 'M',  phone: '9811100005' },
  { role: 'admin',     adminRole: 'Hub Manager',      fname: 'Manoj',    lname: 'K',  phone: '9811100010' },
  { role: 'admin',     adminRole: 'Hub Incharge',     fname: 'Ramesh',   lname: 'V',  phone: '9811100006' },
  { role: 'admin',     adminRole: 'Regional Manager', fname: 'Deepa',    lname: 'N',  phone: '9811100007' },
  { role: 'admin',     adminRole: 'State Head',       fname: 'Senthil',  lname: 'A',  phone: '9811100008' },
  { role: 'admin',     adminRole: 'Head Office',      fname: 'Lakshmi',  lname: 'T',  phone: '9811100009' },
];

async function seed() {
  const password_hash = await bcrypt.hash(PASSWORD, 12);
  console.log('\nCreating seed users for PDK (Pudukkottai), Tamil Nadu');
  console.log('Password for all:', PASSWORD);
  console.log('─'.repeat(70));

  for (const u of USERS) {
    // Skip if phone already exists
    // Same guard-fails-open shape as the real registration route: unread, a failed
    // read means "no such user" and the seeder inserts a duplicate phone.
    const { data: existing, error: existingErr } = await supabase
      .from('users')
      .select('id, login_id')
      .eq('phone', u.phone)
      .maybeSingle();

    if (existingErr) {
      console.error(`ABORT ${u.phone} — could not check whether this user exists: ${existingErr.message}`);
      continue;
    }

    if (existing) {
      console.log(`SKIP  ${u.phone} — already exists as ${existing.login_id}`);
      continue;
    }

    const login_id = await getLoginId(u.role, u.adminRole, u.fname);

    const { data, error } = await supabase
      .from('users')
      .insert({
        login_id,
        phone:        u.phone,
        password_hash,
        role:         u.role,
        admin_role:   u.adminRole || null,
        fname:        u.fname,
        lname:        u.lname,
        country_code: '+91',
        street1:      STREET1,
        village_town: u.village || null,
        city:         CITY,
        district:     DISTRICT,
        pincode:      PINCODE,
        state:        STATE,
        country:      'India',
        status:       'active',
      })
      .select('login_id, role, admin_role, fname, lname, phone')
      .single();

    if (error) {
      console.error(`FAIL  ${u.phone} (${u.adminRole || u.role}):`, error.message);
    } else {
      const label = u.adminRole ? `${u.role} / ${u.adminRole}` : u.role;
      console.log(`OK    ${data.login_id.padEnd(22)} ${label.padEnd(22)} ${u.fname} ${u.lname}  📞 ${u.phone}`);
    }
  }

  console.log('─'.repeat(70));
  console.log('Done. All users can login with password:', PASSWORD);
}

seed().catch(e => { console.error(e); process.exit(1); });
