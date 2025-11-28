// API calls for Nordnet and external services

// Fetch live exchange rates from Norges Bank
export async function fetchExchangeRates() {
  try {
    const response = await fetch('/api/exchangeRates');
    const result = await response.json();
    if (result.success && result.data) {
      console.log('Exchange rates updated:', result.data);
      return result.data;
    }
  } catch (error) {
    console.error('Failed to fetch exchange rates, using fallback:', error);
  }
  
  // Return fallback rates
  return {
    USD: 10.5,
    SEK: 1.0,
    NOK: 1.0
  };
}

// Fetch previous closes for US stocks from Finnhub
export async function fetchPreviousCloses(symbols) {
  if (symbols.length === 0) return {};
  
  try {
    const symbolsParam = symbols.join(',');
    const response = await fetch(`/api/previous-closes?symbols=${symbolsParam}`);
    const result = await response.json();
    if (result.success && result.data) {
      console.log('Previous closes updated:', result.data);
      return result.data;
    }
  } catch (error) {
    console.error('Failed to fetch previous closes:', error);
  }
  
  return {};
}

// Fetch company profile from Finnhub
export async function fetchCompanyProfile(symbol) {
  try {
    const response = await fetch(`/api/finnhub-profile?symbol=${symbol}`);
    if (response.ok) {
      const profile = await response.json();
      if (profile && Object.keys(profile).length > 0) {
        return profile;
      }
    }
  } catch (error) {
    console.error(`Failed to fetch profile for ${symbol}:`, error);
  }
  return null;
}

// Fetch account list from Nordnet
export async function fetchAccounts(session) {
  const headers = { 'Accept-Language': 'no' };
  if (session) headers['X-NORDNET-SESSION'] = session;
  
  const response = await fetch('/api/accounts', { headers });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  const body = await response.json();
  if (!body.success) throw new Error(body.error || 'unknown error');
  
  // Handle both array and object with accounts array
  const data = body.data;
  if (Array.isArray(data)) {
    return data;
  } else if (data && Array.isArray(data.accounts)) {
    return data.accounts;
  }
  return [];
}

// Fetch account info (totals, buying power, etc.)
export async function fetchAccountInfo(session, accid) {
  const response = await fetch(`/api/account-info?sessionId=${session}&accid=${accid}`);
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  const body = await response.json();
  
  // Account info returns raw data array, not wrapped in success/data
  if (Array.isArray(body) && body.length > 0) {
    return body[0];
  }
  
  // Fallback for wrapped response
  if (body.success && body.data) {
    return body.data;
  }
  
  return body;
}

// Fetch positions for an account
export async function fetchPositions(accid, session) {
  const lang = 'no';
  const url = `/api/positions/${accid}`;
  const headers = { 'Accept-Language': lang };
  if (session) headers['X-NORDNET-SESSION'] = session;
  
  const resp = await fetch(url, { headers });
  if (!resp.ok) throw new Error(`${resp.status} ${resp.statusText}`);
  const body = await resp.json();
  if (!body.success) throw new Error(body.error || 'unknown error');
  return body.data.positions || [];
}
