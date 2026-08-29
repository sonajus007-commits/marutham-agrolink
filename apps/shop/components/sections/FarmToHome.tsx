import { Sprout, Warehouse, Truck, Home } from 'lucide-react';
import type { Lang } from '@/lib/dict';
import { Section } from '@/components/ui/Section';

/* From Farm To Your Home — the four-step story from the approved model:
 * Farmer → Marutham Hub → Delivery Partner → Your Home. Every line describes
 * something the platform actually does (sourcing, hub weigh-in + quality check,
 * routed dispatch, doorstep delivery). Bilingual copy lives here rather than in
 * the shared dict because it is specific to this one section. */

interface Step {
  icon: typeof Sprout;
  no: string;
  t: string;
  d: string;
}

const STEPS: Record<Lang, { title: string; lede: string; steps: Step[] }> = {
  en: {
    title: 'From farm to your home',
    lede: 'Four steps, each one scanned, from the field around Pudukkottai to your door.',
    steps: [
      {
        icon: Sprout,
        no: '01',
        t: 'Farmer',
        d: 'Fresh produce sourced from participating farmers near you.',
      },
      {
        icon: Warehouse,
        no: '02',
        t: 'Marutham Hub',
        d: 'Received, weighed, quality-checked and prepared for dispatch.',
      },
      {
        icon: Truck,
        no: '03',
        t: 'Delivery Partner',
        d: 'Carefully packed and dispatched on the shortest route.',
      },
      { icon: Home, no: '04', t: 'Your Home', d: 'Delivered fresh to your door — farm to family.' },
    ],
  },
  ta: {
    title: 'பண்ணையிலிருந்து உங்கள் வீட்டிற்கு',
    lede: 'புதுக்கோட்டை வயலிலிருந்து உங்கள் வாசல் வரை — ஒவ்வொரு நிலையும் ஸ்கேன் செய்யப்படுகிறது.',
    steps: [
      {
        icon: Sprout,
        no: '01',
        t: 'விவசாயி',
        d: 'உங்களுக்கு அருகிலுள்ள விவசாயிகளிடமிருந்து புதிய விளைபொருட்கள்.',
      },
      {
        icon: Warehouse,
        no: '02',
        t: 'மருதம் மையம்',
        d: 'பெறப்பட்டு, எடைபோட்டு, தரம் சரிபார்க்கப்பட்டு அனுப்பத் தயாராகிறது.',
      },
      {
        icon: Truck,
        no: '03',
        t: 'டெலிவரி பங்குதாரர்',
        d: 'கவனமாகப் பொதிசெய்து குறுகிய வழியில் அனுப்பப்படுகிறது.',
      },
      {
        icon: Home,
        no: '04',
        t: 'உங்கள் வீடு',
        d: 'புதியதாக உங்கள் வாசலில் வழங்கப்படுகிறது — பண்ணையிலிருந்து குடும்பத்திற்கு.',
      },
    ],
  },
};

export function FarmToHome({ lang }: { lang: Lang }) {
  const c = STEPS[lang];
  return (
    <Section id="how-it-works" tone="mist" aria-labelledby="how-h">
      <div className="mx-auto max-w-[60ch] text-center">
        <span className="text-leaf-ink text-[0.7rem] font-semibold tracking-[0.16em] uppercase">
          {lang === 'ta' ? 'எப்படி வேலை செய்கிறது' : 'How it works'}
        </span>
        <h2
          id="how-h"
          className="text-forest-900 text-section mt-4 font-bold tracking-tight text-balance"
        >
          {c.title}
        </h2>
        <p className="text-fg-muted text-body mx-auto mt-4">{c.lede}</p>
      </div>

      <ol className="mt-14 grid list-none grid-cols-1 gap-x-4 gap-y-10 p-0 sm:grid-cols-2 lg:grid-cols-4">
        {c.steps.map((s, i) => {
          const Icon = s.icon;
          return (
            <li key={s.no} className="relative flex flex-col items-center gap-4 text-center">
              {/* Connector arrow to the next step, on the lg row only. */}
              {i < c.steps.length - 1 ? (
                <span
                  className="absolute top-8 -right-2 hidden text-2xl text-[#66BB6A] lg:block"
                  aria-hidden="true"
                >
                  →
                </span>
              ) : null}
              <span className="border-border bg-surface grid h-16 w-16 place-items-center rounded-2xl border shadow-[0_10px_24px_-14px_rgba(22,61,47,0.5)]">
                <Icon className="text-forest-700 h-7 w-7" aria-hidden="true" />
              </span>
              <span className="text-blossom-ink text-caption font-bold tracking-[0.08em]">
                {s.no}
              </span>
              <h3 className="text-forest-900 text-card -mt-2 font-semibold">{s.t}</h3>
              <p className="text-fg-muted text-caption max-w-[26ch] leading-relaxed">{s.d}</p>
            </li>
          );
        })}
      </ol>
    </Section>
  );
}
