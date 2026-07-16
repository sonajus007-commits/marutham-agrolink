import type { Lang } from './dict';

/* Every string on the landing page, in both languages.
 *
 * Kept apart from dict.ts, which holds the copy the older shop pages already
 * share (nav, product cards, catalogue). This file is the landing page's own
 * copy and nothing else reads it.
 *
 * ── ON THE TAMIL ─────────────────────────────────────────────────────────────
 * Written to be read aloud, not transliterated. Where a word is genuinely used
 * in Tamil as-is by the people this is for — ஆர்டர், டெலிவரி, UPI — it stays,
 * because inventing a "purer" word for a thing nobody calls that is worse than
 * the loan word. Where a real Tamil term exists and is understood — இடைத்தரகர்
 * for middleman, அறுவடை for harvest, மாவட்டம் for district — it is used.
 *
 * NEEDS A NATIVE REVIEW BEFORE THIS GOES PUBLIC. It is careful, but it is a real
 * business's public voice and it should be read by someone whose Tamil is their
 * own. The English is the source; the Tamil is a translation of it.
 * ──────────────────────────────────────────────────────────────────────────── */

interface Step {
  t: string;
  d: string;
}
interface Item {
  t: string;
  d: string;
}
interface QA {
  q: string;
  a: string;
}

export interface LandingCopy {
  hero: {
    badge: string;
    titleA: string;
    titleB: string;
    sub: string;
    ctaShop: string;
    ctaSell: string;
    trust: [string, string, string];
  };
  why: { eyebrow: string; title: string; lede: string; items: Item[] };
  eco: { eyebrow: string; title: string; lede: string; items: Item[] };
  farmer: { eyebrow: string; title: string; lede: string; steps: Step[]; cta: string };
  consumer: { eyebrow: string; title: string; lede: string; steps: Step[]; cta: string };
  business: { eyebrow: string; title: string; lede: string; items: Item[]; cta: string };
  mobile: { eyebrow: string; title: string; lede: string; items: Item[] };
  stats: {
    eyebrow: string;
    title: string;
    lede: string;
    sellers: string;
    sellersHint: string;
    customers: string;
    customersHint: string;
    districts: string;
    districtsHint: string;
    states: string;
    statesHint: string;
  };
  testimonials: {
    eyebrow: string;
    title: string;
    lede: string;
    pendingT: string;
    pendingD: string;
  };
  sustainability: { eyebrow: string; title: string; lede: string; items: Item[] };
  marketplace: { eyebrow: string; title: string; items: Item[] };
  pricing: {
    eyebrow: string;
    title: string;
    lede: string;
    pendingT: string;
    pendingD: string;
    cta: string;
  };
  faq: { eyebrow: string; title: string; qa: QA[] };
  updates: { eyebrow: string; title: string; lede: string; pendingT: string; pendingD: string };
  download: { eyebrow: string; title: string; lede: string; pendingT: string; pendingD: string };
  contact: {
    eyebrow: string;
    title: string;
    lede: string;
    phone: string;
    email: string;
    pending: string;
  };
  footer: { marketplace: string; farmers: string; company: string; links: Record<string, string> };
  imageSlot: { label: string };
}

