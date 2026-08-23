// One-off: give the listed legacy staff logins a real Employee ID and make the
// Employee ID their login_id (staff sign in with phone OR Employee ID). These seed
// accounts predate the "login_id = emp_id" rule (migration 048), so they still carry
// generated login_ids and no emp_id — 048 could not touch them (nothing to backfill).
//
// For each account we:
//   1. create an approved, active `employees` master row (the Employee ID must be
//      backed by a real record — create-login checks, trust flags and the tracker all
//      key off it), designation = the account's role;
//   2. set users.login_id = users.emp_id = the new Employee ID.
//
// Lakshmi T (Head Office, 9811100009) additionally gets the HR + Board trust flags,
// making that login a super-admin (create logins + approve/edit employees) — the
// permission layer unions the HR and Board roles onto Head Office when those flags
// are set on the linked, approved employee record.
//
// Idempotent: an account that already has an emp_id is skipped, so a re-run is safe.
// Runs in a single transaction — all or nothing.
//
// Usage:  cd backend && node db/backfill_staff_empids.js

require('dotenv').config();
const { Client } = require('pg');

// The accounts to convert, in the requested order. The new Employee IDs are assigned
// as the next MATN sequence at run time (not hard-coded), so the script stays correct
// even if the sequence has moved on.
const OLD_LOGIN_IDS = [
  'HMTNPDK_MANA01',
  'DATNPDK_AGEA02',
  'VCTNPDK_VCOA03',
  'DATNPDK_AGEA01',
  'VCTNPDK_VCOA02',
  'VCTNPDK_VCOA01',
  'HOTN_LAKA01',
  'SHTN_SENA01',
  'RMTN_DEEA01',
  'HITNPDK_RAMA01',
  'DMTNPDK_ARUA01',
  'VCTNPDK_PRIA01',
  'DATNPDK_SELA01',
];

// Logins that should carry super-admin trust flags on their new employee record.
const SUPER_ADMIN_LOGIN_IDS = new Set(['HOTN_LAKA01']);

// A department to file each role under (cosmetic — for the tracker view).
const DEPT_BY_ROLE = {
  'Head Office': 'Executive Leadership',
  'State Head': 'Operations',
  'Regional Manager': 'Operations',
  'District Manager': 'Operations',
  'Hub Manager': 'Operations',
  'Hub Incharge': 'Operations',
  'VCO': 'Operations',
  'Delivery Agent': 'Operations',
};

async function main() {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  try {
    await c.query('BEGIN');

    // Current highest MATN##### across ALL employees (removed included — an Employee
    // ID is never re-issued), so the new IDs continue the sequence.
    const ex = await c.query(`select emp_id from employees where emp_id ilike 'MATN%'`);
    let seq = 0;
    for (const r of ex.rows) {
      const m = /^MATN(\d{5})$/.exec(r.emp_id || '');
      if (m) seq = Math.max(seq, parseInt(m[1], 10));
    }

    const results = [];
    for (const oldLogin of OLD_LOGIN_IDS) {
      const u = await c.query(
        `select id, login_id, phone, emp_id, fname, lname, gender, admin_role,
                state, district, taluk
           from users where login_id = $1 for update`,
        [oldLogin],
      );
      if (!u.rows.length) {
        results.push({ oldLogin, status: 'SKIPPED — no such login' });
        continue;
      }
      const usr = u.rows[0];
      if (usr.emp_id) {
        results.push({ oldLogin, status: `SKIPPED — already has emp_id ${usr.emp_id}` });
        continue;
      }

      seq += 1;
      const empId = 'MATN' + String(seq).padStart(5, '0');
      const isSuper = SUPER_ADMIN_LOGIN_IDS.has(oldLogin);

      await c.query(
        `insert into employees
           (emp_id, fname, lname, phone, gender, designation, department,
            employment_type, status, approval_status, approved_at,
            is_manager, is_hr_admin, is_board_director,
            work_state, work_district, state, district, taluk)
         values ($1,$2,$3,$4,$5,$6,$7,'Permanent','active','approved', now(),
                 $8,$9,$10,$11,$12,$13,$14,$15)`,
        [
          empId,
          usr.fname,
          usr.lname,
          usr.phone,
          usr.gender,
          usr.admin_role, // designation = the role (tracker tolerates legacy titles)
          DEPT_BY_ROLE[usr.admin_role] || 'Operations',
          isSuper, // is_manager
          isSuper, // is_hr_admin
          isSuper, // is_board_director
          usr.state || 'Tamil Nadu',
          usr.district,
          usr.state || 'Tamil Nadu',
          usr.district,
          usr.taluk,
        ],
      );

      await c.query(`update users set login_id = $1, emp_id = $1 where id = $2`, [empId, usr.id]);

      results.push({
        oldLogin,
        status: `→ ${empId}${isSuper ? ' (super-admin: HR + Board)' : ''}`,
      });
    }

    await c.query('COMMIT');
    console.log('DONE — converted the following (committed):');
    for (const r of results) console.log('  ' + r.oldLogin.padEnd(18) + r.status);
  } catch (e) {
    await c.query('ROLLBACK');
    console.error('ROLLED BACK — nothing changed:', e.message);
    process.exitCode = 1;
  } finally {
    await c.end();
  }
}

main();
