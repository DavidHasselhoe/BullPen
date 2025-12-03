// Polling interval for holdings (ms)
const HOLDINGS_POLL_INTERVAL = 1000; // 1 second for near-live updates
let holdingsPollTimer = null;
let currentAccountId = null;

// Sorting state
let currentSortColumn = 'market_value';
let currentSortDirection = 'desc';
let lastSortColumn = null;
let lastSortDirection = null;

// Store previous prices to detect changes
const previousPrices = new Map();

// Store current account info and positions for calculations
let currentAccountInfo = null;
let currentPositions = [];
let accountInfoFetched = false; // Track if we've fetched account info

// Store company profiles (logos, etc.)
const companyProfiles = new Map();

// Store logo DOM elements to avoid recreating them
const logoElements = new Map();

// Exchange rates cache
let exchangeRates = {
  USD: 10.5,
  SEK: 1.0,
  NOK: 1.0
};

// Previous closes cache (for US stocks)
const previousCloses = new Map();

// Global summary across all accounts
let globalSummary = {
  totalValue: 0,
  totalGainLoss: 0,
  todayGainLoss: 0,
  accounts: new Map() // Store per-account data
};

const $ = id => document.getElementById(id);

// Fetch live exchange rates
async function fetchExchangeRates() {
  try {
    const response = await fetch('/api/exchangeRates');
    const result = await response.json();
    if (result.success && result.data) {
      exchangeRates = result.data;
    }
  } catch (error) {
    console.error('Failed to fetch exchange rates, using fallback:', error);
  }
}

// Fetch previous closes for US stocks
async function fetchPreviousCloses(symbols) {
  if (symbols.length === 0) return;
  
  try {
    const symbolsParam = symbols.join(',');
    const response = await fetch(`/api/previous-closes?symbols=${symbolsParam}`);
    const result = await response.json();
    if (result.success && result.data) {
      Object.entries(result.data).forEach(([symbol, prevClose]) => {
        previousCloses.set(symbol, prevClose);
      });
    }
  } catch (error) {
    console.error('Failed to fetch previous closes:', error);
  }
}

