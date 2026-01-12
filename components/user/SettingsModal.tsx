'use client';

import { useState, useEffect } from 'react';
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
import { Loader2, Globe, DollarSign, Moon, Bell, Shield, AlertTriangle, Trash2, Download, CheckCircle2, Image } from 'lucide-react';
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
  | 'privacy'
  | 'danger';

export function SettingsModal({ open, onOpenChange }: SettingsModalProps) {
  const { user } = useAuth();
  const router = useRouter();
  const [activeSection, setActiveSection] = useState<SettingsSection>('preferences');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Settings state
  const [defaultMarket, setDefaultMarket] = useState<'US' | 'EU'>('US');
  const [defaultCurrency, setDefaultCurrency] = useState('USD');
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [background, setBackground] = useState<'none' | 'dark-veil' | 'aurora' | 'particles' | 'plasma' | 'beams'>('none');
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
      setDefaultMarket(settings.default_market || 'US');
      setDefaultCurrency(settings.default_currency || 'USD');
      setTheme(settings.theme || 'dark');
      setBackground(settings.background || 'none');
      setNotifications({
        price_alerts: settings.notifications?.price_alerts || false,
        breaking_news: settings.notifications?.breaking_news || false,
        insider_trades: settings.notifications?.insider_trades || false,
        signal_threshold_crossed: settings.notifications?.signal_threshold_crossed || false,
      });
      setError(null);
      setSuccess(false);
    }
  }, [user, open]);

  const handleSave = async () => {
    if (!user) return;

    setIsSaving(true);
    setError(null);
    setSuccess(false);

    try {
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
        default_market: defaultMarket,
        default_currency: defaultCurrency,
        theme,
        background,
        notifications,
      };

      const { error: updateError } = await supabase
        .from('users')
        .update({ settings: mergedSettings })
        .eq('id', user.id);

      if (updateError) {
        throw updateError;
      }

      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        window.location.reload();
      }, 1500);
    } catch (err: any) {
      setError(err.message || 'Failed to update settings');
    } finally {
      setIsSaving(false);
    }
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
    // TODO: Implement password change
    alert('Password change coming soon');
  };

  const handleLogoutAllSessions = async () => {
    if (!confirm('This will log you out of all devices. Continue?')) {
      return;
    }
    // TODO: Implement logout all sessions
    alert('Logout all sessions coming soon');
  };

  const sections: Array<{
    id: SettingsSection;
    label: string;
    icon: React.ReactNode;
  }> = [
    { id: 'preferences', label: 'Preferences', icon: <Globe className="h-4 w-4" /> },
    { id: 'notifications', label: 'Notifications', icon: <Bell className="h-4 w-4" /> },
    { id: 'privacy', label: 'Privacy & Security', icon: <Shield className="h-4 w-4" /> },
    { id: 'danger', label: 'Danger Zone', icon: <AlertTriangle className="h-4 w-4" /> },
  ];

  if (!user) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[98vw] !max-w-[1800px] sm:!max-w-[1800px] h-[85vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Manage your application preferences and account settings
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar Navigation */}
          <div className="w-44 border-r bg-muted/30 p-4 space-y-2 flex-shrink-0">
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
              <div className="space-y-6 max-w-5xl">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="default-market" className="flex items-center gap-2">
                      <Globe className="h-4 w-4" />
                      Default Market
                    </Label>
                    <Select
                      value={defaultMarket}
                      onValueChange={(value: 'US' | 'EU') => setDefaultMarket(value)}
                    >
                      <SelectTrigger id="default-market">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="US">US Markets</SelectItem>
                        <SelectItem value="EU">EU Markets</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Data will be displayed based on your preferred market
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="default-currency" className="flex items-center gap-2">
                      <DollarSign className="h-4 w-4" />
                      Default Currency
                    </Label>
                    <Select
                      value={defaultCurrency}
                      onValueChange={setDefaultCurrency}
                    >
                      <SelectTrigger id="default-currency">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="USD">USD ($)</SelectItem>
                        <SelectItem value="EUR">EUR (€)</SelectItem>
                        <SelectItem value="GBP">GBP (£)</SelectItem>
                        <SelectItem value="JPY">JPY (¥)</SelectItem>
                        <SelectItem value="CHF">CHF (Fr)</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Currency conversion coming soon
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="theme" className="flex items-center gap-2">
                      <Moon className="h-4 w-4" />
                      Theme
                    </Label>
                    <Select
                      value={theme}
                      onValueChange={(value: 'light' | 'dark') => setTheme(value)}
                    >
                      <SelectTrigger id="theme">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="light">Light</SelectItem>
                        <SelectItem value="dark">Dark</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Theme preference coming soon
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="background" className="flex items-center gap-2">
                      <Image className="h-4 w-4" />
                      Background
                    </Label>
                    <Select
                      value={background}
                      onValueChange={(value: 'none' | 'dark-veil' | 'aurora' | 'particles' | 'plasma' | 'beams') => setBackground(value)}
                    >
                      <SelectTrigger id="background">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None (Default)</SelectItem>
                        <SelectItem value="dark-veil">Dark Veil</SelectItem>
                        <SelectItem value="aurora">Aurora</SelectItem>
                        <SelectItem value="particles">Particles</SelectItem>
                        <SelectItem value="plasma">Plasma</SelectItem>
                        <SelectItem value="beams">Beams</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      Choose an animated background for your experience
                    </p>
                  </div>
                </div>
              </div>
            )}

            {activeSection === 'notifications' && (
              <div className="space-y-6 max-w-5xl">
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

            {activeSection === 'privacy' && (
              <div className="space-y-6 max-w-5xl">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Shield className="h-4 w-4" />
                      Change Password
                    </Label>
                    <Button variant="outline" onClick={handleChangePassword}>
                      Change Password
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      Password change coming soon
                    </p>
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <Label>Logout All Sessions</Label>
                    <Button variant="outline" onClick={handleLogoutAllSessions}>
                      Logout All Devices
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      Logout all sessions coming soon
                    </p>
                  </div>
                </div>
              </div>
            )}

            {activeSection === 'danger' && (
              <div className="space-y-6 max-w-5xl">
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

            {/* Error/Success Messages */}
            {error && (
              <div className="mt-4 p-3 rounded-md bg-destructive/10 text-destructive text-sm animate-in fade-in slide-in-from-bottom-2">
                {error}
              </div>
            )}
            {success && (
              <div className="absolute bottom-20 right-6 flex items-center gap-2 px-4 py-3 rounded-lg bg-green-500/10 border border-green-500/20 text-green-600 dark:text-green-400 text-sm font-medium shadow-lg z-50 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="relative">
                  <div className="absolute inset-0 rounded-full bg-green-500/20 animate-ping opacity-75" />
                  <CheckCircle2 className="relative h-5 w-5 animate-scale-in" />
                </div>
                <span className="animate-fade-in-up" style={{ animationDelay: '150ms' }}>
                  Settings updated successfully!
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        {activeSection !== 'danger' && (
          <div className="border-t px-6 py-4 flex justify-end gap-3">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Changes'
              )}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
