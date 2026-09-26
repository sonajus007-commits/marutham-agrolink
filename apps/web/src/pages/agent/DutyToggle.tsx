import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '@marutham/api-client';
import { ConfirmDialog } from '@marutham/ui';
import { useToast } from '../../components/Toast';
import { getCurrentPosition } from '../../native/geolocation';

/* The header duty pill, now real (migration 057). A field staffer taps it to go on
 * or off duty for the day; managers see the roster in the admin Attendance view.
 * Best-effort location on check-in — declining it never blocks going on duty.
 *
 * The daily prompt: opening the portal with NO attendance row today (never checked
 * in — a check-out still counts as a row, so someone who worked and went home is
 * not asked again) pops "Are you on duty today?". "Not today" is remembered for that
 * IST day on this device only; the morning in-app nudge (utils/dutyPrompt) is the
 * server-side half of the same prompt. */

const DISMISS_KEY = 'ma_duty_prompt_dismissed';

/** Today's IST calendar date — the same work day the backend files attendance under. */
function istDate(): string {
  return new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}

function dismissedToday(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === istDate();
  } catch {
    return false;
  }
}

function rememberDismissed(): void {
  try {
    localStorage.setItem(DISMISS_KEY, istDate());
  } catch {
    /* storage blocked — the prompt just returns next open */
  }
}

export function DutyToggle() {
  const { t } = useTranslation();
  const toast = useToast();
  const [onDuty, setOnDuty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [prompt, setPrompt] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.getMyAttendance();
      setOnDuty(res.status === 'on_duty');
      if (res.attendance === null && !dismissedToday()) setPrompt(true);
    } catch {
      /* best-effort — leave the pill as-is, and never prompt on a failed read */
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function checkIn() {
    const coords = (await getCurrentPosition()) ?? undefined;
    await api.checkIn(coords);
    setOnDuty(true);
    toast(t('agent.duty.on', 'Checked in — on duty.'), 'ok');
  }

  async function run(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
    } catch (e) {
      toast(
        e instanceof Error ? e.message : t('agent.duty.failed', 'Could not update duty status'),
        'er',
      );
    } finally {
      setBusy(false);
    }
  }

  function toggle() {
    void run(async () => {
      if (onDuty) {
        await api.checkOut();
        setOnDuty(false);
        toast(t('agent.duty.off', 'Checked out — off duty.'), 'ok');
      } else {
        await checkIn();
      }
    });
  }

  function confirmPrompt() {
    void run(async () => {
      await checkIn();
      setPrompt(false);
    });
  }

  function dismissPrompt() {
    rememberDismissed();
    setPrompt(false);
  }

  return (
    <>
      <button
        type="button"
        className={`agent-pill agent-pill--btn${onDuty ? '' : ' agent-pill--off'}`}
        onClick={toggle}
        disabled={busy}
        aria-pressed={onDuty}
        title={
          onDuty
            ? t('agent.duty.tapOff', 'Tap to check out')
            : t('agent.duty.tapOn', 'Tap to check in')
        }
      >
        <span className="agent-dot" />
        {/* Full label on desktop; a short "On/Off" on phones so the pill leaves room
            for the wordmark. The dot's colour carries the status either way. */}
        <span className="agent-pill__text agent-pill__text--full">
          {busy ? '…' : onDuty ? t('agent.onDuty', 'On Duty') : t('agent.offDuty', 'Off Duty')}
        </span>
        <span className="agent-pill__text agent-pill__text--short" aria-hidden="true">
          {busy ? '…' : onDuty ? t('agent.onDutyShort', 'On') : t('agent.offDutyShort', 'Off')}
        </span>
      </button>
      <ConfirmDialog
        open={prompt}
        title={t('agent.duty.promptTitle', 'Are you on duty today?')}
        onConfirm={confirmPrompt}
        onClose={dismissPrompt}
        confirmLabel={t('agent.duty.promptYes', 'Check in')}
        cancelLabel={t('agent.duty.promptNo', 'Not today')}
        tone="primary"
        busy={busy}
      >
        {t(
          'agent.duty.promptBody',
          'You have not checked in yet today. Check in so your manager can see you are on duty.',
        )}
      </ConfirmDialog>
    </>
  );
}
