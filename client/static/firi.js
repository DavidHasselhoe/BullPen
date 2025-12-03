// Firi Crypto Integration with Binance WebSocket

let firiBalances = [];
let cryptoPrices = {};
let previousPrices = {};
let crypto24hChanges = {}; // Store 24h price changes
let binanceWs = null;
let usdtToNokRate = 10.5; // Default fallback rate
let pendingPriceUpdates = {}; // Buffer for price updates
let updateTimer = null; // Timer for batched updates
let reconnectTimer = null; // Timer for reconnection attempts
let isReconnecting = false; // Flag to prevent multiple reconnection attempts
let firiSessionId = null; // OAuth session ID
let isUserAuthenticated = false; // Flag for OAuth vs API key mode

// Symbol mapping: Firi currency to Binance symbol
const BINANCE_SYMBOLS = {
  'BTC': 'BTCUSDT',
  'ETH': 'ETHUSDT',
  'ADA': 'ADAUSDT',
  'LTC': 'LTCUSDT',
  'XRP': 'XRPUSDT',
  'SOL': 'SOLUSDT',
  'DOGE': 'DOGEUSDT'
};

// Crypto icons mapping
const CRYPTO_ICONS = {
  'BTC': '₿',
  'ETH': 'Ξ',
  'ADA': '₳',
  'LTC': 'Ł',
  'XRP': '✕',
  'SOL': '◎',
  'DOGE': 'Ð',
  'NOK': '💰'
};

