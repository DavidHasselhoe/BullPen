'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/use-auth';
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
  // Optimistic-guest default (matches UserMenu's own isAuthenticated branch):
  // pinned tickers, settings, and notifications are all account-scoped, so a
  // guest sees three dead icon buttons alongside Sign In/Sign Up — hide them
  // until auth resolves true instead of flashing them in then out.
  const { isAuthenticated } = useAuth();
  const pathname = usePathname();
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
  // Community and Tools open on hover. One shared state so only one is ever
  // open and moving between them switches instantly. Hover intent:
  // - opening waits briefly, so sweeping the cursor across the nav doesn't pop menus;
  // - closing waits long enough to cross the gap to the menu slowly (80ms did not);
  // - mouse only: a tap fires pointerenter then pointerdown, which opened and
  //   immediately toggled the menu shut on touch screens. Taps use Radix's click.
  const [hoverMenu, setHoverMenuState] = useState<'community' | 'tools' | null>(null);
  const hoverMenuRef = useRef<'community' | 'tools' | null>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toolsOpen = hoverMenu === 'tools';
  const communityOpen = hoverMenu === 'community';
  const isToolsActive = pathname?.startsWith('/tools');
  const isCommunityActive = ['/social', '/users'].some((p) => pathname?.startsWith(p));

  const setHoverMenu = useCallback((menu: 'community' | 'tools' | null) => {
    hoverMenuRef.current = menu;
    setHoverMenuState(menu);
  }, []);

  const clearHoverTimer = useCallback(() => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = null;
  }, []);

  const hoverIn = useCallback((menu: 'community' | 'tools') => (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    clearHoverTimer();
    if (hoverMenuRef.current === menu) return;
    if (hoverMenuRef.current) setHoverMenu(menu);
    else hoverTimerRef.current = setTimeout(() => setHoverMenu(menu), 90);
  }, [clearHoverTimer, setHoverMenu]);

  const hoverOut = useCallback((e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse') return;
    clearHoverTimer();
    hoverTimerRef.current = setTimeout(() => setHoverMenu(null), 250);
  }, [clearHoverTimer, setHoverMenu]);

  // Radix still owns click, Enter/Space, Escape and outside-click.
  const menuOpenChange = useCallback((menu: 'community' | 'tools') => (open: boolean) => {
    clearHoverTimer();
    if (open) setHoverMenu(menu);
    else if (hoverMenuRef.current === menu) setHoverMenu(null);
  }, [clearHoverTimer, setHoverMenu]);

  // A click on a trigger the hover already opened should leave it open, not
  // toggle it shut under the cursor.
  const keepHoverOpen = useCallback((menu: 'community' | 'tools') => (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && hoverMenuRef.current === menu) e.preventDefault();
  }, []);

  // Radix treats the trigger as outside the menu, so pressing it dismissed a
  // hover-opened menu even with the toggle suppressed above. Menu state is
  // exclusive, so pressing the other trigger still switches menus.
  const ignoreTriggerPress = useCallback((e: Event) => {
    if ((e.target as Element | null)?.closest?.('[data-nav-hover-menu]')) e.preventDefault();
  }, []);

  useEffect(() => clearHoverTimer, [clearHoverTimer]);


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
          {/* self-stretch: overflow-x-auto also clips vertically, and at content height it clipped
              the strip between a dropdown trigger and its menu, so the cursor crossed dead space. */}
          {/* @container + safe centring: signed out at 1440px the links needed 907px of a
              790px strip, and plain justify-center pushed "Home" off the left edge, out of
              scroll reach ("me"). The icons drop first when the strip is narrower than the
              full row, and if it still overflows it starts at the left instead. */}
          <div className="@container flex items-center [justify-content:safe_center] self-stretch min-w-0 overflow-x-auto scrollbar-hide">
            {/* Navigation Links */}
            <nav className="hidden items-center gap-2 @max-[57rem]:gap-1 md:flex shrink-0">
              {navItems.map((item) => {
                const isActive = pathname === item.href || (item.href !== '/' && pathname?.startsWith(item.href));
                const Icon = item.icon;

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      'flex items-center gap-2 rounded-md px-4 @max-[57rem]:px-3 py-2.5 text-sm font-medium transition-all duration-150 active:scale-[0.97]',
                      isActive
                        ? 'bg-primary/10 text-primary border border-primary/20'
                        : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground border border-transparent'
                    )}
                  >
                    <Icon className="h-4 w-4 @max-[57rem]:hidden" />
                    {item.name}
                  </Link>
                );
              })}

              {/* Community Dropdown */}
              <div data-nav-hover-menu className="-mb-1 pb-1" onPointerEnter={hoverIn('community')} onPointerLeave={hoverOut}>
                <DropdownMenu open={communityOpen} onOpenChange={menuOpenChange('community')} modal={false}>
                  <DropdownMenuTrigger asChild onPointerDown={keepHoverOpen('community')}>
                    <button
                      className={cn(
                        'flex items-center gap-2 rounded-md px-4 @max-[57rem]:px-3 py-2.5 text-sm font-medium transition-all duration-150 active:scale-[0.97]',
                        isCommunityActive
                          ? 'bg-primary/15 text-primary border border-primary/30 shadow-sm'
                          : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground border border-transparent'
                      )}
                    >
                      <Users className="h-4 w-4 @max-[57rem]:hidden" />
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
                    onPointerEnter={hoverIn('community')}
                    onPointerLeave={hoverOut}
                    onPointerDownOutside={ignoreTriggerPress}
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
              <div data-nav-hover-menu className="-mb-1 pb-1" onPointerEnter={hoverIn('tools')} onPointerLeave={hoverOut}>
                <DropdownMenu open={toolsOpen} onOpenChange={menuOpenChange('tools')} modal={false}>
                <DropdownMenuTrigger asChild onPointerDown={keepHoverOpen('tools')}>
                  <button
                    className={cn(
                      'flex items-center gap-2 rounded-md px-4 @max-[57rem]:px-3 py-2.5 text-sm font-medium transition-all duration-150 active:scale-[0.97]',
                      isToolsActive
                        ? 'bg-primary/15 text-primary border border-primary/30 shadow-sm'
                        : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground border border-transparent'
                    )}
                  >
                    <Wrench className="h-4 w-4 @max-[57rem]:hidden" />
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
                  onPointerEnter={hoverIn('tools')}
                  onPointerLeave={hoverOut}
                  onPointerDownOutside={ignoreTriggerPress}
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
              // Same words as the visible text (WCAG 2.5.3 label-in-name), so voice control users can say what they see.
              aria-label={`${t('navSearchPlaceholderText')} ${searchShortcut}`}
            >
              <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <span className="hidden md:inline">{t('navSearchPlaceholderText')}</span>{' '}
              <kbd className="hidden lg:inline-flex h-5 items-center rounded border px-1.5 text-[11px]">{searchShortcut}</kbd>
            </button>
            {isAuthenticated && (
              <>
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
              </>
            )}
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