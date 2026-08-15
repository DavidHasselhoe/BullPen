'use client';

import { Reorder } from 'framer-motion';
import { Eye, EyeOff, GripVertical, RotateCcw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  DEFAULT_ORDER,
  getWidget,
  mergeNewWidgets,
} from '@/lib/dashboard/widgets';

interface Props {
  order: string[];
  hidden: string[];
  onChange: (order: string[], hidden: string[]) => void;
}

export function HomepageLayoutEditor({ order, hidden, onChange }: Props) {
  // Always include every known widget in the editor, even if a saved order
  // is missing some (newly added widgets). Drop unknown ids.
  const known = mergeNewWidgets(order.filter((id) => getWidget(id)));

  const hiddenSet = new Set(hidden);

  const toggleHidden = (id: string) => {
    const next = new Set(hiddenSet);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(known, Array.from(next));
  };

  const reset = () => onChange(DEFAULT_ORDER, []);

  const isDefault =
    known.length === DEFAULT_ORDER.length &&
    known.every((id, i) => id === DEFAULT_ORDER[i]) &&
    hidden.length === 0;

  return (
    <div className="space-y-2">
      <Reorder.Group
        axis="y"
        values={known}
        onReorder={(next) => onChange(next, hidden)}
        className="space-y-1.5"
      >
        {known.map((id) => {
          const widget = getWidget(id);
          if (!widget) return null;
          const isHidden = hiddenSet.has(id);
          return (
            <Reorder.Item
              key={id}
              value={id}
              className={cn(
                'flex items-center gap-3 rounded-md border bg-background px-3 py-2.5 cursor-grab active:cursor-grabbing select-none',
                'transition-colors hover:border-foreground/20',
                isHidden && 'opacity-50'
              )}
            >
              <GripVertical className="h-4 w-4 text-muted-foreground/85 shrink-0" />
              <span className="text-sm flex-1 min-w-0 truncate">{widget.label}</span>
              {widget.requiresPro && (
                <Badge variant="secondary" className="text-[11px] px-1.5 py-0 h-4">
                  Pro
                </Badge>
              )}
              <button
                type="button"
                onClick={() => toggleHidden(id)}
                onPointerDown={(e) => e.stopPropagation()}
                className="text-muted-foreground/80 hover:text-foreground transition-colors shrink-0 p-1 -m-1 rounded"
                aria-label={isHidden ? 'Show widget' : 'Hide widget'}
                title={isHidden ? 'Show widget' : 'Hide widget'}
              >
                {isHidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </Reorder.Item>
          );
        })}
      </Reorder.Group>

      {!isDefault && (
        <button
          type="button"
          onClick={reset}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors pt-1"
        >
          <RotateCcw className="h-3 w-3" />
          Reset to default
        </button>
      )}
    </div>
  );
}
