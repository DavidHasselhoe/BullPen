'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
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

const TYPE_OPTIONS: { value: FeedbackType; label: string; icon: typeof Bug }[] = [
  { value: 'bug', label: 'Bug', icon: Bug },
  { value: 'feature', label: 'Idea', icon: Lightbulb },
];

const TITLE_MAX = 150;
const DESCRIPTION_MAX = 4000;

export function ReportFeedbackDialog({ open, onOpenChange }: ReportFeedbackDialogProps) {
  const pathname = usePathname();
  const submitFeedback = useSubmitFeedback();

  const [type, setType] = useState<FeedbackType>('bug');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const titleValid = title.trim().length >= 3;
  const descriptionValid = description.trim().length >= 10;
  const canSubmit = titleValid && descriptionValid && !submitFeedback.isPending;

  const reset = () => {
    setType('bug');
    setTitle('');
    setDescription('');
    setSubmitted(false);
    submitFeedback.reset();
  };

  const handleClose = () => {
    onOpenChange(false);
    // Wait for the close transition rather than resetting mid-animation.
    setTimeout(reset, 200);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
      // Error is surfaced inline via submitFeedback.isError below.
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[480px]">
        {submitted ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <div className="rounded-full bg-primary/8 p-3.5">
              <CheckCircle2 className="h-6 w-6 text-primary" />
            </div>
            <DialogHeader>
              <DialogTitle>Thanks for the report</DialogTitle>
              <DialogDescription>
                {type === 'bug'
                  ? "We'll take a look. No need to send it again."
                  : "We read every idea that comes in, even the ones we can't get to right away."}
              </DialogDescription>
            </DialogHeader>
            <Button onClick={handleClose} className="mt-1">
              Close
            </Button>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Report a bug or idea</DialogTitle>
              <DialogDescription>
                Tell us what&rsquo;s wrong or what you&rsquo;d like to see. The page you&rsquo;re on comes
                along automatically.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label>Type</Label>
                <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Report type">
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
                          'flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-all',
                          active
                            ? 'border-primary bg-primary/8 text-primary'
                            : 'border-input text-muted-foreground hover:text-foreground hover:border-foreground/30'
                        )}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="feedback-title">Title</Label>
                <Input
                  id="feedback-title"
                  placeholder={type === 'bug' ? 'e.g. Chart tooltip shows wrong price' : 'e.g. Dark mode for the calendar'}
                  value={title}
                  onChange={(e) => setTitle(e.target.value.slice(0, TITLE_MAX))}
                  maxLength={TITLE_MAX}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="feedback-description">
                  {type === 'bug' ? 'What happened, and what did you expect?' : 'What would this do for you?'}
                </Label>
                <Textarea
                  id="feedback-description"
                  rows={4}
                  placeholder={
                    type === 'bug'
                      ? 'Steps to reproduce help the most.'
                      : "The more context, the better we can judge fit."
                  }
                  value={description}
                  onChange={(e) => setDescription(e.target.value.slice(0, DESCRIPTION_MAX))}
                  maxLength={DESCRIPTION_MAX}
                />
              </div>

              <div className="flex justify-end gap-3">
                <Button type="button" variant="outline" onClick={handleClose}>
                  Cancel
                </Button>
                <Button type="submit" disabled={!canSubmit}>
                  {submitFeedback.isPending ? 'Sending...' : 'Send'}
                </Button>
              </div>

              {submitFeedback.isError && (
                <div className="text-sm text-red-600 dark:text-red-400">
                  {submitFeedback.error instanceof Error
                    ? submitFeedback.error.message
                    : 'Failed to submit report'}
                </div>
              )}
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
