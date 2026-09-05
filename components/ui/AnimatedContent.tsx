'use client';

import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

interface AnimatedContentProps {
  children: ReactNode;
  /** Slide up from below (true) or down from above (false) while fading in. */
  reverse?: boolean;
  delay?: number;
  className?: string;
}

/** Fade + slide-up reveal on mount, used for every section entrance across
 * the stock/ETF/asset/dashboard pages — every call site uses the same
 * vertical slide, just staggered by `delay`. */
export default function AnimatedContent({
  children,
  reverse = true,
  delay = 0,
  className = '',
}: AnimatedContentProps) {
  return (
    <motion.div
      initial={{ y: reverse ? 100 : -100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.8, ease: 'easeOut', delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
