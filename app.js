// Minimal Express server for Nordnet dashboard prototype
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(cors());
app.use(express.json());

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

app.get('/', (req, res) => {
  const indexPath = path.join(staticDir, 'index.html');
  if (fs.existsSync(indexPath)) return res.sendFile(indexPath);
  res.type('text/plain').send('Nordnet dashboard backend (mock mode). See README for instructions.');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server listening on port http://localhost:${PORT}/`);
  console.log('\n📊 API Cache Configuration (Alpha Vantage 25 calls/day limit):');
  console.log('  ✓ Earnings: 24 hours (updates quarterly anyway)');
  console.log('  ✓ Earnings Estimates: 24 hours');
  console.log('  ✓ News: 6 hours (reduced API calls by 4x)');
  console.log('  ✓ Financials: 24 hours');
  console.log('  ✓ Company Profiles: 24 hours');
  console.log('  ✓ Exchange Rates: 5 minutes\n');
  console.log('💡 Clear cache: GET /api/earnings-clear-cache?symbol=TICKER\n');
});
