// Database Operations for Signals
// Stores generated signals in the signals table

import { createServerClient } from '../supabase/client';
import type { Signal, InsertSignal } from '../types/database';
import type { GeneratedSignal } from './signal-generator';

/**
 * Result of signal database operations
 */
export interface SignalDBResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * Creates a signal record in the database
 */
export async function createSignal(params: {
  companyId: string;
  filingId: string;
  signal: GeneratedSignal;
}): Promise<SignalDBResult<Signal>> {
  const supabase = createServerClient();

  try {
    const signalData: InsertSignal = {
      company_id: params.companyId,
      filing_id: params.filingId,
      signal_type: params.signal.signal_type,
      direction: params.signal.direction,
      strength: params.signal.strength,
      title: params.signal.title,
      description: params.signal.description,
      evidence: params.signal.evidence,
      metadata: {},
      expires_at: null,
      is_active: true,
    };

    const { data, error } = await supabase
      .from('signals')
      .insert(signalData)
      .select()
      .single();

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Creates multiple signals in bulk
 */
export async function createSignals(params: {
  companyId: string;
  filingId: string;
  signals: GeneratedSignal[];
}): Promise<SignalDBResult<Signal[]>> {
  const supabase = createServerClient();

  try {
    const signalsData: InsertSignal[] = params.signals.map((signal) => ({
      company_id: params.companyId,
      filing_id: params.filingId,
      signal_type: signal.signal_type,
      direction: signal.direction,
      strength: signal.strength,
      title: signal.title,
      description: signal.description,
      evidence: signal.evidence,
      metadata: {},
      expires_at: null,
      is_active: true,
    }));

    const { data, error } = await supabase
      .from('signals')
      .insert(signalsData)
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
 * Gets signals for a filing
 */
export async function getFilingSignals(
  filingId: string
): Promise<SignalDBResult<Signal[]>> {
  const supabase = createServerClient();

  try {
    const { data, error } = await supabase
      .from('signals')
      .select('*')
      .eq('filing_id', filingId)
      .order('strength', { ascending: false });

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
 * Deletes signals for a filing (useful for re-generating)
 */
export async function deleteFilingSignals(
  filingId: string
): Promise<SignalDBResult<void>> {
  const supabase = createServerClient();

  try {
    const { error } = await supabase
      .from('signals')
      .delete()
      .eq('filing_id', filingId);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Gets active signals for a company
 */
export async function getCompanySignals(
  companyId: string,
  limit: number = 20
): Promise<SignalDBResult<Signal[]>> {
  const supabase = createServerClient();

  try {
    const { data, error } = await supabase
      .from('signals')
      .select('*')
      .eq('company_id', companyId)
      .eq('is_active', true)
      .order('strength', { ascending: false })
      .limit(limit);

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
