# BullPen Signal Generation v1

Deterministic, rule-based signal generation from AI insights.

## Overview

Signals are generated exclusively from `ai_insights` data using deterministic rules. No machine learning, no AI calls - pure rule-based logic.

## Architecture

```
ai_insights (input)
  ↓
signal-generator.ts (deterministic rules)
  ↓
GeneratedSignal (structured output)
  ↓
signals-db.ts (database operations)
  ↓
signals table (storage)
```

## Signal Rules (v1)

### 1. Risk Signal (`risk_alert`)
**Trigger**: Negative sentiment + risk flags present  
**Direction**: Bearish  
**Strength**: 40-90 (based on risk flag count and confidence)

- 1-2 flags: 40-50 (moderate)
- 3-4 flags: 60-70 (high)
- 5+ flags: 80-90 (very high)

### 2. Legal Pressure Signal (`legal_event`)
**Trigger**: Legal proceedings section with pressure keywords  
**Direction**: Bearish or Neutral  
**Strength**: 30-90 (based on keyword density)

Keywords: investigation, lawsuit, litigation, regulatory, enforcement, violation, penalty, settlement, complaint, proceeding

### 3. Financial Strength Signal (`growth_opportunity`)
**Trigger**: Financial statements section with trend indicators  
**Direction**: Bullish or Bearish  
**Strength**: 45-100 (based on positive/negative keyword ratio)

Positive keywords: growth, increase, improve, strong, profit, revenue, gain, positive, expansion  
Negative keywords: decline, decrease, loss, weak, debt, negative, reduction, deterioration

### 4. Controls Stability Signal (`risk_alert` or `other`)
**Trigger**: Controls section with quality indicators  
**Direction**: Neutral or Bearish  
**Strength**: 40-100

Positive keywords: effective, adequate, appropriate, sufficient, strong, maintained, compliant  
Negative keywords: deficiency, weakness, material, inadequate, ineffective, non-compliance, violation

## Signal Structure

```typescript
interface GeneratedSignal {
  signal_type: SignalType;
  direction: 'bullish' | 'neutral' | 'bearish';
  strength: number;              // 0-100
  title: string;
  description: string;            // 1-2 sentences
  evidence: Record<string, unknown>; // Explainable data
}
```

## Usage

### Generate Signals for a Filing

```typescript
import { generateSignalsForFiling } from '@/lib/signals/signals-orchestrator';

const result = await generateSignalsForFiling(filingId, {
  replaceExisting: true,
  onProgress: (step, details) => {
    console.log(`Progress: ${step}`, details);
  },
});

if (result.success) {
  console.log(`Created ${result.signalsCreated} signals`);
  console.log(`Bullish: ${result.details.summary.bullish}`);
  console.log(`Bearish: ${result.details.summary.bearish}`);
}
```

### Query Signals

```typescript
import { getFilingSignals } from '@/lib/signals/signals-db';

const result = await getFilingSignals(filingId);
if (result.success) {
  result.data.forEach(signal => {
    console.log(`${signal.direction}: ${signal.title}`);
    console.log(`Strength: ${signal.strength}/100`);
  });
}
```

### Via CLI

```bash
# Generate signals for latest filing with AI insights
npm run test-signals

# Generate for specific filing
npx tsx scripts/test-signals.ts <FILING_ID>
```

## Determinism

**Same inputs → Same outputs**

All rules are:
- ✅ Pure functions (no side effects)
- ✅ Deterministic (no randomness)
- ✅ Explainable (evidence stored)
- ✅ Reproducible (can re-run)

## Evidence Storage

Each signal includes `evidence` JSONB field with:
- Source sentiment
- Keyword counts
- Confidence scores
- Section types
- Summary previews

This makes signals fully explainable and auditable.

## Database Schema

Signals stored in `signals` table:

```sql
CREATE TABLE signals (
  id UUID PRIMARY KEY,
  company_id UUID REFERENCES companies(id),
  filing_id UUID REFERENCES filings(id),
  signal_type signal_type,
  direction signal_direction,
  strength INTEGER,              -- 0-100
  title VARCHAR(255),
  description TEXT,
  evidence JSONB,                -- Explainable data
  is_active BOOLEAN,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);
```

## Example Signals

### Risk Alert (Bearish)
```json
{
  "signal_type": "risk_alert",
  "direction": "bearish",
  "strength": 72,
  "title": "Risk Alert: 4 Risk Factors Identified",
  "description": "Negative sentiment with 4 explicit risks flagged in Item 1A. Risk Factors.",
  "evidence": {
    "sentiment": "negative",
    "risk_flags_count": 4,
    "risk_flags": ["Market competition", "Supply chain disruption", ...],
    "confidence": 0.89
  }
}
```

### Financial Strength (Bullish)
```json
{
  "signal_type": "growth_opportunity",
  "direction": "bullish",
  "strength": 75,
  "title": "Financial Strength Signal",
  "description": "Financial statements indicate positive trends with positive sentiment.",
  "evidence": {
    "sentiment": "positive",
    "positive_indicators": 6,
    "negative_indicators": 1,
    "confidence": 0.92
  }
}
```

## Re-running Signals

To regenerate signals:

```typescript
// Automatically deletes existing and generates new
await generateSignalsForFiling(filingId, {
  replaceExisting: true,
});
```

Or manually:

```typescript
import { deleteFilingSignals } from '@/lib/signals/signals-db';

await deleteFilingSignals(filingId);
await generateSignalsForFiling(filingId);
```

## Performance

- **Generation time**: <100ms per filing (deterministic rules)
- **Database writes**: Bulk insert, <50ms
- **Total time**: ~150ms per filing

## Constraints

✅ **No AI calls** - Pure rule-based logic  
✅ **No ML** - Deterministic keyword matching  
✅ **No schema changes** - Uses existing `signals` table  
✅ **Fully explainable** - Evidence stored with each signal  
✅ **Reproducible** - Same insights → same signals  

## Future Enhancements

Potential improvements (not yet implemented):
- [ ] Cross-filing comparison signals
- [ ] Trend signals (comparing across quarters)
- [ ] Custom rule configuration
- [ ] Signal expiration logic
- [ ] Signal aggregation and scoring
- [ ] Alert triggers based on signal strength

## Troubleshooting

### No Signals Generated

**Possible causes**:
1. No AI insights exist - Run `npm run test-ai` first
2. Insights don't match rule criteria - Check insight sentiment/content
3. All rules returned null - Normal if no conditions met

**Solution**: Check AI insights exist and have meaningful content.

### Signals Seem Incorrect

**Check evidence**:
```sql
SELECT 
  title,
  direction,
  strength,
  evidence
FROM signals
WHERE filing_id = '...';
```

The `evidence` field shows exactly why the signal was generated.

### Duplicate Signals

If `replaceExisting: false`, signals accumulate. Use `replaceExisting: true` to replace.

---

**Status**: ✅ v1 complete - deterministic rule-based signals  
**Next**: Test with Apple 10-K filing
