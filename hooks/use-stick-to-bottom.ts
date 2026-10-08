'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/** How close to the bottom still counts as "at the bottom", in px. */
const STICK_THRESHOLD = 32;

/**
 * Chat scrolling where the reader has the controls.
 *
 * While stuck to the bottom, the view follows new content as it grows (tokens,
 * tool cards, a table rendering in). The moment the reader scrolls up, by
 * wheel, touch, keyboard or scrollbar, it lets go and stays exactly where they
 * put it, however much more arrives. Scrolling back to the bottom (or calling
 * scrollToBottom) picks the following back up.
 *
 * Ask Bull used to call scrollIntoView({ behavior: 'smooth' }) on every token:
 * scrolling up was undone a few milliseconds later, each call restarted a
 * smooth-scroll animation (the jitter), and scrollIntoView also scrolled the
 * page behind the panel.
 *
 * `scrollRef` goes on the scrolling element, `contentRef` on the single element
 * inside it that holds the messages (its size is what grows).
 */
export function useStickToBottom() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const stuck = useRef(true);
  const lastTop = useRef(0);
  const [isAtBottom, setIsAtBottom] = useState(true);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const el = scrollRef.current;
    if (!el) return;
    stuck.current = true;
    setIsAtBottom(true);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollTo({ top: el.scrollHeight, behavior: reduce ? 'auto' : behavior });
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    const content = contentRef.current;
    if (!el || !content) return;

    const distance = () => el.scrollHeight - el.scrollTop - el.clientHeight;

    const onScroll = () => {
      const d = distance();
      // Moved up: the reader took over. Growth never moves scrollTop up, so
      // this can only be them.
      if (el.scrollTop < lastTop.current - 1 && d > STICK_THRESHOLD) stuck.current = false;
      // Back at the bottom: follow again.
      else if (d <= STICK_THRESHOLD) stuck.current = true;
      lastTop.current = el.scrollTop;
      setIsAtBottom(d <= STICK_THRESHOLD);
    };

    // Intent, before the scroll lands: otherwise the next token arriving
    // between the wheel and the scroll event would snap them back down.
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY < 0) stuck.current = false;
    };
    let touchY = 0;
    const onTouchStart = (e: TouchEvent) => {
      touchY = e.touches[0]?.clientY ?? 0;
    };
    const onTouchMove = (e: TouchEvent) => {
      // Finger moving down the screen scrolls the content up.
      if ((e.touches[0]?.clientY ?? 0) > touchY) stuck.current = false;
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (['ArrowUp', 'PageUp', 'Home'].includes(e.key)) stuck.current = false;
    };

    // Follow growth while stuck. Instant, not smooth: each frame's growth is a
    // few pixels, and a smooth scroll restarted per frame is what juddered.
    const ro = new ResizeObserver(() => {
      if (stuck.current) {
        el.scrollTop = el.scrollHeight;
        lastTop.current = el.scrollTop;
      } else {
        setIsAtBottom(distance() <= STICK_THRESHOLD);
      }
    });
    ro.observe(content);

    el.addEventListener('scroll', onScroll, { passive: true });
    el.addEventListener('wheel', onWheel, { passive: true });
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: true });
    el.addEventListener('keydown', onKeyDown);
    return () => {
      ro.disconnect();
      el.removeEventListener('scroll', onScroll);
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  return { scrollRef, contentRef, isAtBottom, scrollToBottom };
}
