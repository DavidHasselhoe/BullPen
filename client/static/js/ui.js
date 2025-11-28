// UI rendering functions
import { $, formatNumber, getField, getNumericValue, getCurrency } from './utils.js';
import { calculateDayGL, calculateGainPercent, calculateDayChangePercent } from './calculations.js';
import { getLogoElement } from './logos.js';
import { getSortIndicator } from './sorting.js';

// Render global portfolio summary
export function renderGlobalSummary(globalSummary) {
  let summaryDiv = document.getElementById('global-summary');
  if (!summaryDiv) {
    summaryDiv = document.createElement('div');
    summaryDiv.id = 'global-summary';
    summaryDiv.className = 'account-info-summary';
    const accountsDiv = $('accounts');
    accountsDiv.parentNode.insertBefore(summaryDiv, accountsDiv);
  }
  
  const { totalValue, totalGainLoss, todayGainLoss, accounts } = globalSummary;
  const accountCount = accounts.size;
  
  if (accountCount === 0) {
    summaryDiv.style.display = 'none';
    return;
  }
  
  summaryDiv.style.display = 'block';
  
  const totalGLColor = totalGainLoss >= 0 ? '#10b981' : '#ef4444';
  const todayGLColor = todayGainLoss >= 0 ? '#10b981' : '#ef4444';
  const totalGLSign = totalGainLoss >= 0 ? '+' : '';
  const todayGLSign = todayGainLoss >= 0 ? '+' : '';
  const todayGLShadow = todayGainLoss >= 0 ? '0 0 15px rgba(16, 185, 129, 0.6)' : '0 0 15px rgba(239, 68, 68, 0.6)';
  
  summaryDiv.innerHTML = `
    <h3>Portfolio Summary (${accountCount} account${accountCount > 1 ? 's' : ''})</h3>
    <div class="info-grid">
      <div class="info-card">
        <div class="info-label">Total Value</div>
        <div class="info-value" style="font-size: 24px;">${totalValue.toLocaleString('no-NO', {minimumFractionDigits: 2, maximumFractionDigits: 2})} NOK</div>
      </div>
      <div class="info-card">
        <div class="info-label">Today's G/L</div>
        <div class="info-value" style="color: ${todayGLColor}; text-shadow: ${todayGLShadow}; font-size: 24px; font-weight: 700;">${todayGLSign}${todayGainLoss.toLocaleString('no-NO', {minimumFractionDigits: 2, maximumFractionDigits: 2})} NOK</div>
      </div>
    </div>
  `;
}

