// Corporate Events Database Operations
// Functions for creating and querying corporate events from 8-K filings

import { createServerClient } from '../supabase/client';
import type { CorporateEventType } from '../types/database';

/**
 * Result of database operations
 */
export interface DatabaseResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface CorporateEventRecord {
  id: string;
  company_id: string;
  filing_id: string;
  event_type: CorporateEventType;
  event_date: string;
  title: string;
  description: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface InsertCorporateEvent {
  company_id: string;
  filing_id: string;
  event_type: CorporateEventType;
  event_date: string;
  title: string;
  description?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Creates a corporate event record
 */
export async function createCorporateEvent(
  params: InsertCorporateEvent
): Promise<DatabaseResult<CorporateEventRecord>> {
  const supabase = createServerClient();

  try {
    const eventData = {
      company_id: params.company_id,
      filing_id: params.filing_id,
      event_type: params.event_type,
      event_date: params.event_date,
      title: params.title,
      description: params.description || null,
      metadata: params.metadata || {},
    };

    const { data, error } = await supabase
      .from('corporate_events')
      .insert(eventData)
      .select()
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: data! };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Creates multiple corporate events in bulk
 */
export async function createCorporateEvents(
  events: InsertCorporateEvent[]
): Promise<DatabaseResult<CorporateEventRecord[]>> {
  const supabase = createServerClient();

  try {
    const eventsData = events.map((event) => ({
      company_id: event.company_id,
      filing_id: event.filing_id,
      event_type: event.event_type,
      event_date: event.event_date,
      title: event.title,
      description: event.description || null,
      metadata: event.metadata || {},
    }));

    const { data, error } = await supabase
      .from('corporate_events')
      .insert(eventsData)
      .select();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: data || [] };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Gets corporate events for a company
 */
export async function getCorporateEvents(
  companyId: string
): Promise<DatabaseResult<CorporateEventRecord[]>> {
  const supabase = createServerClient();

  try {
    const { data, error } = await supabase
      .from('corporate_events')
      .select('*')
      .eq('company_id', companyId)
      .order('event_date', { ascending: false });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: data || [] };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Gets corporate events for a filing
 */
export async function getCorporateEventsByFiling(
  filingId: string
): Promise<DatabaseResult<CorporateEventRecord[]>> {
  const supabase = createServerClient();

  try {
    const { data, error } = await supabase
      .from('corporate_events')
      .select('*')
      .eq('filing_id', filingId)
      .order('event_date', { ascending: false });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data: data || [] };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
