import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '@marutham/api-client';
import { useToast } from '../../components/Toast';
import { getCurrentPosition } from '../../native/geolocation';

/* The header duty pill, now real (migration 057). A field staffer taps it to go on
 * or off duty for the day; managers see the roster in the admin Attendance view.
 * Best-effort location on check-in — declining it never blocks going on duty. */

export function DutyToggle() {
  const { t } = useTranslation();
  const toast = useToast();
  const [onDuty, setOnDuty] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.getMyAttendance();
      setOnDuty(res.status === 'on_duty');
    } catch {
      /* best-effort — leave the pill as-is */
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggle() {
    setBusy(true);
    try {
      if (onDuty) {
        await api.checkOut();
        setOnDuty(false);
        toast(t('agent.duty.off', 'Checked out — off duty.'), 'ok');
      } else {
        const coords = (await getCurrentPosition()) ?? undefined;
        await api.checkIn(coords);
        setOnDuty(true);
        toast(t('agent.duty.on', 'Checked in — on duty.'), 'ok');
      }
    } catch (e) {
      toast(
        e instanceof Error ? e.message : t('agent.duty.failed', 'Could not update duty status'),
        'er',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      className={`agent-pill agent-pill--btn${onDuty ? '' : ' agent-pill--off'}`}
      onClick={() => void toggle()}
      disabled={busy}
      aria-pressed={onDuty}
      title={
        onDuty
          ? t('agent.duty.tapOff', 'Tap to check out')
          : t('agent.duty.tapOn', 'Tap to check in')
      }
    >
      <span className="agent-dot" />
      <span className="agent-pill__text">
        {busy ? '…' : onDuty ? t('agent.onDuty', 'On Duty') : t('agent.offDuty', 'Off Duty')}
      </span>
    </button>
  );
}
