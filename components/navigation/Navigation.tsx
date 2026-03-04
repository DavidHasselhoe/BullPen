'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { UserMenu } from './UserMenu';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Home, TrendingUp, Briefcase, Settings, Wrench, ChevronDown } from 'lucide-react';
import { LiveClock } from '@/components/ui/LiveClock';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { SettingsModal } from '@/components/user/SettingsModal';
import { useCommandPalette } from '@/components/command-palette/CommandPaletteProvider';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { TOOLS } from '@/lib/tools/tools-config';

const navigation = [
  { name: 'Discover', href: '/', icon: Home },
  { name: 'My Holdings', href: '/holdings', icon: Briefcase },
];

export function Navigation() {
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const { open: openCommandPalette = () => {} } = useCommandPalette();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const isToolsActive = pathname?.startsWith('/tools');

  const prefetchDiscover = useCallback(() => {
    queryClient.prefetchQuery({ queryKey: ['discover', 'fundamental-changes', 6] });
    queryClient.prefetchQuery({ queryKey: ['discover', 'recent-filings', 10] });
    queryClient.prefetchQuery({ queryKey: ['discover', 'companies-to-watch', 10] });
    queryClient.prefetchQuery({ queryKey: ['market', 'movers', 5] });
    queryClient.prefetchQuery({ queryKey: ['market', 'news', 'general', 5] });
    queryClient.prefetchQuery({ queryKey: ['hot-picks'] });
  }, [queryClient]);

  return (
    <>
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto relative flex h-16 items-center justify-center px-4">
          {/* Clock - Absolute Left */}
          <div className="absolute left-4 flex items-center">
            <LiveClock className="hidden sm:flex" />
          </div>

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
            <nav className="hidden items-center gap-2 md:flex">
              {navigation.map((item) => {
                const isActive = pathname === item.href || (item.href !== '/' && pathname?.startsWith(item.href));
                const Icon = item.icon;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onMouseEnter={item.href === '/' ? prefetchDiscover : undefined}
                    className={cn(
                      'flex items-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium transition-all',
                      isActive
                        ? 'bg-primary/10 text-primary border border-primary/20'
                        : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground border border-transparent'
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {item.name}
                  </Link>
                );
              })}

              {/* Tools Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className={cn(
                      'flex items-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium transition-all',
                      isToolsActive
                        ? 'bg-primary/15 text-primary border border-primary/30 shadow-sm'
                        : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground border border-transparent'
                    )}
                  >
                    <Wrench className="h-4 w-4" />
                    Tools
                    <ChevronDown className="h-3.5 w-3.5 opacity-70" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="center" className="min-w-[220px]">
                  {TOOLS.map((tool) => {
                    const Icon = tool.icon;
                    return (
                      <DropdownMenuItem key={tool.id} asChild>
                        <Link href={tool.href} className="flex items-center gap-3 cursor-pointer">
                          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted">
                            <Icon className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <div className="flex flex-col">
                            <span>{tool.name}</span>
                            {tool.status === 'coming-soon' && (
                              <span className="text-xs text-muted-foreground">Coming soon</span>
                            )}
                          </div>
                        </Link>
                      </DropdownMenuItem>
                    );
                  })}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/tools" className="flex items-center gap-3 cursor-pointer font-medium">
                      View all tools →
                    </Link>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </nav>
          </div>

          {/* Search, User Menu - Absolute Right */}
          <div className="absolute right-4 flex items-center gap-4">
            <button
              type="button"
              onClick={() => openCommandPalette()}
              className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 md:px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              aria-label="Search (⌘K)"
            >
              <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <span className="hidden md:inline">Search...</span>
              <kbd className="hidden lg:inline-flex h-5 items-center rounded border px-1.5 text-[10px]">⌘K</kbd>
            </button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSettingsOpen(true)}
              className="transition-all hover:scale-105"
            >
              <Settings className="h-5 w-5" />
            </Button>
            <NotificationBell />
            <UserMenu />
          </div>
        </div>
      </header>
      <SettingsModal open={settingsOpen} onOpenChange={setSettingsOpen} />
    </>
  );
}