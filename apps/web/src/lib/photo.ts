/* Shared photo capture + downscale — the one place the stored size/format of any
 * in-app photo is decided, so a listing image and a delivery proof land in the same
 * shape (a small JPEG data URI). Used by <ImagePicker> (listing slots) and
 * <PhotoCapture> (a single field-proof photo). A phone camera's multi-MB JPEG never
 * reaches the backend intact — it is downscaled here first. */

export const PHOTO_MAX_WIDTH = 640;
export const PHOTO_QUALITY = 0.75;

/** Downscale a data URL to PHOTO_MAX_WIDTH and re-encode as JPEG. */
export function downscaleDataUrl(src: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onerror = () => reject(new Error('That image could not be opened.'));
    img.onload = () => {
      const ratio = img.width > PHOTO_MAX_WIDTH ? PHOTO_MAX_WIDTH / img.width : 1;
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * ratio);
      canvas.height = Math.round(img.height * ratio);
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('Could not process that image.'));
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', PHOTO_QUALITY));
    };
    img.src = src;
  });
}

/** Read a picked File and downscale it. Rejects a non-image. */
export function fileToDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) return reject(new Error('That file is not an image.'));
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.onload = () => resolve(downscaleDataUrl(String(reader.result)));
    reader.readAsDataURL(file);
  });
}
