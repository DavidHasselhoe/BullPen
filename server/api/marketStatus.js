// Get market status for US and Norwegian markets
const express = require('express');
const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const now = new Date();
    
    // Norwegian market - 09:00-16:00 CET (Mon-Fri)
    const norwayTime = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Oslo' }));
    const norwayHour = norwayTime.getHours();
    const norwayDay = norwayTime.getDay();
    const isNorwayOpen = norwayDay >= 1 && norwayDay <= 5 && norwayHour >= 9 && norwayHour < 16;

    // US market - 15:30-22:00 CET (09:30-16:00 EST, Mon-Fri)
    const usHour = norwayTime.getHours();
    const usMinute = norwayTime.getMinutes();
    const usDay = norwayTime.getDay();
    const usTimeInMinutes = usHour * 60 + usMinute;
    const isUSOpen = usDay >= 1 && usDay <= 5 && usTimeInMinutes >= 930 && usTimeInMinutes < 1320; // 15:30 = 930min, 22:00 = 1320min

    res.json({
      '🇺🇸': {
        isOpen: isUSOpen,
        session: isUSOpen ? 'open' : 'closed',
        hours: '15:30-22:00 CET'
      },
      '🇳🇴': {
        isOpen: isNorwayOpen,
        session: isNorwayOpen ? 'open' : 'closed',
        hours: '09:00-16:00 CET'
      }
    });

  } catch (error) {
    console.error('Error in market status endpoint:', error);
    res.status(500).json({ error: 'Failed to fetch market status' });
  }
});

module.exports = router;
