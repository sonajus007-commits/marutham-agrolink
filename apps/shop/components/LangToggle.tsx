'use client';

import { useRouter } from 'next/navigation';
import { LANG_COOKIE, type Lang } from '@/lib/dict';

/* Language is decided on the SERVER (a cookie → one language of HTML), so the
 * toggle's job is only to set the cookie and ask for a fresh render. That keeps
 * the page crawlable in whichever language it is served, with no second copy of
 * the copy hidden in the markup.
 *
 * `ma_lang` is the same key the portal uses, so a visitor who chooses Tamil here
 * stays in Tamil after they sign in. */
export function LangToggle({ current }: { current: Lang }) {
  const router = useRouter();

  function pick(lang: Lang) {
    // 1 year, site-wide.
    document.cookie = `${LANG_COOKIE}=${lang};path=/;max-age=${60 * 60 * 24 * 365}`;
    router.refresh();
  }

  return (
    <div className="flex items-center gap-1 rounded-full border border-border p-0.5">
      {(['en', 'ta'] as const).map((lang) => (
        <button
          key={lang}
          type="button"
          onClick={() => pick(lang)}
          aria-pressed={current === lang}
          className={`cursor-pointer rounded-full border-0 px-3 py-1 text-xs font-bold transition-colors ${
            current === lang ? 'bg-forest text-white' : 'bg-transparent text-fg-muted hover:text-forest'
          } ${lang === 'ta' ? 'font-[Noto_Serif_Tamil]' : ''}`}
        >
          {lang === 'en' ? 'EN' : 'த'}
        </button>
      ))}
    </div>
  );
}
