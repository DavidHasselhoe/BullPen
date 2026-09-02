'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useRouter } from 'next/navigation';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { motion, AnimatePresence } from 'framer-motion';
import { signInWithGoogle } from '@/lib/auth/auth';
import { getLastUsedAuthMethod } from '@/lib/auth/last-used-method';
import { AuthOAuthButtons } from './AuthOAuthButtons';
import { AuthFormLogin } from './AuthFormLogin';
import { AuthFormSignup } from './AuthFormSignup';
import { AuthFormForgotPassword } from './AuthFormForgotPassword';
import { trackEvent } from '@/lib/analytics/track';
import { cn } from '@/lib/utils';

export type AuthMode = 'login' | 'signup' | 'forgot-password';

interface AuthModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialMode?: AuthMode;
  redirectTo?: string;
  // Dialog portals to document.body, outside any local theme override — set
  // by LandingClient only, since that page can now default to a different
  // theme than <html>'s app-wide one (ThemeProvider, dark by default for any
  // guest). See the .landing-force-light rule in app/globals.css and
  // UserMenu's forceDark/forceLight, the same fix for the same class of bug.
  forceLight?: boolean;
}

export function AuthModal({ open, onOpenChange, initialMode = 'login', redirectTo, forceLight = false }: AuthModalProps) {
  const { t } = useTranslation('auth');
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [error, setError] = useState('');
  const [lastUsedGoogle, setLastUsedGoogle] = useState(false);

  useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: reset form state when modal opens
      setMode(initialMode);

      setError('');
      setLastUsedGoogle(getLastUsedAuthMethod() === 'google');
    }
  }, [open, initialMode]);

  const handleGoogleAuth = async () => {
    setError('');
    setIsGoogleLoading(true);
    const eventBase = mode === 'signup' ? 'signup_form' : 'login_form';
    trackEvent(`${eventBase}_submitted`, { source: 'modal', method: 'google' });

    try {
      const result = await signInWithGoogle(redirectTo);
      if (!result.success) {
        setError(result.error || t('modalGoogleFailed'));
        setIsGoogleLoading(false);
        trackEvent(`${eventBase}_failed`, { source: 'modal', method: 'google' });
      }
      // If successful, redirect will happen automatically via OAuth flow
    } catch (err) {
      setError(err instanceof Error ? err.message : t('unexpectedError'));
      setIsGoogleLoading(false);
      trackEvent(`${eventBase}_failed`, { source: 'modal', method: 'google' });
    }
  };

  const handleSuccess = () => {
    onOpenChange(false);
    router.replace(redirectTo || '/');
  };

  const handleModeChange = (newMode: AuthMode) => {
    setMode(newMode);
    setError('');
  };

  const getTitle = () => {
    switch (mode) {
      case 'login':
        return t('modalTitleLogin');
      case 'signup':
        return t('modalTitleSignup');
      case 'forgot-password':
        return t('modalTitleForgotPassword');
      default:
        return t('modalTitleDefault');
    }
  };

  const getDescription = () => {
    switch (mode) {
      case 'login':
        return t('modalDescriptionLogin');
      case 'signup':
        return t('modalDescriptionSignup');
      case 'forgot-password':
        return t('modalDescriptionForgotPassword');
      default:
        return '';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* text-foreground explicit: components/ui/dialog.tsx's DialogContent never
          sets it (unlike dropdown-menu.tsx's text-popover-foreground), so it was
          only ever getting the right color by inheriting whatever <body>'s
          already-resolved (theme-dependent) color happened to be — invisible
          everywhere else, but broke the moment forceLight redefines --foreground
          locally: a variable redefinition doesn't retroactively change an
          already-inherited `color` value unless something re-references the
          variable within the overridden subtree. */}
      <DialogContent className={cn('max-w-md p-0 sm:p-8 gap-0 text-foreground', forceLight && 'landing-force-light')}>
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="p-6 sm:p-0 space-y-6"
        >
          {/* Header */}
          <DialogHeader className="space-y-2 text-center sm:text-left">
            <DialogTitle className="text-xl font-semibold">{getTitle()}</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              {getDescription()}
            </DialogDescription>
          </DialogHeader>

          {/* Mode Toggle (Desktop) */}
          <div className="hidden sm:block">
            <Tabs value={mode} onValueChange={(v) => handleModeChange(v as AuthMode)}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="login">{t('loginSubmit')}</TabsTrigger>
                <TabsTrigger value="signup">{t('modalSignUp')}</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {/* OAuth Buttons - First class placement */}
          {mode !== 'forgot-password' && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: 0.05 }}
            >
              <AuthOAuthButtons
                onGoogleClick={handleGoogleAuth}
                isLoading={isGoogleLoading}
                disabled={false}
                lastUsed={lastUsedGoogle}
              />
            </motion.div>
          )}

          {error && (
            <div
              className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive"
              role="alert"
            >
              {error}
            </div>
          )}

          {/* Divider */}
          {mode !== 'forgot-password' && (
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <Separator />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">{t('modalOrContinueWithEmail')}</span>
              </div>
            </div>
          )}

          {/* Forms */}
          <AnimatePresence mode="wait" initial={false}>
            {mode === 'login' && (
              <AuthFormLogin
                key="login"
                onSuccess={handleSuccess}
                onError={setError}
                onForgotPassword={() => handleModeChange('forgot-password')}
                redirectTo={redirectTo}
                source="modal"
              />
            )}

            {mode === 'signup' && (
              <AuthFormSignup
                key="signup"
                onSuccess={handleSuccess}
                onError={setError}
                source="modal"
              />
            )}

            {mode === 'forgot-password' && (
              <AuthFormForgotPassword key="forgot-password" onBack={() => handleModeChange('login')} />
            )}
          </AnimatePresence>

          {/* Footer Links */}
          {mode !== 'forgot-password' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.2, delay: 0.1 }}
              className="text-center space-y-2"
            >
              <p className="text-sm text-muted-foreground">
                {mode === 'login' ? (
                  <>
                    {t('modalNoAccount')}{' '}
                    <button
                      type="button"
                      onClick={() => handleModeChange('signup')}
                      className="font-medium text-primary underline-offset-4 hover:underline transition-colors"
                    >
                      {t('modalSignUp')}
                    </button>
                  </>
                ) : (
                  <>
                    {t('modalHasAccount')}{' '}
                    <button
                      type="button"
                      onClick={() => handleModeChange('login')}
                      className="font-medium text-primary underline-offset-4 hover:underline transition-colors"
                    >
                      {t('loginSubmit')}
                    </button>
                  </>
                )}
              </p>
            </motion.div>
          )}
        </motion.div>
      </DialogContent>
    </Dialog>
  );
}
