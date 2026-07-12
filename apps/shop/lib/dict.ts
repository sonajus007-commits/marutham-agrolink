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
  catalogue: { title: string; sub: string; metaTitle: string; metaDesc: string; count: string; empty: string };
  product: {
    home: string;
    all: string;
    from: string;
    offers: string;
    offersSub: string;
    /* The grower is a district and nothing else until you sign in — say so, so
     * the missing name reads as a deliberate promise rather than missing data. */
    grower: string;
    privacy: string;
    perUnit: string;
    available: string;
    window: string;
    noOffers: string;
    noOffersSub: string;
    prices: string;
    pricesSub: string;
    district: string;
    price: string;
    notFound: string;
    notFoundSub: string;
    back: string;
    metaDesc: (name: string, price: string) => string;
  };
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
  catalogue: {
    title: 'All Produce',
    sub: 'Everything our farmers are growing — browse freely, no account needed.',
    metaTitle: 'All Produce — Marutham AgroLink',
    metaDesc:
      'Browse every fruit, vegetable and staple sold direct by Tamil Nadu farmers on Marutham AgroLink. ' +
      'Fair prices for farmers, fresh produce for families.',
    count: 'products',
    empty: 'No products available right now. Check back soon! 🌱',
  },
  product: {
    home: 'Home',
    all: 'All Produce',
    from: 'from',
    offers: "Today's Offers",
    offersSub: 'Growers selling this right now, cheapest first.',
    grower: 'Grower',
    privacy: 'Sign in to see who grows your food.',
    perUnit: 'per',
    available: 'available',
    window: 'Ready',
    noOffers: 'No grower is selling this today.',
    noOffersSub: 'Listings open each morning and close at the daily cutoff. Check back tomorrow. 🌱',
    prices: 'Market Price by District',
    pricesSub: "Today's reference price where we operate.",
    district: 'District',
    price: 'Price',
    notFound: 'We could not find that product.',
    notFoundSub: 'It may have been removed, or the link may be wrong.',
    back: 'Browse all produce',
    metaDesc: (name, price) =>
      `Buy ${name} direct from Tamil Nadu farmers${price ? ` from ${price}` : ''} on Marutham AgroLink. ` +
      'Fresh from the farm, fair prices for the grower.',
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
  catalogue: {
    title: 'அனைத்து பொருட்கள்',
    sub: 'எங்கள் விவசாயிகள் விளைவிக்கும் அனைத்தும் — கணக்கு தேவையில்லை, சுதந்திரமாகப் பாருங்கள்.',
    metaTitle: 'அனைத்து பொருட்கள் — மருதம் அக்ரோலிங்க்',
    metaDesc:
      'தமிழ்நாட்டு விவசாயிகள் நேரடியாக விற்கும் அனைத்து பழங்கள், காய்கறிகள் மற்றும் தானியங்களைப் பாருங்கள். ' +
      'விவசாயிகளுக்கு நியாயமான விலை, குடும்பங்களுக்கு புதிய காய்கறிகள்.',
    count: 'பொருட்கள்',
    empty: 'தற்போது பொருட்கள் எதுவும் இல்லை. விரைவில் மீண்டும் பாருங்கள்! 🌱',
  },
  product: {
    home: 'முகப்பு',
    all: 'அனைத்து பொருட்கள்',
    from: 'முதல்',
    offers: 'இன்றைய சலுகைகள்',
    offersSub: 'இப்போது இதை விற்கும் விவசாயிகள் — குறைந்த விலை முதலில்.',
    grower: 'விவசாயி',
    privacy: 'உங்கள் உணவை வளர்ப்பவரைப் பார்க்க உள்நுழையுங்கள்.',
    perUnit: 'ஒன்றுக்கு',
    available: 'கிடைக்கிறது',
    window: 'தயார்',
    noOffers: 'இன்று இதை யாரும் விற்கவில்லை.',
    noOffersSub: 'ஒவ்வொரு காலையிலும் பட்டியல் திறக்கப்பட்டு, தினசரி நேரத்தில் மூடப்படும். நாளை மீண்டும் பாருங்கள். 🌱',
    prices: 'மாவட்ட வாரியான சந்தை விலை',
    pricesSub: 'நாங்கள் செயல்படும் இடங்களில் இன்றைய குறிப்பு விலை.',
    district: 'மாவட்டம்',
    price: 'விலை',
    notFound: 'அந்தப் பொருளைக் கண்டுபிடிக்க முடியவில்லை.',
    notFoundSub: 'அது நீக்கப்பட்டிருக்கலாம், அல்லது இணைப்பு தவறாக இருக்கலாம்.',
    back: 'அனைத்து பொருட்களையும் பார்க்க',
    metaDesc: (name, price) =>
      `${name} — தமிழ்நாட்டு விவசாயிகளிடமிருந்து நேரடியாக${price ? ` ${price} முதல்` : ''} மருதம் அக்ரோலிங்கில் வாங்குங்கள். ` +
      'வயலில் இருந்து புதிது, விவசாயிக்கு நியாயமான விலை.',
  },
};

export const DICT: Record<Lang, Dict> = { en, ta };
