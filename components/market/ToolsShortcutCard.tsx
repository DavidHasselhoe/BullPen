'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Wrench, Pencil, Check, Minus, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TOOLS, type ToolConfig } from '@/lib/tools/tools-config';
import { ToolPicker } from './ToolPicker';

interface ToolsShortcutCardProps {
  /** Ordered tool ids to show as shortcuts. */
  toolIds: string[];
  className?: string;
  /** When true, shows a pencil → edit mode with add/remove controls. */
  editable?: boolean;
  /** Called with the updated id list when the user adds or removes a tool. */
  onToolsChange?: (ids: string[]) => void;
}

const TOOLS_BY_ID = new Map(TOOLS.map((t) => [t.id, t]));

export function ToolsShortcutCard({
  toolIds,
  className,
  editable = false,
  onToolsChange,
}: ToolsShortcutCardProps) {
  const { t } = useTranslation('market');
  const [isEditing, setIsEditing] = useState(false);

  // Resolve ids → tool config, dropping any unknown/removed ids.
  const tools = useMemo(
    () => toolIds.map((id) => TOOLS_BY_ID.get(id)).filter((t): t is ToolConfig => t != null),
    [toolIds]
  );

  function handleRemove(id: string) {
    onToolsChange?.(toolIds.filter((t) => t !== id));
  }

  function handleAdd(id: string) {
    if (toolIds.includes(id)) return;
    onToolsChange?.([...toolIds, id]);
  }

  const headerControls = editable ? (
    <button
      type="button"
      onClick={() => setIsEditing((v) => !v)}
      className={cn(
        'h-7 w-7 rounded-md flex items-center justify-center transition-colors shrink-0',
        isEditing
          ? 'text-emerald-500 hover:bg-emerald-500/10'
          : 'text-muted-foreground/80 hover:text-foreground hover:bg-muted/60'
      )}
      aria-label={isEditing ? t('shortcutsDoneEditing') : t('shortcutsEditLabel')}
      title={isEditing ? t('shortcutsDone') : t('shortcutsEditLabel')}
    >
      {isEditing ? <Check className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
    </button>
  ) : null;

  return (
    <Card className={cn('border-border/50 min-w-0 overflow-hidden', className)}>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <Wrench className="h-5 w-5 text-primary" />
            {t('shortcutsTitle')}
          </CardTitle>
          {headerControls}
        </div>
      </CardHeader>
      <CardContent className="space-y-1">
        {tools.length === 0 && !isEditing ? (
          <p className="py-2 text-xs text-muted-foreground/80">
            {editable ? t('shortcutsEmptyEditable') : t('shortcutsEmpty')}
          </p>
        ) : (
          tools.map((tool) => {
            const Icon = tool.icon;

            if (isEditing && editable) {
              return (
                <div
                  key={tool.id}
                  className="flex items-center justify-between gap-3 rounded-lg px-2 py-2"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                    </span>
                    <span className="truncate text-sm font-medium text-foreground">{tool.name}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemove(tool.id)}
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-red-500/10 text-red-400 transition-colors hover:bg-red-500/20 hover:text-red-500"
                    aria-label={t('shortcutsRemove', { name: tool.name })}
                    title={t('shortcutsRemove', { name: tool.name })}
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            }

            return (
              <Link
                key={tool.id}
                href={tool.href}
                className="group flex items-center justify-between gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted/60"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted transition-colors group-hover:bg-primary/10">
                    <Icon className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-primary" />
                  </span>
                  <span className="truncate text-sm font-medium text-foreground">{tool.name}</span>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/80 transition-colors group-hover:text-muted-foreground" />
              </Link>
            );
          })
        )}

        {/* Edit-mode adder appears below the list */}
        {isEditing && editable && (
          <div className="pt-1.5">
            <ToolPicker selectedIds={toolIds} onAdd={handleAdd} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
