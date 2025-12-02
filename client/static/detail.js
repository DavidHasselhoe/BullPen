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
    fetchEarnings(); // Now uses Yahoo Finance
    fetchRecommendations();
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
        // Fetch AI summary with company context
        fetchAISummary(profile);
      }
    }
  } catch (error) {
    console.error('Failed to fetch company profile:', error);
  }
}

async function fetchAISummary(profile) {
  const summarySection = $('ai-summary-section');
  const summaryContent = $('ai-summary-content');
  
  // Show the section
  summarySection.style.display = 'block';
  summaryContent.classList.add('loading');
  
  try {
    const params = new URLSearchParams({
      symbol: symbol,
      companyName: profile.name || symbol,
      industry: profile.finnhubIndustry || '',
      sector: profile.sector || ''
    });
    
    const response = await fetch(`/api/ai-summary?${params}`);
    const body = await response.json();
    
    if (body.success && body.data) {
      summaryContent.classList.remove('loading');
      summaryContent.classList.add('loaded');
      
      // Add a slight delay for smooth transition
      setTimeout(() => {
        const metaInfo = body.cached 
          ? '<div class="ai-meta">✓ Cached</div>' 
          : body.data.fallback 
          ? '<div class="ai-meta" style="color: #f59e0b;">⚠️ AI unavailable - showing basic info</div>'
          : '';
        
        summaryContent.innerHTML = `
          <p>${body.data.summary}</p>
          ${metaInfo}
        `;
      }, 100);
    } else if (body.quotaError) {
      summaryContent.classList.remove('loading');
      summaryContent.classList.add('loaded');
      setTimeout(() => {
        summaryContent.innerHTML = `
          <div class="ai-warning">
            <p style="margin: 0 0 12px 0;">⚠️ AI summary is temporarily unavailable due to API quota limits.</p>
            <p style="margin: 0; font-size: 13px; line-height: 1.6;">
              Please add credits to your OpenAI account at 
              <a href="https://platform.openai.com/settings/organization/billing" target="_blank">platform.openai.com/billing</a>
            </p>
          </div>
        `;
      }, 100);
    } else {
      throw new Error('Failed to generate summary');
    }
  } catch (error) {
    console.error('Failed to fetch AI summary:', error);
    summaryContent.classList.remove('loading');
    summaryContent.classList.add('error', 'loaded');
    setTimeout(() => {
      summaryContent.innerHTML = '<p>Unable to generate AI summary at this time.</p>';
    }, 100);
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
      <div class="quote-price-row">
        <div class="quote-price-large">${currencySymbol}${currentPrice.toFixed(2)}</div>
        <div class="quote-change ${changeClass}">
          ${changeSign}${change.toFixed(2)} (${changeSign}${changePercent.toFixed(2)}%)
        </div>
      </div>
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
      <div class="quote-price-row">
        <div class="quote-price-large">${lastPrice.toFixed(2)} ${currencySymbol}</div>
        ${morningPrice ? `
          <div class="quote-change ${changeClass}">
            ${changeSign}${dayChange.toFixed(2)} (${changeSign}${dayChangePercent.toFixed(2)}%)
          </div>
        ` : ''}
      </div>
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
  
  function formatLargeNumber(val) {
    if (typeof val !== 'number') val = Number(val);
    if (isNaN(val) || val === null || val === undefined) return 'N/A';
    
    if (val >= 1e12) {
      return `$${(val / 1e12).toFixed(2)}T`;
    } else if (val >= 1e9) {
      return `$${(val / 1e9).toFixed(2)}B`;
    } else if (val >= 1e6) {
      return `$${(val / 1e6).toFixed(2)}M`;
    } else if (val >= 1e3) {
      return `$${(val / 1e3).toFixed(2)}K`;
    }
    return `$${val.toFixed(2)}`;
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
        <div class="quote-price-row">
          <div class="quote-price-large">${currencySymbol}${formatPrice(price)}</div>
          <div class="quote-change ${changeClass}">
            ${changeSign}${formatPrice(change)} (${changeSign}${changePct.toFixed(2)}%)
          </div>
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

// News pagination state
let allNewsItems = [];
let visibleNewsCount = 5;

async function fetchStockNews() {
  const newsDiv = $('news-data');
  const showMoreContainer = $('news-show-more-container');
  const showMoreBtn = $('news-show-more-btn');
  
  try {
    const response = await fetch(`/api/news?ticker=${encodeURIComponent(symbol)}`);
    const body = await response.json();
    
    if (!body.success) {
      newsDiv.innerHTML = `<p class="error-text">${body.error || 'Unable to load news'}</p>`;
      showMoreContainer.style.display = 'none';
      return;
    }
    
    allNewsItems = (body.data.feed || []);
    
    // Sort news by timePublished (most recent first)
    allNewsItems.sort((a, b) => {
      const timeA = a.timePublished || '0';
      const timeB = b.timePublished || '0';
      return timeB.localeCompare(timeA); // Descending order (newest first)
    });
    
    if (allNewsItems.length === 0) {
      // Check if this is a US stock
      const isUSStock = !symbol.includes('.') && !symbol.includes(':') && /^[A-Z]+$/.test(symbol);
      if (isUSStock) {
        newsDiv.innerHTML = '<p>No recent news found for this stock.</p>';
      } else {
        newsDiv.innerHTML = '<p>News is only available for US stocks.</p>';
      }
      showMoreContainer.style.display = 'none';
      return;
    }
    
    // Initial render
    visibleNewsCount = 5;
    renderNews();
    
    // Setup Show More button
    if (allNewsItems.length > visibleNewsCount) {
      showMoreContainer.style.display = 'block';
      showMoreBtn.onclick = () => {
        visibleNewsCount += 5;
        renderNews();
      };
    } else {
      showMoreContainer.style.display = 'none';
    }
    
  } catch (error) {
    newsDiv.innerHTML = '<p class="error-text">Failed to load news.</p>';
    showMoreContainer.style.display = 'none';
  }
}

function renderNews() {
  const newsDiv = $('news-data');
  const showMoreContainer = $('news-show-more-container');
  const showMoreBtn = $('news-show-more-btn');
  
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
  
  // Get visible news items
  const visibleNews = allNewsItems.slice(0, visibleNewsCount);
  
  // Render news items
  const newsHTML = visibleNews.map(item => `
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
  
  // Update Show More button
  if (visibleNewsCount >= allNewsItems.length) {
    showMoreContainer.style.display = 'none';
  } else {
    showMoreContainer.style.display = 'block';
    const remaining = allNewsItems.length - visibleNewsCount;
    showMoreBtn.textContent = `Show More (${remaining} remaining)`;
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
    
    // Format large numbers with proper T/B/M/K suffixes
    const formatLargeNumber = (val) => {
      if (typeof val !== 'number') val = Number(val);
      if (isNaN(val) || val === null || val === undefined) return 'N/A';
      
      if (val >= 1e12) {
        return `$${(val / 1e12).toFixed(2)}T`;
      } else if (val >= 1e9) {
        return `$${(val / 1e9).toFixed(2)}B`;
      } else if (val >= 1e6) {
        return `$${(val / 1e6).toFixed(2)}M`;
      } else if (val >= 1e3) {
        return `$${(val / 1e3).toFixed(2)}K`;
      }
      return `$${val.toFixed(2)}`;
    };
    
    // Format percentage
    const formatPercent = (num) => {
      if (num === null || num === undefined) return 'N/A';
      return num.toFixed(2) + '%';
    };
    
    const financialsHTML = `
      <div class="info-item">
        <span class="info-label">Market Cap</span>
        <span class="info-value" style="font-weight: 600; color: #93c5fd;">${formatLargeNumber(m.marketCapitalization)}</span>
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
        <span class="info-value" style="font-weight: 600; color: #93c5fd;">${formatLargeNumber(m['10DayAverageTradingVolume']).replace('$', '')}</span>
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
  const estimatesDiv = $('estimates-section');
  
  try {
    const response = await fetch(`/api/yahoo-earnings?symbol=${encodeURIComponent(symbol)}`);
    const body = await response.json();
    
    if (!body.success || !body.data) {
      earningsDiv.innerHTML = '<p>EPS data not available.</p>';
      estimatesDiv.innerHTML = '<p>Estimates data not available.</p>';
      return;
    }
    
    const earnings = body.data;
    
    // Render historical earnings chart
    if (earnings.history && earnings.history.length > 0) {
      renderEarningsChart(earnings.history);
    } else {
      earningsDiv.innerHTML = '<p>EPS history not available.</p>';
    }
    
    // Render estimates
    if (earnings.estimates && earnings.estimates.length > 0) {
      renderEstimates(earnings.estimates, earnings.nextEarningsDate);
    } else {
      estimatesDiv.innerHTML = '<p>Estimates data not available.</p>';
    }
    
  } catch (error) {
    console.error('Error fetching earnings:', error);
    earningsDiv.innerHTML = '<p class="error-text">Failed to load earnings data.</p>';
    estimatesDiv.innerHTML = '<p class="error-text">Failed to load estimates data.</p>';
  }
}

function renderEarningsChart(history) {
  const earningsDiv = $('earnings-chart');
  
  // Take last 8 quarters for display
  const displayData = history.slice(-8);
  
  // Find max value for scaling
  const allValues = displayData.flatMap(e => [
    Math.abs(e.epsActual || 0), 
    Math.abs(e.epsEstimate || 0)
  ]).filter(v => v > 0);
  
  const maxValue = allValues.length > 0 ? Math.max(...allValues) : 1;
  const scale = maxValue * 1.2; // Add 20% padding
  
  // Create chart HTML
  let chartHTML = '<div class="earnings-legend">';
  chartHTML += '<div class="legend-item"><span class="legend-dot actual"></span>Actual</div>';
  chartHTML += '<div class="legend-item"><span class="legend-dot estimate"></span>Estimate</div>';
  chartHTML += '</div>';
  
  chartHTML += '<div class="earnings-chart-container">';
  
  displayData.forEach((earning, index) => {
    const actual = earning.epsActual || 0;
    const estimate = earning.epsEstimate || 0;
    const actualHeight = (Math.abs(actual) / scale) * 100;
    const estimateHeight = (Math.abs(estimate) / scale) * 100;
    const isBeat = actual >= estimate;
    const surpriseClass = isBeat ? 'beat' : 'miss';
    const surprise = earning.epsSurprise || 0;
    const surprisePercent = earning.surprisePercent || 0;
    
    chartHTML += `
      <div class="earnings-quarter">
        <div class="bars-container">
          <div class="bar estimate" style="height: ${estimateHeight}%">
            <span class="bar-value">${estimate.toFixed(2)}</span>
          </div>
          <div class="bar actual ${surpriseClass}" style="height: ${actualHeight}%">
            <span class="bar-value">${actual.toFixed(2)}</span>
          </div>
        </div>
        <div class="quarter-label">
          <div class="quarter-date">${earning.quarter}</div>
          <div class="surprise ${surpriseClass}">
            ${isBeat ? 'Beat' : 'Miss'}: ${surprise >= 0 ? '+' : ''}${surprise.toFixed(2)} (${surprisePercent >= 0 ? '+' : ''}${surprisePercent.toFixed(1)}%)
          </div>
        </div>
      </div>
    `;
  });
  
  chartHTML += '</div>';
  
  earningsDiv.innerHTML = chartHTML;
}

function renderEstimates(estimates, nextEarningsDate) {
  const estimatesDiv = $('estimates-section');
  
  let html = '<div class="estimates-container">';
  
  // Next Earnings Date
  if (nextEarningsDate) {
    html += `<div class="next-earnings-date">Next Earnings: <strong>${nextEarningsDate}</strong></div>`;
  }
  
  // Filter for upcoming quarters and current year
  const upcomingQuarters = estimates.filter(e => 
    e.period && (e.period.includes('q') || e.period.includes('Q'))
  ).slice(0, 4);
  
  if (upcomingQuarters.length > 0) {
    html += '<div class="estimates-group">';
    html += '<h3 class="estimates-title">Upcoming Quarter Estimates</h3>';
    html += '<div class="estimates-grid">';
    
    upcomingQuarters.forEach(est => {
      const period = est.period.toUpperCase();
      const epsAvg = est.earningsEstimate.avg;
      const epsLow = est.earningsEstimate.low;
      const epsHigh = est.earningsEstimate.high;
      const numAnalysts = est.earningsEstimate.numberOfAnalysts;
      const growth = est.growth;
      
      html += `
        <div class="estimate-card">
          <div class="estimate-period">${period}</div>
          <div class="estimate-metrics">
            <div class="estimate-metric">
              <span class="metric-label">EPS Estimate (Avg)</span>
              <span class="metric-value">${epsAvg !== null ? '$' + epsAvg.toFixed(2) : 'N/A'}</span>
            </div>
            ${epsLow !== null && epsHigh !== null ? `
            <div class="estimate-metric">
              <span class="metric-label">Range</span>
              <span class="metric-value">$${epsLow.toFixed(2)} - $${epsHigh.toFixed(2)}</span>
            </div>
            ` : ''}
            ${numAnalysts ? `
            <div class="estimate-metric">
              <span class="metric-label">Analysts</span>
              <span class="metric-value">${numAnalysts}</span>
            </div>
            ` : ''}
            ${growth !== null ? `
            <div class="estimate-metric">
              <span class="metric-label">Growth Est.</span>
              <span class="metric-value ${growth >= 0 ? 'positive' : 'negative'}">${growth >= 0 ? '+' : ''}${(growth * 100).toFixed(1)}%</span>
            </div>
            ` : ''}
          </div>
        </div>
      `;
    });
    
    html += '</div></div>';
  }
  
  // Annual estimates
  const annualEstimates = estimates.filter(e => 
    e.period && e.period.match(/^\d+y$/)
  ).slice(0, 2);
  
  if (annualEstimates.length > 0) {
    html += '<div class="estimates-group">';
    html += '<h3 class="estimates-title">Annual Estimates</h3>';
    html += '<div class="estimates-grid">';
    
    annualEstimates.forEach(est => {
      const year = est.endDate ? new Date(est.endDate).getFullYear() : est.period;
      const epsAvg = est.earningsEstimate.avg;
      const revenueAvg = est.revenueEstimate.avg;
      const growth = est.growth;
      
      html += `
        <div class="estimate-card">
          <div class="estimate-period">FY ${year}</div>
          <div class="estimate-metrics">
            ${epsAvg !== null ? `
            <div class="estimate-metric">
              <span class="metric-label">EPS Estimate</span>
              <span class="metric-value">$${epsAvg.toFixed(2)}</span>
            </div>
            ` : ''}
            ${revenueAvg !== null ? `
            <div class="estimate-metric">
              <span class="metric-label">Revenue Est.</span>
              <span class="metric-value">$${(revenueAvg / 1e9).toFixed(2)}B</span>
            </div>
            ` : ''}
            ${growth !== null ? `
            <div class="estimate-metric">
              <span class="metric-label">Growth Est.</span>
              <span class="metric-value ${growth >= 0 ? 'positive' : 'negative'}">${growth >= 0 ? '+' : ''}${(growth * 100).toFixed(1)}%</span>
            </div>
            ` : ''}
          </div>
        </div>
      `;
    });
    
    html += '</div></div>';
  }
  
  html += '</div>';
  
  estimatesDiv.innerHTML = html;
}

// ============================================
// PRICE CHART FUNCTIONALITY
// ============================================

let currentChart = null;
let currentRange = '1d';
let currentInterval = '5m';

// Initialize chart on page load
document.addEventListener('DOMContentLoaded', () => {
  setupChartControls();
  loadChart(currentRange, currentInterval);
});

function setupChartControls() {
  const buttons = document.querySelectorAll('.chart-btn');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      // Remove active class from all buttons
      buttons.forEach(b => b.classList.remove('active'));
      // Add active class to clicked button
      btn.classList.add('active');
      
      const range = btn.dataset.range;
      const interval = btn.dataset.interval;
      loadChart(range, interval);
    });
  });
}

