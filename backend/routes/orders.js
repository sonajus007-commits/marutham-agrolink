const express = require('express');
const jwt = require('jsonwebtoken');
const QRCode = require('qrcode');
const supabase = require('../db/supabase');
const { requireAuth } = require('../middleware/auth');
const { can } = require('../middleware/permissions');
const { validateBody, z } = require('../middleware/validate');
const { generateOrderCode } = require('../utils/codeGen');
const { getFeeForSeller } = require('../utils/fees');
const { payoutByOrder } = require('../utils/payouts');
const { streamInvoice } = require('../utils/invoice');
const platformConfig = require('../config/platform');
const invoiceModel = require('../utils/invoiceModel');
const { renderInvoiceHtml } = require('../utils/invoiceHtml');
const {
  SPLIT_ROUTE,
  groupItemsBySeller,
  sellerTotals,
  childCode,
} = require('../utils/orderSplit');
const { rollupToParent } = require('../utils/orderRollup');
const { resolveTalukHubId } = require('../utils/hubResolver');

const router = express.Router();
router.use(requireAuth);

// Only consumers place orders. A named guard, run ahead of body validation, keeps the
// 403-before-400 order the inline check had (a farmer with a bad cart is still a 403).
function consumersOnly(req, res, next) {
  if (req.user.role !== 'consumer') {
    return res.status(403).json({ error: 'Only consumers can place orders.' });
  }
  next();
}

// A cart line. `qty` is coerced to a number and required positive — the old check
// (`!qty || qty <= 0`) compared the RAW body value with `<=`, so a JSON string "2"
// slipped through untyped and then drove `listing.qty_available < qty` as a string.
// `passthrough` keeps any extra per-line fields the client sends. Fractional qty is
// allowed (produce sells by weight), so no `.int()`.
const orderItemSchema = z
  .object({
    product_id: z.string().min(1, 'Each item needs product_id, farmer_id, and qty > 0.'),
    farmer_id: z.string().min(1, 'Each item needs product_id, farmer_id, and qty > 0.'),
    qty: z.coerce.number({ message: 'Each item needs product_id, farmer_id, and qty > 0.' })
      .positive('Each item needs product_id, farmer_id, and qty > 0.'),
  })
  .passthrough();

const createOrderSchema = z
  .object({
    items: z.array(orderItemSchema).min(1, 'items array is required and must not be empty.'),
    pay_method: z.string().min(1, 'pay_method is required (UPI / Card / Cash on Delivery).'),
  })
  .passthrough(); // delivery_fee / delivery_address flow through to the handler unchanged

// ── Helpers ───────────────────────────────────────────────────────────────────

// Stages at which an order can still be cancelled
const CANCELLABLE_STAGES = [0, 1]; // Order Placed, Packaged — not once picked up

