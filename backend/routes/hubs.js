const express = require('express');
const supabase = require('../db/supabase');
const { requireAuth } = require('../middleware/auth');
const { requirePermission } = require('../middleware/permissions');

const router = express.Router();

// GET /hubs?state=&district=  — the hubs in one district: its main hub plus every
// taluk hub that connects to it, each carrying the name of its responsible Hub
// Incharge (resolved separately rather than via an embed so a rename of the FK
// can't silently empty the list). Used by the Delivery Agent profile (pick the
// taluk hub responsible for you), the VCO/Hub assign screens, and the admin Hubs
// page. district is required so this never dumps the whole ~1,700-row network.
router.get('/', requireAuth, async (req, res) => {
  const state = (req.query.state || '').trim();
  const district = (req.query.district || '').trim();
  if (!district) {
    return res.status(400).json({ error: 'district is required.' });
  }

  let q = supabase
    .from('hubs')
    .select(
      'id, hub_type, state, district, taluk, name, parent_hub_id, hub_manager_id, hub_incharge_id, lat, lng, is_active',
    )
    .eq('district', district)
    .order('hub_type', { ascending: true }) // 'main' before 'taluk'
    .order('taluk', { ascending: true });
  if (state) q = q.eq('state', state);

  const { data: hubs, error } = await q;
  if (error) {
    console.error('GET /hubs error:', error.message);
    return res.status(500).json({ error: 'Could not load hubs.' });
  }

  // Attach the responsible Hub Manager + Hub Incharge names (one lookup for both).
  const staffIds = [
    ...new Set(
      (hubs || []).flatMap((h) => [h.hub_manager_id, h.hub_incharge_id]).filter(Boolean),
    ),
  ];
  const nameById = new Map();
  if (staffIds.length) {
    const { data: staff, error: sErr } = await supabase
      .from('users')
      .select('id, fname, lname')
      .in('id', staffIds);
    if (sErr) {
      console.error('GET /hubs staff lookup error:', sErr.message);
      return res.status(500).json({ error: 'Could not load hub staff.' });
    }
    for (const s of staff || []) {
      nameById.set(s.id, s.fname + (s.lname ? ' ' + s.lname : ''));
    }
  }

  res.json({
    hubs: (hubs || []).map((h) => ({
      ...h,
      manager_name: h.hub_manager_id ? nameById.get(h.hub_manager_id) || null : null,
      incharge_name: h.hub_incharge_id ? nameById.get(h.hub_incharge_id) || null : null,
    })),
  });
});

// GET /hubs/incharges?state=&district=  — the Hub Incharge staff a hub can be
// assigned to, in one district. Its own hub_management view permission, so a
// manager who can run the Hubs page but not User Management can still populate the
// assignee dropdown.
router.get('/incharges', requirePermission('hub_management', 'view'), async (req, res) => {
  const state = (req.query.state || '').trim();
  const district = (req.query.district || '').trim();
  if (!district) {
    return res.status(400).json({ error: 'district is required.' });
  }

  let q = supabase
    .from('users')
    .select('id, fname, lname, login_id, district')
    .eq('role', 'admin')
    .eq('admin_role', 'Hub Incharge')
    .eq('status', 'active')
    .is('deleted_at', null)
    .eq('district', district);
  if (state) q = q.eq('state', state);

  const { data, error } = await q;
  if (error) {
    console.error('GET /hubs/incharges error:', error.message);
    return res.status(500).json({ error: 'Could not load Hub Incharge staff.' });
  }
  res.json({
    incharges: (data || []).map((u) => ({
      id: u.id,
      name: u.fname + (u.lname ? ' ' + u.lname : ''),
      login_id: u.login_id,
    })),
  });
});

