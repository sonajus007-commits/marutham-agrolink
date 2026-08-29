import type { Lang } from '@/lib/dict';

/* Farmer stories — ILLUSTRATIVE SAMPLE CONTENT, not real testimonials.
 *
 * These are placeholder stories so the design is complete; they are clearly
 * labelled "sample / illustrative" everywhere they appear (hero strip + the
 * dedicated section) so no shopper mistakes them for real farmers. When real,
 * consented farmer stories exist, replace the entries below (and drop the
 * `sample` labelling in the two components) — the shape stays the same.
 *
 * `updatedAt` drives the hero strip: it shows the most recently updated stories
 * first, so "latest stories" stays meaningful as the list grows. Names/villages
 * are kept identical across languages (proper nouns); only the quote and the
 * benefit chip are translated. */

export interface FarmerStory {
  id: string;
  name: string;
  village: string;
  /** ISO date; the hero shows the newest first. */
  updatedAt: string;
  /** Tailwind background class for the monogram fallback. */
  avatar: string;
  /* Picks the ILLUSTRATIVE farmer portrait (👩‍🌾 / 👨‍🌾). These are sample stories,
   * so we never show a fabricated photographic face; a clearly-drawn figure on a
   * field-green ground stands in until real, consented farmer photos exist. */
  gender: 'f' | 'm';
  quote: Record<Lang, string>;
  /** Short benefit tag shown as a chip. */
  benefit: Record<Lang, string>;
}

/** The illustrative portrait emoji for a story. */
export function farmerFace(s: FarmerStory): string {
  return s.gender === 'f' ? '👩‍🌾' : '👨‍🌾';
}

export const FARMER_STORIES: FarmerStory[] = [
  {
    id: 'kavitha-alangudi',
    name: 'Kavitha',
    village: 'Alangudi',
    updatedAt: '2026-08-28',
    avatar: 'bg-blossom-500',
    gender: 'f',
    quote: {
      en: 'Before, the agent set the price and I took what was given. On Marutham I set my own price and I am paid in two days. This year I sent my daughter to college.',
      ta: 'முன்பு தரகர் விலை நிர்ணயித்தார், கிடைத்ததை எடுத்துக்கொண்டேன். மருதத்தில் நானே விலை வைக்கிறேன், இரண்டு நாளில் பணம் வருகிறது. இந்த ஆண்டு என் மகளைக் கல்லூரிக்கு அனுப்பினேன்.',
    },
    benefit: { en: 'Sets her own price', ta: 'தன் விலையைத் தானே நிர்ணயிக்கிறார்' },
  },
  {
    id: 'murugan-keeranur',
    name: 'Murugan',
    village: 'Keeranur',
    updatedAt: '2026-08-27',
    avatar: 'bg-forest-700',
    gender: 'm',
    quote: {
      en: 'My tomatoes used to wait for a buyer. Now the city orders in the morning and it is picked up by noon — nothing spoils in the heat any more.',
      ta: 'என் தக்காளி வாங்குபவருக்குக் காத்திருந்தது. இப்போது காலையில் நகரம் ஆர்டர் செய்கிறது, மதியத்திற்குள் எடுத்துச் செல்கிறார்கள் — வெயிலில் எதுவும் கெடுவதில்லை.',
    },
    benefit: { en: 'No more wastage', ta: 'வீணாவது இல்லை' },
  },
  {
    id: 'selvi-viralimalai',
    name: 'Selvi',
    village: 'Viralimalai',
    updatedAt: '2026-08-25',
    avatar: 'bg-water-500',
    gender: 'f',
    quote: {
      en: 'I can see exactly who bought my greens, and their rating comes back to me by name. It feels like running my own shop.',
      ta: 'என் கீரையை யார் வாங்கினார் என்று தெளிவாகத் தெரிகிறது, அவர்களின் மதிப்பீடு என் பெயருக்கே வருகிறது. என் சொந்தக் கடையை நடத்துவது போல் இருக்கிறது.',
    },
    benefit: { en: 'Rated by name', ta: 'பெயருடன் மதிப்பீடு' },
  },
  {
    id: 'arumugam-ganapathikottai',
    name: 'Arumugam',
    village: 'Ganapathikottai',
    updatedAt: '2026-08-22',
    avatar: 'bg-earth-500',
    gender: 'm',
    quote: {
      en: 'The hub weighs everything in front of me and the slip is on my phone straight away. No arguments, and no middleman taking a cut.',
      ta: 'மையத்தில் என் முன்னிலையில் எடைபோடுகிறார்கள், சீட்டு உடனே என் மொபைலில் வருகிறது. வாக்குவாதம் இல்லை, தரகர் கமிஷன் இல்லை.',
    },
    benefit: { en: 'Weighed in the open', ta: 'வெளிப்படையாக எடை' },
  },
  {
    id: 'lakshmi-avudaiyarkoil',
    name: 'Lakshmi',
    village: 'Avudaiyarkoil',
    updatedAt: '2026-08-18',
    avatar: 'bg-forest-900',
    gender: 'f',
    quote: {
      en: 'During the season I listed my extra harvest in a few minutes. The income that would have gone to waste paid my son’s fees.',
      ta: 'சீசனில் என் மிகுதி விளைச்சலை சில நிமிடங்களில் பட்டியலிட்டேன். வீணாகியிருக்கும் அந்த வருமானம் என் மகனின் கட்டணத்தைச் செலுத்தியது.',
    },
    benefit: { en: 'Extra income', ta: 'கூடுதல் வருமானம்' },
  },
  {
    id: 'rajendran-kottaiyur',
    name: 'Rajendran',
    village: 'Kottaiyur',
    updatedAt: '2026-08-12',
    avatar: 'bg-blossom-ink',
    gender: 'm',
    quote: {
      en: 'I am not good with apps, but confirming this morning’s stock takes one tap. My earnings are clear to me at the end of every day.',
      ta: 'எனக்கு ஆப் அதிகம் தெரியாது, ஆனால் இன்றைய கையிருப்பை உறுதி செய்ய ஒரு தட்டு போதும். ஒவ்வொரு நாள் இறுதியிலும் என் வருமானம் தெளிவாக இருக்கிறது.',
    },
    benefit: { en: 'Simple to use', ta: 'பயன்படுத்த எளிது' },
  },
];

/** Newest first — the order the hero strip shows. */
export function recentStories(limit = FARMER_STORIES.length): FarmerStory[] {
  return [...FARMER_STORIES].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, limit);
}

/** One story by its slug (the `id`), for the /farmer/[slug] page. */
export function getStory(slug: string): FarmerStory | undefined {
  return FARMER_STORIES.find((s) => s.id === slug);
}

/** The one-word "sample" marker, per language. */
export function sampleLabel(lang: Lang): string {
  return lang === 'ta' ? 'மாதிரி' : 'Sample';
}