// ── POST /orders  (consumer only) ────────────────────────────────────────────
// Body: { items: [{product_id, farmer_id, qty}], pay_method, address? }
router.post('/', consumersOnly, validateBody(createOrderSchema), async (req, res) => {
  const { items, pay_method, delivery_fee: clientDeliveryFee, delivery_address } = req.body;

  // ── Ordering window: 8 PM – 8 AM IST only ────────────────────────────────
  // DISABLED FOR TESTING — re-enable by uncommenting the block below
  // const nowIST  = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  // const hourIST = nowIST.getUTCHours();
  // if (hourIST >= 8 && hourIST < 20) {
  //   return res.status(400).json({
  //     error: 'Orders can only be placed between 8 PM and 8 AM. The ordering window opens at 8 PM IST.',
  //   });
  // }

  // ── 1. Resolve each item from the DB ─────────────────────────────────────
  const resolvedItems = [];
  let fulfilmentVillage = null;
  let fulfilmentDistrict = null;

  for (const item of items) {
    // Shape (product_id, farmer_id, qty > 0) is guaranteed by createOrderSchema; qty
    // is now a real number, so the stock comparison below is numeric, not string-vs-string.
    const { product_id, farmer_id, qty } = item;

    // Fetch farmer listing (price + availability).
    // maybeSingle, not single: `.single()` errors when it matches nothing, so a
    // genuine database fault and "no such listing" were indistinguishable — and
    // every fault was reported to the customer as a missing product.
    const { data: listing, error: listingErr } = await supabase
      .from('farmer_listings')
      .select('farmer_price, qty_available, listed, confirmed, bulk_qty, bulk_disc_pct')
      .eq('farmer_id', farmer_id)
      .eq('product_id', product_id)
      .maybeSingle();

    if (listingErr) {
      console.error('POST /orders listing lookup failed:', listingErr.message);
      return res.status(500).json({ error: 'Could not price your order. Please try again.' });
    }
    if (!listing) {
      return res.status(404).json({ error: `No active listing found for product ${product_id} from farmer ${farmer_id}.` });
    }
    if (!listing.listed) {
      return res.status(400).json({ error: `Farmer's listing for product ${product_id} is currently unavailable.` });
    }
    if (!listing.confirmed) {
      return res.status(400).json({ error: `Farmer has not confirmed availability for product ${product_id} for tomorrow.` });
    }
    if (listing.qty_available < qty) {
      return res.status(400).json({ error: `Insufficient stock for product ${product_id}. Available: ${listing.qty_available}.` });
    }

    // Fetch product details
    const { data: product, error: productErr } = await supabase
      .from('products')
      .select('id, code, name, unit, platform_fee_pct, available, exotic')
      .eq('id', product_id)
      .maybeSingle();

    if (productErr) {
      console.error('POST /orders product lookup failed:', productErr.message);
      return res.status(500).json({ error: 'Could not price your order. Please try again.' });
    }
    if (!product || !product.available) {
      return res.status(400).json({ error: `Product ${product_id} is not available.` });
    }

    // Fetch seller info (name + village for fulfilment + seller_type for fee)
    const { data: farmer, error: farmerErr } = await supabase
      .from('users')
      .select('id, fname, lname, village_town, district, state, taluk, seller_type')
      .eq('id', farmer_id)
      .maybeSingle();

    if (farmerErr) {
      console.error('POST /orders seller lookup failed:', farmerErr.message);
      return res.status(500).json({ error: 'Could not price your order. Please try again.' });
    }
    if (!farmer) return res.status(404).json({ error: `Farmer ${farmer_id} not found.` });

    // Fulfilment village for an UNSPLIT (single-seller) order. A multi-seller cart
    // does not have one — each seller's goods sit in their own village — so it is
    // split into per-seller child orders below and each child carries its own
    // location. Taking the first seller's village for the whole order was the bug
    // that made the second seller's produce invisible to its own VCO.
    if (!fulfilmentVillage) {
      fulfilmentVillage = farmer.village_town;
      fulfilmentDistrict = farmer.district;
    }

    // Fetch district market price for savings calculation
    // A MISSING row is legitimate — not every district carries a price, and the
    // `?? 0` fallbacks below are correct for that. A FAILED read is not: it takes
    // the same path, silently dropping `handling` (a real charge) to zero and the
    // savings figure to nothing. Undercharging is not an acceptable failure mode
    // for a query that didn't run.
    const { data: distPrice, error: distPriceErr } = await supabase
      .from('product_district_prices')
      .select('market_price, handling')
      .eq('product_id', product_id)
      .eq('district', farmer.district)
      .maybeSingle();

    if (distPriceErr) {
      console.error('POST /orders district price lookup failed:', distPriceErr.message);
      return res.status(500).json({ error: 'Could not price your order. Please try again.' });
    }

    // ── Price calculation (all in paise) ─────────────────────────────────
    let farmerPrice = listing.farmer_price;

    // Apply bulk discount if applicable
    if (listing.bulk_qty && qty >= listing.bulk_qty && listing.bulk_disc_pct) {
      farmerPrice = Math.round(farmerPrice * (1 - listing.bulk_disc_pct / 100));
    }

    // Fee is seller-type-aware: Farmers 5%, Retailers 10%
    const platformFeePct = getFeeForSeller(farmer.seller_type);
    const consumerPrice = Math.round(farmerPrice * (1 + platformFeePct / 100));
    const lineTotal = Math.round(consumerPrice * qty);
    const lineFarmerTotal = Math.round(farmerPrice * qty);
    const handling = distPrice?.handling ?? 0;
    const govtPrice = distPrice?.market_price ?? null;
    const savedLine = govtPrice ? Math.max(0, Math.round((govtPrice - consumerPrice) * qty)) : 0;

    resolvedItems.push({
      product_id,
      product_code: product.code,
      name: product.name,
      farmer_id,
      farmer_name: `${farmer.fname}${farmer.lname ? ' ' + farmer.lname : ''}`,
      qty,
      unit: product.unit,
      price: consumerPrice,
      farmer_price: farmerPrice,
      base_farmer_price: listing.farmer_price,
      govt_price: govtPrice,
      // computed totals used below
      _lineTotal: lineTotal,
      _lineFarmerTotal: lineFarmerTotal,
      _handling: handling,
      _exotic: !!product.exotic,
      _saved: savedLine,
      // Where THIS seller's goods are, for the per-seller child order
      _sellerVillage: farmer.village_town,
      _sellerDistrict: farmer.district,
      // Seller taluk/state — resolves the pickup hub this parcel enters through.
      _sellerState: farmer.state,
      _sellerTaluk: farmer.taluk,
    });
  }

  // ── 2. Aggregate order totals (all paise) ──────────────────────────────────
  const item_total = resolvedItems.reduce((s, i) => s + i._lineTotal, 0);

  // Handling: charged ONCE per order — the highest handling amount among the cart's
  // items (not per-line, not per-unit). Any product the admin gave a handling amount
  // carries it; the old rule only counted it on products flagged `exotic`, so a
  // handling charge set on an ordinary product was silently dropped.
  const handling = resolvedItems.reduce((mx, i) => Math.max(mx, i._handling), 0);

  // Platform-fee revenue (consumer markup over farmer price). Already baked into
  // item_total via consumerPrice — recorded here for revenue reporting only.
  const market_fee = resolvedItems.reduce((s, i) => s + (i._lineTotal - i._lineFarmerTotal), 0);

  // Market fee: flat ₹10, charged once, only when the cart spans 2+ farmers.
  // Folded into total (not a stored column) — derivable as total−item_total−handling−delivery.
  const distinctFarmers  = new Set(resolvedItems.map(i => i.farmer_id)).size;
  const multiFarmerFee   = distinctFarmers >= 2 ? 1000 : 0;

  // Delivery: computed on the SERVER (client value ignored) — flat ₹25 below ₹400,
  // FREE at ₹400 and above.
  const delivery = item_total === 0 ? 0 : (item_total >= 40000 ? 0 : 2500);

  const saved = resolvedItems.reduce((s, i) => s + i._saved, 0);
  const total = item_total + handling + delivery + multiFarmerFee;

  // ── 3. Generate order code (atomic via DB function) ─────────────────────
  if (!req.user.district) {
    return res.status(400).json({ error: 'Your profile has no district set. Update your profile before ordering.' });
  }
  let code;
  try {
    code = await generateOrderCode(supabase, req.user.district);
  } catch (err) {
    console.error('generateOrderCode error:', err);
    return res.status(500).json({ error: 'Could not generate order code. Ensure the code_counters migration has been applied.' });
  }

  // Delivery-side village (consumer): chosen delivery address, else profile village.
  // Drives the hub → doorstep agent matching (Phase C), distinct from the farmer's
  // fulfilment `village` above.
  const deliveryVillage = (delivery_address && delivery_address.village_town) || req.user.village_town || null;

  // Delivery destination coordinates (geolocation phase 5): the map pin the consumer
  // dropped on the delivery address, promoted from the delivery_address JSONB to
  // top-level columns so the live-tracking map can read it without parsing the blob.
  // Best-effort — null when the address was never pinned; the order is never blocked.
  const destLat =
    delivery_address && typeof delivery_address.lat === 'number' ? delivery_address.lat : null;
  const destLng =
    delivery_address && typeof delivery_address.lng === 'number' ? delivery_address.lng : null;
  const destCoords = destLat !== null && destLng !== null ? { dest_lat: destLat, dest_lng: destLng } : {};

  // ── 3b. Order → hub attribution (Hub Management, Phase 2) ──────────────────
  // Every order records the taluk hub its goods ENTER through (the seller's hub)
  // and the taluk hub they LEAVE through for the door (the consumer's delivery
  // hub). Both best-effort: an unresolved side stamps NULL and never blocks the
  // order — attribution is reporting metadata, not a gate. See utils/hubResolver.
  //
  // Delivery side: the chosen delivery address wins (a consumer can ship to another
  // taluk), else the profile. Resolved once — one destination per order.
  const deliveryTaluk    = (delivery_address && delivery_address.taluk)    || req.user.taluk    || null;
  const deliveryDistrict = (delivery_address && delivery_address.district) || req.user.district || null;
  const deliveryState    = (delivery_address && delivery_address.state)    || req.user.state    || null;
  const deliveryHubId = await resolveTalukHubId(supabase, {
    state: deliveryState, district: deliveryDistrict, taluk: deliveryTaluk,
  });

  // Pickup side: each seller's taluk hub. Cached by seller so a multi-line cart from
  // one seller (and every child of a split) costs a single lookup.
  const pickupHubBySeller = new Map();
  for (const it of resolvedItems) {
    if (pickupHubBySeller.has(it.farmer_id)) continue;
    pickupHubBySeller.set(
      it.farmer_id,
      await resolveTalukHubId(supabase, {
        state: it._sellerState, district: it._sellerDistrict, taluk: it._sellerTaluk,
      }),
    );
  }

  // ── 4. Insert order — one row, or a parent + one child per seller ─────────
  // A cart from a single seller stays exactly one row, as it always has. A cart
  // spanning sellers becomes a parent (what the customer pays for and tracks) plus
  // a child per seller (what actually travels): each seller's goods are verified by
  // their OWN village's VCO and routed Direct-or-Hub separately.
  const sellerGroups = groupItemsBySeller(resolvedItems);
  const isSplit = sellerGroups.length >= 2;

  const consumerName = `${req.user.fname}${req.user.lname ? ' ' + req.user.lname : ''}`;
  const payStatus = pay_method === 'Cash on Delivery' ? 'pending' : 'paid';

  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .insert({
      code,
      consumer_id:   req.user.id,
      consumer_name: consumerName,
      // A split parent has no single fulfilment village — its parcels are in
      // several. It must stay NULL: the VCO queue matches on `village`, so a value
      // here would put the container in a VCO's list alongside the real parcel.
      // District still comes from the consumer (the same district the code encodes)
      // so revenue-by-district keeps bucketing the order.
      district:      isSplit ? req.user.district : fulfilmentDistrict,
      village:       isSplit ? null : fulfilmentVillage,
      delivery_village: deliveryVillage,
      item_total, handling, market_fee, delivery, total, saved,
      pay_method,
      pay_status:    payStatus,
      stage:         0,
      status:        'Order Placed',
      // The container's own route, so its `stage` indexes into a map that can hold
      // any rollup status. Every pipeline mutation refuses a row routed this way.
      route:         isSplit ? SPLIT_ROUTE : '',
      // Hub attribution. A split parent has several sellers, so — like its NULL
      // village — it carries no single pickup hub; each child carries its own.
      // An unsplit order has exactly one seller, so its pickup hub is that seller's.
      pickup_hub_id:   isSplit ? null : (pickupHubBySeller.get(resolvedItems[0].farmer_id) ?? null),
      delivery_hub_id: deliveryHubId,
      ...(delivery_address ? { delivery_address } : {}),
      ...destCoords,
    })
    .select()
    .single();

  if (orderErr) {
    console.error('POST /orders insert error:', orderErr);
    return res.status(500).json({ error: 'Could not place order.' });
  }

  /* Undo a half-built order. Deleting the parent cascades to its children (FK is
   * ON DELETE CASCADE), and their items go with them. If the rollback ITSELF fails
   * we are left with an order that counts on dashboards and in payouts but has no
   * contents — there is no second compensating action, so at minimum it must be
   * loud rather than the silent corruption this used to be. */
  const rollback = async (what) => {
    const { error: rollbackErr } = await supabase.from('orders').delete().eq('id', order.id);
    if (rollbackErr) {
      console.error(`ORPHANED ORDER ${code} (${order.id}) — ${what} failed AND the rollback ` +
                    `failed. It must be removed by hand: ${rollbackErr.message}`);
    }
  };

  // ── 4b. Child orders, one per seller ──────────────────────────────────────
  // The charges the customer pays once (delivery, handling, multi-vendor fee) ride
  // on the FIRST child so that sum(children.total) === parent.total exactly and each
  // parcel's COD amount is collectable at the door. Everything else on a child is
  // that seller's own lines.
  let children = [];
  if (isSplit) {
    const childRows = sellerGroups.map((group, idx) => {
      const seq = idx + 1;
      const first = seq === 1;
      const totals = sellerTotals(group.items);
      return {
        code:          childCode(code, seq),
        parent_order_id: order.id,
        split_seq:     seq,
        seller_id:     group.seller_id,
        seller_name:   group.seller_name,
        consumer_id:   req.user.id,
        consumer_name: consumerName,
        district:      group.district,
        village:       group.village,
        delivery_village: deliveryVillage,
        item_total:    totals.item_total,
        market_fee:    totals.market_fee,
        saved:         totals.saved,
        handling:      first ? handling : 0,
        delivery:      first ? delivery : 0,
        total:         totals.item_total + (first ? handling + delivery + multiFarmerFee : 0),
        pay_method,
        pay_status:    payStatus,
        stage:         0,
        status:        'Order Placed',
        route:         '',
        // Each child parcel enters through its own seller's hub; all leave through
        // the one consumer delivery hub.
        pickup_hub_id:   pickupHubBySeller.get(group.seller_id) ?? null,
        delivery_hub_id: deliveryHubId,
        ...(delivery_address ? { delivery_address } : {}),
        ...destCoords,
      };
    });

    const { data: inserted, error: childErr } = await supabase
      .from('orders')
      .insert(childRows)
      .select();

    if (childErr) {
      console.error('POST /orders child insert error:', childErr);
      await rollback('child orders');
      return res.status(500).json({ error: 'Could not place order.' });
    }
    children = inserted;
  }

  // ── 5. Insert order items (strip internal _fields) ────────────────────────
  // Items belong to the CHILD that will actually carry them, never to the parent:
  // farmer payouts group order_items by order_id, so a line copied onto the parent
  // as well would pay its seller twice.
  const childIdBySeller = new Map(children.map(c => [c.seller_id, c.id]));
  const itemRows = resolvedItems.map(({ _lineTotal, _lineFarmerTotal, _handling, _exotic, _saved, _sellerVillage, _sellerDistrict, _sellerState, _sellerTaluk, ...rest }) => ({
    ...rest,
    order_id: isSplit ? childIdBySeller.get(rest.farmer_id) : order.id,
  }));

  const { error: itemsErr } = await supabase.from('order_items').insert(itemRows);
  if (itemsErr) {
    console.error('POST /orders items insert error:', itemsErr);
    await rollback('items');
    return res.status(500).json({ error: 'Could not save order items.' });
  }

  // ── 6. Write first history entry ──────────────────────────────────────────
  // The order is already committed, so a failure here must NOT fail the request —
  // that would tell the customer their order failed when it did not. Log it; the
  // timeline is missing an entry, the order is fine.
  // Each child gets its own opening entry: a parcel's timeline has to start
  // somewhere, and the VCO/agent screens read the child's history, not the parent's.
  const historyRows = [
    {
      order_id: order.id,
      label:    'Order Placed',
      note:     isSplit
        ? `Order ${code} placed by ${consumerName}; split across ${sellerGroups.length} sellers.`
        : `Order ${code} placed by ${consumerName}.`,
    },
    ...children.map(c => ({
      order_id: c.id,
      label:    'Order Placed',
      note:     `Order ${code} placed by ${consumerName} — ${c.seller_name}'s items (${c.code}).`,
    })),
  ];

  const { error: historyErr } = await supabase.from('order_history').insert(historyRows);
  if (historyErr) console.error(`Order ${code}: first history entry failed:`, historyErr.message);

  // ── 7. Reduce farmer listing quantities ──────────────────────────────────
  // Unread, BOTH queries below failed open into an oversell: a failed read left
  // `listing` null and the `if (listing)` guard skipped the decrement outright,
  // while a failed update simply did nothing — and either way the route still
  // answered "201 Order placed". Stock never dropped, the item was never
  // auto-unlisted at zero, and the next customer bought the same goods.
  //
  // The order is committed by this point and cannot be unwound, so a failure here
  // cannot fail the request. What it CAN do is stop being invisible.
  const stockFailures = [];

  for (const item of resolvedItems) {
    const { data: listing, error: readErr } = await supabase
      .from('farmer_listings')
      .select('qty_available')
      .eq('farmer_id', item.farmer_id)
      .eq('product_id', item.product_id)
      .single();

    if (readErr || !listing) {
      stockFailures.push(`${item.product_id}/${item.farmer_id} (read: ${readErr ? readErr.message : 'no listing'})`);
      continue;
    }

    const newQty = Math.max(0, listing.qty_available - item.qty);
    const stockUpdate = { qty_available: newQty };
    // Auto-unlist when stock reaches zero so consumers can't order more
    if (newQty <= 0) stockUpdate.listed = false;

    const { error: writeErr } = await supabase
      .from('farmer_listings')
      .update(stockUpdate)
      .eq('farmer_id', item.farmer_id)
      .eq('product_id', item.product_id);

    if (writeErr) {
      stockFailures.push(`${item.product_id}/${item.farmer_id} (write: ${writeErr.message})`);
    }
  }

  if (stockFailures.length) {
    console.error(`OVERSELL RISK — order ${code} is placed but stock was NOT reduced for ` +
                  `${stockFailures.length} item(s); they remain on sale at the old quantity: ` +
                  stockFailures.join('; '));
  }

  res.status(201).json({
    message: 'Order placed successfully.',
    order,
    // Present only for a multi-seller order, so a client that has never heard of
    // splitting sees exactly the response it always got.
    ...(isSplit
      ? {
          parts: children.map(c => ({
            id: c.id, code: c.code, split_seq: c.split_seq,
            seller_id: c.seller_id, seller_name: c.seller_name,
            village: c.village, total: c.total, status: c.status,
          })),
        }
      : {}),
  });
});

