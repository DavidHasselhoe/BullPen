const axios = require('axios');

// Cache for search results (5 minute TTL)
const searchCache = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Search for stocks using Yahoo Finance Search API
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function searchStocks(req, res) {
  const query = req.query.q;
  
  if (!query || query.trim().length === 0) {
    return res.json({ success: true, data: [] });
  }
  
  const cacheKey = query.toLowerCase().trim();
  
  // Check cache first
  const cached = searchCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return res.json({ success: true, data: cached.data, cached: true });
  }
  
  try {
    const response = await axios.get('https://query1.finance.yahoo.com/v1/finance/search', {
      params: {
        q: query,
        quotesCount: 10,
        newsCount: 0,
        enableFuzzyQuery: false,
        quotesQueryId: 'tss_match_phrase_query'
      },
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      },
      timeout: 8000
    });
    
    if (!response.data || !response.data.quotes) {
      // Try stale cache if available
      if (cached) {
        return res.json({ success: true, data: cached.data, stale: true });
      }
      return res.json({ success: true, data: [] });
    }
    
    // Filter and format results
    const results = response.data.quotes
      .filter(quote => {
        // Only include equities, ETFs, and indices
        const validTypes = ['EQUITY', 'ETF', 'INDEX', 'MUTUALFUND'];
        return quote.symbol && validTypes.includes(quote.quoteType);
      })
      .map(quote => ({
        symbol: quote.symbol,
        name: quote.shortname || quote.longname || quote.symbol,
        type: quote.quoteType,
        exchange: quote.exchange || quote.exchDisp || 'N/A',
        score: quote.score || 0
      }))
      .sort((a, b) => b.score - a.score) // Sort by relevance
      .slice(0, 8); // Limit to top 8 results
    
    // Cache the results
    searchCache.set(cacheKey, {
      data: results,
      timestamp: Date.now()
    });
    
    res.json({ success: true, data: results });
    
  } catch (error) {
    console.error('Search error:', error.message);
    
    // Try stale cache on error
    if (cached) {
      return res.json({ success: true, data: cached.data, stale: true });
    }
    
    res.status(500).json({ 
      success: false, 
      error: 'Failed to search stocks',
      message: error.message 
    });
  }
}

module.exports = { searchStocks };
