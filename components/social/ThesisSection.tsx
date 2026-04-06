'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import Image from 'next/image';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown, Minus, Trash2, Pencil, Loader2, MessageCircle } from 'lucide-react';
import type { Thesis } from '@/app/api/social/thesis/[symbol]/route';

const SENTIMENTS = [
  { key: 'bull' as const, label: 'Bull', icon: TrendingUp, color: 'text-emerald-500', bg: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400' },
  { key: 'neutral' as const, label: 'Neutral', icon: Minus, color: 'text-muted-foreground', bg: 'bg-muted text-muted-foreground border-muted' },
  { key: 'bear' as const, label: 'Bear', icon: TrendingDown, color: 'text-red-500', bg: 'bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400' },
];

function SentimentPill({ sentiment }: { sentiment: Thesis['sentiment'] }) {
  const s = SENTIMENTS.find((x) => x.key === sentiment)!;
  const Icon = s.icon;
  return (
    <span className={cn('inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border', s.bg)}>
      <Icon className="h-2.5 w-2.5" />
      {s.label}
    </span>
  );
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

interface ThesisCardProps {
  thesis: Thesis;
  onDelete: (id: string) => void;
  onEdit: (thesis: Thesis) => void;
  isDeleting: boolean;
}

function ThesisCard({ thesis, onDelete, onEdit, isDeleting }: ThesisCardProps) {
  const displayName = thesis.full_name || thesis.username || 'Anonymous';
  const initials = displayName.slice(0, 2).toUpperCase();
  const profileHref = thesis.username ? `/users/${encodeURIComponent(thesis.username)}` : '#';

  return (
    <div className={cn('rounded-xl border border-border bg-card px-4 py-3 space-y-2', thesis.is_own && 'border-primary/20 bg-primary/5')}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Link href={profileHref} className="shrink-0">
            {thesis.avatar_url ? (
              <Image src={thesis.avatar_url} alt={displayName} width={28} height={28} className="rounded-full object-cover" />
            ) : (
              <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center">
                <span className="text-[10px] font-semibold text-primary">{initials}</span>
              </div>
            )}
          </Link>
          <div className="flex items-center gap-2">
            <Link href={profileHref} className="text-sm font-semibold text-foreground hover:text-primary transition-colors">
              {displayName}
            </Link>
            <SentimentPill sentiment={thesis.sentiment} />
            <span className="text-xs text-muted-foreground">{timeAgo(thesis.created_at)}</span>
          </div>
        </div>

        {thesis.is_own && (
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => onEdit(thesis)}
              className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
              aria-label="Edit"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => onDelete(thesis.id)}
              disabled={isDeleting}
              className="p-1 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
              aria-label="Delete"
            >
              {isDeleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            </button>
          </div>
        )}
      </div>

      <p className="text-sm text-foreground leading-relaxed pl-[2.375rem]">{thesis.content}</p>
    </div>
  );
}

interface ThesisSectionProps {
  symbol: string;
}

export function ThesisSection({ symbol }: ThesisSectionProps) {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<'all' | 'bull' | 'bear' | 'neutral'>('all');
  const [formContent, setFormContent] = useState('');
  const [formSentiment, setFormSentiment] = useState<'bull' | 'bear' | 'neutral'>('bull');
  const [editingThesis, setEditingThesis] = useState<Thesis | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const queryKey = ['theses', symbol, filter];

  const { data: theses, isLoading } = useQuery({
    queryKey,
    queryFn: async (): Promise<Thesis[]> => {
      const url = filter === 'all'
        ? `/api/social/thesis/${encodeURIComponent(symbol)}`
        : `/api/social/thesis/${encodeURIComponent(symbol)}?sentiment=${filter}`;
      const res = await fetch(url);
      if (!res.ok) return [];
      const d = await res.json();
      return d.theses ?? [];
    },
    enabled: isAuthenticated,
    staleTime: 60_000,
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/social/thesis/${encodeURIComponent(symbol)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: formContent.trim(), sentiment: formSentiment }),
      });
      if (!res.ok) throw new Error('Failed to save thesis');
    },
    onSuccess: () => {
      setFormContent('');
      setEditingThesis(null);
      setShowForm(false);
      queryClient.invalidateQueries({ queryKey: ['theses', symbol] });
    },
  });

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await fetch(`/api/social/thesis/delete/${id}`, { method: 'DELETE' });
      queryClient.invalidateQueries({ queryKey: ['theses', symbol] });
    } finally {
      setDeletingId(null);
    }
  };

  const handleEdit = (thesis: Thesis) => {
    setEditingThesis(thesis);
    setFormContent(thesis.content);
    setFormSentiment(thesis.sentiment);
    setShowForm(true);
  };

  const hasOwnThesis = (theses ?? []).some((t) => t.is_own);

  if (!isAuthenticated) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-base font-semibold text-foreground">
            Community Theses
            {(theses?.length ?? 0) > 0 && (
              <span className="ml-1.5 text-xs font-normal text-muted-foreground">· {theses!.length}</span>
            )}
          </h2>
        </div>

        {/* Filter pills */}
        <div className="flex items-center gap-1">
          {(['all', 'bull', 'neutral', 'bear'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                'text-xs px-2.5 py-1 rounded-full border transition-colors capitalize',
                filter === f
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/30'
              )}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Post/Edit form */}
      {!hasOwnThesis && !showForm && (
        <button
          onClick={() => setShowForm(true)}
          className="w-full rounded-xl border border-dashed border-border px-4 py-3 text-sm text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors text-left"
        >
          Share your take on {symbol}…
        </button>
      )}

      {showForm && (
        <div className="rounded-xl border border-border bg-card p-4 space-y-3">
          {/* Sentiment selector */}
          <div className="flex items-center gap-2">
            {SENTIMENTS.map((s) => {
              const Icon = s.icon;
              return (
                <button
                  key={s.key}
                  onClick={() => setFormSentiment(s.key)}
                  className={cn(
                    'flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border transition-all',
                    formSentiment === s.key ? s.bg : 'border-border text-muted-foreground hover:border-foreground/30'
                  )}
                >
                  <Icon className="h-3 w-3" />
                  {s.label}
                </button>
              );
            })}
          </div>

          <Textarea
            value={formContent}
            onChange={(e) => setFormContent(e.target.value)}
            placeholder={`What's your thesis on ${symbol}?`}
            className="resize-none text-sm min-h-[80px]"
            maxLength={500}
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{formContent.length}/500</span>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => { setShowForm(false); setEditingThesis(null); setFormContent(''); }}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => submitMutation.mutate()}
                disabled={!formContent.trim() || submitMutation.isPending}
              >
                {submitMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : editingThesis ? 'Update' : 'Post'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* List */}
      <div className="space-y-2">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)
        ) : (theses?.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            No {filter === 'all' ? '' : filter} theses yet. Be the first.
          </p>
        ) : (
          theses!.map((t) => (
            <ThesisCard
              key={t.id}
              thesis={t}
              onDelete={handleDelete}
              onEdit={handleEdit}
              isDeleting={deletingId === t.id}
            />
          ))
        )}
      </div>
    </div>
  );
}
