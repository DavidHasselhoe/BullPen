'use client';

import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/use-auth';
import { SUPPORTED_LANGUAGES, isSupportedLanguage } from '@/lib/i18n/language-names';
import { writeLocaleCookie } from '@/lib/i18n/locale-cookie';
import { getPasswordStrengthError } from '@/lib/auth/password-strength';
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
import Link from 'next/link';
import { Loader2, Globe, Bell, Shield, AlertCircle, Trash2, Download, Check, Settings2, Eye, EyeOff, Home, Search, Bot, LineChart, Wrench, ChevronDown, Sparkles, Crown, CreditCard, type LucideIcon } from 'lucide-react';
import { useEntitlements } from '@/hooks/use-entitlements';
import { UpgradeCTA } from '@/components/billing/UpgradeCTA';
import { startPortal } from '@/lib/billing/checkout';
import { PRICING } from '@/lib/billing/entitlements';
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
import { ToggleSetting, SettingsCard, SettingsGroup, SegmentedChoice } from '@/components/settings/SettingsControls';
import { DEFAULT_ORDER as DEFAULT_WIDGET_ORDER } from '@/lib/dashboard/widgets';
import { ChartPrefsControls } from '@/components/stock/ChartPrefsControls';
import { useChartPrefs } from '@/hooks/use-chart-prefs';
import type { ExperienceLevel } from '@/hooks/use-experience-level';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { TickerSelector, type SearchResult } from '@/components/tools/buy-here/TickerSelector';
import { createBrowserClient } from '@/lib/supabase/client';
import { signOut } from '@/lib/auth/auth';
import { useRouter } from 'next/navigation';
import { deleteAccount, exportUserData } from '@/app/actions/account';
import { DeleteAccountDialog } from '@/components/user/DeleteAccountDialog';

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

type ThemeValue = 'dark' | 'light';
type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

const VALID_THEMES: ThemeValue[] = ['dark', 'light'];

function minimalStockPick(ticker: string): SearchResult {
  const t = ticker.toUpperCase();
  return { ticker: t, name: t, cik: '', has_data: false };
}

