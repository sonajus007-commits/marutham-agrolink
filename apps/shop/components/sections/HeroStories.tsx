'use client';

import { useEffect, useState } from 'react';
import { useReducedMotion } from 'framer-motion';
import Link from 'next/link';
import type { Lang } from '@/lib/dict';
import { recentStories, sampleLabel, farmerFace } from '@/lib/farmerStories';

/* The hero's right column: a full-frame farmer-story slideshow. One story fills
 * the frame at a time and auto-advances to the next (newest first); dots let you
 * jump, and it pauses on hover / holds still under prefers-reduced-motion. Each
 * story shows an ILLUSTRATIVE farmer portrait (👩‍🌾/👨‍🌾 on a field-green ground) —
 * these are sample stories, so we never fabricate a real photographic face; the
 * strip is clearly marked "Sample" and swaps to real photos + real quotes by
 * editing lib/farmerStories.ts. */

const ADVANCE_MS = 5500;

export function HeroStories({ lang }: { lang: Lang }) {
  const stories = recentStories(6);
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || reduced || stories.length < 2) return;
    const id = setInterval(() => setIndex((v) => (v + 1) % stories.length), ADVANCE_MS);
    return () => clearInterval(id);
  }, [paused, reduced, stories.length]);

  if (stories.length === 0) return null;

  const label =
    lang === 'ta'
      ? `விவசாயி கதைகள் · ${sampleLabel(lang)}`
      : `Farmer stories · ${sampleLabel(lang)}`;
  const seeAll = lang === 'ta' ? 'அனைத்தையும் காண →' : 'See all →';

  return (
    <div className="w-full min-w-0">
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="inline-flex items-center rounded-full border border-white/25 bg-white/10 px-3 py-1 text-caption font-semibold text-white backdrop-blur-sm">
          {label}
        </span>
        <Link
          href="/#farmer-stories"
          className="shrink-0 text-caption font-semibold text-white/85 no-underline hover:text-white"
        >
          {seeAll}
        </Link>
      </div>

      <div
        className="relative overflow-hidden rounded-3xl shadow-[0_30px_70px_-30px_rgba(0,0,0,0.6)]"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        <div
          className={`flex ${reduced ? '' : 'transition-transform duration-700 ease-out'}`}
          style={{ transform: `translateX(-${index * 100}%)` }}
        >
          {stories.map((s, i) => (
            <article
              key={s.id}
              aria-hidden={i !== index || undefined}
              className="flex w-full shrink-0 flex-col gap-5 bg-white p-6 md:p-7"
              style={{ minHeight: '20rem' }}
            >
              <div className="flex items-center gap-4">
                <span
                  className="grid h-16 w-16 shrink-0 place-items-center rounded-full text-3xl ring-2 ring-white"
                  style={{ background: 'linear-gradient(135deg,#8fce9a,#2e7d32)' }}
                  role="img"
                  aria-label={
                    lang === 'ta' ? 'விவசாயி (படம் மாதிரி)' : 'Farmer (sample illustration)'
                  }
                >
                  {farmerFace(s)}
                </span>
                <span className="leading-tight">
                  <span className="text-forest-900 block text-card font-bold">{s.name}</span>
                  <span className="text-fg-muted block text-caption">{s.village}</span>
                </span>
              </div>

              <p className="text-fg text-body leading-relaxed">“{s.quote[lang]}”</p>

              <span className="bg-blossom-500/12 text-blossom-ink mt-auto inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1.5 text-caption font-bold">
                <span aria-hidden="true">🏷</span>
                {s.benefit[lang]}
              </span>
            </article>
          ))}
        </div>
      </div>

      {/* Dots — jump to a story; the active one is wider. */}
      <div className="mt-4 flex justify-center gap-2">
        {stories.map((s, i) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setIndex(i)}
            aria-label={`${s.name}, ${s.village}`}
            aria-current={i === index || undefined}
            className={`h-2 rounded-full transition-all ${
              i === index ? 'w-6 bg-white' : 'w-2 bg-white/45 hover:bg-white/70'
            }`}
          />
        ))}
      </div>
    </div>
  );
}
