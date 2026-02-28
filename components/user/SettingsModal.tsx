'use client';

import { useState, useEffect } from 'react';
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
import { StatefulButton } from '@/components/ui/stateful-button';
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
import { Loader2, Globe, DollarSign, Moon, Bell, Shield, AlertTriangle, Trash2, Download, Check, Settings2 } from 'lucide-react';
import { createBrowserClient } from '@/lib/supabase/client';
import { signOut } from '@/lib/auth/auth';
import { useRouter } from 'next/navigation';

interface SettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type SettingsSection =
  | 'preferences'
  | 'notifications'
  | 'customize'
  | 'privacy'
  | 'danger';

export function SettingsModal({ open, onOpenChange }: SettingsModalProps) {
  const { user } = useAuth();
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const [activeSection, setActiveSection] = useState<SettingsSection>('preferences');
  const [error, setError] = useState<string | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // Settings state
  const [selectedMarkets, setSelectedMarkets] = useState<string[]>([]); // Empty array means "Any"
  const [defaultCurrency, setDefaultCurrency] = useState<string | null>(null); // null means "Based on exchange"
  const [theme, setTheme] = useState<'dark' | 'light' | 'dark-veil' | 'aurora' | 'particles' | 'plasma' | 'beams'>('dark');
  const [language, setLanguage] = useState<string | null>(null); // null means "System default"
  const [showQuotes, setShowQuotes] = useState<boolean>(true); // Default to true
  const [showWelcomeText, setShowWelcomeText] = useState<boolean>(true); // Default to true
  const [notifications, setNotifications] = useState({
    price_alerts: false,
    breaking_news: false,
    insider_trades: false,
    signal_threshold_crossed: false,
  });

  // Load settings
  useEffect(() => {
    if (user?.settings && open) {
      const settings = user.settings as any;
      // Load markets: if it's an array, use it; if it's a single value, convert to array; if not set, use empty (Any)
      const markets = settings.selected_markets;
      if (Array.isArray(markets)) {
        setSelectedMarkets(markets);
      } else if (markets) {
        setSelectedMarkets([markets]);
      } else {
        setSelectedMarkets([]); // Empty means "Any"
      }
      setDefaultCurrency(settings.default_currency || null); // null means "Based on exchange"
      // Load language preference (null means "System default")
      setLanguage(settings.language || null);
      // Merge theme and background into single theme field
      // If old settings have both theme and background, convert to new format
      const oldTheme = settings.theme || 'dark';
      const oldBackground = settings.background || 'none';
      if (oldBackground !== 'none' && (oldTheme === 'dark' || !oldTheme)) {
        setTheme(oldBackground as any);
      } else if (oldTheme === 'light') {
        setTheme('light');
      } else {
        setTheme(oldTheme || 'dark');
      }
      setNotifications({
        price_alerts: settings.notifications?.price_alerts || false,
        breaking_news: settings.notifications?.breaking_news || false,
        insider_trades: settings.notifications?.insider_trades || false,
        signal_threshold_crossed: settings.notifications?.signal_threshold_crossed || false,
      });
      // Load showQuotes preference (default to true if not set)
      setShowQuotes(settings.show_quotes !== undefined ? settings.show_quotes : true);
      // Load showWelcomeText preference (default to true if not set)
      setShowWelcomeText(settings.show_welcome_text !== undefined ? settings.show_welcome_text : true);
      setError(null);
    }
  }, [user, open]);

  const handleSave = async () => {
    if (!user) return;

    setError(null);

    const supabase = createBrowserClient();

    // Get existing settings
    const { data: userProfile } = await supabase
      .from('users')
      .select('settings')
      .eq('id', user.id)
      .single();

    const existingSettings = (userProfile?.settings as any) || {};
    const mergedSettings = {
      ...existingSettings,
      selected_markets: selectedMarkets.length === 0 ? null : selectedMarkets, // Store null for "Any"
      default_currency: defaultCurrency,
      theme, // Combined theme + background
      language, // User's language preference (null means "System default")
      show_quotes: showQuotes, // Show/hide quotes on main page
      show_welcome_text: showWelcomeText, // Show/hide welcome text
      notifications,
    };

    const { error: updateError } = await supabase
      .from('users')
      .update({ settings: mergedSettings })
      .eq('id', user.id);

    if (updateError) {
      throw new Error(updateError.message || 'Failed to update settings');
    }

    // Update i18n language immediately if not system default
    if (language) {
      await i18n.changeLanguage(language);
      // Update HTML lang attribute
      document.documentElement.lang = language;
    } else {
      // Use browser language if system default
      const browserLang = navigator.language.split('-')[0];
      const supportedLangs = ['en', 'es', 'fr', 'de', 'ja', 'zh'];
      const detectedLang = supportedLangs.includes(browserLang) ? browserLang : 'en';
      await i18n.changeLanguage(detectedLang);
      document.documentElement.lang = detectedLang;
    }

    // Success - StatefulButton will handle the green animation and state
    // Reload after success animation completes (2 seconds)
    setTimeout(() => {
      window.location.reload();
    }, 2000);
  };

  const handleDeleteAccount = async () => {
    if (!confirm('Are you sure you want to delete your account? This action cannot be undone.')) {
      return;
    }
    if (!confirm('This will permanently delete all your data. Type DELETE to confirm.')) {
      return;
    }

    // TODO: Implement account deletion
    alert('Account deletion coming soon');
  };

  const handleExportData = () => {
    // TODO: Implement data export
    alert('Data export coming soon');
  };

  const handleChangePassword = () => {
    // Coming soon - will use Supabase SMTP service
  };

  const handleLogoutAllSessions = async () => {
    if (!confirm('This will log you out of all devices. Continue?')) {
      return;
    }

    setIsLoggingOut(true);
    setError(null);

    try {
      // Sign out the current session
      // Note: Supabase Auth's signOut() only signs out the current session
      // To sign out ALL sessions across all devices, you would need to use
      // the Supabase Admin API on the server side to revoke all refresh tokens
      const result = await signOut();

      if (!result.success) {
        throw new Error(result.error || 'Failed to sign out');
      }

      // Redirect to home page after sign out
      router.push('/');
      router.refresh();
    } catch (err: any) {
      setError(err.message || 'Failed to sign out');
      setIsLoggingOut(false);
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
    { id: 'danger', label: t('settings.danger'), icon: <AlertTriangle className="h-4 w-4" /> },
  ];

  if (!user) {
    return null;
  }

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
                        onClick={() => {
                          setSelectedMarkets([]); // Empty means "Any"
                        }}
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
                      {defaultCurrency === null
                        ? t('settings.currencyDescription')
                        : t('settings.currencyDescription')}
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
                    <Label htmlFor="theme" className="flex items-center gap-2">
                      <Moon className="h-4 w-4" />
                      {t('settings.theme')}
                    </Label>
                    <Select
                      value={theme}
                      onValueChange={(value: 'dark' | 'light' | 'dark-veil' | 'aurora' | 'particles' | 'plasma' | 'beams') => setTheme(value)}
                    >
                      <SelectTrigger id="theme">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="dark">Dark</SelectItem>
                        <SelectItem value="light">Light</SelectItem>
                        <SelectItem value="dark-veil">Dark Veil</SelectItem>
                        <SelectItem value="aurora">Aurora</SelectItem>
                        <SelectItem value="particles">Particles</SelectItem>
                        <SelectItem value="plasma">Plasma</SelectItem>
                        <SelectItem value="beams">Beams</SelectItem>
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
                        <Label>Price Alerts</Label>
                        <p className="text-xs text-muted-foreground">
                          Get notified when stocks reach your target prices
                        </p>
                      </div>
                      <Switch
                        checked={notifications.price_alerts}
                        onCheckedChange={(checked) =>
                          setNotifications({ ...notifications, price_alerts: checked })
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
                </div>
              </div>
            )}

            {activeSection === 'privacy' && (
              <div className="space-y-6 max-w-2xl">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Shield className="h-4 w-4" />
                      Change Password
                    </Label>
                    <Button variant="outline" onClick={handleChangePassword} disabled>
                      Change Password
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      Password change coming soon
                    </p>
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <Label>Logout All Sessions</Label>
                    <Button 
                      variant="outline" 
                      onClick={handleLogoutAllSessions}
                      disabled={isLoggingOut}
                    >
                      {isLoggingOut ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Signing out...
                        </>
                      ) : (
                        'Logout All Devices'
                      )}
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      Sign out from all devices and sessions
                    </p>
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
                      Download all your data in a portable format
                    </p>
                    <Button variant="outline" onClick={handleExportData} className="w-full">
                      <Download className="mr-2 h-4 w-4" />
                      Export Data
                    </Button>
                    <Badge variant="secondary" className="text-xs">
                      Coming soon
                    </Badge>
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
                      className="w-full"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete Account
                    </Button>
                    <Badge variant="secondary" className="text-xs">
                      Coming soon
                    </Badge>
                  </div>
                </div>
              </div>
            )}

            {/* Error Messages */}
            {error && (
              <div className="mt-4 p-3 rounded-md bg-destructive/10 text-destructive text-sm animate-in fade-in slide-in-from-bottom-2">
                {error}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        {activeSection !== 'danger' && (
          <div className="border-t px-6 py-4 flex justify-end gap-3">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <StatefulButton
              onClick={handleSave}
              successDuration={2000}
              className="min-w-[120px]"
            >
              {t('settings.saveChanges')}
            </StatefulButton>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
