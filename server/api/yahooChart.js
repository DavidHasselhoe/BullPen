// Yahoo Finance Chart API
const axios = require('axios');

// In-memory cache for chart data
const chartCache = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes - charts need frequent updates

async function getChartData(req, res) {
  const { symbol, range = '1d', interval = '5m' } = req.query;
  
  if (!symbol) {
    return res.json({ success: false, error: 'symbol parameter is required' });
  }
  
  // Check cache first
  const cacheKey = `${symbol}_${range}_${interval}`;
  const cached = chartCache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return res.json(cached.data);
  }
  
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`;
    
    console.log(`Fetching chart data for ${symbol}, range: ${range}, interval: ${interval}`);
    
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'application/json'
      },
      timeout: 10000
    });
    
    const data = response.data;
    
    console.log('Yahoo Finance response received');
    
    // Check for errors
    if (!data || !data.chart) {
      console.error('Invalid response structure from Yahoo Finance');
      if (cached) {
        return res.json(cached.data);
      }
      return res.json({ 
        success: false, 
        error: 'Invalid response from Yahoo Finance'
      });
    }
    
    if (data.chart.error) {
      console.error('Yahoo Finance API error:', data.chart.error);
      if (cached) {
        return res.json(cached.data);
      }
      return res.json({ 
        success: false, 
        error: data.chart.error.description || 'Failed to fetch chart data'
      });
    }
    
    const result = data.chart.result && data.chart.result[0];
    
    if (!result || !result.timestamp || !result.indicators || !result.indicators.quote[0]) {
      console.error('Incomplete chart data from Yahoo Finance');
      if (cached) {
        return res.json(cached.data);
      }
      return res.json({ 
        success: false, 
        error: 'Invalid chart data received'
      });
    }
    
    const quote = result.indicators.quote[0];
    const timestamps = result.timestamp;
    const closes = quote.close;
    const opens = quote.open;
    const highs = quote.high;
    const lows = quote.low;
    const volumes = quote.volume;
    
    // Format the data for the frontend
    const formattedData = timestamps.map((timestamp, index) => ({
      timestamp: timestamp * 1000, // Convert to milliseconds
      date: new Date(timestamp * 1000).toISOString(),
      open: opens[index],
      high: highs[index],
      low: lows[index],
      close: closes[index],
      volume: volumes[index]
    })).filter(d => d.close !== null); // Filter out null values
    
    const responseData = {
      success: true,
      data: {
        symbol: result.meta.symbol,
        currency: result.meta.currency,
        exchangeName: result.meta.exchangeName,
        regularMarketPrice: result.meta.regularMarketPrice,
        previousClose: result.meta.previousClose,
        chartPreviousClose: result.meta.chartPreviousClose,
        range: range,
        interval: interval,
        prices: formattedData
      }
    };
    
    // Cache the response
    chartCache.set(cacheKey, {
      timestamp: Date.now(),
      data: responseData
    });
    
    res.json(responseData);
    
  } catch (error) {
    console.error('Yahoo Finance Chart API error:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', JSON.stringify(error.response.data).substring(0, 300));
    }
    
    // Return cached data if available
    if (cached) {
      console.log('Returning stale cached chart data');
      return res.json(cached.data);
    }
    
    res.json({ 
      success: false, 
      error: error.message || 'Failed to fetch chart data'
    });
  }
}

module.exports = { getChartData };
