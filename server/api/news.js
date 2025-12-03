// Finnhub Company News API with caching
const axios = require('axios');

const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;

// In-memory cache for news data
const newsCache = new Map();
const CACHE_DURATION = 6 * 60 * 60 * 1000; // 6 hours

async function getNewsSentiment(req, res) {
  const { ticker, limit = 10 } = req.query;
  
  if (!ticker) {
    return res.json({ success: false, error: 'ticker parameter is required' });
  }
  
  if (!FINNHUB_API_KEY) {
    return res.json({ success: false, error: 'Finnhub API key not configured' });
  }
  
  // Check cache first
  const cacheKey = `${ticker}_${limit}`;
  const cached = newsCache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return res.json(cached.data);
  }
  
  try {
    // Get news from last 30 days
    const toDate = new Date();
    const fromDate = new Date();
    fromDate.setDate(fromDate.getDate() - 30);
    
    const from = fromDate.toISOString().split('T')[0]; // YYYY-MM-DD
    const to = toDate.toISOString().split('T')[0];
    
    const response = await axios.get(`https://finnhub.io/api/v1/company-news`, {
      params: {
        symbol: ticker,
        from: from,
        to: to,
        token: FINNHUB_API_KEY
      },
      timeout: 10000
    });
    
    const newsItems = response.data || [];
    
    if (!Array.isArray(newsItems) || newsItems.length === 0) {
      // If we have cached data (even if expired), return it instead of error
      if (cached) {
        return res.json(cached.data);
      }
      
      return res.json({ 
        success: true, 
        data: { feed: [] }
      });
    }
    
    // Format news items for frontend
    const formattedNews = newsItems
      .filter(item => item.headline && item.url) // Only include items with headline and URL
      .map(item => ({
        title: item.headline,
        url: item.url,
        timePublished: new Date(item.datetime * 1000).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z', // Convert UNIX to YYYYMMDDTHHMMSSZ format
        source: item.source,
        summary: item.summary || '',
        bannerImage: item.image || null,
        category: item.category || 'company news',
        related: item.related || ticker,
        id: item.id
      }))
      .sort((a, b) => b.timePublished.localeCompare(a.timePublished)) // Sort by most recent
      .slice(0, parseInt(limit)); // Limit results
    
    const responseData = { 
      success: true, 
      data: {
        feed: formattedNews
      }
    };
    
    // Cache the response
    newsCache.set(cacheKey, {
      timestamp: Date.now(),
      data: responseData
    });
    
    res.json(responseData);
    
  } catch (error) {
    console.error('Finnhub News API error:', error.message);
    
    // Try stale cache on error
    if (cached) {
      return res.json(cached.data);
    }
    
    res.json({ 
      success: false, 
      error: error.response?.data?.error || error.message 
    });
  }
}

module.exports = { getNewsSentiment };
