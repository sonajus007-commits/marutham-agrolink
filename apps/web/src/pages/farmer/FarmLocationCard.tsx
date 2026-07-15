import { useState } from 'react';
import { Button, Card } from '@marutham/ui';
import { api } from '@marutham/api-client';
import { useAuth } from '../../auth/AuthContext';
import { useToast } from '../../components/Toast';
import { getCurrentPosition } from '../../native/geolocation';

/* One-tap farm location. Phase 2 of the geolocation rollout — reuses the shared
 * getCurrentPosition() helper (native GPS on device, browser Geolocation otherwise)
 * and saves the fix to users.farm_lat/lng via PATCH /auth/me. Best-effort: if the
 * farmer declines permission or there is no fix, nothing is saved and we say so. */
export function FarmLocationCard() {
  const { user, updateUser } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  if (!user) return null;

  const lat = user.farm_lat as number | null | undefined;
  const lng = user.farm_lng as number | null | undefined;
  const hasLoc = typeof lat === 'number' && typeof lng === 'number';

  async function capture() {
    setBusy(true);
    try {
      const coords = await getCurrentPosition();
      if (!coords) {
        toast('Could not get your location. Check location permission and try again.', 'er');
        return;
      }
      const res = await api.patchMe({ farm_lat: coords.lat, farm_lng: coords.lng });
      updateUser(res.user);
      toast('Farm location saved.', 'ok');
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
