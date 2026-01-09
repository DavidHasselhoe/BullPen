// Supabase Database Type Definition
// Generated types for type-safe database access

import type {
  Company,
  Filing,
  FilingSection,
  FinancialMetric,
  AIInsight,
  Signal,
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
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}
