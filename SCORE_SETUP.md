# BullPen Composite Score v1 - Setup Complete ✅

## What's Been Built

A deterministic composite score system that aggregates multiple signals into a single explainable 0-100 score per filing.

### 📁 File Structure

```
BullPen/
├── lib/scores/
│   ├── README.md                # Comprehensive documentation
│   ├── composite-score.ts       # Core calculation logic
│   ├── scores-db.ts             # Database operations (optional storage)
│   └── scores-orchestrator.ts   # Coordinates calculation workflow
├── scripts/
│   └── test-composite-score.ts  # CLI test tool
└── SCORE_SETUP.md               # This file
```

## 🎯 Features Implemented

✅ **Deterministic Calculation** - Pure mathematical aggregation  
✅ **0-100 Score Range** - Neutral baseline at 50  
✅ **Direction Mapping** - 0-39 bearish, 40-59 neutral, 60-100 bullish  
✅ **Explainable** - All signal contributions tracked  
✅ **Optional Storage** - Can cache in `filings.metadata` JSONB  
✅ **Reproducible** - Same signals → same score  
✅ **No Schema Changes** - Uses existing tables  

## 📊 Score Calculation

### Rules

1. **Baseline**: 50 (neutral starting point)
2. **Bullish Signals**: Increase score (full impact)
3. **Bearish Signals**: Decrease score (full impact)
4. **Neutral Signals**: Minimal impact (0.1x multiplier)
5. **Capping**: Final score clamped to 0-100

### Example

**Signals**:
- Risk Alert (bearish, 72) → -31.68
- Financial Strength (bullish, 75) → +37.50
- Controls (neutral, 40) → -0.80

**Calculation**:
```
50 (baseline)
+ 37.50 (bullish)
- 31.68 (bearish)
- 0.80 (neutral)
= 55.02 → capped to 55
```

**Result**: Score 55 (neutral) - bullish financial strength partially offset by bearish risk alert.

## 🚀 Quick Start

### Prerequisites

Ensure you have:
1. ✅ Ingested a filing (`npm run test-ingest:latest`)
2. ✅ Generated AI insights (`npm run test-ai`)
3. ✅ Generated signals (`npm run test-signals`)

### Calculate Composite Score

```bash
npm run test-score
```

Expected output:
```
✅ Composite Score calculated successfully!

Composite Score:
  Score:      55/100 ➡️
  Direction:  neutral
  Explanation: Composite score of 55 indicates a neutral posture, with 1 bullish and 2 bearish signals balancing each other.

Calculation Details:
  Baseline:              50
  Bullish Contribution:  +37.50
  Bearish Contribution:  -31.68
  Neutral Contribution:  -0.80
  Raw Score:             55.02
  Capped Score:          55

Contributing Signals (3):
  1. 📈 growth_opportunity (bullish)
     Strength: 75/100
     Contribution: +37.50
  2. 📉 risk_alert (bearish)
     Strength: 72/100
     Contribution: -31.68
  ...
```

## 📖 Usage Examples

### Programmatic Usage

```typescript
import { calculateFilingCompositeScore } from '@/lib/scores/scores-orchestrator';

// Calculate and store
const result = await calculateFilingCompositeScore(filingId, {
  useStored: false,
  storeResult: true,
});

if (result.success && result.score) {
  console.log(`Score: ${result.score.composite_score}/100`);
  console.log(`Direction: ${result.score.direction}`);
  console.log(`Explanation: ${result.score.explanation}`);
  
  // See which signals contributed
  result.score.contributing_signals.forEach(signal => {
    console.log(`${signal.signal_type}: ${signal.contribution}`);
  });
}
```

### Use Stored Score

```typescript
// Return cached score if available
const result = await calculateFilingCompositeScore(filingId, {
  useStored: true,  // Use stored if available
  storeResult: false,
});
```

## 🗄️ Storage Approach

**Decision**: Compute-on-demand with optional storage

**Storage Location**: `filings.metadata.composite_score` (JSONB)

