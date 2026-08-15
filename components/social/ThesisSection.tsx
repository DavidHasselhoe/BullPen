'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import Image from 'next/image';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown, Minus, Trash2, Pencil, Loader2, MessageCircle, ChevronDown, ChevronUp, CornerDownRight } from 'lucide-react';
import type { Thesis } from '@/app/api/social/thesis/[symbol]/route';
import type { ThesisReply } from '@/app/api/social/thesis/[symbol]/replies/route';

const SENTIMENTS = [
  { key: 'bull' as const, label: 'Bull', icon: TrendingUp, color: 'text-emerald-500', bg: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400' },
  { key: 'neutral' as const, label: 'Neutral', icon: Minus, color: 'text-muted-foreground', bg: 'bg-muted text-muted-foreground border-muted' },
  { key: 'bear' as const, label: 'Bear', icon: TrendingDown, color: 'text-red-500', bg: 'bg-red-500/10 border-red-500/30 text-red-600 dark:text-red-400' },
];

function SentimentPill({ sentiment }: { sentiment: Thesis['sentiment'] }) {
  const s = SENTIMENTS.find((x) => x.key === sentiment)!;
  const Icon = s.icon;
  return (
    <span className={cn('inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border', s.bg)}>
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

function UserAvatar({ avatarUrl, displayName, size = 28 }: { avatarUrl: string | null; displayName: string; size?: number }) {
  const initials = displayName.slice(0, 2).toUpperCase();
  if (avatarUrl) {
    return <Image src={avatarUrl} alt={displayName} width={size} height={size} className="rounded-full object-cover" style={{ width: size, height: size }} />;
  }
  return (
    <div className="rounded-full bg-primary/10 flex items-center justify-center shrink-0" style={{ width: size, height: size }}>
      <span className="font-semibold text-primary" style={{ fontSize: size * 0.36 }}>{initials}</span>
    </div>
  );
}

// ─── Reply thread ─────────────────────────────────────────────────────────────

interface ThesisRepliesProps {
  thesisId: string;
  replyCount: number;
  defaultOpen?: boolean;
}

function ThesisReplies({ thesisId, replyCount, defaultOpen = false }: ThesisRepliesProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [showForm, setShowForm] = useState(defaultOpen);
  const [content, setContent] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const queryClient = useQueryClient();

  const repliesKey = ['thesis-replies', thesisId];

  const { data: replies, isLoading } = useQuery<ThesisReply[]>({
    queryKey: repliesKey,
    queryFn: async () => {
      const res = await fetch(`/api/social/thesis/${thesisId}/replies`);
      if (!res.ok) return [];
      const d = await res.json();
      return d.replies ?? [];
    },
    enabled: open,
    staleTime: 30_000,
  });

  const postReply = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/social/thesis/${thesisId}/replies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: content.trim() }),
      });
      if (!res.ok) throw new Error('Failed to post reply');
    },
    onSuccess: () => {
      setContent('');
      setShowForm(false);
      queryClient.invalidateQueries({ queryKey: repliesKey });
      // Bump reply count on parent
      queryClient.invalidateQueries({ queryKey: ['theses'] });
    },
  });

  const handleDelete = async (replyId: string) => {
    setDeletingId(replyId);
    try {
      await fetch(`/api/social/thesis/reply/${replyId}`, { method: 'DELETE' });
      queryClient.invalidateQueries({ queryKey: repliesKey });
      queryClient.invalidateQueries({ queryKey: ['theses'] });
    } finally {
      setDeletingId(null);
    }
  };

  const startEdit = (reply: ThesisReply) => {
    setEditingId(reply.id);
    setEditContent(reply.content);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditContent('');
  };

  const saveEdit = async (replyId: string) => {
    if (!editContent.trim()) return;
    setDeletingId(replyId); // reuse loading state to disable buttons
    try {
      await fetch(`/api/social/thesis/reply/${replyId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: editContent.trim() }),
      });
      queryClient.invalidateQueries({ queryKey: repliesKey });
    } finally {
      setDeletingId(null);
      setEditingId(null);
      setEditContent('');
    }
  };

  const liveCount = replies?.length ?? replyCount;

  return (
    <div className="pl-[2.375rem]">
      {/* Action row */}
      <div className="flex items-center gap-3 mt-1">
        <button
          onClick={() => { setShowForm((v) => !v); if (!open) setOpen(true); }}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
        >
          <CornerDownRight className="h-3 w-3" />
          Reply
        </button>
        {liveCount > 0 && (
          <button
            onClick={() => setOpen((v) => !v)}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
          >
            {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {liveCount} {liveCount === 1 ? 'reply' : 'replies'}
          </button>
        )}
      </div>

      {/* Reply list */}
      {open && (
        <div className="mt-2 space-y-2 border-l-2 border-border/50 pl-3">
          {isLoading ? (
            <Skeleton className="h-12 rounded-lg" />
          ) : (
            (replies ?? []).map((reply) => {
              const name = reply.full_name || reply.username || 'Anonymous';
              const profileHref = `/users/${encodeURIComponent(reply.username ?? reply.user_id)}`;
              const isEditing = editingId === reply.id;
              const isBusy = deletingId === reply.id;
              return (
                <div key={reply.id} className="group flex items-start gap-2">
                  <Link href={profileHref} className="shrink-0 mt-0.5">
                    <UserAvatar avatarUrl={reply.avatar_url} displayName={name} size={22} />
                  </Link>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-1.5 flex-wrap">
                      <Link href={profileHref} className="text-xs font-semibold text-foreground hover:text-primary transition-colors">
                        {name}
                      </Link>
                      <span className="text-[11px] text-muted-foreground">{timeAgo(reply.created_at)}</span>
                    </div>
                    {isEditing ? (
                      <div className="mt-1 space-y-1.5">
                        <Textarea
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          className="resize-none text-xs min-h-[56px]"
                          maxLength={280}
                          autoFocus
                        />
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] text-muted-foreground">{editContent.length}/280</span>
                          <div className="flex gap-1.5">
                            <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={cancelEdit} disabled={isBusy}>
                              Cancel
                            </Button>
                            <Button
                              size="sm"
                              className="h-6 text-xs"
                              disabled={!editContent.trim() || isBusy}
                              onClick={() => saveEdit(reply.id)}
                            >
                              {isBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Save'}
                            </Button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-foreground leading-relaxed mt-0.5">{reply.content}</p>
                    )}
                  </div>
                  {reply.is_own && !isEditing && (
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <button
                        onClick={() => startEdit(reply)}
                        disabled={isBusy}
                        className="p-0.5 rounded text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                        aria-label="Edit reply"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        onClick={() => handleDelete(reply.id)}
                        disabled={isBusy}
                        className="p-0.5 rounded text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
                        aria-label="Delete reply"
                      >
                        {isBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}

          {/* Reply form */}
          {showForm && (
            <div className="mt-2 space-y-1.5">
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Write a reply…"
                className="resize-none text-xs min-h-[60px]"
                maxLength={280}
                autoFocus
              />
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground">{content.length}/280</span>
                <div className="flex gap-1.5">
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setShowForm(false); setContent(''); }}>
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    className="h-7 text-xs"
                    disabled={!content.trim() || postReply.isPending}
                    onClick={() => postReply.mutate()}
                  >
                    {postReply.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Post'}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Thesis card ──────────────────────────────────────────────────────────────

interface ThesisCardProps {
  thesis: Thesis;
  onDelete: (id: string) => void;
  onEdit: (thesis: Thesis) => void;
  isDeleting: boolean;
}

function ThesisCard({ thesis, onDelete, onEdit, isDeleting }: ThesisCardProps) {
  const displayName = thesis.full_name || thesis.username || 'Anonymous';
  const profileHref = `/users/${encodeURIComponent(thesis.username ?? thesis.user_id)}`;

  return (
    <div className={cn('rounded-xl border border-border bg-card px-4 py-3 space-y-1', thesis.is_own && 'border-primary/20 bg-primary/5')}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Link href={profileHref} className="shrink-0 hover:opacity-80 transition-opacity">
            <UserAvatar avatarUrl={thesis.avatar_url} displayName={displayName} size={28} />
          </Link>
          <div className="flex items-center gap-2 flex-wrap">
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

      <ThesisReplies thesisId={thesis.id} replyCount={thesis.reply_count} />
    </div>
  );
}

// ─── Main section ─────────────────────────────────────────────────────────────

export function ThesisSection({ symbol }: { symbol: string }) {
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

      {/* Post / Edit form */}
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
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)
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
