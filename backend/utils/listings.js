// Listing image validation.
//
// Images are currently stored as base64 data URIs inside farmer_listings.images
// (JSONB). One 640px JPEG is ~45 KB of base64, and GET /listings?district= inlines
// them into every consumer's storefront response — uncacheable and 33% inflated
// by the encoding. This is a known problem: the right home is Supabase Storage
// with public URLs in images[]. Until then the server caps what it will accept,
// because the client is not a trustworthy place to enforce a size limit.

const MAX_IMAGES = 3;
/** ~150 KB of base64 ≈ a 110 KB JPEG. Comfortably above the client's 640px/q0.75 output. */
const MAX_IMAGE_CHARS = 150_000;

const DATA_URI_RE = /^data:image\/(jpeg|jpg|png|webp);base64,/i;
const HTTP_URL_RE = /^https?:\/\//i;

/**
 * Returns { error } or { images } with a clean array.
 * `undefined` means "not supplied" and leaves the column untouched.
 */
function validateImages(images) {
  if (images === undefined) return { images: undefined };
  if (images === null) return { images: [] };
  if (!Array.isArray(images)) return { error: 'images must be an array.' };
  if (images.length > MAX_IMAGES) return { error: `At most ${MAX_IMAGES} images per listing.` };

  for (const img of images) {
    if (typeof img !== 'string' || !img) return { error: 'Each image must be a non-empty string.' };
    if (!DATA_URI_RE.test(img) && !HTTP_URL_RE.test(img)) {
      return { error: 'Each image must be a JPEG/PNG/WebP data URI or an http(s) URL.' };
    }
    if (img.length > MAX_IMAGE_CHARS) {
      return { error: 'Each image must be under ~110 KB. Please choose a smaller photo.' };
    }
  }
  return { images };
}

// ── Daily supply cycle ───────────────────────────────────────────────────────
// When a listing's cut-off passes, the day's offer is over. The price carries
// forward (the farmer edits it only when it changed), but the stock and the
// photos do NOT: each market day the farmer states fresh stock and shares a fresh
// picture of what they are actually bringing, so customers see today's produce.
const DAILY_RESET = Object.freeze({ confirmed: false, listed: false, qty_available: 0, images: [] });

/**
 * Why a listing cannot be confirmed for today's market, or null when it can.
 * `row` is the listing as it will be AFTER the update (existing merged with body).
 */
function confirmProblem(row) {
  if (!(Number(row.qty_available) > 0)) {
    return 'Enter today\'s available quantity before confirming.';
  }
  if (!Array.isArray(row.images) || row.images.length === 0) {
    return 'Add today\'s photo of the produce before confirming.';
  }
  return null;
}

module.exports = { validateImages, MAX_IMAGES, MAX_IMAGE_CHARS, DAILY_RESET, confirmProblem };
