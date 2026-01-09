# BullPen Composite Score v1

Deterministic aggregation of signals into a single explainable score per filing.

## Overview

The composite score provides a clear overall posture (bullish/neutral/bearish) by aggregating all active signals for a filing into a single 0-100 score.

## Architecture

```
signals (input)
  ↓
composite-score.ts (deterministic calculation)
  ↓
CompositeScore (structured result)
  ↓
scores-db.ts (optional storage in filings.metadata)
  ↓
filings.metadata (JSONB storage)
```

## Score Calculation Rules

### Baseline
- **Neutral baseline**: 50
- All scores start from this midpoint

### Signal Contributions

**Bullish Signals**:
- Increase score proportionally to strength
- Full impact (1.0x multiplier)
- Formula: `contribution = (strength - 50) / 50 * strength`

**Bearish Signals**:
- Decrease score proportionally to strength
- Full impact (1.0x multiplier)
- Formula: `contribution = (strength - 50) / 50 * strength` (negative)

**Neutral Signals**:
- Minimal impact (0.1x multiplier)
- Formula: `contribution = (strength - 50) / 50 * strength * 0.1`

### Final Score
```
raw_score = baseline + bullish_contributions - bearish_contributions + neutral_contributions
capped_score = max(0, min(100, raw_score))
```

### Direction Mapping
- **0-39**: Bearish 📉
- **40-59**: Neutral ➡️
- **60-100**: Bullish 📈

## Storage Approach

**Decision**: Compute-on-demand with optional storage

**Rationale**:
- No schema changes required
- Scores are deterministic (can always recalculate)
- Storage is optional (can cache in `filings.metadata` JSONB)
- Flexible for future enhancements

**Storage Location**: `filings.metadata.composite_score` (JSONB field)

## Usage

### Calculate Score (Compute-on-Demand)

```typescript
import { calculateFilingCompositeScore } from '@/lib/scores/scores-orchestrator';

const result = await calculateFilingCompositeScore(filingId, {
  useStored: false,    // Always recalculate
  storeResult: true,   // Optionally store result
  onProgress: (step, details) => {
    console.log(`Progress: ${step}`, details);
  },
});

if (result.success && result.score) {
  console.log(`Score: ${result.score.composite_score}/100`);
  console.log(`Direction: ${result.score.direction}`);
  console.log(`Explanation: ${result.score.explanation}`);
}
```

### Use Stored Score

```typescript
const result = await calculateFilingCompositeScore(filingId, {
  useStored: true,     // Return stored if available
  storeResult: false,  // Don't store
});
```

### Via CLI

```bash
# Calculate and store composite score
npm run test-score

# Calculate for specific filing
npx tsx scripts/test-composite-score.ts <FILING_ID>
```

## Score Structure

```typescript
interface CompositeScore {
  composite_score: number;        // 0-100
  direction: 'bullish' | 'neutral' | 'bearish';
  explanation: string;             // 1-2 sentence summary
  contributing_signals: Array<{
    signal_id: string;
    signal_type: string;
    direction: SignalDirection;
    strength: number;
    contribution: number;          // How much this signal contributed
  }>;
  calculation_details: {
    baseline: number;
    bullish_contribution: number;
    bearish_contribution: number;
    neutral_contribution: number;
    raw_score: number;
    capped_score: number;
  };
}
```

## Example Calculation

**Input Signals**:
- Risk Alert (bearish, strength: 72) → Contribution: -31.68
- Financial Strength (bullish, strength: 75) → Contribution: +37.50
- Controls Stability (neutral, strength: 40) → Contribution: -0.80

**Calculation**:
```
baseline = 50
bullish_contribution = +37.50
bearish_contribution = -31.68
neutral_contribution = -0.80
raw_score = 50 + 37.50 - 31.68 - 0.80 = 55.02
capped_score = 55
direction = neutral (40-59 range)
```

**Result**: Score of 55 (neutral), driven by bullish financial strength partially offset by bearish risk alert.

## SQL Verification

### Query Stored Score

```sql
SELECT 
  f.accession_number,
  c.ticker,
  f.metadata->'composite_score'->>'composite_score' as score,
  f.metadata->'composite_score'->>'direction' as direction,
  f.metadata->'composite_score'->>'explanation' as explanation,
  f.metadata->'composite_score'->>'calculated_at' as calculated_at
FROM filings f
JOIN companies c ON c.id = f.company_id
WHERE f.id = 'filing-uuid';
```

### Query with Signals

```sql
SELECT 
  f.accession_number,
  c.ticker,
  f.metadata->'composite_score'->>'composite_score' as score,
  COUNT(s.id) as signal_count,
  COUNT(CASE WHEN s.direction = 'bullish' THEN 1 END) as bullish_count,
  COUNT(CASE WHEN s.direction = 'bearish' THEN 1 END) as bearish_count
FROM filings f
JOIN companies c ON c.id = f.company_id
LEFT JOIN signals s ON s.filing_id = f.id AND s.is_active = true
WHERE f.id = 'filing-uuid'
GROUP BY f.id, c.ticker, f.accession_number;
```

### Recalculate On-Demand (SQL Function)

```sql
-- This would require a PostgreSQL function, but for now use the TypeScript function
-- The score is always recalculatable from signals
```

## Determinism

**Same signals → Same score**

The calculation is:
- ✅ Pure function (no side effects)
- ✅ Deterministic (no randomness)
- ✅ Explainable (all contributions tracked)
- ✅ Reproducible (can re-run anytime)

## Performance

- **Calculation time**: <10ms (pure math)
- **Database reads**: 1 query for signals
- **Database writes**: 1 update if storing (optional)
- **Total time**: ~50-100ms

## Constraints

✅ **No AI calls** - Pure mathematical aggregation  
✅ **No ML** - Deterministic rules only  
✅ **No schema changes** - Uses existing `filings.metadata`  
✅ **Fully explainable** - All contributions tracked  
✅ **Reproducible** - Same signals → same score  

## Future Enhancements

Potential improvements (not yet implemented):
- [ ] Weighted signals (some signals more important)
- [ ] Time-decay (older signals less weight)
- [ ] Sector-specific baselines
- [ ] Historical comparison (score trends)
- [ ] Dedicated `filing_scores` table for better querying
- [ ] Score alerts (notify on significant changes)

## Troubleshooting

### No Signals Available

**Error**: "No active signals found"

**Solution**: Generate signals first:
```bash
npm run test-signals
```

### Score Seems Incorrect

**Check calculation details**:
```typescript
console.log(result.score.calculation_details);
console.log(result.score.contributing_signals);
```

The `contributing_signals` array shows exactly how each signal contributed.

### Stored Score Outdated

**Solution**: Recalculate with `useStored: false`:
```typescript
await calculateFilingCompositeScore(filingId, {
  useStored: false,
  storeResult: true, // Update stored score
});
```

---

**Status**: ✅ v1 complete - deterministic score calculation  
**Storage**: Optional (filings.metadata JSONB)  
**Next**: Test with Apple 10-K filing
