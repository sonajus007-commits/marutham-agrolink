// ── Collection-party notifications ────────────────────────────────────────────
// When the seller ACCEPTS and then PACKS an order, the two parties who will move it
// off the farm are told, so collection is planned instead of discovered:
//   • the VCO(s) whose service area covers the seller's village, and
//   • the Hub Incharge(s) of the hub the seller's parcel enters through.
//
// Resolution:
//   VCO          — role admin / admin_role VCO / active, in the order's district:
//                  those whose service area covers the seller's village; else the
//                  ones within dispatch.vcoAlertRadiusKm of the farm pin; else the
//                  whole district, so an order is never left unseen (villageVcos).
//   Hub Incharge — role admin / admin_role Hub Incharge / active, hub_id = the order's
//                  pickup_hub_id (the seller's taluk hub, stamped at placement).
//
// Best-effort: every read checks its error and logs; a notification miss must never
// fail the accept/pack that triggered it.

const supabase = require('../db/supabase');
const { notify, notifyMany } = require('./notifications');
const { coversLocation } = require('./agentCoverage');
const { distanceMeters, toCoord } = require('./geo');
const platform = require('../config/platform');

// The seller's farm pin (first line's seller — a parcel has one seller). Null when
// unpinned or on a failed read; proximity then simply has nothing to measure.
async function farmPin(order) {
  const { data: line, error: le } = await supabase
    .from('order_items').select('farmer_id').eq('order_id', order.id).limit(1).maybeSingle();
  if (le) {
    console.error('collectionNotify: seller lookup failed:', le.message);
    return null;
  }
  if (!line?.farmer_id) return null;
  const { data: seller, error: se } = await supabase
    .from('users').select('farm_lat, farm_lng').eq('id', line.farmer_id).maybeSingle();
  if (se) {
    console.error('collectionNotify: farm pin lookup failed:', se.message);
    return null;
  }
  const lat = toCoord(seller?.farm_lat);
  const lng = toCoord(seller?.farm_lng);
  return lat === null || lng === null ? null : { lat, lng };
}

/**
 * Which VCO(s) to alert, and how far each is from the farm (km, or null):
 *   1. VCOs whose service area covers the seller's village;
 *   2. else the VCOs within dispatch.vcoAlertRadiusKm of the farm pin (by their
 *      last known position — the live beacon, else today's check-in fix);
 *   3. else every active VCO in the district, so an order is never left unseen.
 * Returns [{ id, km }].
 */
async function villageVcos(order) {
  if (!order.district) return [];
  const { data, error } = await supabase
    .from('users')
    .select('id, service_areas, service_villages, agent_lat, agent_lng')
    .eq('role', 'admin')
    .eq('admin_role', 'VCO')
    .eq('status', 'active')
    .ilike('district', order.district);
  if (error) {
    console.error('collectionNotify: VCO lookup failed:', error.message);
    return [];
  }
  const vcos = data || [];
  const pin = vcos.length ? await farmPin(order) : null;

  // Last known position: the beacon on users, else today's attendance check-in.
  const pos = new Map();
  vcos.forEach((v) => {
    const lat = toCoord(v.agent_lat);
    const lng = toCoord(v.agent_lng);
    if (lat !== null && lng !== null) pos.set(v.id, { lat, lng });
  });
  const missing = vcos.filter((v) => !pos.has(v.id)).map((v) => v.id);
  if (pin && missing.length) {
    const today = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
    const { data: att, error: ae } = await supabase
      .from('staff_attendance')
      .select('user_id, check_in_lat, check_in_lng')
      .in('user_id', missing)
      .eq('work_date', today);
    if (ae) console.error('collectionNotify: attendance lookup failed:', ae.message);
    (att || []).forEach((a) => {
      const lat = toCoord(a.check_in_lat);
      const lng = toCoord(a.check_in_lng);
      if (lat !== null && lng !== null) pos.set(a.user_id, { lat, lng });
    });
  }
  const kmOf = (id) => {
    const p = pos.get(id);
    const m = pin && p ? distanceMeters(pin.lat, pin.lng, p.lat, p.lng) : null;
    return m === null ? null : Math.round(m / 100) / 10;
  };

  const covering = vcos.filter((v) => {
    const configured =
      (Array.isArray(v.service_areas) && v.service_areas.length > 0) ||
      (Array.isArray(v.service_villages) && v.service_villages.length > 0);
    return configured && coversLocation(v, order.village, order.taluk).cv;
  });
  if (covering.length) return covering.map((v) => ({ id: v.id, km: kmOf(v.id) }));

  const radius = platform.dispatch.vcoAlertRadiusKm;
  const near = vcos
    .map((v) => ({ id: v.id, km: kmOf(v.id) }))
    .filter((v) => v.km !== null && v.km <= radius);
  if (near.length) return near;

  return vcos.map((v) => ({ id: v.id, km: kmOf(v.id) }));
}

