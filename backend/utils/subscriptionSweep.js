// Daily subscription check. Injected db + notifiers so the sweep is testable.
//
// An expired seller is SUSPENDED, never blocked. requireAuth refuses a blocked account
// outright, so blocking one locks them out of the only screen that can renew it, and
// their open orders then auto-cancel against their reliability. Suspended sellers can
// still sign in, renew, and finish what they accepted, while listing and ordering
// filters (status = 'active') take them off sale immediately.

const REMINDER_DAYS = [10, 5, 1];
const MS_PER_DAY = 24 * 60 * 60 * 1000;
const EXPIRED_REASON = 'Subscription expired';

async function recordSuspension(db, userId, oldStatus) {
  const { error } = await db.from('user_status_history').insert({
    user_id: userId,
    old_status: oldStatus,
    new_status: 'suspended',
    reason: EXPIRED_REASON,
    changed_by: null,
  });
  if (error) console.error(`[SUBSCRIPTION] History row failed for ${userId}:`, error.message);
}

async function runSubscriptionSweep({ db, notifyEmail, notifyInApp, now = new Date() }) {
  const summary = { suspended: 0, repaired: 0, reminded: 0 };

  const { data: users, error } = await db
    .from('users')
    .select('id, fname, lname, email, login_id, role, status, subscription_expires_at')
    .eq('role', 'farmer')
    .in('status', ['active'])
    .not('subscription_expires_at', 'is', null);

  // Unread, a failed read looked exactly like "no seller has a subscription", and the
  // nightly sweep quietly did nothing, night after night, with a clean log.
  if (error) {
    console.error('[SUBSCRIPTION] Expiry sweep ABORTED — could not read sellers:', error.message);
    return summary;
  }

  for (const user of users || []) {
    const diffDays = Math.ceil((new Date(user.subscription_expires_at) - now) / MS_PER_DAY);

    if (diffDays <= 0) {
      const { error: upErr } = await db.from('users')
        .update({ status: 'suspended', updated_at: now.toISOString() })
        .eq('id', user.id);
      if (upErr) {
        console.error(`[SUBSCRIPTION] FAILED to suspend ${user.login_id} — they remain ACTIVE:`, upErr.message);
        continue;
      }
      summary.suspended += 1;
      await recordSuspension(db, user.id, 'active');
      await notifyInApp(user.id, {
        type: 'subscription_expired',
        title: 'Subscription expired',
        body: 'Your products are off sale. Renew in the app to start selling again.',
      });
      try { await notifyEmail.notifySubscriptionExpired(user); } catch (e) { console.error('Notify expired error:', e.message); }
    } else if (REMINDER_DAYS.includes(diffDays)) {
      summary.reminded += 1;
      try { await notifyEmail.notifySubscriptionExpiring(user, diffDays); } catch (e) { console.error('Notify reminder error:', e.message); }
    }
  }

  // Repair sellers an earlier version of this sweep blocked. Those rows have no
  // block_reason, which an admin block always carries, so a real block is untouched.
  const { data: stuck, error: stuckErr } = await db
    .from('users')
    .select('id, subscription_expires_at')
    .eq('role', 'farmer')
    .eq('status', 'blocked')
    .is('block_reason', null)
    .not('subscription_expires_at', 'is', null);
  if (stuckErr) {
    console.error('[SUBSCRIPTION] Repair read failed:', stuckErr.message);
    return summary;
  }
  for (const user of stuck || []) {
    if (new Date(user.subscription_expires_at) > now) continue;
    const { error: fixErr } = await db.from('users')
      .update({ status: 'suspended', updated_at: now.toISOString() })
      .eq('id', user.id);
    if (fixErr) {
      console.error(`[SUBSCRIPTION] Repair failed for ${user.id}:`, fixErr.message);
      continue;
    }
    summary.repaired += 1;
    await recordSuspension(db, user.id, 'blocked');
  }

  return summary;
}

module.exports = { runSubscriptionSweep, REMINDER_DAYS, EXPIRED_REASON };
