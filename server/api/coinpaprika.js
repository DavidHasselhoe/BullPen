const express = require('express');
const router = express.Router();
const axios = require('axios');

const COINPAPRIKA_BASE_URL = 'https://api.coinpaprika.com/v1';

// Cache for coin data
const coinCache = new Map();
const CACHE_DURATION = 2 * 60 * 1000; // 2 minutes

// Map common currency symbols to CoinPaprika IDs
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

// Helper function to convert USD to NOK
async function getUsdToNokRate() {
  try {
    const cached = coinCache.get('usd_nok_rate');
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return cached.data;
    }

    // Fetch from exchange rates API
    const response = await axios.get('http://localhost:3000/api/exchangeRates', {
      timeout: 5000
    });

    const rate = response.data?.data?.USD || 10.5; // Fallback rate
    
    coinCache.set('usd_nok_rate', {
      data: rate,
      timestamp: Date.now()
    });

    return rate;
  } catch (error) {
    console.error('Error fetching USD/NOK rate:', error.message);
    return 10.5; // Fallback
  }
}

// Get coin details by ID
router.get('/coins/:id', async (req, res) => {
  try {
    const coinId = req.params.id.toLowerCase();
    
    // Check cache first
    const cacheKey = `coin_${coinId}`;
    const cached = coinCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return res.json(cached.data);
    }

    // Fetch coin data from CoinPaprika
    const [coinResponse, tickerResponse] = await Promise.all([
      axios.get(`${COINPAPRIKA_BASE_URL}/coins/${coinId}`, {
        headers: { 'Accept': 'application/json' },
        timeout: 10000
      }),
      axios.get(`${COINPAPRIKA_BASE_URL}/tickers/${coinId}`, {
        headers: { 'Accept': 'application/json' },
        timeout: 10000
      })
    ]);

    const coinData = coinResponse.data;
    const tickerData = tickerResponse.data;
    
    // Get USD to NOK rate
    const usdToNok = await getUsdToNokRate();

    // Format the response to match our expected structure
    const formattedData = {
      success: true,
      data: {
        id: coinData.id,
        symbol: coinData.symbol?.toUpperCase(),
        name: coinData.name,
        image: coinData.logo || `https://static.coinpaprika.com/coin/${coinId}/logo.png`,
        description: coinData.description,
        links: {
          homepage: coinData.links?.website?.[0],
          whitepaper: coinData.whitepaper?.link,
          blockchain_site: coinData.links?.explorer?.filter(e => e),
          twitter: coinData.links?.twitter?.[0]?.replace('https://twitter.com/', ''),
          subreddit: coinData.links?.reddit?.[0]
        },
        team: coinData.team?.map(member => ({
          name: member.name,
          position: member.position
        })) || [],
        market_data: {
          current_price: {
            usd: tickerData.quotes?.USD?.price,
            nok: tickerData.quotes?.USD?.price ? tickerData.quotes.USD.price * usdToNok : null
          },
          market_cap: {
            usd: tickerData.quotes?.USD?.market_cap,
            nok: tickerData.quotes?.USD?.market_cap ? tickerData.quotes.USD.market_cap * usdToNok : null
          },
          market_cap_rank: tickerData.rank,
          total_volume: {
            usd: tickerData.quotes?.USD?.volume_24h,
            nok: tickerData.quotes?.USD?.volume_24h ? tickerData.quotes.USD.volume_24h * usdToNok : null
          },
          high_24h: {
            usd: tickerData.quotes?.USD?.price ? tickerData.quotes.USD.price * (1 + (tickerData.quotes.USD.percent_change_24h || 0) / 100) : null,
            nok: tickerData.quotes?.USD?.price ? tickerData.quotes.USD.price * (1 + (tickerData.quotes.USD.percent_change_24h || 0) / 100) * usdToNok : null
          },
          low_24h: {
            usd: tickerData.quotes?.USD?.price ? tickerData.quotes.USD.price * (1 - Math.abs(tickerData.quotes.USD.percent_change_24h || 0) / 100) : null,
            nok: tickerData.quotes?.USD?.price ? tickerData.quotes.USD.price * (1 - Math.abs(tickerData.quotes.USD.percent_change_24h || 0) / 100) * usdToNok : null
          },
          price_change_24h: tickerData.quotes?.USD?.price && tickerData.quotes?.USD?.percent_change_24h 
            ? tickerData.quotes.USD.price * (tickerData.quotes.USD.percent_change_24h / 100)
            : null,
          price_change_percentage_24h: tickerData.quotes?.USD?.percent_change_24h,
          price_change_percentage_7d: tickerData.quotes?.USD?.percent_change_7d,
          price_change_percentage_30d: tickerData.quotes?.USD?.percent_change_30d,
          price_change_percentage_1y: tickerData.quotes?.USD?.percent_change_1y,
          ath: {
            usd: tickerData.quotes?.USD?.ath_price,
            nok: tickerData.quotes?.USD?.ath_price ? tickerData.quotes.USD.ath_price * usdToNok : null
          },
          ath_change_percentage: {
            usd: tickerData.quotes?.USD?.percent_from_price_ath,
            nok: tickerData.quotes?.USD?.percent_from_price_ath
          },
          ath_date: {
            usd: tickerData.quotes?.USD?.ath_date,
            nok: tickerData.quotes?.USD?.ath_date
          },
          atl: {
            usd: null, // CoinPaprika doesn't provide ATL
            nok: null
          },
          circulating_supply: tickerData.circulating_supply,
          total_supply: tickerData.total_supply,
          max_supply: tickerData.max_supply
        },
        community_data: {
          twitter_followers: null, // Not available in basic API
          reddit_subscribers: null,
          telegram_channel_user_count: null
        },
        last_updated: tickerData.last_updated
      }
    };

    // Cache the result
    coinCache.set(cacheKey, {
      data: formattedData,
      timestamp: Date.now()
    });

    res.json(formattedData);

  } catch (error) {
    console.error('CoinPaprika API error:', error.message);
    
    // Return cached data if available
    const coinId = req.params.id.toLowerCase();
    const cacheKey = `coin_${coinId}`;
    const cached = coinCache.get(cacheKey);
    if (cached) {
      return res.json(cached.data);
    }

    res.status(error.response?.status || 500).json({
      success: false,
      error: error.response?.data?.error || error.message
    });
  }
});