async function loadChart(range, interval) {
  currentRange = range;
  currentInterval = interval;
  
  const canvas = $('price-chart');
  const loading = $('chart-loading');
  
  if (!canvas) return;
  
  loading.style.display = 'block';
  canvas.style.display = 'none';
  
  try {
    const response = await fetch(`/api/chart?symbol=${encodeURIComponent(symbol)}&range=${range}&interval=${interval}`);
    
    // Check if response is OK
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    // Check content type
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      const text = await response.text();
      console.error('Non-JSON response:', text.substring(0, 200));
      throw new Error('Server returned non-JSON response');
    }
    
    const body = await response.json();
    
    if (!body.success || !body.data || !body.data.prices) {
      throw new Error(body.error || 'Failed to load chart data');
    }
    
    renderChart(body.data);
    loading.style.display = 'none';
    canvas.style.display = 'block';
    
  } catch (error) {
    console.error('Error loading chart:', error);
    loading.innerHTML = '<p class="error-text">Failed to load chart</p>';
  }
}

function renderChart(data) {
  const canvas = $('price-chart');
  if (!canvas) return;
  
  const ctx = canvas.getContext('2d');
  const prices = data.prices;
  
  if (prices.length === 0) {
    return;
  }
  
  // Destroy existing chart
  if (currentChart) {
    currentChart.destroy();
  }
  
  // Set canvas size based on container
  const container = canvas.parentElement;
  const containerRect = container.getBoundingClientRect();
  
  // Get device pixel ratio for crisp rendering
  const dpr = window.devicePixelRatio || 1;
  
  // Use full container width
  const displayWidth = containerRect.width;
  const displayHeight = 300;
  
  // Set actual canvas size (accounting for DPI)
  canvas.width = displayWidth * dpr;
  canvas.height = displayHeight * dpr;
  
  // Set display size (CSS pixels)
  canvas.style.width = `${displayWidth}px`;
  canvas.style.height = `${displayHeight}px`;
  
  // Scale context for DPI
  ctx.scale(dpr, dpr);
  
  // Use display dimensions for all calculations
  const canvasWidth = displayWidth;
  const canvasHeight = displayHeight;
  
  // Calculate price range
  const closePrices = prices.map(p => p.close).filter(p => p !== null);
  const minPrice = Math.min(...closePrices);
  const maxPrice = Math.max(...closePrices);
  const priceRange = maxPrice - minPrice;
  const padding = priceRange * 0.1;
  
  // Determine if price is up or down
  const firstPrice = closePrices[0];
  const lastPrice = closePrices[closePrices.length - 1];
  const priceChange = lastPrice - firstPrice;
  const percentChange = ((priceChange / firstPrice) * 100);
  const isPositive = lastPrice >= firstPrice;
  
  // Colors matching your design
  const lineColor = isPositive ? '#00ff88' : '#ff4757';
  const gradientStartColor = isPositive ? 'rgba(0, 255, 136, 0.3)' : 'rgba(255, 71, 87, 0.3)';
  const gradientEndColor = isPositive ? 'rgba(0, 255, 136, 0.0)' : 'rgba(255, 71, 87, 0.0)';
  
  // Function to redraw the chart
  const drawChart = (hoverX = null) => {
    // Clear canvas (use logical dimensions)
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    
    // Create gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, canvasHeight);
    gradient.addColorStop(0, gradientStartColor);
    gradient.addColorStop(1, gradientEndColor);
    
    // Draw filled area
    ctx.beginPath();
    ctx.moveTo(0, canvasHeight);
    
    prices.forEach((point, index) => {
      if (point.close === null) return;
      
      const x = (index / (prices.length - 1)) * canvasWidth;
      const y = canvasHeight - ((point.close - minPrice + padding) / (priceRange + padding * 2)) * canvasHeight;
      
      if (index === 0) {
        ctx.lineTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    
    ctx.lineTo(canvasWidth, canvasHeight);
    ctx.closePath();
    ctx.fillStyle = gradient;
    ctx.fill();
    
    // Draw line
    ctx.beginPath();
    prices.forEach((point, index) => {
      if (point.close === null) return;
      
      const x = (index / (prices.length - 1)) * canvasWidth;
      const y = canvasHeight - ((point.close - minPrice + padding) / (priceRange + padding * 2)) * canvasHeight;
      
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    
    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // Draw crosshair if hovering
    if (hoverX !== null) {
      // Vertical line
      ctx.beginPath();
      ctx.moveTo(hoverX, 0);
      ctx.lineTo(hoverX, canvasHeight);
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.5)';
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 5]);
      ctx.stroke();
      ctx.setLineDash([]);
      
      // Draw dot at intersection
      const index = Math.round((hoverX / canvasWidth) * (prices.length - 1));
      if (index >= 0 && index < prices.length && prices[index].close !== null) {
        const point = prices[index];
        const y = canvasHeight - ((point.close - minPrice + padding) / (priceRange + padding * 2)) * canvasHeight;
        
        ctx.beginPath();
        ctx.arc(hoverX, y, 5, 0, 2 * Math.PI);
        ctx.fillStyle = lineColor;
        ctx.fill();
        ctx.strokeStyle = 'rgba(15, 23, 42, 0.8)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
  };
  
  // Initial draw
  drawChart();
  
  // Add percentage indicator
  const percentIndicator = document.createElement('div');
  percentIndicator.className = 'chart-percent-indicator';
  percentIndicator.innerHTML = `
    <span style="color: ${isPositive ? '#00ff88' : '#ff4757'}">
      ${isPositive ? '+' : ''}${percentChange.toFixed(2)}%
    </span>
    <span style="color: #94a3b8; font-size: 0.9em; margin-left: 8px;">
      ${currentRange.toUpperCase()}
    </span>
  `;
  percentIndicator.style.display = 'block';
  
  // Remove old indicator if exists
  const oldIndicator = canvas.parentElement.querySelector('.chart-percent-indicator');
  if (oldIndicator) oldIndicator.remove();
  
  canvas.parentElement.insertBefore(percentIndicator, canvas);
  
  // Add hover interaction
  const tooltip = document.createElement('div');
  tooltip.className = 'chart-tooltip';
  tooltip.style.display = 'none';
  canvas.parentElement.appendChild(tooltip);
  
  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    
    // Clamp x to canvas bounds to ensure we can reach the edges
    const clampedX = Math.max(0, Math.min(x, canvasWidth));
    const index = Math.round((clampedX / canvasWidth) * (prices.length - 1));
    
    // Redraw chart with crosshair at clamped position
    drawChart(clampedX);
    
    if (index >= 0 && index < prices.length && prices[index].close !== null) {
      const point = prices[index];
      const date = new Date(point.timestamp);
      const dateStr = currentRange === '1d' ? 
        date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) :
        date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      
      // Calculate change from first price
      const changeFromStart = point.close - firstPrice;
      const percentFromStart = ((changeFromStart / firstPrice) * 100);
      const changeColor = changeFromStart >= 0 ? '#00ff88' : '#ff4757';
      
      tooltip.innerHTML = `
        <div style="font-weight: 600; margin-bottom: 6px;">${dateStr}</div>
        <div style="margin-bottom: 4px;">Price: <span style="font-weight: 600;">$${point.close.toFixed(2)}</span></div>
        <div style="color: ${changeColor}; font-size: 0.9em; margin-bottom: 4px;">
          ${changeFromStart >= 0 ? '+' : ''}$${changeFromStart.toFixed(2)} (${percentFromStart >= 0 ? '+' : ''}${percentFromStart.toFixed(2)}%)
        </div>
        ${point.volume ? `<div style="font-size: 0.85em; color: rgba(255,255,255,0.6);">Vol: ${formatVolume(point.volume)}</div>` : ''}
      `;
      
      tooltip.style.display = 'block';
      
      // Position tooltip intelligently based on cursor position
      const tooltipWidth = 180; // Approximate tooltip width
      const tooltipHeight = 100; // Approximate tooltip height
      
      // If cursor is in the right half, show tooltip on the left
      let tooltipX = x + 10;
      if (x > canvasWidth / 2) {
        tooltipX = x - tooltipWidth - 10;
      }
      
      // Clamp tooltip position to stay within bounds
      tooltipX = Math.max(5, Math.min(tooltipX, canvasWidth - tooltipWidth - 5));
      
      // Vertical positioning
      let tooltipY = e.clientY - rect.top - 10;
      if (tooltipY < 0) tooltipY = 10;
      if (tooltipY + tooltipHeight > canvasHeight) tooltipY = canvasHeight - tooltipHeight - 10;
      
      tooltip.style.left = `${tooltipX}px`;
      tooltip.style.top = `${tooltipY}px`;
    }
  });
  
  canvas.addEventListener('mouseleave', () => {
    tooltip.style.display = 'none';
    drawChart(); // Redraw without crosshair
  });
  
  // Store chart reference
  currentChart = { 
    destroy: () => {
      tooltip.remove();
      percentIndicator.remove();
    }
  };
}

function formatVolume(vol) {
  if (vol >= 1e9) return `${(vol / 1e9).toFixed(2)}B`;
  if (vol >= 1e6) return `${(vol / 1e6).toFixed(2)}M`;
  if (vol >= 1e3) return `${(vol / 1e3).toFixed(2)}K`;
  return vol.toString();
}

// ============================================
// ANALYST RECOMMENDATIONS
// ============================================

async function fetchRecommendations() {
  const recDiv = $('recommendations-chart');
  
  try {
    const response = await fetch(`/api/recommendations?symbol=${encodeURIComponent(symbol)}`);
    const body = await response.json();
    
    if (!body.success || !body.data || body.data.length === 0) {
      recDiv.innerHTML = '<p>Analyst recommendations not available.</p>';
      return;
    }
    
    renderRecommendations(body.data);
    
  } catch (error) {
    console.error('Error fetching recommendations:', error);
    recDiv.innerHTML = '<p class="error-text">Failed to load recommendations.</p>';
  }
}

function renderRecommendations(data) {
  const recDiv = $('recommendations-chart');
  
  // Sort by period descending (most recent first)
  const sortedData = data.sort((a, b) => b.period.localeCompare(a.period));
  
  // Calculate max total for scaling
  const maxTotal = Math.max(...sortedData.map(d => 
    d.strongBuy + d.buy + d.hold + d.sell + d.strongSell
  ));
  
  // Create chart HTML
  let html = '<div class="recommendations-container">';
  
  sortedData.forEach(item => {
    const total = item.strongBuy + item.buy + item.hold + item.sell + item.strongSell;
    const date = new Date(item.period);
    const monthYear = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    
    // Calculate percentages for stacked bar
    const strongBuyPct = (item.strongBuy / total) * 100;
    const buyPct = (item.buy / total) * 100;
    const holdPct = (item.hold / total) * 100;
    const sellPct = (item.sell / total) * 100;
    const strongSellPct = (item.strongSell / total) * 100;
    
    html += `
      <div class="rec-bar-wrapper">
        <div class="rec-period">${monthYear}</div>
        <div class="rec-bar">
          ${item.strongBuy > 0 ? `<div class="rec-segment rec-strong-buy" style="width: ${strongBuyPct}%" title="Strong Buy: ${item.strongBuy}"><span>${item.strongBuy}</span></div>` : ''}
          ${item.buy > 0 ? `<div class="rec-segment rec-buy" style="width: ${buyPct}%" title="Buy: ${item.buy}"><span>${item.buy}</span></div>` : ''}
          ${item.hold > 0 ? `<div class="rec-segment rec-hold" style="width: ${holdPct}%" title="Hold: ${item.hold}"><span>${item.hold}</span></div>` : ''}
          ${item.sell > 0 ? `<div class="rec-segment rec-sell" style="width: ${sellPct}%" title="Sell: ${item.sell}"><span>${item.sell}</span></div>` : ''}
          ${item.strongSell > 0 ? `<div class="rec-segment rec-strong-sell" style="width: ${strongSellPct}%" title="Strong Sell: ${item.strongSell}"><span>${item.strongSell}</span></div>` : ''}
        </div>
        <div class="rec-total">${total}</div>
      </div>
    `;
  });
  
  html += '</div>';
  
  // Add legend
  html += `
    <div class="rec-legend">
      <div class="rec-legend-item"><span class="rec-legend-color rec-strong-buy"></span> Strong Buy</div>
      <div class="rec-legend-item"><span class="rec-legend-color rec-buy"></span> Buy</div>
      <div class="rec-legend-item"><span class="rec-legend-color rec-hold"></span> Hold</div>
      <div class="rec-legend-item"><span class="rec-legend-color rec-sell"></span> Sell</div>
      <div class="rec-legend-item"><span class="rec-legend-color rec-strong-sell"></span> Strong Sell</div>
    </div>
  `;
  
  recDiv.innerHTML = html;
}