// ── GET /orders  (role-scoped) ────────────────────────────────────────────────
router.get('/', async (req, res) => {
  const { village, district, route, status } = req.query;
  const u = req.user;

  /** Farmers only: { order_id → paise this farmer is owed }. Attached below. */
  let farmerPayouts = null;

  const COLUMNS = 'id, code, consumer_name, district, village, delivery_village, total, status, stage, route, pay_method, pay_status, created_at, agent_name, dest_lat, dest_lng';

  /* Consumers also get a line-item count, for the dashboard's Recent Orders table.
   * It is an EMBEDDED AGGREGATE rather than a second fetch-and-group (the shape the
   * farmer branch below uses for payouts) because the count is then computed in SQL:
   * reading the rows to length them would put every line item of every order the
   * consumer has ever placed through the 1000-row PostgREST cap, and past it the
   * count would not error — it would just quietly get smaller. Only consumers ask
   * for this, so no other role pays for the join. */
  const wantsItemCount = u.role === 'consumer';

  /* A split order exists as a parent AND its children, so every list has to say
   * which of the two it wants or it double-counts:
   *   • CUSTOMER ORDERS (parents + unsplit) — `parent_order_id is null`. What the
   *     customer placed and what the business bills. Money is summed over these.
   *   • PARCELS (children + unsplit) — everything except the containers. What a VCO
   *     verifies, an agent carries, a hub checks in.
   * An unsplit order is BOTH, which is what makes the two filters safe to apply to a
   * database that also holds every order placed before splitting existed. */
  const customerOrdersOnly = (q) => q.is('parent_order_id', null);
  const parcelsOnly        = (q) => q.neq('route', SPLIT_ROUTE);

  // Consumers also get `saved` (per-order savings vs. the district market rate),
  // for the dashboard's Total-Saved KPI and its this-month breakdown popup. It is
  // a real column; it was simply never in the list's projection, so the tile read
  // zero. res.json's money middleware converts it (paise → rupees) on the way out.
  let query = supabase
    .from('orders')
    .select(wantsItemCount ? `${COLUMNS}, saved, order_items(count)` : COLUMNS)
    .order('created_at', { ascending: false });

  if (u.role === 'consumer') {
    // The customer tracks the order they placed, not its internal parcels; the
    // parts hang off GET /orders/:id.
    query = customerOrdersOnly(query.eq('consumer_id', u.id));

  } else if (u.role === 'farmer') {
    // Orders that contain this farmer's produce. The same query gives us what
    // she is owed on each one — the farmer earnings screen used to read
    // `o.farmer_payout`, a column that has never existed, so every figure
    // derived from it was silently zero.
    const { data: myItems, error: myItemsErr } = await supabase
      .from('order_items')
      .select('order_id, farmer_price, qty')
      .eq('farmer_id', u.id);

    // Unread, this failed into `{ orders: [] }` — indistinguishable from "you have
    // no orders". A seller would open the app, see an empty list, and have no
    // reason to think anything was wrong. Exactly the bug the comment above warns
    // about, one line below the warning.
    if (myItemsErr) {
      console.error('GET /orders farmer item lookup failed:', myItemsErr.message);
      return res.status(500).json({ error: 'Could not load your orders. Please try again.' });
    }

    const ids = [...new Set((myItems || []).map(r => r.order_id))];
    if (ids.length === 0) return res.json({ orders: [] });
    query = query.in('id', ids);
    farmerPayouts = payoutByOrder(myItems); // { order_id: paise }

  } else if (u.role === 'admin') {
    // Orders module 'view'. Technical Head / HR have no orders access and are
    // refused here rather than falling through to an unfiltered company-wide list.
    if (!can(u, 'orders', 'view')) {
      return res.status(403).json({ error: 'Orders view permission required.' });
    }
    const role = u.admin_role;

    /* Which of the two views this role works in. Logistics roles handle physical
     * parcels; management roles read money, and must see one row per customer
     * order or every split total counts twice. `?parts=1` lets a management role
     * drop into the parcel view to trace a split order's legs. */
    const LOGISTICS_ROLES = ['VCO', 'Delivery Agent', 'Hub Incharge'];
    const wantsParcels = LOGISTICS_ROLES.includes(role) || req.query.parts === '1';

    if (role === 'VCO') {
      // Match on the VCO's village. village_town is the canonical field (editable
      // in profile/admin edit); vco_city is a legacy fallback for older records.
      const vcoVillage = u.village_town || u.vco_city || '';
      if (u.can_deliver) {
        // A delivery-capable VCO also works the last-mile orders assigned to them
        // (agent_id), on top of their collection queue (their village). Quote the
        // village value so a name with a comma can't break the .or() parse.
        query = query.or(`village.eq."${String(vcoVillage).replace(/"/g, '')}",agent_id.eq.${u.id}`);
      } else {
        query = query.eq('village', vcoVillage);
      }

    } else if (role === 'District Manager' || role === 'Hub Incharge') {
      query = query.eq('district', u.district_assign || u.district);
      if (village) query = query.eq('village', village);

    } else if (role === 'Delivery Agent') {
      // Agent sees their assigned orders + pickup queue (stage 2 = VCO Verified, ready for pickup)
      query = query.or(`agent_id.eq.${u.id},stage.eq.2`);

    } else {
      // Head Office / State Head / Regional Manager — all orders
      if (district) query = query.eq('district', district);
    }

    /* Applied last so it cannot be undone by a branch above. For the agent it is
     * load-bearing, not hygiene: a parent whose children have all reached VCO
     * Verified rolls up to stage 2 too, and would otherwise sit in the pickup queue
     * as a parcel that does not physically exist. */
    query = wantsParcels ? parcelsOnly(query) : customerOrdersOnly(query);
  }

  if (route)  query = query.eq('route',  route);
  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (error) {
    console.error('GET /orders error:', error);
    return res.status(500).json({ error: 'Could not fetch orders.' });
  }

  // Computed, not stored: there is no orders.farmer_payout column. Paise here;
  // convertMoney turns it into rupees on the way out.
  let orders = farmerPayouts
    ? data.map(o => ({ ...o, farmer_payout: farmerPayouts[o.id] || 0 }))
    : data;

  // Flatten the aggregate away: PostgREST hands it back as order_items: [{ count: n }],
  // and an order with no lines arrives as [] rather than a zero row. item_count is
  // deliberately NOT a MONEY_FIELD — it is a tally, not paise.
  if (wantsItemCount) {
    orders = orders.map(({ order_items, ...o }) => ({
      ...o,
      item_count: order_items?.[0]?.count ?? 0,
    }));

    /* A split parent holds no order_items of its own — they belong to the children
     * that carry them — so the aggregate above counts zero and the customer's
     * Recent Orders table would read "0 items" for exactly the biggest baskets.
     * Count across the children instead, in ONE query for the whole page, and only
     * when this customer actually has a split order. */
    const splitParents = orders.filter(o => o.route === SPLIT_ROUTE);
    if (splitParents.length > 0) {
      const { data: childCounts, error: childCountErr } = await supabase
        .from('orders')
        .select('parent_order_id, order_items(count)')
        .in('parent_order_id', splitParents.map(o => o.id));

      // Unread, this left every split order reading "0 items" — a wrong number is
      // worse than a missing one, so say the load failed instead.
      if (childCountErr) {
        console.error('GET /orders split item count failed:', childCountErr.message);
        return res.status(500).json({ error: 'Could not fetch orders.' });
      }

      const countByParent = new Map();
      for (const row of childCounts || []) {
        const n = row.order_items?.[0]?.count ?? 0;
        countByParent.set(row.parent_order_id, (countByParent.get(row.parent_order_id) || 0) + n);
      }
      orders = orders.map(o =>
        countByParent.has(o.id) ? { ...o, item_count: countByParent.get(o.id) } : o
      );
    }
  }

  res.json({ orders });
});

