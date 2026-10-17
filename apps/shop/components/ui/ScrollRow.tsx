'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/* A horizontal shelf the shopper moves, not one that moves on its own. Native
 * overflow scroll with snap points, so touch swipe, trackpad and shift-wheel all
 * work for free and a card never stops half-cut. Desktop gets prev/next arrows
 * (a mouse can't swipe); they hide at either end. Children are the <li> cards.
 *
 * This replaced an auto-scrolling marquee: a moving row made "+ Add" a moving
 * target on touch screens, where there is no hover to pause it. */
export function ScrollRow({
  children,
  label,
  prevLabel = 'Scroll left',
  nextLabel = 'Scroll right',
}: {
  children: ReactNode;
  /** Accessible name for the list. */
  label: string;
  prevLabel?: string;
  nextLabel?: string;
}) {
  const ref = useRef<HTMLUListElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  const sync = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setAtStart(el.scrollLeft <= 4);
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    sync();
    window.addEventListener('resize', sync);
    return () => window.removeEventListener('resize', sync);
  }, [sync]);

  const page = (dir: 1 | -1) => {
    const el = ref.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: 'smooth' });
  };

  const arrow =
    'border-border bg-surface text-forest-700 hover:bg-mist absolute top-1/2 z-10 hidden h-11 w-11 -translate-y-1/2 place-items-center rounded-full border shadow-md transition-opacity md:grid';

  return (
    <div className="relative">
      <ul
        ref={ref}
        onScroll={sync}
        aria-label={label}
        className="-mx-6 flex list-none snap-x snap-mandatory scroll-px-6 gap-4 overflow-x-auto px-6 py-1 [scrollbar-width:none] md:mx-0 md:scroll-px-0 md:px-0 [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </ul>
      <button
        type="button"
        onClick={() => page(-1)}
        aria-label={prevLabel}
        className={`${arrow} -left-5 ${atStart ? 'pointer-events-none opacity-0' : ''}`}
        tabIndex={atStart ? -1 : 0}
      >
        <ChevronLeft className="h-5 w-5" aria-hidden="true" />
      </button>
      <button
        type="button"
        onClick={() => page(1)}
        aria-label={nextLabel}
        className={`${arrow} -right-5 ${atEnd ? 'pointer-events-none opacity-0' : ''}`}
        tabIndex={atEnd ? -1 : 0}
      >
        <ChevronRight className="h-5 w-5" aria-hidden="true" />
      </button>
    </div>
  );
}
