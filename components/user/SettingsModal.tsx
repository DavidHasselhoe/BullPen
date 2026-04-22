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
import { Loader2, Globe, DollarSign, Moon, Bell, Shield, AlertTriangle, Trash2, Download, Check, Settings2, Eye, EyeOff, Home, Hash, Search, Bot } from 'lucide-react';
import { ExperienceLevelToggle } from '@/components/ui/ExperienceLevelToggle';
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
  | 'privacy'
  | 'ai'
  | 'danger';

type ThemeValue = 'dark' | 'light' | 'gradient-purple' | 'gradient-blue' | 'gradient-midnight' | 'gradient-embers';

const VALID_THEMES: ThemeValue[] = ['dark', 'light', 'gradient-purple', 'gradient-blue', 'gradient-midnight', 'gradient-embers'];

/** Select sentinel — persisted value is `/stock/TICKER` */
const HOMEPAGE_STOCK = '__stock__';

function minimalStockPick(ticker: string): SearchResult {
  const t = ticker.toUpperCase();
  return { ticker: t, name: t, cik: '', has_data: false };
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
  const [selectedMarkets, setSelectedMarkets] = useState<string[]>([]);
  const [defaultCurrency, setDefaultCurrency] = useState<string | null>(null);
  const [theme, setTheme] = useState<ThemeValue>('dark');
  const [language, setLanguage] = useState<string | null>(null);
  const [defaultHomepage, setDefaultHomepage] = useState<string>('/');
  /** Selected company when default homepage is a stock detail page (search UI) */
  const [homepageStockPick, setHomepageStockPick] = useState<SearchResult | null>(null);
  const [showQuotes, setShowQuotes] = useState<boolean>(true);
  const [showWelcomeText, setShowWelcomeText] = useState<boolean>(true);
  const [roundNumbers, setRoundNumbers] = useState<boolean>(false);
  const [marketContextMode, setMarketContextMode] = useState<'all' | 'holdings'>('all');
  const [profilePublic, setProfilePublic] = useState<boolean>(true);
  const [holdingsPublic, setHoldingsPublic] = useState<boolean>(true);
  // AI settings state
  const [riskProfile, setRiskProfile] = useState<'conservative' | 'balanced' | 'aggressive' | null>(null);
  const [investmentHorizon, setInvestmentHorizon] = useState<'short' | 'medium' | 'long' | null>(null);
  const [responseStyle, setResponseStyle] = useState<'concise' | 'balanced' | 'detailed' | null>(null);
  const [notifications, setNotifications] = useState({
    holdings_earnings: true,
    upcoming_earnings: true,
    price_alerts: true,
    breaking_news: false,
    insider_trades: false,
    signal_threshold_crossed: false,
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
      const settings = user.settings as any;
      const markets = settings.selected_markets;
      if (Array.isArray(markets)) {
        setSelectedMarkets(markets);
      } else if (markets) {
        setSelectedMarkets([markets]);
      } else {
        setSelectedMarkets([]);
      }
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
        holdings_earnings: settings.notifications?.holdings_earnings !== false,
        upcoming_earnings: settings.notifications?.upcoming_earnings !== false,
        price_alerts: settings.notifications?.price_alerts !== false,
        breaking_news: settings.notifications?.breaking_news || false,
        insider_trades: settings.notifications?.insider_trades || false,
        signal_threshold_crossed: settings.notifications?.signal_threshold_crossed || false,
      });
      const dh = (settings.default_homepage as string) || '/';
      setDefaultHomepage(dh);
      const stockMatch = dh.match(/^\/stock\/([A-Za-z0-9.-]+)$/i);
      setHomepageStockPick(stockMatch ? minimalStockPick(stockMatch[1]) : null);
      setShowQuotes(settings.show_quotes !== undefined ? settings.show_quotes : true);
      setShowWelcomeText(settings.show_welcome_text !== undefined ? settings.show_welcome_text : true);
      setRoundNumbers(settings.round_numbers === true);
      setMarketContextMode(settings.market_context_mode === 'holdings' ? 'holdings' : 'all');
      setProfilePublic(settings.profile_public !== false);
      setHoldingsPublic(settings.holdings_public !== false);
      // AI settings
      setRiskProfile((user as any).risk_profile ?? null);
      setInvestmentHorizon((settings.investment_horizon as 'short' | 'medium' | 'long') ?? null);
      setResponseStyle((settings.response_style as 'concise' | 'balanced' | 'detailed') ?? null);
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
      const existingSettings = ((user as any).settings as any) || {};
      const mergedSettings = {
        ...existingSettings,
        selected_markets: selectedMarkets.length === 0 ? null : selectedMarkets,
        default_currency: defaultCurrency,
        theme,
        language,
        default_homepage: defaultHomepage,
        show_quotes: showQuotes,
        show_welcome_text: showWelcomeText,
        round_numbers: roundNumbers,
        market_context_mode: marketContextMode,
        notifications,
        profile_public: profilePublic,
        holdings_public: holdingsPublic,
        investment_horizon: investmentHorizon,
        response_style: responseStyle,
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
    } catch (err: any) {
      setError(err.message || 'Failed to update settings');
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
  }, [selectedMarkets, defaultCurrency, theme, language, defaultHomepage, showQuotes, showWelcomeText, roundNumbers, marketContextMode, notifications, profilePublic, holdingsPublic, riskProfile, investmentHorizon, responseStyle]);

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
    } catch (err: any) {
      setError(err.message || 'Failed to delete account');
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
    } catch (err: any) {
      setError(err.message || 'Failed to export data');
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
    } catch (err: any) {
      setError(err.message || 'Failed to update password.');
    } finally {
      setIsChangingPassword(false);
    }
  };

  const sections: Array<{
    id: SettingsSection;
    label: string;
    icon: React.ReactNode;
  }> = [
    { id: 'preferences', label: t('settings.preferences'), icon: <Globe className="h-4 w-4" /> },
    { id: 'notifications', label: t('settings.notifications'), icon: <Bell className="h-4 w-4" /> },
    { id: 'customize', label: t('settings.customize'), icon: <Settings2 className="h-4 w-4" /> },
    { id: 'privacy', label: t('settings.privacy'), icon: <Shield className="h-4 w-4" /> },
    { id: 'ai', label: 'AI', icon: <Bot className="h-4 w-4" /> },
    { id: 'danger', label: t('settings.danger'), icon: <AlertTriangle className="h-4 w-4" /> },
  ];

  if (!user) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[90vw] !max-w-[1000px] sm:!max-w-[1000px] h-[85vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle>{t('settings.title')}</DialogTitle>
              <DialogDescription>
                {t('settings.description')}
              </DialogDescription>
            </div>
            {/* Autosave status indicator */}
            <div className="mr-8 flex items-center gap-1.5 text-xs text-muted-foreground min-w-[60px] justify-end">
              {saveStatus === 'saving' && (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span>Saving…</span>
                </>
              )}
              {saveStatus === 'saved' && (
                <>
                  <Check className="h-3 w-3 text-emerald-500" />
                  <span className="text-emerald-500">Saved</span>
                </>
              )}
            </div>
          </div>
        </DialogHeader>

        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar Navigation */}
          <div className="w-56 border-r bg-muted/30 p-4 space-y-2 flex-shrink-0">
            {sections.map((section) => (
              <button
                key={section.id}
                onClick={() => setActiveSection(section.id)}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all ${
                  activeSection === section.id
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'hover:bg-accent text-muted-foreground hover:text-foreground'
                }`}
              >
                {section.icon}
                {section.label}
              </button>
            ))}
          </div>

          {/* Main Content */}
          <div className="flex-1 overflow-y-auto p-6 min-h-0 relative">
            {activeSection === 'preferences' && (
              <div className="space-y-6 max-w-2xl">
                <div className="space-y-4">
                  <div className="space-y-3">
                    <Label className="flex items-center gap-2">
                      <Globe className="h-4 w-4" />
                      {t('settings.markets')}
                    </Label>
                    <div className="space-y-2">
                      <button
                        type="button"
                        onClick={() => setSelectedMarkets([])}
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-md border bg-background hover:bg-accent text-left transition-colors"
                      >
                        <div className="flex h-4 w-4 items-center justify-center rounded border border-foreground/20">
                          {selectedMarkets.length === 0 && (
                            <Check className="h-3 w-3 text-foreground" />
                          )}
                        </div>
                        <span className="text-sm font-medium">{t('settings.marketsAny')}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (selectedMarkets.length === 0) {
                            setSelectedMarkets(['US']);
                          } else if (selectedMarkets.includes('US')) {
                            const newMarkets = selectedMarkets.filter((m) => m !== 'US');
                            setSelectedMarkets(newMarkets.length === 0 ? [] : newMarkets);
                          } else {
                            setSelectedMarkets([...selectedMarkets, 'US']);
                          }
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-md border bg-background hover:bg-accent text-left transition-colors"
                      >
                        <div className="flex h-4 w-4 items-center justify-center rounded border border-foreground/20">
                          {selectedMarkets.length > 0 && selectedMarkets.includes('US') && (
                            <Check className="h-3 w-3 text-foreground" />
                          )}
                        </div>
                        <span className="text-sm font-medium">{t('settings.marketsUS')}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (selectedMarkets.length === 0) {
                            setSelectedMarkets(['EU']);
                          } else if (selectedMarkets.includes('EU')) {
                            const newMarkets = selectedMarkets.filter((m) => m !== 'EU');
                            setSelectedMarkets(newMarkets.length === 0 ? [] : newMarkets);
                          } else {
                            setSelectedMarkets([...selectedMarkets, 'EU']);
                          }
                        }}
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-md border bg-background hover:bg-accent text-left transition-colors"
                      >
                        <div className="flex h-4 w-4 items-center justify-center rounded border border-foreground/20">
                          {selectedMarkets.length > 0 && selectedMarkets.includes('EU') && (
                            <Check className="h-3 w-3 text-foreground" />
                          )}
                        </div>
                        <span className="text-sm font-medium">{t('settings.marketsEU')}</span>
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t('settings.marketsDescription')}
                    </p>
                  </div>

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
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      {t('settings.languageDescription')}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="default-homepage" className="flex items-center gap-2">
                      <Home className="h-4 w-4" />
                      {t('settings.defaultHomepage')}
                    </Label>
                    <Select
                      value={/^\/stock\//i.test(defaultHomepage) ? HOMEPAGE_STOCK : defaultHomepage}
                      onValueChange={(v) => {
                        if (v === HOMEPAGE_STOCK) {
                          const m = defaultHomepage.match(/^\/stock\/([A-Za-z0-9.-]+)$/i);
                          const sym = ((m?.[1] ?? homepageStockPick?.ticker) || 'SPY').toUpperCase();
                          setHomepageStockPick(minimalStockPick(sym));
                          setDefaultHomepage(`/stock/${sym}`);
                        } else {
                          setDefaultHomepage(v);
                        }
                      }}
                    >
                      <SelectTrigger id="default-homepage">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="/">{t('settings.homepageDiscover')}</SelectItem>
                        <SelectItem value="/holdings">{t('settings.homepageHoldings')}</SelectItem>
                        <SelectItem value="/tools">{t('settings.homepageTools')}</SelectItem>
                        <SelectItem value="/tools/ai-chat">{t('settings.homepageAIChat')}</SelectItem>
                        <SelectItem value="/tools/screener">{t('settings.homepageScreener')}</SelectItem>
                        <SelectItem value="/tools/compare">{t('settings.homepageCompare')}</SelectItem>
                        <SelectItem value="/tools/filings">{t('settings.homepageFilings')}</SelectItem>
                        <SelectItem value="/tools/buy-here">{t('settings.homepageBuyHere')}</SelectItem>
                        <SelectItem value={HOMEPAGE_STOCK}>{t('settings.homepageStock')}</SelectItem>
                      </SelectContent>
                    </Select>
                    {/^\/stock\//i.test(defaultHomepage) && (
                      <div className="space-y-1.5 pt-1">
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
                              const fallback = minimalStockPick('SPY');
                              setHomepageStockPick(fallback);
                              setDefaultHomepage('/stock/SPY');
                            }
                          }}
                          placeholder={t('settings.homepageStockSearchPlaceholder')}
                        />
                        <p className="text-xs text-muted-foreground">{t('settings.homepageStockTickerHint')}</p>
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
                </div>
              </div>
            )}

            {activeSection === 'notifications' && (
              <div className="space-y-6 max-w-2xl">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Earnings Alerts</Label>
                        <p className="text-xs text-muted-foreground">
                          Email when companies in your holdings file new 10-K or 10-Q reports
                        </p>
                      </div>
                      <Switch
                        checked={notifications.holdings_earnings}
                        onCheckedChange={(checked) =>
                          setNotifications({ ...notifications, holdings_earnings: checked })
                        }
                      />
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Upcoming Earnings Reminders</Label>
                        <p className="text-xs text-muted-foreground">
                          Get notified 7 days before a tracked stock reports earnings
                        </p>
                      </div>
                      <Switch
                        checked={notifications.upcoming_earnings}
                        onCheckedChange={(checked) =>
                          setNotifications({ ...notifications, upcoming_earnings: checked })
                        }
                      />
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Big Price Moves</Label>
                        <p className="text-xs text-muted-foreground">
                          Daily alert when a tracked stock moves 5% or more
                        </p>
                      </div>
                      <Switch
                        checked={notifications.price_alerts}
                        onCheckedChange={(checked) =>
                          setNotifications({ ...notifications, price_alerts: checked })
                        }
                      />
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Breaking News</Label>
                        <p className="text-xs text-muted-foreground">
                          Receive alerts for important market news
                        </p>
                      </div>
                      <Switch
                        checked={notifications.breaking_news}
                        onCheckedChange={(checked) =>
                          setNotifications({ ...notifications, breaking_news: checked })
                        }
                        disabled
                      />
                    </div>
                    <Badge variant="secondary" className="text-xs">
                      Coming soon
                    </Badge>
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Insider Trades</Label>
                        <p className="text-xs text-muted-foreground">
                          Notifications for significant insider trading activity
                        </p>
                      </div>
                      <Switch
                        checked={notifications.insider_trades}
                        onCheckedChange={(checked) =>
                          setNotifications({ ...notifications, insider_trades: checked })
                        }
                        disabled
                      />
                    </div>
                    <Badge variant="secondary" className="text-xs">
                      Coming soon
                    </Badge>
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Signal Threshold Crossed</Label>
                        <p className="text-xs text-muted-foreground">
                          Alerts when signals cross your configured thresholds
                        </p>
                      </div>
                      <Switch
                        checked={notifications.signal_threshold_crossed}
                        onCheckedChange={(checked) =>
                          setNotifications({
                            ...notifications,
                            signal_threshold_crossed: checked,
                          })
                        }
                        disabled
                      />
                    </div>
                    <Badge variant="secondary" className="text-xs">
                      Coming soon
                    </Badge>
                  </div>
                </div>
              </div>
            )}

            {activeSection === 'customize' && (
              <div className="space-y-6 max-w-2xl">
                <div className="space-y-4">

                  <div className="space-y-2">
                    <ExperienceLevelToggle variant="full" />
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Show Investing Quotes</Label>
                        <p className="text-xs text-muted-foreground">
                          Display inspirational investing quotes on the main page
                        </p>
                      </div>
                      <Switch
                        checked={showQuotes}
                        onCheckedChange={setShowQuotes}
                      />
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label>Show Welcome Text</Label>
                        <p className="text-xs text-muted-foreground">
                          Display personalized welcome message at the top of the page
                        </p>
                      </div>
                      <Switch
                        checked={showWelcomeText}
                        onCheckedChange={setShowWelcomeText}
                      />
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label className="flex items-center gap-2">
                          <Hash className="h-4 w-4" />
                          {t('settings.roundNumbers')}
                        </Label>
                        <p className="text-xs text-muted-foreground">
                          {t('settings.roundNumbersDescription')}
                        </p>
                      </div>
                      <Switch
                        checked={roundNumbers}
                        onCheckedChange={setRoundNumbers}
                      />
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Globe className="h-4 w-4" />
                      {t('settings.marketContext')}
                    </Label>
                    <Select
                      value={marketContextMode}
                      onValueChange={(v) => setMarketContextMode(v as 'all' | 'holdings')}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">{t('settings.marketContextAll')}</SelectItem>
                        <SelectItem value="holdings">{t('settings.marketContextHoldings')}</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      {t('settings.marketContextDescription')}
                    </p>
                  </div>
                </div>
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
                    <div className="rounded-lg border bg-muted/30 p-4 space-y-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-sm font-medium">Public profile</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Allow other BullPen members to find and view your profile page.
                          </p>
                        </div>
                        <Switch
                          checked={profilePublic}
                          onCheckedChange={setProfilePublic}
                        />
                      </div>
                      <Separator />
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-sm font-medium">Show portfolio</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Show your portfolio stocks (ticker and company name only — no quantities or prices) on your public profile.
                          </p>
                        </div>
                        <Switch
                          checked={holdingsPublic}
                          onCheckedChange={setHoldingsPublic}
                          disabled={!profilePublic}
                        />
                      </div>
                    </div>
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
                <div>
                  <h3 className="text-sm font-semibold">AI Preferences</h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    Customize how BullPen AI communicates and analyzes information for you.
                  </p>
                </div>

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
      </DialogContent>
    </Dialog>
  );
}