export function SettingsModal({ open, onOpenChange, initialTab }: SettingsModalProps) {
  const { user } = useAuth();
  const router = useRouter();
  const { t, i18n } = useTranslation('settings');
  const [activeSection, setActiveSection] = useState<SettingsSection>(initialTab ?? 'preferences');
  const [error, setError] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isExportingData, setIsExportingData] = useState(false);
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [passwordNew, setPasswordNew] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [showPasswordNew, setShowPasswordNew] = useState(false);
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  // Google-only accounts have no password to change. AuthUser (the users row)
  // carries no provider, so the old `user.app_metadata` check was always
  // undefined and they got a password form; the auth session knows.
  const [hasPassword, setHasPassword] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

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
  // Experience level lives here and only here (it used to be a Profile select
  // and a Simple/Pro toggle on two tabs as well, with "Pro" writing
  // intermediate over an Advanced user's choice).
  const [experienceLevel, setExperienceLevel] = useState<ExperienceLevel>('beginner');

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
        ? `${homepageStockPick.ticker} · ${homepageStockPick.name}`
        : homepageStockPick.ticker
      : t('homepageStock')
    : currentHomepageOption?.label ?? t('homepageHome');
  const [widgetOrder, setWidgetOrder] = useState<string[]>(DEFAULT_WIDGET_ORDER);
  const [widgetHidden, setWidgetHidden] = useState<string[]>([]);
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
    institution_filing: true,
    politician_trades: true,
    politician_trades_holdings: true,
    // Opt-in: ~6-8 market-wide releases a month is noise for anyone not following macro.
    economic_events: false,
  });
  type NotificationKey = keyof typeof notifications;
  const notif = (key: NotificationKey) => ({
    checked: notifications[key],
    onCheckedChange: (checked: boolean) => setNotifications((n) => ({ ...n, [key]: checked })),
  });

  // Jump to initialTab when modal opens (e.g. from AI panel gear icon)
  useEffect(() => {
    if (open && initialTab) {
      setActiveSection(initialTab);
    }
  }, [open, initialTab]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    createBrowserClient().auth.getUser().then(({ data }) => {
      const meta = data.user?.app_metadata as { provider?: string; providers?: string[] } | undefined;
      const providers = meta?.providers ?? (meta?.provider ? [meta.provider] : ['email']);
      if (!cancelled) setHasPassword(providers.includes('email'));
    });
    return () => { cancelled = true; };
  }, [open]);

  // Each section opens at its top, and an error from one section (a password
  // mismatch) doesn't follow you to the next.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
    setError(null);
  }, [activeSection]);

  // Autosave refs
  const isInitializedRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSaveRef = useRef<(() => Promise<boolean>) | undefined>(undefined);

  // Fresh status per opening. Not in the load effect below: that re-runs after
  // every save (auth:refresh hands it a new user) and wiped "All changes saved".
  useEffect(() => {
    if (open) setSaveStatus('idle');
  }, [open]);

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
        institution_filing: settings.notifications?.institution_filing !== false,
        politician_trades: settings.notifications?.politician_trades !== false,
        politician_trades_holdings: settings.notifications?.politician_trades_holdings !== false,
        economic_events: settings.notifications?.economic_events === true,
      });
      const dh = (settings.default_homepage as string) || '/dashboard';
      setDefaultHomepage(dh);
      const stockMatch = dh.match(/^\/stock\/([A-Za-z0-9.-]+)$/i);
      setHomepageStockPick(stockMatch ? minimalStockPick(stockMatch[1]) : null);
      setStockMode(!!stockMatch);
      setShowWelcomeText(settings.show_welcome_text !== undefined ? settings.show_welcome_text : true);
      setRoundNumbers(settings.round_numbers === true);
      setWidgetOrder(Array.isArray(settings.homepage_widget_order) ? settings.homepage_widget_order : DEFAULT_WIDGET_ORDER);
      setWidgetHidden(Array.isArray(settings.homepage_widget_hidden) ? settings.homepage_widget_hidden : []);
      setExperienceLevel(user.experience_level ?? 'beginner');
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

  /** True when the change reached the database. */
  const handleSave = async (): Promise<boolean> => {
    if (!user) return false;
    setError(null);
    try {
      const supabase = createBrowserClient();
      // Read the freshest settings before merging so we never clobber values
      // written by other surfaces between modal open and save — chart_prefs (the
      // stock-page chart popover), profile_public/holdings_public (the Profile
      // modal) and anything else saved outside this modal.
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
        investment_horizon: investmentHorizon,
        response_style: responseStyle,
        allow_holdings_context: allowHoldingsContext,
        homepage_widget_order: widgetOrder,
        homepage_widget_hidden: widgetHidden,
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const usersTable = (supabase as any).from('users');
      const { error: updateError } = await usersTable
        .update({ settings: mergedSettings, risk_profile: riskProfile, experience_level: experienceLevel })
        .eq('id', user.id);

      if (updateError) throw updateError;

      // Was `['en','es','fr','de','ja','zh']` here — missing 'no', so a
      // Norwegian-browser user choosing "System default" silently got
      // English. SUPPORTED_LANGUAGES is the single shared list now (see
      // lib/i18n/language-names.ts) so this can't drift again.
      const resolvedLang = language
        ? language
        : (() => {
            const browserLang = navigator.language.split('-')[0];
            return isSupportedLanguage(browserLang) ? browserLang : 'en';
          })();

      await i18n.changeLanguage(resolvedLang);
      document.documentElement.lang = resolvedLang;
      // bp_lang mirrors users.settings.language for the fast, DB-free server
      // read (middleware.ts / lib/i18n/server.ts) — without this the next
      // page load would still resolve locale from the stale cookie.
      writeLocaleCookie(resolvedLang);

      window.dispatchEvent(new Event('auth:refresh'));
      return true;
    } catch {
      // The database's own message ("JWT expired", a constraint name) means
      // nothing to the person reading it.
      setError(t('errorUpdateSettings'));
      return false;
    }
  };

  // Keep the ref current so the debounced autosave always calls the latest closure
  useEffect(() => { handleSaveRef.current = handleSave; });

  // Autosave — debounced 500 ms after any settings change. Reports what
  // actually happened: it used to say "All changes saved" after a failure.
  useEffect(() => {
    if (!isInitializedRef.current || !user) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      if (!handleSaveRef.current) return;
      setSaveStatus('saving');
      const ok = await handleSaveRef.current();
      setSaveStatus(ok ? 'saved' : 'error');
      if (ok) setTimeout(() => setSaveStatus((s) => (s === 'saved' ? 'idle' : s)), 2000);
    }, 500);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultCurrency, theme, language, defaultHomepage, showWelcomeText, roundNumbers, notifications, experienceLevel, riskProfile, investmentHorizon, responseStyle, allowHoldingsContext, widgetOrder, widgetHidden]);

  const handleDeleteAccount = async (): Promise<string | null> => {
    if (!user) return t('errorDeleteAccount');
    try {
      const result = await deleteAccount();
      if (!result.success) return t('errorDeleteAccount');
      await signOut();
      router.push('/');
      router.refresh();
      return null;
    } catch {
      return t('errorDeleteAccount');
    }
  };

  const handleExportData = async () => {
    if (!user) return;

    setIsExportingData(true);
    setError(null);

    try {
      const result = await exportUserData();
      if (!result.success || !result.data) {
        setError(t('errorExportData'));
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
    } catch {
      setError(t('errorExportData'));
    } finally {
      setIsExportingData(false);
    }
  };

  const handleManageSubscription = async () => {
    setPortalLoading(true);
    const result = await startPortal();
    // Comped/admin accounts have no Stripe customer — fall back to pricing.
    window.location.href = result.url || '/upgrade';
  };

  const closePasswordForm = () => {
    setShowPasswordForm(false);
    setPasswordNew('');
    setPasswordConfirm('');
    setPasswordError(null);
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordNew || !passwordConfirm) {
      setPasswordError(t('errorPasswordFieldsRequired'));
      return;
    }
    const strengthError = getPasswordStrengthError(passwordNew);
    if (strengthError === 'tooShort') {
      setPasswordError(t('errorPasswordTooShort'));
      return;
    }
    if (strengthError === 'tooWeak') {
      setPasswordError(t('errorPasswordTooWeak'));
      return;
    }
    if (strengthError === 'tooCommon') {
      setPasswordError(t('errorPasswordTooCommon'));
      return;
    }
    if (passwordNew !== passwordConfirm) {
      setPasswordError(t('errorPasswordMismatch'));
      return;
    }

    setIsChangingPassword(true);
    setPasswordError(null);
    setPasswordSuccess(false);

    try {
      const supabase = createBrowserClient();
      const { error: updateError } = await supabase.auth.updateUser({ password: passwordNew });
      if (updateError) {
        // Auth's own messages here are about the password itself ("should be
        // different from the old password"), which is what the person needs.
        setPasswordError(updateError.message || t('errorPasswordUpdateFailed'));
        return;
      }

      // Revoke any other active sessions so a stolen refresh token doesn't
      // survive this password change. Best-effort — the password itself is
      // already changed, so a failure here shouldn't block the success state.
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        fetch('/api/auth/invalidate-other-sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accessToken: session.access_token }),
        }).catch(() => {});
      }

      setPasswordSuccess(true);
      setPasswordNew('');
      setPasswordConfirm('');
      setTimeout(() => {
        setShowPasswordForm(false);
        setPasswordSuccess(false);
      }, 2000);
    } catch {
      setPasswordError(t('errorPasswordUpdateFailed'));
    } finally {
      setIsChangingPassword(false);
    }
  };

  const openProfile = () => {
    onOpenChange(false);
    window.dispatchEvent(new Event('profile:open'));
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
        { id: 'preferences', label: t('preferences'), icon: Globe, description: t('sectionPreferencesDescription') },
        { id: 'notifications', label: t('notifications'), icon: Bell, description: t('sectionNotificationsDescription') },
        { id: 'customize', label: t('customize'), icon: Settings2, description: t('sectionCustomizeDescription') },
        { id: 'ai', label: t('sectionAiLabel'), icon: Bot, description: t('sectionAiDescription') },
      ],
    },
    {
      heading: t('sectionAccountHeading'),
      items: [
        { id: 'plan', label: t('sectionPlanLabel'), icon: Sparkles, description: t('sectionPlanDescription') },
        { id: 'privacy', label: t('privacy'), icon: Shield, description: t('sectionPrivacyDescription') },
        { id: 'danger', label: t('danger'), icon: Trash2, description: t('sectionDangerDescription') },
      ],
    },
  ];
  const allSections = sectionGroups.flatMap((g) => g.items);
  const activeMeta = allSections.find((s) => s.id === activeSection) ?? allSections[0];

  if (!user) {
    return null;
  }

  const statusLine = (
    <p aria-live="polite" className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
      {saveStatus === 'saving' ? (
        <><Loader2 className="h-3 w-3 animate-spin" aria-hidden />{t('savingEllipsis')}</>
      ) : saveStatus === 'saved' ? (
        <><Check className="h-3 w-3 text-foreground" aria-hidden />{t('allChangesSaved')}</>
      ) : saveStatus === 'error' ? (
        <span className="flex items-center gap-1.5 text-destructive"><AlertCircle className="h-3 w-3" aria-hidden />{t('saveFailed')}</span>
      ) : (
        t('changesSaveAutomatically')
      )}
    </p>
  );

  const showPasswordToggle = (shown: boolean, toggle: () => void) => (
    <button
      type="button"
      onClick={toggle}
      aria-label={shown ? t('privacyHidePasswordAria') : t('privacyShowPasswordAria')}
      aria-pressed={shown}
      className="absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {shown ? <EyeOff className="h-4 w-4" aria-hidden /> : <Eye className="h-4 w-4" aria-hidden />}
    </button>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[94vw] !max-w-[1000px] sm:!max-w-[1000px] h-[88vh] sm:h-[85vh] overflow-hidden flex flex-col gap-0 p-0">
        <DialogHeader className="px-5 pt-5 pb-4 border-b text-left sm:px-6 sm:pt-6">
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>

        {/* Phones: a scrollable row of labelled tabs. The icon-only rail it
            replaces named its sections in a hover title, which touch never shows. */}
        <nav className="scrollbar-hide flex shrink-0 gap-1 overflow-x-auto border-b px-3 py-2 sm:hidden" aria-label={t('title')}>
          {allSections.map((section) => {
            const active = activeSection === section.id;
            return (
              <button
                key={section.id}
                type="button"
                onClick={() => setActiveSection(section.id)}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'min-h-10 shrink-0 whitespace-nowrap rounded-md px-3 text-sm font-medium transition-colors duration-150',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  active ? 'bg-accent text-foreground' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {section.label}
              </button>
            );
          })}
        </nav>

        <div className="flex min-h-0 flex-1">
          {/* Sidebar navigation, tablet and up */}
          <aside className="hidden w-56 shrink-0 flex-col border-r bg-muted/20 sm:flex">
            <nav className="flex-1 space-y-4 overflow-y-auto p-3" aria-label={t('title')}>
              {sectionGroups.map((group, gi) => (
                <div key={gi} className="space-y-1">
                  {group.heading && (
                    <p className="px-3 pt-2 pb-1 text-xs font-medium text-muted-foreground">
                      {group.heading}
                    </p>
                  )}
                  {group.items.map((section) => {
                    const Icon = section.icon;
                    const active = activeSection === section.id;
                    return (
                      <button
                        key={section.id}
                        type="button"
                        onClick={() => setActiveSection(section.id)}
                        aria-current={active ? 'page' : undefined}
                        className={cn(
                          'relative flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-150',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          active
                            ? 'bg-accent text-foreground'
                            : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                        )}
                      >
                        <Icon className="h-4 w-4 shrink-0" aria-hidden />
                        <span>{section.label}</span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </nav>
          </aside>

          {/* Main content: a fixed header carrying the save status and any
              error, so neither ends up below the fold of a long section. */}
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="shrink-0 border-b px-5 py-4 sm:px-6">
              <div className="flex max-w-2xl flex-wrap items-start justify-between gap-x-4 gap-y-1">
                <div className="min-w-0">
                  <h2 className="text-base font-semibold tracking-tight text-foreground">{activeMeta.label}</h2>
                  <p className="mt-0.5 text-sm text-muted-foreground">{activeMeta.description}</p>
                </div>
                <div className="pt-1">{statusLine}</div>
              </div>
              {error && (
                <p role="alert" className="mt-3 flex max-w-2xl items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  {error}
                </p>
              )}
            </div>

            <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
              <div
                key={activeSection}
                className="max-w-2xl p-5 sm:p-6 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200"
              >

            {activeSection === 'preferences' && (
              <div className="space-y-6">
                <div className="space-y-2">
                  <Label htmlFor="default-currency">{t('currency')}</Label>
                  <Select
                    value={defaultCurrency || 'auto'}
                    onValueChange={(value) => setDefaultCurrency(value === 'auto' ? null : value)}
                  >
                    <SelectTrigger id="default-currency" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">{t('currencyAuto')}</SelectItem>
                      <SelectItem value="USD">{t('currencyOptionUsd')}</SelectItem>
                      <SelectItem value="EUR">{t('currencyOptionEur')}</SelectItem>
                      <SelectItem value="GBP">{t('currencyOptionGbp')}</SelectItem>
                      <SelectItem value="NOK">{t('currencyOptionNok')}</SelectItem>
                      <SelectItem value="SEK">{t('currencyOptionSek')}</SelectItem>
                      <SelectItem value="DKK">{t('currencyOptionDkk')}</SelectItem>
                      <SelectItem value="JPY">{t('currencyOptionJpy')}</SelectItem>
                      <SelectItem value="CHF">{t('currencyOptionChf')}</SelectItem>
                      <SelectItem value="CAD">{t('currencyOptionCad')}</SelectItem>
                      <SelectItem value="AUD">{t('currencyOptionAud')}</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {defaultCurrency
                      ? t('currencyDescriptionConverted', { currency: defaultCurrency })
                      : t('currencyDescription')}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="language">{t('language')}</Label>
                  <Select
                    value={language || 'system'}
                    onValueChange={(value) => setLanguage(value === 'system' ? null : value)}
                  >
                    <SelectTrigger id="language" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="system">{t('languageSystem')}</SelectItem>
                      {SUPPORTED_LANGUAGES.map((code) => (
                        // 'languages' is its own namespace file, not a nested key
                        // under 'settings' — cross-namespace lookup via 'ns:key'.
                        <SelectItem key={code} value={code}>{t(`languages:${code}`)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">{t('languageDescription')}</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="default-homepage">{t('defaultHomepage')}</Label>

                  <DropdownMenu open={homepageMenuOpen} onOpenChange={setHomepageMenuOpen}>
                    <DropdownMenuTrigger asChild>
                      <button
                        id="default-homepage"
                        type="button"
                        className="flex w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm transition-colors hover:bg-accent/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <HomepageIcon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                          {/* clamp-ok: a page or company name in a one-line field */}
                          <span className="truncate">{homepageLabel}</span>
                        </span>
                        <ChevronDown
                          className={cn(
                            'h-4 w-4 shrink-0 opacity-50 transition-transform duration-200',
                            homepageMenuOpen && 'rotate-180'
                          )}
                          aria-hidden
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
                            {selected && <Check className="ml-auto h-4 w-4" />}
                          </DropdownMenuItem>
                        );
                      })}

                      <DropdownMenuSeparator />

                      {/* Tools sub-dropdown */}
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger className="gap-2">
                          <Wrench className="h-4 w-4" />
                          <span>{t('homepageTools')}</span>
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
                                {selected && <Check className="ml-auto h-4 w-4" />}
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
                              <Check className="ml-auto h-4 w-4" />
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
                        <span>{t('homepageStock')}</span>
                        {stockMode && <Check className="ml-auto h-4 w-4" />}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  {/* Specific-stock search — rendered outside the menu so the
                      input keeps focus (no Radix typeahead/focus-trap bugs). */}
                  {stockMode && (
                    <div className="space-y-1.5 rounded-md border border-border/60 bg-muted/20 p-3">
                      <Label className="flex items-center gap-2 text-xs">
                        <Search className="h-3.5 w-3.5" aria-hidden />
                        {t('homepageStockTickerLabel')}
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
                        placeholder={t('homepageStockSearchPlaceholder')}
                      />
                      <p className="text-xs text-muted-foreground">
                        {homepageStockPick
                          ? t('homepageStockTickerHint')
                          : t('homepageStockSearchHint')}
                      </p>
                    </div>
                  )}

                  <p className="text-xs text-muted-foreground">{t('defaultHomepageDescription')}</p>
                </div>

                <SettingsCard>
                  <ToggleSetting
                    label={t('darkMode')}
                    checked={theme === 'dark'}
                    onCheckedChange={(on) => setTheme(on ? 'dark' : 'light')}
                  />
                  <ToggleSetting
                    label={t('roundNumbers')}
                    description={t('roundNumbersDescription')}
                    checked={roundNumbers}
                    onCheckedChange={setRoundNumbers}
                  />
                </SettingsCard>
              </div>
            )}

            {activeSection === 'notifications' && (
              <div className="space-y-6">
                <SettingsGroup title={t('notifGroupStocks')}>
                  <SettingsCard>
                    <ToggleSetting label={t('notifEarningsTodayLabel')} description={t('notifEarningsTodayDescription')} {...notif('upcoming_earnings')} />
                    <ToggleSetting label={t('notifBigPriceMovesLabel')} description={t('notifBigPriceMovesDescription')} {...notif('price_alerts')} />
                    <ToggleSetting label={t('notifPortfolioRecapLabel')} description={t('notifPortfolioRecapDescription')} {...notif('portfolio_recap')} />
                    <ToggleSetting label={t('notifExDividendLabel')} description={t('notifExDividendDescription')} {...notif('dividend_reminder')} />
                    <ToggleSetting label={t('notifHealthScoreLabel')} description={t('notifHealthScoreDescription')} {...notif('health_score_change')} />
                    {/* Pro-only: a Free user saw this "on" and could flip it,
                        for a notification they would never get. */}
                    <ToggleSetting
                      label={t('notifPoliticianHoldingsLabel')}
                      description={t('notifPoliticianHoldingsDescription')}
                      badge={ent.isPro ? undefined : t('notifProBadge')}
                      disabled={!ent.isPro}
                      checked={ent.isPro && notifications.politician_trades_holdings}
                      onCheckedChange={notif('politician_trades_holdings').onCheckedChange}
                    />
                  </SettingsCard>
                </SettingsGroup>

                <SettingsGroup title={t('notifGroupBullpen')}>
                  <SettingsCard>
                    <ToggleSetting label={t('notifDailyBriefLabel')} description={t('notifDailyBriefDescription')} {...notif('daily_brief_ready')} />
                    <ToggleSetting label={t('notifWeeklyPickLabel')} description={t('notifWeeklyPickDescription')} {...notif('weekly_pick')} />
                    <ToggleSetting label={t('notifAiInsightsLabel')} description={t('notifAiInsightsDescription')} {...notif('ai_insights')} />
                    <ToggleSetting label={t('notifEconomicEventsLabel')} description={t('notifEconomicEventsDescription')} {...notif('economic_events')} />
                  </SettingsCard>
                </SettingsGroup>

                <SettingsGroup title={t('notifGroupFollowing')}>
                  <SettingsCard>
                    <ToggleSetting label={t('notifPoliticianTradesLabel')} description={t('notifPoliticianTradesDescription')} {...notif('politician_trades')} />
                    <ToggleSetting label={t('notifInstitutionFilingLabel')} description={t('notifInstitutionFilingDescription')} {...notif('institution_filing')} />
                  </SettingsCard>
                </SettingsGroup>

                <SettingsGroup title={t('notifGroupAcademy')}>
                  <SettingsCard>
                    <ToggleSetting label={t('notifDailyChallengeLabel')} description={t('notifDailyChallengeDescription')} {...notif('daily_challenge_reminder')} />
                  </SettingsCard>
                </SettingsGroup>
              </div>
            )}

            {activeSection === 'customize' && (
              <div className="space-y-8">
                <SettingsGroup title={t('experienceLabel')} hint={t('experienceHint')}>
                  <SegmentedChoice
                    label={t('experienceLabel')}
                    value={experienceLevel}
                    onChange={setExperienceLevel}
                    options={[
                      { value: 'beginner', label: t('experienceBeginner'), description: t('experienceBeginnerDescription') },
                      { value: 'intermediate', label: t('experienceIntermediate'), description: t('experienceIntermediateDescription') },
                      { value: 'advanced', label: t('experienceAdvanced'), description: t('experienceAdvancedDescription') },
                    ]}
                  />
                </SettingsGroup>

                <SettingsGroup title={t('customizeHomeHeading')}>
                  <SettingsCard>
                    <ToggleSetting
                      label={t('customizeShowWelcomeLabel')}
                      description={t('customizeShowWelcomeDescription')}
                      checked={showWelcomeText}
                      onCheckedChange={setShowWelcomeText}
                    />
                  </SettingsCard>
                  <div className="space-y-2 pt-2">
                    <p className="text-sm font-medium text-foreground">{t('customizeHomepageLayoutLabel')}</p>
                    <p className="text-xs text-muted-foreground">{t('customizeHomepageLayoutHint')}</p>
                    <HomepageLayoutEditor
                      order={widgetOrder}
                      hidden={widgetHidden}
                      onChange={(o, h) => {
                        setWidgetOrder(o);
                        setWidgetHidden(h);
                      }}
                    />
                  </div>
                </SettingsGroup>

                <SettingsGroup title={t('customizeChartsHeading')} hint={t('customizeChartsHint')}>
                  <div className="rounded-xl border bg-card/30 p-4">
                    <ChartPrefsControls
                      prefs={chartPrefs.prefs}
                      setPref={chartPrefs.setPref}
                      setPrefs={chartPrefs.setPrefs}
                      reset={chartPrefs.reset}
                    />
                  </div>
                </SettingsGroup>
              </div>
            )}

            {activeSection === 'plan' && (
              <div className="space-y-4">
                <div className="rounded-xl border bg-card p-5">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      {ent.isPro
                        ? <Crown className="h-5 w-5 shrink-0 text-foreground" aria-hidden />
                        : <Sparkles className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden />}
                      <div>
                        <p className="text-sm font-semibold text-foreground">{ent.isPro ? t('planProLabel') : t('planFreeLabel')}</p>
                        <p className="text-xs text-muted-foreground">
                          {ent.isPro ? t('planProDescription') : t('planFreeDescription')}
                        </p>
                      </div>
                    </div>
                    {/* The menu offers the trial, so the Plan tab does too: it
                        used to say only "Upgrade to Pro" at the point of decision. */}
                    {!ent.isPro && (
                      <div className="flex flex-col items-start gap-1">
                        <UpgradeCTA label={t('navigation:navTryProFree', { days: PRICING.trialDays })} />
                        <span className="text-xs text-muted-foreground">{t('navigation:navTryProFreeSub')}</span>
                      </div>
                    )}
                  </div>
                </div>

                {ent.isPro ? (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card/30 p-5">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{t('planManageSubscription')}</p>
                      <p className="text-xs text-muted-foreground">{t('planManageSubscriptionHint')}</p>
                    </div>
                    <Button variant="outline" size="sm" onClick={handleManageSubscription} disabled={portalLoading}>
                      {portalLoading
                        ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" aria-hidden />
                        : <CreditCard className="mr-2 h-3.5 w-3.5" aria-hidden />}
                      {t('planManageSubscription')}
                    </Button>
                  </div>
                ) : (
                  <div className="rounded-xl border bg-card/30 p-5">
                    <p className="text-sm font-semibold text-foreground">{t('planUnlocksHeading')}</p>
                    <ul className="mt-2.5 space-y-2 text-sm text-muted-foreground">
                      {(['planUnlockAiChat', 'planUnlockDailyBrief', 'planUnlockAlerts', 'planUnlockExports'] as const).map((key) => (
                        <li key={key} className="flex items-center gap-2">
                          <Check className="h-4 w-4 shrink-0 text-foreground" aria-hidden />
                          {t(key)}
                        </li>
                      ))}
                    </ul>
                    <Link href="/upgrade" className="mt-4 inline-block text-sm text-muted-foreground underline underline-offset-4 transition-colors hover:text-foreground">
                      {t('planSeeComparison')}
                    </Link>
                  </div>
                )}
              </div>
            )}

            {activeSection === 'privacy' && (
              <div className="space-y-8">
                <SettingsGroup title={t('privacyVisibilityLabel')} hint={t('privacyVisibilityHint')}>
                  <Button variant="outline" size="sm" onClick={openProfile} className="w-fit">
                    {t('privacyEditProfileButton')}
                  </Button>
                </SettingsGroup>

                <SettingsGroup title={t('privacyPasswordLabel')}>
                  {!hasPassword ? (
                    <p className="text-sm text-muted-foreground">{t('privacyOAuthNotice')}</p>
                  ) : !showPasswordForm ? (
                    <Button variant="outline" size="sm" className="w-fit" onClick={() => setShowPasswordForm(true)}>
                      {t('changePassword')}
                    </Button>
                  ) : (
                    // A real form, so Enter submits.
                    <form onSubmit={handleChangePassword} className="space-y-3 rounded-xl border bg-card/30 p-4">
                      <div className="space-y-1.5">
                        <Label htmlFor="pw-new">{t('privacyNewPasswordLabel')}</Label>
                        <div className="relative">
                          <Input
                            id="pw-new"
                            type={showPasswordNew ? 'text' : 'password'}
                            autoComplete="new-password"
                            value={passwordNew}
                            onChange={(e) => setPasswordNew(e.target.value)}
                            placeholder={t('privacyPasswordMinChars')}
                            className="pr-10"
                          />
                          {showPasswordToggle(showPasswordNew, () => setShowPasswordNew((v) => !v))}
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="pw-confirm">{t('privacyConfirmPasswordLabel')}</Label>
                        <div className="relative">
                          <Input
                            id="pw-confirm"
                            type={showPasswordConfirm ? 'text' : 'password'}
                            autoComplete="new-password"
                            value={passwordConfirm}
                            onChange={(e) => setPasswordConfirm(e.target.value)}
                            placeholder={t('privacyRepeatPassword')}
                            className="pr-10"
                          />
                          {showPasswordToggle(showPasswordConfirm, () => setShowPasswordConfirm((v) => !v))}
                        </div>
                      </div>
                      {passwordError && (
                        <p role="alert" className="text-sm text-destructive">{passwordError}</p>
                      )}
                      <div className="flex gap-2">
                        <Button type="submit" size="sm" disabled={isChangingPassword || passwordSuccess}>
                          {isChangingPassword ? (
                            <><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" aria-hidden />{t('privacyUpdatingPassword')}</>
                          ) : passwordSuccess ? (
                            <><Check className="mr-2 h-3.5 w-3.5" aria-hidden />{t('privacyPasswordUpdated')}</>
                          ) : (
                            t('privacyUpdatePasswordButton')
                          )}
                        </Button>
                        <Button type="button" variant="outline" size="sm" onClick={closePasswordForm} disabled={isChangingPassword}>
                          {t('privacyCancelButton')}
                        </Button>
                      </div>
                    </form>
                  )}
                </SettingsGroup>

                {/* Export is a routine backup, so it lives here, not beside account
                    deletion under red warning styling. */}
                <SettingsGroup title={t('exportData')} hint={t('dangerExportDescription')}>
                  <Button variant="outline" size="sm" className="w-fit" onClick={handleExportData} disabled={isExportingData}>
                    {isExportingData
                      ? <><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" aria-hidden />{t('dangerExporting')}</>
                      : <><Download className="mr-2 h-3.5 w-3.5" aria-hidden />{t('exportData')}</>}
                  </Button>
                </SettingsGroup>
              </div>
            )}

            {activeSection === 'ai' && (
              <div className="space-y-8">
                <SettingsGroup title={t('aiRiskProfileLabel')} hint={t('aiRiskProfileHint')}>
                  <SegmentedChoice
                    label={t('aiRiskProfileLabel')}
                    value={riskProfile}
                    onChange={setRiskProfile}
                    options={[
                      { value: 'conservative', label: t('aiRiskConservative'), description: t('aiRiskConservativeDescription') },
                      { value: 'balanced', label: t('aiRiskBalanced'), description: t('aiRiskBalancedDescription') },
                      { value: 'aggressive', label: t('aiRiskAggressive'), description: t('aiRiskAggressiveDescription') },
                    ]}
                  />
                </SettingsGroup>

                <SettingsGroup title={t('aiHorizonLabel')} hint={t('aiHorizonHint')}>
                  <SegmentedChoice
                    label={t('aiHorizonLabel')}
                    value={investmentHorizon}
                    onChange={setInvestmentHorizon}
                    options={[
                      { value: 'short', label: t('aiHorizonShort'), description: t('aiHorizonShortDescription') },
                      { value: 'medium', label: t('aiHorizonMedium'), description: t('aiHorizonMediumDescription') },
                      { value: 'long', label: t('aiHorizonLong'), description: t('aiHorizonLongDescription') },
                    ]}
                  />
                </SettingsGroup>

                <SettingsGroup title={t('aiResponseStyleLabel')} hint={t('aiResponseStyleHint')}>
                  <SegmentedChoice
                    label={t('aiResponseStyleLabel')}
                    value={responseStyle}
                    onChange={setResponseStyle}
                    options={[
                      { value: 'concise', label: t('aiStyleConcise'), description: t('aiStyleConciseDescription') },
                      { value: 'balanced', label: t('aiStyleBalanced'), description: t('aiStyleBalancedDescription') },
                      { value: 'detailed', label: t('aiStyleDetailed'), description: t('aiStyleDetailedDescription') },
                    ]}
                  />
                </SettingsGroup>

                <SettingsCard>
                  <ToggleSetting
                    label={t('aiHoldingsContextLabel')}
                    description={t('aiHoldingsContextDescription')}
                    checked={allowHoldingsContext}
                    onCheckedChange={setAllowHoldingsContext}
                  />
                </SettingsCard>
              </div>
            )}

            {activeSection === 'danger' && (
              <div className="rounded-xl border bg-card/30 p-5">
                <p className="text-sm text-muted-foreground">{t('deleteAccountDescription')}</p>
                <div className="mt-4 flex flex-wrap justify-end gap-2">
                  <Button variant="outline" size="sm" onClick={handleExportData} disabled={isExportingData}>
                    {isExportingData
                      ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" aria-hidden />
                      : <Download className="mr-2 h-3.5 w-3.5" aria-hidden />}
                    {t('exportData')}
                  </Button>
                  <Button variant="destructive" size="sm" onClick={() => setDeleteDialogOpen(true)}>
                    {t('deleteAccount')}
                  </Button>
                </div>
                <DeleteAccountDialog
                  open={deleteDialogOpen}
                  onOpenChange={setDeleteDialogOpen}
                  isPro={ent.isPro}
                  onConfirm={handleDeleteAccount}
                  onExport={handleExportData}
                  isExporting={isExportingData}
                />
              </div>
            )}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
