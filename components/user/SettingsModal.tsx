'use client';

import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/use-auth';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { Loader2, Globe, DollarSign, Moon, Bell, Shield, AlertTriangle, Trash2, Download, Check, Settings2, Eye, EyeOff, Home, Hash, Search, Bot, LayoutGrid, LineChart, Wrench, ChevronDown, Sparkles, Crown, type LucideIcon } from 'lucide-react';
import { useEntitlements } from '@/hooks/use-entitlements';
import { UpgradeCTA } from '@/components/billing/UpgradeCTA';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  HOMEPAGE_PAGES,
  HOMEPAGE_TOOL_OPTIONS,
  ALL_TOOLS_OPTION,
  findHomepageOption,
} from '@/lib/navigation/homepage-options';
import { HomepageLayoutEditor } from '@/components/settings/HomepageLayoutEditor';
import { MarketContextVisibilityEditor } from '@/components/settings/MarketContextVisibilityEditor';
import { DEFAULT_ORDER as DEFAULT_WIDGET_ORDER } from '@/lib/dashboard/widgets';
import { ExperienceLevelToggle } from '@/components/ui/ExperienceLevelToggle';
import { ChartPrefsControls } from '@/components/stock/ChartPrefsControls';
import { useChartPrefs } from '@/hooks/use-chart-prefs';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { TickerSelector, type SearchResult } from '@/components/tools/buy-here/TickerSelector';
import { createBrowserClient } from '@/lib/supabase/client';
import { signOut } from '@/lib/auth/auth';
import { useRouter } from 'next/navigation';
import { deleteAccount, exportUserData } from '@/app/actions/account';

interface SettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialTab?: SettingsSection;
}

type SettingsSection =
  | 'preferences'
  | 'notifications'
  | 'customize'
  | 'plan'
  | 'privacy'
  | 'ai'
  | 'danger';

type ThemeValue = 'dark' | 'light' | 'gradient-purple' | 'gradient-blue' | 'gradient-midnight' | 'gradient-embers';

const VALID_THEMES: ThemeValue[] = ['dark', 'light', 'gradient-purple', 'gradient-blue', 'gradient-midnight', 'gradient-embers'];

function minimalStockPick(ticker: string): SearchResult {
  const t = ticker.toUpperCase();
  return { ticker: t, name: t, cik: '', has_data: false };
}

/** A single label + description + switch row. Shared across tabs for consistency. */
function ToggleSetting({
  label, description, checked, onCheckedChange, disabled, icon: Icon, badge,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  icon?: LucideIcon;
  badge?: string;
}) {
  return (
    <div className={cn('flex items-center justify-between gap-4 py-3.5', disabled && 'opacity-70')}>
      <div className="min-w-0 space-y-0.5">
        <div className="flex items-center gap-2">
          {Icon && <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />}
          <span className="text-sm font-medium text-foreground">{label}</span>
          {badge && (
            <Badge variant="secondary" className="h-4 px-1.5 text-[10px] font-medium">{badge}</Badge>
          )}
        </div>
        {description && (
          <p className="text-xs leading-snug text-muted-foreground">{description}</p>
        )}
      </div>
      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        aria-label={label}
        className="shrink-0"
      />
    </div>
  );
}

/** Groups related rows into a single bordered card with hairline dividers. */
function SettingsCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-xl border bg-card/30 px-4 divide-y divide-border/50', className)}>
      {children}
    </div>
  );
}

