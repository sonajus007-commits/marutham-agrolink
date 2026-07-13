import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ChartContainer } from '@marutham/ui';
import { placeholderGroups, humanizeMetricKey, type PlaceholderGroup } from '@marutham/lib';

/**
 * The "Needs integration" section every dashboard shares.
 *
 * It renders the metrics the endpoint ITSELF reports as unsourced (its
 * `placeholders` array) — grouped by theme, greyed, showing a dash. Never a zero:
 * a fabricated 0 on a management screen is worse than an admitted gap, because a
 * zero is a claim.
 *
 * The array drives this completely. Nothing here has an opinion about which
 * metrics are missing, which is the whole point — the first executive dashboard
 * hardcoded three tiles, ignored the array, and the screen quietly stopped
 * matching what the backend said it could not source.
 */
export function PlaceholderSection({
  placeholders,
  title,
  subtitle,
  loading,
}: {
  placeholders: string[] | null | undefined;
  title: string;
  subtitle?: string;
  loading?: boolean;
}) {
  const groups = useMemo(() => placeholderGroups(placeholders), [placeholders]);
  if (groups.length === 0) return null;

  return (
    <ChartContainer title={title} subtitle={subtitle} loading={loading} height="auto">
      <div className="space-y-5">
        {groups.map((g) => (
          <PlaceholderGroupBlock key={g.id} group={g} />
        ))}
      </div>
    </ChartContainer>
  );
}

function PlaceholderGroupBlock({ group }: { group: PlaceholderGroup }) {
  const { t } = useTranslation();
  return (
    <section aria-labelledby={`ph-${group.id}`}>
      <h3
        id={`ph-${group.id}`}
        className="mb-2 text-xs font-bold uppercase tracking-wide text-fg-muted"
      >
        {t(`admin.ph.group.${group.id}`)}
      </h3>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {group.metrics.map((m) => (
          <PlaceholderTile
            key={m.key}
            icon={m.icon}
            /* A key the catalogue has not been taught yet still gets a readable
               English label rather than rendering the raw i18n key. */
            label={t(`admin.ph.${m.key}`, { defaultValue: humanizeMetricKey(m.key) })}
            note={t('admin.ph.needsIntegration')}
          />
        ))}
      </div>
    </section>
  );
}

/* NO `opacity-*` here. Dimming muted text to signal "inactive" is what axe caught
 * on the executive dashboard: it drags fg-muted below AA and makes the label
 * genuinely hard to read. The dashed border, the em-dash and the note already say
 * "no data" — the opacity was only ever saying it a second time, illegibly. */
function PlaceholderTile({ icon, label, note }: { icon: string; label: string; note: string }) {
  return (
    <div className="rounded-xl border border-dashed border-subtle bg-surface-muted p-3">
      <div className="text-sm" aria-hidden="true">{icon}</div>
      <div className="mt-1 text-sm font-bold text-fg-muted">—</div>
      <div className="text-xs text-fg-muted">{label}</div>
      <div className="text-[10px] italic text-fg-muted">{note}</div>
    </div>
  );
}
