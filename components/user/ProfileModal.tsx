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
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Loader2, Upload, User, Briefcase, Target, TrendingUp, Crown, Calendar, CheckCircle2 } from 'lucide-react';
import { createBrowserClient } from '@/lib/supabase/client';

interface ProfileModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ProfileSection = 'basic' | 'preferences';

export function ProfileModal({ open, onOpenChange }: ProfileModalProps) {
  const { user, isLoading: authLoading } = useAuth();
  const [activeSection, setActiveSection] = useState<ProfileSection>('basic');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Form state
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [bio, setBio] = useState('');
  const [experienceLevel, setExperienceLevel] = useState<'beginner' | 'intermediate' | 'advanced' | ''>('');
  const [marketFocus, setMarketFocus] = useState<'US' | 'EU' | 'BOTH' | ''>('');
  const [riskProfile, setRiskProfile] = useState<'conservative' | 'balanced' | 'aggressive' | ''>('');
  const [avatarUrl, setAvatarUrl] = useState('');

  // Load user data
  useEffect(() => {
    if (user && open) {
      setFullName(user.full_name || '');
      setUsername(user.username || '');
      setBio(user.bio || '');
      setExperienceLevel(user.experience_level || '');
      setMarketFocus(user.market_focus || '');
      setRiskProfile(user.risk_profile || '');
      setAvatarUrl(user.avatar_url || '');
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

      const { error: updateError } = await supabase
        .from('users')
        .update({
          full_name: fullName || null,
          username: username || null,
          bio: bio || null,
          experience_level: experienceLevel || null,
          market_focus: marketFocus || null,
          risk_profile: riskProfile || null,
          avatar_url: avatarUrl || null,
        })
        .eq('id', user.id);

      if (updateError) {
        throw updateError;
      }

      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        // Refresh page to update user data
        window.location.reload();
      }, 1500);
    } catch (err: any) {
      setError(err.message || 'Failed to update profile');
    } finally {
      setIsSaving(false);
    }
  };

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
      <DialogContent className="w-[98vw] !max-w-[1800px] sm:!max-w-[1800px] h-[85vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <DialogTitle>Profile Settings</DialogTitle>
          <DialogDescription>
            Manage your profile information and preferences
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
            <Separator className="my-4" />
            <div className="px-3 py-2 space-y-1">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Crown className="h-3 w-3" />
                <span className="font-medium">Account Tier</span>
              </div>
              <Badge variant="secondary" className="w-full justify-center">
                {user.account_tier || 'free'}
              </Badge>
            </div>
            <div className="px-3 py-2 space-y-1">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Calendar className="h-3 w-3" />
                <span className="font-medium">Member Since</span>
              </div>
              <div className="text-sm font-medium">{memberSince}</div>
            </div>
          </div>

          {/* Main Content */}
          <div className="flex-1 overflow-y-auto p-6 min-h-0 relative">
            {activeSection === 'basic' && (
              <div className="space-y-6 max-w-5xl">
                {/* Avatar Section */}
                <div className="flex items-center gap-6">
                  <Avatar className="h-24 w-24">
                    <AvatarImage src={avatarUrl || undefined} alt={displayName} />
                    <AvatarFallback className="bg-primary/10 text-primary text-2xl">
                      {getInitials()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 space-y-2">
                    <Label htmlFor="avatar-url">Profile Picture URL</Label>
                    <div className="flex gap-2">
                      <Input
                        id="avatar-url"
                        placeholder="https://example.com/avatar.jpg"
                        value={avatarUrl}
                        onChange={(e) => setAvatarUrl(e.target.value)}
                      />
                      <Button variant="outline" size="icon" disabled>
                        <Upload className="h-4 w-4" />
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Upload functionality coming soon
                    </p>
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
                </div>
              </div>
            )}

            {activeSection === 'preferences' && (
              <div className="space-y-6 max-w-5xl">
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
                      We'll customize data display based on your experience level
                    </p>
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
                  Profile updated successfully!
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
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
      </DialogContent>
    </Dialog>
  );
}
