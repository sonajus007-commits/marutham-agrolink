// ─────────────────────────────────────────────────────────────────────────────
// Row-level scope: WHICH orders and users a signed-in person may touch.
//
// requirePermission answers "may this role do this ACTION". It says nothing about
// WHICH row, so every route that took an :id let a role act on any row in the
// company. This module is the one place that decides the row question, so list
// routes and :id routes cannot disagree.
//
// The database client is passed in rather than required here: a module that closes
// over the client at load time needs a line in the test harness's purge list.
//
// Rule of thumb, shared with utils/agentCoverage: BLOCK ONLY ON POSITIVE EVIDENCE of
// a mismatch. A staffer or an old order with no district is not grounds for a refusal,
// or incomplete rows would strand real parcels. A row that names someone else, or a
// different district, is.
// ─────────────────────────────────────────────────────────────────────────────

// Head-office roles work the whole company.
const COMPANY_WIDE_ROLES = new Set([
  'Head Office', 'Board of Director', 'CEO', 'Managing Director', 'CFO', 'CTO',
  'Technical Admin', 'HR Admin', 'HR Manager', 'Finance Manager', 'Finance Executive',
  'Support Executive', 'Support Agent', 'Category Manager',
]);
const REGION_ROLES = new Set(['State Head', 'Zonal Manager', 'Regional Manager']);
const DISTRICT_ROLES = new Set(['District Manager', 'Hub Manager', 'Hub Incharge']);

// Who may force an order's status by hand (owner decision DEC-13). Deliberately NOT a
// permission-matrix action: the matrix cell it used to ride on also covers assigning
// agents, which is how a Hub Incharge came to hold it.
const STATUS_OVERRIDE_ROLES = new Set(['Head Office', 'District Manager']);

const norm = (v) => String(v == null ? '' : v).trim().toLowerCase();
const sameText = (a, b) => !!norm(a) && norm(a) === norm(b);

const homeDistrict = (user) => user.district_assign || user.district || null;

function canOverrideStatus(user) {
  return !!user && STATUS_OVERRIDE_ROLES.has(user.admin_role);
}

/** The district a parcel is going TO, when it differs from where it started. */
function deliveryDistrict(order) {
  const da = order && order.delivery_address;
  return (da && typeof da === 'object' && da.district) || null;
}

/** Does `order` start or end in `district`? Unknown on either side is not a mismatch. */
function orderTouchesDistrict(order, district) {
  if (!district || !order.district) return true;
  if (sameText(order.district, district)) return true;
  return sameText(deliveryDistrict(order), district);
}

/** Every district in the staffer's state, or null when they are not region-scoped. */
async function regionDistricts(db, user) {
  if (!REGION_ROLES.has(user.admin_role) || !user.state) return null;
  const { data, error } = await db.from('locations').select('district').eq('state', user.state);
  if (error) throw new Error(`Region lookup failed: ${error.message}`);
  return [...new Set((data || []).map((l) => l.district))];
}

/** The hubs a Hub Manager runs: hubs.hub_manager_id, plus their own users.hub_id. */
async function managedHubIds(db, user) {
  if (user.admin_role !== 'Hub Manager') return user.hub_id ? [user.hub_id] : [];
  const { data, error } = await db.from('hubs').select('id').eq('hub_manager_id', user.id);
  if (error) throw new Error(`Managed hub lookup failed: ${error.message}`);
  return [...new Set([...(data || []).map((h) => h.id), ...(user.hub_id ? [user.hub_id] : [])])];
}

/** Does this seller have goods in this order? A split child names them directly. */
async function sellerOwnsOrder(db, user, order) {
  if (order.seller_id) return order.seller_id === user.id;
  const { data, error } = await db
    .from('order_items').select('id').eq('order_id', order.id).eq('farmer_id', user.id).limit(1);
  if (error) throw new Error(`Seller item lookup failed: ${error.message}`);
  return !!(data && data.length);
}

/**
 * May this user see or act on this order at all? Throws on a failed lookup: a scope
 * check that cannot be answered must fail, and the caller answers 500.
 */
