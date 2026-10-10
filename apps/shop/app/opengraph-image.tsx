import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';

/* The picture WhatsApp, Facebook, LinkedIn and X show when someone shares a link.
 * Every page had an og:title and og:description but no og:image, so a shared link
 * previewed as a bare line of text — on WhatsApp, where this marketplace is most
 * likely to travel, that is the difference between a tap and a scroll-past.
 *
 * Rendered once at build (nothing here is per-request) as a 1200×630 PNG, the size
 * every one of those platforms crops cleanly. Brand colours are the forest/blossom
 * pair from globals.css; the mark is the same MALOGO the header uses. */
export const alt = 'Marutham AgroLink — fresh produce direct from Tamil Nadu farmers';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function OpengraphImage() {
  const logo = await readFile(join(process.cwd(), 'public/brand/malogo.png'));
  const logoSrc = `data:image/png;base64,${logo.toString('base64')}`;

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        padding: '0 80px',
        gap: 64,
        background: 'linear-gradient(135deg, #163d2f 0%, #1e5b43 60%, #3e8e5a 100%)',
        color: '#ffffff',
      }}
    >
      <img src={logoSrc} width={300} height={300} alt="" style={{ borderRadius: 40 }} />
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
        <div style={{ display: 'flex', fontSize: 64, fontWeight: 800, lineHeight: 1.05 }}>
          <span>Marutham</span>
          <span style={{ marginLeft: 18, color: '#fcc9dd' }}>AgroLink</span>
        </div>
        <div style={{ marginTop: 24, fontSize: 38, lineHeight: 1.3, color: '#e7f3ea' }}>
          Fresh from Tamil Nadu farms, straight to your home.
        </div>
        <div
          style={{
            marginTop: 36,
            display: 'flex',
            alignSelf: 'flex-start',
            padding: '14px 30px',
            borderRadius: 999,
            background: '#d95c8a',
            fontSize: 28,
            fontWeight: 700,
          }}
        >
          Fair prices for farmers · Fresh food for families
        </div>
      </div>
    </div>,
    size,
  );
}
