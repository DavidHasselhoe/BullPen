// Stock detail page functionality
const $ = (id) => document.getElementById(id);

// Import text animation
import('./js/textAnimation.js').then(module => {
  window.animateBlurText = module.animateBlurText;
}).catch(() => {
  // Fallback if module loading fails
  window.animateBlurText = () => {};
});

// Get URL parameters
const urlParams = new URLSearchParams(window.location.search);
const symbol = urlParams.get('symbol');
const positionData = JSON.parse(urlParams.get('position') || '{}');
const accountId = urlParams.get('accountId') || positionData.accid;

// WebSocket for real-time price updates
let finnhubSocket = null;
let lastPriceUpdate = null;
let previousDetailPrice = null; // Track previous price for flash effect

// Nordnet polling for position updates
let nordnetPollTimer = null;
const POLL_INTERVAL = 1000; // 1 second

if (!symbol) {
  showError('No stock symbol provided');
} else {
  loadStockDetail();
}

async function loadStockDetail() {
  // Display position info first (from URL params)
  displayPositionInfo();
  
  // Check if this is a US stock (no exchange suffix)
  const isUSStock = !symbol.includes('.') && !symbol.includes(':');
  
  // Fetch company profile for US stocks
  if (isUSStock) {
    await fetchCompanyProfile();
  }
  
  if (isUSStock) {
    // Use Finnhub WebSocket for US stocks
    await initFinnhubWebSocket();
  } else {
    // For international stocks, show Nordnet data
    displayNordnetQuote();
  }
  
  // Start polling Nordnet for position updates (all stocks)
  if (accountId) {
    startNordnetPolling();
  }
  
  // Fetch news for the stock
  fetchStockNews();
  
  // Fetch financials for US stocks
  if (isUSStock) {
    fetchFinancials();
    fetchEarnings();
    fetchEstimates();
  }
}

async function startNordnetPolling() {
  // Get session from localStorage (same key as main page)
  const sessionId = localStorage.getItem('nordnet_session_id');
  
  if (!sessionId) {
    console.warn('No session ID found, cannot poll Nordnet');
    return;
  }
  
  const pollPositions = async () => {
    try {
      const headers = { 'Accept-Language': 'no' };
      if (sessionId) headers['X-NORDNET-SESSION'] = sessionId;
      
      const response = await fetch(`/api/positions/${accountId}`, { headers });
      
      if (!response.ok) {
        console.error('Nordnet polling failed:', response.status, response.statusText);
        return;
      }
      
      const result = await response.json();
      
      if (result.success && result.data && result.data.positions) {
        // Find the position for this symbol
        const position = result.data.positions.find(p => {
          const posSymbol = p.symbol || (p.instrument && p.instrument.symbol);
          return posSymbol === symbol;
        });
        
        if (position) {
          // Update position data with new values
          Object.assign(positionData, position);
          
          // Extract current price
          const getValue = (v) => {
            if (v && typeof v === 'object' && v.value !== undefined) return v.value;
            return v;
          };
          
          const getCurrency = (v) => {
            if (v && typeof v === 'object' && v.currency !== undefined) return v.currency;
            return '';
          };
          
          const currentPrice = getValue(position.last_price || position.main_market_price);
          const currency = getCurrency(position.last_price || position.main_market_price) || 'NOK';
          
          // Update both the main price display and position section
          if (currentPrice) {
            // Update main quote display
            const quoteDiv = $('quote-data');
            const priceElement = quoteDiv?.querySelector('.quote-price-large');
            if (priceElement) {
              const currencySymbol = currency === 'USD' ? '$' : (currency === 'SEK' ? 'kr' : '');
              priceElement.textContent = `${currencySymbol}${currentPrice.toFixed(2)}`;
              
              // Apply flash animation based on price change
              if (previousDetailPrice !== null && previousDetailPrice !== currentPrice) {
                priceElement.classList.remove('price-text-flash-up', 'price-text-flash-down');
                
                if (currentPrice > previousDetailPrice) {
                  priceElement.classList.add('price-text-flash-up');
                } else if (currentPrice < previousDetailPrice) {
                  priceElement.classList.add('price-text-flash-down');
                }
                
                // Remove animation class after it completes
                setTimeout(() => {
                  priceElement.classList.remove('price-text-flash-up', 'price-text-flash-down');
                }, 1000);
              }
              
              // Store current price for next comparison
              previousDetailPrice = currentPrice;
              
              // Update timestamp
              showLiveMessage();
            }
            
            // Update position display
            updatePositionWithNewPrice(currentPrice, currency);
          }
        }
      }
    } catch (error) {
      console.error('Error polling Nordnet:', error);
    }
  };
  
  // Poll immediately, then every second
  pollPositions();
  nordnetPollTimer = setInterval(pollPositions, POLL_INTERVAL);
}

async function fetchCompanyProfile() {
  try {
    const response = await fetch(`/api/finnhub-profile?symbol=${symbol}`);
    if (response.ok) {
      const profile = await response.json();
      if (profile && profile.name) {
        displayCompanyProfile(profile);
      }
    }
  } catch (error) {
    console.error('Failed to fetch company profile:', error);
  }
}

