'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Bug, Lightbulb, Circle, Clock, CheckCircle2, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import type {
  FeedbackListResponse,
  FeedbackReportRow,
  FeedbackStatus,
  FeedbackType,
} from '@/app/api/admin/feedback/route';

type TypeFilter = 'all' | FeedbackType;
type StatusFilter = 'all' | FeedbackStatus;

const TYPE_FILTERS: { value: TypeFilter; label: string }[] = [
  { value: 'all', label: 'All types' },
  { value: 'bug', label: 'Bugs' },
  { value: 'feature', label: 'Ideas' },
];

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'resolved', label: 'Resolved' },
];

/** The third status reads as "Fixed" for a bug and "Implemented" for a
 *  feature request — same underlying `resolved` state, type-appropriate
 *  label. Keeps the schema to one generic enum instead of a cross-column
 *  CHECK constraint tying status values to type. */
function statusLabel(status: FeedbackStatus, type: FeedbackType): string {
  if (status === 'pending') return 'Pending';
  if (status === 'in_progress') return 'In progress';
  return type === 'bug' ? 'Fixed' : 'Implemented';
}

function StatusBadge({ status, type }: { status: FeedbackStatus; type: FeedbackType }) {
  const label = statusLabel(status, type);
  if (status === 'pending') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-border/50 bg-muted/40 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <Circle className="h-2.5 w-2.5" /> {label}
      </span>
    );
  }
  if (status === 'in_progress') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-blue-500/25 bg-blue-500/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-blue-400">
        <Clock className="h-2.5 w-2.5" /> {label}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border/50 bg-muted/40 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-foreground">
      <CheckCircle2 className="h-2.5 w-2.5" /> {label}
    </span>
  );
}

function TypeBadge({ type }: { type: FeedbackType }) {
  const Icon = type === 'bug' ? Bug : Lightbulb;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
      <Icon className="h-3.5 w-3.5 shrink-0" />
      {type === 'bug' ? 'Bug' : 'Idea'}
    </span>
  );
}

function ReportRow({ report }: { report: FeedbackReportRow }) {
  const [expanded, setExpanded] = useState(false);
  const queryClient = useQueryClient();

  const updateStatus = useMutation({
    mutationFn: async (status: FeedbackStatus) => {
      const res = await fetch(`/api/admin/feedback/${report.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-feedback'] });
    },
  });

  return (
    <>
      <tr className="border-t border-border/30 align-top">
        <td className="py-2.5 pr-3">
          <TypeBadge type={report.type} />
        </td>
        <td className="py-2.5 pr-3 max-w-[260px]">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-left text-sm font-medium hover:text-primary transition-colors"
          >
            {report.title}
          </button>
        </td>
        <td className="py-2.5 pr-3 font-mono text-xs text-muted-foreground/85 whitespace-nowrap">
          {report.reporter_email ?? '(deleted user)'}
        </td>
        <td className="py-2.5 pr-3 text-xs text-muted-foreground/80 whitespace-nowrap">
          {new Date(report.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
        </td>
        <td className="py-2.5 pr-3">
          <select
            value={report.status}
            disabled={updateStatus.isPending}
            onChange={(e) => updateStatus.mutate(e.target.value as FeedbackStatus)}
            className="h-7 rounded-md border border-input bg-background px-2 text-xs disabled:opacity-50"
          >
            <option value="pending">Pending</option>
            <option value="in_progress">In progress</option>
            <option value="resolved">{report.type === 'bug' ? 'Fixed' : 'Implemented'}</option>
          </select>
        </td>
        <td className="py-2.5">
          <StatusBadge status={report.status} type={report.type} />
        </td>
      </tr>
      {expanded && (
        <tr className="border-t border-border/10 bg-muted/[0.03]">
          <td colSpan={6} className="py-3 px-3">
            <p className="text-sm text-foreground/85 leading-relaxed whitespace-pre-wrap max-w-2xl">
              {report.description}
            </p>
            {report.page_url && (
              <a
                href={report.page_url}
                className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <ExternalLink className="h-3 w-3" /> {report.page_url}
              </a>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

export function AdminFeedbackClient() {
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('pending');

  const { data, isLoading, error } = useQuery<FeedbackListResponse>({
    queryKey: ['admin-feedback'],
    queryFn: async () => {
      const res = await fetch('/api/admin/feedback');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    staleTime: 30_000,
  });

  const filtered = useMemo(() => {
    const reports = data?.reports ?? [];
    return reports.filter(
      (r) => (typeFilter === 'all' || r.type === typeFilter) && (statusFilter === 'all' || r.status === statusFilter)
    );
  }, [data?.reports, typeFilter, statusFilter]);

  const counts = useMemo(() => {
    const reports = data?.reports ?? [];
    return {
      pending: reports.filter((r) => r.status === 'pending').length,
      in_progress: reports.filter((r) => r.status === 'in_progress').length,
      resolved: reports.filter((r) => r.status === 'resolved').length,
    };
  }, [data?.reports]);

  return (
    <main className="container mx-auto max-w-6xl py-8 px-4 sm:px-6 lg:px-8">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">Feedback</h1>
        <p className="text-sm text-muted-foreground/80 mt-1">
          Bug reports and feature requests submitted from the app.
        </p>
      </header>

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-4 mb-6 text-sm text-red-400">
          Failed to load: {error instanceof Error ? error.message : 'Unknown error'}
        </div>
      )}

      {isLoading && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <div className="h-24 rounded-xl animate-shimmer" />
          <div className="h-24 rounded-xl animate-shimmer" />
          <div className="h-24 rounded-xl animate-shimmer" />
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-xs uppercase tracking-widest text-muted-foreground/80 font-semibold">
                  Pending
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold tabular-nums">{counts.pending}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-xs uppercase tracking-widest text-muted-foreground/80 font-semibold">
                  In progress
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold tabular-nums">{counts.in_progress}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-xs uppercase tracking-widest text-muted-foreground/80 font-semibold">
                  Resolved
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold tabular-nums">{counts.resolved}</p>
              </CardContent>
            </Card>
          </div>

          <div className="flex flex-wrap items-center gap-4 mb-4">
            <div className="flex items-center gap-1.5 flex-wrap">
              {TYPE_FILTERS.map((f) => (
                <button
                  key={f.value}
                  onClick={() => setTypeFilter(f.value)}
                  className={cn(
                    'rounded-lg px-2.5 py-1 text-xs font-medium transition-all border',
                    typeFilter === f.value
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/20'
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {STATUS_FILTERS.map((f) => (
                <button
                  key={f.value}
                  onClick={() => setStatusFilter(f.value)}
                  className={cn(
                    'rounded-lg px-2.5 py-1 text-xs font-medium transition-all border',
                    statusFilter === f.value
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/20'
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <Card>
            <CardContent className="pt-5">
              {filtered.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  {data.reports.length === 0 ? 'No reports yet.' : 'Nothing matches this filter.'}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-[11px] uppercase tracking-widest text-muted-foreground/85 text-left">
                        <th className="pb-2 font-semibold">Type</th>
                        <th className="pb-2 font-semibold">Title</th>
                        <th className="pb-2 font-semibold">Reporter</th>
                        <th className="pb-2 font-semibold">Reported</th>
                        <th className="pb-2 font-semibold">Update</th>
                        <th className="pb-2 font-semibold">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((report) => (
                        <ReportRow key={report.id} report={report} />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </main>
  );
}
