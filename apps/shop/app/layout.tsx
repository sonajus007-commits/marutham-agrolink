import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import { DEFAULT_LANG, DICT, LANG_COOKIE, isLang } from '@/lib/dict';
import { SITE_URL } from '@/lib/site';
import './globals.css';

/* The metadata a crawler reads. This is the whole reason the shop is server-
 * rendered: the portal at /app is a Vite SPA that ships an empty <div> to a
 * bot, so nothing about the marketplace was ever indexable. */
export const metadata: Metadata = {
  // Without this, Next resolves nothing: `canonical` stays relative and og:url
  // is dropped from the document entirely, so a shared link previews as bare.
  metadataBase: new URL(SITE_URL),
  title: 'Marutham AgroLink — Fresh from Tamil Nadu farms, straight to your home',
  description:
    'Buy fruit and vegetables direct from farmers in Pudukkottai and across Tamil Nadu. ' +
    'Fair prices for farmers, fresh produce for families.',
  openGraph: {
    title: 'Marutham AgroLink',
    description:
      'Fresh produce direct from Tamil Nadu farmers. Fair prices for farmers, fresh food for families.',
    type: 'website',
  },
  robots: { index: true, follow: true },
  // Makes the marketplace installable/standalone on iOS, where Apple ignores the
  // web manifest and reads these tags instead.
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'AgroLink' },
};

// theme_color for the browser chrome; matches the manifest and the portal PWA.
export const viewport: Viewport = {
  themeColor: '#2E7D32',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieLang = (await cookies()).get(LANG_COOKIE)?.value;
  const lang = isLang(cookieLang) ? cookieLang : DEFAULT_LANG;

  return (
    <html lang={DICT[lang].htmlLang}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&family=Outfit:wght@400;600;700;800&family=Noto+Serif+Tamil:wght@400;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