// Render account list
export function renderAccounts(accounts, onAccountClick) {
  const accountsDiv = $('accounts');
  accountsDiv.innerHTML = '';
  
  if (!accounts || accounts.length === 0) {
    accountsDiv.innerHTML = '<p>No accounts found</p>';
    return;
  }
  
  const columns = [
    { key: 'type', label: 'Type' },
    { key: 'symbol', label: 'Symbol' },
    { key: 'alias', label: 'Alias' }
  ];
  
  const table = document.createElement('table');
  table.className = 'accounts accounts-table';
  
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  columns.forEach(col => {
    const th = document.createElement('th');
    th.textContent = col.label;
    if (col.align) th.style.textAlign = col.align;
    headerRow.appendChild(th);
  });
  thead.appendChild(headerRow);
  table.appendChild(thead);
  
  const tbody = document.createElement('tbody');
  accounts.forEach(a => {
    const tr = document.createElement('tr');
    tr.title = 'Click to view holdings';
    tr.style.cursor = 'pointer';
    
    // Handle both 'id' (mock) and 'accid' (real API)
    const accountId = a.accid || a.id;
    tr.addEventListener('click', () => onAccountClick(accountId));
    
    columns.forEach(col => {
      const td = document.createElement('td');
      if (col.align) td.style.textAlign = col.align;
      let val = a && a[col.key] !== undefined ? a[col.key] : '';
      td.textContent = val;
      tr.appendChild(td);
    });
    
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  
  accountsDiv.appendChild(table);
}

// Render account info summary
export function renderAccountInfo(accountInfo, todayGainLoss) {
  const accinfoDiv = $('accinfo');
  if (!accountInfo) {
    accinfoDiv.style.display = 'none';
    return;
  }
  
  accinfoDiv.style.display = 'block';
  
  const totalValue = accountInfo.own_capital?.value || 0;
  const totalGainLoss = accountInfo.result?.value || 0;
  const currency = accountInfo.own_capital?.currency || 'NOK';
  
  const totalGLColor = totalGainLoss >= 0 ? '#10b981' : '#ef4444';
  const todayGLColor = todayGainLoss >= 0 ? '#10b981' : '#ef4444';
  const totalGLSign = totalGainLoss >= 0 ? '+' : '';
  const todayGLSign = todayGainLoss >= 0 ? '+' : '';
  const todayGLShadow = todayGainLoss >= 0 ? '0 0 15px rgba(16, 185, 129, 0.6)' : '0 0 15px rgba(239, 68, 68, 0.6)';
  
  accinfoDiv.innerHTML = `
    <h3>Account Summary</h3>
    <div class="info-grid">
      <div class="info-card">
        <div class="info-label">Total Value</div>
        <div class="info-value" style="font-size: 24px;">${totalValue.toLocaleString('no-NO', {minimumFractionDigits: 2, maximumFractionDigits: 2})} ${currency}</div>
      </div>
      <div class="info-card">
        <div class="info-label">Today's G/L</div>
        <div class="info-value" style="color: ${todayGLColor}; text-shadow: ${todayGLShadow}; font-size: 24px; font-weight: 700;">${todayGLSign}${todayGainLoss.toLocaleString('no-NO', {minimumFractionDigits: 2, maximumFractionDigits: 2})} ${currency}</div>
      </div>
    </div>
  `;
}

// Add price flash animation to cell
export function addPriceFlash(td, symbol, currentPrice, previousPrices) {
  const key = symbol;
  const prevPrice = previousPrices.get(key);
  
  if (prevPrice !== undefined && prevPrice !== currentPrice) {
    if (currentPrice > prevPrice) {
      td.classList.add('price-flash-up');
    } else if (currentPrice < prevPrice) {
      td.classList.add('price-flash-down');
    }
    
    // Remove the flash class after animation completes
    setTimeout(() => {
      td.classList.remove('price-flash-up', 'price-flash-down');
    }, 1000);
  }
  
  // Store current price for next comparison
  previousPrices.set(key, currentPrice);
}

// Create table header row
export function createTableHeader(columns, currentSortColumn, currentSortDirection, onSort) {
  const thead = document.createElement('thead');
  const headerRow = document.createElement('tr');
  
  columns.forEach(col => {
    const th = document.createElement('th');
    th.textContent = col.label + (col.sortable ? getSortIndicator(col.key, currentSortColumn, currentSortDirection) : '');
    th.style.textAlign = col.align || 'left';
    
    if (col.sortable) {
      th.style.cursor = 'pointer';
      th.addEventListener('click', () => onSort(col.key));
    }
    
    headerRow.appendChild(th);
  });
  
  thead.appendChild(headerRow);
  return thead;
}

// Create position row
export function createPositionRow(position, columns, previousPrices, onRowClick) {
  const tr = document.createElement('tr');
  tr.style.cursor = 'pointer';
  tr.addEventListener('click', () => onRowClick(position));
  
  columns.forEach(col => {
    const td = document.createElement('td');
    td.style.textAlign = col.align || 'left';
    td.setAttribute('data-column', col.key);
    
    let val = '';
    
    // Handle logo column
    if (col.key === 'logo') {
      td.style.width = '40px';
      td.style.padding = '4px';
      const symbol = getField(position, 'symbol');
      const logoElement = getLogoElement(symbol);
      td.appendChild(logoElement);
      tr.appendChild(td);
      return; // Skip the rest for logo column
    }
    // Handle calculated columns
    else if (col.isCalculated && col.key === 'day_gl') {
      const lastPrice = getField(position, 'last_price');
      const qty = getField(position, 'qty');
      const symbol = getField(position, 'symbol');
      const morningPrice = getNumericValue(getField(position, 'morning_price'));
      const last = getNumericValue(lastPrice);
      const quantity = getNumericValue(qty);
      const currency = getCurrency(lastPrice) || 'NOK';
      
      if (morningPrice && last && quantity && morningPrice !== last) {
        const dayChange = (last - morningPrice) * quantity;
        const sign = dayChange >= 0 ? '+' : '';
        val = `${sign}${formatNumber(dayChange)} ${currency}`;
        
        if (dayChange > 0) {
          td.className = 'gain-positive';
        } else if (dayChange < 0) {
          td.className = 'gain-negative';
        }
      } else {
        val = '-';
      }
    }
    // Handle gain_percent calculated column
    else if (col.isCalculated && col.key === 'gain_percent') {
      const acqPrice = getNumericValue(getField(position, 'acq_price'));
      const lastPrice = getNumericValue(getField(position, 'last_price'));
      
      if (acqPrice && lastPrice && acqPrice !== 0) {
        const gainPercent = ((lastPrice - acqPrice) / acqPrice) * 100;
        const sign = gainPercent >= 0 ? '+' : '';
        val = `${sign}${formatNumber(gainPercent)}%`;
        
        if (gainPercent > 0) {
          td.className = 'gain-positive';
        } else if (gainPercent < 0) {
          td.className = 'gain-negative';
        }
      } else {
        val = '-';
      }
    }
    else {
      val = getField(position, col.key);
      
      // Special handling for change_percent - calculate if not present
      if (col.key === 'change_percent' && !val) {
        const morningPrice = getNumericValue(getField(position, 'morning_price'));
        const lastPrice = getNumericValue(getField(position, 'last_price'));
        
        if (morningPrice && lastPrice && morningPrice !== 0) {
          const changePercent = ((lastPrice - morningPrice) / morningPrice) * 100;
          const sign = changePercent >= 0 ? '+' : '';
          val = `${sign}${formatNumber(changePercent)}%`;
          
          if (changePercent > 0) {
            td.className = 'gain-positive';
          } else if (changePercent < 0) {
            td.className = 'gain-negative';
          }
          td.textContent = val;
          tr.appendChild(td);
          return;
        }
      }
      
      // Special handling for change_today - calculate day change in currency
      if (col.key === 'change_today') {
        const morningPrice = getNumericValue(getField(position, 'morning_price'));
        const lastPrice = getNumericValue(getField(position, 'last_price'));
        const currency = getCurrency(getField(position, 'last_price')) || 'NOK';
        
        if (morningPrice && lastPrice) {
          const change = lastPrice - morningPrice;
          const sign = change >= 0 ? '+' : '';
          val = `${sign}${formatNumber(change)} ${currency}`;
          
          if (change > 0) {
            td.className = 'gain-positive';
          } else if (change < 0) {
            td.className = 'gain-negative';
          }
          td.textContent = val;
          tr.appendChild(td);
          return;
        }
      }
      
      // Format value if it's an object with value/currency
      if (val && typeof val === 'object' && val.value !== undefined && val.currency) {
        let num = Number(val.value);
        val = `${formatNumber(num)} ${val.currency}`;
        
        // Add flash effect for last_price
        if (col.key === 'last_price') {
          const symbol = getField(position, 'symbol');
          addPriceFlash(td, symbol, num, previousPrices);
        }
      } else if (typeof val === 'number') {
        val = formatNumber(val);
        
        if (col.key === 'last_price') {
          const symbol = getField(position, 'symbol');
          addPriceFlash(td, symbol, val, previousPrices);
        }
      } else if (val && typeof val === 'object') {
        try {
          val = JSON.stringify(val);
        } catch (e) {
          val = '[object]';
        }
      }
      
      // Color coding for specific columns
      if (col.highlight && val) {
        const numVal = parseFloat(String(val).replace(/[^0-9.-]/g, ''));
        if (!isNaN(numVal)) {
          td.className = numVal >= 0 ? 'gain-positive' : 'gain-negative';
        }
      }
    }
    
    td.textContent = val || '';
    tr.appendChild(td);
  });
  
  return tr;
}

// Update existing position row in place (avoids logo refresh)
export function updatePositionRow(tr, position, columns, previousPrices) {
  const cells = tr.querySelectorAll('td');
  
  columns.forEach((col, idx) => {
    if (idx >= cells.length) return;
    const td = cells[idx];
    
    // Skip logo column - don't update it
    if (col.key === 'logo') {
      return;
    }
    
    let val = '';
    
    // Handle calculated columns
    if (col.isCalculated && col.key === 'day_gl') {
      const lastPrice = getField(position, 'last_price');
      const qty = getField(position, 'qty');
      const morningPrice = getNumericValue(getField(position, 'morning_price'));
      const last = getNumericValue(lastPrice);
      const quantity = getNumericValue(qty);
      const currency = getCurrency(lastPrice) || 'NOK';
      
      if (morningPrice && last && quantity && morningPrice !== last) {
        const dayChange = (last - morningPrice) * quantity;
        const sign = dayChange >= 0 ? '+' : '';
        val = `${sign}${formatNumber(dayChange)} ${currency}`;
        td.className = dayChange > 0 ? 'gain-positive' : (dayChange < 0 ? 'gain-negative' : '');
      } else {
        val = '-';
        td.className = '';
      }
    }
    else if (col.isCalculated && col.key === 'gain_percent') {
      const acqPrice = getNumericValue(getField(position, 'acq_price'));
      const lastPrice = getNumericValue(getField(position, 'last_price'));
      
      if (acqPrice && lastPrice && acqPrice !== 0) {
        const gainPercent = ((lastPrice - acqPrice) / acqPrice) * 100;
        const sign = gainPercent >= 0 ? '+' : '';
        val = `${sign}${formatNumber(gainPercent)}%`;
        td.className = gainPercent > 0 ? 'gain-positive' : (gainPercent < 0 ? 'gain-negative' : '');
      } else {
        val = '-';
        td.className = '';
      }
    }
    else if (col.key === 'change_percent') {
      const morningPrice = getNumericValue(getField(position, 'morning_price'));
      const lastPrice = getNumericValue(getField(position, 'last_price'));
      
      if (morningPrice && lastPrice && morningPrice !== 0) {
        const changePercent = ((lastPrice - morningPrice) / morningPrice) * 100;
        const sign = changePercent >= 0 ? '+' : '';
        val = `${sign}${formatNumber(changePercent)}%`;
        td.className = changePercent > 0 ? 'gain-positive' : (changePercent < 0 ? 'gain-negative' : '');
      } else {
        val = '';
        td.className = '';
      }
    }
    else if (col.key === 'change_today') {
      const morningPrice = getNumericValue(getField(position, 'morning_price'));
      const lastPrice = getNumericValue(getField(position, 'last_price'));
      const currency = getCurrency(getField(position, 'last_price')) || 'NOK';
      
      if (morningPrice && lastPrice) {
        const change = lastPrice - morningPrice;
        const sign = change >= 0 ? '+' : '';
        val = `${sign}${formatNumber(change)} ${currency}`;
        td.className = change > 0 ? 'gain-positive' : (change < 0 ? 'gain-negative' : '');
      } else {
        val = '';
        td.className = '';
      }
    }
    else {
      val = getField(position, col.key);
      
      if (val && typeof val === 'object' && val.value !== undefined && val.currency) {
        let num = Number(val.value);
        val = `${formatNumber(num)} ${val.currency}`;
        
        if (col.key === 'last_price') {
          const symbol = getField(position, 'symbol');
          addPriceFlash(td, symbol, num, previousPrices);
        }
      } else if (typeof val === 'number') {
        val = formatNumber(val);
        
        if (col.key === 'last_price') {
          const symbol = getField(position, 'symbol');
          addPriceFlash(td, symbol, val, previousPrices);
        }
      }
      
      if (col.highlight && val) {
        const numVal = parseFloat(String(val).replace(/[^0-9.-]/g, ''));
        if (!isNaN(numVal)) {
          td.className = numVal >= 0 ? 'gain-positive' : 'gain-negative';
        }
      }
    }
    
    td.textContent = val || '';
  });
}
