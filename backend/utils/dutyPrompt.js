// Morning duty prompt. Attendance (migration 057) is PULL — a field staffer taps the
// duty pill. This makes it proactive: each morning, every VCO / Delivery Agent who
// has not checked in yet gets one in-app nudge ("Are you on duty today?"). The agent
// portal turns the same condition into a popup on open (DutyToggle).
//
// Restart-safe with no extra state: "already prompted today" is read back from the
// notifications table itself, so a server bounced mid-morning never sends twice.
// Dependencies are injected (db, notifyMany) so the scheduler is testable in isolation.

const PROMPT_ROLES = ['VCO', 'Delivery Agent'];
const PROMPT_TYPE = 'duty_checkin_prompt';
// Only in the working morning. A "please check in" at 9 PM is noise, not a prompt.
const PROMPT_FROM_HOUR_IST = 7;
const PROMPT_UNTIL_HOUR_IST = 12;

const IST_OFFSET_MS = 5.5 * 3600 * 1000;

/** The IST calendar date, hour, and that date's midnight as a UTC ISO string. */
function istParts(now) {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  const date = ist.toISOString().slice(0, 10);
  return {
    date,
    hour: ist.getUTCHours(),
    midnightIso: new Date(`${date}T00:00:00+05:30`).toISOString(),
  };
}

/**
 * Nudge every un-checked-in field staffer, once per IST day, inside the morning
 * window. Any failed read aborts the run (sends nothing): a skipped nudge is retried
 * next tick, whereas sending blind could nag people who already checked in.
 * @returns {Promise<{ sent: number, reason?: string }>}
 */
async function sendDutyPrompts({ db, notifyMany, now = new Date() }) {
  const { date, hour, midnightIso } = istParts(now);
  if (hour < PROMPT_FROM_HOUR_IST || hour >= PROMPT_UNTIL_HOUR_IST) {
    return { sent: 0, reason: 'outside_window' };
  }

  const { data: staff, error: sErr } = await db
    .from('users')
    .select('id')
    .eq('role', 'admin')
    .in('admin_role', PROMPT_ROLES)
    .is('deleted_at', null)       // removed staff
    .is('login_locked_at', null); // dormant/locked accounts cannot act on it
  if (sErr) {
    console.error('[DUTY PROMPT] Staff read failed:', sErr.message);
    return { sent: 0, reason: 'read_failed' };
  }
  if (!staff || staff.length === 0) return { sent: 0 };

  // Any attendance row today counts — including one already checked OUT. Someone who
  // worked and went home must not be asked to come on duty again.
  const { data: attended, error: aErr } = await db
    .from('staff_attendance').select('user_id').eq('work_date', date);
  if (aErr) {
    console.error('[DUTY PROMPT] Attendance read failed:', aErr.message);
    return { sent: 0, reason: 'read_failed' };
  }

  const { data: prompted, error: pErr } = await db
    .from('notifications')
    .select('user_id')
    .eq('type', PROMPT_TYPE)
    .gte('created_at', midnightIso);
  if (pErr) {
    console.error('[DUTY PROMPT] Notification read failed:', pErr.message);
    return { sent: 0, reason: 'read_failed' };
  }

  const skip = new Set([...(attended || []), ...(prompted || [])].map((r) => r.user_id));
  const targets = staff.map((s) => s.id).filter((id) => !skip.has(id));
  if (targets.length === 0) return { sent: 0 };

  await notifyMany(targets, {
    type: PROMPT_TYPE,
    title: 'Are you on duty today?',
    body: 'You have not checked in yet. Open the app and tap Check in to start your day.',
    data: { work_date: date },
  });
  return { sent: targets.length };
}

module.exports = { sendDutyPrompts, istParts, PROMPT_ROLES, PROMPT_TYPE };
