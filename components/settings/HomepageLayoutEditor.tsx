'use client';

import { Reorder } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronUp, Eye, EyeOff, GripVertical, RotateCcw } from 'lucide-react';
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

const iconButton =
  'flex h-8 w-8 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-30';

export function HomepageLayoutEditor({ order, hidden, onChange }: Props) {
  const { t } = useTranslation('settings');
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

  // Drag was the only way to reorder, so keyboard and switch users couldn't.
  const move = (index: number, by: -1 | 1) => {
    const next = [...known];
    const [item] = next.splice(index, 1);
    next.splice(index + by, 0, item);
    onChange(next, hidden);
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
        {known.map((id, index) => {
          const widget = getWidget(id);
          if (!widget) return null;
          const name = t(`homeWidget_${id}`, { defaultValue: widget.label });
          const isHidden = hiddenSet.has(id);
          return (
            <Reorder.Item
              key={id}
              value={id}
              className={cn(
                'flex items-center gap-2 rounded-md border bg-background py-1.5 pl-3 pr-1.5 cursor-grab active:cursor-grabbing select-none',
                'transition-colors hover:border-foreground/20'
              )}
            >
              <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden />
              {/* clamp-ok: a short fixed section name */}
              <span className={cn('min-w-0 flex-1 truncate text-sm', isHidden && 'text-muted-foreground line-through decoration-muted-foreground/50')}>{name}</span>
              <button
                type="button"
                onClick={() => move(index, -1)}
                onPointerDown={(e) => e.stopPropagation()}
                disabled={index === 0}
                className={iconButton}
                aria-label={t('layoutMoveUp', { name })}
              >
                <ChevronUp className="h-4 w-4" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => move(index, 1)}
                onPointerDown={(e) => e.stopPropagation()}
                disabled={index === known.length - 1}
                className={iconButton}
                aria-label={t('layoutMoveDown', { name })}
              >
                <ChevronDown className="h-4 w-4" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => toggleHidden(id)}
                onPointerDown={(e) => e.stopPropagation()}
                className={iconButton}
                aria-label={isHidden ? t('layoutShowWidget', { name }) : t('layoutHideWidget', { name })}
                aria-pressed={!isHidden}
              >
                {isHidden ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
              </button>
            </Reorder.Item>
          );
        })}
      </Reorder.Group>

      {!isDefault && (
        <button
          type="button"
          onClick={reset}
          className="flex min-h-9 items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <RotateCcw className="h-3 w-3" aria-hidden />
          {t('layoutReset')}
        </button>
      )}
    </div>
  );
}
