'use client';

import { useEffect, useState } from 'react';
import { useSpring } from 'framer-motion';

interface AnimatedCounterProps {
  value: number;
  format?: (n: number) => string;
  className?: string;
}

export function AnimatedCounter({
  value,
  format = (n) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
  className,
}: AnimatedCounterProps) {
  const [display, setDisplay] = useState(0);
  // Snappier settle — the previous (stiffness 50 / damping 20) felt sluggish.
  const spring = useSpring(0, { stiffness: 130, damping: 26, restDelta: 0.5 });

  useEffect(() => {
    spring.set(value);
  }, [spring, value]);

  useEffect(() => {
    return spring.on('change', (v) => setDisplay(v));
  }, [spring]);

  return <span className={className}>{format(display)}</span>;
}
