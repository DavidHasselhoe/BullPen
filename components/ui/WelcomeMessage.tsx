'use client';

import TextType from '@/components/ui/TextType';
import { useAuth } from '@/hooks/use-auth';

export function WelcomeMessage() {
  const { user, isAuthenticated, isLoading } = useAuth();

  // Don't show while loading or if not authenticated (guests are not logged in)
  if (isLoading || !isAuthenticated || !user) {
    return null;
  }

  // Get display name
  const displayName = user.full_name || user.username || user.email?.split('@')[0] || 'User';

  return (
    <div className="mb-6">
      <h2 className="text-2xl font-semibold text-foreground">
        <TextType
          text={`Welcome ${displayName}`}
          typingSpeed={75}
          pauseDuration={2000}
          showCursor={true}
          cursorCharacter="_"
          loop={false}
          as="span"
        />
      </h2>
    </div>
  );
}
