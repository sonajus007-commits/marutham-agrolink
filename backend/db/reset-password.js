#!/usr/bin/env node
// Last-resort recovery, for when no one can sign in to the console: every Head Office
// login has forgotten its password and no OTP can reach them. Needs server access and
// database credentials, so it sits outside the app on purpose.
//
//   node backend/db/reset-password.js <phone | login id | employee id>
//
// Prints a one-time temporary password. The person chooses their own at next sign-in.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const supabase = require('./supabase');

async function main() {
  const id = (process.argv[2] || '').trim();
  if (!/^[A-Za-z0-9_]+$/.test(id)) {
    console.error('Usage: node backend/db/reset-password.js <phone | login id | employee id>');
    process.exit(1);
  }

  const { data: user, error } = await supabase
    .from('users')
    .select('id, login_id, status')
    .or(`phone.eq.${id},login_id.eq.${id},emp_id.eq.${id}`)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!user) {
    console.error('No account matches that identifier.');
    process.exit(1);
  }

  const temp = crypto.randomBytes(9).toString('base64url');
  const nowIso = new Date().toISOString();
  const { error: upErr } = await supabase
    .from('users')
    .update({
      password_hash: await bcrypt.hash(temp, 12),
      must_change_password: true,
      password_changed_at: nowIso,
      login_locked_at: null,
      login_lock_reason: null,
      updated_at: nowIso,
    })
    .eq('id', user.id);
  if (upErr) throw new Error(upErr.message);

  const { error: histErr } = await supabase.from('user_status_history').insert({
    user_id: user.id,
    old_status: user.status,
    new_status: user.status,
    reason: 'Password reset from the server (emergency recovery)',
    changed_by: null,
  });
  if (histErr) console.error('Audit row failed:', histErr.message);

  console.log(`Temporary password for ${user.login_id}: ${temp}`);
  console.log('They must choose their own at next sign-in.');
}

main().catch((e) => {
  console.error('Reset failed:', e.message);
  process.exit(1);
});
