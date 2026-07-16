import type { ReactNode } from 'react';

/* ─────────────────────────────────────────────────────────────────────────────
 * Two honest placeholders. Both are deliberately visible as placeholders.
 *
 * <ImageSlot> — where a photograph goes. This repo contains no photography at
 * all (two logo JPEGs and some PWA icons, nothing else), and the reference
 * comp's farm imagery is stock we have no licence to. So the slot states what
 * the photo should BE, at the right aspect ratio, and reserves the layout so
 * dropping the real asset in shifts nothing.
 *
 * <ContentPending> — where real content goes that does not exist yet:
 * testimonials, pricing, updates. Never lorem, never invented quotes or tiers.
 * It names the source the section is waiting for, so the gap is a decision you
 * can act on rather than a thing that looks finished and is not.
 * ───────────────────────────────────────────────────────────────────────────── */

interface ImageSlotProps {
  /* What the photograph should show. This one stays in English on purpose: it is
   * a brief for whoever takes the picture, not customer copy, and it disappears
   * the moment the real asset lands. The label around it is translated because
   * it is the part a visitor would actually read as a caption. */
  description: string;
  /** Tailwind aspect utility, e.g. "aspect-[4/3]". */
  aspect?: string;
  className?: string;
  tone?: 'light' | 'dark';
  /** Translated caption, e.g. "Image placeholder" / "பட இடம்". */
  slotLabel: string;
}

export function ImageSlot({
  description,
  aspect = 'aspect-[4/3]',
  className = '',
  tone = 'light',
  slotLabel,
}: ImageSlotProps) {
  const skin =
    tone === 'dark'
      ? 'border-forest-500/40 bg-forest-900/40 text-leaf-300'
      : 'border-border bg-bg text-fg-muted';
  return (
    /* w-full + min-w-0: the slot is a grid item, and a grid item's min-width
     * defaults to auto — so its longest word (the description) sets a floor it
     * will not shrink past, and it widens the page instead of wrapping. */
    <div
      className={`${aspect} ${skin} flex w-full min-w-0 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed p-6 text-center ${className}`}
    >
      <svg viewBox="0 0 24 24" className="h-7 w-7 opacity-50" aria-hidden="true" fill="none">
        <rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="8.5" cy="9.5" r="1.5" fill="currentColor" />
        <path d="m3 16 5-4 4 3 3-2 6 5" stroke="currentColor" strokeWidth="1.5" fill="none" />
      </svg>
      <p className="text-caption max-w-[34ch] font-medium">{description}</p>
      <p className="text-[0.65rem] tracking-[0.14em] uppercase opacity-60">{slotLabel}</p>
    </div>
  );
}

interface ContentPendingProps {
  /** What is missing, in the reader's words. */
  title: string;
  /** What has to exist before this can be filled — a source, not an excuse. */
  needs: string;
  className?: string;
  children?: ReactNode;
}

export function ContentPending({ title, needs, className = '', children }: ContentPendingProps) {
  return (
    <div
      className={`border-border bg-surface-raised rounded-2xl border border-dashed p-10 text-center ${className}`}
    >
      <p className="text-card text-forest-700 font-semibold">{title}</p>
      <p className="text-fg-muted mx-auto mt-2 max-w-[52ch] text-body">{needs}</p>
      {children}
    </div>
  );
}