function displayCompanyProfile(profile) {
  const headerDiv = $('stock-header');
  
  const profileHTML = `
    <div style="display: flex; align-items: center; gap: 15px; margin-bottom: 20px;">
      ${profile.logo ? `<img src="${profile.logo}" alt="${profile.ticker}" style="width: 64px; height: 64px; border-radius: 8px; object-fit: contain; background: white; padding: 4px;">` : ''}
      <div>
        <h1 style="margin: 0;" id="company-title">${profile.name} (${profile.ticker})</h1>
        <div style="color: #666; margin-top: 4px;">
          ${profile.country ? `${profile.country}` : ''}
          ${profile.finnhubIndustry ? ` • ${profile.finnhubIndustry}` : ''}
          ${profile.weburl ? ` • <a href="${profile.weburl}" target="_blank" style="color: #0066cc; text-decoration: none;">Visit website →</a>` : ''}
        </div>
      </div>
    </div>
  `;
  
  headerDiv.innerHTML = profileHTML;
  
  // Animate the company name
  setTimeout(() => {
    const titleElement = document.getElementById('company-title');
    if (titleElement && window.animateBlurText) {
      window.animateBlurText(titleElement, {
        delay: 20,
        duration: 600,
        stagger: true
      });
    }
  }, 100);
}

async function initFinnhubWebSocket() {
  const quoteDiv = $('quote-data');
  const timestampDiv = $('quote-timestamp');
  
  try {
    // Get Finnhub API key from backend
    const configResponse = await fetch('/api/finnhub/config');
    const configBody = await configResponse.json();
    
    if (!configBody.success) {
      throw new Error('Finnhub API key not configured');
    }
    
    const apiKey = configBody.apiKey;
    
    // Connect to Finnhub WebSocket
    finnhubSocket = new WebSocket(`wss://ws.finnhub.io?token=${apiKey}`);
    
    finnhubSocket.addEventListener('open', function (event) {
      console.log('Finnhub WebSocket connected');
      // Subscribe to symbol
      finnhubSocket.send(JSON.stringify({'type': 'subscribe', 'symbol': symbol}));
    });
    
    finnhubSocket.addEventListener('message', function (event) {
      const message = JSON.parse(event.data);
      console.log('WebSocket message received:', message);
      
      if (message.type === 'trade' && message.data && message.data.length > 0) {
        // Get the latest trade
        const trade = message.data[message.data.length - 1];
        console.log('Trade data:', trade);
        updateRealTimePrice(trade);
      }
    });
    
    finnhubSocket.addEventListener('error', function (event) {
      console.error('WebSocket error:', event);
      showError('WebSocket connection error');
    });
    
    finnhubSocket.addEventListener('close', function (event) {
      console.log('WebSocket closed');
      timestampDiv.textContent = 'Connection closed';
    });
    
    // Also fetch initial quote data via REST API
    await fetchFinnhubQuote();
    
  } catch (err) {
    console.error('Error initializing WebSocket:', err);
    // Fall back to Nordnet data if Finnhub fails
    displayNordnetQuote();
  }
}

async function fetchFinnhubQuote() {
  const quoteDiv = $('quote-data');
  const timestampDiv = $('quote-timestamp');
  
  try {
    const response = await fetch(`/api/finnhub/quote/${encodeURIComponent(symbol)}`);
    const body = await response.json();
    
    if (!body.success) {
      console.warn('Finnhub API error, falling back to Nordnet data');
      displayNordnetQuote();
      return;
    }
    
    const quote = body.data;
    // Finnhub format: {c: current, h: high, l: low, o: open, pc: previous close, t: timestamp}
    
    displayFinnhubQuote(quote);
    
  } catch (err) {
    console.error('Error fetching initial quote:', err);
    // Fall back to Nordnet data if Finnhub fails
    displayNordnetQuote();
  }
}