async function hubInchargeIds(order) {
  if (!order.pickup_hub_id) return [];
  const { data, error } = await supabase
    .from('users')
    .select('id')
    .eq('role', 'admin')
    .eq('admin_role', 'Hub Incharge')
    .eq('status', 'active')
    .eq('hub_id', order.pickup_hub_id);
  if (error) {
    console.error('collectionNotify: Hub Incharge lookup failed:', error.message);
    return [];
  }
  return (data || []).map((u) => u.id);
}

// "Tomatoes 5 kg, Onion 2 kg" (+N more) — what the VCO is about to weigh.
async function itemSummary(order) {
  const { data, error } = await supabase
    .from('order_items').select('name, qty, unit').eq('order_id', order.id);
  if (error) {
    console.error('collectionNotify: item lookup failed:', error.message);
    return '';
  }
  const lines = (data || []).map((i) => `${i.name} ${i.qty}${i.unit ? ' ' + i.unit : ''}`);
  return lines.length > 3 ? `${lines.slice(0, 3).join(', ')} +${lines.length - 3} more` : lines.join(', ');
}

const COPY = {
  accepted: {
    vco: (o, d) => ({
      type: 'collection_incoming',
      title: 'Collection coming up',
      body: `${o.seller_name || 'A seller'} accepted order ${o.code} in ${o.village || 'their village'}${d.km != null ? ` (~${d.km} km from you)` : ''}${d.items ? ` — ${d.items}` : ''}. Prepare to collect once it is packed.`,
    }),
    hub: (o) => ({
      type: 'inbound_order',
      title: 'Order inbound to your hub',
      body: `${o.seller_name || 'A seller'} accepted order ${o.code} — heading to your hub after collection.`,
    }),
  },
  packed: {
    vco: (o, d) => ({
      type: 'collection_ready',
      title: 'Ready for verification',
      body: `Order ${o.code} from ${o.seller_name || 'the seller'} in ${o.village || 'the village'}${d.km != null ? ` (~${d.km} km from you)` : ''} is packed and ready to verify${d.items ? `: ${d.items}` : ''}.`,
    }),
    hub: (o) => ({
      type: 'inbound_order',
      title: 'Packed order inbound',
      body: `Order ${o.code} is packed in ${o.village || 'the village'} — inbound to your hub.`,
    }),
  },
};

/**
 * Notify the village VCO(s) and the seller's Hub Incharge(s) about an order the
 * seller just accepted or packed. Never throws — logs and returns counts.
 * @param {object} order  the order row (needs code, village, district, taluk?, seller_name, pickup_hub_id)
 * @param {'accepted'|'packed'} event
 */
async function notifyCollectionParties(order, event) {
  const copy = COPY[event];
  if (!order || !copy) return { vco: 0, hub: 0 };
  try {
    const [vcos, hubIds, items] = await Promise.all([villageVcos(order), hubInchargeIds(order), itemSummary(order)]);
    // Each VCO's message carries THEIR distance, so one notify per VCO; the copy is
    // otherwise identical. A handful of VCOs per district — not a fan-out concern.
    for (const v of vcos) {
      await notify(v.id, { ...copy.vco(order, { km: v.km, items }), data: { order_id: order.id, code: order.code } });
    }
    if (hubIds.length) await notifyMany(hubIds, { ...copy.hub(order), data: { order_id: order.id, code: order.code } });
    return { vco: vcos.length, hub: hubIds.length };
  } catch (err) {
    console.error('collectionNotify: unexpected error:', err.message);
    return { vco: 0, hub: 0 };
  }
}

module.exports = { notifyCollectionParties };
