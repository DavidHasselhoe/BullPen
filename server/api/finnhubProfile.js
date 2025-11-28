const axios = require('axios');

// Cache profiles for 24 hours to avoid hitting rate limits
const profileCache = new Map();
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

module.exports = async (req, res) => {
  const { symbol } = req.query;
  const apiKey = process.env.FINNHUB_API_KEY;

  if (!symbol) {
    return res.status(400).json({ error: 'Missing symbol' });
  }

  if (!apiKey) {
    return res.status(500).json({ error: 'FINNHUB_API_KEY not configured' });
  }

  // Check cache first
  const cached = profileCache.get(symbol);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return res.json(cached.data);
  }

  try {
    const response = await axios.get('https://finnhub.io/api/v1/stock/profile2', {
      params: {
        symbol: symbol,
        token: apiKey
      }
    });

    const profileData = response.data;
    
    // If Finnhub doesn't have a logo, try Clearbit as fallback
    if (profileData && !profileData.logo && profileData.weburl) {
      try {
        // Extract domain from weburl
        const domain = new URL(profileData.weburl).hostname.replace('www.', '');
        const clearbitLogo = `https://logo.clearbit.com/${domain}`;
        
        // Test if Clearbit has the logo (it returns 404 if not)
        const logoTest = await axios.head(clearbitLogo, { timeout: 2000 });
        if (logoTest.status === 200) {
          profileData.logo = clearbitLogo;
        }
      } catch (clearbitError) {
        // Clearbit doesn't have it, that's okay
      }
    }

    // Cache the result
    profileCache.set(symbol, {
      data: profileData,
      timestamp: Date.now()
    });

    res.json(profileData);
  } catch (error) {
    // If we have cached data (even if expired), return it on error
    if (cached) {
      return res.json(cached.data);
    }
    
    res.status(error.response?.status || 500).json({
      error: 'Failed to fetch company profile'
    });
  }
};
