'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { UserMenu } from './UserMenu';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Home, Briefcase, Settings, Wrench, ChevronDown, Bookmark, Users, Rss, Trophy } from 'lucide-react';
import { LiveClock } from '@/components/ui/LiveClock';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { SettingsModal } from '@/components/user/SettingsModal';
import { useCommandPalette } from '@/components/command-palette/CommandPaletteProvider';
import { useSearchShortcut } from '@/hooks/use-search-shortcut';
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
  { name: 'Watchlist', href: '/watchlist', icon: Bookmark },
];

const COMMUNITY_LINKS = [
  { id: 'feed', name: 'Feed', href: '/social', icon: Rss, description: 'Activity from investors you follow' },
  { id: 'leaderboard', name: 'Leaderboard', href: '/leaderboard', icon: Trophy, description: 'Top portfolios by diversity' },
  { id: 'members', name: 'Members', href: '/users', icon: Users, description: 'Browse investor profiles' },
];

export function Navigation() {
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const { open: openCommandPalette = () => {} } = useCommandPalette();
  const searchShortcut = useSearchShortcut();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeSettingsTab, setActiveSettingsTab] = useState<string | undefined>(undefined);

  useEffect(() => {
    const handler = (e: Event) => {
      const tab = (e as CustomEvent).detail?.tab as string | undefined;
      setActiveSettingsTab(tab);
      setSettingsOpen(true);
    };
    window.addEventListener('settings:open', handler);
    return () => window.removeEventListener('settings:open', handler);
  }, []);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [communityOpen, setCommunityOpen] = useState(false);
  const toolsCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const communityCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isToolsActive = pathname?.startsWith('/tools');
  const isCommunityActive = ['/social', '/leaderboard', '/users'].some((p) => pathname?.startsWith(p));

  const clearToolsCloseTimer = useCallback(() => {
    if (toolsCloseTimerRef.current) {
      clearTimeout(toolsCloseTimerRef.current);
      toolsCloseTimerRef.current = null;
    }
  }, []);

  const scheduleToolsClose = useCallback(() => {
    clearToolsCloseTimer();
    toolsCloseTimerRef.current = setTimeout(() => setToolsOpen(false), 80);
  }, [clearToolsCloseTimer]);

  const handleToolsOpen = useCallback(() => {
    clearToolsCloseTimer();
    setToolsOpen(true);
  }, [clearToolsCloseTimer]);

  const clearCommunityCloseTimer = useCallback(() => {
    if (communityCloseTimerRef.current) {
      clearTimeout(communityCloseTimerRef.current);
      communityCloseTimerRef.current = null;
    }
  }, []);

  const scheduleCommunityClose = useCallback(() => {
    clearCommunityCloseTimer();
    communityCloseTimerRef.current = setTimeout(() => setCommunityOpen(false), 80);
  }, [clearCommunityCloseTimer]);

  const handleCommunityOpen = useCallback(() => {
    clearCommunityCloseTimer();
    setCommunityOpen(true);
  }, [clearCommunityCloseTimer]);

  const prefetchDiscover = useCallback(() => {
    queryClient.prefetchQuery({ queryKey: ['discover', 'recent-filings', 10] });
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

          {/* Navigation - Centered */}
          <div className="flex items-center">
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

              {/* Community Dropdown */}
              <div onPointerEnter={handleCommunityOpen} onPointerLeave={scheduleCommunityClose}>
                <DropdownMenu open={communityOpen} onOpenChange={setCommunityOpen} modal={false}>
                  <DropdownMenuTrigger asChild>
                    <button
                      className={cn(
                        'flex items-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium transition-all',
                        isCommunityActive
                          ? 'bg-primary/15 text-primary border border-primary/30 shadow-sm'
                          : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground border border-transparent'
                      )}
                    >
                      <Users className="h-4 w-4" />
                      Community
                      <ChevronDown className="h-3.5 w-3.5 opacity-70" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="center"
                    sideOffset={4}
                    className="min-w-[220px] [animation-duration:100ms]"
                    onPointerEnter={clearCommunityCloseTimer}
                    onPointerLeave={scheduleCommunityClose}
                  >
                    {COMMUNITY_LINKS.map((link) => {
                      const Icon = link.icon;
                      return (
                        <DropdownMenuItem key={link.id} asChild>
                          <Link href={link.href} className="flex items-center gap-3 cursor-pointer">
                            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted">
                              <Icon className="h-4 w-4 text-muted-foreground" />
                            </div>
                            <div className="flex flex-col">
                              <span>{link.name}</span>
                              <span className="text-xs text-muted-foreground">{link.description}</span>
                            </div>
                          </Link>
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* Tools Dropdown — hover region wraps trigger + content so there's no gap */}
              <div onPointerEnter={handleToolsOpen} onPointerLeave={scheduleToolsClose}>
                <DropdownMenu open={toolsOpen} onOpenChange={setToolsOpen} modal={false}>
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
                <DropdownMenuContent
                  align="center"
                  sideOffset={4}
                  className="min-w-[220px] [animation-duration:100ms]"
                  onPointerEnter={clearToolsCloseTimer}
                  onPointerLeave={scheduleToolsClose}
                >
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
                      View all tools
                    </Link>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              </div>
            </nav>
          </div>

          {/* Search, User Menu - Absolute Right */}
          <div className="absolute right-4 flex items-center gap-4">
            <button
              type="button"
              onClick={() => openCommandPalette()}
              className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 md:px-4 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
              aria-label={`Search (${searchShortcut})`}
            >
              <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <span className="hidden md:inline">Search...</span>
              <kbd className="hidden lg:inline-flex h-5 items-center rounded border px-1.5 text-[10px]">{searchShortcut}</kbd>
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
      <SettingsModal
        open={settingsOpen}
        onOpenChange={(val) => {
          setSettingsOpen(val);
          if (!val) setActiveSettingsTab(undefined);
        }}
        initialTab={activeSettingsTab as any}
      />
    </>
  );
}