'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, Trash2 } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isPro: boolean;
  /** Resolves with an error message, or null on success (the caller navigates away). */
  onConfirm: () => Promise<string | null>;
}

/**
 * Replaces two chained window.confirm() calls, whose focused OK button meant a
 * stray Enter deleted the account. Focus now opens in the confirm field and
 * submit stays disabled until the confirm word is typed.
 */
export function DeleteAccountDialog({ open, onOpenChange, isPro, onConfirm }: Props) {
  const { t } = useTranslation('settings');
  const [typed, setTyped] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const word = t('deleteDialogConfirmWord');
  const matches = typed.trim().toLowerCase() === word.toLowerCase();

  function handleOpenChange(next: boolean) {
    if (deleting) return;
    if (!next) { setTyped(''); setError(null); }
    onOpenChange(next);
  }

  async function handleDelete(e: React.FormEvent) {
    e.preventDefault();
    if (!matches || deleting) return;
    setDeleting(true);
    setError(null);
    const err = await onConfirm();
    if (err) {
      setError(err);
      setDeleting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md" showCloseButton={!deleting}>
        <form onSubmit={handleDelete} className="space-y-4">
          <DialogHeader>
            <div className="mb-1 flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
              <Trash2 className="h-5 w-5 text-destructive" />
            </div>
            <DialogTitle>{t('deleteDialogTitle')}</DialogTitle>
            <DialogDescription>{t('deleteDialogIntro')}</DialogDescription>
          </DialogHeader>

          <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
            <li>{t('deleteDialogDataPoint')}</li>
            {isPro && <li className="text-foreground">{t('deleteDialogSubscriptionPoint')}</li>}
            <li>{t('deleteDialogExportPoint')}</li>
          </ul>

          <div className="space-y-1.5">
            <label htmlFor="delete-confirm" className="text-sm text-foreground">
              {t('deleteDialogTypeLabelBefore')} <span className="font-mono font-semibold">{word}</span> {t('deleteDialogTypeLabelAfter')}
            </label>
            <Input
              id="delete-confirm"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              disabled={deleting}
            />
          </div>

          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

          <DialogFooter className="gap-2 sm:gap-2">
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={deleting}>
              {t('deleteDialogCancel')}
            </Button>
            <Button type="submit" variant="destructive" disabled={!matches || deleting}>
              {deleting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t('dangerDeletingAccount')}</> : t('deleteDialogConfirm')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
