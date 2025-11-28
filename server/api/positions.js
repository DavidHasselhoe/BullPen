const express = require('express');
const router = express.Router();
const axios = require('axios');

// GET /api/positions/:accid
// Proxies to Nordnet's /accounts/{accid}/positions endpoint
router.get('/:accid', async (req, res) => {
  const accid = req.params.accid;
  if (!accid) return res.status(400).json({ success: false, error: 'Missing accid' });

  const sessionId = req.header('X-NORDNET-SESSION') || process.env.NORDNET_SESSION_ID;
  if (!sessionId) return res.status(401).json({ success: false, error: 'Missing session id' });

  const acceptLanguage = req.header('Accept-Language') || 'en';
  const includeInstrumentLoans = req.query.include_instrument_loans === 'true' ? 'true' : 'false';
  const includeIntradayLimit = req.query.include_intraday_limit === 'true' ? 'true' : 'false';

  const url = `https://public.nordnet.se/api/2/accounts/${encodeURIComponent(accid)}/positions`;
  const basic = Buffer.from(`${sessionId}:${sessionId}`).toString('base64');
  const headers = {
    Authorization: `Basic ${basic}`,
    'Accept-Language': acceptLanguage
  };

  try {
    const resp = await axios.get(url, {
      headers,
      params: {
        include_instrument_loans: includeInstrumentLoans,
        include_intraday_limit: includeIntradayLimit
      }
    });
    // Pass through the array of positions
    res.json({ success: true, data: { positions: resp.data } });
  } catch (err) {
    const status = err.response ? err.response.status : 500;
    const message = err.response && err.response.data ? err.response.data : err.message;
    res.status(status).json({ success: false, error: message });
  }
});

module.exports = router;