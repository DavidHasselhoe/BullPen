// Financial calculations for portfolio analytics
import { getField, getNumericValue, getCurrency } from './utils.js';

// Calculate day gain/loss for a position
export function calculateDayGL(position, morningPrice) {
  const lastPrice = getField(position, 'last_price');
  const qty = getField(position, 'qty');
  
  const last = getNumericValue(lastPrice);
  const quantity = getNumericValue(qty);
  const referencePrice = getNumericValue(morningPrice);
  
  if (referencePrice && last && quantity && referencePrice !== last) {
    return (last - referencePrice) * quantity;
  }
  return 0;
}

// Calculate total gain/loss for a position
export function calculateTotalGL(position) {
  const acqPrice = getNumericValue(getField(position, 'acq_price'));
  const lastPrice = getNumericValue(getField(position, 'last_price'));
  const qty = getNumericValue(getField(position, 'qty'));
  
  if (acqPrice && lastPrice && qty) {
    return (lastPrice - acqPrice) * qty;
  }
  return 0;
}

// Calculate gain/loss percentage for a position
export function calculateGainPercent(position) {
  const acqPrice = getNumericValue(getField(position, 'acq_price'));
  const lastPrice = getNumericValue(getField(position, 'last_price'));
  
  if (acqPrice && lastPrice && acqPrice !== 0) {
    return ((lastPrice - acqPrice) / acqPrice) * 100;
  }
  return 0;
}

// Calculate day change percentage for a position
export function calculateDayChangePercent(position, morningPrice) {
  const lastPrice = getNumericValue(getField(position, 'last_price'));
  const morning = getNumericValue(morningPrice);
  
  if (morning && lastPrice && morning !== 0) {
    return ((lastPrice - morning) / morning) * 100;
  }
  return 0;
}

// Convert currency value to NOK
export function convertToNOK(value, currency, exchangeRates) {
  if (currency === 'USD') {
    return value * exchangeRates.USD;
  } else if (currency === 'SEK') {
    return value * exchangeRates.SEK;
  }
  return value; // Already NOK or unknown currency
}

// Calculate market value in NOK for sorting/aggregation
export function getMarketValueInNOK(position, exchangeRates) {
  let v = position.market_value;
  let value = 0;
  let currency = '';
  
  if (v && typeof v === 'object' && v.value !== undefined) {
    value = Number(v.value) || 0;
    currency = v.currency || '';
  } else if (typeof v === 'number') {
    value = v;
  }
  
  return convertToNOK(value, currency, exchangeRates);
}

// Calculate portfolio summary from positions
export function calculatePortfolioSummary(positions, exchangeRates) {
  let totalValue = 0;
  let totalGainLoss = 0;
  let todayGainLoss = 0;
  
  positions.forEach(p => {
    const lastPrice = getNumericValue(getField(p, 'last_price'));
    const acqPrice = getNumericValue(getField(p, 'acq_price'));
    const qty = getNumericValue(getField(p, 'qty'));
    const morningPrice = getNumericValue(getField(p, 'morning_price'));
    const priceCurrency = getCurrency(getField(p, 'last_price'));
    
    // Total gain/loss
    if (acqPrice && lastPrice && qty) {
      let gainLoss = (lastPrice - acqPrice) * qty;
      gainLoss = convertToNOK(gainLoss, priceCurrency, exchangeRates);
      totalGainLoss += gainLoss;
    }
    
    // Today's gain/loss
    if (morningPrice && lastPrice && qty) {
      let todayChange = (lastPrice - morningPrice) * qty;
      todayChange = convertToNOK(todayChange, priceCurrency, exchangeRates);
      todayGainLoss += todayChange;
    }
    
    // Market value
    const marketValue = getMarketValueInNOK(p, exchangeRates);
    totalValue += marketValue;
  });
  
  return {
    totalValue,
    totalGainLoss,
    todayGainLoss
  };
}
