const express = require('express');
const supabase = require('../db/supabase');
const { requireAuth } = require('../middleware/auth');
const { can, scopeFor } = require('../middleware/permissions');
const { validateBody, z } = require('../middleware/validate');
const { notify } = require('../utils/notifications');
const { COMPANY_WIDE_ROLES, scopeUsersQuery } = require('../utils/scope');

const router = express.Router();
router.use(requireAuth);

// Working the queue is the Customer Complaints module (view to read, edit to act) —
// held by Admin and every management/field role. A consumer or seller has no such
// role, so they only ever see their own tickets.
// An 'assigned' grant (Delivery Agent) is not a queue: they raise and read their own.
const isAgent = (req) =>
  can(req.user, 'customer_complaints', 'view') && scopeFor(req.user, 'customer_complaints') !== 'assigned';

// The people whose tickets a geo-scoped staffer may work; null = everyone.
async function ticketRaisers(user) {
  if (COMPANY_WIDE_ROLES.has(user.admin_role)) return null;
  const { data, error } = await scopeUsersQuery(supabase.from('users').select('id'), user);
  if (error) throw new Error(error.message);
  return (data || []).map((u) => u.id);
}

const VALID_STATUS = ['open', 'in_progress', 'resolved'];

const createSchema = z.object({
  subject: z.string().trim().min(1, 'A subject is required.').max(160),
  message: z.string().trim().min(1, 'Please describe the issue.').max(2000),
  category: z.string().trim().max(60).optional(),
  order_id: z.string().uuid().optional(),
});

// ── POST /support ── any signed-in user raises a ticket ──────────────────────────
router.post('/', validateBody(createSchema), async (req, res) => {
  const { subject, message, category, order_id } = req.body;

  const { data, error } = await supabase
    .from('support_tickets')
    .insert({
      user_id: req.user.id,
      subject,
      message,
      category: category || null,
      order_id: order_id || null,
      status: 'open',
    })
    .select()
    .single();

  if (error) {
    console.error('POST /support error:', error);
    return res.status(500).json({ error: 'Could not submit your request. Please try again.' });
  }

  // Reassure the raiser it landed (in-app, best-effort — awaited so it's reliably
  // queued before we answer; notify() swallows its own errors).
  await notify(req.user.id, {
    type: 'support_received',
    title: 'We got your message',
    body: `Your support request “${subject}” has been received. We’ll get back to you.`,
    data: { ticket_id: data.id },
  });

  res.status(201).json({ message: 'Support request submitted.', ticket: data });
});

// ── GET /support ── the user's own tickets, or (for staff) the whole queue ────────
router.get('/', async (req, res) => {
  const staff = isAgent(req);
  let q = supabase.from('support_tickets').select('*').order('created_at', { ascending: false });

  if (!staff) {
    q = q.eq('user_id', req.user.id);
  } else {
    let raisers;
    try {
      raisers = await ticketRaisers(req.user);
    } catch (e) {
      console.error('GET /support scope failed:', e.message);
      return res.status(500).json({ error: 'Could not load support tickets.' });
    }
    if (raisers) q = q.in('user_id', raisers);
    if (VALID_STATUS.includes(req.query.status)) q = q.eq('status', req.query.status);
  }

  const { data, error } = await q;
  if (error) {
    console.error('GET /support error:', error);
    return res.status(500).json({ error: 'Could not load support tickets.' });
  }
  res.json({ tickets: data || [] });
});

const updateSchema = z
  .object({
    status: z.enum(['open', 'in_progress', 'resolved']).optional(),
    admin_note: z.string().trim().max(2000).optional(),
    assign_me: z.boolean().optional(),
  })
  .refine((b) => b.status !== undefined || b.admin_note !== undefined || b.assign_me, {
    message: 'Nothing to update.',
  });

// ── PATCH /support/:id ── staff work a ticket (status / note / claim it) ──────────
router.patch('/:id', validateBody(updateSchema), async (req, res) => {
  if (!can(req.user, 'customer_complaints', 'edit') || !isAgent(req)) {
    return res.status(403).json({ error: 'Customer complaints permission required.' });
  }

  const { data: ticket, error: fErr } = await supabase
    .from('support_tickets')
    .select('id, user_id, subject, status')
    .eq('id', req.params.id)
    .maybeSingle();
  if (fErr) return res.status(500).json({ error: 'Could not load the ticket.' });
  if (!ticket) return res.status(404).json({ error: 'Ticket not found.' });
  try {
    const raisers = await ticketRaisers(req.user);
    if (raisers && !raisers.includes(ticket.user_id)) {
      return res.status(403).json({ error: 'This ticket is outside your area.' });
    }
  } catch (e) {
    console.error('PATCH /support scope failed:', e.message);
    return res.status(500).json({ error: 'Could not load the ticket.' });
  }

  const updates = { updated_at: new Date().toISOString() };
  if (req.body.status !== undefined) updates.status = req.body.status;
  if (req.body.admin_note !== undefined) updates.admin_note = req.body.admin_note;
  if (req.body.assign_me) updates.assigned_to = req.user.id;

  const { data: updated, error: uErr } = await supabase
    .from('support_tickets')
    .update(updates)
    .eq('id', ticket.id)
    .select()
    .single();
  if (uErr) {
    console.error('PATCH /support/:id error:', uErr);
    return res.status(500).json({ error: 'Could not update the ticket.' });
  }

  // Tell the raiser when the status moved or a note was left — but not for a silent
  // self-assign (nothing changed for them).
  const statusChanged = req.body.status !== undefined && req.body.status !== ticket.status;
  if (statusChanged || req.body.admin_note !== undefined) {
    await notify(ticket.user_id, {
      type: 'support_update',
      title: req.body.status === 'resolved' ? 'Support request resolved' : 'Support request update',
      body: req.body.admin_note
        ? `“${ticket.subject}”: ${req.body.admin_note}`
        : `Your request “${ticket.subject}” is now ${(req.body.status || ticket.status).replace('_', ' ')}.`,
      data: { ticket_id: ticket.id },
    });
  }

  res.json({ message: 'Ticket updated.', ticket: updated });
});

module.exports = router;