// ── GET /orders/spend-by-category  (consumer only) ────────────────────────────
// This calendar month's item spend, grouped by product category, for the
// dashboard's Total-Spent popup. MUST be declared before `/:id`, or Express
// routes it there with id="spend-by-category".
//
// Summed over the buyer's PARCELS (route ≠ split): a split order's parent is an
// empty container — its children carry the lines — so `neq(route, SPLIT_ROUTE)`
// counts every line exactly once. Cancelled parcels are excluded (the "all
// placed this month except cancelled" scope). Category lives on `products`, not
// on the line, so it's a second lookup — order_items has no products embed.
// Amounts stay in paise; res.json's money middleware turns `amount` into rupees.
router.get('/spend-by-category', consumersOnly, async (req, res) => {
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const { data: parcels, error: parcelsErr } = await supabase
    .from('orders')
    .select('id')
    .eq('consumer_id', req.user.id)
    .neq('route', SPLIT_ROUTE)
    .neq('status', 'Cancelled')
    .gte('created_at', monthStart.toISOString());

  if (parcelsErr) {
    console.error('GET /orders/spend-by-category parcels lookup failed:', parcelsErr.message);
    return res.status(500).json({ error: 'Could not load your spending breakdown.' });
  }

  const orderIds = (parcels || []).map((o) => o.id);
  if (orderIds.length === 0) return res.json({ categories: [] });

  const { data: items, error: itemsErr } = await supabase
    .from('order_items')
    .select('product_id, qty, price')
    .in('order_id', orderIds);

  if (itemsErr) {
    console.error('GET /orders/spend-by-category items lookup failed:', itemsErr.message);
    return res.status(500).json({ error: 'Could not load your spending breakdown.' });
  }

  const productIds = [...new Set((items || []).map((i) => i.product_id).filter(Boolean))];
  const catByProduct = new Map();
  if (productIds.length > 0) {
    const { data: prods, error: prodsErr } = await supabase
      .from('products')
      .select('id, category')
      .in('id', productIds);
    if (prodsErr) {
      console.error('GET /orders/spend-by-category product lookup failed:', prodsErr.message);
      return res.status(500).json({ error: 'Could not load your spending breakdown.' });
    }
    for (const p of prods || []) catByProduct.set(p.id, p.category || 'Other');
  }

  const byCategory = new Map();
  for (const it of items || []) {
    const category = catByProduct.get(it.product_id) || 'Other';
    const line = Number(it.price) * Number(it.qty); // paise
    if (!Number.isFinite(line)) continue;
    byCategory.set(category, (byCategory.get(category) || 0) + line);
  }

  const categories = [...byCategory.entries()]
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);

  res.json({ categories });
});

