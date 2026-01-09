-- Sample Companies Seed Data
-- Purpose: Populate database with well-known tech companies for testing

INSERT INTO companies (ticker, name, cik, sector, industry, description, metadata) VALUES
  (
    'AAPL',
    'Apple Inc.',
    '0000320193',
    'Technology',
    'Consumer Electronics',
    'Designs, manufactures, and markets smartphones, personal computers, tablets, wearables, and accessories.',
    '{"market_cap": "3000000000000", "founded": "1976", "headquarters": "Cupertino, CA"}'::jsonb
  ),
  (
    'MSFT',
    'Microsoft Corporation',
    '0000789019',
    'Technology',
    'Software - Infrastructure',
    'Develops, licenses, and supports software, services, devices, and solutions worldwide.',
    '{"market_cap": "2800000000000", "founded": "1975", "headquarters": "Redmond, WA"}'::jsonb
  ),
  (
    'GOOGL',
    'Alphabet Inc.',
    '0001652044',
    'Communication Services',
    'Internet Content & Information',
    'Provides online advertising services, search, cloud computing, and software.',
    '{"market_cap": "1700000000000", "founded": "1998", "headquarters": "Mountain View, CA"}'::jsonb
  ),
  (
    'AMZN',
    'Amazon.com, Inc.',
    '0001018724',
    'Consumer Cyclical',
    'Internet Retail',
    'Engages in the retail sale of consumer products and subscriptions through online stores.',
    '{"market_cap": "1600000000000", "founded": "1994", "headquarters": "Seattle, WA"}'::jsonb
  ),
  (
    'NVDA',
    'NVIDIA Corporation',
    '0001045810',
    'Technology',
    'Semiconductors',
    'Provides graphics, computing, and networking solutions for gaming, professional visualization, data centers, and automotive markets.',
    '{"market_cap": "1200000000000", "founded": "1993", "headquarters": "Santa Clara, CA"}'::jsonb
  ),
  (
    'META',
    'Meta Platforms, Inc.',
    '0001326801',
    'Communication Services',
    'Internet Content & Information',
    'Engages in the development of social media and metaverse technologies.',
    '{"market_cap": "900000000000", "founded": "2004", "headquarters": "Menlo Park, CA"}'::jsonb
  ),
  (
    'TSLA',
    'Tesla, Inc.',
    '0001318605',
    'Consumer Cyclical',
    'Auto Manufacturers',
    'Designs, develops, manufactures, and sells electric vehicles and energy storage systems.',
    '{"market_cap": "800000000000", "founded": "2003", "headquarters": "Austin, TX"}'::jsonb
  ),
  (
    'JPM',
    'JPMorgan Chase & Co.',
    '0000019617',
    'Financial Services',
    'Banks - Diversified',
    'Provides financial services including investment banking, financial services for consumers, and asset & wealth management.',
    '{"market_cap": "500000000000", "founded": "1799", "headquarters": "New York, NY"}'::jsonb
  ),
  (
    'V',
    'Visa Inc.',
    '0001403161',
    'Financial Services',
    'Credit Services',
    'Operates a retail electronic payments network worldwide facilitating digital payments.',
    '{"market_cap": "500000000000", "founded": "1958", "headquarters": "San Francisco, CA"}'::jsonb
  ),
  (
    'WMT',
    'Walmart Inc.',
    '0000104169',
    'Consumer Defensive',
    'Discount Stores',
    'Engages in retail and wholesale business worldwide through physical stores and e-commerce.',
    '{"market_cap": "450000000000", "founded": "1962", "headquarters": "Bentonville, AR"}'::jsonb
  )
ON CONFLICT (ticker) DO NOTHING;