function updateRealTimePrice(trade) {
  // trade format: {p: price, s: symbol, t: timestamp, v: volume}
  lastPriceUpdate = trade;
  
  const price = trade.p;
  const timestamp = new Date(trade.t);
  const volume = trade.v;
  
  // Get currency from position data
  const getCurrency = (v) => {
    if (v && typeof v === 'object' && v.currency !== undefined) return v.currency;
    return '';
  };
  const currency = getCurrency(positionData.market_value) || getCurrency(positionData.acq_price) || 'USD';
  const currencySymbol = currency === 'USD' ? '$' : (currency || '');
  
  const quoteDiv = $('quote-data');
  const timestampDiv = $('quote-timestamp');
  
  // Update the main price display
  const priceElement = quoteDiv.querySelector('.quote-price-large');
  if (priceElement) {
    priceElement.textContent = `${currencySymbol}${price.toFixed(2)}`;
    
    // Apply flash animation based on price change
    if (previousDetailPrice !== null && previousDetailPrice !== price) {
      priceElement.classList.remove('price-text-flash-up', 'price-text-flash-down');
      
      if (price > previousDetailPrice) {
        priceElement.classList.add('price-text-flash-up');
      } else if (price < previousDetailPrice) {
        priceElement.classList.add('price-text-flash-down');
      }
      
      // Remove animation class after it completes
      setTimeout(() => {
        priceElement.classList.remove('price-text-flash-up', 'price-text-flash-down');
      }, 1000);
    }
    
    // Store current price for next comparison
    previousDetailPrice = price;
    
    // Recalculate and update day change
    const changeElement = quoteDiv.querySelector('.quote-change');
    const detailsDiv = quoteDiv.querySelector('.quote-details');
    
    if (changeElement && detailsDiv) {
      // Get previous close from the details
      const prevCloseText = Array.from(detailsDiv.querySelectorAll('.info-row'))
        .find(row => row.querySelector('.info-label')?.textContent === 'Previous Close:')
        ?.querySelector('.info-value')?.textContent;
      
      if (prevCloseText) {
        const prevClose = parseFloat(prevCloseText.replace(/[^0-9.-]/g, ''));
        if (!isNaN(prevClose)) {
          const change = price - prevClose;
          const changePercent = (change / prevClose) * 100;
          const changeClass = changePercent >= 0 ? 'gain-positive' : 'gain-negative';
          const changeSign = changePercent >= 0 ? '+' : '';
          
          changeElement.className = `quote-change ${changeClass}`;
          changeElement.textContent = `${changeSign}${change.toFixed(2)} (${changeSign}${changePercent.toFixed(2)}%)`;
        }
      }
    }
  }
  
  // Update position data with new price
  updatePositionWithNewPrice(price, currency);
  
  showLiveMessage();
}

function updatePositionWithNewPrice(newPrice, currency) {
  const positionDiv = $('position-data');
  
  // Helper for number formatting
  function formatNumber(val, decimals = 2) {
    if (typeof val !== 'number') val = Number(val);
    if (isNaN(val)) return '-';
    return val.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  }
  
  // Extract values from position data
  const getValue = (v) => {
    if (v && typeof v === 'object' && v.value !== undefined) return v.value;
    return v;
  };
  
  const qty = getValue(positionData.qty) || 0;
  const acqPrice = getValue(positionData.acq_price) || 0;
  const totalCost = acqPrice * qty;
  const newMarketValue = newPrice * qty;
  
  // Calculate gain/loss with new price
  let gainLossPercent = '';
  let gainLossAmount = '';
  let gainLossClass = '';
  if (acqPrice && newPrice && acqPrice !== 0 && qty > 0) {
    const percentChange = ((newPrice - acqPrice) / acqPrice) * 100;
    const totalGainLoss = (newPrice - acqPrice) * qty;
    const sign = percentChange >= 0 ? '+' : '';
    gainLossPercent = `${sign}${percentChange.toFixed(2)}%`;
    gainLossAmount = `${sign}${formatNumber(totalGainLoss)} ${currency}`;
    gainLossClass = percentChange >= 0 ? 'gain-positive' : 'gain-negative';
  }
  
  positionDiv.innerHTML = `
    <div class="position-grid">
      <div class="position-stat">
        <span class="stat-label">Quantity</span>
        <span class="stat-value">${formatNumber(qty, 0)}</span>
      </div>
      <div class="position-stat">
        <span class="stat-label">Avg. Cost</span>
        <span class="stat-value">${formatNumber(acqPrice)} ${currency}</span>
      </div>
      <div class="position-stat">
        <span class="stat-label">Total Cost</span>
        <span class="stat-value">${formatNumber(totalCost)} ${currency}</span>
      </div>
      <div class="position-stat">
        <span class="stat-label">Current Price</span>
        <span class="stat-value">${formatNumber(newPrice)} ${currency}</span>
      </div>
      <div class="position-stat">
        <span class="stat-label">Market Value</span>
        <span class="stat-value highlight">${formatNumber(newMarketValue)} ${currency}</span>
      </div>
      <div class="position-stat ${gainLossClass}">
        <span class="stat-label">Total Gain/Loss</span>
        <span class="stat-value">${gainLossAmount || '-'}</span>
        <span class="stat-percent">${gainLossPercent || ''}</span>
      </div>
    </div>
  `;
}

