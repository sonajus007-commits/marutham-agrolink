import { useRef, useState } from 'react';
import { cameraAvailable, capturePhoto } from '../native/camera';

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
 * same downscaleDataUrl(), so what lands in the column is identical either way. */

const MAX_SLOTS = 3;
const MAX_WIDTH = 640;
const QUALITY = 0.75;

/** Downscale a data URL to MAX_WIDTH and re-encode as JPEG — the one place the
 *  stored size/format is decided, shared by the file and camera paths. */
function downscaleDataUrl(src: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onerror = () => reject(new Error('That image could not be opened.'));
    img.onload = () => {
      const ratio = img.width > MAX_WIDTH ? MAX_WIDTH / img.width : 1;
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * ratio);
      canvas.height = Math.round(img.height * ratio);
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('Could not process that image.'));
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', QUALITY));
    };
    img.src = src;
  });
}

/** Read a picked File and downscale it. Rejects non-images. */
function fileToDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) return reject(new Error('That file is not an image.'));
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.onload = () => resolve(downscaleDataUrl(String(reader.result)));
    reader.readAsDataURL(file);
  });
}

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
