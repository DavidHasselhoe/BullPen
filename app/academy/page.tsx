'use client';

import { motion } from 'framer-motion';
import { GraduationCap } from 'lucide-react';
import { CourseCard } from '@/components/academy/CourseCard';
import { DailyChallengeCard } from '@/components/academy/DailyChallengeCard';
import { useAcademyCourses } from '@/hooks/use-user-progress';
import { useAcademyStats } from '@/hooks/use-academy-stats';
import { Skeleton } from '@/components/ui/skeleton';

export default function AcademyHomePage() {
  const { data: courses, isLoading } = useAcademyCourses();
  const { data: stats } = useAcademyStats();
  const isFirstVisit = (stats?.totalXp ?? 0) === 0;

  return (
    <div className="space-y-6 pt-2">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <GraduationCap className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Academy</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Bite-sized lessons that teach you how investing actually works. Earn XP, build a streak.
          </p>
        </div>
      </div>

      {isFirstVisit && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="flex items-center gap-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.04] px-5 py-4"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/illustrations/bull-welcome.png"
            alt=""
            aria-hidden
            className="h-16 w-16 shrink-0 opacity-95 dark:invert"
          />
          <div>
            <p className="text-sm font-semibold text-foreground">Welcome to Academy</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Start with the first course below — a few minutes a day builds real investing knowledge.
            </p>
          </div>
        </motion.div>
      )}

      {/* Daily challenge */}
      <DailyChallengeCard />

      {/* Course grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-44 rounded-2xl" />
          ))}
        </div>
      ) : courses && courses.length > 0 ? (
        <motion.div
          initial="hidden"
          animate="visible"
          variants={{ visible: { transition: { staggerChildren: 0.06 } } }}
          className="grid grid-cols-1 sm:grid-cols-2 gap-3"
        >
          {courses.map((course) => (
            <motion.div
              key={course.id}
              variants={{
                hidden: { opacity: 0, y: 12 },
                visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' } },
              }}
            >
              <CourseCard course={course} />
            </motion.div>
          ))}
        </motion.div>
      ) : (
        <div className="py-20 text-center text-sm text-muted-foreground">
          No courses available yet.
        </div>
      )}
    </div>
  );
}