function displayFinnhubQuote(quote) {
  const quoteDiv = $('quote-data');
  const timestampDiv = $('quote-timestamp');
  
  // Get currency from position data
  const getCurrency = (v) => {
    if (v && typeof v === 'object' && v.currency !== undefined) return v.currency;
    return '';
  };
  const currency = getCurrency(positionData.market_value) || getCurrency(positionData.acq_price) || 'USD';
  const currencySymbol = currency === 'USD' ? '$' : (currency || '');
  
  const currentPrice = quote.c;
  const prevClose = quote.pc;
  const change = currentPrice - prevClose;
  const changePercent = (change / prevClose) * 100;
  
  const changeClass = changePercent >= 0 ? 'gain-positive' : 'gain-negative';
  const changeSign = changePercent >= 0 ? '+' : '';
  
  // Check if market is currently open (if timestamp is recent)
  const quoteTime = new Date(quote.t * 1000);
  const now = new Date();
  const hoursSinceUpdate = (now - quoteTime) / (1000 * 60 * 60);
  const isMarketLikelyClosed = hoursSinceUpdate > 1;
  
  quoteDiv.innerHTML = `
    <div class="quote-main">
      <div class="quote-price-large">${currencySymbol}${currentPrice.toFixed(2)}</div>
      <div class="quote-change ${changeClass}">
        ${changeSign}${change.toFixed(2)} (${changeSign}${changePercent.toFixed(2)}%)
      </div>
      ${!isMarketLikelyClosed ? '<div class="streaming-indicator">🔴 Live</div>' : ''}
    </div>
    
    <div class="quote-details">
      <div class="info-row">
        <span class="info-label">Open:</span>
        <span class="info-value">${currencySymbol}${quote.o.toFixed(2)}</span>
      </div>
      <div class="info-row">
        <span class="info-label">High:</span>
        <span class="info-value">${currencySymbol}${quote.h.toFixed(2)}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Low:</span>
        <span class="info-value">${currencySymbol}${quote.l.toFixed(2)}</span>
      </div>
      <div class="info-row">
        <span class="info-label">Previous Close:</span>
        <span class="info-value">${currencySymbol}${quote.pc.toFixed(2)}</span>
      </div>
    </div>
  `;
  
  showLiveMessage();
}

// Cleanup WebSocket and polling on page unload
window.addEventListener('beforeunload', () => {
  if (finnhubSocket) {
    finnhubSocket.close();
  }
  if (nordnetPollTimer) {
    clearInterval(nordnetPollTimer);
  }
});

// Display static live message
function showLiveMessage() {
  const timestampDiv = $('quote-timestamp');
  if (timestampDiv) {
    timestampDiv.textContent = '🟢 Prices are live';
    timestampDiv.style.color = '#10b981';
  }
}

function displayNordnetQuote() {
  const quoteDiv = $('quote-data');
  const timestampDiv = $('quote-timestamp');
  
  if (Object.keys(positionData).length === 0) {
    quoteDiv.innerHTML = '<p>No quote data available</p>';
    return;
  }
  
  // Get currency from position data
  const getCurrency = (v) => {
    if (v && typeof v === 'object' && v.currency !== undefined) return v.currency;
    return '';
  };
  
  const getValue = (v) => {
    if (v && typeof v === 'object' && v.value !== undefined) return Number(v.value);
    if (typeof v === 'number') return v;
    return 0;
  };
  
  const currency = getCurrency(positionData.market_value) || getCurrency(positionData.acq_price) || '';
  const currencySymbol = currency === 'NOK' ? 'kr' : (currency === 'SEK' ? 'kr' : currency);
  
  const lastPrice = getValue(positionData.last_price) || getValue(positionData.main_market_price) || 0;
  const morningPrice = getValue(positionData.morning_price) || 0;
  const acqPrice = getValue(positionData.acq_price) || 0;
  
  // Calculate day change
  let dayChange = 0;
  let dayChangePercent = 0;
  if (morningPrice && lastPrice && morningPrice !== 0) {
    dayChange = lastPrice - morningPrice;
    dayChangePercent = (dayChange / morningPrice) * 100;
  }
  
  const changeClass = dayChangePercent >= 0 ? 'gain-positive' : 'gain-negative';
  const changeSign = dayChangePercent >= 0 ? '+' : '';
  
  quoteDiv.innerHTML = `
    <div class="quote-main">
      <div class="quote-price-large">${lastPrice.toFixed(2)} ${currencySymbol}</div>
      ${morningPrice ? `
        <div class="quote-change ${changeClass}">
          ${changeSign}${dayChange.toFixed(2)} (${changeSign}${dayChangePercent.toFixed(2)}%)
        </div>
      ` : ''}
    </div>
    
    <div class="quote-details">
      ${morningPrice ? `
        <div class="info-row">
          <span class="info-label">Open:</span>
          <span class="info-value">${morningPrice.toFixed(2)} ${currencySymbol}</span>
        </div>
      ` : ''}

      <div class="info-row">
        <span class="info-label">Your Avg. Cost:</span>
        <span class="info-value">${acqPrice.toFixed(2)} ${currencySymbol}</span>
      </div>
    </div>
  `;
  
  showLiveMessage();
}