// ── GET /orders/frequent-items  (consumer only) ───────────────────────────────
// Products this buyer has ordered on 2+ separate CUSTOMER orders — the "Buy Again"
// candidates. Ranked by how many orders contained each. The client then keeps only
// those with a live offer in its district today and re-prices them, so this returns
// just the tally (product_id, name, order_count, last_qty), never a price or seller.
//
// MUST be declared before `/:id`, or Express routes it there with id="frequent-items".
//
// Counted over the buyer's PARCELS (route ≠ split): a split order's parent is an
// empty container — its children carry the lines. Each parcel is mapped back to the
// CUSTOMER order it belongs to (parent_order_id ?? id) so a single multi-vendor order
// counts once, not once per seller. Cancelled parcels are excluded.
router.get('/frequent-items', consumersOnly, async (req, res) => {
  const { data: parcels, error: parcelsErr } = await supabase
    .from('orders')
    .select('id, parent_order_id, created_at')
    .eq('consumer_id', req.user.id)
    .neq('route', SPLIT_ROUTE)
    .neq('status', 'Cancelled');

  if (parcelsErr) {
    console.error('GET /orders/frequent-items parcels lookup failed:', parcelsErr.message);
    return res.status(500).json({ error: 'Could not load your reorder items.' });
  }

  if (!parcels || parcels.length === 0) return res.json({ items: [] });

  // parcel id → the customer order it rolls up to, and when that order was placed.
  const customerOf = new Map();
  const placedAt = new Map();
  for (const o of parcels) {
    customerOf.set(o.id, o.parent_order_id || o.id);
    placedAt.set(o.id, o.created_at ? new Date(o.created_at).getTime() : 0);
  }

  const { data: items, error: itemsErr } = await supabase
    .from('order_items')
    .select('order_id, product_id, name, qty')
    .in('order_id', parcels.map((o) => o.id));

  if (itemsErr) {
    console.error('GET /orders/frequent-items items lookup failed:', itemsErr.message);
    return res.status(500).json({ error: 'Could not load your reorder items.' });
  }

  // Per product: the set of distinct customer orders it appeared on, plus the qty
  // from the most recent of those orders (to prefill the reorder line).
  const agg = new Map();
  for (const it of items || []) {
    if (!it.product_id) continue;
    const custId = customerOf.get(it.order_id);
    const ts = placedAt.get(it.order_id) || 0;
    let a = agg.get(it.product_id);
    if (!a) {
      a = { name: it.name, orders: new Set(), latestTs: -1, latestQty: 0 };
      agg.set(it.product_id, a);
    }
    a.orders.add(custId);
    if (ts >= a.latestTs) {
      a.latestTs = ts;
      a.latestQty = Number(it.qty) || 0;
      if (it.name) a.name = it.name;
    }
  }

  const result = [...agg.entries()]
    .map(([product_id, a]) => ({
      product_id,
      name: a.name,
      order_count: a.orders.size,
      last_qty: a.latestQty,
    }))
    .filter((r) => r.order_count >= 2)
    .sort((x, y) => y.order_count - x.order_count);

  res.json({ items: result });
});

// ── GET /orders/:id  (full detail) ───────────────────────────────────────────
router.get('/:id', async (req, res) => {
  const identifier = req.params.id;

  // Accept both UUID and order code (e.g. ORD1234)
  const isCode = identifier.startsWith('ORD');
  let orderQuery = supabase
    .from('orders')
    .select('*');
  orderQuery = isCode
    ? orderQuery.eq('code', identifier)
    : orderQuery.eq('id', identifier);

  const { data: order, error } = await orderQuery.single();

  if (error || !order) return res.status(404).json({ error: 'Order not found.' });

  // Role guard: consumer can only see their own order
  if (req.user.role === 'consumer' && order.consumer_id !== req.user.id) {
    return res.status(403).json({ error: 'You can only view your own orders.' });
  }

  // Consumer contact + address (for delivery display and for falling back when
  // the order didn't capture a delivery_address, e.g. pre-migration orders).
  if (order.consumer_id) {
    // A failed read here silently produced an order with NO delivery address and
    // no phone number — handed to a delivery agent who then has nowhere to take it.
    const { data: consumer, error: consumerErr } = await supabase
      .from('users')
      .select('phone, country_code, house_no, street1, street2, landmark, village_town, city, district, pincode, state')
      .eq('id', order.consumer_id)
      .maybeSingle();

    if (consumerErr) {
      console.error('GET /orders/:id consumer lookup failed:', consumerErr.message);
      return res.status(500).json({ error: 'Could not load the order. Please try again.' });
    }
    if (consumer) {
      order.consumer_phone = `${consumer.country_code || '+91'} ${consumer.phone}`;
      if (!order.delivery_address) {
        order.delivery_address = {
          label:        'Registered address',
          house_no:     consumer.house_no,
          street1:      consumer.street1,
          street2:      consumer.street2,
          landmark:     consumer.landmark,
          village_town: consumer.village_town,
          city:         consumer.city,
          district:     consumer.district,
          pincode:      consumer.pincode,
          state:        consumer.state,
          phone:        consumer.phone,
        };
      }
    }
  }

  /* A split order's contents live on its children, one parcel per seller. Load them
   * so the parent can render both the full basket AND a per-seller breakdown, each
   * part with its own status and its own pipeline — which is the whole reason the
   * customer sees one order rather than N. */
  let parts = [];
  const isSplitParent = order.route === SPLIT_ROUTE;

  if (isSplitParent) {
    const { data: children, error: childErr } = await supabase
      .from('orders')
      .select('id, code, split_seq, seller_id, seller_name, village, district, status, stage, route, total, item_total, cancelled, cancel_reason, agent_id, agent_name, agent_phone, eta_ts, picked_up_at, delivered_at, pay_status, dest_lat, dest_lng')
      .eq('parent_order_id', order.id)
      .order('split_seq', { ascending: true });

    // A split parent with no children is a corrupt order, not an empty one. Failing
    // here is right: rendering it would show a paid order with an empty basket.
    if (childErr) {
      console.error('GET /orders/:id parts lookup failed:', childErr.message);
      return res.status(500).json({ error: 'Could not load the order. Please try again.' });
    }
    parts = children || [];
  }

  // Fetch items. An order that renders with no items is not a detail page, it is a
  // lie — fail instead of drawing an empty basket for an order that has contents.
  // For a split parent the lines hang off the children, so ask for all of them at
  // once and tag each with the part it belongs to.
  const itemOwnerIds = isSplitParent ? parts.map(p => p.id) : [order.id];
  const { data: items, error: itemsErr } = await supabase
    .from('order_items')
    .select('*')
    .in('order_id', itemOwnerIds);

  if (itemsErr) {
    console.error('GET /orders/:id items lookup failed:', itemsErr.message);
    return res.status(500).json({ error: 'Could not load the order. Please try again.' });
  }

  // Hand each part its own lines, so a client can render the breakdown without
  // re-grouping by seller and without a second round trip per part.
  if (isSplitParent) {
    for (const part of parts) {
      part.items = (items || []).filter(i => i.order_id === part.id);
    }
  }

  // The other direction: a child opened on its own (an agent scanning a parcel code)
  // should be able to say which customer order it belongs to.
  if (order.parent_order_id) {
    const { data: parent, error: parentErr } = await supabase
      .from('orders')
      .select('id, code, total, status')
      .eq('id', order.parent_order_id)
      .maybeSingle();

    if (parentErr) {
      console.error('GET /orders/:id parent lookup failed:', parentErr.message);
      return res.status(500).json({ error: 'Could not load the order. Please try again.' });
    }
    order.parent_code = parent ? parent.code : null;
  }

  // Fetch status timeline
  const { data: history, error: historyErr } = await supabase
    .from('order_history')
    .select('label, note, ts')
    .eq('order_id', order.id)
    .order('ts', { ascending: true });

  if (historyErr) {
    console.error('GET /orders/:id history lookup failed:', historyErr.message);
    return res.status(500).json({ error: 'Could not load the order. Please try again.' });
  }

  // Existing return, if any. Derived from the returns table rather than stored
  // on the order: there is no orders.return_id column, and a denormalised copy
  // would be one more thing to keep in sync. Clients use this to hide the
  // "Request Return" button once a return has been raised.
  // limit(1), not maybeSingle: an order that somehow carries two returns would make
  // maybeSingle raise PGRST116, and unread that surfaced as "no return exists" —
  // re-showing the "Request Return" button on an order that already had one.
  const { data: returns, error: retErr } = await supabase
    .from('returns')
    .select('id, code, decision, collected')
    .eq('order_id', order.id)
    .limit(1);

  if (retErr) {
    console.error('GET /orders/:id return lookup failed:', retErr.message);
    return res.status(500).json({ error: 'Could not load the order. Please try again.' });
  }

  const ret = returns && returns.length ? returns[0] : null;

  order.return_id     = ret ? ret.id : null;
  order.return_code   = ret ? ret.code : null;
  order.return_status = ret ? (ret.decision || 'pending') : null;

  // QR token — signed with order code so the scan endpoint can trust it
  const qr_token = jwt.sign(
    { order_code: order.code },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );

  // Scannable QR (SVG) encoding the order code — agents scan it to advance the order.
  let qr_svg = null;
  try {
    qr_svg = await QRCode.toString(order.code, {
      type: 'svg', margin: 1, width: 168,
      color: { dark: '#0d1f16', light: '#ffffff' },
    });
  } catch (e) {
    console.error('QR generation failed:', e.message);
  }

  // `parts` only appears on a split order, so a client that predates splitting sees
  // the response shape it has always seen.
  res.json({ order, items, history, qr_token, qr_svg, ...(isSplitParent ? { parts } : {}) });
});

