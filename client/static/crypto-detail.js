// Get coin ID from URL
const urlParams = new URLSearchParams(window.location.search);
const coinSymbol = urlParams.get('symbol');
const userBalance = parseFloat(urlParams.get('balance')) || 0;

// Store coin data
let coinData = null;
let chartInstance = null;
let currentChartDays = '1';

// Currency ID mapping (same as backend - CoinPaprika format)
const CURRENCY_ID_MAP = {
  'BTC': 'btc-bitcoin',
  'ETH': 'eth-ethereum',
  'ADA': 'ada-cardano',
  'LTC': 'ltc-litecoin',
  'XRP': 'xrp-xrp',
  'SOL': 'sol-solana',
  'DOGE': 'doge-dogecoin',
  'USDT': 'usdt-tether',
  'USDC': 'usdc-usd-coin',
  'BNB': 'bnb-binance-coin',
  'DOT': 'dot-polkadot',
  'LINK': 'link-chainlink',
  'NOK': 'nok-norwegian-krone'
};

// Format NOK currency
function formatNOK(value) {
  if (value === null || value === undefined) return 'N/A';
  return new Intl.NumberFormat('nb-NO', {
    style: 'currency',
    currency: 'NOK',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

// Format large numbers with suffixes
function formatLargeNumber(value) {
  if (value === null || value === undefined) return 'N/A';
  
  const absValue = Math.abs(value);
  
  if (absValue >= 1e12) {
    return `${(value / 1e12).toFixed(2)}T`;
  } else if (absValue >= 1e9) {
    return `${(value / 1e9).toFixed(2)}B`;
  } else if (absValue >= 1e6) {
    return `${(value / 1e6).toFixed(2)}M`;
  } else if (absValue >= 1e3) {
    return `${(value / 1e3).toFixed(2)}K`;
  }
  return value.toLocaleString('nb-NO', { maximumFractionDigits: 2 });
}

// Format percentage
function formatPercent(value) {
  if (value === null || value === undefined) return 'N/A';
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

// Format crypto amount
function formatCryptoAmount(value, decimals = 8) {
  if (value === null || value === undefined) return 'N/A';
  return parseFloat(value.toFixed(decimals));
}

// Format date
function formatDate(dateString) {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  return date.toLocaleDateString('nb-NO', { year: 'numeric', month: 'long', day: 'numeric' });
}

// Show error message
function showError(message) {
  const errorDiv = document.getElementById('error-message');
  errorDiv.textContent = message;
  errorDiv.style.display = 'block';
}

// Get coin ID from symbol
async function getCoinId(symbol) {
  // Check local mapping first
  if (CURRENCY_ID_MAP[symbol]) {
    return CURRENCY_ID_MAP[symbol];
  }

  // Search via API
  try {
    const response = await fetch(`/api/coinpaprika/search/${symbol}`);
    const data = await response.json();
    
    if (data.success && data.coinId) {
      return data.coinId;
    }
  } catch (error) {
    console.error('Error searching for coin ID:', error);
  }

  return null;
}

// Fetch coin data
async function fetchCoinData(coinId) {
  try {
    const response = await fetch(`/api/coinpaprika/coins/${coinId}`);
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'Failed to fetch coin data');
    }
    
    coinData = data.data;
    displayCoinData();
    fetchChartData(coinId, currentChartDays);
  } catch (error) {
    console.error('Error fetching coin data:', error);
    showError(`Failed to load coin data: ${error.message}`);
  }
}

// Display coin data
function displayCoinData() {
  if (!coinData) return;

  // Update header
  const coinImage = document.getElementById('coin-image');
  const coinName = document.getElementById('coin-name');
  
  if (coinData.image) {
    coinImage.src = coinData.image;
    coinImage.alt = coinData.name;
    coinImage.style.display = 'block';
  }
  
  coinName.textContent = coinData.name;
  
  // Build meta info line (symbol, rank, website)
  const coinMeta = document.getElementById('coin-meta');
  let metaHTML = coinData.symbol;
  if (coinData.market_data?.market_cap_rank) {
    metaHTML += ` • Rank #${coinData.market_data.market_cap_rank}`;
  }
  if (coinData.links?.homepage) {
    metaHTML += ` • <a href="${coinData.links.homepage}" target="_blank" style="color: #3b82f6; text-decoration: none;">Visit website →</a>`;
  }
  coinMeta.innerHTML = metaHTML;
  
  document.title = `${coinData.name} (${coinData.symbol}) - BullPen`;

  // Update price section
  const quoteData = document.getElementById('quote-data');
  const currentPrice = coinData.market_data?.current_price?.nok;
  const priceChange24h = coinData.market_data?.price_change_percentage_24h;
  const high24h = coinData.market_data?.high_24h?.nok;
  const low24h = coinData.market_data?.low_24h?.nok;

  const priceClass = priceChange24h >= 0 ? 'gain-positive' : 'gain-negative';
  
  quoteData.innerHTML = `
    <div class="quote-item">
      <span class="quote-label">Price</span>
      <span class="quote-value" style="font-size: 32px; font-weight: 700;">${formatNOK(currentPrice)}</span>
    </div>
    <div class="quote-item">
      <span class="quote-label">24h Change</span>
      <span class="quote-value ${priceClass}" style="font-size: 24px; font-weight: 600;">
        ${formatPercent(priceChange24h)}
      </span>
    </div>
    <div class="quote-item">
      <span class="quote-label">24h High</span>
      <span class="quote-value">${formatNOK(high24h)}</span>
    </div>
    <div class="quote-item">
      <span class="quote-label">24h Low</span>
      <span class="quote-value">${formatNOK(low24h)}</span>
    </div>
  `;

  // Update timestamp
  document.getElementById('quote-timestamp').textContent = 
    `Last updated: ${new Date(coinData.last_updated).toLocaleString('nb-NO')}`;

  // Update position data
  const positionData = document.getElementById('position-data');
  const marketValue = currentPrice ? currentPrice * userBalance : 0;
  
  if (userBalance > 0) {
    positionData.innerHTML = `
      <div class="info-item">
        <span class="info-label">Holdings</span>
        <span class="info-value">${formatCryptoAmount(userBalance)} ${coinData.symbol}</span>
      </div>
      <div class="info-item">
        <span class="info-label">Current Value</span>
        <span class="info-value gain-positive">${formatNOK(marketValue)}</span>
      </div>
      <div class="info-item">
        <span class="info-label">Average Price</span>
        <span class="info-value">${formatNOK(currentPrice)}</span>
      </div>
    `;
  } else {
    positionData.innerHTML = `
      <p style="color: #94a3b8;">You don't currently hold any ${coinData.symbol}</p>
    `;
  }

  // Update key metrics - only show available data
  const coinMetrics = document.getElementById('coin-metrics');
  const marketCap = coinData.market_data?.market_cap?.nok;
  const volume24h = coinData.market_data?.total_volume?.nok;
  const circulatingSupply = coinData.market_data?.circulating_supply;
  const maxSupply = coinData.market_data?.max_supply;
  const ath = coinData.market_data?.ath?.nok;
  const athChange = coinData.market_data?.ath_change_percentage?.nok;
  
  let metricsHTML = '';
  
  if (marketCap) {
    metricsHTML += `
      <div class="info-item">
        <span class="info-label">Market Cap</span>
        <span class="info-value">${formatLargeNumber(marketCap)} kr</span>
      </div>
    `;
  }
  
  if (volume24h) {
    metricsHTML += `
      <div class="info-item">
        <span class="info-label">24h Volume</span>
        <span class="info-value">${formatLargeNumber(volume24h)} kr</span>
      </div>
    `;
  }
  
  if (circulatingSupply) {
    metricsHTML += `
      <div class="info-item">
        <span class="info-label">Circulating Supply</span>
        <span class="info-value">${formatLargeNumber(circulatingSupply)} ${coinData.symbol}</span>
      </div>
    `;
  }
  
  if (maxSupply || circulatingSupply) {
    metricsHTML += `
      <div class="info-item">
        <span class="info-label">Max Supply</span>
        <span class="info-value">${maxSupply ? formatLargeNumber(maxSupply) + ' ' + coinData.symbol : '∞'}</span>
      </div>
    `;
  }
  
  if (ath) {
    metricsHTML += `
      <div class="info-item">
        <span class="info-label">All-Time High</span>
        <span class="info-value">${formatNOK(ath)}</span>
      </div>
    `;
  }
  
  if (athChange !== null && athChange !== undefined) {
    metricsHTML += `
      <div class="info-item">
        <span class="info-label">From ATH</span>
        <span class="info-value ${athChange >= 0 ? 'gain-positive' : 'gain-negative'}">
          ${formatPercent(athChange)}
        </span>
      </div>
    `;
  }
  
  coinMetrics.innerHTML = metricsHTML || '<p style="color: #94a3b8;">No metrics available</p>';

  // Update description
  if (coinData.description) {
    const descSection = document.getElementById('description-section');
    const aboutCoinName = document.getElementById('about-coin-name');
    const coinDescription = document.getElementById('coin-description');
    
    // Strip HTML tags and limit length
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = coinData.description;
    let text = tempDiv.textContent || tempDiv.innerText || '';
    
    // Limit to first 3 paragraphs or 500 characters
    const paragraphs = text.split('\n\n').slice(0, 3).join('\n\n');
    text = paragraphs.length > 500 ? paragraphs.substring(0, 500) + '...' : paragraphs;
    
    aboutCoinName.textContent = coinData.name;
    coinDescription.textContent = text;
    descSection.style.display = 'block';
  }
}

// Fetch and display chart data
async function fetchChartData(coinId, days) {
  try {
    const chartLoading = document.getElementById('chart-loading');
    chartLoading.style.display = 'block';
    
    const interval = days === '1' ? 'hourly' : 'daily';
    const response = await fetch(`/api/coinpaprika/coins/${coinId}/chart?days=${days}`);
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'Failed to fetch chart data');
    }
    
    displayChart(data.data.prices);
    chartLoading.style.display = 'none';
  } catch (error) {
    console.error('Error fetching chart data:', error);
    document.getElementById('chart-loading').textContent = 'Failed to load chart';
  }
}

