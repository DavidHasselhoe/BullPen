'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import { UserMenu } from './UserMenu';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Settings, Wrench, ChevronDown, Users, Pin } from 'lucide-react';
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
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { PinnedTickersPanel } from './PinnedTickersPanel';
import { TOOLS } from '@/lib/tools/tools-config';
import { getNavItems, COMMUNITY_LINKS } from '@/lib/navigation/nav-items';

export function Navigation() {
  const { t } = useTranslation('navigation');
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const { open: openCommandPalette = () => {} } = useCommandPalette();
  const searchShortcut = useSearchShortcut();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeSettingsTab, setActiveSettingsTab] = useState<string | undefined>(undefined);
  // Mutually exclusive with the notification and user-account popovers below —
  // opening one closes the others instead of letting them overlap in the corner.
  const [activeMenu, setActiveMenu] = useState<'pinned' | 'notifications' | 'user' | null>(null);

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
  const isCommunityActive = ['/social', '/users'].some((p) => pathname?.startsWith(p));

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
    queryClient.prefetchQuery({ queryKey: ['market', 'movers', 5] });
    queryClient.prefetchQuery({ queryKey: ['market', 'news', 'general', 5] });
    queryClient.prefetchQuery({ queryKey: ['hot-picks'] });
  }, [queryClient]);

  const navItems = getNavItems(t);

  return (
    <>
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto grid h-16 items-center px-4 gap-2" style={{ gridTemplateColumns: 'auto 1fr auto' }}>
          {/* Logo - Left */}
          <Link
            href="/"
            className="flex items-center gap-2 text-[19px] font-bold tracking-tight text-foreground/90 hover:text-foreground transition-colors duration-150 select-none shrink-0"
          >
            {/* Black mark on light theme, white mark on dark theme (theme is user-selectable, not fixed) */}
            <Image src="/BullPenLogo.png" alt="" width={26} height={26} priority aria-hidden="true" className="block dark:hidden" />
            <Image src="/BullPenLogo-dark.png" alt="" width={26} height={26} priority aria-hidden="true" className="hidden dark:block" />
            {t('navBrandName')}
          </Link>

          {/* Navigation - Centered */}
          <div className="flex items-center justify-center min-w-0 overflow-x-auto scrollbar-hide">
            {/* Navigation Links */}
            <nav className="hidden items-center gap-2 md:flex shrink-0">
              {navItems.map((item) => {
                const isActive = pathname === item.href || (item.href !== '/' && pathname?.startsWith(item.href));
                const Icon = item.icon;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onMouseEnter={item.href === '/dashboard' ? prefetchDiscover : undefined}
                    className={cn(
                      'flex items-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium transition-all duration-150 active:scale-[0.97]',
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
                        'flex items-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium transition-all duration-150 active:scale-[0.97]',
                        isCommunityActive
                          ? 'bg-primary/15 text-primary border border-primary/30 shadow-sm'
                          : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground border border-transparent'
                      )}
                    >
                      <Users className="h-4 w-4" />
                      {t('navCommunityLabel')}
                      <ChevronDown className={cn(
                        'h-3.5 w-3.5 opacity-60 transition-transform duration-200',
                        communityOpen && 'rotate-180 opacity-100'
                      )} />
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
                      'flex items-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium transition-all duration-150 active:scale-[0.97]',
                      isToolsActive
                        ? 'bg-primary/15 text-primary border border-primary/30 shadow-sm'
                        : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground border border-transparent'
                    )}
                  >
                    <Wrench className="h-4 w-4" />
                    {t('navToolsLabel')}
                    <ChevronDown className={cn(
                      'h-3.5 w-3.5 opacity-60 transition-transform duration-200',
                      toolsOpen && 'rotate-180 opacity-100'
                    )} />
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
                              <span className="text-xs text-muted-foreground">{t('navComingSoon')}</span>
                            )}
                          </div>
                        </Link>
                      </DropdownMenuItem>
                    );
                  })}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/tools" className="flex items-center gap-3 cursor-pointer font-medium">
                      {t('navViewAllTools')}
                    </Link>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              </div>
            </nav>
          </div>

          {/* Search, User Menu - Right */}
          <div className="flex items-center gap-4 shrink-0 justify-end">
            <button
              type="button"
              onClick={() => openCommandPalette()}
              className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 md:px-4 text-sm text-muted-foreground transition-all duration-150 hover:bg-accent hover:text-accent-foreground active:scale-[0.97]"
              aria-label={t('navSearchAriaLabel', { shortcut: searchShortcut })}
            >
              <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <span className="hidden md:inline">{t('navSearchPlaceholderText')}</span>
              <kbd className="hidden lg:inline-flex h-5 items-center rounded border px-1.5 text-[11px]">{searchShortcut}</kbd>
            </button>
            <Popover
              open={activeMenu === 'pinned'}
              onOpenChange={(val) => setActiveMenu(val ? 'pinned' : null)}
            >
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="transition-all hover:scale-105"
                  aria-label={t('navPinnedTickersLabel')}
                  title={t('navPinnedTickersLabel')}
                >
                  <Pin className="h-5 w-5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end">
                <PinnedTickersPanel
                  active={activeMenu === 'pinned'}
                  onNavigate={() => setActiveMenu(null)}
                />
              </PopoverContent>
            </Popover>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSettingsOpen(true)}
              className="transition-all hover:scale-105"
              aria-label={t('navOpenSettingsAriaLabel')}
            >
              <Settings className="h-5 w-5" />
            </Button>
            <NotificationBell
              open={activeMenu === 'notifications'}
              onOpenChange={(val) => setActiveMenu(val ? 'notifications' : null)}
            />
            <UserMenu
              open={activeMenu === 'user'}
              onOpenChange={(val) => setActiveMenu(val ? 'user' : null)}
            />
          </div>
        </div>
      </header>
      <SettingsModal
        open={settingsOpen}
        onOpenChange={(val) => {
          setSettingsOpen(val);
          if (!val) setActiveSettingsTab(undefined);
        }}
        initialTab={activeSettingsTab as Parameters<typeof SettingsModal>[0]['initialTab']}
      />
    </>
  );
}