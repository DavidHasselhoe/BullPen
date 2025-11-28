const express = require('express');
const router = express.Router();
const axios = require('axios');

// GET /api/finnhub/quote/:symbol
// Fetches quote data for a single stock symbol (REST API fallback)
router.get('/quote/:symbol', async (req, res) => {
  const symbol = req.params.symbol;
  if (!symbol) {
    return res.status(400).json({ success: false, error: 'Missing symbol' });
  }

  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ success: false, error: 'Finnhub API key not configured' });
  }

  const url = `https://finnhub.io/api/v1/quote`;
  
  try {
    const response = await axios.get(url, {
      params: {
        symbol: symbol,
        token: apiKey
      }
    });

    // Finnhub returns: {c: current, h: high, l: low, o: open, pc: previous close, t: timestamp}
    if (response.data && response.data.c) {
      res.json({ 
        success: true, 
        data: response.data
      });
    } else {
      res.status(404).json({ 
        success: false, 
        error: 'No data found for symbol' 
      });
    }
  } catch (err) {
    const status = err.response ? err.response.status : 500;
    const message = err.response && err.response.data ? err.response.data : err.message;
    res.status(status).json({ success: false, error: message });
  }
});

// GET /api/finnhub/config
router.get('/config', (req, res) => {
  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ success: false, error: 'Finnhub API key not configured' });
  }
  
  res.json({ 
    success: true, 
    apiKey: apiKey 
  });
});

module.exports = router;