// ── GET /orders/:id/invoice.pdf  (consumer owner or staff) ────────────────────
// A downloadable PDF invoice for the whole customer order. For a split order the
// invoice covers the PARENT (the thing the customer paid for), with each seller's
// lines grouped under that seller. Money is read straight from the row in paise —
// this response bypasses the res.json money conversion, so invoice.js divides.
router.get('/:id/invoice.pdf', async (req, res) => {
  const identifier = req.params.id;
  const isCode = identifier.startsWith('ORD');

  let q = supabase.from('orders').select('*');
  q = isCode ? q.eq('code', identifier) : q.eq('id', identifier);
  const { data: order, error } = await q.maybeSingle();

  if (error) {
    console.error('GET invoice order lookup failed:', error.message);
    return res.status(500).json({ error: 'Could not generate the invoice. Please try again.' });
  }
  if (!order) return res.status(404).json({ error: 'Order not found.' });

  // Consumers may only invoice their own orders; staff/admin may invoice any.
  if (req.user.role === 'consumer' && order.consumer_id !== req.user.id) {
    return res.status(403).json({ error: 'You can only view your own orders.' });
  }

  // Phone + a registered-address fallback, exactly as GET /:id does, so the invoice
  // always carries a deliverable address even for orders placed before addresses
  // were captured on the order itself.
  if (order.consumer_id) {
    const { data: consumer, error: consumerErr } = await supabase
      .from('users')
      .select('phone, country_code, house_no, street1, street2, landmark, village_town, city, district, pincode, state')
      .eq('id', order.consumer_id)
      .maybeSingle();
    if (consumerErr) {
      console.error('GET invoice consumer lookup failed:', consumerErr.message);
      return res.status(500).json({ error: 'Could not generate the invoice. Please try again.' });
    }
    if (consumer) {
      order.consumer_phone = `${consumer.country_code || '+91'} ${consumer.phone}`;
      if (!order.delivery_address) {
        order.delivery_address = {
          house_no: consumer.house_no, street1: consumer.street1, street2: consumer.street2,
          landmark: consumer.landmark, village_town: consumer.village_town, city: consumer.city,
          district: consumer.district, pincode: consumer.pincode, state: consumer.state,
        };
      }
    }
  }

  // Build the line groups. A split parent's lines live on its children, one group
  // per seller; a plain order is a single unlabelled group.
  let sellerGroups = [];
  if (order.route === SPLIT_ROUTE) {
    const { data: children, error: childErr } = await supabase
      .from('orders')
      .select('id, seller_name, split_seq')
      .eq('parent_order_id', order.id)
      .order('split_seq', { ascending: true });
    if (childErr) {
      console.error('GET invoice parts lookup failed:', childErr.message);
      return res.status(500).json({ error: 'Could not generate the invoice. Please try again.' });
    }
    const kids = children || [];
    const { data: items, error: itemsErr } = await supabase
      .from('order_items')
      .select('name, qty, unit, price, order_id')
      .in('order_id', kids.map((c) => c.id));
    if (itemsErr) {
      console.error('GET invoice items lookup failed:', itemsErr.message);
      return res.status(500).json({ error: 'Could not generate the invoice. Please try again.' });
    }
    sellerGroups = kids.map((c) => ({
      seller_name: c.seller_name,
      items: (items || []).filter((i) => i.order_id === c.id),
    }));
  } else {
    const { data: items, error: itemsErr } = await supabase
      .from('order_items')
      .select('name, qty, unit, price')
      .eq('order_id', order.id);
    if (itemsErr) {
      console.error('GET invoice items lookup failed:', itemsErr.message);
      return res.status(500).json({ error: 'Could not generate the invoice. Please try again.' });
    }
    sellerGroups = [{ seller_name: order.seller_name || null, items: items || [] }];
  }

  // Everything is loaded — from here we stream, so a later error would arrive after
  // the PDF headers. streamInvoice only formats in-memory data, so that is safe.
  try {
    streamInvoice(res, order, sellerGroups);
  } catch (e) {
    console.error('GET invoice PDF generation failed:', e.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Could not generate the invoice. Please try again.' });
    } else {
      res.end();
    }
  }
});

