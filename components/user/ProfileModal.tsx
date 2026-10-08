'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useAuth } from '@/hooks/use-auth';
import { useEntitlements } from '@/hooks/use-entitlements';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ProfileAvatar, getUserInitials } from '@/components/user/ProfileAvatar';
import { ToggleSetting, SettingsCard, SettingsGroup } from '@/components/settings/SettingsControls';
import { AlertCircle, ArrowUpRight, Camera, Check, Loader2, Upload } from 'lucide-react';
import { createBrowserClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/logger';
import { uploadAvatarToStorage } from '@/lib/storage/avatar-upload';
import { cn } from '@/lib/utils';

interface ProfileModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

// Reuses PublicProfileCard's experience-level wording — same three words, same namespace.
function getExperienceLabels(t: TFunction): Record<'beginner' | 'intermediate' | 'advanced', string> {
  return {
    beginner: t('publicProfileExperienceBeginner'),
    intermediate: t('publicProfileExperienceIntermediate'),
    advanced: t('publicProfileExperienceAdvanced'),
  };
}

function getRiskProfileLabels(t: TFunction): Record<'conservative' | 'balanced' | 'aggressive', string> {
  return {
    conservative: t('profileModalRiskConservative'),
    balanced: t('profileModalRiskBalanced'),
    aggressive: t('profileModalRiskAggressive'),
  };
}

/**
 * How you appear to other members: photo, name, bio, market focus and whether
 * any of it is public. One panel, no sidebar: it was a 1000px modal with its
 * own navigation for four fields, two of which duplicated Settings.
 *
 * Experience level and risk profile are owned by Settings (Customize and Ask
 * Bull); they show here only as the badges they produce, read-only. This modal
 * never writes them, so it can't put a stale value back over a Settings change.
 */
export function ProfileModal({ open, onOpenChange }: ProfileModalProps) {
  const { t, i18n } = useTranslation('user');
  const { user, isLoading: authLoading } = useAuth();
  const ent = useEntitlements();
  const [error, setError] = useState<string | null>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);

  // Form state
  const [fullName, setFullName] = useState('');
  const [bio, setBio] = useState('');
  const [marketFocus, setMarketFocus] = useState<'US' | 'EU' | 'BOTH' | ''>('');
  const [avatarUrl, setAvatarUrl] = useState('');
  // Visibility lives next to the content it publishes (it was in Settings > Privacy).
  const [profilePublic, setProfilePublic] = useState(false);
  const [holdingsPublic, setHoldingsPublic] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const isInitializedRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistProfileRef = useRef<(() => Promise<boolean>) | undefined>(undefined);
  // Tracks the last-persisted values of the free-text fields so blur only
  // saves when something actually changed. Discrete controls autosave on
  // change, text fields on blur, so a pause mid-sentence never saves.
  const savedTextRef = useRef({ fullName: '', bio: '' });

  // Fresh status per opening. Not in the load effect below: that re-runs after
  // every save (auth:refresh hands it a new user) and wiped "All changes saved".
  useEffect(() => {
    if (open) setSaveStatus('idle');
  }, [open]);

  // Load user data
  useEffect(() => {
    isInitializedRef.current = false;
    if (user && open) {
      const settings = (user.settings ?? {}) as Record<string, unknown>;
      setFullName(user.full_name || '');
      setBio(user.bio || '');
      setMarketFocus(user.market_focus || '');
      setAvatarUrl(user.avatar_url || '');
      // Off unless turned on: saving any setting used to write a public profile.
      setProfilePublic(settings.profile_public === true);
      setHoldingsPublic(settings.holdings_public === true);
      setError(null);
      savedTextRef.current = {
        fullName: user.full_name || '',
        bio: user.bio || '',
      };
      const t = setTimeout(() => {
        isInitializedRef.current = true;
      }, 400);
      return () => clearTimeout(t);
    }
  }, [user, open]);

  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user) return;

    setIsUploadingAvatar(true);
    setError(null);

    try {
      const uploadResult = await uploadAvatarToStorage(user.id, file);
      if (!uploadResult.success || !uploadResult.publicUrl) {
        throw new Error(uploadResult.error || 'upload failed');
      }
      // avatarUrl is an autosave dependency, so setting it saves it.
      setAvatarUrl(uploadResult.publicUrl);
    } catch (err) {
      logger.error('[ProfileModal] Avatar upload failed', err);
      setError(t('profileModalAvatarUploadFailed'));
    } finally {
      setIsUploadingAvatar(false);
      // Reset input so same file can be selected again
      event.target.value = '';
    }
  };

  /** True when the change reached the database. */
  const persistProfile = async (): Promise<boolean> => {
    if (!user) return false;
    setError(null);

    try {
      const supabase = createBrowserClient();
      // Merge into the freshest settings so the rest of the JSON (written by
      // the Settings modal and the chart popover) is never overwritten.
      const { data: latest } = await supabase
        .from('users')
        .select('settings')
        .eq('id', user.id)
        .single();
      const existingSettings =
        ((latest?.settings as Record<string, unknown>) ??
          (user.settings as Record<string, unknown>)) ?? {};

      const updateData = {
        full_name: fullName.trim() || null,
        bio: bio.trim() || null,
        market_focus: marketFocus || null,
        avatar_url: avatarUrl.trim() || null,
        settings: { ...existingSettings, profile_public: profilePublic, holdings_public: holdingsPublic },
      };

      const { error: updateError } = await supabase
        .from('users')
        .update(updateData as Record<string, unknown>)
        .eq('id', user.id);

      if (updateError) throw updateError;

      savedTextRef.current = { fullName, bio };
      window.dispatchEvent(new Event('auth:refresh'));
      return true;
    } catch (err: unknown) {
      logger.error('[ProfileModal] Profile update failed', err);
      setError(t('profileModalUpdateFailed'));
      return false;
    }
  };

  useEffect(() => {
    persistProfileRef.current = persistProfile;
  });

  const runSave = async () => {
    if (!persistProfileRef.current) return;
    setSaveStatus('saving');
    const ok = await persistProfileRef.current();
    setSaveStatus(ok ? 'saved' : 'error');
    if (ok) setTimeout(() => setSaveStatus((s) => (s === 'saved' ? 'idle' : s)), 2000);
  };

  // Autosave, debounced 500 ms after a discrete-control change.
  useEffect(() => {
    if (!isInitializedRef.current || !user) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(runSave, 500);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marketFocus, avatarUrl, profilePublic, holdingsPublic]);

  const handleTextFieldBlur = async () => {
    if (!isInitializedRef.current || !user) return;
    const unchanged =
      fullName === savedTextRef.current.fullName &&
      bio === savedTextRef.current.bio;
    if (unchanged) return;
    await runSave();
  };

  /** Closes this modal and opens Settings on a tab: two stacked dialogs would trap focus twice. */
  const openSettings = (tab: 'customize' | 'plan') => {
    onOpenChange(false);
    window.dispatchEvent(new CustomEvent('settings:open', { detail: { tab } }));
  };

  if (authLoading || !user) {
    return null;
  }

  const initials = getUserInitials({ full_name: fullName, username: user.username, email: user.email });
  const displayName = fullName || user.username || user.email.split('@')[0];
  const memberSince = user.created_at
    ? new Date(user.created_at).toLocaleDateString(i18n.language || 'en', { month: 'short', year: 'numeric' })
    : '';
  const experienceLevel = user.experience_level ?? null;
  const riskProfile = user.risk_profile ?? null;
  const marketBadge = marketFocus === 'US'
    ? t('profileModalMarketUs')
    : marketFocus === 'EU'
      ? t('profileModalMarketEu')
      : marketFocus === 'BOTH'
        ? t('profileModalMarketBothBadge')
        : null;

  const statusLine = (
    <p aria-live="polite" className="flex items-center gap-1.5 text-xs text-muted-foreground">
      {saveStatus === 'saving' ? (
        <><Loader2 className="h-3 w-3 animate-spin" aria-hidden />{t('profileModalSaving')}</>
      ) : saveStatus === 'saved' ? (
        <><Check className="h-3 w-3 text-foreground" aria-hidden />{t('profileModalAllChangesSaved')}</>
      ) : saveStatus === 'error' ? (
        <span className="flex items-center gap-1.5 text-destructive"><AlertCircle className="h-3 w-3" aria-hidden />{t('profileModalSaveFailed')}</span>
      ) : (
        t('profileModalChangesSaveAutomatically')
      )}
    </p>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[94vw] !max-w-xl sm:!max-w-xl max-h-[88vh] overflow-hidden flex flex-col gap-0 p-0">
        <DialogHeader className="border-b px-5 pt-5 pb-4 text-left sm:px-6 sm:pt-6">
          <DialogTitle>{t('profileModalTitle')}</DialogTitle>
          <DialogDescription>{t('profileModalDescription')}</DialogDescription>
          <div className="pt-1">{statusLine}</div>
          {error && (
            <p role="alert" className="mt-2 flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              {error}
            </p>
          )}
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="space-y-8 p-5 sm:p-6">
            {/* Photo */}
            <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:gap-5">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploadingAvatar}
                className="group relative shrink-0 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                aria-label={t('profileModalChangePicture')}
              >
                <ProfileAvatar
                  avatarUrl={avatarUrl}
                  displayName={displayName}
                  fallback={initials}
                  tier={user.account_tier ?? 1}
                  size="xl"
                  showTooltip={false}
                />
                <span
                  className={cn(
                    'absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100',
                    isUploadingAvatar && 'opacity-100'
                  )}
                >
                  {isUploadingAvatar
                    ? <Loader2 className="h-5 w-5 animate-spin text-white" aria-hidden />
                    : <Camera className="h-5 w-5 text-white" aria-hidden />}
                </span>
              </button>
              <div className="flex min-w-0 flex-col gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/jpg,image/png,image/webp"
                  onChange={handleAvatarUpload}
                  className="hidden"
                  disabled={isUploadingAvatar}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={isUploadingAvatar}
                  onClick={() => fileInputRef.current?.click()}
                  className="w-fit gap-2"
                >
                  {isUploadingAvatar ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Upload className="h-4 w-4" aria-hidden />}
                  {t('profileModalUploadPicture')}
                </Button>
                <p className="text-xs text-muted-foreground">{t('profileModalUploadHint')}</p>
              </div>
            </div>

            {/* About you */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="full-name">{t('profileModalDisplayNameLabel')}</Label>
                <Input
                  id="full-name"
                  autoComplete="name"
                  placeholder={t('profileModalDisplayNamePlaceholder')}
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  onBlur={handleTextFieldBlur}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="bio">{t('profileModalBioLabel')}</Label>
                <Textarea
                  id="bio"
                  placeholder={t('profileModalBioPlaceholder')}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  onBlur={handleTextFieldBlur}
                  rows={3}
                  maxLength={500}
                />
                <p className="text-xs text-muted-foreground">{t('profileModalBioCharCount', { count: bio.length })}</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="market-focus">{t('profileModalMarketFocusLabel')}</Label>
                <Select value={marketFocus} onValueChange={(value: 'US' | 'EU' | 'BOTH') => setMarketFocus(value)}>
                  <SelectTrigger id="market-focus" className="w-full">
                    <SelectValue placeholder={t('profileModalMarketFocusPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="US">{t('profileModalMarketUs')}</SelectItem>
                    <SelectItem value="EU">{t('profileModalMarketEu')}</SelectItem>
                    <SelectItem value="BOTH">{t('profileModalMarketBothSelect')}</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">{t('profileModalMarketFocusHint')}</p>
              </div>
            </div>

            {/* Visibility */}
            <SettingsGroup title={t('profileModalVisibilityHeading')}>
              <SettingsCard>
                <ToggleSetting
                  label={t('profileModalPublicLabel')}
                  description={t('profileModalPublicDescription')}
                  checked={profilePublic}
                  onCheckedChange={setProfilePublic}
                />
                <ToggleSetting
                  label={t('profileModalShowPortfolioLabel')}
                  description={t('profileModalShowPortfolioDescription')}
                  checked={profilePublic && holdingsPublic}
                  onCheckedChange={setHoldingsPublic}
                  disabled={!profilePublic}
                />
              </SettingsCard>
              {profilePublic && user.username && (
                <Link
                  href={`/users/${user.username}`}
                  onClick={() => onOpenChange(false)}
                  className="inline-flex min-h-10 items-center gap-1 text-sm font-medium text-foreground underline-offset-4 hover:underline"
                >
                  {t('profileModalViewPublic')}
                  <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                </Link>
              )}
            </SettingsGroup>

            {/* Badges, a live preview of the public profile */}
            {(experienceLevel || marketBadge || riskProfile) && (
              <SettingsGroup title={t('profileModalBadgesLabel')} hint={t('profileModalBadgesHint')}>
                <div className="flex flex-wrap items-center gap-2">
                  {experienceLevel && <Badge variant="secondary">{getExperienceLabels(t)[experienceLevel]}</Badge>}
                  {marketBadge && <Badge variant="secondary">{marketBadge}</Badge>}
                  {riskProfile && <Badge variant="secondary">{getRiskProfileLabels(t)[riskProfile]}</Badge>}
                  <Button variant="link" size="sm" onClick={() => openSettings('customize')} className="h-auto px-1 py-0 text-muted-foreground underline underline-offset-4 hover:text-foreground">
                    {t('profileModalBadgesSettingsLink')}
                  </Button>
                </div>
              </SettingsGroup>
            )}

            {/* Account facts */}
            <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-3 rounded-xl border bg-card/30 px-4 py-3">
              <div className="flex flex-wrap gap-x-8 gap-y-2">
                <div>
                  <p className="text-xs text-muted-foreground">{t('profileModalPlanLabel')}</p>
                  <p className="text-sm font-medium text-foreground">{ent.isPro ? t('profileModalPlanPro') : t('profileModalPlanFree')}</p>
                </div>
                {memberSince && (
                  <div>
                    <p className="text-xs text-muted-foreground">{t('profileModalMemberSince')}</p>
                    <p className="text-sm font-medium text-foreground">{memberSince}</p>
                  </div>
                )}
              </div>
              <Button variant="outline" size="sm" onClick={() => openSettings('plan')}>
                {t('profileModalManagePlan')}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
