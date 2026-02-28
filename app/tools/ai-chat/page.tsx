'use client';

import { BullpenChat } from '@/components/ai/BullpenChat';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MessageSquare } from 'lucide-react';

export default function AIChatPage() {
  return (
    <div className="container mx-auto max-w-3xl py-8 px-4">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-foreground flex items-center gap-2">
          <MessageSquare className="h-6 w-6" />
          BullPen AI
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Investment research assistant — ask about SEC filings, metrics, or concepts
        </p>
      </div>
      <BullpenChat />
    </div>
  );
}
