// Main portfolio dashboard orchestration
import { $ } from './js/utils.js';
import * as API from './js/api.js';
import { calculatePortfolioSummary } from './js/calculations.js';
import { renderGlobalSummary, renderAccounts, renderAccountInfo, createTableHeader, createPositionRow, updatePositionRow } from './js/ui.js';
import { setCompanyProfile, hasCompanyProfile, getCompanyProfile } from './js/logos.js';
import { sortPositions } from './js/sorting.js';
import { animateBlurText } from './js/textAnimation.js';

// Polling interval for holdings (ms)
const HOLDINGS_POLL_INTERVAL = 1000; // 1 second for near-live updates
let holdingsPollTimer = null;
let currentAccountId = null;

// Sorting state
let currentSortColumn = 'market_value';
let currentSortDirection = 'desc';
let lastSortColumn = null;
let lastSortDirection = null;

// Track if profiles have been updated (to force rebuild for logos)
let profilesUpdated = false;

// Store previous prices to detect changes
const previousPrices = new Map();

// Store current account info and positions for calculations
let currentAccountInfo = null;
let currentPositions = [];
let accountInfoFetched = false;

// Exchange rates cache
let exchangeRates = {
  USD: 10.5,
  SEK: 1.0,
  NOK: 1.0
};

// Global summary across all accounts
let globalSummary = {
  totalValue: 0,
  totalGainLoss: 0,
  todayGainLoss: 0,
  accounts: new Map()
};

// Column definitions
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

// Animate the title text only once on page load
const titleElement = document.getElementById('dashboard-title');
if (titleElement) {
  animateBlurText(titleElement, {
    delay: 30,
    duration: 800,
    stagger: true
  });
}

// Fetch and display market status
async function fetchMarketStatus() {
  try {
    const response = await fetch('/api/market-status');
    const data = await response.json();
    
    const statusDiv = document.getElementById('market-status');
    if (!statusDiv) return;
    
    // US Market
    const usMarket = data['🇺🇸'];
    const usIndicator = document.createElement('div');
    usIndicator.className = 'market-indicator';
    usIndicator.innerHTML = `
      <span class="market-flag">🇺🇸</span>
      <span class="market-dot ${usMarket.isOpen ? 'open' : 'closed'}"></span>
    `;
    usIndicator.title = `US Market: ${usMarket.isOpen ? 'Open' : 'Closed'} (${usMarket.hours})`;
    
    // Norwegian Market
    const noMarket = data['🇳🇴'];
    const noIndicator = document.createElement('div');
    noIndicator.className = 'market-indicator';
    noIndicator.innerHTML = `
      <span class="market-flag">🇳🇴</span>
      <span class="market-dot ${noMarket.isOpen ? 'open' : 'closed'}"></span>
    `;
    noIndicator.title = `Norwegian Market: ${noMarket.isOpen ? 'Open' : 'Closed'} (${noMarket.hours})`;
    
    statusDiv.innerHTML = '';
    statusDiv.appendChild(usIndicator);
    statusDiv.appendChild(noIndicator);
  } catch (error) {
    console.error('Error fetching market status:', error);
  }
}

// Initialize exchange rates on page load
(async function init() {
  exchangeRates = await API.fetchExchangeRates();
  
  // Fetch market status
  fetchMarketStatus();
  // Refresh every 5 minutes
  setInterval(fetchMarketStatus, 5 * 60 * 1000);
  
  // Store session in localStorage
  const sessionInput = $('session');
  
  // Load session from localStorage and auto-fetch if available
  const savedSession = localStorage.getItem('nordnet_session_id');
  if (savedSession) {
    sessionInput.value = savedSession;
    loadAccounts();
  }
  
  // Save session and auto-fetch on change
  sessionInput.addEventListener('change', () => {
    const val = sessionInput.value.trim();
    if (val) {
      localStorage.setItem('nordnet_session_id', val);
      loadAccounts();
    } else {
      localStorage.removeItem('nordnet_session_id');
    }
  });
  
  // Also trigger on paste
  sessionInput.addEventListener('paste', () => {
    setTimeout(() => {
      const val = sessionInput.value.trim();
      if (val) {
        localStorage.setItem('nordnet_session_id', val);
        loadAccounts();
      }
    }, 100);
  });
  
  // Attach event listeners
  $('fetch-accounts-btn').addEventListener('click', loadAccounts);
})();

