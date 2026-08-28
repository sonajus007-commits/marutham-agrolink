import 'server-only';
import { existsSync } from 'node:fs';
import path from 'node:path';

/* Optional real-photo background per Ainthinai landscape.
 *
 * If a file exists at public/landscapes/<thinai>.<ext>, the matching sections use
 * it as a photographic background (under a scrim, see Section); when there is no
 * file the section falls back to the faint terrain line-art. So the whole feature
 * is opt-in per landscape: drop a photo in, the section upgrades; take it out, it
 * reverts. Nothing else changes.
 *
 * The lookup is a cheap existsSync at render time (server only), so adding a photo
 * shows up on the next request without a code change. See public/landscapes/README.txt. */

const DIR = path.join(process.cwd(), 'public', 'landscapes');
const EXT = ['jpg', 'jpeg', 'png', 'webp'];

/** Public path to this landscape's photo, or null to fall back to terrain art. */
export function landscapeBg(name: string): string | null {
  for (const ext of EXT) {
    const file = `${name}.${ext}`;
    try {
      if (existsSync(path.join(DIR, file))) return `/landscapes/${file}`;
    } catch {
      /* A stat error just means "no photo" — fall through to terrain. */
    }
  }
  return null;
}
