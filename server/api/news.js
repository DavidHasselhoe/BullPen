// Alpha Vantage News Sentiment API with caching
const axios = require('axios');

const ALPHA_VANTAGE_KEY = process.env.ALPHA_VANTAGE_API_KEY;

// In-memory cache for news data
const newsCache = new Map();
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour in milliseconds

async function getNewsSentiment(req, res) {
  const { ticker, limit = 10, topics, sort = 'LATEST' } = req.query;
  
  if (!ticker) {
    return res.json({ success: false, error: 'ticker parameter is required' });
  }
  
  if (!ALPHA_VANTAGE_KEY) {
    return res.json({ success: false, error: 'Alpha Vantage API key not configured' });
  }
  
  // Check cache first
  const cacheKey = `${ticker}_${limit}_${topics || ''}_${sort}`;
  const cached = newsCache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    console.log(`Returning cached news for ${ticker} (age: ${Math.floor((Date.now() - cached.timestamp) / 1000 / 60)}min)`);
    return res.json(cached.data);
  }
  
  try {
    let url = `https://www.alphavantage.co/query?function=NEWS_SENTIMENT&tickers=${ticker}&limit=${limit}&sort=${sort}&apikey=${ALPHA_VANTAGE_KEY}`;
    
    if (topics) {
      url += `&topics=${topics}`;
    }
    
    console.log('Fetching news from Alpha Vantage for:', ticker);
    const response = await axios.get(url);
    
    // Alpha Vantage returns 200 even for errors, check for error messages
    if (response.data.Note || response.data['Error Message'] || response.data.Information) {
      const errorMsg = response.data.Note || response.data['Error Message'] || response.data.Information;
      console.error('Alpha Vantage error:', errorMsg);
      
      // If we have cached data (even if expired), return it instead of error
      if (cached) {
        console.log(`Rate limit hit, returning stale cache for ${ticker}`);
        return res.json(cached.data);
      }
      
      return res.json({ 
        success: false, 
        error: errorMsg
      });
    }
    
    // Extract and format the feed
    const feed = response.data.feed || [];
    
    // Format and filter the news items for easier frontend consumption
    // Only include articles with high relevance to the ticker (>= 0.3)
    const formattedNews = feed
      .map(item => {
        const tickerSentiment = item.ticker_sentiment?.find(t => t.ticker === ticker);
        const relevanceScore = tickerSentiment ? parseFloat(tickerSentiment.relevance_score) : 0;
        
        return {
          title: item.title,
          url: item.url,
          timePublished: item.time_published,
          authors: item.authors,
          summary: item.summary,
          source: item.source,
          sourceUrl: item.source_domain,
          bannerImage: item.banner_image,
          sentiment: item.overall_sentiment_score,
          sentimentLabel: item.overall_sentiment_label,
          topics: item.topics?.map(t => t.topic) || [],
          tickerSentiment: tickerSentiment,
          relevanceScore: relevanceScore
        };
      })
      .filter(item => item.relevanceScore >= 0.1) // Filter for relevance >= 0.1
      .sort((a, b) => b.relevanceScore - a.relevanceScore); // Sort by relevance
    
    const responseData = { 
      success: true, 
      data: {
        items: response.data.items || '0',
        sentiment_score_definition: response.data.sentiment_score_definition,
        relevance_score_definition: response.data.relevance_score_definition,
        feed: formattedNews
      }
    };
    
    // Cache the response
    newsCache.set(cacheKey, {
      timestamp: Date.now(),
      data: responseData
    });
    
    console.log(`Cached news for ${ticker} (${formattedNews.length} items)`);
    
    res.json(responseData);
    
  } catch (error) {
    console.error('Alpha Vantage News API error:', error.message);
    res.json({ 
      success: false, 
      error: error.response?.data?.Note || error.message 
    });
  }
}

module.exports = { getNewsSentiment };
