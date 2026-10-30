'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { Bug, Lightbulb, CheckCircle2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { useSubmitFeedback } from '@/hooks/use-feedback';
import type { FeedbackType } from '@/app/api/feedback/route';

interface ReportFeedbackDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const TYPE_OPTIONS: { value: FeedbackType; labelKey: string; icon: typeof Bug }[] = [
  { value: 'bug', labelKey: 'feedbackTypeBug', icon: Bug },
  { value: 'feature', labelKey: 'feedbackTypeIdea', icon: Lightbulb },
];

// Same limits as app/api/feedback/route.ts.
const TITLE_MIN = 3;
const TITLE_MAX = 150;
const DESCRIPTION_MIN = 10;
const DESCRIPTION_MAX = 4000;

export function ReportFeedbackDialog({ open, onOpenChange }: ReportFeedbackDialogProps) {
  const { t } = useTranslation('common');
  const pathname = usePathname();
  const submitFeedback = useSubmitFeedback();

  const [type, setType] = useState<FeedbackType>('bug');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const titleValid = title.trim().length >= TITLE_MIN;
  const descriptionValid = description.trim().length >= DESCRIPTION_MIN;
  const canSubmit = titleValid && descriptionValid && !submitFeedback.isPending;
  // Only once they've started: an empty form doesn't need telling it's empty.
  const started = title.length > 0 || description.length > 0;
  const missing = !titleValid ? t('feedbackNeedsTitle') : !descriptionValid ? t('feedbackNeedsDescription') : null;

  const reset = () => {
    setType('bug');
    setTitle('');
    setDescription('');
    setSubmitted(false);
    submitFeedback.reset();
  };

  // A stray click outside or Esc used to throw the draft away. Keep it until
  // it has been sent, so reopening picks up where they left off.
  const handleClose = () => {
    onOpenChange(false);
    if (submitted) setTimeout(reset, 200);
  };

  const submit = async () => {
    if (!canSubmit) return;
    try {
      await submitFeedback.mutateAsync({
        type,
        title: title.trim(),
        description: description.trim(),
        pageUrl: pathname,
      });
      setSubmitted(true);
    } catch {
      // Shown inline via submitFeedback.isError below.
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[480px]">
        {submitted ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <div className="rounded-full bg-primary/8 p-3.5">
              <CheckCircle2 className="h-6 w-6 text-primary" aria-hidden />
            </div>
            <DialogHeader>
              <DialogTitle>{t('feedbackThanksTitle')}</DialogTitle>
              <DialogDescription>
                {type === 'bug' ? t('feedbackThanksBug') : t('feedbackThanksIdea')}
              </DialogDescription>
            </DialogHeader>
            <Button onClick={handleClose} className="mt-1">
              {t('feedbackClose')}
            </Button>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{t('feedbackTitle')}</DialogTitle>
              <DialogDescription>{t('feedbackSubtitle')}</DialogDescription>
            </DialogHeader>

            <form
              onSubmit={(e) => { e.preventDefault(); void submit(); }}
              // Ctrl/Cmd+Enter sends from either field, as in most chat and issue forms.
              onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void submit(); } }}
              className="min-w-0 space-y-5"
            >
              <div className="space-y-2">
                <Label id="feedback-type-label">{t('feedbackTypeLabel')}</Label>
                <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-labelledby="feedback-type-label">
                  {TYPE_OPTIONS.map((option) => {
                    const Icon = option.icon;
                    const active = type === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => setType(option.value)}
                        className={cn(
                          'flex min-h-11 items-center justify-center gap-2 rounded-md border px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          active
                            ? 'border-foreground bg-foreground/5 text-foreground'
                            : 'border-input text-muted-foreground hover:border-foreground/30 hover:text-foreground'
                        )}
                      >
                        <Icon className="h-4 w-4" aria-hidden />
                        {t(option.labelKey)}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="feedback-title">{t('feedbackTitleLabel')}</Label>
                <Input
                  id="feedback-title"
                  placeholder={type === 'bug' ? t('feedbackTitlePlaceholderBug') : t('feedbackTitlePlaceholderIdea')}
                  value={title}
                  onChange={(e) => setTitle(e.target.value.slice(0, TITLE_MAX))}
                  maxLength={TITLE_MAX}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="feedback-description">
                  {type === 'bug' ? t('feedbackDescriptionLabelBug') : t('feedbackDescriptionLabelIdea')}
                </Label>
                <Textarea
                  id="feedback-description"
                  rows={4}
                  // Grows with the text up to a point, then scrolls inside the dialog.
                  className="max-h-60 overflow-y-auto break-words"
                  placeholder={type === 'bug' ? t('feedbackDescriptionPlaceholderBug') : t('feedbackDescriptionPlaceholderIdea')}
                  value={description}
                  onChange={(e) => setDescription(e.target.value.slice(0, DESCRIPTION_MAX))}
                  maxLength={DESCRIPTION_MAX}
                />
                {description.length > DESCRIPTION_MAX * 0.9 && (
                  <p className="text-right text-xs tabular-nums text-muted-foreground">
                    {t('feedbackCharsLeft', { count: DESCRIPTION_MAX - description.length })}
                  </p>
                )}
              </div>

              {submitFeedback.isError && (
                <p role="alert" className="text-sm text-red-600 dark:text-red-400">{t('feedbackSendFailed')}</p>
              )}

              <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-2">
                {started && missing && (
                  <p className="mr-auto text-xs text-muted-foreground" aria-live="polite">{missing}</p>
                )}
                <Button type="button" variant="outline" onClick={handleClose}>
                  {t('feedbackCancel')}
                </Button>
                <Button type="submit" disabled={!canSubmit}>
                  {submitFeedback.isPending ? t('feedbackSending') : t('feedbackSend')}
                </Button>
              </div>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
