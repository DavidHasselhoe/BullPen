'use client';

import { useTranslation } from 'react-i18next';
import { CardShell, StatCell } from './CardPrimitives';

export interface CompanyProfileOutput {
  ticker: string;
  name: string;
  sector: string | null;
  industry: string | null;
  description: string | null;
  /** Only present from getLiveCompanyProfile (TwelveData) — absent from the Supabase-backed getCompanyProfile. */
  ceo?: string | null;
  employees?: number | null;
  headquarters?: string | null;
}

export function CompanyProfileResultCard({ output }: { output: CompanyProfileOutput }) {
  const { t } = useTranslation('ai');
  return (
    <CardShell>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="font-semibold text-foreground">{output.name}</span>
        <span className="shrink-0 text-[11px] text-muted-foreground">{output.ticker}</span>
      </div>
      {(output.sector || output.industry) && (
        <div className="mb-1.5 flex flex-wrap gap-1.5">
          {output.sector && (
            <span className="rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground">{output.sector}</span>
          )}
          {output.industry && (
            <span className="rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-[11px] text-muted-foreground">{output.industry}</span>
          )}
        </div>
      )}
      {(output.ceo || output.employees != null || output.headquarters) && (
        <div className="mb-1.5 grid grid-cols-3 gap-x-3 gap-y-1.5">
          {output.ceo && <StatCell label={t('profileCeoLabel')} value={output.ceo} />}
          {output.employees != null && <StatCell label={t('profileEmployeesLabel')} value={output.employees.toLocaleString()} />}
          {output.headquarters && <StatCell label={t('profileHqLabel')} value={output.headquarters} />}
        </div>
      )}
      {output.description && (
        <p className="line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">{output.description}</p>
      )}
    </CardShell>
  );
}
