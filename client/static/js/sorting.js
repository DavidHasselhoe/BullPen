// Table sorting logic for portfolio positions
import { getField, getNumericValue } from './utils.js';
import { calculateDayGL, calculateGainPercent, getMarketValueInNOK } from './calculations.js';

// Sort positions by column and direction
export function sortPositions(positions, column, direction, exchangeRates) {
  return positions.slice().sort((a, b) => {
    let aVal, bVal;

    if (column === 'market_value') {
      // Special handling for market value with currency conversion
      aVal = getMarketValueInNOK(a, exchangeRates);
      bVal = getMarketValueInNOK(b, exchangeRates);
      
    } else if (column === 'change_percent' || column === 'change_today') {
      // Calculate day change percentage
      const getChangePercent = p => {
        let changePercent = getNumericValue(getField(p, 'change_percent'));
        
        if (changePercent === null) {
          const morningPrice = getField(p, 'morning_price');
          const lastPrice = getField(p, 'last_price');
          const morning = getNumericValue(morningPrice);
          const last = getNumericValue(lastPrice);
          
          if (morning && last && morning !== 0) {
            changePercent = ((last - morning) / morning) * 100;
          }
        }
        
        return changePercent || 0;
      };
      aVal = getChangePercent(a);
      bVal = getChangePercent(b);
      
    } else if (column === 'gain_percent') {
      // Calculate gain/loss percent
      aVal = calculateGainPercent(a);
      bVal = calculateGainPercent(b);
      
    } else if (column === 'day_gl') {
      // Calculate day gain/loss
      const getDayGL = p => {
        const morningPrice = getNumericValue(getField(p, 'morning_price'));
        return calculateDayGL(p, morningPrice);
      };
      aVal = getDayGL(a);
      bVal = getDayGL(b);
      
    } else {
      // Generic numeric field
      aVal = getNumericValue(getField(a, column)) || 0;
      bVal = getNumericValue(getField(b, column)) || 0;
    }

    if (direction === 'asc') {
      return aVal - bVal;
    } else {
      return bVal - aVal;
    }
  });
}

// Get sort indicator HTML
export function getSortIndicator(columnKey, currentColumn, currentDirection) {
  if (columnKey !== currentColumn) return '';
  return currentDirection === 'asc' ? ' ▲' : ' ▼';
}
