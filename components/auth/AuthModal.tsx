'use client';

import { useState, useEffect } from 'react';
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

export type AuthMode = 'login' | 'signup' | 'forgot-password';

interface AuthModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialMode?: AuthMode;
  redirectTo?: string;
}

export function AuthModal({ open, onOpenChange, initialMode = 'login', redirectTo }: AuthModalProps) {
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

    try {
      const result = await signInWithGoogle(redirectTo);
      if (!result.success) {
        setError(result.error || 'Failed to sign in with Google');
        setIsGoogleLoading(false);
      }
      // If successful, redirect will happen automatically via OAuth flow
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
      setIsGoogleLoading(false);
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
        return 'Welcome back';
      case 'signup':
        return 'Create an account';
      case 'forgot-password':
        return 'Reset password';
      default:
        return 'Welcome to BullPen';
    }
  };

  const getDescription = () => {
    switch (mode) {
      case 'login':
        return 'Sign in to your BullPen account';
      case 'signup':
        return 'Track, analyze, and understand the market';
      case 'forgot-password':
        return 'Enter your email to reset your password';
      default:
        return '';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 sm:p-8 gap-0">
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
                <TabsTrigger value="login">Sign in</TabsTrigger>
                <TabsTrigger value="signup">Sign up</TabsTrigger>
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
                <span className="bg-background px-2 text-muted-foreground">Or continue with email</span>
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
              />
            )}

            {mode === 'signup' && (
              <AuthFormSignup
                key="signup"
                onSuccess={handleSuccess}
                onError={setError}
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
                    Don&apos;t have an account?{' '}
                    <button
                      type="button"
                      onClick={() => handleModeChange('signup')}
                      className="font-medium text-primary underline-offset-4 hover:underline transition-colors"
                    >
                      Sign up
                    </button>
                  </>
                ) : (
                  <>
                    Already have an account?{' '}
                    <button
                      type="button"
                      onClick={() => handleModeChange('login')}
                      className="font-medium text-primary underline-offset-4 hover:underline transition-colors"
                    >
                      Sign in
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
