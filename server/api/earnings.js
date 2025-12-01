// Earnings API - Massive API for income statements
const https = require('https');
const axios = require('axios');

const ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY;
const MASSIVE_API_KEY = process.env.MASSIVE_API_KEY;

// In-memory cache for earnings data
const earningsCache = new Map();
const estimatesCache = new Map();
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

function fetchJsonWithHeaders(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const requestOptions = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'GET',
      headers: options.headers || {},
      timeout: 10000 // 10 second timeout
    };
    
    const req = https.get(requestOptions, (res) => {
      console.log(`Response status: ${res.statusCode}`);
      
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          console.error('JSON parse error:', e.message);
          console.error('Raw data:', data.substring(0, 200));
          reject(e);
        }
      });
    });
    
    req.on('error', (e) => {
      console.error('Request error:', e.message);
      reject(e);
    });
    
    req.on('timeout', () => {
      console.error('Request timeout');
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
}

async function getEarningsSurprises(req, res) {
  const { symbol } = req.query;
  
  if (!symbol) {
    return res.json({ success: false, error: 'symbol parameter is required' });
  }
  
  if (!MASSIVE_API_KEY) {
    return res.json({ success: false, error: 'Massive API key not configured' });
  }
  
  // Check cache first
  const cached = earningsCache.get(symbol);
  
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return res.json(cached.data);
  }
  
  try {
    // Try Alpha Vantage EARNINGS API as it's more reliable
    const url = `https://www.alphavantage.co/query?function=EARNINGS&symbol=${encodeURIComponent(symbol)}&apikey=${ALPHA_VANTAGE_API_KEY}`;
    
    console.log(`Fetching earnings for ${symbol} from Alpha Vantage`);
    
    const response = await axios.get(url, {
      timeout: 10000 // 10 seconds
    });
    
    console.log(`Response status: ${response.status}`);
    const data = response.data;
    
    console.log(`Alpha Vantage response keys:`, Object.keys(data));
    
    // Check for errors
    if (data.Note || data.Information || data['Error Message']) {
      console.log(`API Error for ${symbol}:`, data.Note || data.Information || data['Error Message']);
      // Return stale cache if available
      if (cached) {
        return res.json(cached.data);
      }
      return res.json({ 
        success: false, 
        error: data.Note || data.Information || data['Error Message'] || 'No earnings data available'
      });
    }
    
    const quarterlyEarnings = data.quarterlyEarnings || [];
    
    if (quarterlyEarnings.length === 0) {
      console.log(`No earnings data for ${symbol}`);
      if (cached) {
        return res.json(cached.data);
      }
      return res.json({ 
        success: false, 
        error: 'No earnings data available'
      });
    }
    
    console.log(`${symbol} - Found ${quarterlyEarnings.length} quarterly earnings records`);
    
    // Format the data for our chart - Alpha Vantage provides reportedEPS and estimatedEPS
    const formattedEarnings = quarterlyEarnings.slice(0, 4).map(q => {
      const actual = parseFloat(q.reportedEPS) || 0;
      const estimate = parseFloat(q.estimatedEPS) || actual;
      const surprise = actual - estimate;
      const surprisePercent = estimate !== 0 ? ((surprise / Math.abs(estimate)) * 100) : 0;
      
      return {
        actual,
        estimate,
        period: q.fiscalDateEnding,
        surprise,
        surprisePercent: surprisePercent.toFixed(2),
        symbol,
        fiscalQuarter: null, // Will be calculated in frontend
        fiscalYear: null,    // Will be calculated in frontend
        reportedDate: q.reportedDate
      };
    }).reverse(); // Reverse to show oldest to newest (left to right)
    
    console.log(`${symbol} - Most recent quarter:`, {
      period: formattedEarnings[formattedEarnings.length - 1].period,
      actual: formattedEarnings[formattedEarnings.length - 1].actual,
      estimate: formattedEarnings[formattedEarnings.length - 1].estimate,
      surprise: formattedEarnings[formattedEarnings.length - 1].surprise
    });
    
    const responseData = {
      success: true,
      data: formattedEarnings
    };
    
    // Cache the response
    earningsCache.set(symbol, {
      timestamp: Date.now(),
      data: responseData
    });
    
    res.json(responseData);
    
  } catch (error) {
    console.error('Massive API earnings error:', error.message);
    if (error.response) {
      console.error('Error response status:', error.response.status);
      console.error('Error response data:', JSON.stringify(error.response.data).substring(0, 200));
    }
    
    // Return cached data if available
    if (cached) {
      console.log('Returning cached data due to error');
      return res.json(cached.data);
    }
    
    res.json({ 
      success: false, 
      error: error.response?.data?.message || error.message 
    });
  }
}

async function getEarningsEstimates(req, res) {
  const { symbol } = req.query;
  
  if (!symbol) {
    return res.json({ success: false, error: 'symbol parameter is required' });
  }
  
  if (!ALPHA_VANTAGE_API_KEY) {
    return res.json({ success: false, error: 'Alpha Vantage API key not configured' });
  }
  
  // Check cache first
  const cached = estimatesCache.get(symbol);
  
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return res.json(cached.data);
  }
  
  try {
    const url = `https://www.alphavantage.co/query?function=EARNINGS_ESTIMATES&symbol=${encodeURIComponent(symbol)}&apikey=${ALPHA_VANTAGE_API_KEY}`;
    
    const data = await fetchJson(url);
    
    // Check for errors or rate limiting
    if (data.Note || data.Information || data['Error Message']) {
      // Rate limited or error - return stale cache if available
      if (cached) {
        return res.json(cached.data);
      }
      return res.json({ 
        success: false, 
        error: data.Note || data.Information || data['Error Message'] || 'API error'
      });
    }
    
    // Alpha Vantage uses different field names
    const quarterlyData = data.quarterlyEarnings || data.quarterlyEstimates || [];
    const annualData = data.annualEarnings || data.annualEstimates || [];
    
    if (quarterlyData.length === 0 && annualData.length === 0) {
      return res.json({ 
        success: false, 
        error: 'No estimates data available for this symbol'
      });
    }
    
    const responseData = {
      success: true,
      data: {
        quarterly: quarterlyData.slice(0, 4),
        annual: annualData.slice(0, 3)
      }
    };
    
    // Cache the response
    estimatesCache.set(symbol, {
      timestamp: Date.now(),
      data: responseData
    });
    
    res.json(responseData);
    
  } catch (error) {
    console.error('Alpha Vantage Estimates API error:', error.message);
    res.json({ 
      success: false, 
      error: error.message 
    });
  }
}

function clearCache(req, res) {
  const { symbol } = req.query;
  
  if (symbol) {
    earningsCache.delete(symbol);
    estimatesCache.delete(symbol);
    res.json({ success: true, message: `Cache cleared for ${symbol}` });
  } else {
    earningsCache.clear();
    estimatesCache.clear();
    res.json({ success: true, message: 'All earnings cache cleared' });
  }
}

module.exports = { getEarningsSurprises, getEarningsEstimates, clearCache };