// Render global summary across all accounts
function renderGlobalSummary() {
  let summaryDiv = document.getElementById('global-summary');
  if (!summaryDiv) {
    summaryDiv = document.createElement('div');
    summaryDiv.id = 'global-summary';
    summaryDiv.className = 'account-info-summary';
    const accountsDiv = $('accounts');
    accountsDiv.parentNode.insertBefore(summaryDiv, accountsDiv);
  }
  
  const totalValue = globalSummary.totalValue;
  const totalGainLoss = globalSummary.totalGainLoss;
  const todayGainLoss = globalSummary.todayGainLoss;
  const accountCount = globalSummary.accounts.size;
  
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

async function fetchAccounts() {
  const session = $('session').value.trim();
  if (!session) return;
  const includeCredit = false;
  const lang = 'no';

  const url = `/api/accounts?include_credit_accounts=${includeCredit}`;
  const headers = { 'Accept-Language': lang };
  if (session) headers['X-NORDNET-SESSION'] = session;

  $('status').textContent = 'Fetching...';
  $('accounts').innerHTML = '';

  try {
    const resp = await fetch(url, { headers });
    if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText}`);
    const body = await resp.json();
    if (!body.success) throw new Error(body.error || 'unknown error');

    const accounts = body.data.accounts || [];
    renderAccounts(accounts);
    
    // Fetch all account data automatically for global summary
    await fetchAllAccountsSummary(accounts);
    
    $('status').textContent = `Loaded ${ accounts.length } accounts`;
  } catch (err) {
    $('status').textContent = `Error: ${err.message}`;
  }
}

// Fetch all accounts data for global summary
async function fetchAllAccountsSummary(accounts) {
  const session = $('session').value.trim();
  if (!session || !accounts || accounts.length === 0) return;
  
  // Fetch account info and positions for each account
  for (const account of accounts) {
    try {
      // Fetch account info
      const infoResponse = await fetch(`/api/account-info?sessionId=${session}&accid=${account.accid}`);
      const infoData = await infoResponse.json();
      
      if (!infoResponse.ok || !infoData || infoData.length === 0) continue;
      
      const accountInfo = infoData[0];
      
      // Fetch positions
      const posResponse = await fetch(`/api/positions/${account.accid}`, {
        headers: {
          'Accept-Language': 'no',
          'X-NORDNET-SESSION': session
        }
      });
      const posBody = await posResponse.json();
      
      if (!posResponse.ok || !posBody.success) continue;
      
      const positions = posBody.data.positions || [];
      
      // Calculate G/L for this account
      const totalValue = accountInfo.own_capital?.value || 0;
      let totalGainLoss = 0;
      let todayGainLoss = 0;
      
      positions.forEach(p => {
        const getNumeric = (v) => {
          if (v && typeof v === 'object' && v.value !== undefined) return Number(v.value);
          if (typeof v === 'number') return v;
          return 0;
        };
        
        const getCurrency = (v) => {
          if (v && typeof v === 'object' && v.currency) return v.currency;
          return null;
        };
        
        const acqPrice = getNumeric(p.acq_price || p.instrument?.acq_price);
        const lastPrice = getNumeric(p.last_price || p.main_market_price || p.instrument?.last_price);
        const qty = getNumeric(p.qty);
        const priceCurrency = getCurrency(p.last_price || p.main_market_price || p.instrument?.last_price);
        
    if (acqPrice && lastPrice && qty) {
      let gainLoss = (lastPrice - acqPrice) * qty;
      if (priceCurrency === 'USD') gainLoss *= exchangeRates.USD;
      else if (priceCurrency === 'SEK') gainLoss *= exchangeRates.SEK;
      totalGainLoss += gainLoss;
    }        const morningPrice = getNumeric(p.morning_price || p.instrument?.morning_price);
        if (morningPrice && lastPrice && qty) {
          let todayChange = (lastPrice - morningPrice) * qty;
          if (priceCurrency === 'USD') todayChange *= 10.5;
          else if (priceCurrency === 'SEK') todayChange *= 1.0;
          todayGainLoss += todayChange;
        }
      });
      
      // Store in global summary
      globalSummary.accounts.set(account.accid, {
        totalValue,
        totalGainLoss,
        todayGainLoss
      });
      
    } catch (error) {
      console.error(`Failed to fetch data for account ${account.accid}:`, error);
    }
  }
  
  // Recalculate global totals
  globalSummary.totalValue = 0;
  globalSummary.totalGainLoss = 0;
  globalSummary.todayGainLoss = 0;
  
  globalSummary.accounts.forEach(acc => {
    globalSummary.totalValue += acc.totalValue;
    globalSummary.totalGainLoss += acc.totalGainLoss;
    globalSummary.todayGainLoss += acc.todayGainLoss;
  });
  
  // Render global summary
  renderGlobalSummary();
}

function renderAccounts(accounts) {
  if (!accounts || accounts.length === 0) {
    $('accounts').innerHTML = '<p>No accounts found.</p>';
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
  thead.innerHTML = '<tr>' + columns.map(c => `<th${c.align ? ' style="text-align:' + c.align + '"' : ''}>${c.label}</th>`).join('') + '</tr>';
  table.appendChild(thead);
  const tbody = document.createElement('tbody');
  accounts.forEach((a, idx) => {
    const tr = document.createElement('tr');
    tr.title = 'Click to view holdings';
    tr.addEventListener('click', () => fetchPositions(a.accid));
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
  $('accounts').innerHTML = '';
  $('accounts').appendChild(table);
  // Add a div for positions/holdings display
  if (!document.getElementById('positions')) {
    const posDiv = document.createElement('div');
    posDiv.id = 'positions';
    $('accounts').appendChild(posDiv);
  }
}

// Fetch account info for a given account
async function fetchAccountInfo(accid) {
  const session = $('session').value.trim();
  if (!session) return;

  try {
    const response = await fetch(`/api/account-info?sessionId=${session}&accid=${accid}`);
    const data = await response.json();
    
    if (response.ok && data.length > 0) {
      currentAccountInfo = data[0];
      renderAccountInfo(currentAccountInfo, currentPositions);
    }
  } catch (error) {
    console.error('Error fetching account info:', error);
  }
}

// Render account info summary
function renderAccountInfo(info, positions = []) {
  let infoDiv = document.getElementById('account-info');
  if (!infoDiv) {
    infoDiv = document.createElement('div');
    infoDiv.id = 'account-info';
    infoDiv.className = 'account-info-summary';
    const posDiv = document.getElementById('positions');
    posDiv.parentNode.insertBefore(infoDiv, posDiv);
  }
  
  const totalValue = info.own_capital?.value || 0;
  const currency = info.own_capital?.currency || 'NOK';
  
  // Calculate total G/L, today's G/L, and total position value from positions
  let totalGainLoss = 0;
  let todayGainLoss = 0;
  let totalPositionValue = 0;
  
  positions.forEach(p => {
    const getNumeric = (v) => {
      if (v && typeof v === 'object' && v.value !== undefined) return Number(v.value);
      if (typeof v === 'number') return v;
      return 0;
    };
    
    const getCurrency = (v) => {
      if (v && typeof v === 'object' && v.currency) return v.currency;
      return null;
    };
    
    // Total G/L: (last_price - acq_price) * qty
    const acqPrice = getNumeric(p.acq_price || p.instrument?.acq_price);
    const lastPrice = getNumeric(p.last_price || p.main_market_price || p.instrument?.last_price);
    const qty = getNumeric(p.qty);
    const priceCurrency = getCurrency(p.last_price || p.main_market_price || p.instrument?.last_price);
    
    if (acqPrice && lastPrice && qty) {
      let gainLoss = (lastPrice - acqPrice) * qty;
      // Convert to NOK if needed
      if (priceCurrency === 'USD') gainLoss *= exchangeRates.USD;
      else if (priceCurrency === 'SEK') gainLoss *= exchangeRates.SEK;
      totalGainLoss += gainLoss;
    }
    
    // Today's G/L: (last_price - morning_price) * qty
    // Use morning_price as reference (handles market holidays correctly)
    const symbol = p.symbol || p.instrument?.symbol;
    let referencePrice = getNumeric(p.morning_price || p.instrument?.morning_price);
    
    if (referencePrice && lastPrice && qty) {
      let todayChange = (lastPrice - referencePrice) * qty;
      // Convert to NOK if needed
      if (priceCurrency === 'USD') todayChange *= exchangeRates.USD;
      else if (priceCurrency === 'SEK') todayChange *= exchangeRates.SEK;
      todayGainLoss += todayChange;
    }
    
    // Sum up market values (already in correct currency from API)
    const marketValue = getNumeric(p.market_value);
    const marketCurrency = getCurrency(p.market_value);
    let convertedMarketValue = marketValue;
    
    // Convert market value to NOK if needed
    if (marketCurrency === 'USD') convertedMarketValue *= exchangeRates.USD;
    else if (marketCurrency === 'SEK') convertedMarketValue *= exchangeRates.SEK;
    
    totalPositionValue += convertedMarketValue;
  });
  
  // Cash balance = Total Value - Total Position Value
  const cashBalance = totalValue - totalPositionValue;
  
  const totalGLColor = totalGainLoss >= 0 ? '#10b981' : '#ef4444';
  const todayGLColor = todayGainLoss >= 0 ? '#10b981' : '#ef4444';
  const totalGLSign = totalGainLoss >= 0 ? '+' : '';
  const todayGLSign = todayGainLoss >= 0 ? '+' : '';
  const todayGLShadow = todayGainLoss >= 0 ? '0 0 15px rgba(16, 185, 129, 0.6)' : '0 0 15px rgba(239, 68, 68, 0.6)';
  
  // Update global summary
  globalSummary.accounts.set(currentAccountId, {
    totalValue,
    totalGainLoss,
    todayGainLoss
  });
  
  // Recalculate global totals
  globalSummary.totalValue = 0;
  globalSummary.totalGainLoss = 0;
  globalSummary.todayGainLoss = 0;
  
  globalSummary.accounts.forEach(acc => {
    globalSummary.totalValue += acc.totalValue;
    globalSummary.totalGainLoss += acc.totalGainLoss;
    globalSummary.todayGainLoss += acc.todayGainLoss;
  });
  
  // Render global summary
  renderGlobalSummary();
  
  infoDiv.innerHTML = `
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

async function fetchPositions(accid) {
  if (!accid) return;
    // Cancel previous polling if switching accounts
    if (holdingsPollTimer) {
      clearTimeout(holdingsPollTimer);
      holdingsPollTimer = null;
    }
    
    // Reset account info flag if switching accounts
    if (currentAccountId !== accid) {
      accountInfoFetched = false;
      currentAccountInfo = null;
    }
    
    currentAccountId = accid;
  
  // Fetch account info only once (not on every poll)
  if (!accountInfoFetched) {
    accountInfoFetched = true;
    fetchAccountInfo(accid);
  }
  
  const session = $('session').value.trim();
  const lang = 'no';
  const url = `/api/positions/${accid}`;
  const headers = { 'Accept-Language': lang };
  if (session) headers['X-NORDNET-SESSION'] = session;
  const posDiv = document.getElementById('positions');
  
  // Only show loading message on first load
  if (!posDiv.querySelector('table.holdings-table')) {
    posDiv.textContent = 'Loading holdings...';
  }
  
  try {
    const resp = await fetch(url, { headers });
    if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText}`);
    const body = await resp.json();
    if (!body.success) throw new Error(body.error || 'unknown error');
    renderPositions(body.data.positions || []);
  } catch (err) {
    posDiv.textContent = `Error loading holdings: ${err.message}`;
    return; // Don't schedule next poll on error
  }
    // Schedule next poll if still viewing this account
    if (currentAccountId === accid) {
      holdingsPollTimer = setTimeout(() => fetchPositions(accid), HOLDINGS_POLL_INTERVAL);
    }
}

function renderPositions(positions) {
  const posDiv = document.getElementById('positions');
  if (!positions || positions.length === 0) {
    posDiv.innerHTML = '<p>No holdings found for this account.</p>';
    return;
  }
  
  // Store positions globally
  currentPositions = positions;
  
  // Only update account summary if account info is available and G/L values changed
  // (to avoid unnecessary re-renders)
  if (currentAccountInfo && accountInfoFetched) {
    renderAccountInfo(currentAccountInfo, currentPositions);
  }
  
  // Define the columns to show (if present)
  const columns = [
    { key: 'logo', label: '', sortable: false },
    { key: 'name', label: 'Name', sortable: false },
    { key: 'symbol', label: 'Symbol', sortable: false },
    { key: 'qty', label: 'Quantity', align: 'right', sortable: true },
    { key: 'acq_price', label: 'Acq. Price', align: 'right', sortable: true },
    { key: 'last_price', label: 'Last Price', align: 'right', sortable: true },
    { key: 'day_gl', label: 'Day G/L', align: 'right', isCalculated: true, sortable: true },
    { key: 'change_today', label: 'Day NOK/USD', align: 'right', sortable: true },
    { key: 'change_percent', label: 'Day %', align: 'right', sortable: true },
    { key: 'gain_percent', label: 'G/L %', align: 'right', isCalculated: true, sortable: true },
    { key: 'market_value', label: 'Market Value', align: 'right', highlight: true, sortable: true }
  ];
  
  // Helper to extract from instrument object if present
  function getField(p, key) {
    // Special handling for last_price - try multiple sources
    if (key === 'last_price') {
      // Try last_price directly
      if (p.last_price !== undefined) return p.last_price;
      // Try main_market_price
      if (p.main_market_price !== undefined) return p.main_market_price;
      // Try instrument.last_price
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
    if (p.instrument && typeof p.instrument === 'object' && p.instrument[key] !== undefined) return p.instrument[key];
    return '';
  }
  
  // Fetch company profiles for US stocks (only if not already fetched)
  // Also collect US stock symbols for previous close fetching
  const usStockSymbols = [];
  positions.forEach(async (p) => {
    const symbol = getField(p, 'symbol');
    if (symbol && !symbol.includes('.') && !symbol.includes(':')) {
      // This is likely a US stock
      usStockSymbols.push(symbol);
      
      if (!companyProfiles.has(symbol)) {
        try {
          const response = await fetch(`/api/finnhub-profile?symbol=${symbol}`);
          if (response.ok) {
            const profile = await response.json();
            if (profile && Object.keys(profile).length > 0) {
              companyProfiles.set(symbol, profile);
              // Trigger a re-render to show the logo (if present)
              setTimeout(() => renderPositions(currentPositions), 100);
            }
          }
        } catch (error) {
          // Silently fail - will show placeholder
        }
      }
    }
  });

  // Fetch previous closes for US stocks
  if (usStockSymbols.length > 0) {
    fetchPreviousCloses(usStockSymbols);
  }

  // Helper for number formatting
  function formatNumber(val, decimals = 2) {
    if (typeof val !== 'number') val = Number(val);
    if (isNaN(val)) return '';
    return val.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  }

  // Helper to add flash effect on price change
  function addPriceFlash(td, symbol, currentPrice) {
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

  // Function to sort positions
  function sortPositions(positions, column, direction) {
    return positions.slice().sort((a, b) => {
      let aVal, bVal;

      if (column === 'market_value') {
        // Special handling for market value with currency conversion
        const getVal = p => {
          let v = p.market_value;
          let value = 0;
          let currency = '';
          
          if (v && typeof v === 'object' && v.value !== undefined) {
            value = Number(v.value) || 0;
            currency = v.currency || '';
          } else if (typeof v === 'number') {
            value = v;
          }
          
          // Convert to NOK for comparison
          if (currency === 'USD') {
            value = value * exchangeRates.USD;
          } else if (currency === 'SEK') {
            value = value * exchangeRates.SEK;
          }
          
          return value;
        };
        aVal = getVal(a);
        bVal = getVal(b);
      } else if (column === 'change_percent' || column === 'change_today') {
        // Calculate day change if not directly available
        const getChangePercent = p => {
          const getNumeric = (v) => {
            if (v && typeof v === 'object' && v.value !== undefined) return Number(v.value);
            if (typeof v === 'number') return v;
            return null;
          };
          
          let changePercent = getNumeric(getField(p, 'change_percent'));
          
          if (changePercent === null) {
            const morningPrice = getField(p, 'morning_price');
            const lastPrice = getField(p, 'last_price');
            const morning = getNumeric(morningPrice);
            const last = getNumeric(lastPrice);
            
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
        const getGainPercent = p => {
          const getNumeric = (v) => {
            if (v && typeof v === 'object' && v.value !== undefined) return Number(v.value);
            if (typeof v === 'number') return v;
            return null;
          };
          
          const acqPrice = getField(p, 'acq_price');
          const lastPrice = getField(p, 'last_price');
          const acq = getNumeric(acqPrice);
          const last = getNumeric(lastPrice);
          
          if (acq && last && acq !== 0) {
            return ((last - acq) / acq) * 100;
          }
          return 0;
        };
        aVal = getGainPercent(a);
        bVal = getGainPercent(b);
      } else if (column === 'day_gl') {
        // Calculate day gain/loss
        const getDayGL = p => {
          const getNumeric = (v) => {
            if (v && typeof v === 'object' && v.value !== undefined) return Number(v.value);
            if (typeof v === 'number') return v;
            return null;
          };
          
          const lastPrice = getField(p, 'last_price');
          const qty = getField(p, 'qty');
          const symbol = getField(p, 'symbol');
          
          // Use previous close for US stocks, morning price for others
          let referencePrice = null;
          
          // For US stocks (no dots/colons), try previousCloses first
          if (symbol && !symbol.includes('.') && !symbol.includes(':')) {
            if (previousCloses.has(symbol)) {
              referencePrice = previousCloses.get(symbol);
            }
          }
          
          // If no previous close found, use morning_price
          if (!referencePrice) {
            referencePrice = getNumeric(getField(p, 'morning_price'));
          }
          
          const last = getNumeric(lastPrice);
          const quantity = getNumeric(qty);
          
          if (referencePrice && last && quantity && referencePrice !== last) {
            return (last - referencePrice) * quantity;
          }
          return 0;
        };
        aVal = getDayGL(a);
        bVal = getDayGL(b);
      } else {
        // Generic numeric field
        const getNumeric = (v) => {
          if (v && typeof v === 'object' && v.value !== undefined) return Number(v.value);
          if (typeof v === 'number') return v;
          return 0;
        };
        aVal = getNumeric(getField(a, column));
        bVal = getNumeric(getField(b, column));
      }

      if (direction === 'asc') {
        return aVal - bVal;
      } else {
        return bVal - aVal;
      }
    });
  }

  // Initial sort
  positions = sortPositions(positions, currentSortColumn, currentSortDirection);

  // Check if table already exists - if so, just update cells instead of rebuilding
  let tableWrapper = posDiv.querySelector('.table-wrapper');
  let logosColumn = posDiv.querySelector('.logos-column');
  let table = posDiv.querySelector('table.holdings-table');
  
  if (!table) {
    // First time - create the structure
    posDiv.innerHTML = '<h3>Holdings</h3>';
    
    table = document.createElement('table');
    table.className = 'accounts holdings-table';
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    
    columns.forEach(c => {
      const th = document.createElement('th');
      if (c.align) th.style.textAlign = c.align;
      th.dataset.column = c.key; // Store column key for later reference
      
      if (c.sortable) {
        th.style.cursor = 'pointer';
        th.style.userSelect = 'none';
        th.title = 'Click to sort';
        
        th.addEventListener('click', () => {
          // Toggle direction if same column, otherwise default to desc
          if (currentSortColumn === c.key) {
            currentSortDirection = currentSortDirection === 'desc' ? 'asc' : 'desc';
          } else {
            currentSortColumn = c.key;
            currentSortDirection = 'desc';
          }
          
          // Re-render with new sort (don't re-fetch, just re-render current data)
          // Store current positions temporarily
          const currentPositions = Array.from(tbody.querySelectorAll('tr')).map(row => {
            return positions[row.dataset.index];
          });
          
          renderPositions(positions);
        });
      }
      
      th.textContent = c.label;
      headerRow.appendChild(th);
    });
    
    thead.appendChild(headerRow);
    table.appendChild(thead);
    const tbody = document.createElement('tbody');
    table.appendChild(tbody);
    posDiv.appendChild(table);
  }
  
  // Update sort indicators on headers
  const headers = table.querySelectorAll('th[data-column]');
  headers.forEach(th => {
    const col = th.dataset.column;
    if (col === currentSortColumn) {
      th.textContent = th.textContent.replace(/ [↑↓]/, '') + (currentSortDirection === 'desc' ? ' ↓' : ' ↑');
      th.style.fontWeight = 'bold';
      th.style.color = '#0066cc';
    } else {
      th.textContent = th.textContent.replace(/ [↑↓]/, '');
      th.style.fontWeight = 'bold';
      th.style.color = '';
    }
  });

  const tbody = table.querySelector('tbody');
  
  // Check if we need to rebuild (different number of positions, first render, or sorting changed)
  const existingRows = tbody.querySelectorAll('tr');
  const sortChanged = (lastSortColumn !== currentSortColumn) || (lastSortDirection !== currentSortDirection);
  const needsRebuild = existingRows.length !== positions.length || sortChanged;
  
  // Update last sort state
  lastSortColumn = currentSortColumn;
  lastSortDirection = currentSortDirection;
  
  if (needsRebuild) {
    // Full rebuild needed
    tbody.innerHTML = '';
    
    positions.forEach((p, idx) => {
      const tr = document.createElement('tr');
      tr.dataset.index = idx;
      const symbol = getField(p, 'symbol');
      tr.dataset.symbol = symbol;
      
      // Make row clickable
      tr.style.cursor = 'pointer';
      tr.title = 'Click to view detailed information';
      tr.addEventListener('click', () => {
        const symbol = getField(p, 'symbol');
        if (symbol) {
          const positionData = encodeURIComponent(JSON.stringify(p));
          window.location.href = `/detail.html?symbol=${encodeURIComponent(symbol)}&position=${positionData}`;
        }
      });
      
      columns.forEach(col => {
        const td = document.createElement('td');
        if (col.align) td.style.textAlign = col.align;
        td.dataset.column = col.key;
        
        // Render logo in the logo column
        if (col.key === 'logo') {
          td.style.width = '40px';
          td.style.padding = '4px';
          const symbol = getField(p, 'symbol');
          
          if (!logoElements.has(symbol)) {
            const profile = companyProfiles.get(symbol);
            if (profile && profile.logo) {
              const img = document.createElement('img');
              img.src = profile.logo;
              img.alt = symbol;
              img.style.width = '32px';
              img.style.height = '32px';
              img.style.borderRadius = '6px';
              img.style.objectFit = 'contain';
              logoElements.set(symbol, img);
            } else {
              // Fallback: create a placeholder with symbol initials
              const placeholder = document.createElement('div');
              placeholder.style.width = '32px';
              placeholder.style.height = '32px';
              placeholder.style.borderRadius = '6px';
              // Generate color based on symbol to make each unique
              const hash = symbol ? symbol.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) : 0;
              const hue = hash % 360;
              placeholder.style.background = `linear-gradient(135deg, hsl(${hue}, 60%, 65%), hsl(${hue}, 60%, 50%))`;
              placeholder.style.display = 'flex';
              placeholder.style.alignItems = 'center';
              placeholder.style.justifyContent = 'center';
              placeholder.style.fontSize = '11px';
              placeholder.style.fontWeight = '600';
              placeholder.style.color = '#fff';
              placeholder.style.textShadow = '0 1px 2px rgba(0,0,0,0.2)';
              placeholder.style.boxShadow = '0 1px 3px rgba(0,0,0,0.12)';
              placeholder.textContent = symbol ? symbol.substring(0, 2).toUpperCase() : '?';
              placeholder.title = symbol;
              logoElements.set(symbol, placeholder);
            }
          }
          
          const cachedLogo = logoElements.get(symbol);
          if (cachedLogo) {
            td.appendChild(cachedLogo.cloneNode(true));
          }
        }
        
        tr.appendChild(td);
      });
      
      tbody.appendChild(tr);
    });
  }
  
  // Update logo cells if new profiles have been loaded
  positions.forEach((p, idx) => {
    const symbol = getField(p, 'symbol');
    const profile = companyProfiles.get(symbol);
    
    // If we have a profile with a logo but haven't cached it yet (or only have placeholder)
    if (profile && profile.logo) {
      const cached = logoElements.get(symbol);
      // Check if cached element is a placeholder (div) rather than an image
      if (!cached || cached.tagName === 'DIV') {
        // Create/update the logo image
        const img = document.createElement('img');
        img.src = profile.logo;
        img.alt = symbol;
        img.style.width = '32px';
        img.style.height = '32px';
        img.style.borderRadius = '6px';
        img.style.objectFit = 'contain';
        logoElements.set(symbol, img);
        
        // Update the cell in the DOM
        const tr = tbody.querySelectorAll('tr')[idx];
        if (tr) {
          const logoCell = tr.querySelector('td[data-column="logo"]');
          if (logoCell) {
            logoCell.innerHTML = '';
            logoCell.appendChild(img.cloneNode(true));
          }
        }
      }
    }
  });
  
  // Update cell values without rebuilding DOM
  positions.forEach((p, idx) => {
    const tr = tbody.querySelectorAll('tr')[idx];
    if (!tr) return;
    
    const symbol = getField(p, 'symbol');
    const cells = tr.querySelectorAll('td');
    
    columns.forEach((col, colIdx) => {
      const td = cells[colIdx];
      if (!td) return;
      
      // Skip logo column updates - logos are static
      if (col.key === 'logo') return;
      
      let val = getField(p, col.key);
      
      // Handle daily change percent with color coding
      if (col.key === 'change_percent') {
        const getNumeric = (v) => {
          if (v && typeof v === 'object' && v.value !== undefined) return Number(v.value);
          if (typeof v === 'number') return v;
          return null;
        };
        
        // Try to get change_percent from API, or calculate from morning_price
        let changePercent = getNumeric(val);
        
        if (changePercent === null) {
          // Calculate from morning_price and last_price
          const morningPrice = getField(p, 'morning_price');
          const lastPrice = getField(p, 'last_price');
          const morning = getNumeric(morningPrice);
          const last = getNumeric(lastPrice);
          
          if (morning && last && morning !== 0) {
            changePercent = ((last - morning) / morning) * 100;
          }
        }
        
        if (changePercent !== null && !isNaN(changePercent)) {
          const sign = changePercent >= 0 ? '+' : '';
          val = sign + changePercent.toFixed(2) + '%';
          
          // Add CSS class for color coding
          if (changePercent > 0) {
            td.className = 'gain-positive';
          } else if (changePercent < 0) {
            td.className = 'gain-negative';
          }
        } else {
          val = '-';
        }
      }
      // Handle daily change amount with color coding
      else if (col.key === 'change_today') {
        const getNumeric = (v) => {
          if (v && typeof v === 'object' && v.value !== undefined) return Number(v.value);
          if (typeof v === 'number') return v;
          return null;
        };
        
        let changeVal = null;
        let currency = '';
        
        if (val && typeof val === 'object' && val.value !== undefined) {
          changeVal = Number(val.value);
          currency = val.currency || '';
        } else if (typeof val === 'number') {
          changeVal = val;
        }
        
        // If no change_today from API, calculate from morning_price and last_price
        if (changeVal === null || isNaN(changeVal)) {
          const morningPrice = getField(p, 'morning_price');
          const lastPrice = getField(p, 'last_price');
          const morning = getNumeric(morningPrice);
          const last = getNumeric(lastPrice);
          
          if (morning && last) {
            changeVal = last - morning;
            // Get currency from last_price or market_value
            const lastPriceObj = getField(p, 'last_price');
            const marketValueObj = getField(p, 'market_value');
            if (lastPriceObj && typeof lastPriceObj === 'object' && lastPriceObj.currency) {
              currency = lastPriceObj.currency;
            } else if (marketValueObj && typeof marketValueObj === 'object' && marketValueObj.currency) {
              currency = marketValueObj.currency;
            }
          }
        }
        
        if (changeVal !== null && !isNaN(changeVal)) {
          const sign = changeVal >= 0 ? '+' : '';
          val = `${sign}${formatNumber(changeVal)}${currency ? ' ' + currency : ''}`;
          
          // Add CSS class for color coding
          if (changeVal > 0) {
            td.className = 'gain-positive';
          } else if (changeVal < 0) {
            td.className = 'gain-negative';
          }
        } else {
          val = '-';
        }
      }
      // Calculate gain/loss percentage
      else if (col.isCalculated && col.key === 'gain_percent') {
        const acqPrice = getField(p, 'acq_price');
        const lastPrice = getField(p, 'last_price');
        
        // Extract numeric values from objects if needed
        const getNumeric = (v) => {
          if (v && typeof v === 'object' && v.value !== undefined) return Number(v.value);
          if (typeof v === 'number') return v;
          return null;
        };
        
        const acq = getNumeric(acqPrice);
        const last = getNumeric(lastPrice);
        
        if (acq && last && acq !== 0) {
          const percentChange = ((last - acq) / acq) * 100;
          const sign = percentChange >= 0 ? '+' : '';
          val = sign + percentChange.toFixed(2) + '%';
          
          // Add CSS class for color coding
          if (percentChange > 0) {
            td.className = 'gain-positive';
          } else if (percentChange < 0) {
            td.className = 'gain-negative';
          }
        } else {
          val = '-';
        }
      }
      // Calculate day gain/loss in currency
      else if (col.isCalculated && col.key === 'day_gl') {
        const lastPrice = getField(p, 'last_price');
        const qty = getField(p, 'qty');
        const symbol = getField(p, 'symbol');
        
        const getNumeric = (v) => {
          if (v && typeof v === 'object' && v.value !== undefined) return Number(v.value);
          if (typeof v === 'number') return v;
          return null;
        };
        
        const getCurrency = (v) => {
          if (v && typeof v === 'object' && v.currency) return v.currency;
          return null;
        };
        
        // Use morning_price as reference (handles market holidays correctly)
        let referencePrice = getNumeric(getField(p, 'morning_price'));
        
        const last = getNumeric(lastPrice);
        const quantity = getNumeric(qty);
        const currency = getCurrency(lastPrice) || 'NOK';
        
        if (referencePrice && last && quantity && referencePrice !== last) {
          const dayChange = (last - referencePrice) * quantity;
          const sign = dayChange >= 0 ? '+' : '';
          val = `${sign}${formatNumber(dayChange)} ${currency}`;
          
          // Add CSS class for color coding
          if (dayChange > 0) {
            td.className = 'gain-positive';
          } else if (dayChange < 0) {
            td.className = 'gain-negative';
          }
        } else {
          val = '-';
        }
      } else if (val && typeof val === 'object' && val.value !== undefined && val.currency) {
        // If value is object with value/currency, show as "value currency" and format value
        let num = Number(val.value);
        val = `${formatNumber(num)} ${val.currency}`;
        
        // Add flash effect for last_price
        if (col.key === 'last_price') {
          const symbol = getField(p, 'symbol');
          addPriceFlash(td, symbol, num);
        }
      } else if (typeof val === 'number') {
        val = formatNumber(val);
        
        // Add flash effect for last_price
        if (col.key === 'last_price') {
          const symbol = getField(p, 'symbol');
          addPriceFlash(td, symbol, val);
        }
      } else if (val && typeof val === 'object') {
        try {
          val = JSON.stringify(val);
        } catch (e) {
          val = '[object]';
        }
      }
      
      if (col.highlight) {
        td.className = 'highlight';
      }
      td.textContent = val;
    });
  });
}


// Remember session id in localStorage
const SESSION_KEY = 'nordnet_session_id';

// On load, auto-fill session id if saved and auto-fetch
window.addEventListener('load', () => {
  // Fetch exchange rates first
  fetchExchangeRates();
  
  const saved = localStorage.getItem(SESSION_KEY);
  if (saved) {
    $('session').value = saved;
    fetchAccounts();
  }
});

// Save session id on change and auto-fetch
$('session').addEventListener('change', () => {
  const val = $('session').value.trim();
  if (val) {
    localStorage.setItem(SESSION_KEY, val);
    fetchAccounts();
  } else {
    localStorage.removeItem(SESSION_KEY);
  }
});

// Also trigger on paste
$('session').addEventListener('paste', () => {
  setTimeout(() => {
    const val = $('session').value.trim();
    if (val) {
      localStorage.setItem(SESSION_KEY, val);
      fetchAccounts();
    }
  }, 100);
});
