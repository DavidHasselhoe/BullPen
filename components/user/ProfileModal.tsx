'use client';

import { useState, useEffect, useRef } from 'react';
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
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { ProfileAvatar } from '@/components/user/ProfileAvatar';
import { Loader2, Upload, User, Briefcase, Target, TrendingUp, Crown, Calendar, Check } from 'lucide-react';
import { createBrowserClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/logger';
import { uploadAvatarToStorage } from '@/lib/storage/avatar-upload';
import { cn } from '@/lib/utils';

interface ProfileModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ProfileSection = 'basic' | 'preferences';

export function ProfileModal({ open, onOpenChange }: ProfileModalProps) {
  const { user, isLoading: authLoading } = useAuth();
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
        throw new Error(uploadResult.error || 'Upload failed');
      }

      // Update avatar URL in state
      setAvatarUrl(uploadResult.publicUrl);

      // Optionally auto-save
      // For now, user needs to click "Save Changes" to persist
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload avatar');
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
        throw new Error(updateError.message || 'Failed to update profile in database');
      }

      window.dispatchEvent(new Event('auth:refresh'));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update profile';
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
    return user?.email.slice(0, 2).toUpperCase() || 'U';
  };

  const displayName = fullName || username || user?.email.split('@')[0] || 'User';
  const memberSince = user?.created_at
    ? new Date(user.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
    : '';

  const sections: Array<{ id: ProfileSection; label: string; icon: React.ReactNode }> = [
    { id: 'basic', label: 'Basic Info', icon: <User className="h-4 w-4" /> },
    { id: 'preferences', label: 'Preferences', icon: <Target className="h-4 w-4" /> },
  ];

  if (authLoading || !user) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[90vw] !max-w-[1000px] sm:!max-w-[1000px] h-[85vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <div className="flex items-center justify-between gap-4 pr-2">
            <div>
              <DialogTitle>Profile Settings</DialogTitle>
              <DialogDescription>
                Manage your profile information and preferences
              </DialogDescription>
            </div>
            <div className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground min-w-[72px] justify-end">
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
            {activeSection === 'basic' && (
              <div className="space-y-6 max-w-2xl">
                {/* Avatar Section */}
                <div className="flex items-center gap-6">
                  <ProfileAvatar
                    avatarUrl={avatarUrl}
                    displayName={displayName}
                    fallback={getInitials()}
                    tier={user?.account_tier ?? 1}
                    size="xl"
                    showTooltip={true}
                  />
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-3">
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
                        size="icon"
                        disabled={isUploadingAvatar}
                        onClick={() => fileInputRef.current?.click()}
                        className="cursor-pointer"
                      >
                        {isUploadingAvatar ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Upload className="h-4 w-4" />
                        )}
                      </Button>
                      <span className="text-sm text-muted-foreground">Upload profile picture</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      JPEG, PNG, or WebP image (max 5 MB)
                    </p>
                  </div>
                </div>

                <Separator />

                {/* Account info — read-only */}
                <div className="flex flex-wrap gap-4">
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <Crown className="h-3 w-3" />
                      Account Tier
                    </p>
                    <Badge
                      variant="secondary"
                      className={cn(
                        user.account_tier === 3 && 'border-2 border-[#FFD700] text-[#FFD700]'
                      )}
                    >
                      {user.account_tier === 3 ? 'Gold' : 'Normal'}
                    </Badge>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                      <Calendar className="h-3 w-3" />
                      Member Since
                    </p>
                    <p className="text-sm font-medium">{memberSince}</p>
                  </div>
                </div>

                <Separator />

                {/* Basic Info */}
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="full-name">Display Name</Label>
                    <Input
                      id="full-name"
                      placeholder="John Doe"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="username">Username</Label>
                    <Input
                      id="username"
                      placeholder="johndoe"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="bio">Bio</Label>
                    <Textarea
                      id="bio"
                      placeholder="Tell us about yourself..."
                      value={bio}
                      onChange={(e) => setBio(e.target.value)}
                      rows={4}
                      maxLength={500}
                    />
                    <p className="text-xs text-muted-foreground">
                      {bio.length}/500 characters
                    </p>
                  </div>

                  {/* Profile Badges */}
                  {(experienceLevel || marketFocus || riskProfile) && (
                    <>
                      <Separator />
                      <div className="space-y-3">
                        <Label className="text-sm font-medium">Profile Badges</Label>
                        <div className="flex flex-wrap gap-2">
                          {experienceLevel && (
                            <Badge variant="secondary" className="capitalize">
                              {experienceLevel}
                            </Badge>
                          )}
                          {marketFocus && (
                            <Badge variant="secondary">
                              {marketFocus === 'US' ? 'US Markets' : marketFocus === 'EU' ? 'EU Markets' : 'US & EU Markets'}
                            </Badge>
                          )}
                          {riskProfile && (
                            <Badge variant="secondary" className="capitalize">
                              {riskProfile}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Your profile badges are displayed based on your preferences
                        </p>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {activeSection === 'preferences' && (
              <div className="space-y-6 max-w-2xl">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="experience-level" className="flex items-center gap-2">
                      <Briefcase className="h-4 w-4" />
                      Experience Level
                    </Label>
                    <Select
                      value={experienceLevel}
                      onValueChange={(value: 'beginner' | 'intermediate' | 'advanced') =>
                        setExperienceLevel(value)
                      }
                    >
                      <SelectTrigger id="experience-level">
                        <SelectValue placeholder="Select your experience level" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="beginner">Beginner</SelectItem>
                        <SelectItem value="intermediate">Intermediate</SelectItem>
                        <SelectItem value="advanced">Advanced</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      We&apos;ll customize data display based on your experience level
                    </p>
                    {experienceLevel && (
                      <div className="mt-2">
                        <Badge variant="secondary" className="capitalize">
                          {experienceLevel}
                        </Badge>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="market-focus" className="flex items-center gap-2">
                      <Target className="h-4 w-4" />
                      Market Focus
                    </Label>
                    <Select
                      value={marketFocus}
                      onValueChange={(value: 'US' | 'EU' | 'BOTH') => setMarketFocus(value)}
                    >
                      <SelectTrigger id="market-focus">
                        <SelectValue placeholder="Select your market focus" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="US">US Markets</SelectItem>
                        <SelectItem value="EU">EU Markets</SelectItem>
                        <SelectItem value="BOTH">Both US & EU</SelectItem>
                      </SelectContent>
                    </Select>
                    {marketFocus && (
                      <div className="mt-2">
                        <Badge variant="outline">
                          {marketFocus === 'US' ? 'US Markets' : marketFocus === 'EU' ? 'EU Markets' : 'US & EU Markets'}
                        </Badge>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="risk-profile" className="flex items-center gap-2">
                      <TrendingUp className="h-4 w-4" />
                      Risk Profile
                    </Label>
                    <Select
                      value={riskProfile}
                      onValueChange={(value: 'conservative' | 'balanced' | 'aggressive') =>
                        setRiskProfile(value)
                      }
                    >
                      <SelectTrigger id="risk-profile">
                        <SelectValue placeholder="Select your risk tolerance" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="conservative">Conservative</SelectItem>
                        <SelectItem value="balanced">Balanced</SelectItem>
                        <SelectItem value="aggressive">Aggressive</SelectItem>
                      </SelectContent>
                    </Select>
                    {riskProfile && (
                      <div className="mt-2">
                        <Badge variant="secondary" className="capitalize">
                          {riskProfile}
                        </Badge>
                      </div>
                    )}
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
          </div>
        </div>

        {/* Footer */}
        <div className="border-t px-6 py-4 flex justify-end gap-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