export function SettingsModal({ open, onOpenChange, initialTab }: SettingsModalProps) {
  const { user } = useAuth();
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const [activeSection, setActiveSection] = useState<SettingsSection>(initialTab ?? 'preferences');
  const [error, setError] = useState<string | null>(null);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [isExportingData, setIsExportingData] = useState(false);
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [passwordNew, setPasswordNew] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [showPasswordNew, setShowPasswordNew] = useState(false);
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  // Settings state
  const [defaultCurrency, setDefaultCurrency] = useState<string | null>(null);
  const [theme, setTheme] = useState<ThemeValue>('dark');
  const [language, setLanguage] = useState<string | null>(null);
  const [defaultHomepage, setDefaultHomepage] = useState<string>('/dashboard');
  /** Selected company when default homepage is a stock detail page (search UI) */
  const [homepageStockPick, setHomepageStockPick] = useState<SearchResult | null>(null);
  /** True while the user is choosing "A specific stock" (shows the ticker search). */
  const [stockMode, setStockMode] = useState<boolean>(false);
  const [homepageMenuOpen, setHomepageMenuOpen] = useState<boolean>(false);
  const [showWelcomeText, setShowWelcomeText] = useState<boolean>(true);
  const [roundNumbers, setRoundNumbers] = useState<boolean>(false);
  const [profilePublic, setProfilePublic] = useState<boolean>(true);

  // Chart preferences — shared with the stock-page chart settings popover via the
  // same hook (localStorage + users.settings.chart_prefs), so edits stay in sync.
  const chartPrefs = useChartPrefs();
  const ent = useEntitlements();

  // ── Default homepage picker ──────────────────────────────────────────────
  const selectHomepage = (value: string) => {
    setStockMode(false);
    setHomepageStockPick(null);
    setDefaultHomepage(value);
    setHomepageMenuOpen(false);
  };

  const enterStockMode = () => {
    // Don't commit a route yet — `defaultHomepage` only becomes a /stock/… path
    // once the user actually picks a ticker below, so we never save a bogus stock.
    setStockMode(true);
    setHomepageMenuOpen(false);
  };

  const currentHomepageOption = findHomepageOption(defaultHomepage);
  const HomepageIcon: LucideIcon = stockMode
    ? LineChart
    : currentHomepageOption?.icon ?? Home;
  const homepageLabel = stockMode
    ? homepageStockPick
      ? homepageStockPick.name && homepageStockPick.name !== homepageStockPick.ticker
        ? `${homepageStockPick.ticker} — ${homepageStockPick.name}`
        : homepageStockPick.ticker
      : t('settings.homepageStock')
    : currentHomepageOption?.label ?? 'Home';
  const [holdingsPublic, setHoldingsPublic] = useState<boolean>(true);
  const [widgetOrder, setWidgetOrder] = useState<string[]>(DEFAULT_WIDGET_ORDER);
  const [widgetHidden, setWidgetHidden] = useState<string[]>([]);
  const [marketContextHidden, setMarketContextHidden] = useState<string[]>([]);
  // AI settings state
  const [riskProfile, setRiskProfile] = useState<'conservative' | 'balanced' | 'aggressive' | null>(null);
  const [investmentHorizon, setInvestmentHorizon] = useState<'short' | 'medium' | 'long' | null>(null);
  const [responseStyle, setResponseStyle] = useState<'concise' | 'balanced' | 'detailed' | null>(null);
  const [allowHoldingsContext, setAllowHoldingsContext] = useState(false);
  const [notifications, setNotifications] = useState({
    upcoming_earnings: true,
    price_alerts: true,
    portfolio_recap: true,
    ai_insights: true,
    health_score_change: true,
    weekly_pick: true,
    daily_brief_ready: true,
    dividend_reminder: true,
    daily_challenge_reminder: true,
  });

  // Jump to initialTab when modal opens (e.g. from AI panel gear icon)
  useEffect(() => {
    if (open && initialTab) {
      setActiveSection(initialTab);
    }
  }, [open, initialTab]);

  // Autosave refs
  const isInitializedRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSaveRef = useRef<() => Promise<void>>();

  // Load settings when dialog opens
  useEffect(() => {
    isInitializedRef.current = false;
    if (user?.settings && open) {
      const settings = user.settings as Record<string, unknown>;
      setDefaultCurrency(settings.default_currency || null);
      setLanguage(settings.language || null);

      // Sanitize theme — ignore any old animated themes (aurora, particles, etc.)
      const oldTheme = settings.theme || 'dark';
      const oldBackground = settings.background || 'none';
      let resolvedTheme: ThemeValue = 'dark';
      if (oldBackground !== 'none' && (oldTheme === 'dark' || !oldTheme)) {
        resolvedTheme = VALID_THEMES.includes(oldBackground as ThemeValue)
          ? (oldBackground as ThemeValue)
          : 'dark';
      } else if (VALID_THEMES.includes(oldTheme as ThemeValue)) {
        resolvedTheme = oldTheme as ThemeValue;
      }
      setTheme(resolvedTheme);

      setNotifications({
        upcoming_earnings: settings.notifications?.upcoming_earnings !== false,
        price_alerts: settings.notifications?.price_alerts !== false,
        portfolio_recap: settings.notifications?.portfolio_recap !== false,
        ai_insights: settings.notifications?.ai_insights !== false,
        health_score_change: settings.notifications?.health_score_change !== false,
        weekly_pick: settings.notifications?.weekly_pick !== false,
        daily_brief_ready: settings.notifications?.daily_brief_ready !== false,
        dividend_reminder: settings.notifications?.dividend_reminder !== false,
        daily_challenge_reminder: settings.notifications?.daily_challenge_reminder !== false,
      });
      const dh = (settings.default_homepage as string) || '/dashboard';
      setDefaultHomepage(dh);
      const stockMatch = dh.match(/^\/stock\/([A-Za-z0-9.-]+)$/i);
      setHomepageStockPick(stockMatch ? minimalStockPick(stockMatch[1]) : null);
      setStockMode(!!stockMatch);
      setShowWelcomeText(settings.show_welcome_text !== undefined ? settings.show_welcome_text : true);
      setRoundNumbers(settings.round_numbers === true);
      setProfilePublic(settings.profile_public !== false);
      setHoldingsPublic(settings.holdings_public !== false);
      setWidgetOrder(Array.isArray(settings.homepage_widget_order) ? settings.homepage_widget_order : DEFAULT_WIDGET_ORDER);
      setWidgetHidden(Array.isArray(settings.homepage_widget_hidden) ? settings.homepage_widget_hidden : []);
      setMarketContextHidden(Array.isArray(settings.market_context_hidden) ? settings.market_context_hidden : []);
      // AI settings
      setRiskProfile(user.risk_profile ?? null);
      setInvestmentHorizon((settings.investment_horizon as 'short' | 'medium' | 'long') ?? null);
      setResponseStyle((settings.response_style as 'concise' | 'balanced' | 'detailed') ?? null);
      setAllowHoldingsContext(settings.allow_holdings_context === true);
      setError(null);

      // Allow autosave after a short delay so the above setters don't trigger a spurious save
      const t = setTimeout(() => { isInitializedRef.current = true; }, 400);
      return () => clearTimeout(t);
    }
  }, [user, open]);

  const handleSave = async () => {
    if (!user) return;
    setError(null);
    try {
      const supabase = createBrowserClient();
      // Read the freshest settings before merging so we never clobber values
      // written by other surfaces between modal open and save — chart_prefs (the
      // stock-page chart popover) and market_hours_exchanges (the in-card editor).
      const { data: latest } = await supabase
        .from('users')
        .select('settings')
        .eq('id', user.id)
        .single();
      const existingSettings =
        ((latest?.settings as Record<string, unknown>) ??
          (user.settings as Record<string, unknown>)) ?? {};
      const mergedSettings = {
        ...existingSettings,
        default_currency: defaultCurrency,
        theme,
        language,
        default_homepage: defaultHomepage,
        show_welcome_text: showWelcomeText,
        round_numbers: roundNumbers,
        notifications,
        profile_public: profilePublic,
        holdings_public: holdingsPublic,
        investment_horizon: investmentHorizon,
        response_style: responseStyle,
        allow_holdings_context: allowHoldingsContext,
        homepage_widget_order: widgetOrder,
        homepage_widget_hidden: widgetHidden,
        market_context_hidden: marketContextHidden,
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const usersTable = (supabase as any).from('users');
      const { error: updateError } = await usersTable
        .update({ settings: mergedSettings, risk_profile: riskProfile })
        .eq('id', user.id);

      if (updateError) {
        throw new Error(updateError.message || 'Failed to update settings');
      }

      if (language) {
        await i18n.changeLanguage(language);
        document.documentElement.lang = language;
      } else {
        const browserLang = navigator.language.split('-')[0];
        const supportedLangs = ['en', 'es', 'fr', 'de', 'ja', 'zh'];
        const detectedLang = supportedLangs.includes(browserLang) ? browserLang : 'en';
        await i18n.changeLanguage(detectedLang);
        document.documentElement.lang = detectedLang;
      }

      window.dispatchEvent(new Event('auth:refresh'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update settings');
    }
  };

  // Keep the ref current so the debounced autosave always calls the latest closure
  useEffect(() => { handleSaveRef.current = handleSave; });

  // Autosave — debounced 500 ms after any settings change
  useEffect(() => {
    if (!isInitializedRef.current || !user) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      if (!handleSaveRef.current) return;
      setSaveStatus('saving');
      await handleSaveRef.current();
      setSaveStatus('saved');
      const t = setTimeout(() => setSaveStatus('idle'), 1500);
      return () => clearTimeout(t);
    }, 500);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultCurrency, theme, language, defaultHomepage, showWelcomeText, roundNumbers, notifications, profilePublic, holdingsPublic, riskProfile, investmentHorizon, responseStyle, allowHoldingsContext, widgetOrder, widgetHidden, marketContextHidden]);

  const handleDeleteAccount = async () => {
    if (!user) return;
    if (!confirm('Are you sure you want to delete your account? This action cannot be undone.')) {
      return;
    }
    if (!confirm('All your holdings and settings will be permanently deleted. This cannot be reversed. Continue?')) {
      return;
    }

    setIsDeletingAccount(true);
    setError(null);

    try {
      const result = await deleteAccount();
      if (!result.success) {
        setError(result.error || 'Failed to delete account');
        setIsDeletingAccount(false);
        return;
      }
      await signOut();
      router.push('/');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete account');
      setIsDeletingAccount(false);
    }
  };

  const handleExportData = async () => {
    if (!user) return;

    setIsExportingData(true);
    setError(null);

    try {
      const result = await exportUserData();
      if (!result.success || !result.data) {
        setError(result.error || 'Failed to export data');
        return;
      }

      const json = JSON.stringify(result.data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bullpen-data-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export data');
    } finally {
      setIsExportingData(false);
    }
  };

  const handleChangePassword = async () => {
    if (!passwordNew || !passwordConfirm) {
      setError('Please fill in both password fields.');
      return;
    }
    if (passwordNew.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (passwordNew !== passwordConfirm) {
      setError('Passwords do not match.');
      return;
    }

    setIsChangingPassword(true);
    setError(null);
    setPasswordSuccess(false);

    try {
      const supabase = createBrowserClient();
      const { error: updateError } = await supabase.auth.updateUser({ password: passwordNew });
      if (updateError) {
        setError(updateError.message || 'Failed to update password.');
        return;
      }
      setPasswordSuccess(true);
      setPasswordNew('');
      setPasswordConfirm('');
      setTimeout(() => {
        setShowPasswordForm(false);
        setPasswordSuccess(false);
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update password.');
    } finally {
      setIsChangingPassword(false);
    }
  };

  interface SectionMeta {
    id: SettingsSection;
    label: string;
    description: string;
    icon: LucideIcon;
  }
  const sectionGroups: Array<{ heading?: string; items: SectionMeta[] }> = [
    {
      items: [
        { id: 'preferences', label: t('settings.preferences'), icon: Globe, description: 'Region, currency, language, theme, and your default homepage.' },
        { id: 'notifications', label: t('settings.notifications'), icon: Bell, description: 'Choose which alerts BullPen sends you.' },
        { id: 'customize', label: t('settings.customize'), icon: Settings2, description: 'Tailor your home layout and chart defaults.' },
        { id: 'ai', label: 'Ask Bull', icon: Bot, description: 'How Bull communicates and frames its analysis.' },
      ],
    },
    {
      heading: 'Account',
      items: [
        { id: 'plan', label: 'Plan', icon: Sparkles, description: 'Your plan and what Pro unlocks.' },
        { id: 'privacy', label: t('settings.privacy'), icon: Shield, description: 'Control your profile visibility and password.' },
        { id: 'danger', label: t('settings.danger'), icon: AlertTriangle, description: 'Export your data or permanently delete your account.' },
      ],
    },
  ];
  const allSections = sectionGroups.flatMap((g) => g.items);
  const activeMeta = allSections.find((s) => s.id === activeSection) ?? allSections[0];
  const ActiveIcon = activeMeta.icon;
  const isDangerActive = activeSection === 'danger';

  if (!user) {
    return null;
  }

  const emailInitials = (user.email ?? '?')
    .split('@')[0]
    .slice(0, 2)
    .toUpperCase();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[90vw] !max-w-[1000px] sm:!max-w-[1000px] h-[85vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <DialogTitle>{t('settings.title')}</DialogTitle>
          <DialogDescription>
            {t('settings.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar Navigation */}
          <aside className="flex w-16 flex-shrink-0 flex-col border-r bg-muted/20 sm:w-56">
            <nav className="flex-1 space-y-4 overflow-y-auto p-2 sm:p-3">
              {sectionGroups.map((group, gi) => (
                <div key={gi} className="space-y-1">
                  {group.heading && (
                    <p className="hidden px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/85 sm:block">
                      {group.heading}
                    </p>
                  )}
                  {group.items.map((section) => {
                    const Icon = section.icon;
                    const active = activeSection === section.id;
                    const danger = section.id === 'danger';
                    return (
                      <button
                        key={section.id}
                        onClick={() => setActiveSection(section.id)}
                        aria-current={active ? 'page' : undefined}
                        title={section.label}
                        className={cn(
                          'group relative flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                          'justify-center sm:justify-start',
                          active
                            ? 'bg-accent text-foreground'
                            : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                          danger && (active ? 'text-destructive' : 'text-destructive/75 hover:text-destructive')
                        )}
                      >
                        <span
                          className={cn(
                            'absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r-full transition-opacity',
                            danger ? 'bg-destructive' : 'bg-primary',
                            active ? 'opacity-100' : 'opacity-0'
                          )}
                        />
                        <Icon className={cn('h-4 w-4 shrink-0', active && !danger && 'text-primary')} />
                        <span className="hidden sm:inline">{section.label}</span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </nav>

            {/* Identity + autosave status */}
            <div className="hidden border-t p-3 sm:block">
              <div className="flex min-w-0 items-center gap-2.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
                  {emailInitials}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-foreground">{user.email}</p>
                  <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    {saveStatus === 'saving' ? (
                      <><Loader2 className="h-2.5 w-2.5 animate-spin" />Saving…</>
                    ) : saveStatus === 'saved' ? (
                      <><Check className="h-2.5 w-2.5 text-emerald-500" /><span className="text-emerald-500">All changes saved</span></>
                    ) : (
                      'Changes save automatically'
                    )}
                  </p>
                </div>
              </div>
            </div>
          </aside>

          {/* Main Content */}
          <div className="relative min-h-0 flex-1 overflow-y-auto">
            <div
              key={activeSection}
              className="p-6 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-right-1 motion-safe:duration-200"
            >
              {/* Section header */}
              <div className="mb-6 max-w-2xl">
                <div className="flex items-center gap-2">
                  <ActiveIcon className={cn('h-4 w-4', isDangerActive ? 'text-destructive' : 'text-primary')} />
                  <h2 className="text-base font-semibold tracking-tight text-foreground">{activeMeta.label}</h2>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{activeMeta.description}</p>
              </div>

            {activeSection === 'preferences' && (
              <div className="space-y-6 max-w-2xl">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="default-currency" className="flex items-center gap-2">
                      <DollarSign className="h-4 w-4" />
                      {t('settings.currency')}
                    </Label>
                    <Select
                      value={defaultCurrency || 'auto'}
                      onValueChange={(value) => setDefaultCurrency(value === 'auto' ? null : value)}
                    >
                      <SelectTrigger id="default-currency">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="auto">{t('settings.currencyAuto')}</SelectItem>
                        <SelectItem value="USD">USD ($)</SelectItem>
                        <SelectItem value="EUR">EUR (€)</SelectItem>
                        <SelectItem value="GBP">GBP (£)</SelectItem>
                        <SelectItem value="NOK">NOK (kr)</SelectItem>
                        <SelectItem value="SEK">SEK (kr)</SelectItem>
                        <SelectItem value="DKK">DKK (kr)</SelectItem>
                        <SelectItem value="JPY">JPY (¥)</SelectItem>
                        <SelectItem value="CHF">CHF (Fr)</SelectItem>
                        <SelectItem value="CAD">CAD (C$)</SelectItem>
                        <SelectItem value="AUD">AUD (A$)</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      {t('settings.currencyDescription')}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="language" className="flex items-center gap-2">
                      <Globe className="h-4 w-4" />
                      {t('settings.language')}
                    </Label>
                    <Select
                      value={language || 'system'}
                      onValueChange={(value) => setLanguage(value === 'system' ? null : value)}
                    >
                      <SelectTrigger id="language">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="system">{t('settings.languageSystem')}</SelectItem>
                        <SelectItem value="en">{t('languages.en')}</SelectItem>
                        <SelectItem value="es">{t('languages.es')}</SelectItem>
                        <SelectItem value="fr">{t('languages.fr')}</SelectItem>
                        <SelectItem value="de">{t('languages.de')}</SelectItem>
                        <SelectItem value="ja">{t('languages.ja')}</SelectItem>
                        <SelectItem value="zh">{t('languages.zh')}</SelectItem>
                        <SelectItem value="no">{t('languages.no')}</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      {t('settings.languageDescription')}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Home className="h-4 w-4" />
                      {t('settings.defaultHomepage')}
                    </Label>

                    <DropdownMenu open={homepageMenuOpen} onOpenChange={setHomepageMenuOpen}>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className="flex w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm transition-colors hover:bg-accent/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            <HomepageIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                            <span className="truncate">{homepageLabel}</span>
                          </span>
                          <ChevronDown
                            className={cn(
                              'h-4 w-4 shrink-0 opacity-50 transition-transform duration-200',
                              homepageMenuOpen && 'rotate-180'
                            )}
                          />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="start"
                        className="w-(--radix-dropdown-menu-trigger-width) min-w-[260px]"
                      >
                        {HOMEPAGE_PAGES.map((page) => {
                          const Icon = page.icon;
                          const selected = !stockMode && defaultHomepage === page.value;
                          return (
                            <DropdownMenuItem
                              key={page.value}
                              onSelect={() => selectHomepage(page.value)}
                              className="cursor-pointer gap-2"
                            >
                              <Icon className="h-4 w-4" />
                              <span>{page.label}</span>
                              {selected && <Check className="ml-auto h-4 w-4 text-primary" />}
                            </DropdownMenuItem>
                          );
                        })}

                        <DropdownMenuSeparator />

                        {/* Tools sub-dropdown */}
                        <DropdownMenuSub>
                          <DropdownMenuSubTrigger className="gap-2">
                            <Wrench className="h-4 w-4" />
                            <span>Tools</span>
                          </DropdownMenuSubTrigger>
                          <DropdownMenuSubContent className="max-h-[320px] overflow-y-auto">
                            {HOMEPAGE_TOOL_OPTIONS.map((tool) => {
                              const Icon = tool.icon;
                              const selected = !stockMode && defaultHomepage === tool.value;
                              return (
                                <DropdownMenuItem
                                  key={tool.value}
                                  onSelect={() => selectHomepage(tool.value)}
                                  className="cursor-pointer gap-2"
                                >
                                  <Icon className="h-4 w-4" />
                                  <span>{tool.label}</span>
                                  {selected && <Check className="ml-auto h-4 w-4 text-primary" />}
                                </DropdownMenuItem>
                              );
                            })}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onSelect={() => selectHomepage(ALL_TOOLS_OPTION.value)}
                              className="cursor-pointer gap-2 font-medium"
                            >
                              <Wrench className="h-4 w-4" />
                              <span>{ALL_TOOLS_OPTION.label}</span>
                              {!stockMode && defaultHomepage === ALL_TOOLS_OPTION.value && (
                                <Check className="ml-auto h-4 w-4 text-primary" />
                              )}
                            </DropdownMenuItem>
                          </DropdownMenuSubContent>
                        </DropdownMenuSub>

                        <DropdownMenuSeparator />

                        <DropdownMenuItem
                          onSelect={() => enterStockMode()}
                          className="cursor-pointer gap-2"
                        >
                          <LineChart className="h-4 w-4" />
                          <span>{t('settings.homepageStock')}</span>
                          {stockMode && <Check className="ml-auto h-4 w-4 text-primary" />}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>

                    {/* Specific-stock search — rendered outside the menu so the
                        input keeps focus (no Radix typeahead/focus-trap bugs). */}
                    {stockMode && (
                      <div className="space-y-1.5 rounded-md border border-border/60 bg-muted/20 p-3">
                        <Label className="flex items-center gap-2 text-xs">
                          <Search className="h-3.5 w-3.5" />
                          {t('settings.homepageStockTickerLabel')}
                        </Label>
                        <TickerSelector
                          value={homepageStockPick}
                          onChange={(r) => {
                            if (r) {
                              setHomepageStockPick(r);
                              setDefaultHomepage(`/stock/${r.ticker.toUpperCase()}`);
                            } else {
                              setHomepageStockPick(null);
                            }
                          }}
                          placeholder={t('settings.homepageStockSearchPlaceholder')}
                        />
                        <p className="text-xs text-muted-foreground">
                          {homepageStockPick
                            ? t('settings.homepageStockTickerHint')
                            : 'Search and pick a stock to use as your homepage.'}
                        </p>
                      </div>
                    )}

                    <p className="text-xs text-muted-foreground">
                      {t('settings.defaultHomepageDescription')}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="theme" className="flex items-center gap-2">
                      <Moon className="h-4 w-4" />
                      {t('settings.theme')}
                    </Label>
                    <Select
                      value={theme}
                      onValueChange={(value: ThemeValue) => setTheme(value)}
                    >
                      <SelectTrigger id="theme">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="dark">Dark</SelectItem>
                        <SelectItem value="light">Light</SelectItem>
                        <SelectItem value="gradient-purple">Gradient Purple</SelectItem>
                        <SelectItem value="gradient-blue">Gradient Blue</SelectItem>
                        <SelectItem value="gradient-midnight">Gradient Midnight</SelectItem>
                        <SelectItem value="gradient-embers">Gradient Embers</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <SettingsCard>
                    <ToggleSetting
                      icon={Hash}
                      label={t('settings.roundNumbers')}
                      description={t('settings.roundNumbersDescription')}
                      checked={roundNumbers}
                      onCheckedChange={setRoundNumbers}
                    />
                  </SettingsCard>
                </div>
              </div>
            )}

            {activeSection === 'notifications' && (
              <div className="space-y-6 max-w-2xl">
                <SettingsCard>
                  <ToggleSetting
                    label="Earnings Today"
                    description="Get notified the morning a tracked stock reports earnings"
                    checked={notifications.upcoming_earnings}
                    onCheckedChange={(checked) => setNotifications({ ...notifications, upcoming_earnings: checked })}
                  />
                  <ToggleSetting
                    label="Big Price Moves"
                    description="Daily alert when a tracked stock moves 5% or more"
                    checked={notifications.price_alerts}
                    onCheckedChange={(checked) => setNotifications({ ...notifications, price_alerts: checked })}
                  />
                  <ToggleSetting
                    label="Daily Portfolio Recap"
                    description="A daily summary of how your holdings moved and what drove it"
                    checked={notifications.portfolio_recap}
                    onCheckedChange={(checked) => setNotifications({ ...notifications, portfolio_recap: checked })}
                  />
                  <ToggleSetting
                    label="AI Insights Ready"
                    description="Get notified when a Deep Dive, Portfolio Builder, or Risk Analysis finishes running"
                    checked={notifications.ai_insights}
                    onCheckedChange={(checked) => setNotifications({ ...notifications, ai_insights: checked })}
                  />
                  <ToggleSetting
                    label="Health Score Changes"
                    description="Get notified when a tracked stock's BullPen health score crosses a letter grade"
                    checked={notifications.health_score_change}
                    onCheckedChange={(checked) => setNotifications({ ...notifications, health_score_change: checked })}
                  />
                  <ToggleSetting
                    label="Ex-Dividend Reminders"
                    description="Get notified a few days before a tracked stock goes ex-dividend"
                    checked={notifications.dividend_reminder}
                    onCheckedChange={(checked) => setNotifications({ ...notifications, dividend_reminder: checked })}
                  />
                  <ToggleSetting
                    label="Daily Brief Ready"
                    description="Get notified when today's AI market brief is published"
                    checked={notifications.daily_brief_ready}
                    onCheckedChange={(checked) => setNotifications({ ...notifications, daily_brief_ready: checked })}
                  />
                  <ToggleSetting
                    label="Weekly Pick"
                    description="Get notified when Bull publishes the week's featured stock pick"
                    checked={notifications.weekly_pick}
                    onCheckedChange={(checked) => setNotifications({ ...notifications, weekly_pick: checked })}
                  />
                  <ToggleSetting
                    label="Daily Challenge Reminder"
                    description="An evening nudge to keep your Academy streak alive if you haven't done today's challenge yet"
                    checked={notifications.daily_challenge_reminder}
                    onCheckedChange={(checked) => setNotifications({ ...notifications, daily_challenge_reminder: checked })}
                  />
                </SettingsCard>
              </div>
            )}

            {activeSection === 'customize' && (
              <div className="space-y-8 max-w-2xl">
                <div className="space-y-2">
                  <ExperienceLevelToggle variant="full" />
                </div>

                {/* ── Home ──────────────────────────────────────────── */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 border-b pb-2">
                    <Home className="h-4 w-4 text-muted-foreground" />
                    <h3 className="text-sm font-semibold">Home</h3>
                  </div>

                  <SettingsCard>
                    <ToggleSetting
                      label="Show Welcome Text"
                      description="Display a personalized welcome message at the top of the page"
                      checked={showWelcomeText}
                      onCheckedChange={setShowWelcomeText}
                    />
                  </SettingsCard>

                  <div className="space-y-3 pt-1">
                    <Label className="flex items-center gap-2">
                      <LayoutGrid className="h-4 w-4" />
                      Homepage Layout
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Drag to reorder cards on your homepage. Toggle the eye icon to hide cards
                      you don&apos;t use — including the investing quote.
                    </p>
                    <HomepageLayoutEditor
                      order={widgetOrder}
                      hidden={widgetHidden}
                      onChange={(o, h) => {
                        setWidgetOrder(o);
                        setWidgetHidden(h);
                      }}
                    />
                  </div>

                  {!widgetHidden.includes('market_context') && (
                    <div className="space-y-3 pt-1">
                      <Label className="flex items-center gap-2">
                        <LayoutGrid className="h-4 w-4" />
                        Market Context Cards
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Choose which cards appear inside Market Context — hide the ones you
                        don&apos;t use without hiding the whole section.
                      </p>
                      <MarketContextVisibilityEditor
                        hidden={marketContextHidden}
                        onChange={setMarketContextHidden}
                      />
                    </div>
                  )}
                </div>

                {/* ── Charts ────────────────────────────────────────── */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 border-b pb-2">
                    <LineChart className="h-4 w-4 text-muted-foreground" />
                    <h3 className="text-sm font-semibold">Charts</h3>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Defaults for every price chart. These stay in sync with the chart settings
                    on each stock page.
                  </p>
                  <div className="rounded-lg border bg-muted/20 p-4">
                    <ChartPrefsControls
                      prefs={chartPrefs.prefs}
                      setPref={chartPrefs.setPref}
                      reset={chartPrefs.reset}
                    />
                  </div>
                </div>
              </div>
            )}

            {activeSection === 'plan' && (
              <div className="space-y-4 max-w-2xl">
                <div className="rounded-xl border bg-card p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      {ent.isPro
                        ? <Crown className="h-5 w-5 shrink-0 text-primary" />
                        : <Sparkles className="h-5 w-5 shrink-0 text-muted-foreground" />}
                      <div>
                        <p className="text-sm font-semibold text-foreground">{ent.isPro ? 'Pro' : 'Free'}</p>
                        <p className="text-xs text-muted-foreground">
                          {ent.isPro
                            ? 'Full access to the AI suite and unlimited tracking.'
                            : 'Unlimited research, screener, alerts and Academy — free.'}
                        </p>
                      </div>
                    </div>
                    {!ent.isPro && <UpgradeCTA />}
                  </div>
                </div>

                {!ent.isPro && (
                  <div className="rounded-xl border bg-muted/20 p-5">
                    <p className="text-sm font-semibold text-foreground">Pro unlocks</p>
                    <ul className="mt-2.5 space-y-2 text-sm text-muted-foreground">
                      <li className="flex items-center gap-2"><Check className="h-4 w-4 shrink-0 text-primary" /> Unlimited AI chat, Deep Dives &amp; Portfolio Builder</li>
                      <li className="flex items-center gap-2"><Check className="h-4 w-4 shrink-0 text-primary" /> Daily Brief &amp; &ldquo;Why Today?&rdquo; explanations</li>
                      <li className="flex items-center gap-2"><Check className="h-4 w-4 shrink-0 text-primary" /> Unlimited price alerts &amp; watchlists</li>
                      <li className="flex items-center gap-2"><Check className="h-4 w-4 shrink-0 text-primary" /> CSV/PDF exports &amp; insider transactions</li>
                    </ul>
                    <Link href="/upgrade" className="mt-4 inline-block text-xs font-medium text-primary hover:underline">
                      See the full comparison →
                    </Link>
                  </div>
                )}
              </div>
            )}

            {activeSection === 'privacy' && (
              <div className="space-y-6 max-w-2xl">
                <div className="space-y-4">

                  <div className="space-y-3">
                    <Label className="flex items-center gap-2">
                      <Shield className="h-4 w-4" />
                      Profile Visibility
                    </Label>
                    <SettingsCard>
                      <ToggleSetting
                        label="Public profile"
                        description="Allow other BullPen members to find and view your profile page."
                        checked={profilePublic}
                        onCheckedChange={setProfilePublic}
                      />
                      <ToggleSetting
                        label="Show portfolio"
                        description="Show your portfolio stocks (ticker and company name only, no quantities or prices) on your public profile."
                        checked={holdingsPublic}
                        onCheckedChange={setHoldingsPublic}
                        disabled={!profilePublic}
                      />
                    </SettingsCard>
                  </div>

                  <Separator />

                  <div className="space-y-3">
                    <Label className="flex items-center gap-2">
                      <Shield className="h-4 w-4" />
                      Change Password
                    </Label>
                    {user.app_metadata?.provider === 'google' ? (
                      <p className="text-xs text-muted-foreground">
                        You signed in with Google. Password change is not available for OAuth accounts.
                      </p>
                    ) : !showPasswordForm ? (
                      <Button variant="outline" onClick={() => { setShowPasswordForm(true); setError(null); }}>
                        Change Password
                      </Button>
                    ) : (
                      <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
                        <div className="space-y-1.5">
                          <Label htmlFor="pw-new" className="text-xs">New Password</Label>
                          <div className="relative">
                            <Input
                              id="pw-new"
                              type={showPasswordNew ? 'text' : 'password'}
                              value={passwordNew}
                              onChange={(e) => setPasswordNew(e.target.value)}
                              placeholder="Min. 8 characters"
                              className="pr-10"
                            />
                            <button
                              type="button"
                              onClick={() => setShowPasswordNew((v) => !v)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            >
                              {showPasswordNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="pw-confirm" className="text-xs">Confirm New Password</Label>
                          <div className="relative">
                            <Input
                              id="pw-confirm"
                              type={showPasswordConfirm ? 'text' : 'password'}
                              value={passwordConfirm}
                              onChange={(e) => setPasswordConfirm(e.target.value)}
                              placeholder="Repeat new password"
                              className="pr-10"
                            />
                            <button
                              type="button"
                              onClick={() => setShowPasswordConfirm((v) => !v)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            >
                              {showPasswordConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            onClick={handleChangePassword}
                            disabled={isChangingPassword || passwordSuccess}
                            size="sm"
                            className="flex-1"
                          >
                            {isChangingPassword ? (
                              <><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />Updating...</>
                            ) : passwordSuccess ? (
                              <><Check className="mr-2 h-3.5 w-3.5" />Password updated!</>
                            ) : (
                              'Update Password'
                            )}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => { setShowPasswordForm(false); setPasswordNew(''); setPasswordConfirm(''); setError(null); }}
                            disabled={isChangingPassword}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>

                </div>
              </div>
            )}

            {activeSection === 'ai' && (
              <div className="space-y-6 max-w-2xl">
                <div className="space-y-2">
                  <ExperienceLevelToggle variant="full" />
                </div>

                <Separator />

                <div className="space-y-3">
                  <div>
                    <Label className="text-sm font-medium">Risk Profile</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Shapes how the AI frames investment analysis and risk discussion.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {([
                      { value: 'conservative', label: 'Conservative', description: 'Capital preservation, downside risks' },
                      { value: 'balanced', label: 'Balanced', description: 'Balanced risk-reward perspective' },
                      { value: 'aggressive', label: 'Aggressive', description: 'Growth focus, upside opportunity' },
                    ] as const).map(({ value, label, description }) => (
                      <button
                        key={value}
                        onClick={() => setRiskProfile(value)}
                        className={`flex-1 flex flex-col gap-1 rounded-lg border px-3 py-2.5 text-left text-sm transition-all ${
                          riskProfile === value
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border text-muted-foreground hover:border-foreground/20 hover:text-foreground'
                        }`}
                      >
                        <span className="font-medium">{label}</span>
                        <span className="text-xs opacity-70">{description}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <Separator />

                <div className="space-y-3">
                  <div>
                    <Label className="text-sm font-medium">Investment Time Horizon</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Adjusts whether AI emphasizes near-term catalysts or long-term fundamentals.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {([
                      { value: 'short', label: 'Short-term', description: '< 1 year' },
                      { value: 'medium', label: 'Medium-term', description: '1 – 5 years' },
                      { value: 'long', label: 'Long-term', description: '5+ years' },
                    ] as const).map(({ value, label, description }) => (
                      <button
                        key={value}
                        onClick={() => setInvestmentHorizon(value)}
                        className={`flex-1 flex flex-col gap-1 rounded-lg border px-3 py-2.5 text-left text-sm transition-all ${
                          investmentHorizon === value
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border text-muted-foreground hover:border-foreground/20 hover:text-foreground'
                        }`}
                      >
                        <span className="font-medium">{label}</span>
                        <span className="text-xs opacity-70">{description}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <Separator />

                <div className="space-y-3">
                  <div>
                    <Label className="text-sm font-medium">Response Style</Label>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Controls how long and structured AI responses are.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {([
                      { value: 'concise', label: 'Concise', description: '1–2 paragraphs, bullets' },
                      { value: 'balanced', label: 'Balanced', description: 'Standard analysis length' },
                      { value: 'detailed', label: 'Detailed', description: 'Full sections, all data' },
                    ] as const).map(({ value, label, description }) => (
                      <button
                        key={value}
                        onClick={() => setResponseStyle(value)}
                        className={`flex-1 flex flex-col gap-1 rounded-lg border px-3 py-2.5 text-left text-sm transition-all ${
                          responseStyle === value
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border text-muted-foreground hover:border-foreground/20 hover:text-foreground'
                        }`}
                      >
                        <span className="font-medium">{label}</span>
                        <span className="text-xs opacity-70">{description}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <Separator />

                <ToggleSetting
                  label="Let Bull see my holdings & watchlist"
                  description="Bull can reference what you actually own and watch when you ask about your own portfolio. Off by default; this is separate from the Portfolio Risk Analysis feature on the Holdings page, which stays a deeper, scored report either way."
                  checked={allowHoldingsContext}
                  onCheckedChange={setAllowHoldingsContext}
                />
              </div>
            )}

            {activeSection === 'danger' && (
              <div className="space-y-6 max-w-2xl">
                <div className="space-y-4">
                  <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4 space-y-4">
                    <div className="flex items-center gap-2 text-destructive">
                      <AlertTriangle className="h-5 w-5" />
                      <Label className="text-base">Export Data</Label>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Download all your data (holdings, settings) as a JSON file.
                    </p>
                    <Button
                      variant="outline"
                      onClick={handleExportData}
                      disabled={isExportingData}
                      className="w-full"
                    >
                      {isExportingData ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Exporting...
                        </>
                      ) : (
                        <>
                          <Download className="mr-2 h-4 w-4" />
                          Export Data
                        </>
                      )}
                    </Button>
                  </div>

                  <Separator />

                  <div className="rounded-lg border border-destructive/50 bg-destructive/5 p-4 space-y-4">
                    <div className="flex items-center gap-2 text-destructive">
                      <Trash2 className="h-5 w-5" />
                      <Label className="text-base">Delete Account</Label>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Permanently delete your account and all associated data. This action
                      cannot be undone.
                    </p>
                    <Button
                      variant="destructive"
                      onClick={handleDeleteAccount}
                      disabled={isDeletingAccount}
                      className="w-full"
                    >
                      {isDeletingAccount ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Deleting account...
                        </>
                      ) : (
                        <>
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete Account
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {error && (
              <div className="mt-4 p-3 rounded-md bg-destructive/10 text-destructive text-sm animate-in fade-in slide-in-from-bottom-2">
                {error}
              </div>
            )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
