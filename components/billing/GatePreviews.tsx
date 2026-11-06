'use client';

import { useTranslation } from 'react-i18next';
import { PreviewCard, PreviewRow } from './PreviewShapes';

/*
 * Signed-out previews for the AuthGate pages, in HoldingsPreview's language:
 * each page's real layout with every value as a grey shape. No sample
 * tickers or prices (see PreviewShapes.tsx for why).
 */

const BAR = 'rounded-full bg-muted-foreground/20';

/** Watchlist: the list name, the today strip, ticker rows. */
export function WatchlistPreview() {
  const { t } = useTranslation('watchlist');
  return (
    <PreviewCard>
      <div className="flex items-center justify-between gap-4">
        <div className={`h-5 w-28 ${BAR}`} />
        <div className={`h-3 w-12 ${BAR}`} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        {[t('scorecardToday'), t('scorecardBestWorst')].map((label) => (
          <div key={label} className="rounded-lg border border-border/60 p-2.5">
            {/* clamp-ok: fixed one-line stat label inside a decorative preview */}
            <p className="truncate text-[11px] text-muted-foreground">{label}</p>
            <div className={`mt-1.5 h-3.5 w-14 ${BAR}`} />
          </div>
        ))}
      </div>

      <div className="mt-4 space-y-3">
        {[0.32, 0.26, 0.36, 0.28].map((w) => <PreviewRow key={w} width={w} />)}
      </div>
    </PreviewCard>
  );
}

/** Price Alerts: "Your alerts", then one card per stock with its conditions. */
export function AlertsPreview() {
  const { t } = useTranslation('alerts');
  return (
    <PreviewCard>
      <p className="text-xs text-muted-foreground">{t('sectionTitle')}</p>
      <div className="mt-2 space-y-2.5">
        {[[0.55, 0.4], [0.5]].map((conditions, i) => (
          <div key={i} className="overflow-hidden rounded-xl border border-border/60">
            <div className="flex items-center gap-2.5 border-b border-border/40 bg-muted/30 px-3 py-2.5">
              <div className="h-6 w-6 shrink-0 rounded-md bg-muted-foreground/20" />
              <div className={`h-2.5 w-24 ${BAR}`} />
              <div className={`ml-auto h-2 w-14 ${BAR}`} />
            </div>
            {conditions.map((w) => (
              <div key={w} className="flex items-center gap-2.5 px-3 py-2">
                <div className="h-2 w-2 shrink-0 rounded-full bg-muted-foreground/30" />
                <div className={`h-2.5 ${BAR}`} style={{ width: `${w * 100}%` }} />
                <div className={`ml-auto h-2 w-10 ${BAR}`} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </PreviewCard>
  );
}

/** Notifications: grouped by day, an icon tile and two lines per item. */
export function NotificationsPreview() {
  const { t } = useTranslation('navigation');
  const groups: [string, number[]][] = [[t('notifGroupToday'), [0.7, 0.55]], [t('notifGroupYesterday'), [0.6]]];
  return (
    <PreviewCard>
      {groups.map(([label, rows], gi) => (
        <div key={label} className={gi > 0 ? 'mt-4' : ''}>
          <p className="text-xs text-muted-foreground">{label}</p>
          <div className="mt-2 space-y-3">
            {rows.map((w) => (
              <div key={w} className="flex items-start gap-3">
                <div className="h-8 w-8 shrink-0 rounded-lg bg-muted-foreground/20" />
                <div className="flex-1 space-y-1.5 pt-1">
                  <div className={`h-2.5 ${BAR}`} style={{ width: `${w * 100}%` }} />
                  <div className={`h-2 w-full ${BAR} opacity-70`} />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </PreviewCard>
  );
}