// Format NOK currency
function formatNOK(value) {
  return new Intl.NumberFormat('nb-NO', {
    style: 'currency',
    currency: 'NOK',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

// Fetch USDT to NOK exchange rate
async function fetchUsdtNokRate() {
  try {
    const response = await fetch('/api/firi/usdt-nok-rate');
    const result = await response.json();
    
    if (result.success && result.rate) {
      usdtToNokRate = result.rate;
    }
  } catch (error) {
    console.error('Error fetching USDT/NOK rate:', error);
  }
}

// Fetch crypto balances from Firi (balances only, cached)
async function fetchFiriBalances() {
  try {
    // Get user's API key from localStorage
    const userApiKey = localStorage.getItem('firi_api_key');
    
    if (!userApiKey) {
      // No API key, show login prompt
      renderLoginPrompt();
      return;
    }
    
    const response = await fetch('/api/firi/balances', {
      headers: {
        'X-Firi-User-Key': userApiKey
      }
    });
    
    const result = await response.json();
    
    if (result.success && result.data) {
      firiBalances = result.data;
      isUserAuthenticated = true;
      // After getting balances, connect to Binance WebSocket
      connectBinanceWebSocket();
      renderFiriBalances();
    } else {
      console.error('Failed to fetch Firi balances:', result.error);
      // Always show login prompt on error
      renderLoginPrompt();
    }
  } catch (error) {
    console.error('Error fetching Firi balances:', error);
    // Always show login prompt on error
    renderLoginPrompt();
    }
  }

// Connect to Binance WebSocket for real-time prices
function connectBinanceWebSocket() {
  if (binanceWs && binanceWs.readyState === WebSocket.OPEN) {
    return; // Already connected
  }
  
  if (binanceWs) {
    binanceWs.close();
  }
  
  isReconnecting = false;

  // Get list of Binance symbols we need to track
  const symbolsToTrack = firiBalances
    .map(b => BINANCE_SYMBOLS[b.currency])
    .filter(s => s !== undefined)
    .map(s => s.toLowerCase());

  if (symbolsToTrack.length === 0) {
    console.log('No crypto balances to track');
    return;
  }

  const stream = symbolsToTrack.map(s => `${s}@ticker`).join('/');
  const wsUrl = `wss://stream.binance.com:9443/stream?streams=${stream}`;
  
  console.log('Connecting to Binance WebSocket:', wsUrl);
  binanceWs = new WebSocket(wsUrl);

  binanceWs.onopen = () => {
    console.log('Binance WebSocket connected successfully');
  };

  binanceWs.onmessage = (e) => {
    try {
      const payload = JSON.parse(e.data).data;
      
      if (!payload) return;

      const binanceSymbol = payload.s; // e.g., "BTCUSDT"
      const usdtPrice = parseFloat(payload.c); // Current price in USDT
      const priceChangePercent = parseFloat(payload.P); // 24h price change percent

      // Find the currency code (e.g., "BTC")
      const currency = Object.keys(BINANCE_SYMBOLS).find(
        key => BINANCE_SYMBOLS[key] === binanceSymbol
      );

      if (currency) {
        // Convert USDT price to NOK
        const nokPrice = usdtPrice * usdtToNokRate;
        
        // Store 24h change data (per coin, not total position)
        crypto24hChanges[currency] = {
          percent: priceChangePercent,
          priceChange24h: (nokPrice * priceChangePercent) / 100
        };

        // Buffer the price update instead of applying immediately
        pendingPriceUpdates[currency] = nokPrice;

        // Schedule batched update if not already scheduled
        if (!updateTimer) {
          updateTimer = setTimeout(() => {
            applyPriceUpdates();
            updateTimer = null;
          }, 3000); // Update every 3 seconds
        }
      }
    } catch (error) {
      console.error('Error processing WebSocket message:', error);
    }
  };

  binanceWs.onerror = (error) => {
    console.error('Binance WebSocket error:', error);
  };

  binanceWs.onclose = (event) => {
    console.log('Binance WebSocket closed:', {
      code: event.code,
      reason: event.reason,
      wasClean: event.wasClean
    });
    
    binanceWs = null;
    
    // Only reconnect if we have balances and aren't already reconnecting
    if (!isReconnecting && firiBalances.length > 0) {
      isReconnecting = true;
      console.log('Will reconnect in 5 seconds...');
      reconnectTimer = setTimeout(() => {
        connectBinanceWebSocket();
      }, 5000);
    }
  };
}

// Apply buffered price updates
function applyPriceUpdates() {
  let hasChanges = false;
  
  Object.keys(pendingPriceUpdates).forEach(currency => {
    const newPrice = pendingPriceUpdates[currency];
    
    // Store previous price
    if (cryptoPrices[currency]) {
      previousPrices[currency] = cryptoPrices[currency];
    }
    
    // Update to new price
    cryptoPrices[currency] = newPrice;
    hasChanges = true;
  });
  
  // Clear pending updates
  pendingPriceUpdates = {};
  
  // Render if there were changes
  if (hasChanges) {
    renderFiriBalances();
  }
}

// Disconnect from Binance WebSocket
function disconnectBinanceWebSocket() {
  isReconnecting = false;
  
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  
  if (binanceWs) {
    binanceWs.close();
    binanceWs = null;
  }
  
  // Clear any pending updates
  if (updateTimer) {
    clearTimeout(updateTimer);
    updateTimer = null;
  }
  pendingPriceUpdates = {};
}

// Render login prompt for Firi OAuth
function renderLoginPrompt() {
  const wrapper = document.getElementById('firi-balances-wrapper');
  if (!wrapper) return;
  
  wrapper.innerHTML = `
    <div class="firi-login-container">
      <div class="firi-header">
        <h2>🪙 Crypto Holdings</h2>
      </div>
      <div class="firi-login-prompt">
        <p>Enter your Firi API key to view your crypto holdings</p>
        <div class="firi-credentials-form">
          <input 
            type="password" 
            id="firi-api-key-input" 
            placeholder="Your Firi API Key"
            class="api-key-field"
          />
          <button class="firi-login-btn" onclick="saveFiriApiKey()">
            <span>🔑</span> Connect
          </button>
        </div>
        <p class="firi-help-text">
          Get your API key from <a href="https://platform.firi.com/settings/apikey" target="_blank">Firi Settings → API</a>
        </p>
      </div>
    </div>
  `;
}

// Save user's API key to localStorage and fetch balances
function saveFiriApiKey() {
  const apiKeyInput = document.getElementById('firi-api-key-input');
  const apiKey = apiKeyInput?.value?.trim();
  
  if (!apiKey) {
    alert('Please enter your Firi API key');
    return;
  }
  
  // Store in localStorage
  localStorage.setItem('firi_api_key', apiKey);
  isUserAuthenticated = true;
  
  // Fetch balances with the new key
  fetchFiriBalances();
}

// Render Firi crypto balances
function renderFiriBalances() {
  const wrapper = document.getElementById('firi-balances-wrapper');
  if (!wrapper) return;
  
  let firiDiv = document.getElementById('firi-balances');
  
  if (!firiDiv) {
    firiDiv = document.createElement('div');
    firiDiv.id = 'firi-balances';
    firiDiv.className = 'firi-container';
    wrapper.appendChild(firiDiv);
  }
  
  if (firiBalances.length === 0) {
    firiDiv.innerHTML = `
      <div class="firi-header">
        <h2>Crypto Holdings</h2>
      </div>
      <div class="firi-empty">No crypto balances found</div>
    `;
    return;
  }
  
  // Calculate market values and total
  const balancesWithValues = firiBalances.map(balance => {
    const currency = balance.currency;
    
    // For NOK, price is always 1
    let price = currency === 'NOK' ? 1 : (cryptoPrices[currency] || 0);
    
    const marketValue = balance.balance * price;
    const previousPrice = previousPrices[currency] || price;
    const priceChange = price - previousPrice;
    
    return {
      ...balance,
      price,
      marketValue,
      priceChange
    };
  }).sort((a, b) => b.marketValue - a.marketValue); // Sort by market value
  
  const totalValue = balancesWithValues.reduce((sum, balance) => sum + balance.marketValue, 0);
  
  // Calculate total daily G/L from 24hr changes
  const totalDailyGL = balancesWithValues.reduce((sum, balance) => {
    const change24h = crypto24hChanges[balance.currency];
    if (change24h) {
      const nokChange = balance.balance * change24h.priceChange24h;
      return sum + nokChange;
    }
    return sum;
  }, 0);
  
  // Check if table already exists
  let tableBody = firiDiv.querySelector('tbody');
  
  if (!tableBody) {
    // Create the table structure for the first time
    const rows = balancesWithValues.map(balance => {
      const priceChangeClass = balance.priceChange > 0 ? 'gain-positive' : 
                              balance.priceChange < 0 ? 'gain-negative' : '';
      
      const change24h = crypto24hChanges[balance.currency];
      const changeClass = change24h && change24h.percent > 0 ? 'gain-positive' : 
                         change24h && change24h.percent < 0 ? 'gain-negative' : '';
      // Calculate NOK change for user's actual balance
      const nokChange = change24h ? (balance.balance * change24h.priceChange24h) : 0;
      const changeText = change24h ? 
        `${change24h.percent >= 0 ? '+' : ''}${change24h.percent.toFixed(2)}% (${nokChange >= 0 ? '+' : ''}${formatNOK(Math.abs(nokChange))})` : 
        '-';
      
      return `
        <tr data-currency="${balance.currency}" class="crypto-row" style="cursor: pointer;" onclick="window.location.href='crypto-detail.html?symbol=${balance.currency}&balance=${balance.balance}'">
          <td class="crypto-currency">
            <img src="https://cryptologos.cc/logos/${balance.currency.toLowerCase()}-${balance.currency.toLowerCase()}-logo.svg" 
                 alt="${balance.currency}" 
                 class="crypto-icon"
                 onerror="this.style.display='none'; this.nextElementSibling.style.display='inline-flex';">
            <span class="crypto-icon-fallback" style="display:none;">${CRYPTO_ICONS[balance.currency] || '●'}</span>
            <span class="crypto-symbol">${balance.currency}</span>
          </td>
          <td class="crypto-balance">${balance.balance.toFixed(8)}</td>
          <td class="crypto-price ${priceChangeClass}">${formatNOK(balance.price)}</td>
          <td class="crypto-24h-change ${changeClass}">${changeText}</td>
          <td class="crypto-market-value gain-positive">${formatNOK(balance.marketValue)}</td>
        </tr>
      `;
    }).join('');
    
    const dailyGLColor = totalDailyGL >= 0 ? '#10b981' : '#ef4444';
    const dailyGLSign = totalDailyGL >= 0 ? '+' : '';
    const dailyGLShadow = totalDailyGL >= 0 ? '0 0 15px rgba(16, 185, 129, 0.6)' : '0 0 15px rgba(239, 68, 68, 0.6)';
    
    firiDiv.innerHTML = `
      <div class="firi-header">
        <h2>    Crypto Holdings</h2>
        <div class="firi-summary-cards">
          <div class="firi-summary-card">
            <div class="firi-card-label">Total Value</div>
            <div class="firi-card-value">${formatNOK(totalValue)}</div>
          </div>
          <div class="firi-summary-card">
            <div class="firi-card-label">Today's G/L</div>
            <div class="firi-card-value" style="color: ${dailyGLColor}; text-shadow: ${dailyGLShadow}; font-weight: 700;">${dailyGLSign}${formatNOK(Math.abs(totalDailyGL))}</div>
          </div>
        </div>
      </div>
      <div class="firi-table-container">
        <table class="firi-table holdings-table">
          <thead>
            <tr>
              <th>Currency</th>
              <th>Balance</th>
              <th>Price (NOK)</th>
              <th>24h Change</th>
              <th>Market Value</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
    `;
  } else {
    // Update existing rows without recreating the entire table
    // First, re-sort the rows in the DOM to match the sorted balancesWithValues array
    balancesWithValues.forEach((balance, index) => {
      const row = firiDiv.querySelector(`tr[data-currency="${balance.currency}"]`);
      if (row) {
        // Move the row to the correct position
        const currentIndex = Array.from(tableBody.children).indexOf(row);
        if (currentIndex !== index) {
          if (index >= tableBody.children.length) {
            tableBody.appendChild(row);
          } else {
            tableBody.insertBefore(row, tableBody.children[index]);
          }
        }
      }
    });
    
    // Now update the content of each row
    balancesWithValues.forEach(balance => {
      const row = firiDiv.querySelector(`tr[data-currency="${balance.currency}"]`);
      if (!row) return;
      
      const priceCell = row.querySelector('.crypto-price');
      const changeCell = row.querySelector('.crypto-24h-change');
      const marketValueCell = row.querySelector('.crypto-market-value');
      
      if (priceCell && changeCell && marketValueCell) {
        // Remove old classes from price cell only
        priceCell.classList.remove('price-flash-up', 'price-flash-down');
        
        // Force reflow to restart animation on price cell
        void priceCell.offsetWidth;
        
        // Add flash animation to price cell only based on price change (no persistent color)
        if (balance.priceChange > 0) {
          priceCell.classList.add('price-flash-up');
        } else if (balance.priceChange < 0) {
          priceCell.classList.add('price-flash-down');
        }
        
        // Market value always has static green color (no flash)
        marketValueCell.className = 'crypto-market-value gain-positive';
        
        // Update the content
        priceCell.textContent = formatNOK(balance.price);
        
        // Update 24h change cell with user's actual balance
        const changeData = crypto24hChanges[balance.currency];
        if (changeData) {
          const changeClass = changeData.percent >= 0 ? 'gain-positive' : 'gain-negative';
          const sign = changeData.percent >= 0 ? '+' : '';
          const nokChange = balance.balance * changeData.priceChange24h;
          changeCell.className = `crypto-24h-change ${changeClass}`;
          changeCell.textContent = `${sign}${changeData.percent.toFixed(2)}% (${sign}${Math.abs(nokChange).toFixed(2)} kr)`;
        } else {
          changeCell.className = 'crypto-24h-change';
          changeCell.textContent = '-';
        }
        
        marketValueCell.textContent = formatNOK(balance.marketValue);
      }
    });
    
    // Calculate total daily G/L
    const totalDailyGL = balancesWithValues.reduce((sum, balance) => {
      const change24h = crypto24hChanges[balance.currency];
      if (change24h) {
        const nokChange = balance.balance * change24h.priceChange24h;
        return sum + nokChange;
      }
      return sum;
    }, 0);
    
    // Update total value in header
    const totalValueElement = firiDiv.querySelector('.firi-card-value');
    if (totalValueElement) {
      totalValueElement.textContent = formatNOK(totalValue);
    }
    
    // Update daily G/L in header
    const dailyGLElements = firiDiv.querySelectorAll('.firi-card-value');
    if (dailyGLElements.length > 1) {
      const dailyGLElement = dailyGLElements[1];
      const dailyGLColor = totalDailyGL >= 0 ? '#10b981' : '#ef4444';
      const dailyGLSign = totalDailyGL >= 0 ? '+' : '';
      const dailyGLShadow = totalDailyGL >= 0 ? '0 0 15px rgba(16, 185, 129, 0.6)' : '0 0 15px rgba(239, 68, 68, 0.6)';
      dailyGLElement.style.color = dailyGLColor;
      dailyGLElement.style.textShadow = dailyGLShadow;
      dailyGLElement.style.fontWeight = '700';
      dailyGLElement.textContent = `${dailyGLSign}${formatNOK(Math.abs(totalDailyGL))}`;
    }
  }
}

// Initialize Firi integration
function initFiri() {
  // Check if user has stored API key
  const userApiKey = localStorage.getItem('firi_api_key');
  if (userApiKey) {
    isUserAuthenticated = true;
  }
  
  // Fetch USDT to NOK rate first
  fetchUsdtNokRate();
  
  // Fetch balances and connect to WebSocket
  fetchFiriBalances();
  
  // Refresh balances every 30 seconds
  setInterval(fetchFiriBalances, 30000);
  
  // Refresh USDT/NOK rate every minute
  setInterval(fetchUsdtNokRate, 60000);
}

// Stop updates when leaving crypto tab
function stopFiriUpdates() {
  disconnectBinanceWebSocket();
}

// Tab switching functionality
function initTabs() {
  const tabButtons = document.querySelectorAll('.tab-button');
  const tabContents = document.querySelectorAll('.tab-content');
  
  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      const targetTab = button.getAttribute('data-tab');
      
      // Remove active class from all buttons and contents
      tabButtons.forEach(btn => btn.classList.remove('active'));
      tabContents.forEach(content => content.classList.remove('active'));
      
      // Add active class to clicked button and corresponding content
      button.classList.add('active');
      document.getElementById(`${targetTab}-content`).classList.add('active');
      
      // If switching to crypto tab, start live updates
      if (targetTab === 'crypto') {
        initFiri();
      } else {
        stopFiriUpdates();
      }
    });
  });
}

// Auto-initialize when document is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    // Don't auto-start crypto updates, only when tab is active
  });
} else {
  initTabs();
}
