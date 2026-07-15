import { useState } from 'react';
import { Button } from '@marutham/ui';
import { useToast } from './Toast';
import { getCurrentPosition } from '../native/geolocation';

/* Reusable "pin this spot" control for anything that carries an optional lat/lng —
 * phase 3 of the geolocation rollout, used by the delivery-address form and built to
 * be dropped onto hubs/VCO next. Captures the device fix via the shared helper
 * (native GPS or browser Geolocation), merges it into the value, and shows the pin.
 * Best-effort: a declined permission pins nothing and says so. */
interface Pinnable {
  lat?: number | null;
  lng?: number | null;
}

export function LocationPinButton<T extends Pinnable>({
  value,
  onChange,
}: {
  value: T;
  onChange: (next: T) => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const pinned = typeof value.lat === 'number' && typeof value.lng === 'number';

  async function pin() {
    setBusy(true);
    try {
      const coords = await getCurrentPosition();
      if (!coords) {
        toast('Could not get your location. Check location permission and try again.', 'er');
        return;
      }
      onChange({ ...value, lat: coords.lat, lng: coords.lng });
      toast('Location pinned.', 'ok');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" variant="ghost" onClick={pin} disabled={busy}>
        {busy ? 'Getting location…' : pinned ? '📍 Update pin' : '📍 Pin current location'}
      </Button>
      {pinned ? (
        <span className="text-2xs text-fg-muted tabular-nums">
          {value.lat!.toFixed(5)}, {value.lng!.toFixed(5)}
          <button
            type="button"
            className="ml-2 underline"
            onClick={() => onChange({ ...value, lat: null, lng: null })}
          >
            clear
          </button>
        </span>
      ) : null}
    </div>
  );
}