// GET /hubs/staff?role=&state=&district=  — the staff a hub can be assigned to,
// by admin_role, in one district. Used to populate the Hub Manager dropdown (a
// taluk hub) and the District Manager dropdown (a main hub). Allowlisted roles
// only, so this can never enumerate arbitrary users.
const ASSIGNABLE_ROLES = new Set(['Hub Manager', 'District Manager', 'Hub Incharge']);
router.get('/staff', requirePermission('hub_management', 'view'), async (req, res) => {
  const role = (req.query.role || '').trim();
  const state = (req.query.state || '').trim();
  const district = (req.query.district || '').trim();
  if (!ASSIGNABLE_ROLES.has(role)) {
    return res.status(400).json({ error: 'Unsupported role.' });
  }
  if (!district) {
    return res.status(400).json({ error: 'district is required.' });
  }

  let q = supabase
    .from('users')
    .select('id, fname, lname, login_id, district')
    .eq('role', 'admin')
    .eq('admin_role', role)
    .eq('status', 'active')
    .is('deleted_at', null)
    .eq('district', district);
  if (state) q = q.eq('state', state);

  const { data, error } = await q;
  if (error) {
    console.error('GET /hubs/staff error:', error.message);
    return res.status(500).json({ error: 'Could not load staff.' });
  }
  res.json({
    staff: (data || []).map((u) => ({
      id: u.id,
      name: u.fname + (u.lname ? ' ' + u.lname : ''),
      login_id: u.login_id,
    })),
  });
});

// POST /hubs  — admin creates a TALUK hub for a chosen taluk in a district. Not
// every taluk gets a hub automatically any more; admin picks which taluks a
// district actually needs. The district's MAIN hub must already exist (it becomes
// the parent). One taluk hub per taluk (DB unique index) → a duplicate is a 409.
router.post('/', requirePermission('hub_management', 'create'), async (req, res) => {
  const state = String(req.body.state || '').trim();
  const district = String(req.body.district || '').trim();
  const taluk = String(req.body.taluk || '').trim();
  const name = String(req.body.name || '').trim();
  if (!state || !district || !taluk) {
    return res.status(400).json({ error: 'state, district and taluk are required.' });
  }

  // The taluk must be real reference data (guards against typos creating junk hubs).
  const { data: loc, error: locErr } = await supabase
    .from('locations')
    .select('taluk')
    .eq('state', state)
    .eq('district', district)
    .eq('taluk', taluk)
    .maybeSingle();
  if (locErr) {
    console.error('POST /hubs location check error:', locErr.message);
    return res.status(500).json({ error: 'Could not verify the taluk.' });
  }
  if (!loc) {
    return res.status(400).json({ error: 'That taluk is not in the location tree.' });
  }

  // The district's main hub is the parent every taluk hub connects to.
  const { data: main, error: mainErr } = await supabase
    .from('hubs')
    .select('id')
    .eq('state', state)
    .eq('district', district)
    .eq('hub_type', 'main')
    .maybeSingle();
  if (mainErr) {
    console.error('POST /hubs main-hub lookup error:', mainErr.message);
    return res.status(500).json({ error: 'Could not find the district main hub.' });
  }
  if (!main) {
    return res
      .status(400)
      .json({ error: 'This district has no main hub yet — create the main hub first.' });
  }

  // Reject a duplicate up front for a clean 409 (the unique index is the backstop).
  const { data: existing, error: exErr } = await supabase
    .from('hubs')
    .select('id')
    .eq('state', state)
    .eq('district', district)
    .eq('taluk', taluk)
    .eq('hub_type', 'taluk')
    .maybeSingle();
  if (exErr) {
    console.error('POST /hubs duplicate check error:', exErr.message);
    return res.status(500).json({ error: 'Could not check for an existing hub.' });
  }
  if (existing) {
    return res.status(409).json({ error: 'A taluk hub already exists for this taluk.' });
  }

  const { data: created, error } = await supabase
    .from('hubs')
    .insert({
      hub_type: 'taluk',
      state,
      district,
      taluk,
      name: name || `${taluk} Hub`,
      parent_hub_id: main.id,
      is_active: true,
    })
    .select(
      'id, hub_type, state, district, taluk, name, parent_hub_id, hub_manager_id, hub_incharge_id, lat, lng, is_active',
    )
    .maybeSingle();
  if (error) {
    console.error('POST /hubs insert error:', error.message);
    return res.status(500).json({ error: 'Could not create the hub.' });
  }

  res.status(201).json({ message: 'Hub created.', hub: created });
});

