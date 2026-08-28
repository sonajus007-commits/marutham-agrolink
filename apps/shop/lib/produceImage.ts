/* Product name → a real photo, when we have one.
 *
 * The catalogue has no image column — products render as an emoji (productEmoji).
 * That is fine as a universal fallback, but the marketplace looks far better with
 * real produce. This maps a product's name (English or its Tamil regional name)
 * to a photo in public/produce, and returns null when we have none — the caller
 * then falls back to the emoji, so nothing ever renders blank.
 *
 * Keep this list in step with the files in public/produce. Match is by keyword
 * anywhere in the (lower-cased) name, so "Country Tomato" and "Nadu Thakkali"
 * both find the tomato photo. */

interface Entry {
  src: string;
  /** Lower-case keywords, English + Tamil, that map to this photo. */
  keys: string[];
}

const CATALOGUE: Entry[] = [
  { src: '/produce/tomato.jpg', keys: ['tomato', 'thakkali', 'தக்காளி'] },
  { src: '/produce/potato.jpg', keys: ['potato', 'urulai', 'உருளை', 'கிழங்கு'] },
  { src: '/produce/carrot.jpg', keys: ['carrot', 'கேரட்'] },
  { src: '/produce/brinjal.jpg', keys: ['brinjal', 'eggplant', 'aubergine', 'kathiri', 'கத்திரி'] },
  { src: '/produce/chilli.jpg', keys: ['chilli', 'chili', 'milagai', 'மிளகாய்'] },
  { src: '/produce/chicken.jpg', keys: ['chicken', 'kozhi', 'கோழி'] },
];

/** A photo path for this product name, or null to fall back to the emoji. */
export function produceImage(name?: string | null, regionalName?: string | null): string | null {
  const hay = `${name ?? ''} ${regionalName ?? ''}`.toLowerCase();
  for (const e of CATALOGUE) {
    if (e.keys.some((k) => hay.includes(k))) return e.src;
  }
  return null;
}
