// Finnhub Basic Financials API
const https = require('https');

const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;

// In-memory cache for financials data
const financialsCache = new Map();
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

async function getBasicFinancials(req, res) {
  const { symbol } = req.query;
  
  if (!symbol) {
    return res.json({ success: false, error: 'symbol parameter is required' });
  }
  
  if (!FINNHUB_API_KEY) {
    return res.json({ success: false, error: 'Finnhub API key not configured' });
  }
  
  // Check cache first
  const cached = financialsCache.get(symbol);
  
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return res.json(cached.data);
  }
  
  try {
    const url = `https://finnhub.io/api/v1/stock/metric?symbol=${encodeURIComponent(symbol)}&metric=all&token=${FINNHUB_API_KEY}`;
    
    const data = await fetchJson(url);
    
    if (data.error) {
      return res.json({ 
        success: false, 
        error: data.error 
      });
    }
    
    const responseData = {
      success: true,
      data: {
        symbol: data.symbol,
        metric: data.metric,
        series: data.series,
        metricType: data.metricType
      }
    };
    
    // Cache the response
    financialsCache.set(symbol, {
      timestamp: Date.now(),
      data: responseData
    });
    
    res.json(responseData);
    
  } catch (error) {
    console.error('Finnhub Financials API error:', error.message);
    res.json({ 
      success: false, 
      error: error.message 
    });
  }
}

module.exports = { getBasicFinancials };
