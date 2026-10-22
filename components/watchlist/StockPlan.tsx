'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ClampedText } from '@/components/ui/ClampedText';
import { CreateAlertForm } from '@/components/alerts/CreateAlertForm';
import { useAlerts } from '@/hooks/use-alerts';
import { useIntlLocale } from '@/hooks/use-intl-locale';
import { slugToAssetPath } from '@/lib/assets/asset-type';
import { cn } from '@/lib/utils';
import type { UserAlert } from '@/types/alerts';

/**
 * In the currency the price is quoted in. A ticker's watchlist quote is always
 * USD (the quote path rejects non-USD listings), but a pair is priced in its
 * second half: EUR/NOK in krone. Sub-dollar coins keep enough digits to move.
 */
export function formatQuotePrice(p: number, symbol: string, locale: string) {
  const currency = symbol.includes('/') ? symbol.split('/')[1] : 'USD';
  const digits = { minimumFractionDigits: 2, maximumFractionDigits: p < 1 ? 6 : 2 };
  try {
    // narrowSymbol: "$", not "US$" in some locales; "kr" for NOK.
    return p.toLocaleString(locale, { style: 'currency', currency, currencyDisplay: 'narrowSymbol', ...digits });
  } catch {
    // Not an ISO currency code (a coin quoted in another coin, ETH/BTC).
    return `${p.toLocaleString(locale, digits)} ${currency}`;
  }
}

/**
 * The buy-below price is the user's own price_below alert, not a second
 * number to keep in sync: setting one is creating the alert. With several,
 * the highest is the one the price reaches first.
 */
export function buyBelowAlert(alerts: UserAlert[] | undefined, symbol: string): UserAlert | null {
  let best: UserAlert | null = null;
  for (const a of alerts ?? []) {
    if (a.alertType === 'price_below' && a.isActive && a.symbol.toUpperCase() === symbol.toUpperCase() && (!best || a.threshold > best.threshold)) best = a;
  }
  return best;
}

/** Where today's price sits between the 52-week low and high. Neutral ink: position, not gain or loss. */
export function RangeBar({ low, high, price, label, className }: {
  low: number | null | undefined; high: number | null | undefined; price: number | null | undefined; label: string; className?: string;
}) {
  if (low == null || high == null || price == null || !(high > low)) return null;
  const pos = Math.min(1, Math.max(0, (price - low) / (high - low)));
  return (
    <div role="img" aria-label={label} className={cn('relative h-1.5 rounded-full bg-muted', className)}>
      <span
        className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground ring-2 ring-background"
        style={{ left: `${pos * 100}%` }}
      />
    </div>
  );
}

interface StockPlanDialogProps {
  symbol: string;
  companyName: string;
  price: number | null;
  week52Low: number | null;
  week52High: number | null;
  thesisText: string | null;
  thesisSentiment: 'bull' | 'bear' | 'neutral' | null;
  trigger: React.ReactNode;
}

const THESIS_KEY = { bull: 'watchlistThesisBull', bear: 'watchlistThesisBear', neutral: 'watchlistThesisNeutral' } as const;

/**
 * A plan for one watched stock: why you're watching (your own thesis), the
 * price you'd buy at (a price_below alert), and where it sits in its 52-week
 * range. Turns "watching" into something you can act on.
 */
export function StockPlanDialog({ symbol, companyName, price, week52Low, week52High, thesisText, thesisSentiment, trigger }: StockPlanDialogProps) {
  const { t } = useTranslation('watchlist');
  const locale = useIntlLocale();
  const { alerts, create, remove } = useAlerts();
  const [composerOpen, setComposerOpen] = useState(false);
  const [removing, setRemoving] = useState(false);

  const alert = buyBelowAlert(alerts, symbol);
  const fmt = (p: number) => formatQuotePrice(p, symbol, locale);
  const thesisHref = `${slugToAssetPath(symbol)}#nav-community`;
  const rangePct = price != null && week52Low != null && week52High != null && week52High > week52Low
    ? Math.round(Math.min(1, Math.max(0, (price - week52Low) / (week52High - week52Low))) * 100)
    : null;

  return (
    <Dialog onOpenChange={(open) => { if (!open) setComposerOpen(false); }}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">{t('planTitle', { symbol })}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-5">
          <section className="flex flex-col gap-1.5">
            <h3 className="text-xs font-medium text-muted-foreground">
              {t('planThesisLabel')}
              {thesisSentiment && <span className="ml-1.5 text-foreground">· {t(THESIS_KEY[thesisSentiment])}</span>}
            </h3>
            {thesisText ? (
              <ClampedText lines={4} textClassName="text-sm text-foreground">{thesisText}</ClampedText>
            ) : (
              <p className="text-sm text-muted-foreground">{t('planThesisEmpty')}</p>
            )}
            <Link href={thesisHref} className="w-fit text-xs font-medium text-primary hover:text-primary/80">
              {thesisText ? t('planThesisEdit') : t('planThesisWrite')}
            </Link>
          </section>

          <section className="flex flex-col gap-1.5">
            <h3 className="text-xs font-medium text-muted-foreground">{t('planBuyBelowLabel')}</h3>
            {alert ? (
              <div className="flex items-center gap-3 rounded-lg bg-muted/40 px-3 py-2">
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="text-sm font-semibold tabular-nums text-foreground">{fmt(alert.threshold)}</span>
                  {price != null && (
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {price <= alert.threshold
                        ? t('planBuyBelowReached')
                        : t('planBuyBelowDistance', { pct: ((price / alert.threshold - 1) * 100).toFixed(1) })}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  disabled={removing}
                  onClick={async () => { setRemoving(true); try { await remove(alert.id); } finally { setRemoving(false); } }}
                  className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                  aria-label={t('planBuyBelowRemove')}
                  title={t('planBuyBelowRemove')}
                >
                  {removing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                </button>
              </div>
            ) : composerOpen ? (
              <CreateAlertForm
                initialTicker={{ ticker: symbol, name: companyName }}
                initialAlertType="price_below"
                onCreate={create}
                onCreated={() => setComposerOpen(false)}
                onCancel={() => setComposerOpen(false)}
              />
            ) : (
              <>
                <p className="text-sm text-muted-foreground">{t('planBuyBelowHelp')}</p>
                <Button variant="outline" size="sm" className="w-fit gap-2" onClick={() => setComposerOpen(true)}>
                  <Plus className="h-3.5 w-3.5" />
                  {t('planBuyBelowSet')}
                </Button>
              </>
            )}
          </section>

          {rangePct != null && (
            <section className="flex flex-col gap-2">
              <h3 className="text-xs font-medium text-muted-foreground">{t('planRangeLabel')}</h3>
              <RangeBar low={week52Low} high={week52High} price={price} label={t('planRangeAria', { low: fmt(week52Low!), high: fmt(week52High!), price: fmt(price!) })} />
              <div className="flex justify-between text-xs tabular-nums text-muted-foreground">
                <span>{fmt(week52Low!)}</span>
                <span>{fmt(week52High!)}</span>
              </div>
              <p className="text-xs text-muted-foreground">{t('planRangeCaption', { pct: rangePct })}</p>
            </section>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
