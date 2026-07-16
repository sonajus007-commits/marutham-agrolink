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
  /** What the photograph should show. Shown on the slot; also the alt text later. */
  description: string;
  /** Tailwind aspect utility, e.g. "aspect-[4/3]". */
  aspect?: string;
  className?: string;
  tone?: 'light' | 'dark';
}

export function ImageSlot({
  description,
  aspect = 'aspect-[4/3]',
  className = '',
  tone = 'light',
}: ImageSlotProps) {
  const skin =
    tone === 'dark'
      ? 'border-forest-500/40 bg-forest-900/40 text-leaf-300'
      : 'border-border bg-bg text-fg-muted';
  return (
    <div
      className={`${aspect} ${skin} flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed p-6 text-center ${className}`}
    >
      <svg viewBox="0 0 24 24" className="h-7 w-7 opacity-50" aria-hidden="true" fill="none">
        <rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="8.5" cy="9.5" r="1.5" fill="currentColor" />
        <path d="m3 16 5-4 4 3 3-2 6 5" stroke="currentColor" strokeWidth="1.5" fill="none" />
      </svg>
      <p className="text-caption max-w-[34ch] font-medium">{description}</p>
      <p className="text-[0.65rem] tracking-[0.14em] uppercase opacity-60">Image placeholder</p>
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
