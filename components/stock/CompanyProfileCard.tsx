'use client';

import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Globe,
  MapPin,
  Users,
  Calendar,
  Building2,
  Briefcase,
  DollarSign,
} from 'lucide-react';
import type { CompanyProfile, KeyExecutive } from '@/lib/twelvedata/twelvedata-client';

interface ProfileResponse {
  success: boolean;
  symbol: string;
  profile?: CompanyProfile;
  executives?: KeyExecutive[];
  error?: string;
}

function fmtEmployees(n: number | null): string {
  if (!n) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toLocaleString();
}

function fmtCompensation(n: number | null, currency: string): string {
  if (!n) return '—';
  const m = n / 1_000_000;
  return `${currency} ${m.toFixed(1)}M`;
}

function fmtDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return dateStr;
  }
}

function InfoRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 text-sm">
      <Icon className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
      <div className="flex flex-col gap-0.5">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="text-foreground font-medium">{value || '—'}</span>
      </div>
    </div>
  );
}

export function CompanyProfileCard({ ticker }: { ticker: string }) {
  const { data, isLoading } = useQuery<ProfileResponse>({
    queryKey: ['company-profile', ticker],
    queryFn: async () => {
      const res = await fetch(`/api/stock/${ticker}/company-profile`);
      if (!res.ok) throw new Error('Failed to fetch profile');
      return res.json();
    },
    staleTime: 24 * 60 * 60 * 1000, // profile data is essentially static
    retry: 1,
  });

  if (isLoading) {
    return (
      <Card className="mb-8">
        <CardHeader className="pb-3">
          <Skeleton className="h-5 w-40" />
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data?.success || !data.profile) return null;

  const { profile, executives = [] } = data;

  const location = [profile.city, profile.state, profile.country].filter(Boolean).join(', ');

  return (
    <Card className="mb-8">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">Company Profile</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">

        {/* Description */}
        {profile.description && (
          <p className="text-sm text-muted-foreground leading-relaxed line-clamp-4">
            {profile.description}
          </p>
        )}

        {/* Key facts grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {profile.ceo && (
            <InfoRow icon={Briefcase} label="CEO" value={profile.ceo} />
          )}
          {profile.employees && (
            <InfoRow icon={Users} label="Employees" value={fmtEmployees(profile.employees)} />
          )}
          {location && (
            <InfoRow icon={MapPin} label="Headquarters" value={location} />
          )}
          {profile.ipo_date && (
            <InfoRow icon={Calendar} label="IPO Date" value={fmtDate(profile.ipo_date)} />
          )}
          {profile.exchange && (
            <InfoRow icon={Building2} label="Exchange" value={`${profile.exchange} · ${profile.currency}`} />
          )}
          {profile.website && (
            <InfoRow
              icon={Globe}
              label="Website"
              value={
                <a
                  href={profile.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  {profile.website.replace(/^https?:\/\//, '')}
                </a>
              }
            />
          )}
        </div>

        {/* Sector / Industry badges */}
        {(profile.sector || profile.industry) && (
          <div className="flex flex-wrap gap-2">
            {profile.sector && (
              <Badge variant="secondary" className="text-xs">
                {profile.sector}
              </Badge>
            )}
            {profile.industry && (
              <Badge variant="outline" className="text-xs">
                {profile.industry}
              </Badge>
            )}
          </div>
        )}

        {/* Key Executives */}
        {executives.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold mb-3 text-foreground">Key Executives</h3>
            <div className="divide-y divide-border">
              {executives.slice(0, 8).map((exec, i) => (
                <div key={i} className="flex items-center justify-between py-2.5 gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{exec.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{exec.title}</p>
                  </div>
                  <div className="text-right shrink-0">
                    {exec.total_compensation ? (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <DollarSign className="h-3 w-3" />
                        {fmtCompensation(exec.total_compensation, exec.currency)}
                      </div>
                    ) : null}
                    {exec.age && (
                      <p className="text-xs text-muted-foreground">Age {exec.age}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
