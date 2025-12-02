// Finnhub Recommendations API
const https = require('https');

const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;

// In-memory cache for recommendations
const recommendationsCache = new Map();
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours - recommendations don't change frequently

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

async function getRecommendations(req, res) {
  const { symbol } = req.query;
  
  if (!symbol) {
    return res.json({ success: false, error: 'symbol parameter is required' });
  }
  
  if (!FINNHUB_API_KEY) {
    return res.json({ success: false, error: 'Finnhub API key not configured' });
  }
  
  // Check cache first
  const cached = recommendationsCache.get(symbol);
  
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return res.json(cached.data);
  }
  
  try {
    const url = `https://finnhub.io/api/v1/stock/recommendation?symbol=${encodeURIComponent(symbol)}&token=${FINNHUB_API_KEY}`;
    
    const data = await fetchJson(url);
    
    // Check for errors
    if (data.error) {
      if (cached) {
        return res.json(cached.data);
      }
      return res.json({ 
        success: false, 
        error: data.error 
      });
    }
    
    if (!data || data.length === 0) {
      return res.json({ 
        success: false, 
        error: 'No recommendation data available for this symbol'
      });
    }
    
    // Get the last 6 months of data
    const recommendations = data.slice(0, 6);
    
    const responseData = {
      success: true,
      data: recommendations
    };
    
    // Cache the response
    recommendationsCache.set(symbol, {
      timestamp: Date.now(),
      data: responseData
    });
    
    res.json(responseData);
    
  } catch (error) {
    console.error('Finnhub Recommendations API error:', error.message);
    
    // Return cached data if available
    if (cached) {
      return res.json(cached.data);
    }
    
    res.json({ 
      success: false, 
      error: error.message 
    });
  }
}

module.exports = { getRecommendations };
