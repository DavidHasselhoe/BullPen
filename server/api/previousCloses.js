const express = require('express');
const router = express.Router();
const axios = require('axios');

// Cache previous closes for 1 hour (they don't change during the day)
const cache = new Map();
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour

router.get('/', async (req, res) => {
  const symbols = req.query.symbols;
  
  if (!symbols) {
    return res.status(400).json({ success: false, error: 'Missing symbols parameter' });
  }

  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ success: false, error: 'Finnhub API key not configured' });
  }

  const symbolList = symbols.split(',');
  const results = {};
  const now = Date.now();

  try {
    // Fetch quotes for each symbol
    for (const symbol of symbolList) {
      // Check cache first
      const cached = cache.get(symbol);
      if (cached && (now - cached.time) < CACHE_DURATION) {
        results[symbol] = cached.value;
        continue;
      }

      try {
        const response = await axios.get('https://finnhub.io/api/v1/quote', {
          params: {
            symbol: symbol,
            token: apiKey
          }
        });

        if (response.data && response.data.pc !== undefined) {
          const previousClose = response.data.pc;
          results[symbol] = previousClose;
          cache.set(symbol, { value: previousClose, time: now });
        }
      } catch (error) {
        // Skip symbols that fail
        console.error(`Failed to fetch previous close for ${symbol}:`, error.message);
      }
    }

    res.json({ success: true, data: results });
  } catch (error) {
    console.error('Error fetching previous closes:', error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
