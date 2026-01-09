# BullPen AI Analysis - Setup Complete ✅

## What's Been Built

An AI extraction layer that generates structured insights from SEC filing sections.

### 📁 File Structure

```
BullPen/
├── lib/ai/
│   ├── README.md                # Comprehensive documentation
│   ├── ai-analyzer.ts           # Core AI analysis with deterministic prompts
│   ├── ai-insights-db.ts        # Database operations
│   └── ai-orchestrator.ts       # Coordinates analysis workflow
├── scripts/
│   └── test-ai-analysis.ts      # CLI test tool
├── ENV_SETUP.md                 # Updated with OpenAI API key instructions
└── AI_SETUP.md                  # This file
```

## 🎯 Features Implemented

✅ **Deterministic Prompts** - Structured, section-aware prompts  
✅ **JSON-only Output** - No prose, pure structured data  
✅ **Confidence Scoring** - Model certainty tracking (0.0-1.0)  
✅ **Model Versioning** - Stores model name and parameters  
✅ **Database Integration** - Links to company, filing, section  
✅ **Re-runnable** - Can re-analyze without re-ingesting  
✅ **Progress Tracking** - Callback-based progress updates  
✅ **Error Handling** - Per-section error tracking  

## 📊 Insight Structure

For each filing section, the AI extracts:

```typescript
{
  summary: string;              // 3-5 sentence factual summary
  sentiment: 'positive' | 'neutral' | 'negative';
  key_points: string[];         // 3-7 most important facts
  risk_flags: string[];         // Explicit risks (empty if none)
  confidence: number;           // 0.0 to 1.0
}
```

## 🚀 Quick Start

### 1. Get OpenAI API Key

