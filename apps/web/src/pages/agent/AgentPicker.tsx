import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { EligibleAgent } from '@marutham/api-client';

/* The on-duty agent <select> shared by Verify (VCO names the pickup agent) and the
 * re-assign sheet (after a decline / timeout). Proximity first: agents within the
 * pickup radius lead; the rest of the on-duty district hides behind "Show all" so
 * a far agent is a deliberate choice, not the default. Only agents ready TODAY are
 * offered — an off-duty agent cannot take a job. */
export function AgentPicker({
  agents,
  matchedIds,
  radiusKm,
  value,
  onChange,
  excludeId,
  selfOption,
  ariaLabel,
}: {
  /** Every candidate (GET eligible-agents `all`), already ranked by the server. */
  agents: EligibleAgent[];
  /** Ids whose coverage includes the village (`matched`). */
  matchedIds: Set<string>;
  radiusKm: number;
  value: string;
  onChange: (id: string) => void;
  /** Never offered as an "agent" (the signed-in VCO — offered as selfOption instead). */
  excludeId?: string;
  /** "Take it myself" — the verifying VCO's own id + label. */
  selfOption?: { id: string; label: string };
  ariaLabel: string;
}) {
  const { t } = useTranslation();
  const [showAll, setShowAll] = useState(false);

  const ready = agents.filter((a) => a.ready_today && a.id !== excludeId);
  const near = ready.filter((a) => a.within_radius);
  const covering = ready.filter((a) => !a.within_radius && matchedIds.has(a.id));
  const rest = ready.filter((a) => !a.within_radius && !matchedIds.has(a.id));
  // A selection hidden behind "show all" must stay visible, or the select lies.
  const selectedHidden = !showAll && rest.some((a) => a.id === value);

  const label = (a: EligibleAgent) => {
    let s = a.name;
    if (a.distance_m != null)
      s += ` · ${t('agent.assign.km', { km: (a.distance_m / 1000).toFixed(1) })}`;
    if (a.same_hub) s += ` · 🏭 ${t('agent.verify.sameHub', 'Same hub')}`;
    if (a.vehicle) s += ` · ${a.vehicle}`;
    return s;
  };

  return (
    <>
      <div
        className="agent-picker__hint"
        style={{
          fontSize: 11,
          color: near.length ? 'var(--success-fg)' : 'var(--warning-fg)',
          background: near.length ? 'var(--success-bg)' : 'var(--warning-bg)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 8,
          padding: '8px 10px',
          marginBottom: 8,
        }}
      >
        {near.length
          ? `✓ ${t('agent.pick.near', { count: near.length, km: radiusKm })}`
          : ready.length
            ? t(
                'agent.pick.noneNear',
                'No on-duty agent within {{km}} km. Show all, or assign later.',
                {
                  km: radiusKm,
                },
              )
            : t('agent.verify.noneOnDuty', 'No delivery agent is on duty right now. Assign later.')}
      </div>
      <select
        className="a-select"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={ariaLabel}
      >
        <option value="">— {t('agent.verify.assignLater', 'Assign later')} —</option>
        {selfOption ? <option value={selfOption.id}>{selfOption.label}</option> : null}
        {near.length ? (
          <optgroup
            label={t('agent.pick.nearGroup', 'Within {{km}} km · on duty', { km: radiusKm })}
          >
            {near.map((a) => (
              <option key={a.id} value={a.id}>
                {label(a)}
              </option>
            ))}
          </optgroup>
        ) : null}
        {covering.length ? (
          <optgroup label={t('agent.verify.covers', 'Covers this village · on duty')}>
            {covering.map((a) => (
              <option key={a.id} value={a.id}>
                {label(a)}
              </option>
            ))}
          </optgroup>
        ) : null}
        {(showAll || selectedHidden) && rest.length ? (
          <optgroup label={t('agent.verify.others', 'Other agents on duty in district')}>
            {rest
              .filter((a) => showAll || a.id === value)
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {label(a)}
                </option>
              ))}
          </optgroup>
        ) : null}
      </select>
      {rest.length && !showAll ? (
        <button
          type="button"
          className="agent-picker__more"
          onClick={() => setShowAll(true)}
          style={{
            marginTop: 6,
            background: 'none',
            border: 'none',
            padding: 0,
            color: 'var(--leaf)',
            fontWeight: 700,
            fontSize: 12,
            cursor: 'pointer',
            textDecoration: 'underline',
          }}
        >
          {t('agent.pick.showAll', 'Show all agents on duty ({{n}} more)', { n: rest.length })}
        </button>
      ) : null}
      <div style={{ fontSize: 11, color: 'var(--gray)', marginTop: 6 }}>
        {t(
          'agent.pick.acceptNote',
          'The agent must accept within 15 minutes, or you will be asked to pick another.',
        )}
      </div>
    </>
  );
}
