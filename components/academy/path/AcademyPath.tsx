'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { groupIntoChapters, findCurrentCourse, nodeOffset } from '@/lib/academy/path-chapters';
import { ChapterBanner } from './ChapterBanner';
import { PathNode } from './PathNode';
import type { CourseWithProgress } from '@/types/academy';

interface Props {
  courses: CourseWithProgress[];
}

interface PathD {
  done: string;
  todo: string;
}

/**
 * The /academy course list rendered as a winding progression path instead of
 * a flat grid — courses grouped into chapters, gated sequentially exactly as
 * today (see app/api/academy/courses/route.ts), with the connector line
 * drawn from each node's actual rendered position rather than hand-plotted
 * coordinates, so it never drifts out of sync with the content.
 */
export function AcademyPath({ courses }: Props) {
  const shellRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const [pathD, setPathD] = useState<PathD>({ done: '', todo: '' });
  const [svgSize, setSvgSize] = useState({ width: 0, height: 0 });

  const currentCourse = findCurrentCourse(courses);
  const chapters = groupIntoChapters(courses);
  // Below ~420px, a full-magnitude zigzag offset combined with a left-aligned
  // label can push text past the viewport edge — scale the offset down once
  // the measured shell (not the raw window) gets that narrow.
  const offsetScale = svgSize.width > 0 && svgSize.width < 420 ? 0.4 : 1;

  const registerNode = useCallback((id: string, el: HTMLDivElement | null) => {
    if (el) nodeRefs.current.set(id, el);
    else nodeRefs.current.delete(id);
  }, []);

  const measure = useCallback(() => {
    const shell = shellRef.current;
    if (!shell) return;
    const shellRect = shell.getBoundingClientRect();

    const points = courses
      .map((c) => {
        const el = nodeRefs.current.get(c.id);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return {
          x: r.left + r.width / 2 - shellRect.left,
          y: r.top + r.height / 2 - shellRect.top,
          done: c.isCompleted,
        };
      })
      .filter((p): p is { x: number; y: number; done: boolean } => p !== null);

    if (points.length < 2) {
      setPathD({ done: '', todo: '' });
      setSvgSize({ width: shellRect.width, height: shellRect.height });
      return;
    }

    let done = '';
    let todo = '';
    let doneStarted = false;
    let todoStarted = false;

    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1];
      const b = points[i];
      const midY = (a.y + b.y) / 2;
      const seg = ` C ${a.x} ${midY}, ${b.x} ${midY}, ${b.x} ${b.y}`;
      if (a.done && b.done) {
        if (!doneStarted) { done += `M ${a.x} ${a.y}`; doneStarted = true; }
        done += seg;
      } else {
        if (!todoStarted) { todo += `M ${a.x} ${a.y}`; todoStarted = true; }
        todo += seg;
      }
    }

    setPathD({ done, todo });
    setSvgSize({ width: shellRect.width, height: shellRect.height });
  }, [courses]);

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;
    // ResizeObserver's callback fires once asynchronously right after
    // observe() with the initial size, so this covers first paint AND
    // subsequent resizes without a synchronous setState call in the effect
    // body itself.
    const ro = new ResizeObserver(() => measure());
    ro.observe(shell);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [measure]);

  return (
    <div ref={shellRef} className="relative">
      <svg
        className="pointer-events-none absolute inset-0"
        width={svgSize.width}
        height={svgSize.height}
        viewBox={`0 0 ${svgSize.width} ${svgSize.height}`}
        aria-hidden="true"
      >
        <path d={pathD.todo} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="text-border" />
        <path d={pathD.done} fill="none" stroke="rgb(34,197,94)" strokeWidth="2.5" strokeLinecap="round" opacity="0.55" />
      </svg>

      <motion.ol
        initial="hidden"
        animate="visible"
        variants={{ visible: { transition: { staggerChildren: 0.04 } } }}
        className="relative z-[1] flex list-none flex-col"
      >
        {chapters.map((chapter, ci) => (
          <li key={chapter.label ?? `chapter-${ci}`}>
            {chapter.label && (
              <ChapterBanner
                label={chapter.label}
                courseCount={chapter.courses.length}
                requiresPro={chapter.courses[0]?.requiresPro ?? false}
              />
            )}
            <ol className="list-none">
              {chapter.courses.map((course) => {
                const globalIndex = courses.findIndex((c) => c.id === course.id);
                return (
                  <motion.li
                    key={course.id}
                    variants={{
                      hidden: { opacity: 0, y: 10 },
                      visible: { opacity: 1, y: 0, transition: { duration: 0.25, ease: 'easeOut' } },
                    }}
                  >
                    <PathNode
                      course={course}
                      isCurrent={currentCourse?.id === course.id}
                      offset={nodeOffset(globalIndex) * offsetScale}
                      align={globalIndex % 2 === 0 ? 'right' : 'left'}
                      circleRef={(el) => registerNode(course.id, el)}
                    />
                  </motion.li>
                );
              })}
            </ol>
          </li>
        ))}
      </motion.ol>
    </div>
  );
}
