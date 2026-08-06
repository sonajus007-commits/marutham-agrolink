const express = require('express');
const supabase = require('../db/supabase');
const { requireAuth } = require('../middleware/auth');
const { can } = require('../middleware/permissions');

const router = express.Router();
router.use(requireAuth);

// ── GET /dashboard  (any management role, role-tiered KPIs) ──────────────────
router.get('/', async (req, res) => {
  if (!can(req.user, 'dashboard', 'view')) {
    return res.status(403).json({ error: 'Only management roles can access the dashboard.' });
  }

  const u = req.user;
  const adminRole = u.admin_role;

  // Build scope filter for orders
  let orderFilter = {};
  if (adminRole === 'VCO') {
    orderFilter = { village: u.village_town || u.vco_city };
  } else if (['District Manager', 'Hub Incharge'].includes(adminRole)) {
    orderFilter = { district: u.district_assign || u.district };
  } else if (adminRole === 'Delivery Agent') {
    orderFilter = { agent_id: u.id };
  }
  // Head Office / State Head / Regional Manager → no filter (all orders)

  // ── Optional State / District drill-down ──────────────────────────────────
  // The broad management roles (Head Office / State Head / Regional / Zonal /
  // Board / executives) carry no geo lock, so the Overview lets them filter the
  // whole company down to one state or one district. A geo-locked role
  // (District Manager / Hub Incharge / VCO / Delivery Agent) keeps its own
  // scope — its state/district params are IGNORED so it can never widen or move
  // its scope. The client also hides the dropdowns for those roles; this is the
  // server-side half of that guard.
  const roleScoped = Boolean(orderFilter.district || orderFilter.village || orderFilter.agent_id);
  let filterState = null;
  let filterDistrict = null;
  let stateDistricts = null; // set only when a STATE (not a district) is picked
  if (!roleScoped) {
    filterState = (typeof req.query.state === 'string' && req.query.state.trim()) || null;
    filterDistrict = (typeof req.query.district === 'string' && req.query.district.trim()) || null;
    if (filterDistrict) {
      // A district pins every scoped query below (they already read
      // orderFilter.district), so route it through the same field.
      orderFilter.district = filterDistrict;
    } else if (filterState) {
      // orders/users have no `state` column — resolve the state to its set of
      // districts and filter on those instead.
      const { data: locs, error: le } = await supabase
        .from('locations').select('district').eq('state', filterState);
      if (le) return res.status(500).json({ error: 'Could not scope the dashboard to that state.' });
      stateDistricts = [...new Set((locs || []).map(l => l.district))];
      // An empty set means the state has no districts on record — scope to
      // nothing rather than silently falling back to the whole company.
      if (stateDistricts.length === 0) stateDistricts = ['__no_such_district__'];
    }
  }

  // ── Fetch orders in scope ─────────────────────────────────────────────────
  let ordersQuery = supabase
    .from('orders')
    .select('id, total, market_fee, status, cancelled, district, village, created_at');

  for (const [col, val] of Object.entries(orderFilter)) {
    ordersQuery = ordersQuery.eq(col, val);
  }
  if (stateDistricts) ordersQuery = ordersQuery.in('district', stateDistricts);

  const { data: orders, error: ordersErr } = await ordersQuery;
  if (ordersErr) return res.status(500).json({ error: 'Could not load dashboard data.' });

  const activeOrders    = orders.filter(o => !o.cancelled);
  const deliveredOrders = orders.filter(o => o.status === 'Delivered');
  const cancelledOrders = orders.filter(o => o.cancelled);

  const gmv         = activeOrders.reduce((s, o) => s + o.total, 0);
  const platformFee = activeOrders.reduce((s, o) => s + o.market_fee, 0);

  // ── 7-day daily trend (IST date, computed from fetched orders) ─────────────
  const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dayBuckets = {};
  const today = new Date(Date.now() + 5.5 * 3600000); // IST
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10); // YYYY-MM-DD
    dayBuckets[key] = { date: key, day_label: DAY_LABELS[d.getDay()], order_count: 0, revenue: 0 };
  }
  activeOrders.forEach(o => {
    // Adjust stored UTC timestamp to IST before extracting date
    const istDate = new Date(new Date(o.created_at).getTime() + 5.5 * 3600000)
      .toISOString().slice(0, 10);
    if (dayBuckets[istDate]) {
      dayBuckets[istDate].order_count++;
      dayBuckets[istDate].revenue += o.total; // paise; middleware converts
    }
  });
  const daily_trend = Object.values(dayBuckets);

  // ── Top products by revenue ───────────────────────────────────────────────
  //
  // This asked for `order_items.subtotal`, a column that does not exist. The
  // error was never checked, so `items` came back null and Top Products has been
  // EMPTY on every dashboard since it shipped. A line's value is price × qty —
  // the same rule the order writes (orders.js: lineTotal = consumerPrice × qty)
  // and the same one refunds are computed from.
  //
  // `revenue` is PAISE, like daily_trend[].revenue: neither is a MONEY_FIELDS
  // name, so the money middleware does not convert it. Clients divide by 100.
  let topProducts = [];
  if (activeOrders.length > 0) {
    const orderIds = activeOrders.map(o => o.id);
    const { data: items, error: ie } = await supabase
      .from('order_items')
      .select('product_id, qty, price, product:products(name, unit)')
      .in('order_id', orderIds);

    if (ie) {
      console.error('GET /dashboard top-products error:', ie);
      return res.status(500).json({ error: 'Could not fetch top products.' });
    }

    const prodMap = {};
    (items || []).forEach(item => {
      const pid  = item.product_id;
      const name = item.product?.name || 'Unknown';
      const unit = item.product?.unit || '';
      if (!prodMap[pid]) prodMap[pid] = { name, unit, qty: 0, revenue: 0 };
      const qty = parseFloat(item.qty || 0);
      prodMap[pid].qty     += qty;
      prodMap[pid].revenue += Math.round(parseFloat(item.price || 0) * qty);
    });
    topProducts = Object.entries(prodMap)
      .map(([id, v]) => ({ product_id: id, ...v }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);
  }

  // ── Farmers in scope ──────────────────────────────────────────────────────
  let farmersQuery = supabase.from('users').select('id', { count: 'exact', head: true }).eq('role', 'farmer');
  if (orderFilter.district) farmersQuery = farmersQuery.eq('district', orderFilter.district);
  if (orderFilter.village)  farmersQuery = farmersQuery.eq('village_town', orderFilter.village);
  if (stateDistricts)       farmersQuery = farmersQuery.in('district', stateDistricts);
  const { count: farmerCount } = await farmersQuery;

  // ── Consumers in scope ───────────────────────────────────────────────────
  let consumersQuery = supabase.from('users').select('id', { count: 'exact', head: true }).eq('role', 'consumer');
  if (orderFilter.district) consumersQuery = consumersQuery.eq('district', orderFilter.district);
  if (orderFilter.village)  consumersQuery = consumersQuery.eq('village_town', orderFilter.village);
  if (stateDistricts)       consumersQuery = consumersQuery.in('district', stateDistricts);
  const { count: consumerCount } = await consumersQuery;

  // ── Subscription summary (sellers only) ──────────────────────────────────
  let subQuery = supabase
    .from('users')
    .select('subscription_plan, subscription_expires_at, status')
    .eq('role', 'farmer')
    .not('subscription_expires_at', 'is', null);
  if (orderFilter.district) subQuery = subQuery.eq('district', orderFilter.district);
  if (stateDistricts)       subQuery = subQuery.in('district', stateDistricts);
  const { data: subUsers } = await subQuery;

  const now = new Date();
  const subSummary = { active: 0, expiring_soon: 0, expired: 0, by_plan: {} };
  (subUsers || []).forEach(u => {
    const exp  = new Date(u.subscription_expires_at);
    const days = Math.ceil((exp - now) / 86400000);
    if (days <= 0) {
      subSummary.expired++;
    } else if (days <= 10) {
      subSummary.expiring_soon++;
      subSummary.active++;
    } else {
      subSummary.active++;
    }
    if (u.subscription_plan) {
      subSummary.by_plan[u.subscription_plan] = (subSummary.by_plan[u.subscription_plan] || 0) + 1;
    }
  });

  // ── Returns in scope ──────────────────────────────────────────────────────
  const orderIds = orders.map(o => o.id);
  let returnCount = 0;
  if (orderIds.length > 0) {
    const { count, error: returnCountErr } = await supabase
      .from('returns')
      .select('id', { count: 'exact', head: true })
      .in('order_id', orderIds);
    // `count || 0` turned a failed count into a confident zero on the dashboard.
    if (returnCountErr) console.error('Dashboard return count failed:', returnCountErr.message);
    returnCount = count || 0;
  }

  // ── Orders by status breakdown ────────────────────────────────────────────
  const statusBreakdown = orders.reduce((acc, o) => {
    const key = o.cancelled ? 'Cancelled' : o.status;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  res.json({
    scope: adminRole,
    // Echo the geo drill-down back so the client can confirm what it is seeing,
    // and tell it whether this role may filter at all (drives the dropdowns).
    geo_filterable: !roleScoped,
    filter: { state: filterState, district: filterDistrict },
    kpis: {
      total_orders:     orders.length,
      active_orders:    activeOrders.length,
      delivered_orders: deliveredOrders.length,
      cancelled_orders: cancelledOrders.length,
      gmv_rupees:       (gmv / 100).toFixed(2),
      platform_fee_rupees: (platformFee / 100).toFixed(2),
      total_farmers:    farmerCount || 0,
      total_consumers:  consumerCount || 0,
      total_returns:    returnCount,
    },
    status_breakdown: statusBreakdown,
    daily_trend,
    top_products: topProducts,
    subscription_summary: subSummary,
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET /dashboard/executive  — company-wide business overview (Executive profile)
// ───────────────────────────────────────────────────────────────────────────────
// Serves Board of Director / CEO / Managing Director (Head Office allowed for
// preview). All figures are aggregated live from DB records in JS (same pattern as
// GET /dashboard). Money is returned already-in-rupees under field names NOT in the
// money middleware's MONEY_FIELDS set, so values pass through untouched.
// Query params: ?trend=monthly|quarterly|yearly  (default monthly)
// ═══════════════════════════════════════════════════════════════════════════════
// Tiles with no data source yet — the UI greys these out as "Needs integration".
const EXEC_PLACEHOLDERS = [
  'net_profit', 'ebitda', 'cash_flow', 'revenue_forecast',
  'receivables', 'payables', 'gst', 'tds', 'bank_balance', 'daily_settlement',
  'salary_cost', 'warehouse_cost', 'hub_cost',
  'vehicle_utilization', 'fuel_cost',
  'farmer_satisfaction', 'customer_complaints', 'hub_issues', 'stock_shortage',
];

// paise (int) → rupees (number, 2 dp). Named fields avoid the money middleware.
const rup = (paise) => Math.round((Number(paise || 0)) / 100 * 100) / 100;

// Rupees → a display string, for the alert messages this route AUTHORS (the UI
// cannot format these — they arrive as prose). Matches the client's money format:
// Indian grouping, always 2 dp. Without it an alert read "₹63.5" directly under a
// ranking that said "₹63.50" for the same district.
const inr = (rupees) => '₹' + Number(rupees || 0).toLocaleString('en-IN', {
  minimumFractionDigits: 2, maximumFractionDigits: 2,
});

// "1 order" / "2 orders" — pluralise a count with its noun.
const plural = (n, noun) => `${n} ${noun}${n === 1 ? '' : 's'}`;

// IST helpers (DB stores UTC; users are in IST = UTC+5:30).
const IST_MS = 5.5 * 3600000;
function istParts(d) {
  const t = new Date(new Date(d).getTime() + IST_MS);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth(), day: t.getUTCDate(), date: t };
}

// Resolve the optional ?state=/?district= drill-down to a Set of districts to
// scope by (null = no geo filter). A district pins exactly one; a state expands
// to its districts via `locations` (orders/users carry no state column). Shared
// by the executive dashboard; the main GET / inlines the same rule.
async function resolveGeoDistricts(req) {
  const filterState = (typeof req.query.state === 'string' && req.query.state.trim()) || null;
  const filterDistrict =
    (typeof req.query.district === 'string' && req.query.district.trim()) || null;
  if (filterDistrict) {
    return { filterState, filterDistrict, districtSet: new Set([filterDistrict]) };
  }
  if (filterState) {
    const { data: locs, error } = await supabase
      .from('locations').select('district').eq('state', filterState);
    if (error) throw new Error('geo-resolve');
    return { filterState, filterDistrict, districtSet: new Set((locs || []).map(l => l.district)) };
  }
  return { filterState, filterDistrict, districtSet: null };
}

router.get('/executive', async (req, res) => {
  const u = req.user;
  if (!u.dashboards.executive) {
    return res.status(403).json({ error: 'Executive dashboard is restricted to Board / Admin.' });
  }

  // Optional state/district drill-down. Every executive role is unscoped, so the
  // filter is always available here — it only ever narrows the company view.
  let geo;
  try {
    geo = await resolveGeoDistricts(req);
  } catch {
    return res.status(500).json({ error: 'Could not scope the executive dashboard.' });
  }
  const { filterState, filterDistrict, districtSet } = geo;
  const inGeoDist = (d) => districtSet == null || districtSet.has(d);

  const trendMode = ['monthly', 'quarterly', 'yearly'].includes(req.query.trend)
    ? req.query.trend : 'monthly';

  // ── Pull the datasets (JS aggregation, current-scale friendly) ──────────────
  const [
    ordersR, itemsR, productsR, usersR, listingsR, payoutsR, returnsR,
  ] = await Promise.all([
    supabase.from('orders').select('id, total, item_total, market_fee, delivery, status, cancelled, district, created_at, delivered_at, picked_up_at, eta_ts, consumer_id, refund_amt'),
    supabase.from('order_items').select('order_id, product_id, qty, price, farmer_id, farmer_name, rated, rating_value'),
    supabase.from('products').select('id, category, product_group'),
    supabase.from('users').select('id, role, created_at, district, status, subscription_amount, subscription_expires_at').is('deleted_at', null),
    supabase.from('farmer_listings').select('farmer_id, listed'),
    supabase.from('payouts').select('amount, status, created_at, paid_at, farmer:users ( district )'),
    supabase.from('returns').select('id, decision, refund_amt, order_id'),
  ]);

  const err = ordersR.error || itemsR.error || productsR.error || usersR.error
    || listingsR.error || payoutsR.error || returnsR.error;
  if (err) return res.status(500).json({ error: 'Could not load executive dashboard.' });

  // Apply the geo drill-down. Orders/users/payouts carry a district (payout via
  // its farmer), so they filter directly; items and returns have none, so they
  // scope by whether their order is in the filtered set. When no filter is set
  // (districtSet == null) every branch is a pass-through — the unfiltered
  // company view is byte-for-byte what it was before this feature.
  const noGeo    = districtSet == null;
  const products = productsR.data  || [];
  const orders   = (ordersR.data || []).filter(o => inGeoDist(o.district));
  const users    = (usersR.data  || []).filter(x => inGeoDist(x.district));
  const payouts  = (payoutsR.data || []).filter(p => inGeoDist(p.farmer?.district));
  const inScopeOrderIds = new Set(orders.map(o => o.id));
  const items    = noGeo ? (itemsR.data || [])
                         : (itemsR.data || []).filter(it => inScopeOrderIds.has(it.order_id));
  const returns  = noGeo ? (returnsR.data || [])
                         : (returnsR.data || []).filter(r => inScopeOrderIds.has(r.order_id));
  // Active-farmer count comes from listings (no district) — scope it to the
  // farmers that survived the user filter.
  const scopedFarmerIds = new Set(users.filter(x => x.role === 'farmer').map(x => x.id));
  const listings = noGeo ? (listingsR.data || [])
                         : (listingsR.data || []).filter(l => scopedFarmerIds.has(l.farmer_id));

  const active = orders.filter(o => !o.cancelled);

  // Reference "today"/month/year in IST
  const nowIst = istParts(Date.now());
  const isSameDay  = p => p.y === nowIst.y && p.m === nowIst.m && p.day === nowIst.day;
  const isThisMonth = p => p.y === nowIst.y && p.m === nowIst.m;
  const isThisYear  = p => p.y === nowIst.y;
  // previous month (handles Jan → Dec last year)
  const prevM = nowIst.m === 0 ? 11 : nowIst.m - 1;
  const prevMY = nowIst.m === 0 ? nowIst.y - 1 : nowIst.y;
  const isPrevMonth = p => p.y === prevMY && p.m === prevM;

  // ── Summary ─────────────────────────────────────────────────────────────────
  let revToday = 0, revMtd = 0, revYtd = 0, gmv = 0;
  const districtAgg = {};                 // district → { revenue(paise), orders }
  active.forEach(o => {
    const p = istParts(o.created_at);
    gmv += o.total;
    if (isSameDay(p))   revToday += o.total;
    if (isThisMonth(p)) revMtd   += o.total;
    if (isThisYear(p))  revYtd   += o.total;
    const dk = o.district || 'Unknown';
    if (!districtAgg[dk]) districtAgg[dk] = { revenue: 0, orders: 0 };
    districtAgg[dk].revenue += o.total;
    districtAgg[dk].orders  += 1;
  });

  const ordersThisMonth = active.filter(o => isThisMonth(istParts(o.created_at))).length;
  const ordersPrevMonth = active.filter(o => isPrevMonth(istParts(o.created_at))).length;
  const growthPct = (cur, prev) => prev > 0 ? Math.round((cur - prev) / prev * 1000) / 10 : (cur > 0 ? 100 : 0);

  const consumers = users.filter(x => x.role === 'consumer');
  const farmers   = users.filter(x => x.role === 'farmer');
  const consThisM = consumers.filter(x => isThisMonth(istParts(x.created_at))).length;
  const consPrevM = consumers.filter(x => isPrevMonth(istParts(x.created_at))).length;
  const farmThisM = farmers.filter(x => isThisMonth(istParts(x.created_at))).length;
  const farmPrevM = farmers.filter(x => isPrevMonth(istParts(x.created_at))).length;

  // ── Orders block (current snapshot totals) ──────────────────────────────────
  const ordersBlock = {
    today:     active.filter(o => isSameDay(istParts(o.created_at))).length,
    delivered: orders.filter(o => o.status === 'Delivered').length,
    cancelled: orders.filter(o => o.cancelled).length,
    pending:   active.filter(o => o.status !== 'Delivered').length,
    refunded:  returns.filter(r => r.decision === 'accepted').length,
  };

  // ── Customers: repeat / retention / basket ──────────────────────────────────
  const ordersByConsumer = {};
  active.forEach(o => { if (o.consumer_id) ordersByConsumer[o.consumer_id] = (ordersByConsumer[o.consumer_id] || 0) + 1; });
  const buyers = Object.keys(ordersByConsumer).length;
  const repeatBuyers = Object.values(ordersByConsumer).filter(n => n > 1).length;
  const avgBasket = active.length > 0 ? rup(active.reduce((s, o) => s + o.total, 0) / active.length) : 0;

  // ── Farmers: active / inactive / top / rating ───────────────────────────────
  const activeFarmerIds = new Set(listings.filter(l => l.listed).map(l => l.farmer_id));
  const farmerRevenue = {};   // farmer_id → { name, revenue(paise) }
  let ratingSum = 0, ratingCount = 0;
  const itemsByOrder = {};
  items.forEach(it => {
    (itemsByOrder[it.order_id] = itemsByOrder[it.order_id] || []).push(it);
    if (it.farmer_id) {
      const fr = farmerRevenue[it.farmer_id] || (farmerRevenue[it.farmer_id] = { name: it.farmer_name || 'Farmer', revenue: 0 });
      fr.revenue += Number(it.qty || 0) * Number(it.price || 0);
    }
    if (it.rated && it.rating_value) { ratingSum += it.rating_value; ratingCount++; }
  });
  const topFarmers = Object.entries(farmerRevenue)
    .map(([id, v]) => ({ farmer_id: id, name: v.name, revenue: rup(v.revenue) }))
    .sort((a, b) => b.revenue - a.revenue).slice(0, 5);

  // ── Product categories ──────────────────────────────────────────────────────
  const prodCat = {};
  products.forEach(p => { prodCat[p.id] = p.category || p.product_group || 'Other'; });
  const catAgg = {};   // category → { revenue(paise), orders:Set }
  items.forEach(it => {
    const cat = prodCat[it.product_id] || 'Other';
    const c = catAgg[cat] || (catAgg[cat] = { revenue: 0, orders: new Set() });
    c.revenue += Number(it.qty || 0) * Number(it.price || 0);
    c.orders.add(it.order_id);
  });
  const categories = Object.entries(catAgg)
    .map(([name, v]) => ({ name, revenue: rup(v.revenue), orders: v.orders.size }))
    .sort((a, b) => b.revenue - a.revenue);

  // ── Logistics: SLA / avg delivery time / late ───────────────────────────────
  const delivered = orders.filter(o => o.status === 'Delivered' && o.delivered_at);
  let durSum = 0, durN = 0, late = 0, onTimeEligible = 0;
  delivered.forEach(o => {
    if (o.picked_up_at) { durSum += (new Date(o.delivered_at) - new Date(o.picked_up_at)); durN++; }
    if (o.eta_ts) { onTimeEligible++; if (new Date(o.delivered_at) > new Date(o.eta_ts)) late++; }
  });
  const logistics = {
    avg_delivery_mins: durN > 0 ? Math.round(durSum / durN / 60000) : null,
    late_deliveries:   late,
    sla_pct:           onTimeEligible > 0 ? Math.round((onTimeEligible - late) / onTimeEligible * 100) : null,
  };

  // ── Financial (live cuts) ───────────────────────────────────────────────────
  const subActive = farmers.filter(f => f.subscription_expires_at && new Date(f.subscription_expires_at) > new Date(nowIst.date.getTime() - IST_MS));
  const financial = {
    platform_commission: rup(active.reduce((s, o) => s + o.market_fee, 0)),
    delivery_income:     rup(active.reduce((s, o) => s + o.delivery, 0)),
    subscription_income: rup(subActive.reduce((s, f) => s + Number(f.subscription_amount || 0), 0)),
    payouts_pending:     rup(payouts.filter(p => p.status === 'pending').reduce((s, p) => s + p.amount, 0)),
    payouts_paid:        rup(payouts.filter(p => p.status === 'paid').reduce((s, p) => s + p.amount, 0)),
  };

  // ── Districts (map + ranking): green/amber/red vs peak revenue ──────────────
  const maxDistRev = Math.max(1, ...Object.values(districtAgg).map(d => d.revenue));
  const districts = Object.entries(districtAgg)
    .map(([district, v]) => {
      const share = v.revenue / maxDistRev;
      const status = share >= 0.66 ? 'green' : share >= 0.33 ? 'amber' : 'red';
      return { district, revenue: rup(v.revenue), orders: v.orders, status };
    })
    .sort((a, b) => b.revenue - a.revenue);

  // ── Trend (period-bucketed active revenue + orders) ─────────────────────────
  const trend = buildTrend(active, trendMode);

  // ── Alerts (live-derived only) ──────────────────────────────────────────────
  const alerts = [];
  const cancelRate = orders.length > 0 ? cancelledOrdersCount(orders) / orders.length : 0;
  if (cancelRate > 0.15) {
    alerts.push({ type: 'high_cancellation', severity: 'high', params: { pct: Math.round(cancelRate * 100) }, message: `High cancellation rate: ${Math.round(cancelRate * 100)}% of all orders.` });
  }
  const stalePayouts = payouts.filter(p => p.status === 'pending' && (Date.now() - new Date(p.created_at)) > 7 * 86400000).length;
  if (stalePayouts > 0) {
    alerts.push({ type: 'delayed_payment', severity: 'medium', params: { count: stalePayouts, days: 7 }, message: `${plural(stalePayouts, 'farmer payout')} pending over 7 days.` });
  }
  districts.filter(d => d.status === 'red' && d.orders > 0).slice(0, 3).forEach(d => {
    alerts.push({ type: 'district_low', severity: 'low', params: { district: d.district, revenue: inr(d.revenue), count: d.orders }, message: `${d.district} underperforming (${inr(d.revenue)}, ${plural(d.orders, 'order')}).` });
  });

  res.json({
    scope: 'executive',
    generated_at: new Date().toISOString(),
    geo_filterable: true,
    filter: { state: filterState, district: filterDistrict },
    summary: {
      revenue_today: rup(revToday),
      revenue_mtd:   rup(revMtd),
      revenue_ytd:   rup(revYtd),
      gmv:           rup(gmv),
      total_orders:  orders.length,
      order_growth_pct:    growthPct(ordersThisMonth, ordersPrevMonth),
      customer_growth_pct: growthPct(consThisM, consPrevM),
      farmer_growth_pct:   growthPct(farmThisM, farmPrevM),
      active_districts:    Object.keys(districtAgg).length,
    },
    orders: ordersBlock,
    customers: {
      new: consThisM,
      repeat: repeatBuyers,
      retention_pct: buyers > 0 ? Math.round(repeatBuyers / buyers * 100) : 0,
      avg_basket: avgBasket,
    },
    farmers: {
      registered: farmers.length,
      active: activeFarmerIds.size,
      inactive: Math.max(0, farmers.length - activeFarmerIds.size),
      top: topFarmers,
      avg_rating: ratingCount > 0 ? Math.round(ratingSum / ratingCount * 10) / 10 : null,
    },
    categories,
    logistics,
    financial,
    districts,
    trend: { mode: trendMode, points: trend },
    alerts,
    placeholders: EXEC_PLACEHOLDERS,
  });
});

function cancelledOrdersCount(orders) { return orders.filter(o => o.cancelled).length; }

// ═══════════════════════════════════════════════════════════════════════════════
// GET /dashboard/operations  — geo-scoped operational dashboard
// ───────────────────────────────────────────────────────────────────────────────
// Serves the "Operations" profile. Scope narrows by the viewer's role:
//   District Manager / Hub Incharge → their district (district_assign || district)
//   Regional Manager / State Head / Zonal Manager → their state (all its districts)
//   Head Office → everything (preview)
// All figures aggregated live in JS. Money returned already-in-rupees.
// ═══════════════════════════════════════════════════════════════════════════════
// Operations dashboard geo-scope tiers, keyed off the consolidated role_key (the
// replacement for the old OPS_*_ROLES admin_role sets). District tier sees one
// district; region tier sees their state's districts; Admin is unscoped and may
// drill via the console filter. Access itself is gated by u.dashboards.operations.
const OPS_DISTRICT_KEYS = new Set(['district_manager', 'hub_incharge']);
const OPS_REGION_KEYS   = new Set(['regional_manager', 'state_head', 'zonal_manager']);

const OPS_PLACEHOLDERS = ['hub_stock', 'farmer_visits', 'vco_attendance', 'agents_online', 'transfer_stock'];

router.get('/operations', async (req, res) => {
  const u = req.user;
  if (!u.dashboards.operations) {
    return res.status(403).json({ error: 'Operations dashboard is restricted to operational managers.' });
  }

  // ── Resolve scope ───────────────────────────────────────────────────────────
  let scope = { level: 'all', name: 'All Regions' };
  let districtSet = null;   // null = no district filter
  if (OPS_DISTRICT_KEYS.has(u.role_key)) {
    const d = u.district_assign || u.district;
    scope = { level: 'district', name: d || 'Unassigned' };
    districtSet = new Set([d]);
  } else if (OPS_REGION_KEYS.has(u.role_key)) {
    scope = { level: 'region', name: u.state || 'Unassigned' };
    const { data: locs, error: locsErr } = await supabase.from('locations').select('district').eq('state', u.state);
    // An empty districtSet is not "no districts" — it silently scopes the whole
    // regional dashboard to nothing.
    if (locsErr) {
      console.error('Dashboard region district lookup failed:', locsErr.message);
      return res.status(500).json({ error: 'Could not scope the dashboard to your region. Please try again.' });
    }
    districtSet = new Set((locs || []).map(l => l.district));
  }

  // An unscoped role (Head Office / other OPS_ALL) may drill into one state or
  // district via the shared console filter — it only ever narrows "All Regions",
  // never widens a role that is already geo-locked (District/Region managers
  // keep the scope resolved above; their params are ignored).
  const roleUnscoped = districtSet == null;
  let filterState = null;
  let filterDistrict = null;
  if (roleUnscoped) {
    let geo;
    try {
      geo = await resolveGeoDistricts(req);
    } catch {
      return res.status(500).json({ error: 'Could not scope the operations dashboard.' });
    }
    filterState = geo.filterState;
    filterDistrict = geo.filterDistrict;
    if (geo.districtSet != null) {
      districtSet = geo.districtSet;
      scope = { level: filterDistrict ? 'district' : 'region', name: filterDistrict || filterState };
    }
  }
  const inScopeDistrict = (d) => districtSet == null || districtSet.has(d);

  // ── Pull datasets ───────────────────────────────────────────────────────────
  const [ordersR, usersR, listingsR, payoutsR, returnsR] = await Promise.all([
    supabase.from('orders').select('id, total, status, cancelled, district, village, created_at, delivered_at, agent_id, agent_name'),
    supabase.from('users').select('id, role, admin_role, fname, lname, phone, agent_vehicle, district, status, approval_status').is('deleted_at', null),
    supabase.from('farmer_listings').select('farmer_id, listed, confirmed, updated_at'),
    supabase.from('payouts').select('farmer_id, amount, status, created_at'),
    supabase.from('returns').select('id, order_id, decision, collected'),
  ]);
  const oErr = ordersR.error || usersR.error || listingsR.error || payoutsR.error || returnsR.error;
  if (oErr) return res.status(500).json({ error: 'Could not load operations dashboard.' });

  const allOrders = ordersR.data || [];
  const allUsers  = usersR.data  || [];
  const listings  = listingsR.data || [];
  const payouts   = payoutsR.data  || [];
  const returns   = returnsR.data  || [];

  const orders = allOrders.filter(o => inScopeDistrict(o.district));
  const active = orders.filter(o => !o.cancelled);
  const orderIdSet = new Set(orders.map(o => o.id));

  const nowIst = istParts(Date.now());
  const isToday = ts => { if (!ts) return false; const p = istParts(ts); return p.y === nowIst.y && p.m === nowIst.m && p.day === nowIst.day; };
  const weekAgo = Date.now() - 7 * 86400000;

  // ── Summary ─────────────────────────────────────────────────────────────────
  const ordersToday = active.filter(o => isToday(o.created_at));
  const summary = {
    orders_today:      ordersToday.length,
    revenue_today:     rup(ordersToday.reduce((s, o) => s + o.total, 0)),
    revenue_week:      rup(active.filter(o => new Date(o.created_at) >= weekAgo).reduce((s, o) => s + o.total, 0)),
    active_orders:     active.length,
    delivered_today:   orders.filter(o => o.status === 'Delivered' && isToday(o.delivered_at)).length,
    pending_deliveries: active.filter(o => o.status !== 'Delivered').length,
  };

  // ── Delivery status breakdown ───────────────────────────────────────────────
  const statusBreakdown = {};
  active.forEach(o => { statusBreakdown[o.status] = (statusBreakdown[o.status] || 0) + 1; });

  // ── Scoped people ───────────────────────────────────────────────────────────
  const scopedFarmers = allUsers.filter(x => x.role === 'farmer' && inScopeDistrict(x.district));
  const scopedFarmerIds = new Set(scopedFarmers.map(f => f.id));
  const agents = allUsers.filter(x => x.role === 'admin' && x.admin_role === 'Delivery Agent'
    && x.status === 'active' && inScopeDistrict(x.district));

  // ── Collections (listings by scoped farmers) ────────────────────────────────
  const scopedListings = listings.filter(l => scopedFarmerIds.has(l.farmer_id));
  const collections = {
    confirmed_listings: scopedListings.filter(l => l.confirmed).length,
    listed_active:      scopedListings.filter(l => l.listed).length,
    updated_today:      scopedListings.filter(l => isToday(l.updated_at)).length,
  };

  // ── Quality / returns in scope ──────────────────────────────────────────────
  const scopedReturns = returns.filter(r => orderIdSet.has(r.order_id));
  const quality = {
    pending_returns:  scopedReturns.filter(r => !r.decision).length,
    rejected_returns: scopedReturns.filter(r => r.decision === 'rejected').length,
    to_collect:       scopedReturns.filter(r => r.decision === 'accepted' && !r.collected).length,
  };

  // ── Pending farmer payments in scope ────────────────────────────────────────
  const pendingPayouts = payouts.filter(p => p.status === 'pending' && scopedFarmerIds.has(p.farmer_id));
  const payments = {
    pending_count:  pendingPayouts.length,
    pending_amount: rup(pendingPayouts.reduce((s, p) => s + p.amount, 0)),
    stale_count:    pendingPayouts.filter(p => new Date(p.created_at) < weekAgo).length,
  };

  // ── Farmers block ───────────────────────────────────────────────────────────
  const activeFarmerIds = new Set(scopedListings.filter(l => l.listed).map(l => l.farmer_id));
  const farmers = {
    registered:      scopedFarmers.length,
    active:          activeFarmerIds.size,
    pending_approval: scopedFarmers.filter(f => f.approval_status === 'pending_review').length,
  };

  // ── Per-district rollup (useful for region-scope view) ──────────────────────
  const distAgg = {};
  active.forEach(o => {
    const k = o.district || 'Unknown';
    const d = distAgg[k] || (distAgg[k] = { district: k, orders: 0, revenue: 0, pending: 0 });
    d.orders++; d.revenue += o.total; if (o.status !== 'Delivered') d.pending++;
  });
  const districts = Object.values(distAgg)
    .map(d => ({ district: d.district, orders: d.orders, revenue: rup(d.revenue), pending: d.pending }))
    .sort((a, b) => b.orders - a.orders);

  // ── Alerts (live) ───────────────────────────────────────────────────────────
  const alerts = [];
  if (farmers.pending_approval > 0) alerts.push({ type: 'farmer_approval', severity: 'medium', params: { count: farmers.pending_approval }, message: `${farmers.pending_approval} farmer registration${farmers.pending_approval > 1 ? 's' : ''} awaiting approval.` });
  if (payments.stale_count > 0) alerts.push({ type: 'delayed_payment', severity: 'high', params: { count: payments.stale_count, days: 7 }, message: `${payments.stale_count} farmer payout${payments.stale_count > 1 ? 's' : ''} pending over 7 days.` });
  if (quality.pending_returns > 0) alerts.push({ type: 'returns', severity: 'medium', params: { count: quality.pending_returns }, message: `${quality.pending_returns} return${quality.pending_returns > 1 ? 's' : ''} awaiting a decision.` });
  const unassigned = active.filter(o => !o.agent_id && ['Packaged', 'VCO Verified', 'Picked Up'].includes(o.status)).length;
  if (unassigned > 0) alerts.push({ type: 'assign', severity: 'low', params: { count: unassigned }, message: `${unassigned} order${unassigned > 1 ? 's' : ''} ready but no delivery agent assigned.` });

  res.json({
    scope,
    // Only an unscoped role may use the console State/District filter here.
    geo_filterable: roleUnscoped,
    filter: { state: filterState, district: filterDistrict },
    generated_at: new Date().toISOString(),
    summary,
    delivery_status: { status_breakdown: statusBreakdown, agents_total: agents.length },
    collections,
    quality,
    payments,
    farmers,
    agents: agents.slice(0, 20).map(a => ({ name: (a.fname || '') + (a.lname ? ' ' + a.lname : ''), phone: a.phone, vehicle: a.agent_vehicle, district: a.district })),
    districts,
    alerts,
    placeholders: OPS_PLACEHOLDERS,
  });
});

// Bucket active orders into period points (oldest → newest) for the trend chart.
function buildTrend(active, mode) {
  const now = new Date(Date.now() + IST_MS);
  const buckets = [];   // { key, label, revenue(paise), orders }
  const index = {};

  function ensure(key, label) {
    if (!(key in index)) { index[key] = buckets.length; buckets.push({ key, label, revenue: 0, orders: 0 }); }
    return index[key];
  }

  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  if (mode === 'yearly') {
    for (let i = 4; i >= 0; i--) { const y = now.getUTCFullYear() - i; ensure('Y' + y, String(y)); }
  } else if (mode === 'quarterly') {
    for (let i = 7; i >= 0; i--) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i * 3, 1));
      const q = Math.floor(d.getUTCMonth() / 3) + 1;
      ensure('Q' + d.getUTCFullYear() + q, 'Q' + q + " '" + String(d.getUTCFullYear()).slice(2));
    }
  } else { // monthly — last 12
    for (let i = 11; i >= 0; i--) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      ensure('M' + d.getUTCFullYear() + d.getUTCMonth(), MONTHS[d.getUTCMonth()] + " '" + String(d.getUTCFullYear()).slice(2));
    }
  }

  active.forEach(o => {
    const p = istParts(o.created_at);
    let key;
    if (mode === 'yearly')      key = 'Y' + p.y;
    else if (mode === 'quarterly') key = 'Q' + p.y + (Math.floor(p.m / 3) + 1);
    else                        key = 'M' + p.y + p.m;
    if (key in index) { const b = buckets[index[key]]; b.revenue += o.total; b.orders += 1; }
  });

  return buckets.map(b => ({ label: b.label, revenue: rup(b.revenue), orders: b.orders }));
}