// PATCH /hubs/:id  — edit a hub: its display name, geo coordinates, active flag,
// and the Hub Incharge responsible for it. hub_type / parent / district are the
// network's structure and are NOT editable here (they come from the seed).
router.patch('/:id', requirePermission('hub_management', 'edit'), async (req, res) => {
  const updates = {};

  if (req.body.name !== undefined) {
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Hub name cannot be empty.' });
    updates.name = name;
  }

  if (req.body.is_active !== undefined) {
    updates.is_active = !!req.body.is_active;
  }

  // Coordinates: null clears; a present value must be in range (a bad number would
  // be a Postgres 500, not a clean 400).
  for (const [key, min, max] of [
    ['lat', -90, 90],
    ['lng', -180, 180],
  ]) {
    if (req.body[key] === undefined) continue;
    if (req.body[key] === null || req.body[key] === '') {
      updates[key] = null;
      continue;
    }
    const n = Number(req.body[key]);
    if (!Number.isFinite(n) || n < min || n > max) {
      return res.status(400).json({ error: 'Invalid hub location.' });
    }
    updates[key] = n;
  }

  // Hub Manager: null unassigns; otherwise it must be an active staffer of the
  // role appropriate to this hub's type — a Hub Manager runs a taluk hub, a
  // District Manager runs a main hub.
  if (req.body.hub_manager_id !== undefined) {
    if (req.body.hub_manager_id === null || req.body.hub_manager_id === '') {
      updates.hub_manager_id = null;
    } else {
      const { data: hub, error: hErr } = await supabase
        .from('hubs')
        .select('hub_type')
        .eq('id', req.params.id)
        .maybeSingle();
      if (hErr) {
        console.error('hub type lookup failed:', hErr.message);
        return res.status(500).json({ error: 'Could not load the hub.' });
      }
      if (!hub) return res.status(404).json({ error: 'Hub not found.' });
      const wantRole = hub.hub_type === 'main' ? 'District Manager' : 'Hub Manager';

      const { data: staff, error: sErr } = await supabase
        .from('users')
        .select('id, role, admin_role, status, deleted_at')
        .eq('id', req.body.hub_manager_id)
        .maybeSingle();
      if (sErr) {
        console.error('hub_manager_id lookup failed:', sErr.message);
        return res.status(500).json({ error: 'Could not verify the selected staff member.' });
      }
      if (!staff || staff.role !== 'admin' || staff.admin_role !== wantRole) {
        return res.status(400).json({ error: `Selected user is not a ${wantRole}.` });
      }
      if (staff.status !== 'active' || staff.deleted_at) {
        return res.status(400).json({ error: `That ${wantRole} is not active.` });
      }
      updates.hub_manager_id = staff.id;
    }
  }

  // Hub Incharge: null unassigns; otherwise it must be an active Hub Incharge.
  if (req.body.hub_incharge_id !== undefined) {
    if (req.body.hub_incharge_id === null || req.body.hub_incharge_id === '') {
      updates.hub_incharge_id = null;
    } else {
      const { data: staff, error: sErr } = await supabase
        .from('users')
        .select('id, role, admin_role, status, deleted_at')
        .eq('id', req.body.hub_incharge_id)
        .maybeSingle();
      if (sErr) {
        console.error('hub_incharge_id lookup failed:', sErr.message);
        return res.status(500).json({ error: 'Could not verify the selected staff member.' });
      }
      if (!staff || staff.role !== 'admin' || staff.admin_role !== 'Hub Incharge') {
        return res.status(400).json({ error: 'Selected user is not a Hub Incharge.' });
      }
      if (staff.status !== 'active' || staff.deleted_at) {
        return res.status(400).json({ error: 'That Hub Incharge is not active.' });
      }
      updates.hub_incharge_id = staff.id;
    }
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No updatable fields provided.' });
  }

  const { data: updated, error } = await supabase
    .from('hubs')
    .update(updates)
    .eq('id', req.params.id)
    .select(
      'id, hub_type, state, district, taluk, name, parent_hub_id, hub_manager_id, hub_incharge_id, lat, lng, is_active',
    )
    .maybeSingle();
  if (error) {
    console.error('PATCH /hubs error:', error.message);
    return res.status(500).json({ error: 'Could not update the hub.' });
  }
  if (!updated) return res.status(404).json({ error: 'Hub not found.' });

  res.json({ message: 'Hub updated.', hub: updated });
});

module.exports = router;
