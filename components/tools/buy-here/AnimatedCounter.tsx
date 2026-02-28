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
  const spring = useSpring(0, { stiffness: 50, damping: 20 });

  useEffect(() => {
    spring.set(value);
  }, [spring, value]);

  useEffect(() => {
    return spring.on('change', (v) => setDisplay(v));
  }, [spring]);

  return <span className={className}>{format(display)}</span>;
}
