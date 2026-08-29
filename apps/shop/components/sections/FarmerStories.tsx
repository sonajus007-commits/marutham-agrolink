import Link from 'next/link';
import type { Lang } from '@/lib/dict';
import { recentStories, sampleLabel, farmerFace } from '@/lib/farmerStories';
import { Section, SectionHeader } from '@/components/ui/Section';
import { Reveal } from '@/components/ui/Reveal';

/* Farmer Stories — the dedicated section holding ALL the stories, richer than the
 * hero strip (full quote, no clamp). Clearly marked illustrative: the eyebrow
 * carries a "Sample" tag and the lede says real stories are coming. Shown newest
 * first so it matches the hero's ordering. Replace lib/farmerStories.ts with real
 * consented stories to make this section genuine. */

export function FarmerStories({ lang }: { lang: Lang }) {
  const stories = recentStories(); // all, newest first
  if (stories.length === 0) return null;

  const copy =
    lang === 'ta'
      ? {
          eyebrow: `விவசாயி கதைகள் · ${sampleLabel(lang)}`,
          title: 'மருதத்துடன் அவர்களின் வாழ்க்கை',
          lede: 'மருதம் அக்ரோலிங்க் விவசாயிகளின் வாழ்வை எப்படி மாற்றுகிறது. இவை மாதிரிக் கதைகள் — உண்மையான விவசாயிகளின் கதைகள் விரைவில்.',
          all: 'அனைத்தையும் காண →',
        }
      : {
          eyebrow: `Farmer stories · ${sampleLabel(lang)}`,
          title: 'Their life with Marutham AgroLink',
          lede: 'How Marutham AgroLink is changing what a farming day looks like. These are sample stories — real farmer stories are coming soon.',
          all: 'See all farmers →',
        };

  return (
    <Section id="farmer-stories" tone="surface" aria-labelledby="stories-h">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <SectionHeader
          id="stories-h"
          eyebrow={copy.eyebrow}
          accent="blossom"
          title={copy.title}
          lede={copy.lede}
        />
        <Link
          href="/farmers"
          className="text-forest-700 hover:text-forest-900 shrink-0 text-caption font-semibold no-underline"
        >
          {copy.all}
        </Link>
      </div>

      <ul className="mt-12 grid list-none grid-cols-1 gap-5 p-0 sm:grid-cols-2 lg:grid-cols-3">
        {stories.map((s, i) => (
          <Reveal as="li" key={s.id} kind="fade-up" delay={i * 0.06}>
            <Link href={`/farmer/${s.id}`} className="block h-full no-underline">
              <figure className="border-border bg-surface-raised flex h-full flex-col gap-4 rounded-2xl border p-6 transition-shadow hover:shadow-[0_16px_40px_-20px_rgba(22,61,47,0.35)]">
                <blockquote className="text-fg text-body leading-relaxed">
                  “{s.quote[lang]}”
                </blockquote>
                <figcaption className="mt-auto flex items-center gap-3">
                  <span
                    className="grid h-12 w-12 shrink-0 place-items-center rounded-full text-2xl ring-2 ring-white"
                    style={{ background: 'linear-gradient(135deg,#8fce9a,#2e7d32)' }}
                    role="img"
                    aria-label={
                      lang === 'ta' ? 'விவசாயி (படம் மாதிரி)' : 'Farmer (sample illustration)'
                    }
                  >
                    {farmerFace(s)}
                  </span>
                  <span className="leading-tight">
                    <span className="text-forest-900 block text-caption font-bold">{s.name}</span>
                    <span className="text-fg-muted block text-[0.7rem]">{s.village}</span>
                  </span>
                  <span className="bg-blossom-500/12 text-blossom-ink ml-auto inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.7rem] font-bold">
                    <span aria-hidden="true">🏷</span>
                    {s.benefit[lang]}
                  </span>
                </figcaption>
              </figure>
            </Link>
          </Reveal>
        ))}
      </ul>
    </Section>
  );
}
