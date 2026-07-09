import { useRef, useState } from 'react';

/* Photo slots for a listing.
 *
 * Images are downscaled in the browser and stored as base64 data URIs in
 * farmer_listings.images (JSONB) — roughly 45 KB each, inlined into every
 * consumer's storefront response. The server caps what it accepts
 * (backend/utils/listings.js); this keeps a phone camera's 4 MB JPEG from ever
 * reaching it. The real fix is object storage with URLs; see the same file. */

const MAX_SLOTS = 3;
const MAX_WIDTH = 640;
const QUALITY = 0.75;

/** Downscale to MAX_WIDTH and re-encode as JPEG. Rejects non-images. */
function toDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) return reject(new Error('That file is not an image.'));
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.onload = () => {
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
      img.src = String(reader.result);
    };
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

  async function pick(file: File | undefined, slot: number) {
    if (!file) return;
    setBusy(true);
    try {
      const uri = await toDataUri(file);
      const next = images.slice();
      next[slot] = uri;
      onChange(next.filter(Boolean));
    } catch (e) {
      onError?.(e instanceof Error ? e.message : 'Could not add that photo.');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
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
            ) : (
              <label className="imgpick__add">
                <span aria-hidden="true">{busy ? '…' : '＋'}</span>
                <span className="imgpick__addtxt">Photo</span>
                <input
                  ref={i === images.length ? inputRef : undefined}
                  type="file"
                  accept="image/*"
                  disabled={busy}
                  onChange={(e) => pick(e.target.files?.[0], i)}
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
