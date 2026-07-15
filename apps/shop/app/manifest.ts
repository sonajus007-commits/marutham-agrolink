import type { MetadataRoute } from 'next';

/* The web app manifest for the public marketplace. Next serves this at
 * /manifest.webmanifest and injects the <link rel="manifest"> automatically.
 * The portal at /app ships its own manifest (see apps/web/vite.config.ts) scoped
 * to '/app/'; this one owns the marketplace at the origin root. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Marutham AgroLink — Fresh from Tamil Nadu farms',
    short_name: 'AgroLink',
    description:
      'Buy fruit and vegetables direct from farmers in Pudukkottai and across Tamil Nadu.',
    id: '/',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    theme_color: '#2E7D32',
    background_color: '#ffffff',
    icons: [
      { src: '/icons/pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
