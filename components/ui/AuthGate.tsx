'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';

interface AuthGateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  signInHref?: string;
}

export function AuthGate({ icon, title, description, signInHref = '/login' }: AuthGateProps) {
  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className="flex flex-col items-center text-center max-w-sm gap-5"
      >
        <div className="h-16 w-16 rounded-2xl bg-card border border-border flex items-center justify-center text-muted-foreground">
          {icon}
        </div>

        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-foreground">{title}</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 w-full">
          <Link
            href={signInHref}
            className="flex-1 inline-flex items-center justify-center rounded-lg bg-primary text-primary-foreground px-5 py-2.5 text-sm font-medium transition-all duration-150 hover:opacity-90 active:scale-[0.97]"
          >
            Sign in
          </Link>
          <Link
            href="/register"
            className="flex-1 inline-flex items-center justify-center rounded-lg border border-border bg-card text-foreground px-5 py-2.5 text-sm font-medium transition-all duration-150 hover:bg-accent active:scale-[0.97]"
          >
            Create account
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
