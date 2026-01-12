'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { UserMenu } from './UserMenu';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Home, TrendingUp, Briefcase } from 'lucide-react';
import { LiveClock } from '@/components/ui/LiveClock';

const navigation = [
  { name: 'Discover', href: '/', icon: Home },
  { name: 'My Holdings', href: '/holdings', icon: Briefcase },
];

export function Navigation() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto relative flex h-16 items-center justify-center px-4">
        {/* Logo & Navigation - Centered */}
        <div className="flex items-center gap-8">
          <Link
            href="/"
            className="flex items-center gap-2 font-semibold transition-all hover:scale-105 active:scale-95"
          >
            <TrendingUp className="h-6 w-6 text-primary transition-transform hover:rotate-12" />
            <span className="hidden sm:inline-block">BullPen</span>
          </Link>

          {/* Navigation Links */}
          <nav className="hidden items-center gap-1 md:flex">
            {navigation.map((item) => {
              const isActive = pathname === item.href || (item.href !== '/' && pathname?.startsWith(item.href));
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-all hover:scale-105 active:scale-95',
                    isActive
                      ? 'bg-accent text-accent-foreground'
                      : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.name}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* User Menu & Clock - Absolute Right */}
        <div className="absolute right-4 flex items-center gap-4">
          <LiveClock className="hidden sm:flex" />
          <UserMenu />
        </div>
      </div>
    </header>
  );
}