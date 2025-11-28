// Utility functions for the portfolio dashboard

// Helper to get element by ID
export const $ = id => document.getElementById(id);

// Format number with locale formatting
export function formatNumber(val, decimals = 2) {
  if (typeof val !== 'number') val = Number(val);
  if (isNaN(val)) return '';
  return val.toLocaleString(undefined, { 
    minimumFractionDigits: decimals, 
    maximumFractionDigits: decimals 
  });
}

// Extract numeric value from object or number
export function getNumericValue(v) {
  if (v && typeof v === 'object' && v.value !== undefined) return Number(v.value);
  if (typeof v === 'number') return v;
  return null;
}

// Extract currency from object
export function getCurrency(v) {
  if (v && typeof v === 'object' && v.currency) return v.currency;
  return null;
}

// Helper to extract field from position object (checks instrument if not found)
export function getField(p, key) {
  // Special handling for last_price - try multiple sources
  if (key === 'last_price') {
    if (p.last_price !== undefined) return p.last_price;
    if (p.main_market_price !== undefined) return p.main_market_price;
    if (p.instrument && p.instrument.last_price !== undefined) return p.instrument.last_price;
    return '';
  }
  
  // Special handling for morning_price (opening price for the day)
  if (key === 'morning_price') {
    if (p.morning_price !== undefined) return p.morning_price;
    if (p.instrument && p.instrument.morning_price !== undefined) return p.instrument.morning_price;
    return '';
  }
  
  if (p[key] !== undefined) return p[key];
  if (p.instrument && typeof p.instrument === 'object' && p.instrument[key] !== undefined) {
    return p.instrument[key];
  }
  return '';
}

// Check if symbol is a US stock (no exchange suffix)
export function isUSStock(symbol) {
  return symbol && !symbol.includes('.') && !symbol.includes(':');
}
