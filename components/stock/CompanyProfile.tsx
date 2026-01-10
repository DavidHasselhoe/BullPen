'use client';

import { useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { useQuery } from '@tanstack/react-query';
import { Building2, Users, Share2, Calendar, MapPin, Tag } from 'lucide-react';

interface CompanyProfileProps {
  companyId: string;
}

interface CompanyProfileResponse {
  success: boolean;
  profile?: {
    sic_code: string | null;
    sector: string | null;
    industry: string | null;
    incorporation_location: string | null;
    fiscal_year_end: string | null;
    employee_count: number | null;
    employee_count_is_estimated: boolean;
    shares_outstanding: number | null;
  };
  extracting?: boolean; // Flag indicating extraction is in progress
  startedAt?: number; // Timestamp when extraction started
  error?: string;
}

/**
 * Formats fiscal year end from "MM-DD" to readable format
 */
function formatFiscalYearEnd(fye: string | null): string {
  if (!fye) return '—';
  
  const [month, day] = fye.split('-');
  if (!month || !day) return fye;

  const monthNames = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];

  const monthIndex = parseInt(month, 10) - 1;
  if (monthIndex < 0 || monthIndex >= 12) return fye;

  return `${monthNames[monthIndex]} ${parseInt(day, 10)}`;
}

/**
 * Formats shares outstanding to readable format
 */
function formatSharesOutstanding(shares: number | null): string {
  if (!shares) return '—';
  
  if (shares >= 1_000_000_000) {
    return `${(shares / 1_000_000_000).toFixed(2)}B`;
  } else if (shares >= 1_000_000) {
    return `${(shares / 1_000_000).toFixed(2)}M`;
  } else if (shares >= 1_000) {
    return `${(shares / 1_000).toFixed(2)}K`;
  }
  
  return shares.toLocaleString();
}

/**
 * Formats employee count to readable format
 */
function formatEmployeeCount(count: number | null, isEstimated: boolean): string {
  if (!count) return '—';
  
  const formatted = count >= 1_000_000
    ? `${(count / 1_000_000).toFixed(2)}M`
    : count >= 1_000
    ? `${(count / 1_000).toFixed(2)}K`
    : count.toLocaleString();
  
  return isEstimated ? `~${formatted}` : formatted;
}

/**
 * Company Profile Component
 * Displays company identity, scale, and structure information
 */
