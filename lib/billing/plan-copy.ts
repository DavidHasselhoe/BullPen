import { PLAN_COMPARISON } from './entitlements';

/**
 * Translation keys for the plan comparison, which is written in English in
 * entitlements.ts (the single source the page, the success modal and the
 * quotas share). Each string maps to a stable key derived from its English,
 * and callers look it up with the English as the fallback, so a reworded row
 * shows in English until it is translated rather than disappearing.
 */
export type PlanCopyKind = 'group' | 'row' | 'hint' | 'value';

export function planCopyKey(kind: PlanCopyKind, english: string): string {
  return `plan_${kind}_` + english.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

/** Every comparison string as key -> English, for the en locale file. */
export function planCopyEnglish(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const group of PLAN_COMPARISON) {
    out[planCopyKey('group', group.title)] = group.title;
    for (const row of group.rows) {
      out[planCopyKey('row', row.label)] = row.label;
      if (row.hint) out[planCopyKey('hint', row.hint)] = row.hint;
      for (const v of [row.free, row.pro]) if (typeof v === 'string') out[planCopyKey('value', v)] = v;
    }
  }
  return out;
}