function displayPositionInfo() {
  // Try to get name from multiple possible locations
  const stockName = positionData.name || 
                    (positionData.instrument && positionData.instrument.name) || 
                    symbol;
  $('stock-name').textContent = stockName;
  $('stock-symbol').textContent = symbol;
  
  const positionDiv = $('position-data');
  
  if (Object.keys(positionData).length === 0) {
    positionDiv.innerHTML = '<p>No position data available</p>';
    return;
  }
  
  // Helper for number formatting
  function formatNumber(val, decimals = 2) {
    if (typeof val !== 'number') val = Number(val);
    if (isNaN(val)) return '-';
    return val.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  }
  
  // Extract values from objects if needed
  const getValue = (v) => {
    if (v && typeof v === 'object' && v.value !== undefined) return v.value;
    return v;
  };
  
  const getCurrency = (v) => {
    if (v && typeof v === 'object' && v.currency !== undefined) return v.currency;
    return '';
  };
  
  const qty = getValue(positionData.qty) || 0;
  const acqPrice = getValue(positionData.acq_price) || 0;
  const lastPrice = getValue(positionData.last_price) || 0;
  const marketValue = getValue(positionData.market_value) || 0;
  const currency = getCurrency(positionData.market_value) || getCurrency(positionData.acq_price) || '';
  
  let gainLossPercent = '';
  let gainLossAmount = '';
  let gainLossClass = '';
  if (acqPrice && lastPrice && acqPrice !== 0 && qty > 0) {
    const percentChange = ((lastPrice - acqPrice) / acqPrice) * 100;
    const totalGainLoss = (lastPrice - acqPrice) * qty;
    const sign = percentChange >= 0 ? '+' : '';
    gainLossPercent = `${sign}${percentChange.toFixed(2)}%`;
    gainLossAmount = `${sign}${formatNumber(totalGainLoss)} ${currency}`;
    gainLossClass = percentChange >= 0 ? 'gain-positive' : 'gain-negative';
  }
  
  const totalCost = acqPrice * qty;
  
  positionDiv.innerHTML = `
    <div class="position-grid">
      <div class="position-stat">
        <span class="stat-label">Quantity</span>
        <span class="stat-value">${formatNumber(qty, 0)}</span>
      </div>
      <div class="position-stat">
        <span class="stat-label">Avg. Cost</span>
        <span class="stat-value">${formatNumber(acqPrice)} ${currency}</span>
      </div>
      <div class="position-stat">
        <span class="stat-label">Total Cost</span>
        <span class="stat-value">${formatNumber(totalCost)} ${currency}</span>
      </div>
      <div class="position-stat">
        <span class="stat-label">Current Price (Nordnet)</span>
        <span class="stat-value">${formatNumber(lastPrice)} ${currency}</span>
      </div>
      <div class="position-stat">
        <span class="stat-label">Market Value</span>
        <span class="stat-value highlight">${formatNumber(marketValue)} ${currency}</span>
      </div>
      <div class="position-stat ${gainLossClass}">
        <span class="stat-label">Total Gain/Loss</span>
        <span class="stat-value">${gainLossAmount || '-'}</span>
        <span class="stat-percent">${gainLossPercent || ''}</span>
      </div>
    </div>
  `;
}

async function fetchRealTimeQuote() {
  const quoteDiv = $('quote-data');
  const timestampDiv = $('quote-timestamp');
  
  // Get currency from position data
  const getCurrency = (v) => {
    if (v && typeof v === 'object' && v.currency !== undefined) return v.currency;
    return '';
  };
  const currency = getCurrency(positionData.market_value) || getCurrency(positionData.acq_price) || '';
  const currencySymbol = currency === 'USD' ? '$' : (currency || '');
  
  try {
    const response = await fetch(`/api/alphavantage/quote/${encodeURIComponent(symbol)}`);
    const body = await response.json();
    
    if (!body.success) {
      throw new Error(body.error || 'Failed to fetch quote');
    }
    
    const quote = body.data;
    
    // Alpha Vantage returns fields like "01. symbol", "05. price", etc.
    const price = quote['05. price'];
    const volume = quote['06. volume'];
    const latestTradingDay = quote['07. latest trading day'];
    const prevClose = quote['08. previous close'];
    const change = quote['09. change'];
    const changePercent = quote['10. change percent'];
    const high = quote['03. high'];
    const low = quote['04. low'];
    const open = quote['02. open'];
    
    // Validate that we have actual data
    if (!price || price === 'undefined' || isNaN(parseFloat(price))) {
      throw new Error(`No price data available for ${symbol}. Alpha Vantage may not support this stock or the symbol format may be incorrect. Try using the exchange suffix (e.g., SYMBOL.OL for Oslo stocks).`);
    }
    
    // Format change percent (remove % if present)
    const changePct = changePercent ? parseFloat(changePercent.replace('%', '')) : 0;
    const changeClass = changePct >= 0 ? 'gain-positive' : 'gain-negative';
    const changeSign = changePct >= 0 ? '+' : '';
    
    const formatPrice = (val) => {
      const num = parseFloat(val);
      return isNaN(num) ? '-' : num.toFixed(2);
    };
    
    const formatVolume = (val) => {
      const num = parseInt(val);
      return isNaN(num) ? '-' : num.toLocaleString();
    };
    
    quoteDiv.innerHTML = `
      <div class="quote-main">
        <div class="quote-price-large">${currencySymbol}${formatPrice(price)}</div>
        <div class="quote-change ${changeClass}">
          ${changeSign}${formatPrice(change)} (${changeSign}${changePct.toFixed(2)}%)
        </div>
      </div>
      
      <div class="quote-details">
        <div class="info-row">
          <span class="info-label">Open:</span>
          <span class="info-value">${currencySymbol}${formatPrice(open)}</span>
        </div>
        <div class="info-row">
          <span class="info-label">High:</span>
          <span class="info-value">${currencySymbol}${formatPrice(high)}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Low:</span>
          <span class="info-value">${currencySymbol}${formatPrice(low)}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Previous Close:</span>
          <span class="info-value">${currencySymbol}${formatPrice(prevClose)}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Volume:</span>
          <span class="info-value">${formatVolume(volume)}</span>
        </div>
      </div>
    `;
    
    showLiveMessage();
    
  } catch (err) {
    showError(`Error loading quote: ${err.message}`);
    quoteDiv.innerHTML = '<p class="error-text">Failed to load real-time quote data. This may be an international stock not supported by the current API.</p>';
  }
}

