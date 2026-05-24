'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Flame, Trophy, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function LessonCompletePage() {
  const params = useSearchParams();
  const router = useRouter();

  const xp = Number(params.get('xp') ?? '0');
  const streak = Number(params.get('streak') ?? '0');
  const courseSlug = params.get('courseSlug') ?? '';
  const courseDone = params.get('courseDone') === '1';

  return (
    <div className="space-y-6 pt-4">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="text-center"
      >
        <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/15 mb-3">
          <Trophy className="h-8 w-8 text-emerald-500" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight">
          {courseDone ? 'Course complete!' : 'Lesson complete'}
        </h1>
        <p className="text-sm text-muted-foreground/70 mt-1">
          {courseDone
            ? 'You finished every lesson in this course. Nice work.'
            : 'Keep the momentum going. One more lesson today and your streak grows.'}
        </p>
      </motion.div>

      <motion.div
        initial="hidden"
        animate="visible"
        variants={{ visible: { transition: { staggerChildren: 0.1, delayChildren: 0.15 } } }}
        className="grid grid-cols-2 gap-3"
      >
        <motion.div
          variants={{ hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0 } }}
          className="rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.05] p-5 text-center"
        >
          <Zap className="h-5 w-5 text-emerald-500 mx-auto mb-2 fill-emerald-500" />
          <div className="text-4xl font-mono font-black tabular-nums text-emerald-400">
            +{xp}
          </div>
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-500/70 mt-1">
            XP earned
          </div>
        </motion.div>

        <motion.div
          variants={{ hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0 } }}
          className="rounded-2xl border border-orange-500/30 bg-orange-500/[0.05] p-5 text-center"
        >
          <Flame className="h-5 w-5 text-orange-400 mx-auto mb-2 fill-orange-400/40" />
          <div className="text-4xl font-mono font-black tabular-nums text-orange-400">
            {streak}
          </div>
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-orange-500/70 mt-1">
            Day streak
          </div>
        </motion.div>
      </motion.div>

      <div className="grid gap-2.5 pt-2">
        {courseSlug && !courseDone && (
          <Button
            size="lg"
            onClick={() => router.push(`/academy/${courseSlug}`)}
            className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-semibold"
          >
            Continue course
          </Button>
        )}
        <Button
          variant="outline"
          size="lg"
          onClick={() => router.push('/academy')}
          className="w-full"
        >
          {courseDone ? 'Pick another course' : 'Back to Academy'}
        </Button>
      </div>
    </div>
  );
}
