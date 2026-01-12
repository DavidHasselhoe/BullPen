'use client';

import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import './ShinyText.css';

interface ShinyTextProps {
  text: string;
  color?: string;
  shineColor?: string;
  speed?: number;
  delay?: number;
  spread?: number;
  yoyo?: boolean;
  pauseOnHover?: boolean;
  direction?: 'left' | 'right';
  disabled?: boolean;
  className?: string;
}

export default function ShinyText({
  text,
  color = '#b5b5b5',
  shineColor = '#ffffff',
  speed = 2,
  delay = 0,
  spread = 120,
  yoyo = false,
  pauseOnHover = false,
  direction = 'left',
  disabled = false,
  className = ''
}: ShinyTextProps) {
  const containerRef = useRef<HTMLSpanElement>(null);
  const shineRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (disabled || !shineRef.current) return;

    const shineElement = shineRef.current;
    
    // Calculate gradient angle
    const angle = direction === 'left' ? spread : 180 - spread;
    
    // Set initial position
    const startPos = direction === 'left' ? '200% 50%' : '-200% 50%';
    const endPos = direction === 'left' ? '-200% 50%' : '200% 50%';

    gsap.set(shineElement, { 
      backgroundPosition: startPos
    });

    // Create animation
    const tl = gsap.timeline({
      repeat: yoyo ? 1 : -1,
      yoyo: yoyo,
      delay: delay
    });

    tl.to(shineElement, {
      backgroundPosition: endPos,
      duration: speed,
      ease: 'none'
    });

    // Handle pause on hover
    if (pauseOnHover && containerRef.current) {
      const handleMouseEnter = () => tl.pause();
      const handleMouseLeave = () => tl.resume();

      containerRef.current.addEventListener('mouseenter', handleMouseEnter);
      containerRef.current.addEventListener('mouseleave', handleMouseLeave);

      return () => {
        tl.kill();
        containerRef.current?.removeEventListener('mouseenter', handleMouseEnter);
        containerRef.current?.removeEventListener('mouseleave', handleMouseLeave);
      };
    }

    return () => {
      tl.kill();
    };
  }, [speed, delay, direction, yoyo, pauseOnHover, disabled, spread]);

  // Create gradient
  const angle = direction === 'left' ? spread : 180 - spread;
  const gradient = `linear-gradient(${angle}deg, transparent 0%, transparent 40%, ${shineColor} 50%, transparent 60%, transparent 100%)`;

  if (disabled) {
    return (
      <span className={`shiny-text ${className}`} style={{ color }}>
        {text}
      </span>
    );
  }

  return (
    <span ref={containerRef} className={`shiny-text ${className}`}>
      <span className="shiny-text__base" style={{ color }}>
        {text}
      </span>
      <span
        ref={shineRef}
        className="shiny-text__shine"
        style={{
          background: gradient,
          backgroundSize: '200% 200%'
        }}
      >
        {text}
      </span>
    </span>
  );
}
