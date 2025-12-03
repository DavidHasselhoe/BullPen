// Minimal Express server for Nordnet dashboard prototype
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session storage for user tokens (in production, use a database)
const userSessions = new Map();

// Serve static client (if present)
const staticDir = path.join(__dirname, 'client', 'static');
if (fs.existsSync(staticDir)) {
  app.use(express.static(staticDir));
}

// API routes
const accountsRouter = require('./server/api/accounts');
const accountInfoRouter = require('./server/api/accountInfo');
const positionsRouter = require('./server/api/positions');
const alphaVantageRouter = require('./server/api/alphavantage');
const finnhubRouter = require('./server/api/finnhub');
const finnhubProfileRouter = require('./server/api/finnhubProfile');
const exchangeRatesRouter = require('./server/api/exchangeRates');
const previousClosesRouter = require('./server/api/previousCloses');
const newsRouter = require('./server/api/news');
const marketStatusRouter = require('./server/api/marketStatus');
const financialsRouter = require('./server/api/financials');
const earningsRouter = require('./server/api/earnings');
const yahooChartRouter = require('./server/api/yahooChart');
const yahooEarningsRouter = require('./server/api/yahooEarnings');
const recommendationsRouter = require('./server/api/recommendations');
const searchRouter = require('./server/api/search');
const aiSummaryRouter = require('./server/api/aiSummary');
const firiRouter = require('./server/api/firi');
const coinpaprikaRouter = require('./server/api/coinpaprika');

app.use('/api/accounts', accountsRouter);
app.use('/api/account-info', accountInfoRouter);
app.use('/api/positions', positionsRouter);
app.use('/api/alphavantage', alphaVantageRouter);
app.use('/api/finnhub', finnhubRouter);
app.use('/api/finnhub-profile', finnhubProfileRouter);
app.use('/api/exchangeRates', exchangeRatesRouter);
app.use('/api/previous-closes', previousClosesRouter);
app.use('/api/market-status', marketStatusRouter);
app.get('/api/news', newsRouter.getNewsSentiment);
app.get('/api/financials', financialsRouter.getBasicFinancials);
app.get('/api/earnings', earningsRouter.getEarningsSurprises);
app.get('/api/earnings-estimates', earningsRouter.getEarningsEstimates);
app.get('/api/earnings-clear-cache', earningsRouter.clearCache);
app.get('/api/yahoo-earnings', yahooEarningsRouter.getEarningsData);
app.get('/api/yahoo-earnings-clear-cache', yahooEarningsRouter.clearCache);
app.get('/api/chart', yahooChartRouter.getChartData);
app.get('/api/recommendations', recommendationsRouter.getRecommendations);
app.get('/api/search', searchRouter.searchStocks);
app.get('/api/ai-summary', aiSummaryRouter.generateCompanySummary);
app.use('/api/coinpaprika', coinpaprikaRouter);
firiRouter(app);

// Firi OAuth Routes
const FIRI_CLIENT_ID = process.env.FIRI_CLIENT_ID;
const FIRI_CLIENT_SECRET = process.env.FIRI_CLIENT_SECRET;
const FIRI_REDIRECT_URI = process.env.FIRI_REDIRECT_URI || 'http://localhost:3000/auth/firi/callback';

// Step 1: Redirect user to Firi login
app.get('/auth/firi', (req, res) => {
  const authUrl = `https://firi.com/oauth/authorize?response_type=code&client_id=${FIRI_CLIENT_ID}&redirect_uri=${encodeURIComponent(FIRI_REDIRECT_URI)}&scope=read`;
  res.redirect(authUrl);
});

// Step 2: Handle OAuth callback and exchange code for token
app.get('/auth/firi/callback', async (req, res) => {
  const { code } = req.query;

  if (!code) {
    return res.status(400).send('Authorization code missing');
  }

  try {
    // Exchange authorization code for access token
    const tokenResponse = await fetch('https://api.firi.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'authorization_code',
        code,
        redirect_uri: FIRI_REDIRECT_URI,
        client_id: FIRI_CLIENT_ID,
        client_secret: FIRI_CLIENT_SECRET,
      }),
    });

    if (!tokenResponse.ok) {
      throw new Error('Failed to exchange code for token');
    }

    const { access_token, refresh_token } = await tokenResponse.json();

    // Store tokens in session (use a session ID for the user)
    const sessionId = Date.now().toString();
    userSessions.set(sessionId, {
      access_token,
      refresh_token,
      timestamp: Date.now()
    });

    // Redirect back to main page with session ID
    res.redirect(`/?firi_session=${sessionId}`);
  } catch (error) {
    console.error('Firi OAuth error:', error);
    res.status(500).send('Authentication failed');
  }
});

// API endpoint to get user's Firi holdings with OAuth token
app.get('/api/firi/user-holdings', async (req, res) => {
  const sessionId = req.query.session_id;
  
  if (!sessionId) {
    return res.status(401).json({ error: 'No session provided' });
  }

  const session = userSessions.get(sessionId);
  
  if (!session) {
    return res.status(401).json({ error: 'Invalid session' });
  }

  try {
    const response = await fetch('https://api.firi.com/v1/holdings', {
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch holdings');
    }

    const holdings = await response.json();
    res.json({ success: true, data: holdings });
  } catch (error) {
    console.error('Error fetching user holdings:', error);
    res.status(500).json({ error: 'Failed to fetch holdings' });
  }
});

app.get('/', (req, res) => {
  const indexPath = path.join(staticDir, 'index.html');
  if (fs.existsSync(indexPath)) return res.sendFile(indexPath);
  res.type('text/plain').send('Nordnet dashboard backend (mock mode). See README for instructions.');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on port http://localhost:${PORT}/`);
});
