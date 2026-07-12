/* Bilingual copy for the public marketplace, ported from frontend/home.html's
 * data-en / data-ta attributes.
 *
 * The shop does NOT use react-i18next: that is a client-side library, and this
 * page is a Server Component whose whole point is to arrive as finished HTML. So
 * the language is read from a cookie on the server and the right strings are
 * rendered — one language per response. A crawler gets real content, not a
 * hydration placeholder, and there is no duplicate copy in the markup. */

export const LANGS = ['en', 'ta'] as const;
export type Lang = (typeof LANGS)[number];
export const DEFAULT_LANG: Lang = 'en';
export const LANG_COOKIE = 'ma_lang'; // the SAME key the portal uses

export function isLang(v: unknown): v is Lang {
  return typeof v === 'string' && (LANGS as readonly string[]).includes(v);
}

export interface Dict {
  htmlLang: string;
  nav: { shop: string; about: string; stories: string; login: string; register: string };
  hero: { titleA: string; titleB: string; sub: string; ctaShop: string; ctaSell: string };
  fresh: { title: string; sub: string; empty: string; badge: string; order: string; viewAll: string; unavailable: string };
  stats: { sellers: string; customers: string; districts: string; states: string };
  founder: { title: string; heading: string; body: string; role: string };
  stories: { title: string; sub: string };
  footer: { tagline: string; rights: string };
}

const en: Dict = {
  htmlLang: 'en',
  nav: { shop: 'Shop', about: 'About', stories: 'Farmer Stories', login: 'Login', register: 'Register' },
  hero: {
    titleA: 'Fresh from our farms,',
    titleB: 'straight to your home',
    sub: 'Connecting local farmers of Pudukkottai directly with you — fair prices for farmers, fresh produce for families.',
    ctaShop: 'Shop Fresh Now',
    ctaSell: 'Become a Seller',
  },
  fresh: {
    title: 'Fresh Today',
    sub: 'Browse what our farmers harvested today — order requires a free account.',
    empty: 'No products available right now. Check back soon! 🌱',
    badge: 'Farm Fresh',
    order: 'Login to Order',
    viewAll: 'View All Products →',
    unavailable: 'Price on request',
  },
  stats: {
    sellers: 'Active Sellers',
    customers: 'Happy Customers',
    districts: 'Active Districts',
    states: 'Active States',
  },
  founder: {
    title: 'A Message from Our Founder',
    heading: 'Why we built Marutham AgroLink',
    body:
      'Our farmers grow the food that feeds Tamil Nadu, yet too little of what you pay ever reaches them. ' +
      'Marutham AgroLink removes the middle layers: the farmer names their price, you buy the same day it is ' +
      'harvested, and the money goes where the work was done.',
    role: 'Founder & Managing Director, Marutham AgroLink',
  },
  stories: { title: 'Farmer Stories', sub: 'Real farmers, real change' },
  footer: {
    tagline: 'Fair prices for farmers. Fresh produce for families.',
    rights: 'Marutham AgroLink. All rights reserved.',
  },
};

const ta: Dict = {
  htmlLang: 'ta',
  nav: { shop: 'கடை', about: 'எங்களை பற்றி', stories: 'விவசாயி கதைகள்', login: 'உள்நுழைய', register: 'பதிவு' },
  hero: {
    titleA: 'எங்கள் வயல்களில் இருந்து,',
    titleB: 'நேரடியாக உங்கள் வீட்டிற்கு',
    sub: 'புதுக்கோட்டை விவசாயிகளை உங்களுடன் நேரடியாக இணைக்கிறோம் — விவசாயிகளுக்கு நியாயமான விலை, குடும்பங்களுக்கு புதிய காய்கறிகள்.',
    ctaShop: 'இப்போது வாங்குங்கள்',
    ctaSell: 'விற்பனையாளராகுங்கள்',
  },
  fresh: {
    title: 'இன்றைய புதிய பொருட்கள்',
    sub: 'எங்கள் விவசாயிகள் இன்று அறுவடை செய்ததைப் பாருங்கள் — ஆர்டர் செய்ய இலவசக் கணக்கு தேவை.',
    empty: 'தற்போது பொருட்கள் எதுவும் இல்லை. விரைவில் மீண்டும் பாருங்கள்! 🌱',
    badge: 'வயல் புதிது',
    order: 'ஆர்டர் செய்ய உள்நுழைய',
    viewAll: 'அனைத்தையும் பார்க்க →',
    unavailable: 'விலை கோரிக்கையின் பேரில்',
  },
  stats: {
    sellers: 'செயலில் உள்ள விற்பனையாளர்கள்',
    customers: 'மகிழ்ச்சியான வாடிக்கையாளர்கள்',
    districts: 'செயலில் உள்ள மாவட்டங்கள்',
    states: 'செயலில் உள்ள மாநிலங்கள்',
  },
  founder: {
    title: 'எங்கள் நிறுவனரின் செய்தி',
    heading: 'நாங்கள் ஏன் மருதம் அக்ரோலிங்க் உருவாக்கினோம்',
    body:
      'தமிழ்நாட்டிற்கு உணவளிக்கும் விவசாயிகளுக்கு, நீங்கள் செலுத்தும் தொகையில் மிகக் குறைவே சென்றடைகிறது. ' +
      'மருதம் அக்ரோலிங்க் இடைத்தரகர்களை நீக்குகிறது: விவசாயி விலையை நிர்ணயிக்கிறார், அறுவடை செய்த அன்றே ' +
      'நீங்கள் வாங்குகிறீர்கள், பணம் உழைத்தவரையே சேர்கிறது.',
    role: 'நிறுவனர் & நிர்வாக இயக்குநர், மருதம் அக்ரோலிங்க்',
  },
  stories: { title: 'விவசாயி கதைகள்', sub: 'உண்மையான விவசாயிகள், உண்மையான மாற்றம்' },
  footer: {
    tagline: 'விவசாயிகளுக்கு நியாயமான விலை. குடும்பங்களுக்கு புதிய காய்கறிகள்.',
    rights: 'மருதம் அக்ரோலிங்க். அனைத்து உரிமைகளும் பாதுகாக்கப்பட்டவை.',
  },
};

export const DICT: Record<Lang, Dict> = { en, ta };
