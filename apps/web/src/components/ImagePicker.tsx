import { useRef, useState } from 'react';
import { cameraAvailable, capturePhoto } from '../native/camera';
import { downscaleDataUrl, fileToDataUri } from '../lib/photo';

/* Photo slots for a listing.
 *
 * Images are downscaled in the browser and stored as base64 data URIs in
 * farmer_listings.images (JSONB) — roughly 45 KB each, inlined into every
 * consumer's storefront response. The server caps what it accepts
 * (backend/utils/listings.js); this keeps a phone camera's 4 MB JPEG from ever
 * reaching it. The real fix is object storage with URLs; see the same file.
 *
 * On a device (Capacitor) the farmer gets the NATIVE camera/gallery prompt via
 * @capacitor/camera; in a browser it is <input type="file">. Both paths end at the
 * shared downscaleDataUrl() (lib/photo), so what lands in the column is identical. */

const MAX_SLOTS = 3;

export function ImagePicker({
  images,
  onChange,
  onError,
}: {
  images: string[];
  onChange: (next: string[]) => void;
  onError?: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const native = cameraAvailable();

  // Resolve a data-URL promise into the given slot, with shared busy/error handling.
  async function store(uri: Promise<string>, slot: number) {
    setBusy(true);
    try {
      const next = images.slice();
      next[slot] = await uri;
      onChange(next.filter(Boolean));
    } catch (e) {
      onError?.(e instanceof Error ? e.message : 'Could not add that photo.');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  function pickFile(file: File | undefined, slot: number) {
    if (!file) return;
    void store(fileToDataUri(file), slot);
  }

  async function pickCamera(slot: number) {
    const raw = await capturePhoto();
    if (!raw) return; // cancelled or permission denied — nothing to add
    void store(downscaleDataUrl(raw), slot);
  }

  const slots = Array.from({ length: MAX_SLOTS }, (_, i) => images[i]);

  return (
    <div className="imgpick">
      <div className="imgpick__slots">
        {slots.map((src, i) => (
          <div key={i} className={`imgpick__slot${src ? ' is-filled' : ''}`}>
            {src ? (
              <>
                <img src={src} alt={`Listing photo ${i + 1}`} />
                <button
                  type="button"
                  className="imgpick__remove"
                  aria-label={`Remove photo ${i + 1}`}
                  onClick={() => onChange(images.filter((_, j) => j !== i))}
                >
                  ✕
                </button>
              </>
            ) : native ? (
              // On a device: open the native camera / gallery prompt.
              <button
                type="button"
                className="imgpick__add"
                disabled={busy}
                aria-label={`Add listing photo ${i + 1}`}
                onClick={() => pickCamera(i)}
              >
                <span aria-hidden="true">{busy ? '…' : '＋'}</span>
                <span className="imgpick__addtxt">Photo</span>
              </button>
            ) : (
              <label className="imgpick__add">
                <span aria-hidden="true">{busy ? '…' : '＋'}</span>
                <span className="imgpick__addtxt">Photo</span>
                <input
                  ref={i === images.length ? inputRef : undefined}
                  type="file"
                  accept="image/*"
                  disabled={busy}
                  onChange={(e) => pickFile(e.target.files?.[0], i)}
                />
                <span className="sr-only">Add listing photo {i + 1}</span>
              </label>
            )}
          </div>
        ))}
      </div>
      <p className="imgpick__hint">
        Up to {MAX_SLOTS} photos. Large images are shrunk automatically before upload.
      </p>
    </div>
  );
}
