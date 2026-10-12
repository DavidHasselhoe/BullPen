'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useCreateWatchlistList, useUpdateWatchlistList, type WatchlistList } from '@/hooks/use-watchlist';
import { cn } from '@/lib/utils';

const PRESET_COLORS = ['#6366F1', '#10B981', '#F59E0B', '#EF4444', '#3B82F6', '#8B5CF6'];

interface CreateListDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (listId: string) => void;
  /** Edit this list instead of creating one. Give the dialog a `key` per list so its fields reset. */
  list?: WatchlistList | null;
}

export function CreateListDialog({ open, onOpenChange, onCreated, list }: CreateListDialogProps) {
  const { t } = useTranslation('watchlist');
  const [name, setName] = useState(list?.name ?? '');
  const [color, setColor] = useState<string | null>(list?.color ?? null);
  const createList = useCreateWatchlistList();
  const updateList = useUpdateWatchlistList();
  const pending = createList.isPending || updateList.isPending;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    if (list) {
      await updateList.mutateAsync({ listId: list.id, name: name.trim(), color }).catch(() => {});
      onOpenChange(false);
      return;
    }

    const result = await createList.mutateAsync({ name: name.trim(), color });
    if (result.success && result.list) {
      onCreated?.(result.list.id);
      setName('');
      setColor(null);
      onOpenChange(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{list ? t('editListTitle') : t('createListTitle')}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            placeholder={t('createListNamePlaceholder')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            autoFocus
          />

          <div>
            <p className="text-xs text-muted-foreground mb-2">{t('createListColorLabel')}</p>
            <div className="flex gap-2">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(color === c ? null : c)}
                  className={cn(
                    'h-6 w-6 rounded-full border-2 transition-transform',
                    color === c ? 'border-foreground scale-110' : 'border-transparent'
                  )}
                  style={{ backgroundColor: c }}
                  aria-label={c}
                  aria-pressed={color === c}
                />
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t('createListCancel')}
            </Button>
            <Button type="submit" disabled={!name.trim() || pending}>
              {list
                ? (pending ? t('editListSaving') : t('editListSave'))
                : (pending ? t('createListCreating') : t('createListCreate'))}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
