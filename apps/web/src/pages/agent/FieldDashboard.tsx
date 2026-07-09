import { StatTile } from '@marutham/ui';
import { colors } from '@marutham/tokens';
import { fmtMoneyInt, fmtNum } from '@marutham/lib';
import type { FieldDashboardResponse } from '@marutham/api-client';

/* Field dashboard — tile-based, no charts (keeps the mobile field app light,
 * as the legacy field.js intended). VCO and Delivery Agent layouts. */

function TileGrid({ children }: { children: React.ReactNode }) {
  return <div className="fd-grid">{children}</div>;
}

export function FieldDashboard({ data, onRefresh }: { data: FieldDashboardResponse | null; onRefresh: () => void }) {
  if (!data) return null;
  const s = data.stats || {};
  const isVCO = data.role === 'VCO';
  const time = new Date(data.generated_at).toLocaleTimeString('en-IN');

  return (
    <div className="fd-card">
      <div className="fd-head">
        <div>
          <h3>{isVCO ? `🌾 My Village — ${data.scope?.name ?? ''}` : '🛵 My Delivery Run'}</h3>
          <div className="fd-sub">{isVCO ? 'Collections' : 'Today'} · live · {time}</div>
        </div>
        <button className="fd-refresh" onClick={onRefresh} aria-label="Refresh dashboard">
          ↻
        </button>
      </div>

      {isVCO ? (
        <TileGrid>
          <StatTile icon="🧺" label="Today's Collections" value={fmtNum(s.collections_today)} accent={colors.forest} />
          <StatTile icon="🚶" label="Farmers to Visit" value={fmtNum(s.farmers_to_visit)} accent={colors.gold} />
          <StatTile icon="✅" label="Products Collected" value={fmtNum(s.products_collected)} accent={colors.green} />
          <StatTile icon="⏳" label="Pending Collection" value={fmtNum(s.pending_collection)} accent={colors.gold} />
          <StatTile icon="❌" label="Rejected Produce" value={fmtNum(s.rejected_produce)} accent={colors.red} />
          <StatTile icon="↩️" label="Returns Pending" value={fmtNum(s.returns_pending)} accent={colors.bloom} />
          <StatTile
            icon="💸"
            label="Farmer Payments"
            value={fmtNum(s.farmer_payments)}
            accent={colors.red}
            hint={fmtMoneyInt(s.farmer_payments_amount)}
          />
          <StatTile
            icon="🧑‍🌾"
            label="Farmers"
            value={fmtNum(s.farmers_registered)}
            accent={colors.forest}
            hint={s.farmers_pending ? `${s.farmers_pending} pending` : null}
          />
        </TileGrid>
      ) : (
        <TileGrid>
          <StatTile icon="📦" label="Today's Deliveries" value={fmtNum(s.deliveries_today)} accent={colors.forest} />
          <StatTile icon="✅" label="Completed" value={fmtNum(s.completed_today)} accent={colors.green} hint="today" />
          <StatTile icon="⏳" label="Pending" value={fmtNum(s.pending)} accent={colors.gold} />
          <StatTile icon="❌" label="Failed" value={fmtNum(s.failed)} accent={colors.red} />
          <StatTile icon="💵" label="COD (today)" value={fmtMoneyInt(s.cod_amount)} accent={colors.forest} />
          <StatTile icon="💳" label="Digital (today)" value={fmtMoneyInt(s.digital_amount)} accent={colors.leaf} />
          <StatTile
            icon="⭐"
            label="Customer Rating"
            value={s.customer_rating != null ? String(s.customer_rating) : '—'}
            accent={colors.gold}
          />
        </TileGrid>
      )}
    </div>
  );
}
