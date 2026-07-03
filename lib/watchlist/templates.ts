/**
 * Starter watchlist templates — curated, themed baskets a user can add with one
 * click. They create a normal, fully-editable list (rename / add / remove as they
 * like); these are only suggestions, not managed or locked lists.
 *
 * Keep symbols to liquid, US-listed tickers so quotes/logos resolve cleanly.
 */

export interface WatchlistTemplateSymbol {
  symbol: string;
  name: string;
}

export interface WatchlistTemplate {
  id: string;
  name: string;
  description: string;
  /** Hex colour used for the created list (matches the list colour palette). */
  color: string;
  symbols: WatchlistTemplateSymbol[];
}

export const WATCHLIST_TEMPLATES: WatchlistTemplate[] = [
  {
    id: 'faang',
    name: 'FAANG',
    description: 'The original big-tech basket: Facebook (Meta), Apple, Amazon, Netflix, Google.',
    color: '#6366F1',
    symbols: [
      { symbol: 'META', name: 'Meta Platforms' },
      { symbol: 'AAPL', name: 'Apple' },
      { symbol: 'AMZN', name: 'Amazon.com' },
      { symbol: 'NFLX', name: 'Netflix' },
      { symbol: 'GOOGL', name: 'Alphabet (Google)' },
    ],
  },
  {
    id: 'mag7',
    name: 'Magnificent Seven',
    description: 'The seven megacaps driving the market — the modern successor to FAANG/MANGO.',
    color: '#8B5CF6',
    symbols: [
      { symbol: 'AAPL', name: 'Apple' },
      { symbol: 'MSFT', name: 'Microsoft' },
      { symbol: 'GOOGL', name: 'Alphabet (Google)' },
      { symbol: 'AMZN', name: 'Amazon.com' },
      { symbol: 'NVDA', name: 'NVIDIA' },
      { symbol: 'META', name: 'Meta Platforms' },
      { symbol: 'TSLA', name: 'Tesla' },
    ],
  },
  {
    id: 'semiconductors',
    name: 'Semiconductors',
    description: 'Chipmakers and the equipment behind them — the backbone of the AI build-out.',
    color: '#3B82F6',
    symbols: [
      { symbol: 'NVDA', name: 'NVIDIA' },
      { symbol: 'AMD', name: 'Advanced Micro Devices' },
      { symbol: 'TSM', name: 'Taiwan Semiconductor' },
      { symbol: 'AVGO', name: 'Broadcom' },
      { symbol: 'INTC', name: 'Intel' },
      { symbol: 'QCOM', name: 'Qualcomm' },
      { symbol: 'MU', name: 'Micron Technology' },
      { symbol: 'ASML', name: 'ASML Holding' },
      { symbol: 'TXN', name: 'Texas Instruments' },
      { symbol: 'ARM', name: 'Arm Holdings' },
      { symbol: 'MRVL', name: 'Marvell Technology' },
    ],
  },
  {
    id: 'memory-storage',
    name: 'Memory & Storage',
    description: 'DRAM, NAND, and storage makers — a cyclical play on the data explosion.',
    color: '#F59E0B',
    symbols: [
      { symbol: 'MU', name: 'Micron Technology' },
      { symbol: 'WDC', name: 'Western Digital' },
      { symbol: 'STX', name: 'Seagate Technology' },
      { symbol: 'NTAP', name: 'NetApp' },
      { symbol: 'SIMO', name: 'Silicon Motion' },
      { symbol: 'PSTG', name: 'Pure Storage' },
    ],
  },
  {
    id: 'power-nuclear',
    name: 'Power & Nuclear',
    description: 'Utilities, independent power, and nuclear names riding surging AI electricity demand.',
    color: '#10B981',
    symbols: [
      { symbol: 'VST', name: 'Vistra' },
      { symbol: 'CEG', name: 'Constellation Energy' },
      { symbol: 'NRG', name: 'NRG Energy' },
      { symbol: 'GEV', name: 'GE Vernova' },
      { symbol: 'TLN', name: 'Talen Energy' },
      { symbol: 'SMR', name: 'NuScale Power' },
      { symbol: 'OKLO', name: 'Oklo' },
      { symbol: 'NEE', name: 'NextEra Energy' },
      { symbol: 'SO', name: 'Southern Company' },
      { symbol: 'D', name: 'Dominion Energy' },
    ],
  },
  {
    id: 'ai-datacenter',
    name: 'AI & Data Centers',
    description: 'Compute, networking, cooling, and the picks-and-shovels of artificial intelligence.',
    color: '#06B6D4',
    symbols: [
      { symbol: 'NVDA', name: 'NVIDIA' },
      { symbol: 'AVGO', name: 'Broadcom' },
      { symbol: 'SMCI', name: 'Super Micro Computer' },
      { symbol: 'VRT', name: 'Vertiv Holdings' },
      { symbol: 'ANET', name: 'Arista Networks' },
      { symbol: 'DELL', name: 'Dell Technologies' },
      { symbol: 'MRVL', name: 'Marvell Technology' },
      { symbol: 'PLTR', name: 'Palantir Technologies' },
      { symbol: 'MU', name: 'Micron Technology' },
    ],
  },
  {
    id: 'cloud-software',
    name: 'Cloud & Software',
    description: 'Enterprise software and cloud platforms — recurring-revenue compounders.',
    color: '#0EA5E9',
    symbols: [
      { symbol: 'MSFT', name: 'Microsoft' },
      { symbol: 'CRM', name: 'Salesforce' },
      { symbol: 'NOW', name: 'ServiceNow' },
      { symbol: 'ORCL', name: 'Oracle' },
      { symbol: 'ADBE', name: 'Adobe' },
      { symbol: 'SNOW', name: 'Snowflake' },
      { symbol: 'DDOG', name: 'Datadog' },
      { symbol: 'CRWD', name: 'CrowdStrike' },
      { symbol: 'PLTR', name: 'Palantir Technologies' },
    ],
  },
  {
    id: 'cybersecurity',
    name: 'Cybersecurity',
    description: 'Endpoint, network, and cloud security leaders in a structurally growing market.',
    color: '#EF4444',
    symbols: [
      { symbol: 'CRWD', name: 'CrowdStrike' },
      { symbol: 'PANW', name: 'Palo Alto Networks' },
      { symbol: 'ZS', name: 'Zscaler' },
      { symbol: 'FTNT', name: 'Fortinet' },
      { symbol: 'S', name: 'SentinelOne' },
      { symbol: 'NET', name: 'Cloudflare' },
      { symbol: 'OKTA', name: 'Okta' },
    ],
  },
  {
    id: 'ev-batteries',
    name: 'EV & Batteries',
    description: 'Electric-vehicle makers, legacy autos going electric, and battery materials.',
    color: '#22C55E',
    symbols: [
      { symbol: 'TSLA', name: 'Tesla' },
      { symbol: 'RIVN', name: 'Rivian Automotive' },
      { symbol: 'LCID', name: 'Lucid Group' },
      { symbol: 'NIO', name: 'NIO' },
      { symbol: 'F', name: 'Ford Motor' },
      { symbol: 'GM', name: 'General Motors' },
      { symbol: 'ALB', name: 'Albemarle' },
      { symbol: 'QS', name: 'QuantumScape' },
    ],
  },
  {
    id: 'big-banks',
    name: 'Big Banks',
    description: 'The largest US money-center and investment banks — a play on rates and the economy.',
    color: '#64748B',
    symbols: [
      { symbol: 'JPM', name: 'JPMorgan Chase' },
      { symbol: 'BAC', name: 'Bank of America' },
      { symbol: 'WFC', name: 'Wells Fargo' },
      { symbol: 'C', name: 'Citigroup' },
      { symbol: 'GS', name: 'Goldman Sachs' },
      { symbol: 'MS', name: 'Morgan Stanley' },
      { symbol: 'USB', name: 'U.S. Bancorp' },
    ],
  },
  {
    id: 'dividend-aristocrats',
    name: 'Dividend Stalwarts',
    description: 'Blue chips with long histories of steady, growing dividends.',
    color: '#EAB308',
    symbols: [
      { symbol: 'KO', name: 'Coca-Cola' },
      { symbol: 'PG', name: 'Procter & Gamble' },
      { symbol: 'JNJ', name: 'Johnson & Johnson' },
      { symbol: 'PEP', name: 'PepsiCo' },
      { symbol: 'MCD', name: "McDonald's" },
      { symbol: 'CVX', name: 'Chevron' },
      { symbol: 'XOM', name: 'Exxon Mobil' },
      { symbol: 'ABBV', name: 'AbbVie' },
      { symbol: 'O', name: 'Realty Income' },
      { symbol: 'MMM', name: '3M' },
    ],
  },
];
