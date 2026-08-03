'use client';

import { useMutation } from '@tanstack/react-query';
import type { FeedbackType } from '@/app/api/feedback/route';

export interface SubmitFeedbackInput {
  type: FeedbackType;
  title: string;
  description: string;
  pageUrl?: string;
}

/** Submits a bug report or feature request. No cache to invalidate — there's
 *  no "my reports" view yet, just the admin dashboard (which fetches fresh
 *  on its own mount). */
export function useSubmitFeedback() {
  return useMutation({
    mutationFn: async (input: SubmitFeedbackInput): Promise<void> => {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to submit report');
      }
    },
  });
}
