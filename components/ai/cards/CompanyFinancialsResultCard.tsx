'use client';

import { CardShell, StatCell } from './CardPrimitives';

export type CompanyFinancialsRow = Record<string, string> & { period: string };

function detectFinancialType(row: CompanyFinancialsRow): 'income' | 'balance' | 'cashflow' | null {
  if ('revenue' in row) return 'income';
  if ('totalAssets' in row) return 'balance';
  if ('operatingCashFlow' in row) return 'cashflow';
  return null;
}

export function CompanyFinancialsResultCard({ output }: { output: CompanyFinancialsRow[] }) {
  const row = output[0];
  if (!row) return null;
  const type = detectFinancialType(row);
  if (!type) return null;

  const fields: Record<typeof type, Array<{ key: string; label: string }>> = {
    income: [
      { key: 'revenue', label: 'Revenue' },
      { key: 'netIncome', label: 'Net Income' },
      { key: 'epsDiluted', label: 'EPS (diluted)' },
    ],
    balance: [
      { key: 'totalAssets', label: 'Total Assets' },
      { key: 'totalLiabilities', label: 'Total Liabilities' },
      { key: 'equity', label: 'Equity' },
    ],
    cashflow: [
      { key: 'operatingCashFlow', label: 'Operating CF' },
      { key: 'freeCashFlow', label: 'Free Cash Flow' },
      { key: 'capitalExpenditures', label: 'CapEx' },
    ],
  };

  return (
    <CardShell>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="font-semibold text-foreground capitalize">{type} statement</span>
        <span className="text-[11px] text-muted-foreground">{row.period}</span>
      </div>
      <div className="grid grid-cols-3 gap-x-3 gap-y-2.5">
        {fields[type].map((f) => (
          <StatCell key={f.key} label={f.label} value={row[f.key] ?? '—'} />
        ))}
      </div>
    </CardShell>
  );
}
