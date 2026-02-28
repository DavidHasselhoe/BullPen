'use client';

import { useEffect, useRef, ReactNode } from 'react';
import { gsap } from 'gsap';

interface AnimatedContentProps {
  children: ReactNode;
  container?: string | HTMLElement | null;
  distance?: number;
  direction?: 'vertical' | 'horizontal';
  reverse?: boolean;
  duration?: number;
  ease?: string;
  initialOpacity?: number;
  animateOpacity?: boolean;
  scale?: number;
  threshold?: number;
  delay?: number;
  onComplete?: () => void;
  dissappearAfter?: number;
  disappearDuration?: number;
  disappearEase?: string;
  onDisappearanceComplete?: () => void;
  className?: string;
}

export default function AnimatedContent({
  children,
  distance = 100,
  direction = 'vertical',
  reverse = false,
  duration = 0.8,
  ease = 'power3.out',
  initialOpacity = 0,
  animateOpacity = true,
  scale = 1,
  delay = 0,
  onComplete,
  dissappearAfter = 0,
  disappearDuration = 0.5,
  disappearEase = 'power3.in',
  onDisappearanceComplete,
  className = ''
}: AnimatedContentProps) {
  const elementRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!elementRef.current || typeof window === 'undefined') return;

    const element = elementRef.current;

    const isVertical = direction === 'vertical';
    const translateProperty = isVertical ? 'y' : 'x';
    const translateValue = reverse ? distance : -distance;

    gsap.set(element, {
      [translateProperty]: translateValue,
      opacity: animateOpacity ? initialOpacity : 1,
      scale: scale
    });

    const tl = gsap.timeline({
      delay: delay,
      onComplete: onComplete
    });

    tl.to(element, {
      [translateProperty]: 0,
      opacity: animateOpacity ? 1 : initialOpacity,
      scale: 1,
      duration: duration,
      ease: ease
    });

    if (dissappearAfter > 0) {
      tl.to(element, {
        [translateProperty]: reverse ? -distance : distance,
        opacity: 0,
        duration: disappearDuration,
        ease: disappearEase,
        delay: dissappearAfter,
        onComplete: onDisappearanceComplete
      });
    }

    return () => {
      tl.kill();
    };
  }, [
    distance,
    direction,
    reverse,
    duration,
    ease,
    initialOpacity,
    animateOpacity,
    scale,
    delay,
    onComplete,
    dissappearAfter,
    disappearDuration,
    disappearEase,
    onDisappearanceComplete
  ]);

  return (
    <div ref={elementRef} className={className}>
      {children}
    </div>
  );
}