export function CompanyProfile({ companyId }: CompanyProfileProps) {
  const { data, isLoading, error, isError } = useQuery({
    queryKey: ['company-profile', companyId],
    queryFn: async () => {
      try {
        console.log(`[CompanyProfile] Fetching profile for ${companyId}`);
        const response = await fetch(`/api/company/${companyId}/profile`);
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error(`[CompanyProfile] API error (${response.status}):`, errorText);
          throw new Error(`Failed to fetch profile: ${response.status} ${response.statusText}`);
        }
        
        const result: CompanyProfileResponse = await response.json();
        console.log(`[CompanyProfile] API response:`, {
          success: result.success,
          hasProfile: !!result.profile,
          extracting: result.extracting,
          hasError: !!result.error,
        });

        if (result.error) {
          console.error(`[CompanyProfile] API returned error:`, result.error);
        }

        if (result.success && result.profile) {
          const hasData = 
            result.profile.sic_code ||
            result.profile.sector ||
            result.profile.industry ||
            result.profile.incorporation_location ||
            result.profile.fiscal_year_end ||
            result.profile.employee_count ||
            result.profile.shares_outstanding;
          
          console.log(`[CompanyProfile] Profile data check:`, {
            hasData,
            extracting: result.extracting || false,
          });

          return { 
            profile: result.profile, 
            extracting: result.extracting || false,
            startedAt: result.startedAt,
          };
        }

        if (!result.success) {
          console.error(`[CompanyProfile] API returned unsuccessful:`, result);
          throw new Error(result.error || 'Failed to fetch profile');
        }

        return null;
      } catch (err) {
        console.error(`[CompanyProfile] Error in queryFn:`, err);
        throw err;
      }
    },
    enabled: !!companyId,
    staleTime: 1000 * 60 * 60, // Cache for 1 hour (profile data changes slowly)
    refetchInterval: (query) => {
      // Only poll if extraction is in progress, with a max timeout
      const queryData = query.state.data as { profile: any; extracting: boolean; startedAt?: number } | null;
      if (queryData?.extracting) {
        // Stop polling after 60 seconds (extraction should complete by then)
        const startedAt = queryData.startedAt || Date.now();
        const elapsed = Date.now() - startedAt;
        
        if (elapsed > 60000) {
          console.warn(`[CompanyProfile] Stopping polling after 60 seconds for ${companyId}`);
          return false; // Stop polling after 60 seconds
        }
        
        console.log(`[CompanyProfile] Polling (${Math.round(elapsed / 1000)}s elapsed) for ${companyId}`);
        return 5000; // Poll every 5 seconds while extracting
      }
      return false; // Don't poll if not extracting
    },
    retry: 2, // Retry failed requests twice
    retryDelay: 1000, // Wait 1 second between retries
  });

  // Extract profile and extracting flag from query data
  const profile = data?.profile || null;
  const isExtracting = data?.extracting || false;

  // Show error state (for debugging)
  if (isError || error) {
    console.error(`[CompanyProfile] Error state:`, { isError, error });
    return (
      <Card className="mb-8 border-destructive/50">
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-destructive">
            Company Profile (Error)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-destructive">
            {error instanceof Error ? error.message : 'Failed to load company profile'}
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            Check console for details (Company ID: {companyId})
          </p>
        </CardContent>
      </Card>
    );
  }

  // Check if we have any profile data to show
  const hasData = profile && (
    profile.sector ||
    profile.industry ||
    profile.incorporation_location ||
    profile.fiscal_year_end ||
    profile.employee_count ||
    profile.shares_outstanding ||
    profile.sic_code
  );
  
  // Debug logging
  if (profile && !isLoading) {
    console.log(`[CompanyProfile] Profile data check for ${companyId}:`, {
      hasData,
      sector: profile.sector,
      industry: profile.industry,
      location: profile.incorporation_location,
      fye: profile.fiscal_year_end,
      employees: profile.employee_count,
      shares: profile.shares_outstanding,
      sic: profile.sic_code,
      isExtracting,
    });
  }

  // Show skeleton while loading or if extracting and no data yet
  if (isLoading || (isExtracting && !hasData)) {
    return (
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-foreground">
            Company Profile
            {isExtracting && (
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                (updating...)
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-5 w-32" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Don't show empty profile unless we're still extracting or loading
  // But show skeleton if we just loaded and have no data (extraction might be starting)
  if (!isLoading && !hasData && !isExtracting) {
    console.log(`[CompanyProfile] Hiding profile - no data and not extracting for ${companyId}`);
    // If we just finished loading with no data, give extraction a moment
    // Return skeleton for a short time in case extraction is starting
    return (
      <Card className="mb-8 opacity-50">
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-muted-foreground">
            Company Profile
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Profile data is being extracted. Please refresh in a moment.
          </p>
        </CardContent>
      </Card>
    );
  }

  const profileFields = [
    {
      label: 'Sector',
      value: profile?.sector || '—',
      icon: Tag,
      show: !!profile?.sector,
    },
    {
      label: 'Industry',
      value: profile?.industry || '—',
      icon: Building2,
      show: !!profile?.industry,
    },
    {
      label: 'Employees',
      value: formatEmployeeCount(profile?.employee_count || null, profile?.employee_count_is_estimated || false),
      icon: Users,
      show: !!profile?.employee_count,
    },
    {
      label: 'Shares Outstanding',
      value: formatSharesOutstanding(profile?.shares_outstanding || null),
      icon: Share2,
      show: !!profile?.shares_outstanding,
    },
    {
      label: 'Fiscal Year End',
      value: formatFiscalYearEnd(profile?.fiscal_year_end || null),
      icon: Calendar,
      show: !!profile?.fiscal_year_end,
    },
    {
      label: 'Incorporation',
      value: profile?.incorporation_location || '—',
      icon: MapPin,
      show: !!profile?.incorporation_location,
    },
  ].filter((field) => field.show); // Only show fields with data

  // Show profile card even if only extracting (will show skeleton above)
  // But if no fields after filtering and not extracting, don't show
  if (profileFields.length === 0 && !isExtracting) {
    return null;
  }

  // If extracting but have some fields, show them
  if (profileFields.length === 0 && isExtracting) {
    // This case is handled by the skeleton above, but just in case
    return (
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="text-lg font-semibold text-foreground">
            Company Profile
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              (updating...)
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Extracting profile data...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mb-8">
      <CardHeader>
        <CardTitle className="text-lg font-semibold text-foreground">
          Company Profile
          {isExtracting && (
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              (updating...)
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-5 w-32" />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            {profileFields.map((field, index) => {
              const Icon = field.icon;
              return (
                <div
                  key={field.label}
                  className="space-y-1.5 animate-in fade-in slide-in-from-bottom-2 duration-300"
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    <Icon className="h-3.5 w-3.5" />
                    {field.label}
                  </div>
                  <p className="text-sm font-medium text-foreground">{field.value}</p>
                  {index < profileFields.length - 1 && index % 2 === 1 && (
                    <Separator className="sm:hidden mt-4" />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
