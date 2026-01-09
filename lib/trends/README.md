# Trend Detection v1 - Implementation Complete ✅

## Overview

Deterministic trend analysis system for time-series financial metrics. Analyzes metrics over recent periods to detect patterns like sustained growth, acceleration, volatility changes, and metric divergence.

## ✅ Features Implemented

### Trend Types

1. **Sustained Growth/Decline**
   - Detects when metric increases or decreases in ≥3 of last 4 periods
   - Calculates average growth/decline rate
   - Strength based on magnitude of change

2. **Acceleration/Deceleration**
   - Detects change in growth rate over time
   - Compares recent growth rates vs earlier growth rates
   - Identifies accelerating growth, accelerating decline, or deceleration

3. **Volatility Increase**
   - Detects significant increase in variance compared to prior periods
   - Calculates standard deviation of period changes
   - Requires ≥50% increase in volatility to trigger

4. **Divergence**
   - Detects related metrics moving in opposite directions
   - Analyzes pairs: net_income vs free_cash_flow, operating_income vs operating_cash_flow, revenue vs net_income
   - Requires opposite movement in ≥2 of last 3 periods

### Database Schema

```sql
CREATE TABLE trends (
  id UUID PRIMARY KEY,
  company_id UUID REFERENCES companies(id),
  metric_type VARCHAR(50),
  trend_type trend_type,  -- ENUM
  direction trend_direction,  -- ENUM: positive/negative/neutral
  strength INTEGER,  -- 0-100
  explanation TEXT,
  periods_analyzed INTEGER,
  metadata JSONB,  -- Values, deltas, calculations
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  UNIQUE (company_id, metric_type, trend_type)
);
```

## 📁 File Structure

```
lib/trends/
├── trend-detector.ts      # Core detection algorithms
├── trends-db.ts           # Database operations (CRUD)
├── trends-orchestrator.ts # Main orchestration logic
└── README.md              # This file

supabase/migrations/
└── 002_trends_table.sql   # Database migration

scripts/
└── test-trends.ts         # Test script
```

## 🚀 Usage

### 1. Apply Database Migration

First, apply the migration to create the `trends` table:

```bash
supabase db push
```

This applies `supabase/migrations/002_trends_table.sql`.

### 2. Run Trend Analysis

Analyze trends for a company:

```bash
npm run test-trends AAPL
```

Or programmatically:

```typescript
import { analyzeTrendsForCompany } from '@/lib/trends/trends-orchestrator';

const result = await analyzeTrendsForCompany(companyId, {
  replaceExisting: true,
  onProgress: (step, details) => {
    console.log(step, details);
  },
});

if (result.success) {
  console.log(`Created ${result.trendsCreated} trends`);
}
```

### 3. Query Trends

```typescript
import { getCompanyTrends, getCompanyMetricTrends } from '@/lib/trends/trends-db';

// Get all trends for a company
const trends = await getCompanyTrends(companyId);

// Get trends for specific metric
const revenueTrends = await getCompanyMetricTrends(companyId, 'revenue');
```

### 4. SQL Queries

```sql
-- Get all trends for Apple
SELECT 
  metric_type,
  trend_type,
  direction,
  strength,
  explanation,
  periods_analyzed
FROM trends
WHERE company_id = (
  SELECT id FROM companies WHERE ticker = 'AAPL'
)
ORDER BY strength DESC;

-- Get strongest positive trends
SELECT *
FROM trends
WHERE company_id = '...'
  AND direction = 'positive'
  AND strength >= 70
ORDER BY strength DESC;

-- Get volatility trends
SELECT *
FROM trends
WHERE company_id = '...'
  AND trend_type = 'volatility_increase'
ORDER BY strength DESC;
```

## 🔍 Algorithm Details

### Sustained Growth/Decline

- Analyzes last 4 periods
- Calculates period-over-period percentage change
- Requires ≥3 periods in same direction
- Strength = `min(100, max(40, avgGrowth * 5))`

### Acceleration/Deceleration

- Compares recent 2 periods vs earlier 2 periods
- Calculates average growth rate for each group
- Requires ≥2% change in growth rate
- Strength = `min(100, max(30, abs(changeInRate) * 10))`

### Volatility Increase

- Splits periods into earlier and recent halves
- Calculates standard deviation of period changes for each half
- Requires ≥50% increase in volatility
- Strength = `min(100, max(30, volatilityIncrease / 2))`

### Divergence

- Matches periods between two metrics
- Requires ≥2 of last 3 periods with opposite direction changes
- Strength based on magnitude of divergence

## 📊 Example Output

```
📈 Detected Trends:

REVENUE:
  📈 sustained_growth (positive)
     Strength: 75/100
     Periods analyzed: 4
     Explanation: Sustained growth: 4 of last 4 periods showed positive change, with average growth of 5.2%

NET_INCOME:
  📈 acceleration (positive)
     Strength: 68/100
     Periods analyzed: 6
     Explanation: Accelerating growth: Growth rate increased from 3.1% to 8.4%

OPERATING_CASH_FLOW:
  📉 volatility_increase (negative)
     Strength: 55/100
     Periods analyzed: 8
     Explanation: Volatility increase: Standard deviation of period changes increased by 120.5% (2.1% to 4.6%)

DIVERGENCE:
  ➡️ divergence (neutral)
     Strength: 62/100
     Periods analyzed: 3
     Explanation: Divergence detected: net_income and free_cash_flow moved in opposite directions in 2 of 2 recent periods
```

## 🎯 Deterministic & Reproducible

All algorithms are:
- ✅ Pure mathematical calculations
- ✅ No AI/ML dependencies
- ✅ Reproducible with same inputs
- ✅ Fully explainable via metadata JSONB
- ✅ Queryable via SQL

## 📝 Metadata Structure

Each trend includes full metadata for reproducibility:

```json
{
  "values": [100, 105, 110, 115],
  "period_end_dates": ["2023-09-30", "2023-12-31", "2024-03-31", "2024-06-30"],
  "deltas": [5, 5, 5],
  "percentages": [5.0, 4.76, 4.55],
  "positive_count": 3,
  "negative_count": 0
}
```

## 🧪 Testing

```bash
# Test with Apple
npm run test-trends AAPL

# Test with another company
npm run test-trends MSFT
```

## 🔄 Integration

Trends can be:
- Displayed in UI alongside metrics charts
- Used as signals for alerts
- Included in composite scores
- Exported for reporting
- Analyzed for correlation with market performance

## 📈 Next Steps (Future)

Potential enhancements:
- Custom trend types (e.g., "revenue deceleration with margin expansion")
- Cross-company trend comparisons
- Trend strength decay over time
- Machine learning on trend outcomes (separate from detection)
- Real-time trend updates on new filing ingestion
