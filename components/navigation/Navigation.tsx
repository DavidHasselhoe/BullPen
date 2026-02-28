'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { UserMenu } from './UserMenu';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Home, TrendingUp, Briefcase, Settings, Wrench, ChevronDown } from 'lucide-react';
import { LiveClock } from '@/components/ui/LiveClock';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { SettingsModal } from '@/components/user/SettingsModal';
import { StockSearch } from '@/components/search/StockSearch';
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
  const [settingsOpen, setSettingsOpen] = useState(false);
  const isToolsActive = pathname?.startsWith('/tools');

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

              {/* Tools Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className={cn(
                      'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-all hover:scale-105 active:scale-95',
                      isToolsActive
                        ? 'bg-accent text-accent-foreground'
                        : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
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
            <StockSearch />
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