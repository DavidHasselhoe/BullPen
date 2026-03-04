'use client';

import { Bot } from 'lucide-react';
import { useAIPanel } from './AIPanelProvider';
import { cn } from '@/lib/utils';

export function AIPanelToggle() {
  const { isOpen, toggle } = useAIPanel();

  // Hide when panel is open so it doesn't overlap the input; close via panel X button
  if (isOpen) return null;

  return (
    <button
      onClick={toggle}
      aria-label="Open AI Assistant"
      title="Ask BullPen AI"
      className={cn(
        'fixed bottom-4 right-4 z-50',
        'h-14 px-4 rounded-full shadow-lg shadow-black/25',
        'flex items-center gap-2',
        'bg-primary text-primary-foreground',
        'hover:bg-primary/90 active:scale-[0.98]',
        'transition-all duration-200'
      )}
    >
      <Bot className="h-5 w-5 shrink-0" />
      <span className="text-sm font-medium hidden sm:inline">AI Assistant</span>
    </button>
  );
}
