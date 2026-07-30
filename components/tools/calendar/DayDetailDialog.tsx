'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DetailEventRow } from './EventRows';
import { fmtDayHeader } from './format';
import type { DayModel } from './types';

interface DayDetailDialogProps {
  model: DayModel | null;
  onOpenChange: (open: boolean) => void;
}

export function DayDetailDialog({ model, onOpenChange }: DayDetailDialogProps) {
  return (
    <Dialog open={model !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{model ? fmtDayHeader(model.date) : ''}</DialogTitle>
        </DialogHeader>
        {model && (
          <div className="divide-y divide-border/40">
            {[...model.mine, ...model.others].map((event, i) => (
              <DetailEventRow key={`${event.type}-${event.symbol}-${i}`} event={event} />
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
