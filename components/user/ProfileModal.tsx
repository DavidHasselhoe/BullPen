'use client';

import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useAuth } from '@/hooks/use-auth';
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
import { ProfileAvatar } from '@/components/user/ProfileAvatar';
import { Loader2, Upload, Camera, User, Briefcase, Target, TrendingUp, Crown, Calendar, Check, type LucideIcon } from 'lucide-react';
import { createBrowserClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/logger';
import { uploadAvatarToStorage } from '@/lib/storage/avatar-upload';
import { cn } from '@/lib/utils';

interface ProfileModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ProfileSection = 'basic' | 'preferences';

interface SectionMeta {
  id: ProfileSection;
  label: string;
  description: string;
  icon: LucideIcon;
}

function getSections(t: TFunction): SectionMeta[] {
  return [
    { id: 'basic', label: t('profileModalSectionBasicLabel'), icon: User, description: t('profileModalSectionBasicDescription') },
    { id: 'preferences', label: t('profileModalSectionPreferencesLabel'), icon: Target, description: t('profileModalSectionPreferencesDescription') },
  ];
}

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

export function ProfileModal({ open, onOpenChange }: ProfileModalProps) {
  const { t } = useTranslation('user');
  const { user, isLoading: authLoading } = useAuth();
  const SECTIONS = getSections(t);
  const [activeSection, setActiveSection] = useState<ProfileSection>('basic');
  const [error, setError] = useState<string | null>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);

  // Form state
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [experienceLevel, setExperienceLevel] = useState<'beginner' | 'intermediate' | 'advanced' | ''>('');
  const [marketFocus, setMarketFocus] = useState<'US' | 'EU' | 'BOTH' | ''>('');
  const [riskProfile, setRiskProfile] = useState<'conservative' | 'balanced' | 'aggressive' | ''>('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const isInitializedRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistProfileRef = useRef<() => Promise<void>>();

  // Load user data
  useEffect(() => {
    isInitializedRef.current = false;
    if (user && open) {
      setFullName(user.full_name || '');
      setUsername(user.username || '');
      setBio(user.bio || '');
      setExperienceLevel(user.experience_level || '');
      setMarketFocus(user.market_focus || '');
      setRiskProfile(user.risk_profile || '');
      setAvatarUrl(user.avatar_url || '');
      setError(null);
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
        throw new Error(uploadResult.error || t('profileModalUploadFailed'));
      }

      // Update avatar URL in state
      setAvatarUrl(uploadResult.publicUrl);

      // Optionally auto-save
      // For now, user needs to click "Save Changes" to persist
    } catch (err) {
      setError(err instanceof Error ? err.message : t('profileModalAvatarUploadFailed'));
    } finally {
      setIsUploadingAvatar(false);
      // Reset input so same file can be selected again
      event.target.value = '';
    }
  };

  const persistProfile = async () => {
    if (!user) return;

    setError(null);

    try {
      const supabase = createBrowserClient();

      const updateData = {
        full_name: fullName.trim() || null,
        username: username.trim() || null,
        bio: bio.trim() || null,
        experience_level: experienceLevel || null,
        market_focus: marketFocus || null,
        risk_profile: riskProfile || null,
        avatar_url: avatarUrl.trim() || null,
      };

      const { error: updateError } = await supabase
        .from('users')
        .update(updateData as Record<string, unknown>)
        .eq('id', user.id);

      if (updateError) {
        logger.error('[ProfileModal] Database update error', updateError);
        throw new Error(updateError.message || t('profileModalUpdateDbFailed'));
      }

      window.dispatchEvent(new Event('auth:refresh'));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('profileModalUpdateFailed');
      setError(msg);
    }
  };

  useEffect(() => {
    persistProfileRef.current = persistProfile;
  });

  // Autosave — debounced 500 ms after any profile field change (same pattern as Settings)
  useEffect(() => {
    if (!isInitializedRef.current || !user) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      if (!persistProfileRef.current) return;
      setSaveStatus('saving');
      await persistProfileRef.current();
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 1500);
    }, 500);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullName, username, bio, experienceLevel, marketFocus, riskProfile, avatarUrl]);

  const getInitials = () => {
    if (fullName) {
      return fullName
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
    }
    if (username) {
      return username.slice(0, 2).toUpperCase();
    }
    return user?.email.slice(0, 2).toUpperCase() || t('profileAvatarDefaultName').slice(0, 1).toUpperCase();
  };

  const displayName = fullName || username || user?.email.split('@')[0] || t('profileAvatarDefaultName');
  const memberSince = user?.created_at
    ? new Date(user.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    : '';

  const activeMeta = SECTIONS.find((s) => s.id === activeSection) ?? SECTIONS[0];
  const ActiveIcon = activeMeta.icon;

  if (authLoading || !user) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[90vw] !max-w-[1000px] sm:!max-w-[1000px] h-[85vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <DialogTitle>{t('profileModalTitle')}</DialogTitle>
          <DialogDescription>
            {t('profileModalDescription')}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar Navigation */}
          <aside className="flex w-16 flex-shrink-0 flex-col border-r bg-muted/20 sm:w-56">
            <nav className="flex-1 space-y-1 overflow-y-auto p-2 sm:p-3">
              {SECTIONS.map((section) => {
                const Icon = section.icon;
                const active = activeSection === section.id;
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
                        : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                    )}
                  >
                    <span
                      className={cn(
                        'absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-r-full bg-primary transition-opacity',
                        active ? 'opacity-100' : 'opacity-0'
                      )}
                    />
                    <Icon className={cn('h-4 w-4 shrink-0', active && 'text-primary')} />
                    <span className="hidden sm:inline">{section.label}</span>
                  </button>
                );
              })}
            </nav>

            {/* Identity + autosave status */}
            <div className="hidden border-t p-3 sm:block">
              <div className="flex min-w-0 items-center gap-2.5">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">
                  {getInitials()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-foreground">{user.email}</p>
                  <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    {saveStatus === 'saving' ? (
                      <><Loader2 className="h-2.5 w-2.5 animate-spin" />{t('profileModalSaving')}</>
                    ) : saveStatus === 'saved' ? (
                      <><Check className="h-2.5 w-2.5 text-emerald-500" /><span className="text-emerald-500">{t('profileModalAllChangesSaved')}</span></>
                    ) : (
                      t('profileModalChangesSaveAutomatically')
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
                  <ActiveIcon className="h-4 w-4 text-primary" />
                  <h2 className="text-base font-semibold tracking-tight text-foreground">{activeMeta.label}</h2>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{activeMeta.description}</p>
              </div>

              {activeSection === 'basic' && (
                <div className="space-y-6 max-w-2xl">
                  {/* Avatar Section */}
                  <div className="flex items-center gap-6">
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
                        fallback={getInitials()}
                        tier={user?.account_tier ?? 1}
                        size="xl"
                        showTooltip={false}
                      />
                      <span
                        className={cn(
                          'absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100',
                          isUploadingAvatar && 'opacity-100'
                        )}
                      >
                        {isUploadingAvatar ? (
                          <Loader2 className="h-5 w-5 animate-spin text-white" />
                        ) : (
                          <Camera className="h-5 w-5 text-white" />
                        )}
                      </span>
                    </button>
                    <div className="flex flex-col gap-3">
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
                        {isUploadingAvatar ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Upload className="h-4 w-4" />
                        )}
                        {t('profileModalUploadPicture')}
                      </Button>
                      <p className="text-xs text-muted-foreground">
                        {t('profileModalUploadHint')}
                      </p>
                    </div>
                  </div>

                  {/* Account info — read-only */}
                  <div className="rounded-xl border bg-card p-5">
                    <div className="flex flex-wrap gap-6">
                      <div className="space-y-1">
                        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Crown className="h-3 w-3" />
                          {t('profileModalAccountTier')}
                        </p>
                        <Badge
                          variant="secondary"
                          className={cn(
                            user.account_tier === 3 && 'border-2 border-[#FFD700] text-[#FFD700]'
                          )}
                        >
                          {user.account_tier === 3 ? t('profileAvatarTierGold') : t('profileAvatarTierNormal')}
                        </Badge>
                      </div>
                      <div className="space-y-1">
                        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          {t('profileModalMemberSince')}
                        </p>
                        <p className="text-sm font-medium text-foreground">{memberSince}</p>
                      </div>
                    </div>
                  </div>

                  {/* Basic Info */}
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="full-name">{t('profileModalDisplayNameLabel')}</Label>
                      <Input
                        id="full-name"
                        placeholder={t('profileModalDisplayNamePlaceholder')}
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="username">{t('profileModalUsernameLabel')}</Label>
                      <Input
                        id="username"
                        placeholder={t('profileModalUsernamePlaceholder')}
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="bio">{t('profileModalBioLabel')}</Label>
                      <Textarea
                        id="bio"
                        placeholder={t('profileModalBioPlaceholder')}
                        value={bio}
                        onChange={(e) => setBio(e.target.value)}
                        rows={4}
                        maxLength={500}
                      />
                      <p className="text-xs text-muted-foreground">
                        {t('profileModalBioCharCount', { count: bio.length })}
                      </p>
                    </div>
                  </div>

                  {/* Profile Badges — live preview of how these read on your public profile */}
                  {(experienceLevel || marketFocus || riskProfile) && (
                    <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
                      <Label className="text-sm font-medium">{t('profileModalBadgesLabel')}</Label>
                      <div className="flex flex-wrap gap-2">
                        {experienceLevel && (
                          <Badge variant="secondary" className="capitalize">
                            {getExperienceLabels(t)[experienceLevel]}
                          </Badge>
                        )}
                        {marketFocus && (
                          <Badge variant="secondary">
                            {marketFocus === 'US' ? t('profileModalMarketUs') : marketFocus === 'EU' ? t('profileModalMarketEu') : t('profileModalMarketBothBadge')}
                          </Badge>
                        )}
                        {riskProfile && (
                          <Badge variant="secondary" className="capitalize">
                            {getRiskProfileLabels(t)[riskProfile]}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {t('profileModalBadgesHint')}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {activeSection === 'preferences' && (
                <div className="space-y-6 max-w-2xl">
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="experience-level" className="flex items-center gap-2">
                        <Briefcase className="h-4 w-4" />
                        {t('profileModalExperienceLabel')}
                      </Label>
                      <Select
                        value={experienceLevel}
                        onValueChange={(value: 'beginner' | 'intermediate' | 'advanced') =>
                          setExperienceLevel(value)
                        }
                      >
                        <SelectTrigger id="experience-level">
                          <SelectValue placeholder={t('profileModalExperiencePlaceholder')} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="beginner">{getExperienceLabels(t).beginner}</SelectItem>
                          <SelectItem value="intermediate">{getExperienceLabels(t).intermediate}</SelectItem>
                          <SelectItem value="advanced">{getExperienceLabels(t).advanced}</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        {t('profileModalExperienceHint')}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="market-focus" className="flex items-center gap-2">
                        <Target className="h-4 w-4" />
                        {t('profileModalMarketFocusLabel')}
                      </Label>
                      <Select
                        value={marketFocus}
                        onValueChange={(value: 'US' | 'EU' | 'BOTH') => setMarketFocus(value)}
                      >
                        <SelectTrigger id="market-focus">
                          <SelectValue placeholder={t('profileModalMarketFocusPlaceholder')} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="US">{t('profileModalMarketUs')}</SelectItem>
                          <SelectItem value="EU">{t('profileModalMarketEu')}</SelectItem>
                          <SelectItem value="BOTH">{t('profileModalMarketBothSelect')}</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        {t('profileModalMarketFocusHint')}
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="risk-profile" className="flex items-center gap-2">
                        <TrendingUp className="h-4 w-4" />
                        {t('profileModalRiskProfileLabel')}
                      </Label>
                      <Select
                        value={riskProfile}
                        onValueChange={(value: 'conservative' | 'balanced' | 'aggressive') =>
                          setRiskProfile(value)
                        }
                      >
                        <SelectTrigger id="risk-profile">
                          <SelectValue placeholder={t('profileModalRiskProfilePlaceholder')} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="conservative">{getRiskProfileLabels(t).conservative}</SelectItem>
                          <SelectItem value="balanced">{getRiskProfileLabels(t).balanced}</SelectItem>
                          <SelectItem value="aggressive">{getRiskProfileLabels(t).aggressive}</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        {t('profileModalRiskProfileHint')}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Error message */}
              {error && (
                <div className="mt-4 max-w-2xl rounded-md bg-destructive/10 p-3 text-sm text-destructive animate-in fade-in slide-in-from-bottom-2">
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
