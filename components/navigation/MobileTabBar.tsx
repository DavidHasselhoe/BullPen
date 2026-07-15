'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, Compass, Briefcase, Bookmark, Menu, GraduationCap, Settings, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { COMMUNITY_LINKS } from '@/lib/navigation/nav-items';
import { TOOLS } from '@/lib/tools/tools-config';
import { PinnedTickersPanel } from './PinnedTickersPanel';

const TABS = [
  { name: 'Home', href: '/dashboard', icon: Home },
  { name: 'Discover', href: '/discover', icon: Compass },
  { name: 'Holdings', href: '/holdings', icon: Briefcase },
  { name: 'Watchlist', href: '/watchlist', icon: Bookmark },
];

const MORE_PREFIXES = ['/academy', '/tools', '/social', '/leaderboard', '/users'];

export function MobileTabBar() {
  const pathname = usePathname() ?? '';
  const [moreOpen, setMoreOpen] = useState(false);

  // Reserve space at the bottom of the page only on routes where the bar shows
  // (this component mounts only on authed routes, via AuthNavigation). DOM side
  // effect — not setState — so it's clear of the set-state-in-effect rule.
  useEffect(() => {
    document.body.classList.add('has-mobile-tabbar');
    return () => document.body.classList.remove('has-mobile-tabbar');
  }, []);

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const moreActive = MORE_PREFIXES.some((p) => pathname.startsWith(p));

  const close = () => setMoreOpen(false);
  const openSettings = () => {
    close();
    window.dispatchEvent(new CustomEvent('settings:open'));
  };

  return (
    <>
      <nav
        className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 md:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        aria-label="Primary"
      >
        <div className="grid grid-cols-5">
          {TABS.map(({ name, href, icon: Icon }) => {
            const active = isActive(href);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors',
                  active ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <Icon className="h-5 w-5" />
                {name}
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className={cn(
              'flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors',
              moreActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Menu className="h-5 w-5" />
            More
          </button>
        </div>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="max-h-[85vh] gap-0 overflow-y-auto p-0">
          <SheetHeader className="border-b border-border px-4 py-3.5">
            <SheetTitle>Menu</SheetTitle>
          </SheetHeader>

          <div className="space-y-6 px-4 py-4" style={{ paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}>
            <MoreSection title="Pinned">
              <PinnedTickersPanel active={moreOpen} onNavigate={close} />
            </MoreSection>

            {/* Academy */}
            <MoreRow href="/academy" name="Academy" description="Learn investing, earn XP" icon={GraduationCap} onClick={close} />

            <MoreSection title="Tools">
              {TOOLS.filter((t) => t.status !== 'coming-soon').map((tool) => (
                <MoreRow key={tool.id} href={tool.href} name={tool.name} icon={tool.icon} onClick={close} compact />
              ))}
            </MoreSection>

            <MoreSection title="Community">
              {COMMUNITY_LINKS.map((link) => (
                <MoreRow key={link.id} href={link.href} name={link.name} description={link.description} icon={link.icon} onClick={close} />
              ))}
            </MoreSection>

            <MoreSection title="Account">
              <button
                type="button"
                onClick={openSettings}
                className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-accent/60"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted">
                  <Settings className="h-4 w-4 text-muted-foreground" />
                </span>
                <span className="flex-1 text-sm font-medium text-foreground">Settings</span>
                <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
              </button>
            </MoreSection>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}

function MoreSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/55">{title}</p>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function MoreRow({
  href, name, description, icon: Icon, onClick, compact,
}: {
  href: string;
  name: string;
  description?: string;
  icon: import('lucide-react').LucideIcon;
  onClick: () => void;
  compact?: boolean;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-accent/60"
    >
      <span className={cn('flex shrink-0 items-center justify-center rounded-md bg-muted', compact ? 'h-8 w-8' : 'h-9 w-9')}>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-foreground">{name}</span>
        {description && <span className="block truncate text-xs text-muted-foreground">{description}</span>}
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50" />
    </Link>
  );
}
