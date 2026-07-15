import { useTranslation } from 'react-i18next';
import { StatTile } from '@marutham/ui';
import { colors } from '@marutham/tokens';
import { fmtMoneyInt, fmtNum } from '@marutham/lib';
import type { FieldDashboardResponse } from '@marutham/api-client';
import { PlaceholderSection } from '../../components/PlaceholderSection';

/* Field dashboard — tile-based, no charts (keeps the mobile field app light, as
 * the legacy field.js intended). VCO and Delivery Agent layouts.
 *
 * MONEY: `cod_amount`, `digital_amount` and `farmer_payments_amount` come back
 * ALREADY IN RUPEES from GET /dashboard/field. fmtMoneyInt, not a /100. */

function TileGrid({ children }: { children: React.ReactNode }) {
  return <div className="fd-grid">{children}</div>;
}

export function FieldDashboard({
  data,
  onRefresh,
}: {
  data: FieldDashboardResponse | null;
  onRefresh: () => void;
}) {
  const { t } = useTranslation();
  if (!data) return null;
  const s = data.stats || {};
  const isVCO = data.role === 'VCO';
  const time = new Date(data.generated_at).toLocaleTimeString('en-IN');
  const pending = Number(s.farmers_pending || 0);

  return (
    <div className="fd-card">
      <div className="fd-head">
        <div>
          <h3>
            {isVCO
              ? `🌾 ${t('agent.field.vco.title', { village: data.scope?.name ?? '' })}`
              : `🛵 ${t('agent.field.agent.title')}`}
          </h3>
          <div className="fd-sub">
            {isVCO ? t('agent.field.vco.sub', { time }) : t('agent.field.agent.sub', { time })}
          </div>
        </div>
        <button className="fd-refresh" onClick={onRefresh} aria-label={t('agent.field.refresh')}>
          ↻
        </button>
      </div>

      {isVCO ? (
        <TileGrid>
          <StatTile
            icon="🧺"
            label={t('agent.field.vco.collectionsToday')}
            value={fmtNum(s.collections_today)}
            accent={colors.forest}
          />
          <StatTile
            icon="🚶"
            label={t('agent.field.vco.farmersToVisit')}
            value={fmtNum(s.farmers_to_visit)}
            accent={colors.gold}
          />
          <StatTile
            icon="✅"
            label={t('agent.field.vco.productsCollected')}
            value={fmtNum(s.products_collected)}
            accent={colors.green}
          />
          <StatTile
            icon="⏳"
            label={t('agent.field.vco.pendingCollection')}
            value={fmtNum(s.pending_collection)}
            accent={colors.gold}
          />
          <StatTile
            icon="❌"
            label={t('agent.field.vco.rejectedProduce')}
            value={fmtNum(s.rejected_produce)}
            accent={colors.red}
          />
          <StatTile
            icon="↩️"
            label={t('agent.field.vco.returnsPending')}
            value={fmtNum(s.returns_pending)}
            accent={colors.bloom}
          />
          <StatTile
            icon="💸"
            label={t('agent.field.vco.farmerPayments')}
            value={fmtNum(s.farmer_payments)}
            accent={colors.red}
            hint={fmtMoneyInt(s.farmer_payments_amount)}
          />
          <StatTile
            icon="🧑‍🌾"
            label={t('agent.field.vco.farmers')}
            value={fmtNum(s.farmers_registered)}
            accent={colors.forest}
            hint={pending ? t('agent.field.vco.farmersPending', { count: pending }) : null}
          />
        </TileGrid>
      ) : (
        <TileGrid>
          <StatTile
            icon="📦"
            label={t('agent.field.agent.deliveriesToday')}
            value={fmtNum(s.deliveries_today)}
            accent={colors.forest}
          />
          <StatTile
            icon="✅"
            label={t('agent.field.agent.completed')}
            value={fmtNum(s.completed_today)}
            accent={colors.green}
            hint={t('agent.field.agent.completedHint')}
          />
          <StatTile
            icon="⏳"
            label={t('agent.field.agent.pending')}
            value={fmtNum(s.pending)}
            accent={colors.gold}
          />
          <StatTile
            icon="❌"
            label={t('agent.field.agent.failed')}
            value={fmtNum(s.failed)}
            accent={colors.red}
          />
          <StatTile
            icon="💵"
            label={t('agent.field.agent.cod')}
            value={fmtMoneyInt(s.cod_amount)}
            accent={colors.forest}
          />
          <StatTile
            icon="💳"
            label={t('agent.field.agent.digital')}
            value={fmtMoneyInt(s.digital_amount)}
            accent={colors.leaf}
          />
          <StatTile
            icon="⭐"
            label={t('agent.field.agent.rating')}
            // No rated deliveries yet is not a 0-star rating — it is no rating.
            value={s.customer_rating != null ? String(s.customer_rating) : '—'}
            accent={colors.gold}
          />
        </TileGrid>
      )}

      {/* The metrics this screen's audience asked for that nothing feeds yet — GPS
          route, daily earnings, fuel allowance. The backend has been sending them
          in `placeholders` all along and this screen dropped them on the floor,
          which is exactly the API-vs-UI drift the shared PlaceholderSection exists
          to prevent. The array is the source of truth; we only dress it. */}
      <PlaceholderSection
        placeholders={data.placeholders}
        title={t('agent.field.ph.title')}
        subtitle={t('agent.field.ph.sub')}
      />
    </div>
  );
}
