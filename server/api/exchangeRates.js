const express = require('express');
const router = express.Router();
const axios = require('axios');

// Cache exchange rates for 5 minutes
let cachedRates = null;
let cacheTime = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

router.get('/', async (req, res) => {
  try {
    const now = Date.now();
    
    // Return cached rates if still valid
    if (cachedRates && (now - cacheTime) < CACHE_DURATION) {
      return res.json({ success: true, data: cachedRates, cached: true });
    }
    
    // Fetch current exchange rates from Norges Bank (official Norwegian rates)
    // Using their API to get USD and SEK rates to NOK
    const response = await axios.get('https://data.norges-bank.no/api/data/EXR/B.USD+SEK.NOK.SP?lastNObservations=1&format=sdmx-json');
    
    const rates = {
      USD: 1.0,
      SEK: 1.0,
      NOK: 1.0
    };
    
    // Parse the response
    if (response.data && response.data.data && response.data.data.dataSets && response.data.data.dataSets[0]) {
      const observations = response.data.data.dataSets[0].series;
      
      // Extract USD rate
      if (observations['0:0:0:0'] && observations['0:0:0:0'].observations) {
        const usdObs = Object.values(observations['0:0:0:0'].observations)[0];
        if (usdObs && usdObs[0]) {
          rates.USD = parseFloat(usdObs[0]);
        }
      }
      
      // Extract SEK rate
      if (observations['0:1:0:0'] && observations['0:1:0:0'].observations) {
        const sekObs = Object.values(observations['0:1:0:0'].observations)[0];
        if (sekObs && sekObs[0]) {
          rates.SEK = parseFloat(sekObs[0]);
        }
      }
    }
    
    // Cache the rates
    cachedRates = rates;
    cacheTime = now;
    
    res.json({ success: true, data: rates, cached: false });
  } catch (error) {
    console.error('Error fetching exchange rates:', error.message);
    
    // Fallback to approximate rates if API fails
    const fallbackRates = {
      USD: 10.5,
      SEK: 1.0,
      NOK: 1.0
    };
    
    res.json({ success: true, data: fallbackRates, fallback: true });
  }
});

module.exports = router;
