const express = require('express');
const router = express.Router();
const nordnet = require('../nordnetClient');

// GET /api/accounts
// Query: include_credit_accounts=true|false
router.get('/', async (req, res) => {
  try {
    const includeCredit = req.query.include_credit_accounts === 'true' || req.query.include_credit_accounts === '1';

    // Allow client to pass session id for testing or use server env var NORDNET_SESSION_ID
    const sessionId = req.header('X-NORDNET-SESSION') || null;
    const acceptLanguage = req.header('Accept-Language');

    const result = await nordnet.getAccounts(sessionId, includeCredit, acceptLanguage);

    // Normalize response: Nordnet sometimes returns items formatted like
    // "@{accno=21773585; accid=1; type=...;}"
    // Convert those strings into proper JS objects for the client.
    let accounts = result && result.accounts ? result.accounts : [];

    function parseAccountString(s) {
      if (!s || typeof s !== 'string') return s;
      let str = s.trim();
      if (str.startsWith('@{') && str.endsWith('}')) {
        str = str.slice(2, -1);
      }
      const parts = str.split(';').map(p => p.trim()).filter(Boolean);
      const obj = {};
      for (const part of parts) {
        const idx = part.indexOf('=');
        if (idx === -1) continue;
        const key = part.slice(0, idx).trim();
        let val = part.slice(idx + 1).trim();
        // convert some common types
        if (val === 'True' || val === 'true') val = true;
        else if (val === 'False' || val === 'false') val = false;
        else if (val !== '' && !isNaN(val)) val = Number(val);
        obj[key] = val;
      }
      return obj;
    }

    if (Array.isArray(accounts)) {
      accounts = accounts.map(a => parseAccountString(a));
    }

    res.json({ success: true, data: { accounts } });
  } catch (err) {
    // If client error from Nordnet, forward code
    if (err && err.status) {
      return res.status(err.status).json({ success: false, error: err.message || 'Nordnet error' });
    }
    console.error('Error fetching accounts', err);
    res.status(500).json({ success: false, error: 'Internal server error' });
  }
});

module.exports = router;
