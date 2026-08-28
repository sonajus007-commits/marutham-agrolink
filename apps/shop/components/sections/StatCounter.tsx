'use client';

import { useEffect, useRef, useState } from 'react';
import { useInView, useReducedMotion } from 'framer-motion';

/* The animated stat number, split out as the ONLY client island in the
 * statistics section. PlatformStatistics itself is a Server Component (it sits on
 * a Section, and Section now reads the filesystem for the landscape photo — which
 * a client bundle cannot do). Keeping the count-up here lets the section render on
 * the server while the number still animates on the client. */
export function StatCounter({ to }: { to: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });
  const reduced = useReducedMotion();
  const [n, setN] = useState(reduced ? to : 0);

  useEffect(() => {
    if (!inView || reduced || to === 0) {
      setN(to);
      return;
    }
    const DURATION = 1100;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - start) / DURATION, 1);
      // easeOutExpo — fast, then settles. Reads as counting up, not sliding.
      const eased = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
      setN(Math.round(eased * to));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, reduced, to]);

  return (
    <span ref={ref} className="tabular-nums">
      {n.toLocaleString('en-IN')}
    </span>
  );
}
