import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cameraAvailable, capturePhoto } from '../native/camera';
import { downscaleDataUrl, fileToDataUri } from '../lib/photo';

/* One optional proof photo for a field action — a delivery hand-off shot or a VCO's
 * photo of the received goods. Downscaled to the shared small-JPEG size (lib/photo)
 * so it rides the offline scan queue and never bloats a request. On a device it opens
 * the native camera; in a browser it's <input type="file" capture>. The value is a
 * data URI the caller submits with the scan; null when none is attached. */
export function PhotoCapture({
  value,
  onChange,
  label,
}: {
  value: string | null;
  onChange: (dataUri: string | null) => void;
  label: string;
}) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const native = cameraAvailable();

  async function store(uri: Promise<string>) {
    setBusy(true);
    setErr(null);
    try {
      onChange(await uri);
    } catch (e) {
      setErr(e instanceof Error ? e.message : t('agent.photo.failed', 'Could not add that photo.'));
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function pickCamera() {
    const raw = await capturePhoto();
    if (!raw) return; // cancelled / permission denied
    void store(downscaleDataUrl(raw));
  }

  return (
    <div className="photo-capture">
      {value ? (
        <div className="photo-capture__preview">
          <img src={value} alt={t('agent.photo.alt', 'Attached photo')} />
          <button
            type="button"
            className="photo-capture__remove"
            aria-label={t('agent.photo.remove', 'Remove photo')}
            onClick={() => onChange(null)}
          >
            ✕
          </button>
        </div>
      ) : native ? (
        <button type="button" className="photo-capture__add" disabled={busy} onClick={pickCamera}>
          📷 {busy ? t('agent.photo.adding', 'Adding…') : label}
        </button>
      ) : (
        <label className={`photo-capture__add${busy ? ' is-busy' : ''}`}>
          📷 {busy ? t('agent.photo.adding', 'Adding…') : label}
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            capture="environment"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void store(fileToDataUri(file));
            }}
            style={{ display: 'none' }}
          />
        </label>
      )}
      {err ? <div className="photo-capture__err">{err}</div> : null}
    </div>
  );
}
