'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { Trans, useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { TrendingUp, TrendingDown, PlusCircle, XCircle, MessageCircle, CornerDownRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { slugToAssetPath } from '@/lib/assets/asset-type';
import { useProfileActivity } from '@/hooks/use-profile-activity';
import type { ActivityItem } from '@/app/api/users/[username]/activity/route';

const SENTIMENT_LABEL: Record<'bull' | 'bear' | 'neutral', string> = {
  bull: 'Bull',
  bear: 'Bear',
  neutral: 'Neutral',
};

const PREVIEW_LENGTH = 100;

function preview(content: string | undefined): string {
  if (!content) return '';
  return content.length > PREVIEW_LENGTH ? `${content.slice(0, PREVIEW_LENGTH)}…` : content;
}

function timeAgo(dateStr: string, t: TFunction): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return t('activityJustNow');
  if (m < 60) return t('activityMinsAgo', { m });
  const h = Math.floor(m / 60);
  if (h < 24) return t('activityHoursAgo', { h });
  return t('activityDaysAgo', { d: Math.floor(h / 24) });
}

function SymbolLink({ symbol }: { symbol: string }) {
  return (
    <Link href={slugToAssetPath(symbol)} className="font-semibold text-foreground hover:text-primary transition-colors">
      {symbol}
    </Link>
  );
}

function portfolioSentence(item: ActivityItem): { icon: ReactNode; text: ReactNode } {
  const pct = item.percent_change != null ? Math.round(item.percent_change) : null;
  const symbolLink = <SymbolLink symbol={item.symbol} />;

  switch (item.action) {
    case 'opened':
      return { icon: <PlusCircle className="h-4 w-4 text-emerald-500" />, text: <Trans i18nKey="activityOpened" ns="user" components={{ symbolLink }} /> };
    case 'increased':
      return { icon: <TrendingUp className="h-4 w-4 text-emerald-500" />, text: <Trans i18nKey="activityIncreased" ns="user" values={{ pct: pct ?? '—' }} components={{ symbolLink }} /> };
    case 'trimmed':
      return { icon: <TrendingDown className="h-4 w-4 text-red-500" />, text: <Trans i18nKey="activityTrimmed" ns="user" values={{ pct: pct ?? '—' }} components={{ symbolLink }} /> };
    case 'closed':
      return { icon: <XCircle className="h-4 w-4 text-red-500" />, text: <Trans i18nKey="activityClosed" ns="user" components={{ symbolLink }} /> };
    default:
      return { icon: null, text: null };
  }
}

function ActivityRow({ item }: { item: ActivityItem }) {
  const { t } = useTranslation('user');

  if (item.type === 'portfolio') {
    const { icon, text } = portfolioSentence(item);
    return (
      <div className="flex items-start gap-2.5 py-3 border-b border-border/50 last:border-0">
        <div className="mt-0.5 shrink-0">{icon}</div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-foreground">{text}</p>
          <span className="text-xs text-muted-foreground">{timeAgo(item.created_at, t)}</span>
        </div>
      </div>
    );
  }

  if (item.type === 'thesis') {
    return (
      <div className="flex items-start gap-2.5 py-3 border-b border-border/50 last:border-0">
        <MessageCircle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-foreground">
            <Trans
              i18nKey="activityThesisTake"
              ns="user"
              values={{ content: preview(item.content) }}
              components={{
                badge: (
                  <span className="text-xs font-medium px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
                    {SENTIMENT_LABEL[item.sentiment ?? 'neutral']}
                  </span>
                ),
                symbolLink: <SymbolLink symbol={item.symbol} />,
              }}
            />
          </p>
          <span className="text-xs text-muted-foreground">{timeAgo(item.created_at, t)}</span>
        </div>
      </div>
    );
  }

  // reply
  return (
    <div className="flex items-start gap-2.5 py-3 border-b border-border/50 last:border-0">
      <CornerDownRight className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-foreground">
          <Trans
            i18nKey="activityReplied"
            ns="user"
            values={{
              target: item.reply_to_username ? `@${item.reply_to_username}` : t('activityReplyFallbackTarget'),
              content: preview(item.content),
            }}
            components={{ symbolLink: <SymbolLink symbol={item.symbol} /> }}
          />
        </p>
        <span className="text-xs text-muted-foreground">{timeAgo(item.created_at, t)}</span>
      </div>
    </div>
  );
}

export function ActivityFeed({ username }: { username: string }) {
  const { t } = useTranslation('user');
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useProfileActivity(username);
  const items = data?.pages.flatMap((p) => p.items) ?? [];

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}
      </div>
    );
  }

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-6">{t('activityEmpty')}</p>;
  }

  return (
    <div>
      {items.map((item, i) => <ActivityRow key={`${item.type}-${item.created_at}-${i}`} item={item} />)}
      {hasNextPage && (
        <div className="pt-3 text-center">
          <Button variant="outline" size="sm" onClick={() => fetchNextPage()} disabled={isFetchingNextPage}>
            {isFetchingNextPage ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t('activityLoadMore')}
          </Button>
        </div>
      )}
    </div>
  );
}
