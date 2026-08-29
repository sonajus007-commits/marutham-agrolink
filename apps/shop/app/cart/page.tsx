import type { Metadata } from 'next';
import { getLang } from '@/lib/lang';
import { DICT } from '@/lib/dict';
import { LANDING } from '@/lib/landing';
import { SiteHeader, SiteFooter } from '@/components/sections/Chrome';
import { CartView, type CartCopy } from '@/components/cart/CartView';

/* /cart — the public cart. The cart itself is client state (the shared
 * ma_cart_v2), so this page provides the chrome and bilingual copy and lets the
 * client CartView render the reactive contents. Not indexable — a cart is
 * personal and per-session. */
export const metadata: Metadata = {
  title: 'Your Cart — Marutham AgroLink',
  robots: { index: false, follow: false },
};

const COPY: Record<'en' | 'ta', { heading: string } & CartCopy> = {
  en: {
    heading: 'Your cart',
    title: 'Your cart',
    empty: 'Your cart is empty.',
    emptyCta: 'Browse fresh produce',
    remove: 'Remove',
    subtotal: 'Subtotal',
    subtotalNote: 'Delivery and any handling are added at checkout.',
    checkout: 'Proceed to checkout',
    keepShopping: 'Keep shopping',
    perUnit: 'per',
  },
  ta: {
    heading: 'உங்கள் கூடை',
    title: 'உங்கள் கூடை',
    empty: 'உங்கள் கூடை காலியாக உள்ளது.',
    emptyCta: 'புதிய பொருட்களைப் பாருங்கள்',
    remove: 'நீக்கு',
    subtotal: 'கூட்டுத்தொகை',
    subtotalNote: 'டெலிவரி மற்றும் கையாளுதல் கட்டணம் செக் அவுட்டில் சேர்க்கப்படும்.',
    checkout: 'செக் அவுட் செய்யுங்கள்',
    keepShopping: 'தொடர்ந்து வாங்குங்கள்',
    perUnit: 'ஒன்றுக்கு',
  },
};

export default async function CartPage() {
  const lang = await getLang();
  const t = DICT[lang];
  const c = COPY[lang];

  return (
    <>
      <SiteHeader t={t} lang={lang} />
      <main className="mx-auto max-w-5xl px-5 py-12">
        <h1 className="text-forest-900 text-3xl font-bold tracking-tight md:text-4xl">
          {c.heading}
        </h1>
        <CartView copy={c} />
      </main>
      <SiteFooter t={t} c={LANDING[lang]} />
    </>
  );
}
