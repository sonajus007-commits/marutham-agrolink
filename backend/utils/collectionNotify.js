// ── Collection-party notifications ────────────────────────────────────────────
// When the seller ACCEPTS and then PACKS an order, the two parties who will move it
// off the farm are told, so collection is planned instead of discovered:
//   • the VCO(s) whose service area covers the seller's village, and
//   • the Hub Incharge(s) of the hub the seller's parcel enters through.
//
// Resolution:
//   VCO          — role admin / admin_role VCO / active, in the order's district,
//                  whose service_areas or service_villages include the seller's
//                  village (utils/agentCoverage.coversLocation). A VCO with NO
//                  coverage configured is treated as covering the whole district, so
//                  an unconfigured account is still reached rather than silently missed.
//   Hub Incharge — role admin / admin_role Hub Incharge / active, hub_id = the order's
//                  pickup_hub_id (the seller's taluk hub, stamped at placement).
//
// Best-effort: every read checks its error and logs; a notification miss must never
// fail the accept/pack that triggered it.

const supabase = require('../db/supabase');
const { notifyMany } = require('./notifications');
const { coversLocation } = require('./agentCoverage');

async function villageVcoIds(order) {
  if (!order.district) return [];
  const { data, error } = await supabase
    .from('users')
    .select('id, service_areas, service_villages')
    .eq('role', 'admin')
    .eq('admin_role', 'VCO')
    .eq('status', 'active')
    .ilike('district', order.district);
  if (error) {
    console.error('collectionNotify: VCO lookup failed:', error.message);
    return [];
  }
  return (data || [])
    .filter((v) => {
      const configured =
        (Array.isArray(v.service_areas) && v.service_areas.length > 0) ||
        (Array.isArray(v.service_villages) && v.service_villages.length > 0);
      if (!configured) return true; // no coverage set → whole-district fallback
      return coversLocation(v, order.village, order.taluk).cv;
    })
    .map((v) => v.id);
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

const COPY = {
  accepted: {
    vco: (o) => ({
      type: 'collection_incoming',
      title: 'Collection coming up',
      body: `${o.seller_name || 'A seller'} accepted order ${o.code} in ${o.village || 'their village'}. Prepare to collect once it is packed.`,
    }),
    hub: (o) => ({
      type: 'inbound_order',
      title: 'Order inbound to your hub',
      body: `${o.seller_name || 'A seller'} accepted order ${o.code} — heading to your hub after collection.`,
    }),
  },
  packed: {
    vco: (o) => ({
      type: 'collection_ready',
      title: 'Ready to collect',
      body: `Order ${o.code} is packed in ${o.village || 'the village'} and ready for VCO collection.`,
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
    const [vcoIds, hubIds] = await Promise.all([villageVcoIds(order), hubInchargeIds(order)]);
    if (vcoIds.length) await notifyMany(vcoIds, { ...copy.vco(order), data: { order_id: order.id, code: order.code } });
    if (hubIds.length) await notifyMany(hubIds, { ...copy.hub(order), data: { order_id: order.id, code: order.code } });
    return { vco: vcoIds.length, hub: hubIds.length };
  } catch (err) {
    console.error('collectionNotify: unexpected error:', err.message);
    return { vco: 0, hub: 0 };
  }
}

module.exports = { notifyCollectionParties };
