import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '@marutham/api-client';
import { fmtMoney, minutesUntil, resolveAddress, type JobOffer } from '@marutham/lib';
import { useToast } from '../../components/Toast';

/* New jobs waiting for THIS agent to accept — top of the work tab. Accept locks the
 * job in; Decline (optional reason) hands it back to the VCO / hub to re-pick. The
 * countdown ticks locally; the server sweep is what actually expires a job. */
export function JobOffers({ jobs, onChanged }: { jobs: JobOffer[]; onChanged: () => void }) {
  const { t } = useTranslation();
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!jobs.length) return;
    const id = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, [jobs.length]);

  if (!jobs.length) return null;
  return (
    <div className="q-section q-section--offer">
      <div className="q-head">
        <div className="q-label">🔔 {t('agent.job.title', 'New jobs — accept or decline')}</div>
        <div className="q-count">{jobs.length}</div>
      </div>
      {jobs.map((j) => (
        <JobCard key={`${j.order.id}-${j.leg}`} job={j} onChanged={onChanged} />
      ))}
    </div>
  );
}

function JobCard({ job, onChanged }: { job: JobOffer; onChanged: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState('');
  const o = job.order;
  const left = minutesUntil(job.deadline);
  const addr = resolveAddress(o.delivery_address);

  const task =
    job.leg === 'collection'
      ? t('agent.job.toHub', 'Collect from the VCO in {{village}} → hand to the hub', {
          village: o.village || '—',
        })
      : o.status === 'At Hub'
        ? t('agent.job.fromHub', 'Collect at the hub → deliver to {{name}}', {
            name: o.consumer_name || t('agent.consumer', 'Consumer'),
          })
        : t('agent.job.direct', 'Collect from the VCO in {{village}} → deliver to {{name}}', {
            village: o.village || '—',
            name: o.consumer_name || t('agent.consumer', 'Consumer'),
          });

  async function answer(accept: boolean) {
    setBusy(true);
    try {
      await api.respondToJob(o.id, accept, accept ? undefined : reason.trim() || undefined);
      toast(
        accept
          ? t('agent.job.acceptedToast', 'Job accepted.')
          : t('agent.job.declinedToast', 'Job declined.'),
        'ok',
      );
      onChanged();
    } catch (e) {
      toast(
        e instanceof Error ? e.message : t('agent.job.failed', 'Could not send your answer'),
        'er',
      );
      setBusy(false);
      onChanged();
    }
  }

  return (
    <div className="delv-card delv-card--offer">
      <div className="delv-card__code">
        {o.code || o.id.slice(0, 8).toUpperCase()}
        {left != null ? (
          <span
            className="delv-card__deadline"
            style={{ marginLeft: 8, color: 'var(--warning-fg)', fontWeight: 700 }}
          >
            ⏱ {t('agent.job.minLeft', '{{min}} min left', { min: left })}
          </span>
        ) : null}
      </div>
      <div className="delv-card__name">{task}</div>
      {job.leg !== 'collection' && addr ? <div className="delv-card__addr">{addr}</div> : null}
      <div className="delv-card__meta">
        <div className="delv-card__pay">{fmtMoney(o.total)}</div>
      </div>
      {declining ? (
        <div style={{ marginTop: 8 }}>
          <input
            className="a-input"
            type="text"
            value={reason}
            maxLength={200}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t('agent.job.reasonPh', 'Reason (optional) — e.g. too far, vehicle issue')}
            aria-label={t('agent.job.reason', 'Reason for declining')}
            style={{ width: '100%', marginBottom: 8 }}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="delv-card__btn" disabled={busy} onClick={() => answer(false)}>
              {busy ? '⏳…' : t('agent.job.confirmDecline', 'Confirm decline')}
            </button>
            <button
              className="delv-card__btn delv-card__btn--ghost"
              disabled={busy}
              onClick={() => setDeclining(false)}
            >
              {t('common.cancel', 'Cancel')}
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button className="delv-card__btn" disabled={busy} onClick={() => answer(true)}>
            {busy ? '⏳…' : `✓ ${t('agent.job.accept', 'Accept')}`}
          </button>
          <button
            className="delv-card__btn delv-card__btn--ghost"
            disabled={busy}
            onClick={() => setDeclining(true)}
          >
            ✕ {t('agent.job.decline', 'Decline')}
          </button>
        </div>
      )}
    </div>
  );
}
