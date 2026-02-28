'use client';

import { motion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';

interface SplitTextProps {
  text: string;
  direction?: 'up' | 'down' | 'left' | 'right';
  duration?: number;
  delay?: number;
  stagger?: number;
  className?: string;
}

export function SplitText({
  text,
  direction = 'up',
  duration = 0.6,
  delay = 0,
  stagger = 0.03,
  className = '',
}: SplitTextProps) {
  const [isVisible, setIsVisible] = useState(false);
  const containerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    // Small delay to ensure DOM is ready
    const timer = setTimeout(() => {
      setIsVisible(true);
    }, 50);

    return () => clearTimeout(timer);
  }, []);

  // Split text into characters, preserving spaces
  const characters = text.split('');

  // Get animation variants based on direction
  const getVariants = () => {
    const from = {
      up: { opacity: 0, y: 20 },
      down: { opacity: 0, y: -20 },
      left: { opacity: 0, x: 20 },
      right: { opacity: 0, x: -20 },
    }[direction];

    const to = {
      opacity: 1,
      x: 0,
      y: 0,
    };

    return {
      hidden: from,
      visible: (i: number) => ({
        ...to,
        transition: {
          delay: delay + i * stagger,
          duration,
          ease: [0.25, 0.46, 0.45, 0.94] as any, // easeOutQuart
        },
      }),
    };
  };

  return (
    <span ref={containerRef} className={`inline-block ${className}`}>
      {characters.map((char, index) => (
        <motion.span
          key={index}
          custom={index}
          initial="hidden"
          animate={isVisible ? 'visible' : 'hidden'}
          variants={getVariants()}
          className="inline-block"
          style={{ whiteSpace: char === ' ' ? 'pre' : 'normal' }}
        >
          {char === ' ' ? '\u00A0' : char}
        </motion.span>
      ))}
    </span>
  );
}