// Get coin price chart data (OHLCV historical data)
router.get('/coins/:id/chart', async (req, res) => {
  try {
    const coinId = req.params.id.toLowerCase();
    const days = req.query.days || '1';
    
    // Check cache first
    const cacheKey = `chart_${coinId}_${days}`;
    const cached = coinCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return res.json(cached.data);
    }

    // Calculate start and end dates based on days
    const end = new Date();
    let start = new Date();
    
    if (days === 'max') {
      start = new Date('2013-01-01'); // CoinPaprika historical data start
    } else {
      start.setDate(end.getDate() - parseInt(days));
    }

    const startStr = start.toISOString().split('T')[0];
    const endStr = end.toISOString().split('T')[0];

    // Fetch historical OHLCV data from CoinPaprika
    const response = await axios.get(`${COINPAPRIKA_BASE_URL}/coins/${coinId}/ohlcv/historical`, {
      headers: { 'Accept': 'application/json' },
      params: {
        start: startStr,
        end: endStr
      },
      timeout: 10000
    });

    // Get USD to NOK rate
    const usdToNok = await getUsdToNokRate();

    // Format data to match expected structure (timestamp, price)
    const prices = response.data.map(item => [
      new Date(item.time_close).getTime(),
      item.close * usdToNok
    ]);

    const chartData = {
      success: true,
      data: {
        prices: prices,
        market_caps: response.data.map(item => [
          new Date(item.time_close).getTime(),
          item.market_cap * usdToNok
        ]),
        total_volumes: response.data.map(item => [
          new Date(item.time_close).getTime(),
          item.volume * usdToNok
        ])
      }
    };

    // Cache the result
    coinCache.set(cacheKey, {
      data: chartData,
      timestamp: Date.now()
    });

    res.json(chartData);

  } catch (error) {
    console.error('CoinPaprika chart API error:', error.message);
    
    // Return cached data if available
    const coinId = req.params.id.toLowerCase();
    const days = req.query.days || '1';
    const cacheKey = `chart_${coinId}_${days}`;
    const cached = coinCache.get(cacheKey);
    if (cached) {
      return res.json(cached.data);
    }

    res.status(error.response?.status || 500).json({
      success: false,
      error: error.response?.data?.error || error.message
    });
  }
});

// Get coin ID from symbol
router.get('/search/:symbol', async (req, res) => {
  try {
    const symbol = req.params.symbol.toUpperCase();
    
    // Check if we have a direct mapping
    if (CURRENCY_ID_MAP[symbol]) {
      return res.json({
        success: true,
        coinId: CURRENCY_ID_MAP[symbol]
      });
    }

    // Search CoinPaprika coins list
    const response = await axios.get(`${COINPAPRIKA_BASE_URL}/coins`, {
      headers: { 'Accept': 'application/json' },
      timeout: 10000
    });

    const coins = response.data || [];
    const match = coins.find(c => c.symbol?.toUpperCase() === symbol && c.is_active);

    if (match) {
      return res.json({
        success: true,
        coinId: match.id
      });
    }

    res.json({
      success: false,
      error: 'Coin not found'
    });

  } catch (error) {
    console.error('CoinPaprika search error:', error.message);
    res.status(error.response?.status || 500).json({
      success: false,
      error: error.response?.data?.error || error.message
    });
  }
});

// Clear cache endpoint
router.get('/clear-cache', (req, res) => {
  coinCache.clear();
  res.json({ success: true, message: 'CoinPaprika cache cleared' });
});

module.exports = router;
