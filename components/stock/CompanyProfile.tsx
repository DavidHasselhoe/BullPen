'use client';

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
  const { data, isLoading, error } = useQuery({
    queryKey: ['company-profile', companyId],
    queryFn: async () => {
      const response = await fetch(`/api/company/${companyId}/profile`);
      const result: CompanyProfileResponse = await response.json();

      if (result.success && result.profile) {
        return result.profile;
      }

      return null;
    },
    enabled: !!companyId,
    staleTime: 1000 * 60 * 60, // Cache for 1 hour (profile data changes slowly)
  });

  // Show nothing if error or no data
  if (error || (!isLoading && !data)) {
    return null;
  }

  // Check if we have any profile data to show
  const hasData = data && (
    data.sector ||
    data.industry ||
    data.incorporation_location ||
    data.fiscal_year_end ||
    data.employee_count ||
    data.shares_outstanding
  );

  if (!isLoading && !hasData) {
    return null; // Don't show empty profile
  }

  const profileFields = [
    {
      label: 'Sector',
      value: data?.sector || '—',
      icon: Tag,
      show: !!data?.sector,
    },
    {
      label: 'Industry',
      value: data?.industry || '—',
      icon: Building2,
      show: !!data?.industry,
    },
    {
      label: 'Employees',
      value: formatEmployeeCount(data?.employee_count || null, data?.employee_count_is_estimated || false),
      icon: Users,
      show: !!data?.employee_count,
    },
    {
      label: 'Shares Outstanding',
      value: formatSharesOutstanding(data?.shares_outstanding || null),
      icon: Share2,
      show: !!data?.shares_outstanding,
    },
    {
      label: 'Fiscal Year End',
      value: formatFiscalYearEnd(data?.fiscal_year_end || null),
      icon: Calendar,
      show: !!data?.fiscal_year_end,
    },
    {
      label: 'Incorporation',
      value: data?.incorporation_location || '—',
      icon: MapPin,
      show: !!data?.incorporation_location,
    },
  ].filter((field) => field.show); // Only show fields with data

  if (profileFields.length === 0) {
    return null; // Don't show empty profile
  }

  return (
    <Card className="mb-8">
      <CardHeader>
        <CardTitle className="text-lg font-semibold text-foreground">
          Company Profile
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
