import type { Metadata, Viewport } from 'next';
import { getLang } from '@/lib/lang';
import { DICT } from '@/lib/dict';
import { OG_IMAGE, SITE_URL } from '@/lib/site';
import { LoginModalProvider } from '@/components/auth/LoginModalProvider';
import { CartProvider } from '@/components/cart/CartProvider';
import { MobileNav } from '@/components/MobileNav';
import { LangProvider } from '@/components/LocaleLink';
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
    images: [OG_IMAGE],
  },
  // Large preview card on X/Twitter, using the same share picture.
  twitter: { card: 'summary_large_image', images: [OG_IMAGE] },
  robots: { index: true, follow: true },
  // Browser-tab favicon + iOS home-screen icon. The files live in public/ and
  // are the Marutham mark; without this Next emits no <link rel="icon"> at all.
  icons: {
    icon: [{ url: '/favicon-32.png', sizes: '32x32', type: 'image/png' }],
    apple: [{ url: '/apple-touch-icon.png' }],
  },
  // Makes the marketplace installable/standalone on iOS, where Apple ignores the
  // web manifest and reads these tags instead.
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'AgroLink' },
};

// theme_color for the browser chrome; matches the manifest and the portal PWA.
export const viewport: Viewport = {
  themeColor: '#2E7D32',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = await getLang();

  return (
    <html lang={DICT[lang].htmlLang}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* Poppins is the PRIMARY face — the same one the portal/app loads, so the
            website and the app read as one brand — and carries almost every glyph
            on the page, so it is the one that gets weight 400–800. Cormorant Garamond is
            SECONDARY — the wordmark and pull quotes only — so it only needs the
            two weights the logo uses. Noto Serif Tamil covers :lang(ta).
            JetBrains Mono is loaded for the one thing the brief asks it for:
            code and data. Everything is display=swap so text paints on the first
            frame in a fallback rather than blocking on the CDN. */}
        <link
          href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&family=Cormorant+Garamond:wght@600;700&family=Noto+Serif+Tamil:wght@400;600;700&family=JetBrains+Mono:wght@400;600&display=swap"
          rel="stylesheet"
        />
      </head>
      {/* Bottom padding on mobile clears the fixed MobileNav so the footer is
          never hidden behind it; removed at lg where the bar is gone. */}
      <body className="pb-[calc(3.5rem+env(safe-area-inset-bottom))] lg:pb-0">
        {/* First Tab stop: jump past the header to the page's <main id="main">.
            Invisible until focused by keyboard. */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-full focus:bg-forest-700 focus:px-5 focus:py-3 focus:font-semibold focus:text-surface focus:no-underline"
        >
          {DICT[lang].nav.skip}
        </a>
        <LangProvider lang={lang}>
          <LoginModalProvider lang={lang}>
            <CartProvider>
              {children}
              <MobileNav nav={DICT[lang].nav} />
            </CartProvider>
          </LoginModalProvider>
        </LangProvider>
      </body>
    </html>
  );
}