// ── GET /orders/:id/invoice  (consumer owner or staff) ────────────────────────
// The full HTML invoice for a customer order: one A4 page per seller plus a
// Marutham AgroLink platform-services page for the delivery / handling / fee
// charges (with GST). Money is read raw in paise and divided to rupees here.
router.get('/:id/invoice', async (req, res) => {
  const identifier = req.params.id;
  const isCode = identifier.startsWith('ORD');

  let q = supabase.from('orders').select('*');
  q = isCode ? q.eq('code', identifier) : q.eq('id', identifier);
  const { data: order, error } = await q.maybeSingle();
  if (error) {
    console.error('GET invoice(html) order lookup failed:', error.message);
    return res.status(500).json({ error: 'Could not generate the invoice. Please try again.' });
  }
  if (!order) return res.status(404).json({ error: 'Order not found.' });
  if (req.user.role === 'consumer' && order.consumer_id !== req.user.id) {
    return res.status(403).json({ error: 'You can only view your own orders.' });
  }

  const paise = (v) => Number(v || 0) / 100;
  const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata',
  }) : '');
  const fmtDateTime = (iso) => (iso ? new Date(iso).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    timeZone: 'Asia/Kolkata',
  }) : '');

  try {
    // ── Consumer (login id + phone + address, with a registered-address fallback) ─
    let consumer = { name: order.consumer_name || '—', login: null, phone: null, address: {} };
    if (order.consumer_id) {
      const { data: cu, error: cErr } = await supabase
        .from('users')
        .select('login_id, phone, country_code, house_no, street1, street2, landmark, village_town, city, district, pincode, state')
        .eq('id', order.consumer_id)
        .maybeSingle();
      if (cErr) throw cErr;
      if (cu) {
        consumer.login = cu.login_id;
        consumer.phone = `${cu.country_code || '+91'} ${cu.phone}`;
        const da = order.delivery_address || {};
        const src = order.delivery_address ? da : cu;
        consumer.address = {
          house: src.house_no,
          street: [src.street1, src.street2].filter(Boolean).join(', '),
          landmark: src.landmark,
          city: src.city || src.village_town,
          district: src.district,
          state: src.state,
          pincode: src.pincode,
        };
      }
    }

    // ── Seller groups: a split parent → one group per child; else one group ──────
    let groups = [];
    if (order.route === SPLIT_ROUTE) {
      const { data: children, error: kErr } = await supabase
        .from('orders')
        .select('id, seller_id, seller_name, split_seq, village, district')
        .eq('parent_order_id', order.id)
        .order('split_seq', { ascending: true });
      if (kErr) throw kErr;
      const kids = children || [];
      const { data: items, error: iErr } = await supabase
        .from('order_items')
        .select('name, qty, unit, price, base_farmer_price, farmer_id, order_id')
        .in('order_id', kids.map((c) => c.id));
      if (iErr) throw iErr;
      groups = kids.map((c) => ({
        seller_id: c.seller_id,
        seller_name: c.seller_name,
        village: c.village, district: c.district,
        items: (items || []).filter((it) => it.order_id === c.id),
      }));
    } else {
      const { data: items, error: iErr } = await supabase
        .from('order_items')
        .select('name, qty, unit, price, base_farmer_price, farmer_id')
        .eq('order_id', order.id);
      if (iErr) throw iErr;
      groups = [{
        seller_id: (items && items[0] && items[0].farmer_id) || null,
        seller_name: order.seller_name,
        village: order.village, district: order.district,
        items: items || [],
      }];
    }

    // ── Seller user rows (login id, business name, GST, address) ─────────────────
    const sellerIds = [...new Set(groups.map((g) => g.seller_id).filter(Boolean))];
    let sellerUsers = {};
    if (sellerIds.length) {
      const { data: su, error: sErr } = await supabase
        .from('users')
        .select('id, login_id, business_name, seller_type, gst_number, fname, lname, village_town, city, district, state, pincode')
        .in('id', sellerIds);
      if (sErr) throw sErr;
      (su || []).forEach((u) => { sellerUsers[u.id] = u; });
    }

    const sellerParties = groups.map((g) => {
      const u = g.seller_id ? sellerUsers[g.seller_id] : null;
      const name = (u && (u.business_name || [u.fname, u.lname].filter(Boolean).join(' '))) || g.seller_name || 'Seller';
      // The same fee formula used at checkout, so the reconstructed list price
      // matches what the customer saw when browsing (round(farmer × (1 + fee%))).
      const feePct = getFeeForSeller(u && u.seller_type);
      return {
        isPlatform: false,
        type: (u && u.seller_type) || 'Farmer',
        name,
        login: u ? u.login_id : null,
        gstin: (u && u.gst_number) || null,
        fssai: null, // not captured on the seller record yet
        pan: null,
        address: {
          village: (u && u.village_town) || g.village,
          district: (u && u.district) || g.district,
          state: (u && u.state) || 'Tamil Nadu',
          pincode: u && u.pincode,
        },
        roundOff: 0,
        lines: (g.items || []).map((it) => {
          const qty = Number(it.qty);
          // If a bulk (quantity) discount reduced the price, reconstruct the
          // pre-discount list price so the invoice shows Rate = list and the
          // saving on the Discount column. Line total (qty×rate − discount) is
          // unchanged, so the invoice total still equals what was charged.
          const listUnit = it.base_farmer_price
            ? Math.round(Number(it.base_farmer_price) * (1 + feePct / 100))
            : Number(it.price);
          const perUnitDisc = Math.max(0, listUnit - Number(it.price));
          return {
            name: it.name,
            unit: it.unit,
            qty,
            rate: paise(perUnitDisc > 0 ? listUnit : it.price), // consumer price; no HSN yet ⇒ exempt
            discount: paise(perUnitDisc * qty),
          };
        }),
      };
    });

    // ── Platform-services party: delivery / handling / multi-seller fee + GST ─────
    const handling = paise(order.handling);
    const delivery = paise(order.delivery);
    const residual = paise(Number(order.total) - Number(order.item_total) - Number(order.handling) - Number(order.delivery));
    const marketFee = residual > 0.005 ? Math.round(residual * 100) / 100 : 0;
    const gstRate = platformConfig.serviceGst;
    const charge = (name, variant, sac, rate) => ({
      name, variant, sac, unit: 'order', qty: 1, rate, discount: 0, gstRate, inclusive: true,
    });
    const platformLines = [];
    if (handling > 0) platformLines.push(charge('Order handling charges', 'Per order', '999799', handling));
    if (marketFee > 0) platformLines.push(charge('Multiple-seller convenience fee', 'Multi-vendor order', '999799', marketFee));
    if (delivery > 0) platformLines.push(charge('Delivery charges', 'Logistics service', '996812', delivery));

    const parties = [...sellerParties];
    if (platformLines.length) {
      parties.push({
        isPlatform: true,
        type: 'Platform',
        name: platformConfig.name,
        login: invoiceModel.platformLogin(platformConfig),
        gstin: platformConfig.gstin,
        fssai: platformConfig.fssai,
        pan: null,
        address: platformConfig.address,
        roundOff: 0,
        lines: platformLines,
      });
    }

    const ymd = invoiceModel.ymdIST(order.created_at);
    const seq = invoiceModel.seqFromCode(order.code);
    const platformRef = invoiceModel.platformInvoiceRef(platformConfig, ymd, seq);

    const payStatus = order.cancelled ? 'CANCELLED'
      : String(order.pay_status).toLowerCase() === 'paid' ? 'PAID'
        : String(order.pay_status).toLowerCase() === 'refunded' ? 'REFUNDED' : 'UNPAID';

    let qrDataUri = null;
    try {
      qrDataUri = await QRCode.toDataURL(`Marutham Invoice ${platformRef} | Order ${order.code}`, {
        margin: 0, width: 144, color: { dark: '#16211b', light: '#ffffff' },
      });
    } catch (_) { /* QR is optional — fall back to the placeholder */ }

    const ctx = {
      platform: platformConfig,
      consumer,
      order: {
        code: order.code,
        date: fmtDateTime(order.created_at),
        invoiceDate: fmtDate(order.created_at),
        payMethod: order.pay_method || '—',
        payStatus,
        payStatusLabel: order.pay_status || '—',
        agent: order.agent_name || '—',
        deliveredOn: order.delivered_at ? fmtDateTime(order.delivered_at) : '—',
        deliveryWaived: delivery === 0,
      },
      parties,
      ymd,
      seq,
      platformRef,
      qrDataUri,
    };

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(renderInvoiceHtml(ctx));
  } catch (e) {
    console.error('GET invoice(html) generation failed:', e.message);
    return res.status(500).json({ error: 'Could not generate the invoice. Please try again.' });
  }
});

