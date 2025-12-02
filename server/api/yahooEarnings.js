const axios = require('axios');

// Cache for earnings data (24 hour TTL since earnings are quarterly)
const earningsCache = new Map();
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;

/**
 * Get earnings data from Finnhub API (more reliable than Yahoo)
 * Includes: earnings history and estimates
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function getEarningsData(req, res) {
  const symbol = req.query.symbol;
  
  if (!symbol) {
    return res.status(400).json({ success: false, error: 'Symbol is required' });
  }
  
  const cacheKey = symbol.toUpperCase();
  
  // Check cache first
  const cached = earningsCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return res.json({ success: true, data: cached.data, cached: true });
  }
  
  try {
    // Fetch earnings surprises and earnings calendar from Finnhub
    const [surprisesRes, calendarRes] = await Promise.all([
      axios.get(`https://finnhub.io/api/v1/stock/earnings`, {
        params: {
          symbol: symbol,
          token: FINNHUB_API_KEY
        },
        timeout: 10000
      }),
      axios.get(`https://finnhub.io/api/v1/calendar/earnings`, {
        params: {
          from: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          to: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          symbol: symbol,
          token: FINNHUB_API_KEY
        },
        timeout: 10000
      })
    ]);
    
    const surprises = surprisesRes.data || [];
    const calendar = calendarRes.data?.earningsCalendar || [];
    
    if (surprises.length === 0 && calendar.length === 0) {
      // Try stale cache if available
      if (cached) {
        return res.json({ success: true, data: cached.data, stale: true });
      }
      return res.status(404).json({ success: false, error: 'No earnings data found' });
    }
    
    // Format the data
    const earningsData = {
      // Historical earnings with surprises
      history: formatEarningsHistory(surprises),
      
      // Future estimates from calendar
      estimates: formatEarningsEstimates(calendar),
      
      // Next earnings date
      nextEarningsDate: findNextEarningsDate(calendar)
    };
    
    // Cache the results
    earningsCache.set(cacheKey, {
      data: earningsData,
      timestamp: Date.now()
    });
    
    res.json({ success: true, data: earningsData });
    
  } catch (error) {
    console.error('Finnhub earnings error:', error.message);
    
    // Try stale cache on error
    if (cached) {
      return res.json({ success: true, data: cached.data, stale: true });
    }
    
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch earnings data',
      message: error.message 
    });
  }
}

/**
 * Format earnings history from Finnhub
 */
function formatEarningsHistory(surprises) {
  if (!surprises || surprises.length === 0) return [];
  
  return surprises
    .filter(item => {
      // Only include if both actual and estimate exist AND quarter/year are present
      return item.actual !== null && item.estimate !== null && item.quarter && item.year;
    })
    .map(item => {
      const actual = item.actual;
      const estimate = item.estimate;
      const surprise = actual - estimate;
      const surprisePercent = estimate !== 0 ? (surprise / estimate) * 100 : 0;
      
      return {
        quarter: `Q${item.quarter} FY${item.year}`,
        date: item.period || 'N/A',
        epsActual: actual,
        epsEstimate: estimate,
        epsSurprise: surprise,
        surprisePercent: surprisePercent
      };
    })
    .slice(0, 12) // Last 12 quarters (3 years)
    .reverse(); // Most recent first
}

/**
 * Format earnings estimates from Finnhub calendar
 */
function formatEarningsEstimates(calendar) {
  if (!calendar || calendar.length === 0) return [];
  
  const now = new Date();
  const futureEarnings = calendar
    .filter(item => {
      const date = new Date(item.date);
      return date > now && item.epsEstimate !== null;
    })
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .slice(0, 4); // Next 4 quarters
  
  return futureEarnings.map((item, index) => {
    const date = new Date(item.date);
    const quarter = `Q${Math.floor(date.getMonth() / 3) + 1}`;
    const year = date.getFullYear();
    
    return {
      period: `${quarter} ${year}`,
      endDate: item.date,
      growth: null,
      earningsEstimate: {
        avg: item.epsEstimate,
        low: null,
        high: null,
        numberOfAnalysts: null
      },
      revenueEstimate: {
        avg: item.revenueEstimate || null,
        low: null,
        high: null,
        numberOfAnalysts: null
      }
    };
  });
}

/**
 * Find next earnings date
 */
function findNextEarningsDate(calendar) {
  if (!calendar || calendar.length === 0) return null;
  
  const now = new Date();
  const future = calendar
    .filter(item => new Date(item.date) > now)
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  
  return future.length > 0 ? future[0].date : null;
}

/**
 * Clear cache for a specific symbol or all symbols
 */
function clearCache(req, res) {
  const symbol = req.query.symbol;
  
  if (symbol) {
    earningsCache.delete(symbol.toUpperCase());
    res.json({ success: true, message: `Cache cleared for ${symbol}` });
  } else {
    earningsCache.clear();
    res.json({ success: true, message: 'All earnings cache cleared' });
  }
}

module.exports = { getEarningsData, clearCache };