function showError(message) {
  const errorDiv = $('error-message');
  errorDiv.textContent = message;
  errorDiv.style.display = 'block';
}

async function fetchStockNews() {
  const newsDiv = $('news-data');
  
  try {
    const response = await fetch(`/api/news?ticker=${encodeURIComponent(symbol)}&limit=5`);
    const body = await response.json();
    
    if (!body.success) {
      newsDiv.innerHTML = `<p class="error-text">${body.error || 'Unable to load news'}</p>`;
      return;
    }
    
    const news = (body.data.feed || []).slice(0, 5);
    
    if (news.length === 0) {
      // Check if this is a US stock
      const isUSStock = !symbol.includes('.') && !symbol.includes(':') && /^[A-Z]+$/.test(symbol);
      if (isUSStock) {
        newsDiv.innerHTML = '<p>No recent news found for this stock.</p>';
      } else {
        newsDiv.innerHTML = '<p>News is only available for US stocks.</p>';
      }
      return;
    }
    
    // Function to format the time
    const formatTime = (timeStr) => {
      // Format: YYYYMMDDTHHMMSS
      const year = timeStr.substring(0, 4);
      const month = timeStr.substring(4, 6);
      const day = timeStr.substring(6, 8);
      const hour = timeStr.substring(9, 11);
      const minute = timeStr.substring(11, 13);
      
      const date = new Date(`${year}-${month}-${day}T${hour}:${minute}:00Z`);
      const now = new Date();
      const diffHours = Math.floor((now - date) / (1000 * 60 * 60));
      const diffDays = Math.floor(diffHours / 24);
      
      if (diffHours < 1) return 'Just now';
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays < 7) return `${diffDays}d ago`;
      return date.toLocaleDateString();
    };
    
    // Function to get sentiment badge
    const getSentimentBadge = (score, label) => {
      if (!score) return '';
      const color = score > 0.15 ? '#10b981' : score < -0.15 ? '#ef4444' : '#6b7280';
      return `<span style="display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; background: ${color}20; color: ${color};">${label || 'Neutral'}</span>`;
    };
    
    // Render news items
    const newsHTML = news.map(item => `
      <div class="news-item">
        <div class="news-header">
          <div>
            <a href="${item.url}" target="_blank" class="news-title">${item.title}</a>
            <div class="news-meta">
              <span class="news-source">${item.source}</span>
              <span class="news-time">${formatTime(item.timePublished)}</span>
              ${getSentimentBadge(item.sentiment, item.sentimentLabel)}
            </div>
          </div>
          ${item.bannerImage ? `<img src="${item.bannerImage}" alt="" class="news-image">` : ''}
        </div>
        <p class="news-summary">${item.summary}</p>
        ${item.tickerSentiment ? `
          <div class="news-ticker-sentiment">
            Relevance: ${(item.tickerSentiment.relevance_score * 100).toFixed(0)}% • 
            Sentiment: ${item.tickerSentiment.ticker_sentiment_label}
          </div>
        ` : ''}
      </div>
    `).join('');
    
    newsDiv.innerHTML = newsHTML;
    
  } catch (error) {
    newsDiv.innerHTML = '<p class="error-text">Failed to load news.</p>';
  }
}