1. Go to [platform.openai.com](https://platform.openai.com)
2. Sign up or log in
3. Go to **API keys** → **Create new secret key**
4. Copy the key (starts with `sk-...`)

### 2. Add to .env.local

```env
# OpenAI Configuration
OPENAI_API_KEY=sk-...your-actual-api-key
```

### 3. Run AI Analysis

```bash
# Analyze latest completed filing
npm run test-ai
```

Expected output:
```
🤖 BullPen AI Analysis Test

📊 Finding latest completed Apple filing...

Found: Apple Inc. (AAPL)
Filing: 10-K - 2024-11-01
Filing ID: abc-123...

🔄 Starting AI analysis...

  → Fetching filing and sections from database
  → Filing loaded (5 sections)
  → AI model initialized (gpt-4o-mini)
  → Analyzing section 1/5 (business_overview)
  → AI analysis completed (confidence: 0.92, sentiment: positive)
  → Stored insight for business_overview
  ...

✅ AI Analysis completed successfully!

Results:
  Sections Analyzed: 5
  Insights Created:  5
```

### 4. Verify in Database

```sql
SELECT 
  title,
  insight_type,
  confidence_score,
  content->>'sentiment' as sentiment,
  jsonb_array_length(content->'key_points') as key_points_count
FROM ai_insights
WHERE filing_id = 'your-filing-id'
ORDER BY created_at;
```

## 📖 Example Insight

For **Item 1: Business** section:

```json
{
  "summary": "Apple Inc. designs, manufactures, and markets smartphones, personal computers, tablets, wearables, and accessories. The company's product lines include iPhone, Mac, iPad, and wearables such as Apple Watch and AirPods. Apple also provides various services including advertising, cloud services, digital content, and payment services. The company operates through direct and indirect distribution channels globally.",
  "sentiment": "positive",
  "key_points": [
    "iPhone is the company's line of smartphones based on iOS operating system",
    "Mac lineup includes laptops (MacBook Air, MacBook Pro) and desktops (iMac, Mac mini, Mac Studio, Mac Pro)",
    "Services segment includes App Store, Apple Music, iCloud, Apple Pay, and AppleCare",
    "Company sells through retail stores, online stores, and third-party resellers",
    "Products are manufactured primarily in Asia through outsourcing partners"
  ],
  "risk_flags": [],
  "confidence": 0.92
}
```

## 🔧 Model Configuration

**Current Model**: `gpt-4o-mini`
- Fast and cost-effective ($0.15/$0.60 per 1M tokens)
- Suitable for structured extraction
- Temperature: 0.1 (low for consistency)
- Max tokens: 2000
- Response format: JSON object only

**Cost per filing** (5 sections): ~$0.01

## 📊 What Gets Stored

In the `ai_insights` table:

| Field | Description |
|-------|-------------|
| `filing_id` | Links to parent filing |
| `company_id` | Links to company |
| `section_id` | Links to specific section |
| `insight_type` | executive_summary, risk_analysis, other |
| `title` | "Item X - AI Analysis" |
| `content` | Full JSON insight structure |
| `summary` | Duplicated for easy querying |
| `confidence_score` | Model confidence (0.0-1.0) |
| `model_version` | "gpt-4o-mini" |
| `model_parameters` | Temperature, max_tokens, etc. |

## 🎨 Advanced Usage

### Analyze Specific Filing

```bash
npx tsx scripts/test-ai-analysis.ts <FILING_ID>
```

### Programmatic Usage

```typescript
import { analyzeFilingSections } from '@/lib/ai/ai-orchestrator';

const result = await analyzeFilingSections(filingId, {
  skipExisting: true,
  onProgress: (step, details) => {
    console.log(`→ ${step}`, details);
  },
});
```

### Re-run Analysis

```typescript
import { reanalyzeFilingSections } from '@/lib/ai/ai-orchestrator';

// Deletes existing insights and runs fresh
await reanalyzeFilingSections(filingId, onProgress);
```

### Query Insights

```typescript
import { getFilingInsights } from '@/lib/ai/ai-insights-db';

const result = await getFilingInsights(filingId);
result.data.forEach(insight => {
  console.log(insight.title);
  console.log(insight.content.summary);
  console.log(`Sentiment: ${insight.content.sentiment}`);
});
```

## ⚙️ Prompt Design

Prompts are **deterministic and section-aware**:

1. **Context**: Identifies section type (Business, Risk Factors, etc.)
2. **Task**: Clear extraction requirements
3. **Format**: Exact JSON schema specification
4. **Rules**: Factual, neutral, professional tone

Example for Business section:
```
You are analyzing a SEC 10-K filing section. This is the Business 
section (Item 1) describing the company's operations, products, and services.

SECTION CONTENT:
[Truncated content with smart beginning/end preservation]

OUTPUT FORMAT: Return ONLY valid JSON...
{
  "summary": "...",
  "sentiment": "positive | neutral | negative",
  "key_points": ["..."],
  "risk_flags": ["..."],
  "confidence": 0.95
}

RULES:
- Output ONLY JSON, no additional text
- Summary must be 3-5 complete sentences
- Key points must be factual statements from text
- Risk flags are explicit risks mentioned
- Use professional, neutral language
```

## 🔍 Validation

All insights are validated before storage:

✅ JSON structure matches schema  
✅ Summary is 50+ characters  
✅ Sentiment is one of: positive/neutral/negative  
✅ Key points array has 2+ items  
✅ Risk flags is array (can be empty)  
✅ Confidence is 0.0-1.0  

Invalid responses throw errors with details.

## ⏱️ Performance

**Per Section**:
- AI analysis: 2-5 seconds
- Database storage: <100ms
- Rate limit delay: 1 second

**Per Filing** (5 sections):
- Total time: ~30-60 seconds
- Cost: ~$0.01

## 🐛 Troubleshooting

### Error: "OPENAI_API_KEY not set"

Add to `.env.local`:
```env
OPENAI_API_KEY=sk-your-actual-key
```

Restart terminal after adding.

### Error: "OpenAI API error: 401"

Your API key is invalid. Check:
1. Key is correctly copied (starts with `sk-`)
2. No extra spaces in `.env.local`
3. Key hasn't been revoked in OpenAI dashboard

### Error: "Failed to parse JSON"

The AI returned invalid JSON. Retry the analysis:
```bash
npm run test-ai
```

If persistent, check section content isn't corrupted.

### Low Confidence Scores

If confidence < 0.7 consistently:
- Section content may be unclear
- Content truncated (check `content_length`)
- Consider adjusting prompt

### Rate Limit Errors

If hitting OpenAI rate limits:
- Default delay is 1 second between sections
- Increase in `ai-orchestrator.ts` if needed
- Check your OpenAI usage tier

## 📈 Next Steps

With AI analysis working, you can:

1. **Query insights** via SQL or API
2. **Compare sentiments** across filings
3. **Track risk flags** over time
4. **Build dashboards** showing insights
5. **Generate signals** from sentiment/risks (future)

## 🎯 Implementation Complete

✅ **AI analyzer** with deterministic prompts  
✅ **Database operations** for storing insights  
✅ **Orchestrator** for batch processing  
✅ **Test script** for validation  
✅ **Documentation** comprehensive  

**Status**: Ready to analyze Apple's 10-K sections!  
**Next**: Run `npm run test-ai` to generate insights

---

**Cost**: ~$0.01 per filing  
**Time**: ~30-60 seconds per filing  
**Quality**: Structured, auditable, deterministic  
