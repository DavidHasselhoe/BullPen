// BullPen Database Types
// Auto-generated types matching Supabase schema
// Keep in sync with migrations in supabase/migrations/

export type FilingType = '10-K' | '10-Q' | '8-K' | '20-F' | '6-K' | 'S-1' | 'DEF 14A' | 'OTHER';
export type ProcessingStatus = 'pending' | 'processing' | 'completed' | 'failed';
export type SectionType = 
  | 'business_overview'
  | 'risk_factors'
  | 'legal_proceedings'
  | 'management_discussion_analysis'
  | 'financial_statements'
  | 'notes_to_financials'
  | 'controls_procedures'
  | 'other';

export type MetricType = 
  | 'revenue'
  | 'cost_of_revenue'
  | 'gross_profit'
  | 'operating_income'
  | 'net_income'
  | 'eps_basic'
  | 'eps_diluted'
  | 'total_assets'
  | 'total_liabilities'
  | 'shareholders_equity'
  | 'operating_cash_flow'
  | 'free_cash_flow'
  | 'capital_expenditures'
  | 'shares_outstanding'
  | 'other';

export type PeriodType = 'annual' | 'quarterly' | 'ttm' | 'ytd';

export type InsightType = 
  | 'executive_summary'
  | 'risk_analysis'
  | 'sentiment_analysis'
  | 'key_changes'
  | 'competitive_analysis'
  | 'guidance_extraction'
  | 'other';

export type SignalDirection = 'bullish' | 'bearish' | 'neutral';
export type SignalType = 
  | 'earnings_surprise'
  | 'guidance_change'
  | 'risk_alert'
  | 'unusual_disclosure'
  | 'management_change'
  | 'legal_event'
  | 'competitive_threat'
  | 'growth_opportunity'
  | 'other';

export type TrendType =
  | 'sustained_growth'
  | 'sustained_decline'
  | 'acceleration'
  | 'deceleration'
  | 'volatility_increase'
  | 'divergence';

export type TrendDirection = 'positive' | 'negative' | 'neutral';


// =====================================================
// TABLE TYPES
// =====================================================

