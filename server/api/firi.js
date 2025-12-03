const axios = require('axios');

const FIRI_API_KEY = process.env.FIRI_API_KEY;
const FIRI_BASE_URL = 'https://api.firi.com/v2';

// Cache for balances and USDT to NOK rate
const balancesCache = new Map();
const nokRateCache = new Map();
const BALANCES_CACHE_DURATION = 30000; // 30 seconds for balances
const NOK_RATE_CACHE_DURATION = 60000; // 1 minute for NOK/USDT rate

module.exports = function(app) {
  
  // Get crypto balances (cached)
  app.get('/api/firi/balances', async (req, res) => {
    try {
      // Use user's API key from header if provided, otherwise use server's key
      const apiKey = req.headers['x-firi-user-key'] || FIRI_API_KEY;
      
      if (!apiKey) {
        return res.json({ 
          success: false, 
          error: 'No API key configured. Please enter your Firi API key.' 
        });
      }
      
      // Check cache first (cache per API key to support multiple users)
      const cacheKey = `balances_${apiKey.substring(0, 8)}`;
      const cached = balancesCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < BALANCES_CACHE_DURATION) {
        return res.json(cached.data);
      }

      // Fetch balances from Firi with API key
      const response = await axios.get(`${FIRI_BASE_URL}/balances`, {
        headers: {
          'firi-access-key': apiKey,
          'Accept': 'application/json'
        },
        timeout: 10000
      });

      const balances = response.data;

      // Filter out zero balances
      const formattedBalances = balances
        .filter(balance => parseFloat(balance.balance) > 0)
        .map(balance => ({
          currency: balance.currency,
          balance: parseFloat(balance.balance)
        }));

      const responseData = {
        success: true,
        data: formattedBalances
      };

      // Cache the result (per API key)
      balancesCache.set(cacheKey, {
        data: responseData,
        timestamp: Date.now()
      });

      res.json(responseData);

    } catch (error) {
      console.error('Firi API error:', error.message);
      
      // Return cached data if available
      const apiKey = req.headers['x-firi-user-key'] || FIRI_API_KEY;
      const cacheKey = `balances_${apiKey?.substring(0, 8) || 'default'}`;
      const cached = balancesCache.get(cacheKey);
      if (cached) {
        return res.json(cached.data);
      }

      res.status(error.response?.status || 500).json({
        success: false,
        error: error.response?.data?.message || error.message
      });
    }
  });

  // Get USDT to NOK exchange rate (cached)
  app.get('/api/firi/usdt-nok-rate', async (req, res) => {
    try {
      // Check cache first
      const cached = nokRateCache.get('rate');
      if (cached && Date.now() - cached.timestamp < NOK_RATE_CACHE_DURATION) {
        return res.json(cached.data);
      }

      // Get USDT/NOK rate from Firi markets
      const response = await axios.get(`${FIRI_BASE_URL}/markets`, {
        headers: {
          'Accept': 'application/json'
        },
        timeout: 10000
      });

      const markets = response.data;
      const usdtNokMarket = markets.find(m => m.id === 'usdtnok');
      const rate = usdtNokMarket ? parseFloat(usdtNokMarket.last) : 10.5; // Fallback rate

      const responseData = {
        success: true,
        rate: rate
      };

      // Cache the result
      nokRateCache.set('rate', {
        data: responseData,
        timestamp: Date.now()
      });

      res.json(responseData);

    } catch (error) {
      console.error('Firi USDT/NOK rate error:', error.message);
      
      // Return cached data if available
      const cached = nokRateCache.get('rate');
      if (cached) {
        return res.json(cached.data);
      }

      res.json({
        success: true,
        rate: 10.5 // Fallback rate
      });
    }
  });

  // Get market data for a specific crypto pair
  app.get('/api/firi/markets', async (req, res) => {
    try {
      const response = await axios.get(`${FIRI_BASE_URL}/markets`, {
        headers: {
          'Accept': 'application/json'
        },
        timeout: 10000
      });

      res.json({
        success: true,
        data: response.data
      });

    } catch (error) {
      console.error('Firi markets API error:', error.message);
      res.status(error.response?.status || 500).json({
        success: false,
        error: error.response?.data?.message || error.message
      });
    }
  });

  // Clear cache endpoint (useful for testing)
  app.get('/api/firi/clear-cache', (req, res) => {
    balancesCache.clear();
    nokRateCache.clear();
    res.json({ success: true, message: 'Firi cache cleared' });
  });

};
