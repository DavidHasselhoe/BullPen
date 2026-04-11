// Supabase Database Type Definition
// Generated types for type-safe database access

import type {
  Company,
  Filing,
  FilingSection,
  FinancialMetric,
  AIInsight,
  Signal,
  User,
  UserHolding,
  Exchange,
  ExchangeHoliday,
} from '../types/database';

export interface Database {
  public: {
    Tables: {
      companies: {
        Row: Company;
        Insert: Omit<Company, 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
        };
        Update: Partial<Omit<Company, 'id' | 'created_at' | 'updated_at'>>;
      };
      filings: {
        Row: Filing;
        Insert: Omit<Filing, 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
        };
        Update: Partial<Omit<Filing, 'id' | 'created_at' | 'updated_at'>>;
      };
      filing_sections: {
        Row: FilingSection;
        Insert: Omit<FilingSection, 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
        };
        Update: Partial<Omit<FilingSection, 'id' | 'created_at' | 'updated_at'>>;
      };
      financial_metrics: {
        Row: FinancialMetric;
        Insert: Omit<FinancialMetric, 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
        };
        Update: Partial<Omit<FinancialMetric, 'id' | 'created_at' | 'updated_at'>>;
      };
      ai_insights: {
        Row: AIInsight;
        Insert: Omit<AIInsight, 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
        };
        Update: Partial<Omit<AIInsight, 'id' | 'created_at' | 'updated_at'>>;
      };
      signals: {
        Row: Signal;
        Insert: Omit<Signal, 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
        };
        Update: Partial<Omit<Signal, 'id' | 'created_at' | 'updated_at'>>;
      };
      users: {
        Row: User;
        Insert: Omit<User, 'id' | 'created_at' | 'updated_at' | 'last_login_at'> & {
          id: string; // Must match auth.users.id
        };
        Update: Partial<Omit<User, 'id' | 'created_at' | 'updated_at'>>;
      };
      exchanges: {
        Row: Exchange;
        Insert: Omit<Exchange, 'created_at'>;
        Update: Partial<Omit<Exchange, 'code' | 'created_at'>>;
      };
      exchange_holidays: {
        Row: ExchangeHoliday;
        Insert: Omit<ExchangeHoliday, 'id' | 'created_at'> & {
          id?: string;
        };
        Update: Partial<Omit<ExchangeHoliday, 'id' | 'created_at'>>;
      };
      user_holdings: {
        Row: UserHolding;
        Insert: Omit<UserHolding, 'id' | 'created_at' | 'updated_at'> & { id?: string };
        Update: Partial<Omit<UserHolding, 'id' | 'created_at' | 'updated_at'>>;
      };
      currency_exchange_rates: {
        Row: {
          id: string;
          base_currency: string;
          target_currency: string;
          rate: number;
          date: string;
          created_at: string;
        };
        Insert: {
          base_currency: string;
          target_currency: string;
          rate: number;
          date: string;
          id?: string;
        };
        Update: Partial<{
          base_currency: string;
          target_currency: string;
          rate: number;
          date: string;
        }>;
      };
      search_metrics: {
        Row: {
          id: string;
          ticker: string;
          user_id: string | null;
          created_at: string;
        };
        Insert: {
          ticker: string;
          user_id?: string | null;
          id?: string;
        };
        Update: Partial<{
          ticker: string;
          user_id: string | null;
        }>;
      };
      stock_page_visits: {
        Row: {
          id: string;
          ticker: string;
          visited_at: string;
          user_id: string | null;
        };
        Insert: {
          ticker: string;
          user_id?: string | null;
          id?: string;
          visited_at?: string;
        };
        Update: Partial<{
          ticker: string;
          user_id: string | null;
          visited_at: string;
        }>;
      };
    };
    Views: Record<string, never>;
    Functions: {
      get_hot_picks: {
        Args: { time_period_hours: number; limit_count: number };
        Returns: Array<{
          ticker: string;
          click_count: number;
          last_clicked_at: string;
        }>;
      };
    };
    Enums: Record<string, never>;
  };
}