// ── POST /orders/:id/cancel  (consumer or admin) ──────────────────────────────
router.post('/:id/cancel', async (req, res) => {
  const u = req.user;
  if (u.role === 'farmer') {
    return res.status(403).json({ error: 'Farmers cannot cancel orders.' });
  }
  // A staff cancellation is an Orders 'edit' (Admin, Hub Incharge, the assigned
  // agent). A consumer cancels their own order below.
  if (u.role === 'admin' && !can(u, 'orders', 'edit')) {
    return res.status(403).json({ error: 'Orders edit permission required to cancel an order.' });
  }

  const { data: order, error } = await supabase
    .from('orders')
    .select('*')
    .eq('id', req.params.id)
    .single();

  if (error || !order) return res.status(404).json({ error: 'Order not found.' });

  // Consumers may only cancel their own orders
  if (u.role === 'consumer' && order.consumer_id !== u.id) {
    return res.status(403).json({ error: 'You can only cancel your own orders.' });
  }

  if (order.cancelled) {
    return res.status(400).json({ error: 'Order is already cancelled.' });
  }

  /* Cancelling a split order.
   *
   * A parcel that is already on the road cannot be recalled, and each seller's
   * parcel moves independently — so "cancel" means different things depending on
   * what was asked for:
   *   • a CHILD  → drop that seller's parcel, leave the rest of the order running
   *                and re-price the parent around what survives.
   *   • a PARENT → cancel every part that is still cancellable, all together.
   * An unsplit order behaves exactly as it always has. */
  const isSplitParent = order.route === SPLIT_ROUTE;

  let children = [];
  if (isSplitParent) {
    const { data: kids, error: kidsErr } = await supabase
      .from('orders')
      .select('*')
      .eq('parent_order_id', order.id)
      .order('split_seq', { ascending: true });

    if (kidsErr) {
      console.error('Cancel order: could not read parts:', kidsErr.message);
      return res.status(500).json({ error: 'Could not cancel order.' });
    }
    children = kids || [];
  }

  // The rows that will actually be cancelled: the parts of a split, or the order itself.
  const targets = isSplitParent ? children.filter(c => !c.cancelled) : [order];

  if (targets.length === 0) {
    return res.status(400).json({ error: 'Order is already cancelled.' });
  }

  /* A parent can roll up to a cancellable stage while one of its parcels is already
   * out for delivery — the rollup reports the LEAST advanced part. Checking the
   * parent's own stage would therefore let a cancellation reach a parcel on the
   * road, so each target is checked on its own. */
  const uncancellable = targets.filter(t => !CANCELLABLE_STAGES.includes(t.stage));
  if (uncancellable.length > 0) {
    if (!isSplitParent) {
      return res.status(400).json({ error: 'Order cannot be cancelled once it has been picked up for delivery.' });
    }
    return res.status(400).json({
      error: `${uncancellable.length} of this order's parts have already been picked up for delivery ` +
             `and cannot be cancelled (${uncancellable.map(t => t.code).join(', ')}). ` +
             `Cancel the remaining parts individually.`,
    });
  }

  const { cancel_reason } = req.body;
  const now = new Date().toISOString();

  const cancelUpdates = {
    cancelled:     true,
    cancel_reason: cancel_reason || null,
    cancelled_at:  now,
    status:        'Cancelled',
    updated_at:    now,
  };

  // Cancel the parts, or the single order. A split parent is closed alongside its
  // parts — the customer's row has to read Cancelled too.
  const targetIds = targets.map(t => t.id);
  const { error: updateErr } = await supabase
    .from('orders')
    .update(cancelUpdates)
    .in('id', isSplitParent ? [...targetIds, order.id] : targetIds);

  if (updateErr) {
    console.error('Cancel order error:', updateErr);
    return res.status(500).json({ error: 'Could not cancel order.' });
  }

  // History entry. The cancellation is already committed — a failed timeline row
  // must not report the cancellation as failed. Log it and move on.
  const historyRows = targets.map(t => ({
    order_id: t.id,
    label:    'Cancelled',
    note:     cancel_reason || 'Cancelled by ' + (u.role === 'consumer' ? 'consumer' : `admin (${u.admin_role})`),
  }));
  if (isSplitParent) {
    historyRows.push({
      order_id: order.id,
      label:    'Cancelled',
      note:     cancel_reason || 'Cancelled by ' + (u.role === 'consumer' ? 'consumer' : `admin (${u.admin_role})`),
    });
  }

  const { error: historyErr } = await supabase.from('order_history').insert(historyRows);
  if (historyErr) console.error(`Order ${order.id}: cancellation history entry failed:`, historyErr.message);

  // ── Restore farmer listing quantities ─────────────────────────────────────
  // The mirror of the decrement on placement, and it failed the same silent way:
  // an unread error left `orderItems` null, `for (… of orderItems || [])` iterated
  // nothing, and the farmer never got their stock back. The order showed as
  // cancelled and the inventory was simply gone.
  const restoreFailures = [];

  // Read the lines off the rows actually being cancelled. On a split order the
  // items hang off the CHILDREN, so asking the parent for them would return nothing
  // and quietly restock no one — a cancelled multi-vendor order would take every
  // seller's stock with it.
  const { data: orderItems, error: orderItemsErr } = await supabase
    .from('order_items')
    .select('farmer_id, product_id, qty')
    .in('order_id', targetIds);

  if (orderItemsErr) {
    restoreFailures.push(`could not read order items: ${orderItemsErr.message}`);
  }

  for (const item of orderItems || []) {
    const { data: listing, error: readErr } = await supabase
      .from('farmer_listings')
      .select('qty_available, listed')
      .eq('farmer_id', item.farmer_id)
      .eq('product_id', item.product_id)
      .maybeSingle();

    if (readErr || !listing) {
      restoreFailures.push(`${item.product_id}/${item.farmer_id} (read: ${readErr ? readErr.message : 'no listing'})`);
      continue;
    }

    // Re-stock, and undo the auto-unlist — but ONLY that. Placement sets
    // `listed = false` when stock hits zero, and nothing ever set it back, so
    // cancelling an order that took a farmer's last unit returned the quantity and
    // left the listing hidden: stock on the books, invisible in the shop, until the
    // farmer noticed and toggled it by hand.
    //
    // Gated on qty_available === 0 because that is the ONLY state the auto-unlist
    // produces. A listing the farmer unlisted deliberately still has stock, and
    // re-listing it here would override a decision they made on purpose.
    const restock = { qty_available: listing.qty_available + item.qty };
    if (listing.qty_available === 0 && !listing.listed) restock.listed = true;

    const { error: writeErr } = await supabase
      .from('farmer_listings')
      .update(restock)
      .eq('farmer_id', item.farmer_id)
      .eq('product_id', item.product_id);

    if (writeErr) {
      restoreFailures.push(`${item.product_id}/${item.farmer_id} (write: ${writeErr.message})`);
    }
  }

  if (restoreFailures.length) {
    console.error(`STOCK NOT RESTORED — order ${order.id} is cancelled but ${restoreFailures.length} ` +
                  `listing(s) did not get their quantity back: ${restoreFailures.join('; ')}`);
  }

  /* ── Re-price the order and settle the refund ───────────────────────────────
   *
   * Cancelling ONE seller's parcel leaves the rest of the order running, so the
   * parent has to be re-priced around what survives: its item total drops by that
   * seller's lines, the ₹10 multi-vendor fee goes if only one seller is left, and
   * the delivery/handling charges move onto a parcel that is still coming.
   *
   * The refund is the DROP in what the order costs — not the cancelled part's own
   * total, which may include the delivery fee the customer still owes on the
   * parcels still on their way. Refunding that figure would hand back a charge that
   * is about to be re-applied to a sibling. */
  let refund_amt = null;
  let refund_to = null;

  if (order.parent_order_id) {
    const { data: parentBefore, error: beforeErr } = await supabase
      .from('orders')
      .select('total, pay_status, pay_method, refund_amt')
      .eq('id', order.parent_order_id)
      .maybeSingle();

    if (beforeErr) console.error('Cancel order: parent re-price read failed:', beforeErr.message);

    await rollupToParent(order.parent_order_id);

    const { data: parentAfter, error: afterErr } = await supabase
      .from('orders')
      .select('total')
      .eq('id', order.parent_order_id)
      .maybeSingle();

    if (afterErr) console.error('Cancel order: parent re-price read failed:', afterErr.message);

    if (parentBefore && parentAfter && parentBefore.pay_status === 'paid') {
      const drop = Math.max(0, parentBefore.total - parentAfter.total);
      if (drop > 0) {
        refund_amt = drop;
        refund_to = parentBefore.pay_method;
        // Accumulated, not overwritten: cancelling a second part later owes the
        // customer that refund ON TOP of the first one.
        const { error: refundErr } = await supabase
          .from('orders')
          .update({ refund_amt: (parentBefore.refund_amt || 0) + drop, refund_to })
          .eq('id', order.parent_order_id);
        if (refundErr) console.error('Cancel order: refund stamp failed:', refundErr.message);
      }
    }
  } else if (order.pay_status === 'paid') {
    // A whole order going: the customer gets all of it back.
    refund_amt = order.total;
    refund_to = order.pay_method;
    const { error: refundErr } = await supabase
      .from('orders')
      .update({ refund_amt, refund_to })
      .eq('id', order.id);
    if (refundErr) console.error('Cancel order: refund stamp failed:', refundErr.message);
  }

  // Re-read so the caller sees the row as it now stands (status, refund, and — for
  // a part cancellation — nothing on the order itself but its own closure).
  const { data: updated, error: reReadErr } = await supabase
    .from('orders')
    .select('*')
    .eq('id', order.id)
    .maybeSingle();

  if (reReadErr) console.error('Cancel order: re-read failed:', reReadErr.message);

  res.json({
    message: order.parent_order_id
      ? `${order.seller_name}'s items have been cancelled. The rest of your order is still on its way.`
      : 'Order cancelled.',
    order: updated || { ...order, ...cancelUpdates },
    ...(refund_amt ? { refund: { amount_paise: refund_amt, to: refund_to } } : {}),
  });
});

module.exports = router;
