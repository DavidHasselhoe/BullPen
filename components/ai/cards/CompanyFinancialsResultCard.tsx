'use client';

import { useTranslation } from 'react-i18next';
import { CardShell, StatCell } from './CardPrimitives';

export type CompanyFinancialsRow = Record<string, string> & { period: string };

function detectFinancialType(row: CompanyFinancialsRow): 'income' | 'balance' | 'cashflow' | null {
  if ('revenue' in row) return 'income';
  if ('totalAssets' in row) return 'balance';
  if ('operatingCashFlow' in row) return 'cashflow';
  return null;
}

export function CompanyFinancialsResultCard({ output }: { output: CompanyFinancialsRow[] }) {
  const { t } = useTranslation('ai');
  const row = output[0];
  if (!row) return null;
  const type = detectFinancialType(row);
  if (!type) return null;

  const statementLabels: Record<typeof type, string> = {
    income: t('financialsIncomeStatement'),
    balance: t('financialsBalanceStatement'),
    cashflow: t('financialsCashflowStatement'),
  };

  const fields: Record<typeof type, Array<{ key: string; label: string }>> = {
    income: [
      { key: 'revenue', label: t('financialsRevenue') },
      { key: 'netIncome', label: t('financialsNetIncome') },
      { key: 'epsDiluted', label: t('financialsEpsDiluted') },
    ],
    balance: [
      { key: 'totalAssets', label: t('financialsTotalAssets') },
      { key: 'totalLiabilities', label: t('financialsTotalLiabilities') },
      { key: 'equity', label: t('financialsEquity') },
    ],
    cashflow: [
      { key: 'operatingCashFlow', label: t('financialsOperatingCf') },
      { key: 'freeCashFlow', label: t('financialsFreeCashFlow') },
      { key: 'capitalExpenditures', label: t('financialsCapex') },
    ],
  };

  return (
    <CardShell>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="font-semibold text-foreground">{statementLabels[type]}</span>
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