// ═══════════════════════════════════════════════════════════════════════════════
// GET /dashboard/field  — field-worker dashboard (VCO & Delivery Agent)
// ───────────────────────────────────────────────────────────────────────────────
// VCO            → scoped to their village (vco_city || village_town)
// Delivery Agent → scoped to orders assigned to them (agent_id = self)
// Live aggregation in JS; money already-in-rupees. Returns { role, ... } so the
// agent console (apps/web → /app/agent) can render the right layout.
// ═══════════════════════════════════════════════════════════════════════════════
const FIELD_PLACEHOLDERS = {
  VCO: ['todays_schedule', 'gps_route', 'daily_earnings'],
  'Delivery Agent': ['distance_travelled', 'daily_earnings', 'fuel_allowance'],
};

router.get('/field', async (req, res) => {
  const u = req.user;
  if (!['vco', 'delivery_agent'].includes(u.role_key)) {
    return res.status(403).json({ error: 'Field dashboard is for VCO and Delivery Agent only.' });
  }

  const nowIst = istParts(Date.now());
  const isToday = ts => { if (!ts) return false; const p = istParts(ts); return p.y === nowIst.y && p.m === nowIst.m && p.day === nowIst.day; };

  // ── DELIVERY AGENT ──────────────────────────────────────────────────────────
  if (u.admin_role === 'Delivery Agent') {
    const { data: orders, error } = await supabase
      .from('orders')
      .select('id, total, status, cancelled, pay_method, delivered_at, created_at')
      .eq('agent_id', u.id);
    if (error) return res.status(500).json({ error: 'Could not load field dashboard.' });

    const mine = orders || [];
    const delivered = mine.filter(o => o.status === 'Delivered');
    const deliveredToday = delivered.filter(o => isToday(o.delivered_at));
    const pending = mine.filter(o => !o.cancelled && o.status !== 'Delivered');

    // Customer rating: avg of rated items on this agent's delivered orders
    let ratingSum = 0, ratingCount = 0;
    if (delivered.length) {
      const { data: items, error: itemsErr } = await supabase
        .from('order_items')
        .select('rating_value, rated')
        .in('order_id', delivered.map(o => o.id));
      // Unread, a failure showed the agent a rating of zero rather than no rating.
      if (itemsErr) console.error('Dashboard agent rating lookup failed:', itemsErr.message);
      (items || []).forEach(it => { if (it.rated && it.rating_value) { ratingSum += it.rating_value; ratingCount++; } });
    }

    const isCod = o => o.pay_method === 'Cash on Delivery';
    return res.json({
      role: 'Delivery Agent',
      scope: { level: 'agent', name: (u.fname || 'Agent') },
      generated_at: new Date().toISOString(),
      stats: {
        deliveries_today:  mine.filter(o => !o.cancelled && (isToday(o.created_at) || o.status !== 'Delivered')).length,
        completed:         delivered.length,
        completed_today:   deliveredToday.length,
        pending:           pending.length,
        failed:            mine.filter(o => o.cancelled).length,
        cod_amount:        rup(deliveredToday.filter(isCod).reduce((s, o) => s + o.total, 0)),
        digital_amount:    rup(deliveredToday.filter(o => !isCod(o)).reduce((s, o) => s + o.total, 0)),
        customer_rating:   ratingCount > 0 ? Math.round(ratingSum / ratingCount * 10) / 10 : null,
      },
      placeholders: FIELD_PLACEHOLDERS['Delivery Agent'],
    });
  }

  // ── VCO ─────────────────────────────────────────────────────────────────────
  const village = u.vco_city || u.village_town;
  const [farmersR, ordersR] = await Promise.all([
    supabase.from('users').select('id, approval_status, created_at').eq('role', 'farmer').eq('village_town', village),
    supabase.from('orders').select('id').eq('village', village),
  ]);
  if (farmersR.error || ordersR.error) return res.status(500).json({ error: 'Could not load field dashboard.' });

  const farmers = farmersR.data || [];
  const farmerIds = farmers.map(f => f.id);
  const villageOrderIds = (ordersR.data || []).map(o => o.id);

  const [listingsR, payoutsR, returnsR] = await Promise.all([
    farmerIds.length ? supabase.from('farmer_listings').select('farmer_id, listed, confirmed, qty_available, updated_at').in('farmer_id', farmerIds) : Promise.resolve({ data: [] }),
    farmerIds.length ? supabase.from('payouts').select('amount, status').in('farmer_id', farmerIds) : Promise.resolve({ data: [] }),
    villageOrderIds.length ? supabase.from('returns').select('id, decision, collected').in('order_id', villageOrderIds) : Promise.resolve({ data: [] }),
  ]);

  const listings = listingsR.data || [];
  const payouts  = payoutsR.data  || [];
  const returns  = returnsR.data  || [];

  const confirmed = listings.filter(l => l.confirmed);
  const pendingPayouts = payouts.filter(p => p.status === 'pending');

  return res.json({
    role: 'VCO',
    scope: { level: 'village', name: village || 'Unassigned' },
    generated_at: new Date().toISOString(),
    stats: {
      collections_today:  confirmed.filter(l => isToday(l.updated_at)).length,
      farmers_to_visit:   listings.filter(l => l.listed && !l.confirmed).length,
      products_collected: confirmed.length,
      pending_collection: listings.filter(l => l.listed && !l.confirmed).length,
      rejected_produce:   returns.filter(r => r.decision === 'rejected').length,
      returns_pending:    returns.filter(r => !r.decision).length,
      farmer_payments:    pendingPayouts.length,
      farmer_payments_amount: rup(pendingPayouts.reduce((s, p) => s + p.amount, 0)),
      farmers_registered: farmers.length,
      farmers_pending:    farmers.filter(f => f.approval_status === 'pending_review').length,
    },
    placeholders: FIELD_PLACEHOLDERS.VCO,
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET /dashboard/adminhead  — Head Office administration / operations control panel
// ───────────────────────────────────────────────────────────────────────────────
// Serves Head Office (+ Technical Admin / HR Admin / HR Manager as "Admin" for now).
// Focus: employees, approvals across the org, staff-by-role, audit activity, master
// data. Company-wide (no geo scope). Live aggregation in JS + count queries.
// ═══════════════════════════════════════════════════════════════════════════════
const ADMINHEAD_PLACEHOLDERS = ['support_tickets', 'escalations', 'warehouse_utilization', 'inventory_stock'];

router.get('/adminhead', async (req, res) => {
  const u = req.user;
  if (!u.dashboards.adminhead) {
    return res.status(403).json({ error: 'Admin Head dashboard is restricted to Admin / Technical Head / HR.' });
  }

  const nowIst = istParts(Date.now());
  const todayStartUtc = new Date(Date.UTC(nowIst.y, nowIst.m, nowIst.day) - IST_MS).toISOString();
  const weekAgoUtc = new Date(Date.now() - 7 * 86400000).toISOString();

  // Optional State/District drill-down. Every Admin Head role is unscoped, so the
  // console filter is always available here. It scopes the GEOGRAPHIC figures —
  // staff, employees (by their work district), districts/states covered, and the
  // employee + farmer approval counts. The org-wide ACTIVITY metrics (product
  // catalogue, audit/login counts, and pending produce listings, which carry no
  // district) stay company-wide by nature.
  let geo;
  try {
    geo = await resolveGeoDistricts(req);
  } catch {
    return res.status(500).json({ error: 'Could not scope the admin dashboard.' });
  }
  const { filterState, filterDistrict, districtSet } = geo;
  const inGeoDist = (d) => districtSet == null || districtSet.has(d);

  // Removed staff are not headcount. Both of these feed the org-strength tiles, and a
  // departed employee still counted there is simply a wrong number on a dashboard whose
  // whole job is headcount.
  const [employeesR, staffR] = await Promise.all([
    supabase.from('employees').select('status, approval_status, department, work_district').is('deleted_at', null),
    supabase.from('users').select('admin_role, district, state').eq('role', 'admin').is('deleted_at', null),
  ]);
  if (employeesR.error || staffR.error) return res.status(500).json({ error: 'Could not load admin dashboard.' });

  const employees = (employeesR.data || []).filter(e => inGeoDist(e.work_district));
  const staff = (staffR.data || []).filter(s => inGeoDist(s.district));

  // Farmers-pending is geographic — scope it to the selected districts when set.
  let farmersPendingQ = supabase.from('users').select('id', { count: 'exact', head: true })
    .eq('role', 'farmer').eq('approval_status', 'pending_review');
  if (districtSet) farmersPendingQ = farmersPendingQ.in('district', [...districtSet]);

  // Count queries (head:true → not subject to the 1000-row select cap)
  const [farmersPendingC, listingsPendingC, productsC, userAuditC, empAuditC, loginsTodayC, failedLoginsC] =
    await Promise.all([
      farmersPendingQ,
      supabase.from('farmer_listings').select('id', { count: 'exact', head: true }).eq('listing_status', 'pending'),
      supabase.from('products').select('id', { count: 'exact', head: true }),
      supabase.from('user_audit_log').select('id', { count: 'exact', head: true }).gte('changed_at', weekAgoUtc),
      supabase.from('employee_audit_log').select('id', { count: 'exact', head: true }).gte('changed_at', weekAgoUtc),
      supabase.from('user_login_history').select('id', { count: 'exact', head: true }).gte('created_at', todayStartUtc),
      supabase.from('user_login_history').select('id', { count: 'exact', head: true }).gte('created_at', todayStartUtc).eq('success', false),
    ]);

  const employees_pending = employees.filter(e => e.approval_status === 'pending').length;
  const farmers_pending = farmersPendingC.count || 0;
  const listings_pending = listingsPendingC.count || 0;

  // Staff-by-role (the "manage all roles" overview)
  const roleAgg = {};
  staff.forEach(s => { const r = s.admin_role || 'Unassigned'; roleAgg[r] = (roleAgg[r] || 0) + 1; });
  const staff_by_role = Object.entries(roleAgg).map(([role, count]) => ({ role, count })).sort((a, b) => b.count - a.count);

  // Employees by department
  const deptAgg = {};
  employees.filter(e => e.status === 'active').forEach(e => { const d = e.department || 'Unassigned'; deptAgg[d] = (deptAgg[d] || 0) + 1; });
  const employees_by_dept = Object.entries(deptAgg).map(([dept, count]) => ({ dept, count })).sort((a, b) => b.count - a.count);

  const districts_active = new Set(staff.map(s => s.district).filter(Boolean)).size;
  const states_covered = new Set(staff.map(s => s.state).filter(Boolean)).size;

  const alerts = [];
  const totalPending = employees_pending + farmers_pending + listings_pending;
  if (employees_pending > 0) alerts.push({ type: 'employee_approval', severity: 'high', params: { count: employees_pending }, message: `${employees_pending} employee onboarding request${employees_pending > 1 ? 's' : ''} awaiting HR approval.` });
  if (farmers_pending > 0) alerts.push({ type: 'farmer_approval', severity: 'medium', params: { count: farmers_pending }, message: `${farmers_pending} farmer registration${farmers_pending > 1 ? 's' : ''} pending review.` });
  if (listings_pending > 0) alerts.push({ type: 'listing_approval', severity: 'medium', params: { count: listings_pending }, message: `${listings_pending} produce listing${listings_pending > 1 ? 's' : ''} awaiting approval.` });
  if ((failedLoginsC.count || 0) >= 5) alerts.push({ type: 'security', severity: 'high', params: { count: failedLoginsC.count }, message: `${failedLoginsC.count} failed login attempts today — review access.` });

  res.json({
    scope: { level: 'all', name: 'Head Office' },
    geo_filterable: true,
    filter: { state: filterState, district: filterDistrict },
    generated_at: new Date().toISOString(),
    summary: {
      employees_active:   employees.filter(e => e.status === 'active').length,
      staff_logins:       staff.length,
      districts_active:   districts_active,
      states_covered:     states_covered,
      products_catalogue: productsC.count || 0,
    },
    approvals: {
      employees_pending,
      farmers_pending,
      listings_pending,
      total_pending: totalPending,
    },
    staff_by_role,
    employees_by_dept,
    audit: {
      user_changes_7d:     userAuditC.count || 0,
      employee_changes_7d: empAuditC.count || 0,
      logins_today:        loginsTodayC.count || 0,
      failed_logins_today: failedLoginsC.count || 0,
    },
    alerts,
    placeholders: ADMINHEAD_PLACEHOLDERS,
  });
});

module.exports = router;
