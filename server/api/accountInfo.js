const axios = require('axios');

module.exports = async (req, res) => {
  const { sessionId, accid } = req.query;
  
  if (!sessionId || !accid) {
    return res.status(400).json({ error: 'Missing sessionId or accid' });
  }

  try {
    const auth = Buffer.from(`${sessionId}:${sessionId}`).toString('base64');
    const response = await axios.get(
      `https://public.nordnet.se/api/2/accounts/${accid}/info`,
      {
        headers: {
          'Authorization': `Basic ${auth}`,
          'Accept-Language': 'no'
        },
        params: {
          include_interest_rate: false,
          include_short_pos_margin: false
        }
      }
    );
    
    console.log('Account info response:', JSON.stringify(response.data, null, 2));
    res.json(response.data);
  } catch (error) {
    console.error('Error fetching account info:', error.response?.data || error.message);
    res.status(error.response?.status || 500).json({ 
      error: 'Failed to fetch account info',
      details: error.response?.data || error.message 
    });
  }
};
