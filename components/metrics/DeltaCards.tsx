'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { DeltaCard } from '@/lib/metrics/metrics-ui';
import { ArrowUp, ArrowDown } from 'lucide-react';

interface DeltaCardsProps {
  qoq: DeltaCard | null;
  yoy: DeltaCard | null;
}

export function DeltaCards({ qoq, yoy }: DeltaCardsProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {qoq && <DeltaCardComponent card={qoq} />}
      {yoy && <DeltaCardComponent card={yoy} />}
    </div>
  );
}

function DeltaCardComponent({ card }: { card: DeltaCard }) {
  const Icon = card.isPositive ? ArrowUp : ArrowDown;
  const colorClass = card.isPositive
    ? 'text-green-600 dark:text-green-400'
    : 'text-red-600 dark:text-red-400';

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {card.label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-baseline gap-2">
          <span className={`text-2xl font-semibold ${colorClass}`}>
            {card.valueFormatted}
          </span>
          <span className={`text-sm font-medium flex items-center gap-1 ${colorClass}`}>
            <Icon className="h-4 w-4" />
            {card.percentage.toFixed(1)}%
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
