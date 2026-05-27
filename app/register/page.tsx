'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { signInWithGoogle } from '@/lib/auth/auth';
import { AuthOAuthButtons } from '@/components/auth/AuthOAuthButtons';
import { AuthFormSignup } from '@/components/auth/AuthFormSignup';
import { Separator } from '@/components/ui/separator';
import { motion } from 'framer-motion';

export default function RegisterPage() {
  const router = useRouter();
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [error, setError] = useState('');

  const handleGoogleSignIn = async () => {
    setError('');
    setIsGoogleLoading(true);

    try {
      const result = await signInWithGoogle();
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
    router.replace('/dashboard');
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center p-4 overflow-hidden">
      {/* Atmospheric glow */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[480px]"
        style={{
          background: 'radial-gradient(ellipse 60% 40% at 50% -10%, oklch(0.45 0.12 162 / 0.18) 0%, transparent 70%)',
        }}
      />
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="relative w-full max-w-md space-y-6"
      >
        {/* Wordmark */}
        <div className="text-center">
          <Link href="/" className="inline-block text-[22px] font-semibold tracking-tight text-foreground/90 hover:text-foreground transition-colors duration-150">
            bullpen
          </Link>
        </div>

        {/* Header */}
        <div className="space-y-1.5 text-center">
          <h1 className="text-xl font-semibold">Create an account</h1>
          <p className="text-sm text-muted-foreground">Track, analyze, and understand the market</p>
        </div>

        {/* OAuth Buttons - First class */}
        <AuthOAuthButtons
          onGoogleClick={handleGoogleSignIn}
          isLoading={isGoogleLoading}
          disabled={false}
        />

        {/* Divider */}
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <Separator />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">Or continue with email</span>
          </div>
        </div>

        {/* Signup Form */}
        <AuthFormSignup onSuccess={handleSuccess} onError={setError} />

        {/* Footer */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.2, delay: 0.1 }}
          className="text-center"
        >
          <p className="text-sm text-muted-foreground">
            Already have an account?{' '}
            <a
              href="/login"
              className="font-medium text-primary underline-offset-4 hover:underline transition-colors"
            >
              Sign in
            </a>
          </p>
        </motion.div>
      </motion.div>
    </div>
  );
}
