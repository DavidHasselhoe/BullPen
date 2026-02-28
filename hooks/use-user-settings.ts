'use client';

import { useAuth } from '@/hooks/use-auth';

export function useUserSettings() {
  const { user } = useAuth();

  const settings = (user?.settings as any) || {};
  
  // Default to true if not set
  const showQuotes = settings.show_quotes !== undefined ? settings.show_quotes : true;
  const showWelcomeText = settings.show_welcome_text !== undefined ? settings.show_welcome_text : true;

  return {
    showQuotes,
    showWelcomeText,
  };
}
