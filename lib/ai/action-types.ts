/**
 * AI action types for future AI-driven application control.
 * Designed so AI responses can trigger navigation and UI actions.
 */

export type AIActionType =
  | 'navigateToCompany'
  | 'openComparison'
  | 'openScreener'
  | 'addHolding'
  | 'openFiling'
  | 'openFilingsList';

export interface NavigateToCompanyAction {
  type: 'navigateToCompany';
  ticker: string;
}

export interface OpenComparisonAction {
  type: 'openComparison';
  tickers: string[];
}

export interface OpenScreenerAction {
  type: 'openScreener';
  filters?: Record<string, unknown>;
}

export interface AddHoldingAction {
  type: 'addHolding';
  ticker: string;
  shares?: number;
  costBasis?: number;
}

export interface OpenFilingAction {
  type: 'openFiling';
  ticker: string;
  accessionNumber?: string;
}

export type AIAction =
  | NavigateToCompanyAction
  | OpenComparisonAction
  | OpenScreenerAction
  | AddHoldingAction
  | OpenFilingAction;

/**
 * Dispatches an AI action. Implementations can be added incrementally.
 */
export type AIActionDispatcher = (action: AIAction) => void;
