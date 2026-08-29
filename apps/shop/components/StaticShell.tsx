import type { ReactNode } from 'react';
import { DICT, type Lang } from '@/lib/dict';
import { LANDING } from '@/lib/landing';
import { SiteHeader, SiteFooter } from '@/components/sections/Chrome';

/* The shell for the informational/static pages (About, How It Works, Contact,
 * Terms, Privacy): the shared header/footer around a readable, centred column.
 * `eyebrow`/`title`/`lede` render the page head consistently; `children` is the
 * body. */
export function StaticShell({
  lang,
  eyebrow,
  title,
  lede,
  children,
}: {
  lang: Lang;
  eyebrow?: string;
  title: string;
  lede?: string;
  children: ReactNode;
}) {
  const t = DICT[lang];
  return (
    <>
      <SiteHeader t={t} lang={lang} />
      <main className="mx-auto max-w-3xl px-5 py-14">
        {eyebrow ? (
          <span className="text-blossom-ink text-[0.7rem] font-semibold tracking-[0.16em] uppercase">
            {eyebrow}
          </span>
        ) : null}
        <h1 className="text-forest-900 mt-3 text-3xl font-bold tracking-tight text-balance md:text-4xl">
          {title}
        </h1>
        {lede ? <p className="text-fg-muted mt-4 text-body leading-relaxed">{lede}</p> : null}
        <div className="mt-10 flex flex-col gap-8">{children}</div>
      </main>
      <SiteFooter t={t} c={LANDING[lang]} />
    </>
  );
}

/* A titled block within a static page. */
export function StaticSection({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-forest-900 text-xl font-bold tracking-tight">{heading}</h2>
      <div className="text-fg text-body leading-relaxed [&_p]:mt-3 [&_p:first-child]:mt-0">
        {children}
      </div>
    </section>
  );
}
