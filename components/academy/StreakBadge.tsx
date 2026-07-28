'use client';

import { motion } from 'framer-motion';
import { Flame } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  streak: number;
  lastActivityDate: string | null;
}

function todayInET(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

export function StreakBadge({ streak, lastActivityDate }: Props) {
  const isActiveToday = lastActivityDate === todayInET();
  const isDim = streak === 0;

  return (
    <motion.div
      animate={
        isActiveToday
          ? { scale: [1, 1.06, 1] }
          : undefined
      }
      transition={
        isActiveToday
          ? { duration: 2.4, repeat: Infinity, ease: 'easeInOut' }
          : undefined
      }
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold tabular-nums shrink-0',
        isDim
          ? 'bg-muted/30 text-muted-foreground/80'
          : isActiveToday
            ? 'bg-orange-500/15 text-orange-400'
            : 'bg-orange-500/10 text-orange-400/70'
      )}
      title={`${streak}-day streak`}
    >
      <Flame
        className={cn('h-3 w-3', isActiveToday && !isDim && 'fill-orange-400/40')}
      />
      {streak}
    </motion.div>
  );
}