async function fetchFinancials() {
  const financialsDiv = $('financials-data');
  
  try {
    const response = await fetch(`/api/financials?symbol=${encodeURIComponent(symbol)}`);
    const body = await response.json();
    
    if (!body.success || !body.data.metric) {
      financialsDiv.innerHTML = '<p>Financials not available.</p>';
      return;
    }
    
    const m = body.data.metric;
    
    // Format large numbers
    const formatNumber = (num) => {
      if (num === null || num === undefined) return 'N/A';
      if (num >= 1e9) return (num / 1e9).toFixed(2) + 'B';
      if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
      return num.toFixed(2);
    };
    
    // Format percentage
    const formatPercent = (num) => {
      if (num === null || num === undefined) return 'N/A';
      return num.toFixed(2) + '%';
    };
    
    const financialsHTML = `
      <div class="info-item">
        <span class="info-label">Market Cap</span>
        <span class="info-value" style="font-weight: 600; color: #93c5fd;">${formatNumber(m.marketCapitalization)}</span>
      </div>
      <div class="info-item">
        <span class="info-label">P/E Ratio</span>
        <span class="info-value" style="font-weight: 600; color: #93c5fd;">${m.peBasicExclExtraTTM ? m.peBasicExclExtraTTM.toFixed(2) : 'N/A'}</span>
      </div>
      <div class="info-item">
        <span class="info-label">52W High</span>
        <span class="info-value" style="font-weight: 600; color: #93c5fd;">$${m['52WeekHigh'] ? m['52WeekHigh'].toFixed(2) : 'N/A'}</span>
      </div>
      <div class="info-item">
        <span class="info-label">52W Low</span>
        <span class="info-value" style="font-weight: 600; color: #93c5fd;">$${m['52WeekLow'] ? m['52WeekLow'].toFixed(2) : 'N/A'}</span>
      </div>
      <div class="info-item">
        <span class="info-label">Beta</span>
        <span class="info-value" style="font-weight: 600; color: #93c5fd;">${m.beta ? m.beta.toFixed(2) : 'N/A'}</span>
      </div>
      <div class="info-item">
        <span class="info-label">Avg Volume (10D)</span>
        <span class="info-value" style="font-weight: 600; color: #93c5fd;">${formatNumber(m['10DayAverageTradingVolume'])}</span>
      </div>
      <div class="info-item">
        <span class="info-label">EPS (TTM)</span>
        <span class="info-value" style="font-weight: 600; color: #93c5fd;">$${m.epsBasicExclExtraItemsTTM ? m.epsBasicExclExtraItemsTTM.toFixed(2) : 'N/A'}</span>
      </div>
      <div class="info-item">
        <span class="info-label">Dividend Yield</span>
        <span class="info-value" style="font-weight: 600; color: #93c5fd;">${formatPercent(m.dividendYieldIndicatedAnnual)}</span>
      </div>
    `;
    
    financialsDiv.innerHTML = financialsHTML;
    
  } catch (error) {
    console.error('Error fetching financials:', error);
    financialsDiv.innerHTML = '<p class="error-text">Failed to load financials.</p>';
  }
}

async function fetchEarnings() {
  const earningsDiv = $('earnings-chart');
  
  try {
    const response = await fetch(`/api/earnings?symbol=${encodeURIComponent(symbol)}`);
    const body = await response.json();
    
    if (!body.success || !body.data || body.data.length === 0) {
      earningsDiv.innerHTML = '<p>EPS data not available.</p>';
      return;
    }
    
    const earnings = body.data;
    
    // Create the chart
    renderEarningsChart(earnings);
    
  } catch (error) {
    console.error('Error fetching earnings:', error);
    earningsDiv.innerHTML = '<p class="error-text">Failed to load earnings data.</p>';
  }
}

function renderEarningsChart(earnings) {
  const earningsDiv = $('earnings-chart');
  
  // Find max value for scaling
  const allValues = earnings.flatMap(e => [Math.abs(e.actual), Math.abs(e.estimate)]);
  const maxValue = Math.max(...allValues);
  const scale = maxValue * 1.2; // Add 20% padding
  
  // Create chart HTML
  let chartHTML = '<div class="earnings-legend">';
  chartHTML += '<div class="legend-item"><span class="legend-dot actual"></span>Actual</div>';
  chartHTML += '<div class="legend-item"><span class="legend-dot estimate"></span>Estimate</div>';
  chartHTML += '</div>';
  
  chartHTML += '<div class="earnings-chart-container">';
  
  earnings.forEach((earning, index) => {
    const actualHeight = (Math.abs(earning.actual) / scale) * 100;
    const estimateHeight = (Math.abs(earning.estimate) / scale) * 100;
    const isBeat = earning.actual >= earning.estimate;
    const surpriseClass = isBeat ? 'beat' : 'miss';
    
    // Use fiscal quarter and year from API if available, otherwise calculate
    let quarter, fiscalYear;
    if (earning.fiscalQuarter && earning.fiscalYear) {
      quarter = earning.fiscalQuarter;
      fiscalYear = earning.fiscalYear;
    } else {
      // Fallback calculation for fiscal quarters
      const periodDate = new Date(earning.period);
      const month = periodDate.getMonth();
      const year = periodDate.getFullYear();
      
      if (month >= 0 && month <= 2) { // Jan-Mar = Q4
        quarter = 4;
        fiscalYear = year;
      } else if (month >= 3 && month <= 5) { // Apr-Jun = Q1
        quarter = 1;
        fiscalYear = year + 1;
      } else if (month >= 6 && month <= 8) { // Jul-Sep = Q2
        quarter = 2;
        fiscalYear = year + 1;
      } else { // Oct-Dec = Q3
        quarter = 3;
        fiscalYear = year + 1;
      }
    }
    
    chartHTML += `
      <div class="earnings-quarter">
        <div class="bars-container">
          <div class="bar estimate" style="height: ${estimateHeight}%">
            <span class="bar-value">${earning.estimate.toFixed(2)}</span>
          </div>
          <div class="bar actual ${surpriseClass}" style="height: ${actualHeight}%">
            <span class="bar-value">${earning.actual.toFixed(2)}</span>
          </div>
        </div>
        <div class="quarter-label">
          <div class="quarter-date">${earning.period}</div>
          <div class="quarter-info">Q${quarter} FY${fiscalYear}</div>
          <div class="surprise ${surpriseClass}">
            ${isBeat ? 'Beat' : 'Missed'}: ${earning.surprise >= 0 ? '+' : ''}${earning.surprise.toFixed(2)}
          </div>
        </div>
      </div>
    `;
  });
  
  chartHTML += '</div>';
  
  earningsDiv.innerHTML = chartHTML;
}

