'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import * as Icons from 'lucide-react';
import { Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CourseWithProgress } from '@/types/academy';

interface Props {
  course: CourseWithProgress;
}

const RING_R = 22;
const RING_C = 2 * Math.PI * RING_R;

function CourseIcon({ name, className }: { name: string; className?: string }) {
  // Cast Icons to a record so we can look up by name; fallback to BookOpen
  const map = Icons as unknown as Record<string, React.FC<{ className?: string }>>;
  const Cmp = map[name] ?? Icons.BookOpen;
  return <Cmp className={className} />;
}

export function CourseCard({ course }: Props) {
  const pct = course.percentComplete;
  const dashOffset = RING_C * (1 - pct / 100);
  const isProLocked = course.lockedReason === 'pro';
  const isProgressionLocked = course.lockedReason === 'progression';

  const content = (
    <motion.div
      whileHover={!course.isLocked || isProLocked ? { y: -2 } : undefined}
      whileTap={!course.isLocked || isProLocked ? { scale: 0.99 } : undefined}
      transition={{ duration: 0.15 }}
      className={cn(
        'group relative rounded-2xl border p-5 sm:p-6',
        'bg-gradient-to-br from-emerald-500/[0.04] to-transparent',
        'border-border/40',
        isProgressionLocked && 'opacity-55 cursor-not-allowed',
        isProLocked && 'hover:border-amber-400/40 cursor-pointer transition-colors',
        !course.isLocked && 'hover:border-emerald-500/30 cursor-pointer transition-colors'
      )}
    >
      {isProLocked && (
        <span className="absolute right-4 top-4 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-400/10 text-amber-500">
          Pro
        </span>
      )}

      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="h-11 w-11 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0">
          {course.isLocked ? (
            <Lock className="h-5 w-5 text-muted-foreground/60" />
          ) : (
            <CourseIcon name={course.icon} className="h-5 w-5 text-emerald-500" />
          )}
        </div>

        {/* Progress ring — rotate the circles only (so the arc starts at 12 o'clock)
            and leave the text upright. */}
        <svg viewBox="0 0 56 56" className="h-12 w-12 shrink-0">
          <g transform="rotate(-90 28 28)">
            <circle
              cx="28"
              cy="28"
              r={RING_R}
              fill="none"
              stroke="rgba(255,255,255,0.08)"
              strokeWidth="3"
            />
            <circle
              cx="28"
              cy="28"
              r={RING_R}
              fill="none"
              stroke="rgb(34,197,94)"
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={RING_C.toFixed(2)}
              strokeDashoffset={dashOffset.toFixed(2)}
              className="transition-[stroke-dashoffset] duration-700 ease-out"
            />
          </g>
          <text
            x="28"
            y="32"
            textAnchor="middle"
            className="text-[10px] font-mono font-bold"
            fill="currentColor"
          >
            {pct}%
          </text>
        </svg>
      </div>

      <h3 className="text-lg font-bold tracking-tight leading-tight mb-1">{course.title}</h3>
      <p className="text-sm text-muted-foreground/70 leading-relaxed line-clamp-3">
        {course.description}
      </p>
      <div className="mt-3 flex items-center gap-2">
        {course.difficulty && (
          <span className={cn(
            'text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded',
            course.difficulty === 'beginner' && 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
            course.difficulty === 'intermediate' && 'bg-amber-400/10 text-amber-500',
            course.difficulty === 'advanced' && 'bg-red-500/10 text-red-500',
          )}>
            {course.difficulty}
          </span>
        )}
        {course.isOptional && (
          <span className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-500">
            Optional
          </span>
        )}
        <span className="text-[10px] font-mono uppercase tracking-[0.15em] text-muted-foreground/50">
          {course.completedLessons}/{course.totalLessons} lessons
        </span>
      </div>
    </motion.div>
  );

  if (isProgressionLocked) return content;
  return (
    <Link href={isProLocked ? '/upgrade' : `/academy/${course.slug}`} className="block">
      {content}
    </Link>
  );
}
