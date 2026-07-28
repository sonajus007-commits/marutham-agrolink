import { motion, useReducedMotion } from 'framer-motion';
import type { ReactNode } from 'react';

/**
 * A small, accessible entrance animation: fade + a short upward slide.
 *
 * framer-motion is in the tree but this is its first use in apps/web — so the
 * wrapper stays deliberately tiny and honours `prefers-reduced-motion`. When the
 * user asks for reduced motion we render a plain <div>: no transform, no opacity
 * ramp, nothing for a vestibular disorder to catch. The `delay` lets a parent
 * stagger a row of cards without every child re-implementing the same variants.
 */
export function FadeIn({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  const reduce = useReducedMotion();
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: 'easeOut', delay }}
    >
      {children}
    </motion.div>
  );
}