// Fetch all accounts data for global summary
async function fetchAllAccountsSummary(accounts) {
  const session = $('session').value.trim();
  if (!session || !accounts || accounts.length === 0) return;
  
  // Fetch account info and positions for each account
  for (const account of accounts) {
    try {
      const accountId = account.accid || account.id;
      
      // Fetch account info
      const accountInfo = await API.fetchAccountInfo(session, accountId);
      
      if (!accountInfo) continue;
      
      // Fetch positions
      const positions = await API.fetchPositions(accountId, session);
      
      // Calculate G/L for this account (even if no positions)
      const summary = calculatePortfolioSummary(positions || [], exchangeRates);
      const totalValue = accountInfo.own_capital?.value || 0;
      
      // Store in global summary
      globalSummary.accounts.set(accountId, {
        totalValue,
        totalGainLoss: summary.totalGainLoss,
        todayGainLoss: summary.todayGainLoss
      });
      
    } catch (error) {
      // Silently continue if account data fetch fails
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
  renderGlobalSummary(globalSummary);
}

// Fetch and render accounts
async function loadAccounts() {
  const session = $('session').value.trim();
  if (!session) return;
  
  $('status').textContent = 'Fetching...';
  $('accounts').innerHTML = '';
  
  try {
    const accounts = await API.fetchAccounts(session);
    
    if (!accounts || accounts.length === 0) {
      $('status').textContent = 'No accounts found';
      return;
    }
    
    $('status').textContent = `${accounts.length} account(s) loaded. Click an account to view holdings.`;
    renderAccounts(accounts, fetchPositionsForAccount);
    
    // Fetch all account data automatically for global summary
    await fetchAllAccountsSummary(accounts);
    
    // Automatically open the first account
    if (accounts.length > 0) {
      const firstAccountId = accounts[0].accid || accounts[0].id;
      fetchPositionsForAccount(firstAccountId);
    }
    
  } catch (err) {
    $('status').textContent = `Error loading accounts: ${err.message}`;
    $('accounts').innerHTML = '';
  }
}

// Fetch account info
async function fetchAccountInfo(accid) {
  const session = $('session').value.trim();
  
  try {
    const accountInfo = await API.fetchAccountInfo(session, accid);
    currentAccountInfo = accountInfo;
    
    // Calculate G/L from positions
    const summary = calculatePortfolioSummary(currentPositions, exchangeRates);
    
    // Update global summary for this account
    const totalValue = accountInfo.own_capital?.value || 0;
    globalSummary.accounts.set(accid, {
      totalValue,
      totalGainLoss: summary.totalGainLoss,
      todayGainLoss: summary.todayGainLoss
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
    renderGlobalSummary(globalSummary);
    
    // Render account info with calculated values
    renderAccountInfo(accountInfo, summary.todayGainLoss);
  } catch (err) {
    const accinfoDiv = $('accinfo');
    if (accinfoDiv) {
      accinfoDiv.textContent = `Error: ${err.message}`;
    }
  }
}

// Fetch positions for an account
async function fetchPositionsForAccount(accid) {
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
  
  const session = $('session').value.trim();
  const posDiv = $('positions');
  
  // Only show loading message on first load
  if (!posDiv.querySelector('table.holdings-table')) {
    posDiv.textContent = 'Loading holdings...';
  }
  
  try {
    const positions = await API.fetchPositions(accid, session);
    currentPositions = positions;
    
    // Fetch account info only once (not on every poll) - but AFTER positions are loaded
    if (!accountInfoFetched) {
      accountInfoFetched = true;
      await fetchAccountInfo(accid);
    } else {
      // On polling updates, recalculate and update the summary
      if (currentAccountInfo) {
        const summary = calculatePortfolioSummary(currentPositions, exchangeRates);
        const totalValue = currentAccountInfo.own_capital?.value || 0;
        globalSummary.accounts.set(accid, {
          totalValue,
          totalGainLoss: summary.totalGainLoss,
          todayGainLoss: summary.todayGainLoss
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
        
        renderGlobalSummary(globalSummary);
        renderAccountInfo(currentAccountInfo, summary.todayGainLoss);
      }
    }
    
    renderPositions(positions);
  } catch (err) {
    posDiv.textContent = `Error loading holdings: ${err.message}`;
    return; // Don't schedule next poll on error
  }
  
  // Schedule next poll if still viewing this account
  if (currentAccountId === accid) {
    holdingsPollTimer = setTimeout(() => fetchPositionsForAccount(accid), HOLDINGS_POLL_INTERVAL);
  }
}

// Render positions table
async function renderPositions(positions) {
  const posDiv = $('positions');
  let table = posDiv.querySelector('table.holdings-table');
  let tbody;
  
  // Fetch company profiles for US stocks
  const usStockSymbols = [];
  positions.forEach(async (p) => {
    const symbol = p.symbol || (p.instrument && p.instrument.symbol);
    if (symbol && !symbol.includes('.') && !symbol.includes(':')) {
      usStockSymbols.push(symbol);
      
      if (!hasCompanyProfile(symbol)) {
        const profile = await API.fetchCompanyProfile(symbol);
        if (profile) {
          setCompanyProfile(symbol, profile);
          profilesUpdated = true; // Mark that profiles have been updated
          // Trigger a re-render to show the logo
          setTimeout(() => renderPositions(currentPositions), 100);
        }
      }
    }
  });
  
  // Check if we need to rebuild the table structure
  const sortChanged = lastSortColumn !== currentSortColumn || lastSortDirection !== currentSortDirection;
  const needsRebuild = !table || sortChanged || profilesUpdated;
  
  if (needsRebuild) {
    // Create or recreate table structure
    if (!table) {
      table = document.createElement('table');
      table.className = 'holdings-table';
      posDiv.innerHTML = '';
      posDiv.appendChild(table);
    }
    
    // Clear and rebuild table
    table.innerHTML = '';
    
    // Create header
    const thead = createTableHeader(columns, currentSortColumn, currentSortDirection, handleSort);
    table.appendChild(thead);
    
    // Create tbody
    tbody = document.createElement('tbody');
    table.appendChild(tbody);
    
    // Update last sort state
    lastSortColumn = currentSortColumn;
    lastSortDirection = currentSortDirection;
    profilesUpdated = false; // Reset the flag after rebuild
  } else {
    tbody = table.querySelector('tbody');
  }
  
  // Sort positions
  const sortedPositions = sortPositions(positions, currentSortColumn, currentSortDirection, exchangeRates);
  
  // Check if row count changed or if it's a rebuild scenario
  const existingRows = tbody.querySelectorAll('tr');
  const rowCountChanged = existingRows.length !== sortedPositions.length;
  
  // Rebuild rows if needed, otherwise update in place
  if (needsRebuild || rowCountChanged) {
    tbody.innerHTML = '';
    sortedPositions.forEach(position => {
      const row = createPositionRow(position, columns, previousPrices, handleRowClick);
      tbody.appendChild(row);
    });
  } else {
    // Update existing rows in place (avoids logo flicker)
    const existingRows = tbody.querySelectorAll('tr');
    sortedPositions.forEach((position, idx) => {
      if (idx < existingRows.length) {
        updatePositionRow(existingRows[idx], position, columns, previousPrices);
      } else {
        // Add new row if positions increased
        const row = createPositionRow(position, columns, previousPrices, handleRowClick);
        tbody.appendChild(row);
      }
    });
    
    // Remove extra rows if positions decreased
    while (existingRows.length > sortedPositions.length) {
      tbody.removeChild(existingRows[existingRows.length - 1]);
    }
  }
}

// Handle sort column click
function handleSort(columnKey) {
  if (currentSortColumn === columnKey) {
    currentSortDirection = currentSortDirection === 'asc' ? 'desc' : 'asc';
  } else {
    currentSortColumn = columnKey;
    currentSortDirection = 'desc';
  }
  renderPositions(currentPositions);
}

// Handle row click to view details
function handleRowClick(position) {
  const symbol = position.symbol || (position.instrument && position.instrument.symbol);
  if (!symbol) return;
  
  const url = new URL('detail.html', window.location.href);
  url.searchParams.set('symbol', symbol);
  url.searchParams.set('position', JSON.stringify(position));
  url.searchParams.set('accountId', currentAccountId);
  window.location.href = url.toString();
}