const en: LandingCopy = {
  hero: {
    badge: 'Farm to home, across Tamil Nadu',
    titleA: 'Fresh from the farmer.',
    titleB: 'Direct to your door.',
    sub: 'The farmer names their price. You buy the same day it is harvested. Nothing in between, and every step is tracked.',
    ctaShop: 'Browse today’s produce',
    ctaSell: 'Sell with us',
    trust: ['No middlemen', 'Scanned at every stage', 'Same-morning harvest'],
  },
  why: {
    eyebrow: 'Why Marutham',
    title: 'Built to move value back to the farm',
    lede: 'Most of what you pay for food never reaches the person who grew it. This platform exists to change where the money stops.',
    items: [
      {
        t: 'The farmer sets the price',
        d: 'Growers list their own rate. The platform fee is added on top of what they asked for — it is never taken out of their share.',
      },
      {
        t: 'Harvested the same morning',
        d: 'Listings carry a cutoff time. Once it passes, the produce comes off the shop rather than sitting in a warehouse.',
      },
      {
        t: 'One short hop',
        d: 'Farm to village collection to hub to your door. Every handover is a person we can name, not a link in an anonymous chain.',
      },
      {
        t: 'Tracked, not promised',
        d: 'Each stage is scanned as it happens. The status you see is the state of your order, not an estimate.',
      },
    ],
  },
  eco: {
    eyebrow: 'Platform ecosystem',
    title: 'One platform, six kinds of people',
    lede: 'Each role has its own surface and its own permissions — and all of them read from a single source of truth.',
    items: [
      {
        t: 'Farmers',
        d: 'List produce, set a price, confirm what is available today, and see the payout for every order.',
      },
      {
        t: 'Consumers',
        d: 'Browse what is fresh in your district, order, and follow it to your door.',
      },
      {
        t: 'Village Collection',
        d: 'Officers collect from farms on a route, weigh what arrives, and hand it to the hub.',
      },
      {
        t: 'Delivery Partners',
        d: 'Take the day’s dispatch, scan each drop, and capture proof of delivery on the spot.',
      },
      {
        t: 'Businesses',
        d: 'Retailers and bulk buyers sell and source on the same rails, on their own fee terms.',
      },
      {
        t: 'Operations & Leadership',
        d: 'Live dashboards for hubs, districts and the board — built on the same data, not a copy of it.',
      },
    ],
  },
  farmer: {
    eyebrow: 'For farmers',
    title: 'Five steps from your field to their table',
    lede: 'No auction, no commission agent, no waiting to find out what you earned.',
    steps: [
      {
        t: 'List your produce',
        d: 'Add what you have, the quantity, and the price you want for it.',
      },
      { t: 'We review it', d: 'A quick check by the team, then it is live in your district.' },
      {
        t: 'Confirm this morning',
        d: 'Say what is actually available today and set the cutoff. After that, it comes off the shop.',
      },
      { t: 'We collect', d: 'A collection officer picks up on their route and weighs it in.' },
      {
        t: 'You are paid',
        d: 'Your payout is your price times the quantity sold. The fee sits on top, not inside it.',
      },
    ],
    cta: 'Start selling',
  },
  consumer: {
    eyebrow: 'For consumers',
    title: 'Know who grew it, and when',
    lede: 'Not “fresh” as a slogan. Fresh as a cutoff time you can read on the listing.',
    steps: [
      { t: 'See your district', d: 'Only what growers near you have confirmed for today.' },
      { t: 'Order in a minute', d: 'Add to the basket and check out. UPI or cash on delivery.' },
      {
        t: 'Follow it live',
        d: 'Collection, hub, dispatch, doorstep — each one scanned as it happens.',
      },
      { t: 'Rate the grower', d: 'Your rating goes to the farmer who grew it, by name.' },
    ],
    cta: 'Browse produce',
  },
  business: {
    eyebrow: 'For businesses',
    title: 'Sell at scale on the same rails',
    lede: 'Retailers, traders and bulk buyers work the platform the growers do — with terms that fit the volume.',
    items: [
      {
        t: 'Bulk listings',
        d: 'List larger quantities with your own bulk pricing and discount bands.',
      },
      {
        t: 'Your own fee terms',
        d: 'Retailers and farmers carry different platform fees. The rate you see is the rate you get.',
      },
      {
        t: 'A verified identity',
        d: 'Business accounts are approved by the team, with GST and bank details on file.',
      },
    ],
    cta: 'Register a business',
  },
  mobile: {
    eyebrow: 'On your phone',
    title: 'Built for a field with no signal',
    lede: 'Collection officers and delivery partners work where the network does not. So the app keeps working, and catches up when it can.',
    items: [
      {
        t: 'Works offline',
        d: 'Scans and updates made without signal are queued and replayed on reconnect.',
      },
      { t: 'Installs from the browser', d: 'Add it to your home screen today — no store needed.' },
      {
        t: 'Location where it matters',
        d: 'Proof of delivery and farm pins are captured on the spot.',
      },
    ],
  },
  stats: {
    eyebrow: 'Where we are',
    title: 'Small numbers, honestly reported',
    lede: 'These are live counts from the platform, not projections. They will grow, and this page will say so when they do.',
    sellers: 'Growers & sellers',
    sellersHint: 'Active on the platform',
    customers: 'Families buying',
    customersHint: 'Active consumers',
    districts: 'Districts',
    districtsHint: 'Where we operate',
    states: 'States',
    statesHint: 'And counting',
  },
  testimonials: {
    eyebrow: 'Testimonials',
    title: 'What growers and families say',
    lede: 'Real names, real districts, with permission — once we have collected them.',
    pendingT: 'No testimonials yet',
    pendingD:
      'This section stays empty until real customers and growers have given quotes we are allowed to publish. Writing placeholder testimonials would mean inventing people, so we have not.',
  },
  sustainability: {
    eyebrow: 'Sustainability',
    title: 'A shorter road from soil to kitchen',
    lede: 'Fewer stops means less handling and less waste. We would rather show you the route than quote a number we have not measured.',
    items: [
      {
        t: 'Harvest to order',
        d: 'Growers confirm what is available that morning, so less is picked than never sells.',
      },
      {
        t: 'Sold where it grows',
        d: 'You see your own district first. Most produce travels a short way.',
      },
      {
        t: 'The grower is named',
        d: 'Every order traces to the person who grew it — the shortest kind of accountability.',
      },
    ],
  },
  marketplace: {
    eyebrow: 'Marketplace',
    title: 'The parts that make it a market, not a catalogue',
    items: [
      {
        t: 'District pricing',
        d: 'Every product carries its own price per district, kept beside the government mandi rate.',
      },
      {
        t: 'Ratings that reach a person',
        d: 'You rate the grower, not a warehouse. It shows on their dashboard.',
      },
      {
        t: 'Returns with a photo',
        d: 'Raise a return with an image; it is reviewed and refunded against the order.',
      },
      {
        t: 'Bulk discounts',
        d: 'Growers can set a quantity band and a discount for buying more of it.',
      },
    ],
  },
  pricing: {
    eyebrow: 'Pricing',
    title: 'What it costs',
    lede: 'Buying is free. Selling carries a platform fee that sits on top of the farmer’s price, never inside it.',
    pendingT: 'Seller plans are not published yet',
    pendingD:
      'The fee a seller pays depends on their seller type, and the subscription plans live behind the portal today. Once the public plan structure is agreed, it belongs here — as the real numbers, not example tiers.',
    cta: 'Ask us about selling',
  },
  faq: {
    eyebrow: 'FAQ',
    title: 'Questions people actually ask',
    qa: [
      {
        q: 'Who decides the price?',
        a: 'The farmer does. They list the rate they want. The platform fee is added on top of it for the buyer — it is not deducted from the grower’s share.',
      },
      {
        q: 'How fresh is “fresh”?',
        a: 'Each listing carries a cutoff time set by the grower that morning. Once the cutoff passes, the listing comes off the shop automatically.',
      },
      {
        q: 'Do I need an account to look?',
        a: 'No. The whole catalogue and every product page is public. You only sign in to place an order.',
      },
      {
        q: 'How do I pay?',
        a: 'UPI or cash on delivery, whichever you prefer, chosen at checkout.',
      },
      {
        q: 'Can I see where my order is?',
        a: 'Yes. Each stage — collection, hub, dispatch, delivery — is scanned by the person doing it, so the status is the real state of your order.',
      },
      {
        q: 'What if something is wrong with it?',
        a: 'Raise a return from the order with a photo. It is reviewed and refunded against that order.',
      },
      {
        q: 'Which areas do you cover?',
        a: 'We are live in Tamil Nadu and growing district by district. The shop shows you what is available where you are.',
      },
    ],
  },
  updates: {
    eyebrow: 'Latest updates',
    title: 'News from the platform',
    lede: 'Harvest notes, new districts, and what we shipped.',
    pendingT: 'Nothing published yet',
    pendingD:
      'There is no posts source behind this section — no CMS and no blog. It fills the day there is one. Until then it stays empty rather than showing sample articles.',
  },
  download: {
    eyebrow: 'Mobile',
    title: 'The app is being tested',
    lede: 'The Android build is signed and running. It is not on the Play Store yet, so there is nothing honest to link to — you can install the site as an app in the meantime.',
    pendingT: 'No store listing yet',
    pendingD:
      'The APK builds and passes signature verification, but it has no distribution channel. A download button would point at nothing, so this waits for a Play Store listing or a hosted release.',
  },
  contact: {
    eyebrow: 'Contact',
    title: 'Talk to a person',
    lede: 'Questions about selling, an order, or a partnership — there is someone at the other end.',
    phone: 'Support line',
    email: 'Email',
    pending: 'To be published',
  },
  footer: {
    marketplace: 'Marketplace',
    farmers: 'For farmers',
    company: 'Company',
    links: {
      all: 'All produce',
      how: 'How the market works',
      pricing: 'Pricing',
      selling: 'Selling with us',
      business: 'For businesses',
      questions: 'Questions',
      why: 'Why Marutham',
      sustainability: 'Sustainability',
      contact: 'Contact',
    },
  },
  imageSlot: { label: 'Image placeholder' },
};