**Why This Approach**:
- ✅ No schema changes required
- ✅ Scores are deterministic (always recalculatable)
- ✅ Flexible for future enhancements
- ✅ Can query via SQL

## 📊 SQL Verification

### Query Stored Score

```sql
SELECT 
  f.accession_number,
  c.ticker,
  f.metadata->'composite_score'->>'composite_score' as score,
  f.metadata->'composite_score'->>'direction' as direction,
  f.metadata->'composite_score'->>'explanation' as explanation
FROM filings f
JOIN companies c ON c.id = f.company_id
WHERE f.id = 'your-filing-id';
```

### Query All Scores

```sql
SELECT 
  c.ticker,
  f.filing_type,
  f.filing_date,
  f.metadata->'composite_score'->>'composite_score' as score,
  f.metadata->'composite_score'->>'direction' as direction
FROM filings f
JOIN companies c ON c.id = f.company_id
WHERE f.metadata->'composite_score' IS NOT NULL
ORDER BY f.filing_date DESC;
```

### Verify Calculation

```sql
-- Get signals and manually verify calculation
SELECT 
  s.signal_type,
  s.direction,
  s.strength,
  s.title
FROM signals s
WHERE s.filing_id = 'your-filing-id'
  AND s.is_active = true
ORDER BY s.strength DESC;
```

## 🎨 Score Interpretation

### Direction Ranges

- **0-39**: Bearish 📉 (negative outlook)
- **40-59**: Neutral ➡️ (balanced/mixed)
- **60-100**: Bullish 📈 (positive outlook)

### Example Scores

**Score 25 (Bearish)**:
- Multiple strong bearish signals
- Risk alerts, legal pressure
- Financial weakness indicators

**Score 55 (Neutral)**:
- Mixed signals balancing out
- Some bullish, some bearish
- Overall neutral posture

**Score 85 (Bullish)**:
- Strong bullish signals
- Financial strength
- Growth opportunities
- Minimal risks

## 🔍 Explainability

Every score includes:

1. **Explanation**: Plain English summary
2. **Contributing Signals**: List of all signals used
3. **Calculation Details**: Exact math breakdown
4. **Evidence**: Stored in signal evidence fields

Example explanation:
> "Composite score of 55 indicates a neutral posture, with 1 bullish and 2 bearish signals balancing each other."

## ⚙️ Configuration

Calculation parameters (in `composite-score.ts`):

```typescript
const NEUTRAL_BASELINE = 50;
const NEUTRAL_MULTIPLIER = 0.1;  // Neutral signals minimal impact
const BULLISH_MULTIPLIER = 1.0;   // Full impact
const BEARISH_MULTIPLIER = 1.0;   // Full impact
```

## 🐛 Troubleshooting

### Error: "No active signals found"

**Solution**: Generate signals first:
```bash
npm run test-signals
```

### Score Seems Wrong

**Check calculation**:
```typescript
console.log(result.score.calculation_details);
console.log(result.score.contributing_signals);
```

This shows exactly how the score was calculated.

### Stored Score Outdated

**Recalculate**:
```typescript
await calculateFilingCompositeScore(filingId, {
  useStored: false,  // Force recalculation
  storeResult: true, // Update stored
});
```

## ✅ Success Criteria Met

✅ **Score range 0-100** - Implemented  
✅ **Neutral baseline 50** - Implemented  
✅ **Direction mapping** - 0-39 bearish, 40-59 neutral, 60-100 bullish  
✅ **Explainable** - Explanation + contributing signals  
✅ **Deterministic** - Same signals → same score  
✅ **No AI/ML** - Pure mathematical aggregation  
✅ **Storage** - Optional in `filings.metadata`  
✅ **SQL verifiable** - Can query stored scores  

## 📈 Next Steps

With composite scores working, you can:

1. **Query scores** via SQL or API
2. **Compare scores** across filings
3. **Track trends** over time
4. **Build dashboards** showing scores
5. **Set alerts** on score changes (future)

---

**Status**: ✅ v1 complete - deterministic score calculation  
**Storage**: Optional (filings.metadata JSONB)  
**Next**: Run `npm run test-score` to calculate Apple's score
