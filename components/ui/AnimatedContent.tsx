'use client';

import { useEffect, useRef, ReactNode } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

// Register ScrollTrigger plugin
if (typeof window !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger);
}

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
  container = null,
  distance = 100,
  direction = 'vertical',
  reverse = false,
  duration = 0.8,
  ease = 'power3.out',
  initialOpacity = 0,
  animateOpacity = true,
  scale = 1,
  threshold = 0.1,
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
    
    // Set initial state
    const isVertical = direction === 'vertical';
    const translateProperty = isVertical ? 'y' : 'x';
    const translateValue = reverse ? distance : -distance;
    
    gsap.set(element, {
      [translateProperty]: translateValue,
      opacity: animateOpacity ? initialOpacity : 1,
      scale: scale
    });

    // Create animation timeline with ScrollTrigger
    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: element,
        start: 'top 85%',
        toggleActions: 'play none none none',
        containerAnimation: container ? undefined : undefined
      },
      delay: delay,
      onComplete: onComplete
    });

    // Animate in
    tl.to(element, {
      [translateProperty]: 0,
      opacity: animateOpacity ? 1 : initialOpacity,
      scale: 1,
      duration: duration,
      ease: ease
    });

    // Handle disappearance
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
      if (tl.scrollTrigger) {
        tl.scrollTrigger.kill();
      }
      tl.kill();
    };
  }, [
    container,
    distance,
    direction,
    reverse,
    duration,
    ease,
    initialOpacity,
    animateOpacity,
    scale,
    threshold,
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