const ta: LandingCopy = {
  hero: {
    badge: 'பண்ணையிலிருந்து வீடு வரை, தமிழ்நாடு முழுவதும்',
    titleA: 'விவசாயியிடமிருந்து நேரடியாக.',
    titleB: 'உங்கள் வீட்டு வாசலுக்கு.',
    sub: 'விலையை விவசாயியே நிர்ணயிக்கிறார். அறுவடை செய்த அன்றே நீங்கள் வாங்குகிறீர்கள். இடையில் யாருமில்லை; ஒவ்வொரு நிலையும் கண்காணிக்கப்படுகிறது.',
    ctaShop: 'இன்றைய விளைபொருட்களைப் பாருங்கள்',
    ctaSell: 'எங்களுடன் விற்கவும்',
    trust: ['இடைத்தரகர்கள் இல்லை', 'ஒவ்வொரு நிலையிலும் ஸ்கேன்', 'அன்று காலை அறுவடை'],
  },
  why: {
    eyebrow: 'ஏன் மருதம்',
    title: 'பணம் மீண்டும் பண்ணைக்குச் செல்ல வேண்டும்',
    lede: 'உணவுக்கு நீங்கள் செலுத்தும் தொகையில் பெரும்பகுதி, அதை விளைவித்தவரை சென்றடைவதில்லை. அந்தப் பணம் எங்கே நிற்கிறது என்பதை மாற்றவே இந்தத் தளம்.',
    items: [
      {
        t: 'விலையை விவசாயியே நிர்ணயிக்கிறார்',
        d: 'விவசாயிகள் தங்கள் விலையையே பட்டியலிடுகிறார்கள். தளக் கட்டணம் அவர்கள் கேட்ட விலையின் மேல் சேர்க்கப்படுகிறது — அவர்களின் பங்கிலிருந்து ஒருபோதும் எடுக்கப்படுவதில்லை.',
      },
      {
        t: 'அன்று காலை அறுவடை',
        d: 'ஒவ்வொரு பட்டியலுக்கும் ஒரு நேர வரம்பு உண்டு. அது முடிந்ததும், அந்தப் பொருள் கிடங்கில் தங்காமல் கடையிலிருந்து நீக்கப்படுகிறது.',
      },
      {
        t: 'ஒரே ஒரு குறுகிய பயணம்',
        d: 'பண்ணை, கிராம சேகரிப்பு, மையம், உங்கள் வாசல். ஒவ்வொரு கைமாற்றமும் பெயர் சொல்லக்கூடிய ஒரு மனிதர் — அடையாளமற்ற சங்கிலியின் கண்ணி அல்ல.',
      },
      {
        t: 'வாக்குறுதி அல்ல, கண்காணிப்பு',
        d: 'ஒவ்வொரு நிலையும் நடக்கும்போதே ஸ்கேன் செய்யப்படுகிறது. நீங்கள் பார்ப்பது உங்கள் ஆர்டரின் உண்மை நிலை; மதிப்பீடு அல்ல.',
      },
    ],
  },
  eco: {
    eyebrow: 'தளச் சூழல்',
    title: 'ஒரு தளம், ஆறு வகை மனிதர்கள்',
    lede: 'ஒவ்வொரு பணிக்கும் தனித் திரையும் தனி அனுமதியும் உண்டு — ஆனால் அனைவரும் ஒரே தரவிலிருந்தே படிக்கிறார்கள்.',
    items: [
      {
        t: 'விவசாயிகள்',
        d: 'விளைபொருளைப் பட்டியலிடுங்கள், விலையை நிர்ணயியுங்கள், இன்று உள்ளதை உறுதி செய்யுங்கள், ஒவ்வொரு ஆர்டருக்கான தொகையையும் பாருங்கள்.',
      },
      {
        t: 'நுகர்வோர்',
        d: 'உங்கள் மாவட்டத்தில் புதிதாக என்ன உள்ளது எனப் பாருங்கள், ஆர்டர் செய்யுங்கள், வாசல் வரை பின்தொடருங்கள்.',
      },
      {
        t: 'கிராம சேகரிப்பு',
        d: 'அலுவலர்கள் வழித்தடத்தில் பண்ணைகளிலிருந்து சேகரித்து, எடை பார்த்து, மையத்திடம் ஒப்படைக்கிறார்கள்.',
      },
      {
        t: 'விநியோகப் பங்குதாரர்கள்',
        d: 'அன்றைய அனுப்புதலை எடுத்து, ஒவ்வொரு டெலிவரியையும் ஸ்கேன் செய்து, அங்கேயே சான்று பதிவு செய்கிறார்கள்.',
      },
      {
        t: 'வணிகங்கள்',
        d: 'சில்லறை விற்பனையாளர்களும் மொத்த வாங்குபவர்களும் இதே தளத்தில், தங்கள் கட்டண விதிகளின்படி வணிகம் செய்கிறார்கள்.',
      },
      {
        t: 'செயல்பாடு & தலைமை',
        d: 'மையங்கள், மாவட்டங்கள், இயக்குநர் குழு — அனைத்திற்கும் நேரடி டாஷ்போர்டுகள். நகலெடுத்த தரவு அல்ல, அதே தரவு.',
      },
    ],
  },
  farmer: {
    eyebrow: 'விவசாயிகளுக்கு',
    title: 'உங்கள் வயலிலிருந்து அவர்கள் தட்டுக்கு — ஐந்து படிகள்',
    lede: 'ஏலம் இல்லை, கமிஷன் தரகர் இல்லை, எவ்வளவு சம்பாதித்தோம் என்று தெரிய காத்திருப்பதும் இல்லை.',
    steps: [
      {
        t: 'உங்கள் விளைபொருளைப் பட்டியலிடுங்கள்',
        d: 'உங்களிடம் உள்ளது என்ன, எவ்வளவு, என்ன விலை வேண்டும் — சேர்த்துவிடுங்கள்.',
      },
      {
        t: 'நாங்கள் பரிசீலிக்கிறோம்',
        d: 'குழுவின் விரைவான சரிபார்ப்பு; பிறகு உங்கள் மாவட்டத்தில் அது நேரலையில்.',
      },
      {
        t: 'இன்று காலை உறுதி செய்யுங்கள்',
        d: 'இன்று உண்மையில் என்ன இருக்கிறது எனச் சொல்லி, நேர வரம்பை அமையுங்கள். அதன் பிறகு அது கடையிலிருந்து நீங்கும்.',
      },
      {
        t: 'நாங்கள் சேகரிக்கிறோம்',
        d: 'சேகரிப்பு அலுவலர் தன் வழித்தடத்தில் வந்து எடுத்து, எடை பதிவு செய்கிறார்.',
      },
      {
        t: 'உங்களுக்குப் பணம்',
        d: 'உங்கள் விலை × விற்ற அளவு — அதுவே உங்கள் தொகை. கட்டணம் அதன் மேல்; உள்ளே அல்ல.',
      },
    ],
    cta: 'விற்பனையைத் தொடங்குங்கள்',
  },
  consumer: {
    eyebrow: 'நுகர்வோருக்கு',
    title: 'யார் விளைவித்தார், எப்போது — தெரிந்தே வாங்குங்கள்',
    lede: '“புதிது” என்பது ஒரு விளம்பர வாசகம் அல்ல. பட்டியலில் நீங்களே படிக்கக்கூடிய நேர வரம்பு.',
    steps: [
      {
        t: 'உங்கள் மாவட்டத்தைப் பாருங்கள்',
        d: 'உங்களுக்கு அருகில் உள்ள விவசாயிகள் இன்று உறுதி செய்ததை மட்டும்.',
      },
      {
        t: 'ஒரு நிமிடத்தில் ஆர்டர்',
        d: 'கூடையில் சேர்த்து முடித்துவிடுங்கள். UPI அல்லது டெலிவரியின்போது பணம்.',
      },
      {
        t: 'நேரலையில் பின்தொடருங்கள்',
        d: 'சேகரிப்பு, மையம், அனுப்புதல், வாசல் — ஒவ்வொன்றும் நடக்கும்போதே ஸ்கேன்.',
      },
      {
        t: 'விவசாயிக்கு மதிப்பீடு',
        d: 'உங்கள் மதிப்பீடு, அதை விளைவித்த விவசாயியை அவர் பெயரோடு சென்றடைகிறது.',
      },
    ],
    cta: 'விளைபொருட்களைப் பாருங்கள்',
  },
  business: {
    eyebrow: 'வணிகங்களுக்கு',
    title: 'இதே தளத்தில் பெரிய அளவில் விற்கலாம்',
    lede: 'சில்லறை விற்பனையாளர்கள், வியாபாரிகள், மொத்த வாங்குபவர்கள் — விவசாயிகள் பயன்படுத்தும் அதே தளம், அளவுக்கு ஏற்ற விதிகளுடன்.',
    items: [
      {
        t: 'மொத்தப் பட்டியல்',
        d: 'பெரிய அளவுகளை உங்கள் சொந்த மொத்த விலை மற்றும் தள்ளுபடி வரம்புகளுடன் பட்டியலிடுங்கள்.',
      },
      {
        t: 'உங்கள் சொந்தக் கட்டண விதிகள்',
        d: 'சில்லறை விற்பனையாளருக்கும் விவசாயிக்கும் தளக் கட்டணம் வேறுபடும். நீங்கள் பார்க்கும் விகிதமே உங்களுக்குக் கிடைக்கும்.',
      },
      {
        t: 'சரிபார்க்கப்பட்ட அடையாளம்',
        d: 'வணிகக் கணக்குகள் குழுவால் அங்கீகரிக்கப்படுகின்றன — GST மற்றும் வங்கி விவரங்களுடன்.',
      },
    ],
    cta: 'வணிகமாகப் பதிவு செய்யுங்கள்',
  },
  mobile: {
    eyebrow: 'உங்கள் கைபேசியில்',
    title: 'சிக்னல் இல்லாத வயலுக்கும் ஏற்றது',
    lede: 'சேகரிப்பு அலுவலர்களும் விநியோகப் பங்குதாரர்களும் நெட்வொர்க் இல்லாத இடங்களில் வேலை செய்கிறார்கள். எனவே செயலி வேலை செய்துகொண்டே இருக்கும்; இணைப்பு வந்ததும் தானாகவே சரிசெய்யும்.',
    items: [
      {
        t: 'இணையம் இல்லாமலும் வேலை செய்யும்',
        d: 'சிக்னல் இல்லாமல் செய்த ஸ்கேன்களும் மாற்றங்களும் சேமிக்கப்பட்டு, மீண்டும் இணைந்ததும் அனுப்பப்படும்.',
      },
      {
        t: 'உலாவியிலிருந்தே நிறுவலாம்',
        d: 'இன்றே முகப்புத் திரையில் சேர்த்துக்கொள்ளுங்கள் — ஸ்டோர் தேவையில்லை.',
      },
      {
        t: 'தேவையான இடத்தில் இருப்பிடம்',
        d: 'டெலிவரி சான்றும் பண்ணை இருப்பிடமும் அந்த இடத்திலேயே பதிவாகின்றன.',
      },
    ],
  },
  stats: {
    eyebrow: 'நாங்கள் இப்போது எங்கே',
    title: 'சிறிய எண்கள், நேர்மையாக',
    lede: 'இவை தளத்திலிருந்து நேரடியாக வரும் எண்கள்; கணிப்புகள் அல்ல. இவை வளரும் — வளரும்போது இந்தப் பக்கமே அதைச் சொல்லும்.',
    sellers: 'விவசாயிகள் & விற்பனையாளர்கள்',
    sellersHint: 'தளத்தில் செயலில்',
    customers: 'வாங்கும் குடும்பங்கள்',
    customersHint: 'செயலில் உள்ள நுகர்வோர்',
    districts: 'மாவட்டங்கள்',
    districtsHint: 'நாங்கள் இயங்கும் இடங்கள்',
    states: 'மாநிலங்கள்',
    statesHint: 'மேலும் வளர்கிறது',
  },
  testimonials: {
    eyebrow: 'கருத்துகள்',
    title: 'விவசாயிகளும் குடும்பங்களும் சொல்வது',
    lede: 'உண்மையான பெயர்கள், உண்மையான மாவட்டங்கள், அனுமதியுடன் — சேகரித்த பிறகு.',
    pendingT: 'இன்னும் கருத்துகள் இல்லை',
    pendingD:
      'வெளியிட அனுமதி பெற்ற உண்மையான கருத்துகள் கிடைக்கும் வரை இந்தப் பகுதி காலியாகவே இருக்கும். மாதிரிக் கருத்துகள் எழுதுவது என்பது இல்லாத மனிதர்களை உருவாக்குவது — அதை நாங்கள் செய்யவில்லை.',
  },
  sustainability: {
    eyebrow: 'நிலைத்தன்மை',
    title: 'மண்ணிலிருந்து சமையலறைக்கு — குறுகிய பாதை',
    lede: 'நிறுத்தங்கள் குறைவு என்றால் கையாளுதலும் விரயமும் குறைவு. அளக்காத எண்ணைச் சொல்வதைவிட, பாதையைக் காட்டுவதே சிறந்தது என நினைக்கிறோம்.',
    items: [
      {
        t: 'ஆர்டருக்கு ஏற்ற அறுவடை',
        d: 'அன்று காலை என்ன இருக்கிறது என்பதை விவசாயிகள் உறுதி செய்கிறார்கள் — விற்காமல் போவது குறைகிறது.',
      },
      {
        t: 'விளைந்த இடத்திலேயே விற்பனை',
        d: 'உங்கள் மாவட்டமே முதலில் தெரியும். பெரும்பாலான பொருட்கள் குறைந்த தூரமே பயணிக்கின்றன.',
      },
      {
        t: 'விவசாயியின் பெயர் தெரியும்',
        d: 'ஒவ்வொரு ஆர்டரும் அதை விளைவித்தவரைச் சென்றடைகிறது — இதுவே மிகக் குறுகிய பொறுப்புணர்வு.',
      },
    ],
  },
  marketplace: {
    eyebrow: 'சந்தை',
    title: 'இதை ஒரு பட்டியலாக அல்ல, சந்தையாக ஆக்கும் அம்சங்கள்',
    items: [
      {
        t: 'மாவட்ட வாரி விலை',
        d: 'ஒவ்வொரு பொருளுக்கும் மாவட்டவாரி விலை உண்டு — அரசு சந்தை விலையுடன் சேர்த்தே காட்டப்படுகிறது.',
      },
      {
        t: 'ஒரு மனிதரைச் சென்றடையும் மதிப்பீடு',
        d: 'நீங்கள் மதிப்பிடுவது கிடங்கை அல்ல, விவசாயியை. அது அவர் டாஷ்போர்டில் தெரியும்.',
      },
      {
        t: 'படத்துடன் திருப்பி அனுப்புதல்',
        d: 'படத்துடன் கோரிக்கை வையுங்கள்; பரிசீலித்து அந்த ஆர்டருக்கே பணம் திரும்பும்.',
      },
      {
        t: 'மொத்த தள்ளுபடி',
        d: 'அதிகம் வாங்கினால் தள்ளுபடி — அளவையும் தள்ளுபடியையும் விவசாயியே நிர்ணயிக்கலாம்.',
      },
    ],
  },
  pricing: {
    eyebrow: 'கட்டணம்',
    title: 'செலவு என்ன',
    lede: 'வாங்குவது இலவசம். விற்பனைக்கு ஒரு தளக் கட்டணம் உண்டு — அது விவசாயியின் விலையின் மேல்; உள்ளே ஒருபோதும் இல்லை.',
    pendingT: 'விற்பனையாளர் திட்டங்கள் இன்னும் வெளியிடப்படவில்லை',
    pendingD:
      'விற்பனையாளர் செலுத்தும் கட்டணம் அவரது வகையைப் பொறுத்தது; திட்டங்கள் தற்போது போர்ட்டலுக்குள் உள்ளன. பொதுத் திட்ட அமைப்பு முடிவானதும் அது இங்கே வரும் — மாதிரி எண்களாக அல்ல, உண்மையான எண்களாக.',
    cta: 'விற்பனை பற்றி கேளுங்கள்',
  },
  faq: {
    eyebrow: 'கேள்விகள்',
    title: 'மக்கள் உண்மையில் கேட்கும் கேள்விகள்',
    qa: [
      {
        q: 'விலையை யார் முடிவு செய்கிறார்?',
        a: 'விவசாயியே. அவர் விரும்பும் விலையைப் பட்டியலிடுகிறார். வாங்குபவருக்கு தளக் கட்டணம் அதன் மேல் சேர்க்கப்படுகிறது — விவசாயியின் பங்கிலிருந்து கழிக்கப்படுவதில்லை.',
      },
      {
        q: '“புதிது” என்றால் எவ்வளவு புதிது?',
        a: 'ஒவ்வொரு பட்டியலுக்கும் அன்று காலை விவசாயி நிர்ணயித்த நேர வரம்பு உண்டு. அது முடிந்ததும் பட்டியல் தானாகவே கடையிலிருந்து நீங்கும்.',
      },
      {
        q: 'பார்க்க கணக்கு தேவையா?',
        a: 'இல்லை. முழுப் பட்டியலும் ஒவ்வொரு பொருள் பக்கமும் பொதுவானவை. ஆர்டர் செய்யும்போது மட்டுமே உள்நுழைய வேண்டும்.',
      },
      {
        q: 'எப்படிப் பணம் செலுத்துவது?',
        a: 'UPI அல்லது டெலிவரியின்போது பணம் — உங்கள் விருப்பப்படி, ஆர்டர் முடிக்கும்போது தேர்வு செய்யலாம்.',
      },
      {
        q: 'என் ஆர்டர் எங்கே இருக்கிறது எனப் பார்க்கலாமா?',
        a: 'ஆம். சேகரிப்பு, மையம், அனுப்புதல், டெலிவரி — ஒவ்வொரு நிலையையும் அதைச் செய்பவரே ஸ்கேன் செய்கிறார். எனவே நிலை என்பது உங்கள் ஆர்டரின் உண்மை நிலை.',
      },
      {
        q: 'பொருளில் ஏதேனும் பிரச்சினை என்றால்?',
        a: 'ஆர்டரிலிருந்தே படத்துடன் கோரிக்கை வையுங்கள். பரிசீலித்து அந்த ஆர்டருக்கே பணம் திரும்பும்.',
      },
      {
        q: 'எந்தப் பகுதிகளில் சேவை உள்ளது?',
        a: 'தமிழ்நாட்டில் இயங்குகிறோம், மாவட்டம் மாவட்டமாக வளர்ந்து வருகிறோம். நீங்கள் இருக்கும் இடத்தில் என்ன கிடைக்கும் என்பதைக் கடையே காட்டும்.',
      },
    ],
  },
  updates: {
    eyebrow: 'சமீபத்திய தகவல்கள்',
    title: 'தளத்திலிருந்து செய்திகள்',
    lede: 'அறுவடைக் குறிப்புகள், புதிய மாவட்டங்கள், நாங்கள் வெளியிட்டவை.',
    pendingT: 'இன்னும் எதுவும் வெளியிடப்படவில்லை',
    pendingD:
      'இந்தப் பகுதிக்குப் பின்னால் தகவல் ஆதாரம் எதுவும் இல்லை — CMS இல்லை, வலைப்பதிவும் இல்லை. ஒன்று வந்ததும் இது நிரம்பும். அதுவரை மாதிரிக் கட்டுரைகளைக் காட்டாமல் காலியாகவே இருக்கும்.',
  },
  download: {
    eyebrow: 'கைபேசி',
    title: 'செயலி சோதனையில் உள்ளது',
    lede: 'Android பதிப்பு கையொப்பமிடப்பட்டு இயங்குகிறது. இன்னும் Play Store-இல் இல்லை; எனவே நேர்மையாக இணைக்க எதுவும் இல்லை. அதுவரை இந்த தளத்தையே செயலியாக நிறுவிக்கொள்ளலாம்.',
    pendingT: 'இன்னும் ஸ்டோர் பட்டியல் இல்லை',
    pendingD:
      'APK உருவாகி கையொப்பச் சரிபார்ப்பிலும் தேர்ச்சி பெறுகிறது; ஆனால் அதற்கு விநியோக வழி இல்லை. பதிவிறக்க பொத்தான் எதையும் சுட்டாது — எனவே Play Store பட்டியல் அல்லது ஒரு வெளியீடு வரும்வரை இது காத்திருக்கிறது.',
  },
  contact: {
    eyebrow: 'தொடர்பு',
    title: 'ஒரு மனிதரிடம் பேசுங்கள்',
    lede: 'விற்பனை, ஆர்டர், அல்லது கூட்டாண்மை பற்றிய கேள்விகள் — மறுமுனையில் ஒருவர் இருக்கிறார்.',
    phone: 'உதவி எண்',
    email: 'மின்னஞ்சல்',
    pending: 'விரைவில் வெளியிடப்படும்',
  },
  footer: {
    marketplace: 'சந்தை',
    farmers: 'விவசாயிகளுக்கு',
    company: 'நிறுவனம்',
    links: {
      all: 'அனைத்து விளைபொருட்கள்',
      how: 'சந்தை எப்படி இயங்குகிறது',
      pricing: 'கட்டணம்',
      selling: 'எங்களுடன் விற்பது',
      business: 'வணிகங்களுக்கு',
      questions: 'கேள்விகள்',
      why: 'ஏன் மருதம்',
      sustainability: 'நிலைத்தன்மை',
      contact: 'தொடர்பு',
    },
  },
  imageSlot: { label: 'பட இடம்' },
};

export const LANDING: Record<Lang, LandingCopy> = { en, ta };
