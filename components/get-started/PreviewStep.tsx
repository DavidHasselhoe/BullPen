'use client';

import { useQuery } from '@tanstack/react-query';
import { CompanyLogo } from '@/components/company/CompanyLogo';
import { STARTER_STOCKS } from '@/lib/onboarding/starter-stocks';
import type { AlertChoices, StockPick } from '@/lib/onboarding/pending-onboarding';
import { GetStartedSignupForm } from './GetStartedSignupForm';
import { StepHeadline, StepShell } from './StepShell';

interface Quote { price: number; change: number; changePercent: number; stale?: boolean }

const EXAMPLE_TICKERS = ['NVDA', 'AAPL', 'SPY'];
const ALERT_WORDS: Record<keyof AlertChoices, string> = {
  price_alerts: 'big price moves',
  upcoming_earnings: 'earnings',
  dividend_reminder: 'dividend dates',
};

function alertsSentence(alerts: AlertChoices): string {
  const on = (Object.keys(alerts) as (keyof AlertChoices)[]).filter((k) => alerts[k]).map((k) => ALERT_WORDS[k]);
  if (on.length === 0) return 'Alerts are off. You can turn them on anytime in Settings.';
  const list = on.length === 1 ? on[0] : `${on.slice(0, -1).join(', ')} and ${on[on.length - 1]}`;
  return `We'll email you about ${list} for these stocks.`;
}

export function PreviewStep({
  picks,
  alerts,
  stepIndex,
  totalSteps,
  onBack,
}: {
  picks: StockPick[];
  alerts: AlertChoices;
  stepIndex: number;
  totalSteps: number;
  onBack: () => void;
}) {
  const isExample = picks.length === 0;
  const shown: StockPick[] = isExample
    ? STARTER_STOCKS.filter((s) => EXAMPLE_TICKERS.includes(s.ticker))
    : picks.slice(0, 6);
  const tickers = shown.map((s) => s.ticker);

  const { data: quotes } = useQuery({
    queryKey: ['onboarding-preview-quotes', tickers],
    queryFn: async (): Promise<Record<string, Quote>> => {
      const res = await fetch('/api/quotes/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols: tickers }),
      });
      if (!res.ok) return {};
      return (await res.json()).quotes ?? {};
    },
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const { data: scores } = useQuery({
    queryKey: ['onboarding-preview-scores', tickers],
    queryFn: async (): Promise<Record<string, { score: number; grade: string }>> => {
      const res = await fetch(`/api/onboarding/health-scores?symbols=${encodeURIComponent(tickers.join(','))}`);
      if (!res.ok) return {};
      return (await res.json()).scores ?? {};
    },
    staleTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const lead = shown[0];

  return (
    <StepShell stepIndex={stepIndex} totalSteps={totalSteps} onBack={onBack} maxWidth={560}>
      <StepHeadline text="Your BullPen is" accent="ready." />

      {isExample && (
        <p style={{ margin: '0 0 12px', textAlign: 'center', fontSize: 12, color: 'var(--fg-dim)' }}>Examples</p>
      )}

      <ul style={{ listStyle: 'none', margin: '20px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {shown.map((s) => {
          const q = quotes?.[s.ticker];
          const hs = scores?.[s.ticker];
          const up = (q?.changePercent ?? 0) >= 0;
          return (
            <li
              key={s.ticker}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 12,
                border: '1px solid var(--border)', background: 'var(--surface)',
              }}
            >
              <CompanyLogo name={s.name} ticker={s.ticker} size={28} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span className="mono" style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--fg)' }}>{s.ticker}</span>
                <span style={{ display: 'block', fontSize: 12, color: 'var(--fg-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {s.name}{hs ? ` · Health ${hs.score} (${hs.grade})` : ''}
                </span>
              </span>
              {q ? (
                <span style={{ textAlign: 'right' }}>
                  <span className="mono" style={{ display: 'block', fontSize: 14, color: 'var(--fg)' }}>${q.price.toFixed(2)}</span>
                  <span className={`mono ${up ? 'up' : 'down'}`} style={{ display: 'block', fontSize: 12 }}>
                    {up ? '▲ +' : '▼ −'}{Math.abs(q.changePercent).toFixed(2)}%{q.stale ? ' last close' : ''}
                  </span>
                </span>
              ) : (
                <span aria-hidden className="mono" style={{ fontSize: 12, color: 'var(--fg-dim)' }}>···</span>
              )}
            </li>
          );
        })}
      </ul>

      <p style={{ margin: '14px 0 0', textAlign: 'center', fontSize: 14, color: 'var(--fg-muted)' }}>
        {alertsSentence(alerts)}
      </p>

      {lead && (
        <div style={{ marginTop: 20, padding: '14px 18px', borderRadius: 14, border: '1px solid var(--border-strong)' }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--fg)' }}>With Pro, for {lead.ticker}:</p>
          <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 13, color: 'var(--fg-muted)', lineHeight: 1.7 }}>
            <li>Why Today? explains what moved it, the day it moves</li>
            <li>A Deep Dive report on the business, in plain language</li>
            <li>A Daily Brief every morning covering your stocks</li>
          </ul>
        </div>
      )}

      <GetStartedSignupForm />
    </StepShell>
  );
}
