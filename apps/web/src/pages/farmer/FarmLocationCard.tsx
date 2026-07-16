import { useState } from 'react';
import { Button, Card } from '@marutham/ui';
import { apiFetchOffline, OfflineQueuedError, type User } from '@marutham/api-client';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../components/Toast';
import { getCurrentPosition } from '../../native/geolocation';

/* One-tap farm location. Phase 2 of the geolocation rollout — reuses the shared
 * getCurrentPosition() helper (native GPS on device, browser Geolocation otherwise)
 * and saves the fix to users.farm_lat/lng via PATCH /auth/me. Best-effort: if the
 * farmer declines permission or there is no fix, nothing is saved and we say so.
 *
 * Offline-aware: a farmer standing in their field often has no signal, which is
 * exactly when they pin. So the save goes through the offline write queue — if
 * there is no connection it is parked and replayed on reconnect, the card shows the
 * pin immediately (optimistic), and we say it will sync. The `replace` key means a
 * re-pin while still offline supersedes the earlier one, so the latest fix wins. */
export function FarmLocationCard() {
  const { user, updateUser } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  if (!user) return null;

  const lat = user.farm_lat as number | null | undefined;
  const lng = user.farm_lng as number | null | undefined;
  const hasLoc = typeof lat === 'number' && typeof lng === 'number';

  async function capture() {
    if (!user) return; // narrow for this closure (the early return above doesn't carry in)
    setBusy(true);
    try {
      const coords = await getCurrentPosition();
      if (!coords) {
        toast('Could not get your location. Check location permission and try again.', 'er');
        return;
      }
      try {
        const res = await apiFetchOffline<{ user: User }>(
          'PATCH',
          '/auth/me',
          { farm_lat: coords.lat, farm_lng: coords.lng },
          { key: `farm-${user.id}`, replace: true },
        );
        updateUser(res.user);
        toast('Farm location saved.', 'ok');
      } catch (e) {
        if (e instanceof OfflineQueuedError) {
          // Optimistic: show the pin now; the queue will sync it on reconnect.
          updateUser({ ...user, farm_lat: coords.lat, farm_lng: coords.lng });
          toast('Saved on your device — it will sync when you are back online.', 'ok');
        } else {
          throw e;
        }
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not save farm location.', 'er');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <h3 className="mb-1 text-md font-bold text-primary">📍 Farm location</h3>
      <p className="mb-3 text-2xs text-fg-muted">
        Pin your farm so buyers and delivery agents can find it. We use your device&apos;s current
        location — it is never shared publicly.
      </p>
      <div className="mb-3 rounded-sm bg-surface-muted p-3">
        <div className="text-2xs uppercase tracking-wide text-fg-muted">Saved location</div>
        <div className="text-sm font-semibold text-fg tabular-nums">
          {hasLoc ? `${lat!.toFixed(5)}, ${lng!.toFixed(5)}` : 'Not set yet'}
        </div>
      </div>
      <Button onClick={capture} disabled={busy}>
        {busy
          ? 'Getting location…'
          : hasLoc
            ? '📍 Update farm location'
            : '📍 Use my current location'}
      </Button>
    </Card>
  );
}
