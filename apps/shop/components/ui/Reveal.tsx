'use client';

import { motion, useReducedMotion, type Variants } from 'framer-motion';
import { useEffect, useState, type ReactNode } from 'react';

/* Scroll reveal. One component, four entrances — so the whole site animates the
 * same way and no section invents its own timing.
 *
 * `whileInView` with `once` rather than a scroll listener: the work happens on
 * the compositor and stops after the first pass. Nothing here animates layout
 * (no width/height/top), only transform and opacity.
 *
 * useReducedMotion is checked in JS as well as the CSS media query in
 * globals.css, because Framer drives these inline and would otherwise win over
 * the stylesheet. When it is on, elements simply start visible. */

export type RevealKind = 'fade-up' | 'scale' | 'blur' | 'fade';

const VARIANTS: Record<RevealKind, Variants> = {
  'fade-up': {
    hidden: { opacity: 0, y: 24 },
    show: { opacity: 1, y: 0 },
  },
  scale: {
    hidden: { opacity: 0, scale: 0.96 },
    show: { opacity: 1, scale: 1 },
  },
  blur: {
    hidden: { opacity: 0, filter: 'blur(8px)' },
    show: { opacity: 1, filter: 'blur(0px)' },
  },
  fade: {
    hidden: { opacity: 0 },
    show: { opacity: 1 },
  },
};

interface Props {
  children: ReactNode;
  kind?: RevealKind;
  /** Seconds. Use for stagger inside a group. */
  delay?: number;
  className?: string;
  as?: 'div' | 'section' | 'li' | 'span';
}

export function Reveal({ children, kind = 'fade-up', delay = 0, className, as = 'div' }: Props) {
  const reduced = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const MotionTag = motion[as];

  /* Reveal is almost always a grid or flex child, and such a child defaults to
   * min-width:auto — it will not shrink below its longest word. That is
   * invisible in English and breaks the page in Tamil, whose compounds run far
   * longer. min-w-0 first so a caller's own class can still override it. */
  const cls = `min-w-0 ${className ?? ''}`.trim();

  /* Fail-open: the server render and the first client paint are plain, VISIBLE
   * children — never opacity:0. Only after mount do we swap in the motion
   * element that starts hidden and reveals on scroll. So with JS disabled, a
   * slow hydration, or a viewport observer that never fires (some embedded
   * browsers), the content is always readable rather than a blank panel. Reduced
   * motion keeps it plain forever. */
  if (reduced || !mounted) {
    const Tag = as;
    return <Tag className={cls}>{children}</Tag>;
  }

  return (
    <MotionTag
      className={cls}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: '-80px' }}
      variants={VARIANTS[kind]}
      transition={{ duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </MotionTag>
  );
}
