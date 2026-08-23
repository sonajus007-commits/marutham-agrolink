import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, type Hub } from '@marutham/api-client';
import { addressDetailRows } from '@marutham/lib';

/* Read-only "my office" card for a VCO / Delivery Agent / Hub Incharge / Hub
 * Manager. Their office is the hub they are assigned to (users.hub_id), and its
 * address is the hub's office address — a single source of truth owned by admin/HR,
 * so this only ever DISPLAYS it. Fetches GET /hubs/mine itself so any profile can
 * drop it in with no wiring. Renders nothing when the person has no hub assigned
 * (a normal state), so it never leaves an empty shell on a profile. */
export function OfficeHubCard() {
  const { t } = useTranslation();
  const [hub, setHub] = useState<Hub | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    api
      .getMyHub()
      .then((res) => active && setHub(res.hub))
      .catch(() => active && setHub(null))
      .finally(() => active && setLoaded(true));
    return () => {
      active = false;
    };
  }, []);

  // Nothing to show until we know, and nothing to show if no hub is assigned.
  if (!loaded || !hub) return null;

  return (
    <div className="rounded-base border border-border-subtle bg-surface p-4">
      <div className="mb-1 text-sm font-bold text-primary">
        🏭 {t('profile.officeHub', 'My office (hub)')}
      </div>
      <div className="mb-2 text-sm font-semibold text-fg">
        {hub.name}
        {hub.taluk ? <span className="text-fg-muted"> · {hub.taluk}</span> : null}
      </div>
      <div className="flex flex-col">
        {addressDetailRows(hub, '—').map(([key, label, value]) => (
          <div
            key={key}
            className="flex justify-between gap-3 border-b border-border-subtle py-1 text-2xs last:border-b-0"
          >
            <span className="uppercase tracking-wide text-fg-muted">{t(key, label)}</span>
            <span className="text-right font-medium text-fg">{value}</span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-2xs text-fg-muted">
        {t(
          'profile.officeHubHint',
          'Your assigned hub and its office address. Managed by admin / HR — contact them to change it.',
        )}
      </p>
    </div>
  );
}