// Display chart
function displayChart(prices) {
  const canvas = document.getElementById('price-chart');
  const ctx = canvas.getContext('2d');
  
  // Destroy existing chart
  if (chartInstance) {
    chartInstance.destroy();
  }
  
  // Prepare data
  const labels = prices.map(p => new Date(p[0]));
  const data = prices.map(p => p[1]);
  
  // Determine if overall trend is positive
  const firstPrice = data[0];
  const lastPrice = data[data.length - 1];
  const isPositive = lastPrice >= firstPrice;
  
  // Create chart
  chartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'Price (NOK)',
        data: data,
        borderColor: isPositive ? '#10b981' : '#ef4444',
        backgroundColor: isPositive 
          ? 'rgba(16, 185, 129, 0.1)' 
          : 'rgba(239, 68, 68, 0.1)',
        borderWidth: 2,
        fill: true,
        tension: 0.4,
        pointRadius: 0,
        pointHoverRadius: 6,
        pointHoverBackgroundColor: isPositive ? '#10b981' : '#ef4444',
        pointHoverBorderColor: '#fff',
        pointHoverBorderWidth: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        intersect: false,
        mode: 'index'
      },
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          backgroundColor: 'rgba(15, 23, 42, 0.95)',
          titleColor: '#e1e8f0',
          bodyColor: '#e1e8f0',
          borderColor: '#334155',
          borderWidth: 1,
          padding: 12,
          displayColors: false,
          callbacks: {
            title: function(context) {
              const date = new Date(context[0].parsed.x);
              return date.toLocaleString('nb-NO');
            },
            label: function(context) {
              return formatNOK(context.parsed.y);
            }
          }
        }
      },
      scales: {
        x: {
          type: 'time',
          time: {
            unit: currentChartDays === '1' ? 'hour' : 'day'
          },
          grid: {
            color: '#1e293b',
            drawBorder: false
          },
          ticks: {
            color: '#64748b',
            maxRotation: 0
          }
        },
        y: {
          grid: {
            color: '#1e293b',
            drawBorder: false
          },
          ticks: {
            color: '#64748b',
            callback: function(value) {
              return formatNOK(value);
            }
          }
        }
      }
    }
  });
}

// Initialize chart controls
function initializeChartControls() {
  const buttons = document.querySelectorAll('.chart-btn');
  
  buttons.forEach(button => {
    button.addEventListener('click', async () => {
      // Update active button
      buttons.forEach(btn => btn.classList.remove('active'));
      button.classList.add('active');
      
      // Get chart parameters
      const days = button.dataset.days;
      currentChartDays = days;
      
      // Fetch new chart data
      const coinId = CURRENCY_ID_MAP[coinSymbol];
      if (coinId) {
        await fetchChartData(coinId, days);
      }
    });
  });
}

// Initialize page
async function init() {
  if (!coinSymbol) {
    showError('No cryptocurrency specified');
    return;
  }

  // Get coin ID
  const coinId = await getCoinId(coinSymbol);
  
  if (!coinId) {
    showError(`Could not find cryptocurrency: ${coinSymbol}`);
    return;
  }

  // Fetch coin data
  await fetchCoinData(coinId);
  
  // Initialize chart controls
  initializeChartControls();
}

// Start
init();