async function fetchEstimates() {
  const estimatesDiv = $('estimates-section');
  
  try {
    const response = await fetch(`/api/earnings-estimates?symbol=${encodeURIComponent(symbol)}`);
    const body = await response.json();
    
    if (!body.success || !body.data) {
      estimatesDiv.innerHTML = '<p>Estimates data not available.</p>';
      return;
    }
    
    const { quarterly, annual } = body.data;
    
    // Create the estimates display
    renderEstimates(quarterly, annual);
    
  } catch (error) {
    console.error('Error fetching estimates:', error);
    estimatesDiv.innerHTML = '<p class="error-text">Failed to load estimates data.</p>';
  }
}

function renderEstimates(quarterly, annual) {
  const estimatesDiv = $('estimates-section');
  
  let html = '<div class="estimates-container">';
  
  // Quarterly Estimates
  if (quarterly && quarterly.length > 0) {
    html += '<div class="estimates-group">';
    html += '<h3 class="estimates-title">Quarterly Estimates</h3>';
    html += '<div class="estimates-grid">';
    
    quarterly.forEach(q => {
      // Handle different field names from Alpha Vantage
      const period = q.fiscalDateEnding || q.reportedDate || 'N/A';
      const epsEstimate = q.estimatedEPS || q.estimatedEPSAvg || q.estimate || 'N/A';
      const revenueEstimate = q.estimatedRevenue || q.estimatedRevenueAvg || null;
      const analystCount = q.numberOfAnalysts || q.numberAnalystEstimatedRevenueAvg || 
                          q.numberAnalystEstimatedEPS || 'N/A';
      
      html += `
        <div class="estimate-card">
          <div class="estimate-period">${period}</div>
          <div class="estimate-metrics">
            <div class="estimate-metric">
              <span class="metric-label">EPS Estimate</span>
              <span class="metric-value">${epsEstimate !== 'N/A' ? '$' + epsEstimate : 'N/A'}</span>
            </div>
            <div class="estimate-metric">
              <span class="metric-label">Revenue Estimate</span>
              <span class="metric-value">${formatRevenue(revenueEstimate)}</span>
            </div>
            <div class="estimate-metric">
              <span class="metric-label">Analyst Count</span>
              <span class="metric-value">${analystCount}</span>
            </div>
          </div>
        </div>
      `;
    });
    
    html += '</div></div>';
  }
  
  // Annual Estimates
  if (annual && annual.length > 0) {
    html += '<div class="estimates-group">';
    html += '<h3 class="estimates-title">Annual Estimates</h3>';
    html += '<div class="estimates-grid">';
    
    annual.forEach(a => {
      // Handle different field names from Alpha Vantage
      const period = a.fiscalDateEnding || a.reportedDate || 'N/A';
      const epsEstimate = a.estimatedEPS || a.estimatedEPSAvg || a.estimate || 'N/A';
      const revenueEstimate = a.estimatedRevenue || a.estimatedRevenueAvg || null;
      const analystCount = a.numberOfAnalysts || a.numberAnalystEstimatedRevenueAvg || 
                          a.numberAnalystEstimatedEPS || 'N/A';
      
      html += `
        <div class="estimate-card">
          <div class="estimate-period">${period}</div>
          <div class="estimate-metrics">
            <div class="estimate-metric">
              <span class="metric-label">EPS Estimate</span>
              <span class="metric-value">${epsEstimate !== 'N/A' ? '$' + epsEstimate : 'N/A'}</span>
            </div>
            <div class="estimate-metric">
              <span class="metric-label">Revenue Estimate</span>
              <span class="metric-value">${formatRevenue(revenueEstimate)}</span>
            </div>
            <div class="estimate-metric">
              <span class="metric-label">Analyst Count</span>
              <span class="metric-value">${analystCount}</span>
            </div>
          </div>
        </div>
      `;
    });
    
    html += '</div></div>';
  }
  
  html += '</div>';
  
  estimatesDiv.innerHTML = html;
}

function formatRevenue(rev) {
  if (!rev || rev === 'N/A') return 'N/A';
  const num = parseFloat(rev);
  if (isNaN(num)) return 'N/A';
  if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
  if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
  return `$${num.toFixed(2)}`;
}
