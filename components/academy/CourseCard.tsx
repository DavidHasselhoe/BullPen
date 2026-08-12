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

// Per-course accent, keyed by the `color` column on academy_courses (already
// populated per course, previously unused — every card rendered identical
// emerald regardless of topic). Tailwind needs the full class string present
// verbatim in source to pick it up in the build, so this is a static map
// rather than `bg-${color}-500/10` interpolation.
interface ColorStyle {
  iconBg: string;
  iconText: string;
  gradient: string;
  hoverBorder: string;
}

const COLOR_STYLES: Record<string, ColorStyle> = {
  emerald: { iconBg: 'bg-emerald-500/10', iconText: 'text-emerald-500', gradient: 'from-emerald-500/[0.04]', hoverBorder: 'hover:border-emerald-500/30' },
  blue:    { iconBg: 'bg-blue-500/10',    iconText: 'text-blue-500',    gradient: 'from-blue-500/[0.04]',    hoverBorder: 'hover:border-blue-500/30' },
  sky:     { iconBg: 'bg-sky-500/10',     iconText: 'text-sky-500',     gradient: 'from-sky-500/[0.04]',     hoverBorder: 'hover:border-sky-500/30' },
  indigo:  { iconBg: 'bg-indigo-500/10',  iconText: 'text-indigo-500',  gradient: 'from-indigo-500/[0.04]',  hoverBorder: 'hover:border-indigo-500/30' },
  violet:  { iconBg: 'bg-violet-500/10',  iconText: 'text-violet-500',  gradient: 'from-violet-500/[0.04]',  hoverBorder: 'hover:border-violet-500/30' },
  amber:   { iconBg: 'bg-amber-500/10',   iconText: 'text-amber-500',   gradient: 'from-amber-500/[0.04]',   hoverBorder: 'hover:border-amber-500/30' },
};

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
  const colorStyle = COLOR_STYLES[course.color] ?? COLOR_STYLES.emerald;

  const content = (
    <motion.div
      whileHover={!course.isLocked || isProLocked ? { y: -2 } : undefined}
      whileTap={!course.isLocked || isProLocked ? { scale: 0.99 } : undefined}
      transition={{ duration: 0.15 }}
      className={cn(
        'group relative rounded-2xl border p-5 sm:p-6',
        'bg-gradient-to-br to-transparent',
        colorStyle.gradient,
        'border-border/40',
        isProgressionLocked && 'opacity-55 cursor-not-allowed',
        isProLocked && 'hover:border-amber-400/40 cursor-pointer transition-colors',
        !course.isLocked && cn(colorStyle.hoverBorder, 'cursor-pointer transition-colors')
      )}
    >
      {isProLocked && (
        <span className="absolute right-4 top-4 text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-400/10 text-amber-500">
          Pro
        </span>
      )}

      <div className="flex items-start justify-between gap-3 mb-3">
        <div className={cn('h-11 w-11 rounded-xl flex items-center justify-center shrink-0', colorStyle.iconBg)}>
          {course.isLocked ? (
            <Lock className="h-5 w-5 text-muted-foreground/80" />
          ) : (
            <CourseIcon name={course.icon} className={cn('h-5 w-5', colorStyle.iconText)} />
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
      <p className="text-sm text-muted-foreground/85 leading-relaxed line-clamp-3">
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
        <span className="text-[10px] font-mono uppercase tracking-[0.15em] text-muted-foreground/85">
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