export interface Company {
  id: string;
  ticker: string;
  name: string;
  cik: string;
  sector: string | null;
  industry: string | null;
  description: string | null;
  sic_code: string | null;
  incorporation_location: string | null;
  fiscal_year_end: string | null;
  fiscal_year_end_month: number | null;
  fiscal_year_end_day: number | null;
  employee_count: number | null;
  employee_count_is_estimated: boolean | null;
  shares_outstanding: number | null;
  logo_url: string | null;
  logo_source: 'brand' | 'wikipedia' | 'manual' | null;
  logo_updated_at: string | null;
  fundamentals_last_change: string | null;
  fundamentals_checked_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface User {
  id: string;
  email: string;
  username: string | null;
  full_name: string | null;
  avatar_url: string | null;
  role: string;
  bio: string | null;
  experience_level: 'beginner' | 'intermediate' | 'advanced' | null;
  market_focus: 'US' | 'EU' | 'BOTH' | null;
  risk_profile: 'conservative' | 'balanced' | 'aggressive' | null;
  // INTEGER in DB (migration 026): 1 = free, 2 = admin, 3 = paid Pro.
  // Use `tierFromInt()` / `isPro()` from `lib/billing/tier.ts` instead of comparing directly.
  account_tier: number | null;
  settings: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
}

export interface UserHolding {
  id: string;
  user_id: string;
  symbol: string;
  company_name: string;
  quantity: number | null;
  avg_price: number | null;
  date_purchased: string | null;
  source: 'manual' | 'snaptrade';
  brokerage_account_id: string | null;
  alerts_enabled: boolean;
  asset_type: 'stock' | 'crypto' | 'commodity' | 'forex' | 'etf' | null;
  /** ISO 4217 home currency at purchase time (e.g. 'NOK') */
  purchase_currency: string | null;
  /** 1 USD = X purchase_currency on date_purchased */
  purchase_fx_rate: number | null;
  /** ISO 4217 currency the asset trades in (e.g. 'USD', 'NOK', 'EUR') — the currency avg_price is in. NULL = unknown. */
  trading_currency: string | null;
  created_at: string;
  updated_at: string;
}

export interface WatchlistItem {
  id: string;
  user_id: string;
  symbol: string;
  company_name: string;
  alerts_enabled: boolean;
  added_at: string;
}

export interface BrokerageConnection {
  id: string;
  user_id: string;
  snaptrade_account_id: string;
  authorization_id: string | null;
  account_name: string | null;
  brokerage_name: string | null;
  brokerage_slug: string | null;
  account_number: string | null;
  account_type: string | null;
  is_active: boolean;
  last_synced_at: string | null;
  created_at: string;
}

export type InsertUserHolding = Omit<UserHolding, 'id' | 'created_at' | 'updated_at'> & {
  id?: string;
};

export type UpdateUserHolding = Partial<Omit<UserHolding, 'id' | 'created_at' | 'updated_at'>> & {
  id?: string;
};

export interface FinancialMetric {
  id: string;
  filing_id: string;
  company_id: string;
  metric_type: MetricType;
  value: number;
  unit: string;
  period_type: PeriodType;
  period_start_date: string | null;
  period_end_date: string;
  fiscal_year: number | null;
  fiscal_quarter: number | null;
  accounting_basis: string;
  currency: string;
  split_adjusted: boolean;
  is_restated: boolean;
  ingested_at: string;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface AIInsight {
  id: string;
  filing_id: string;
  company_id: string;
  section_id: string | null;
  insight_type: InsightType;
  title: string;
  content: Record<string, unknown>;
  summary: string | null;
  confidence_score: number | null;
  model_version: string;
  model_parameters: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface Signal {
  id: string;
  company_id: string;
  filing_id: string | null;
  signal_type: SignalType;
  direction: SignalDirection;
  strength: number;
  title: string;
  description: string;
  evidence: Record<string, unknown>;
  metadata: Record<string, unknown>;
  expires_at: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// =====================================================
// RELATION TYPES (WITH JOINS)
// =====================================================

export interface SignalWithDetails extends Signal {
  company: Company;
}

export interface Trend {
  id: string;
  company_id: string;
  metric_type: string;
  period_type: PeriodType;
  trend_type: TrendType;
  direction: TrendDirection;
  strength: number;
  explanation: string;
  periods_analyzed: number;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface CompanyIndex {
  id: string;
  ticker: string;
  name: string;
  cik: string;
  normalized_ticker: string;
  normalized_name: string;
  created_at: string;
  updated_at: string;
}

export interface Exchange {
  code: string;
  name: string;
  country: string;
  timezone: string;
  open_time: string;
  close_time: string;
  created_at: string;
}

export interface ExchangeHoliday {
  id: string;
  exchange_code: string;
  date: string;
  type: 'closed' | 'early_close';
  early_close_time: string | null;
  description: string | null;
  created_at: string;
}

export interface MarketStatus {
  exchange: Exchange;
  isOpen: boolean;
  nextOpenTime: Date | null;
  nextCloseTime: Date | null;
  timeUntilOpen: number | null; // milliseconds
  timeUntilClose: number | null; // milliseconds
  currentTime: Date;
  isHoliday: boolean;
  isEarlyClose: boolean;
  earlyCloseTime: Date | null;
}

// =====================================================
// INSERT TYPES (OMIT AUTO-GENERATED FIELDS)
// =====================================================

export type InsertCompany = Omit<Company, 'id' | 'created_at' | 'updated_at'> & {
  id?: string;
  metadata?: Record<string, unknown>;
};

export type InsertFinancialMetric = Omit<FinancialMetric, 'id' | 'created_at' | 'updated_at'> & {
  id?: string;
  unit?: string;
  is_restated?: boolean;
  metadata?: Record<string, unknown>;
};

export type InsertAIInsight = Omit<AIInsight, 'id' | 'created_at' | 'updated_at'> & {
  id?: string;
};

export type InsertSignal = Omit<Signal, 'id' | 'created_at' | 'updated_at'> & {
  id?: string;
  is_active?: boolean;
  metadata?: Record<string, unknown>;
};

export type InsertTrend = Omit<Trend, 'id' | 'created_at' | 'updated_at'> & {
  id?: string;
  metadata?: Record<string, unknown>;
};

// =====================================================
// UPDATE TYPES (ALL FIELDS OPTIONAL EXCEPT ID)
// =====================================================

export type UpdateCompany = Partial<Omit<Company, 'id' | 'created_at' | 'updated_at'>> & {
  id: string;
};

export type UpdateSignal = Partial<Omit<Signal, 'id' | 'created_at' | 'updated_at'>> & {
  id: string;
};