async function orderInScope(db, user, order) {
  if (!user || !order) return false;
  if (user.role === 'consumer') return order.consumer_id === user.id;
  if (user.role === 'farmer') return sellerOwnsOrder(db, user, order);
  if (user.role !== 'admin') return false;

  const role = user.admin_role;
  if (COMPANY_WIDE_ROLES.has(role)) return true;

  if (role === 'Delivery Agent') {
    if (order.agent_id === user.id || order.collection_agent_id === user.id) return true;
    // Named for someone else: not theirs. Unnamed: the open pool in their district.
    if (order.agent_id || order.collection_agent_id) return false;
    return orderTouchesDistrict(order, user.district);
  }

  if (role === 'VCO') {
    if (order.agent_id === user.id || order.collection_agent_id === user.id) return true;
    if (user.hub_id && order.pickup_hub_id === user.hub_id) return true;
    const village = user.village_town || user.vco_city;
    if (village && sameText(order.village, village)) return true;
    // Hub or village data is often missing, so own district is the outer limit: a
    // parcel must not be stranded because a village name is spelled differently.
    return orderTouchesDistrict(order, user.district);
  }

  if (role === 'Hub Manager') {
    const hubs = await managedHubIds(db, user);
    if (hubs.length) return hubs.includes(order.pickup_hub_id) || hubs.includes(order.delivery_hub_id);
    return orderTouchesDistrict(order, homeDistrict(user));
  }

  if (DISTRICT_ROLES.has(role)) {
    if (user.hub_id && (order.pickup_hub_id === user.hub_id || order.delivery_hub_id === user.hub_id)) {
      return true;
    }
    return orderTouchesDistrict(order, homeDistrict(user));
  }

  if (REGION_ROLES.has(role)) {
    const districts = await regionDistricts(db, user);
    if (!districts || !districts.length || !order.district) return true;
    return districts.some((d) => orderTouchesDistrict(order, d));
  }

  return false;
}

/**
 * May this hub staffer book a parcel INTO a hub? Stricter than orderInScope: custody
 * belongs to the receiving hub, so an Incharge of hub A cannot accept a parcel bound
 * for hub B even in the same district.
 */
async function hubMayReceive(db, user, order) {
  if (COMPANY_WIDE_ROLES.has(user.admin_role) || REGION_ROLES.has(user.admin_role)) {
    return orderInScope(db, user, order);
  }
  if (user.admin_role === 'District Manager') return orderInScope(db, user, order);
  const hubs = await managedHubIds(db, user);
  if (hubs.length && order.delivery_hub_id) return hubs.includes(order.delivery_hub_id);
  return orderTouchesDistrict(order, homeDistrict(user));
}

/** Narrow a `users` query to the staffer's geography. Company-wide roles pass through. */
function scopeUsersQuery(query, user) {
  if (COMPANY_WIDE_ROLES.has(user.admin_role)) return query;
  if (REGION_ROLES.has(user.admin_role)) return user.state ? query.eq('state', user.state) : query;
  const district = homeDistrict(user);
  return district ? query.eq('district', district) : query;
}

/** May this staffer act on this seller or consumer? Fail closed on a failed read. */
async function userInGeo(db, actor, targetId) {
  if (COMPANY_WIDE_ROLES.has(actor.admin_role)) return true;
  const { data, error } = await db
    .from('users').select('district, state').eq('id', targetId).maybeSingle();
  if (error || !data) return false;
  if (REGION_ROLES.has(actor.admin_role)) return !actor.state || !data.state || sameText(actor.state, data.state);
  const district = homeDistrict(actor);
  return !district || !data.district || sameText(district, data.district);
}

/** Districts a report may cover: null = the whole company. */
async function reportDistricts(db, user) {
  if (COMPANY_WIDE_ROLES.has(user.admin_role)) return null;
  const region = await regionDistricts(db, user);
  if (region) return region;
  const district = homeDistrict(user);
  return district ? [district] : null;
}

module.exports = {
  COMPANY_WIDE_ROLES,
  REGION_ROLES,
  DISTRICT_ROLES,
  canOverrideStatus,
  deliveryDistrict,
  homeDistrict,
  orderInScope,
  hubMayReceive,
  regionDistricts,
  managedHubIds,
  scopeUsersQuery,
  userInGeo,
  reportDistricts,
};
