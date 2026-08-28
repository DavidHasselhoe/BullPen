'use client';

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Search } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { TOOLS } from '@/lib/tools/tools-config';

interface Props {
  /** Tool ids already added — excluded from the picker. */
  selectedIds: string[];
  onAdd: (id: string) => void;
}

/** Popover that lists the tools not yet added as a shortcut. */
export function ToolPicker({ selectedIds, onAdd }: Props) {
  const { t } = useTranslation('market');
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const candidates = useMemo(() => {
    const selected = new Set(selectedIds);
    return TOOLS.filter((t) => t.status !== 'coming-soon' && !selected.has(t.id));
  }, [selectedIds]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter(
      (t) => t.name.toLowerCase().includes(q) || t.description.toLowerCase().includes(q)
    );
  }, [candidates, query]);

  function handlePick(id: string) {
    onAdd(id);
    setQuery('');
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="group flex w-full items-center gap-2 rounded-md border border-dashed border-border/50 px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
          aria-label={t('toolPickerAddTool')}
        >
          <Plus className="h-3.5 w-3.5" />
          <span className="font-medium">{t('toolPickerAddTool')}</span>
        </button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-72 p-0">
        <div className="border-b border-border/50 p-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/80" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('toolPickerSearchPlaceholder')}
              className="h-8 pl-7 text-xs"
              autoFocus
            />
          </div>
        </div>
        <div className="max-h-64 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-muted-foreground">
              {query ? t('toolPickerNoMatches') : t('toolPickerAllAdded')}
            </div>
          ) : (
            filtered.map((tool) => {
              const Icon = tool.icon;
              return (
                <button
                  key={tool.id}
                  type="button"
                  onClick={() => handlePick(tool.id)}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-muted/60"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted">
                    <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                  </span>
                  <span className="flex-1 truncate text-sm font-medium text-foreground">{tool.name}</span>
                </button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
