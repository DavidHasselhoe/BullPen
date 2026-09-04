/**
 * Financial terms glossary.
 *
 * Every entry maps a technical label (as shown in Pro mode) to:
 *   - plainLabel: plain-English label shown in Simple mode
 *   - description: one or two sentence tooltip explanation for all users
 *
 * Add any new financial term here before using it in a component.
 */

export interface GlossaryEntry {
  plainLabel: string;
  description: string;
}

export const GLOSSARY: Record<string, GlossaryEntry> = {
  // ── Statistics / Valuation ──────────────────────────────────────────────────

  'Market Cap': {
    plainLabel: 'Company Size',
    description: 'Total value of all shares combined. Larger = bigger company. "Large-cap" usually means over $10 billion.',
  },
  'Enterprise Value': {
    plainLabel: 'Total Company Price Tag',
    description: 'What it would cost to buy the entire company including its debt. A more complete view of company value than Market Cap alone.',
  },
  'Beta': {
    plainLabel: 'Volatility vs Market',
    description: 'How much this stock moves compared to the overall market. Beta > 1 means it swings more than the market; < 1 means it\'s calmer.',
  },
  'Avg Volume': {
    plainLabel: 'Daily Trading Activity',
    description: 'Average number of shares traded per day. Higher volume means it\'s easier to buy and sell without affecting the price.',
  },
  'Avg Vol': {
    plainLabel: 'Daily Trading Activity',
    description: 'Average number of shares traded per day. Higher volume means it\'s easier to buy and sell without affecting the price.',
  },
  'Volume': {
    plainLabel: 'Today\'s Trading Activity',
    description: 'Number of shares traded so far today. Unusually high volume compared to the average often means something is moving the stock.',
  },
  'Shares Float': {
    plainLabel: 'Shares Available to Trade',
    description: 'The number of shares that can actually be bought and sold by the public. Low float = price can move more dramatically.',
  },
  'P/E (TTM)': {
    plainLabel: 'Price vs Earnings',
    description: 'How much investors pay per $1 of profit the company earned in the past 12 months. Lower often signals better value, but context matters.',
  },
  'Forward P/E': {
    plainLabel: 'Price vs Expected Earnings',
    description: 'Like P/E but uses analyst estimates for future earnings. Useful for fast-growing companies where future profits matter more than past ones.',
  },
  'Fwd P/E': {
    plainLabel: 'Price vs Expected Earnings',
    description: 'Like P/E but uses analyst estimates for future earnings. Useful for fast-growing companies where future profits matter more than past ones.',
  },
  'TTM': {
    plainLabel: 'Trailing Twelve Months',
    description: 'The last four reported quarters added together, the standard way analysts say "as of right now" instead of using a calendar year.',
  },
  'NTM': {
    plainLabel: 'Next Twelve Months',
    description: 'Analysts\' forward-looking estimate for the coming four quarters, used when a company\'s future looks meaningfully different from its past.',
  },
  'P/S': {
    plainLabel: 'Price vs Sales',
    description: 'How much investors pay per $1 of revenue the company brings in. Useful when a company isn\'t profitable yet, since P/E doesn\'t work without earnings.',
  },
  'P/B': {
    plainLabel: 'Price vs Book Value',
    description: 'Compares stock price to what the company\'s assets are worth on paper. Below 1 can indicate the stock is undervalued, or that something is wrong.',
  },
  'EV/EBITDA': {
    plainLabel: 'Company Value vs Operating Profit',
    description: 'Compares the total company price tag to its operating profit before taxes and non-cash costs. Used to compare companies across industries.',
  },
  'EV/EB': {
    plainLabel: 'Company Value vs Operating Profit',
    description: 'Compares the total company price tag to its operating profit before taxes and non-cash costs. Used to compare companies across industries.',
  },
  'Short Ratio': {
    plainLabel: 'Bearish Pressure Score',
    description: 'How many days it would take all short-sellers (investors betting the price falls) to cover their positions. High values can signal extra selling pressure.',
  },
  '52W Range': {
    plainLabel: 'Price Range This Year',
    description: 'The lowest and highest prices this stock has traded at over the past year, and where the price sits between them right now.',
  },
  '52W High': {
    plainLabel: '52-Week High Price',
    description: 'The highest price this stock has traded at in the past year. Useful for understanding how far it is from its recent best.',
  },
  '52W Hi': {
    plainLabel: '52-Week High Price',
    description: 'The highest price this stock has traded at in the past year. Useful for understanding how far it is from its recent best.',
  },
  '52W Low': {
    plainLabel: '52-Week Low Price',
    description: 'The lowest price this stock has traded at in the past year. Shows how far it could have fallen from its recent peak.',
  },
  '52W Lo': {
    plainLabel: '52-Week Low Price',
    description: 'The lowest price this stock has traded at in the past year. Shows how far it could have fallen from its recent peak.',
  },
  'Dividend Yield': {
    plainLabel: 'Annual Dividend %',
    description: 'Annual dividend payments as a percentage of the stock price. A 3% yield means you\'d earn $3 per year for every $100 invested, if dividends stay the same.',
  },
  'Div Yld': {
    plainLabel: 'Annual Dividend %',
    description: 'Annual dividend payments as a percentage of the stock price. A 3% yield means you\'d earn $3 per year for every $100 invested, if dividends stay the same.',
  },
  'Payout': {
    plainLabel: 'Share of Profit Paid Out',
    description: 'The percentage of profit paid to shareholders as dividends rather than reinvested. A ratio over 100% usually means the company held its dividend steady through a weak earnings year, not that something is broken, but it is worth watching if it stays that high for long.',
  },
  'Profit Margin': {
    plainLabel: 'Profit per $1 of Revenue',
    description: 'What percentage of revenue the company keeps as profit after all costs. A 20% margin means the company keeps $0.20 for every $1.00 it earns.',
  },
  'Margin': {
    plainLabel: 'Profit per $1 of Revenue',
    description: 'What percentage of revenue the company keeps as profit after all costs. A 20% margin means the company keeps $0.20 for every $1.00 it earns.',
  },
  'Gross Margin': {
    plainLabel: 'Profit Before Operating Costs',
    description: 'Revenue minus the direct cost of making the product or service, as a percentage of revenue. Higher means more room to cover marketing, R&D, and overhead.',
  },
  'Operating Margin': {
    plainLabel: 'Profit From Core Operations',
    description: 'Profit from running the core business, before interest and taxes, as a percentage of revenue. Strips out one-off items to show how the business itself performs.',
  },
  'Rev Growth': {
    plainLabel: 'Revenue Growth Rate',
    description: 'How fast the company\'s total sales are growing year-over-year. Positive means the business is expanding.',
  },
  'Rev Gth': {
    plainLabel: 'Revenue Growth Rate',
    description: 'How fast the company\'s total sales are growing year-over-year. Positive means the business is expanding.',
  },
  'Earn Gth': {
    plainLabel: 'Earnings Growth Rate',
    description: 'How fast the company\'s profit is growing year-over-year, compared to the same quarter last year. Positive means profit is rising.',
  },
  'YoY': {
    plainLabel: 'Year-over-Year',
    description: 'Compared to the same period one year ago. The standard way to compare growth without seasonal swings distorting the picture.',
  },
  'Constant Currency': {
    plainLabel: 'Growth Without FX Swings',
    description: 'Growth with exchange-rate swings stripped out, so a stronger or weaker dollar doesn\'t make the underlying business look better or worse than it really is.',
  },

  // ── Financials: Income Statement ───────────────────────────────────────────

  'Revenue': {
    plainLabel: 'Total Sales',
    description: 'All money the company earned from selling products or services, before any costs are subtracted.',
  },
  'RPO': {
    plainLabel: 'Contracted Future Revenue',
    description: 'Remaining Performance Obligations: revenue from signed contracts that hasn\'t been delivered or booked yet. A preview of sales still to come, common for subscription and cloud businesses.',
  },
  'Gross Profit': {
    plainLabel: 'Sales Profit (Before Expenses)',
    description: 'Revenue minus the direct cost of making the product or service. Higher gross profit means more room to cover other expenses.',
  },
  'Operating Income': {
    plainLabel: 'Profit from Core Business',
    description: 'Profit after deducting operating expenses like salaries and rent, but before taxes and interest. Shows how well the core business runs.',
  },
  'EBITDA': {
    plainLabel: 'Operating Cash Profit',
    description: 'Earnings before interest, taxes, depreciation, and amortization. A common way to compare profitability across companies.',
  },
  'Net Income': {
    plainLabel: 'Bottom-Line Profit',
    description: 'The final profit after every cost (taxes, interest, and all other expenses) has been subtracted. The "bottom line."',
  },
  'EPS (Diluted)': {
    plainLabel: 'Profit per Share',
    description: 'Net income divided by the number of shares. Shows how much profit each share of stock represents.',
  },
  'EPS': {
    plainLabel: 'Profit per Share',
    description: 'Net income divided by the number of shares, trailing 12 months. Shows how much profit each share of stock represents.',
  },
  'EPS (Basic)': {
    plainLabel: 'Profit per Share (Basic)',
    description: 'Like EPS Diluted but only counts shares currently outstanding, not potential shares from options or conversions.',
  },
  'R&D Expenses': {
    plainLabel: 'Research & Development Spend',
    description: 'Money spent on building new products or technologies. High R&D often signals a company investing in future growth.',
  },
  'SG&A Expenses': {
    plainLabel: 'Sales & Admin Costs',
    description: 'Costs for running the business: marketing, sales staff, and office expenses. Does not include production costs.',
  },
  'Interest Expense': {
    plainLabel: 'Debt Interest Paid',
    description: 'How much the company paid in interest on its loans and bonds. High interest expense can eat into profits.',
  },
  'Income Tax': {
    plainLabel: 'Taxes Paid',
    description: 'Corporate taxes owed on profits for the period.',
  },

  // ── Financials: Balance Sheet ──────────────────────────────────────────────

  'Total Assets': {
    plainLabel: 'Everything the Company Owns',
    description: 'The total value of everything the company owns: cash, buildings, equipment, intellectual property, and more.',
  },
  'Current Assets': {
    plainLabel: 'Short-Term Assets',
    description: 'Assets the company expects to convert to cash within a year, like inventory, receivables, and cash itself.',
  },
  'Cash & Equivalents': {
    plainLabel: 'Cash on Hand',
    description: 'Actual cash and anything easily convertible to cash (like short-term government bonds). More cash = more financial flexibility.',
  },
  'Goodwill & Intangibles': {
    plainLabel: 'Acquired Value & Brand Worth',
    description: 'Value of brand recognition, patents, customer relationships, and the premium paid when acquiring other companies.',
  },
  'Total Liabilities': {
    plainLabel: 'Everything the Company Owes',
    description: 'All money the company owes: short-term bills, long-term loans, and other obligations.',
  },
  'Current Liabilities': {
    plainLabel: 'Bills Due Within a Year',
    description: 'Obligations the company must pay within the next 12 months, including short-term debt and accounts payable.',
  },
  'Long-Term Debt': {
    plainLabel: 'Long-Term Loans',
    description: 'Debt that doesn\'t come due for more than a year. High long-term debt can be risky if interest rates rise or the business slows.',
  },
  "Stockholders' Equity": {
    plainLabel: 'Net Worth of the Company',
    description: 'What shareholders would receive if all assets were sold and all debts paid. Total Assets minus Total Liabilities.',
  },
  'Retained Earnings': {
    plainLabel: 'Profits Reinvested in Business',
    description: 'Cumulative profits the company has kept instead of paying out as dividends. Growing retained earnings usually means a healthy, profitable business.',
  },

  // ── Financials: Cash Flow ──────────────────────────────────────────────────

  'Operating Cash Flow': {
    plainLabel: 'Cash from Running the Business',
    description: 'Actual cash generated by the company\'s core operations. Often considered more reliable than net income because it\'s harder to manipulate.',
  },
  'Capital Expenditures': {
    plainLabel: 'Money Invested in Assets',
    description: 'Cash spent on physical assets like equipment, factories, or property. Necessary for growth but reduces free cash flow.',
  },
  'Free Cash Flow': {
    plainLabel: 'Cash Left After Investments',
    description: 'Operating cash flow minus capital expenditures. Money the company can use to pay dividends, buy back shares, or pay down debt.',
  },
  'FCF': {
    plainLabel: 'Cash Left After Investments',
    description: 'Operating cash flow minus capital expenditures. Money the company can use to pay dividends, buy back shares, or pay down debt.',
  },
  'D&A': {
    plainLabel: 'Depreciation & Amortization',
    description: 'A non-cash accounting expense that spreads the cost of assets over their useful life. Added back to calculate operating cash flow.',
  },
  'Investing Activities': {
    plainLabel: 'Cash Used for Investments',
    description: 'Cash spent or received from buying/selling long-term assets and investments, like acquiring another company.',
  },
  'Financing Activities': {
    plainLabel: 'Cash from Borrowing & Equity',
    description: 'Cash raised from issuing stock or borrowing, minus repayments and dividends. Positive means the company raised more than it returned.',
  },
  'Dividends Paid': {
    plainLabel: 'Cash Returned to Shareholders',
    description: 'Total cash paid out to shareholders as dividends during the period.',
  },

  // ── Technical Indicators ───────────────────────────────────────────────────

  'SMA 50': {
    plainLabel: '50-Day Average Price',
    description: 'The average closing price over the past 50 trading days. Traders watch when the price crosses above or below this line.',
  },
  'SMA 200': {
    plainLabel: '200-Day Average Price',
    description: 'The average closing price over the past 200 trading days. A long-term trend indicator: price above = bullish, below = bearish.',
  },
  'EMA 20': {
    plainLabel: '20-Day Weighted Average',
    description: 'Like a moving average but gives more weight to recent prices. Reacts faster to price changes than a simple moving average.',
  },
  'BB': {
    plainLabel: 'Price Range Bands',
    description: 'Bollinger Bands: upper and lower boundaries that show how far the price deviates from its recent average. Prices near the edges may signal reversal.',
  },
  'RSI': {
    plainLabel: 'Momentum Meter',
    description: 'Relative Strength Index: measures how fast the price is moving. Above 70 may mean overbought; below 30 may mean oversold.',
  },
  'MACD': {
    plainLabel: 'Trend Momentum Signal',
    description: 'Moving Average Convergence/Divergence: shows the relationship between two moving averages. Used to spot trend changes and momentum shifts.',
  },

  // ── Portfolio / Holdings ───────────────────────────────────────────────────

  'Total Value': {
    plainLabel: 'Total Value',
    description: 'The current market value of everything you hold: each position\'s latest price times how many shares you own, added up.',
  },
  'Cost Basis': {
    plainLabel: 'What You Paid',
    description: 'The total amount you originally spent to buy your holdings. Comparing this to today\'s value tells you if you\'re up or down.',
  },
  'Market Value': {
    plainLabel: 'Current Worth',
    description: 'What a position is worth right now: the latest price times the number of shares you own.',
  },
  'Unrealized P/L': {
    plainLabel: 'Paper Gain / Loss',
    description: 'How much you\'re up or down on a holding you still own. It\'s "unrealized" because you only lock it in when you actually sell.',
  },
  'Total P/L': {
    plainLabel: 'Total Gain / Loss',
    description: 'Your overall profit or loss across all holdings versus what you paid for them, combining every position.',
  },
  'Today P&L': {
    plainLabel: "Today's Gain / Loss",
    description: 'How much your holdings have gone up or down just today, based on each position\'s price move since yesterday\'s close.',
  },
  'Day Change': {
    plainLabel: "Today's Move",
    description: 'How much a position has moved today, in both dollars and percent, versus yesterday\'s closing price.',
  },
  'Avg Price': {
    plainLabel: 'Average Buy Price',
    description: 'The average price you paid per share across all your purchases of this holding.',
  },
  'Allocation': {
    plainLabel: 'Share of Portfolio',
    description: 'How much of your total portfolio this one holding makes up. Spreading across several holdings lowers the risk from any single one.',
  },

  // ── Watchlist shorthands (labels differ from the stock page) ────────────────

  'Mkt Cap': {
    plainLabel: 'Company Size',
    description: 'Total value of all shares combined. Larger = bigger company. "Large-cap" usually means over $10 billion.',
  },
  'P/E': {
    plainLabel: 'Price vs Earnings',
    description: 'How much investors pay per $1 of the company\'s yearly profit. Lower often signals better value, but context matters.',
  },
  'Health': {
    plainLabel: 'Financial Health Score',
    description: 'BullPen\'s A–F grade of a company\'s financial strength, from profitability and debt to growth and valuation. Higher grades = sturdier finances.',
  },
  'Earnings': {
    plainLabel: 'Next Earnings Date',
    description: 'When the company next reports its quarterly results. Prices often move sharply around earnings dates.',
  },
  'Thesis': {
    plainLabel: 'Your View',
    description: 'Your saved take on a stock. The colored dot reflects it: green = bullish, red = bearish, grey = neutral.',
  },

  // ── Health-score categories ─────────────────────────────────────────────────

  'Profitability': {
    plainLabel: 'How Well It Makes Money',
    description: 'Whether the company actually turns sales into profit: profit margin, net income, and revenue growth. The single biggest driver of the health score.',
  },
  'Financial Strength': {
    plainLabel: 'How Sturdy Its Finances Are',
    description: 'Whether the company can pay its bills and isn\'t buried in debt: cash vs. short-term obligations, debt levels, and free cash flow.',
  },
  'Valuation': {
    plainLabel: 'Whether the Price Is Fair',
    description: 'Whether the stock looks cheap or expensive for what you get, based on P/E, P/B, and EV/EBITDA. A great company can still be a pricey stock.',
  },
  'Growth': {
    plainLabel: 'How Fast It\'s Growing',
    description: 'How quickly sales and earnings are expanding year over year. Faster growth can justify a higher price.',
  },
  'Market Risk': {
    plainLabel: 'How Bumpy the Ride Is',
    description: 'How volatile the stock tends to be: its beta versus the market and how heavily it\'s bet against (short interest).',
  },
  'Current Ratio': {
    plainLabel: 'Can It Pay Its Bills?',
    description: 'Short-term assets divided by short-term bills. Above 1 means the company can cover what it owes over the next year; below 1 can be a warning sign.',
  },
  'Debt-to-Equity': {
    plainLabel: 'How Much It Borrows',
    description: 'How much debt the company uses compared to shareholders\' own money. Higher means more borrowing, more risk if business slows.',
  },

  // ── Price panel ─────────────────────────────────────────────────────────────

  'Open': {
    plainLabel: 'Opening Price',
    description: 'The price the stock first traded at when the market opened today.',
  },
  'High': {
    plainLabel: 'Day\'s High',
    description: 'The highest price the stock reached so far today.',
  },
  'Low': {
    plainLabel: 'Day\'s Low',
    description: 'The lowest price the stock reached so far today.',
  },
  'Prev Close': {
    plainLabel: 'Yesterday\'s Close',
    description: 'The price the stock finished at during the previous trading day. Today\'s change is measured from here.',
  },

  // ── Revenue flow (Sankey) ───────────────────────────────────────────────────

  'Cost of Revenue': {
    plainLabel: 'Cost of Making Sales',
    description: 'The direct cost of producing what the company sells: materials, manufacturing, and delivery. Revenue minus this is gross profit.',
  },
  'Other OpEx': {
    plainLabel: 'Other Operating Costs',
    description: 'Day-to-day running costs beyond making the product, things like admin, marketing, and overhead not itemized elsewhere.',
  },
  'Tax & Other': {
    plainLabel: 'Taxes & Other Costs',
    description: 'Income taxes plus interest and other miscellaneous costs subtracted before arriving at final profit.',
  },
  'Total Costs': {
    plainLabel: 'All Costs Combined',
    description: 'Every cost the company subtracts from revenue (production, operating expenses, taxes, and interest) before its bottom-line profit.',
  },

  // ── Macro / Economy ─────────────────────────────────────────────────────────

  'Federal Reserve': {
    plainLabel: 'The Fed',
    description: 'The United States central bank. It sets interest rate policy to try to keep inflation in check and the economy growing at a healthy pace.',
  },
  'Interest Rate': {
    plainLabel: 'Cost of Borrowing Money',
    description: "What it costs to borrow money, set in large part by the Fed's policy rate. When rates rise, loans, mortgages, and business borrowing all get more expensive.",
  },
  'Jobs Report': {
    plainLabel: 'Monthly Employment Report',
    description: 'A US government report, released the first Friday of most months, showing how many jobs were added or lost. Markets react to whether the number beats or misses forecasts, not the number itself.',
  },
  'Inflation': {
    plainLabel: 'Rising Prices',
    description: 'The rate at which prices for goods and services increase over time. High inflation erodes what your money can buy and often pushes the Fed to raise interest rates.',
  },
  'CPI': {
    plainLabel: 'Consumer Price Index',
    description: 'The most widely watched measure of inflation, tracking how much prices for everyday goods and services have changed. A hotter-than-expected CPI report often moves the whole market.',
  },
  'Unemployment Rate': {
    plainLabel: 'Share of People Out of Work',
    description: 'The percentage of the labor force actively looking for work but without a job. Released monthly alongside the jobs report.',
  },
  'Oil Price': {
    plainLabel: 'Price of Crude Oil',
    description: 'The market price of crude oil. It ripples into transportation and manufacturing costs, consumer prices, and energy company profits, sometimes pulling the market in two different directions at once.',
  },
  'Discount Rate': {
    plainLabel: 'How Future Profits Get Valued Today',
    description: "The rate used to translate a company's future profits into what they're worth today. When interest rates rise, this rate rises too, shrinking the value of profits expected far in the future, which is why growth stocks tend to fall harder than value stocks when rates climb.",
  },
  'Growth Stock': {
    plainLabel: 'Growth Stock',
    description: "A stock priced mainly on profits expected years from now, not today's earnings. Its value leans heavily on future cash flow, making it more sensitive to rising interest rates.",
  },
  'Value Stock': {
    plainLabel: 'Value Stock',
    description: 'A stock priced mainly on the cash it already generates today, not a distant growth story. Its value leans less on future cash flow, making it comparatively steadier when interest rates rise.',
  },
  'Yield Curve': {
    plainLabel: 'Yield Curve',
    description: "A line plotting Treasury bond yields from short-term to long-term. Normally, longer-term yields are higher. When that flips, it's called an inversion.",
  },
  'Yield Curve Inversion': {
    plainLabel: 'Inverted Yield Curve',
    description: 'When short-term Treasury yields rise above long-term yields. It has historically been one of the more reliable warning signs of a coming recession.',
  },
  'Credit Spread': {
    plainLabel: 'Extra Yield for Riskier Debt',
    description: 'The extra yield investors demand to hold riskier corporate bonds over safe government debt. Widening spreads signal investors are pricing in more risk of default.',
  },
  'Sector Rotation': {
    plainLabel: 'Money Shifting Between Sectors',
    description: 'When investors shift money out of some sectors and into others as economic conditions change, for example moving from growth-heavy tech into steadier value sectors as rates rise.',
  },
  'Recession': {
    plainLabel: 'Economic Downturn',
    description: 'A significant, widespread decline in economic activity lasting more than a few months, typically marked by falling output, employment, and spending.',
  },

  // ── Deep Dive / Portfolio Builder jargon ────────────────────────────────────

  'Basis Points': {
    plainLabel: 'Hundredths of a Percent',
    description: 'A basis point is 1/100th of a percentage point. "300 basis points" means 3 percentage points, a precise way analysts describe small changes in margins, rates, or yields.',
  },
  'bps': {
    plainLabel: 'Hundredths of a Percent',
    description: 'A basis point is 1/100th of a percentage point. "300 bps" means 3 percentage points, a precise way analysts describe small changes in margins, rates, or yields.',
  },
  'EUV': {
    plainLabel: 'Extreme Ultraviolet Lithography',
    description: 'The most advanced, expensive chipmaking technology, used to print the smallest, densest circuits. Only ASML makes the machines that do this, making it a chokepoint in the whole chip supply chain.',
  },
  'CoWoS': {
    plainLabel: 'Advanced Chip Packaging',
    description: "TSMC's technique for stacking and connecting multiple chips (like a processor and memory) into one package. It's a major bottleneck for AI chip production, since demand for it has outpaced capacity.",
  },
  'HPC': {
    plainLabel: 'High-Performance Computing',
    description: 'Computing built for heavy workloads like AI training, scientific simulation, or data centers, using far more processing power than a typical computer.',
  },
  'Thesis exposure': {
    plainLabel: 'How Directly This Fits the Thesis',
    description: "How directly a holding's revenue is exposed to the investment thesis, on a scale of 1 to 10. A 10 means the company is a pure play; a low score means the connection is more indirect.",
  },
};

/** Look up a glossary entry, returning undefined if not found. */
export function getGlossaryEntry(term: string): GlossaryEntry | undefined {
  return GLOSSARY[term];
}

/**
 * Category grouping for the standalone /glossary/[term] pages — mirrors the
 * section comments above, transcribed once as data so pages can link
 * "related terms" and the index can group its listing. Not derived from the
 * comments themselves (comments aren't readable at runtime); keep this in
 * sync when adding a new section above.
 */
export const GLOSSARY_CATEGORIES: { name: string; terms: string[] }[] = [
  { name: 'Statistics & Valuation', terms: ['Market Cap', 'Enterprise Value', 'Beta', 'Avg Volume', 'Shares Float', 'P/E (TTM)', 'P/E', 'Forward P/E', 'TTM', 'NTM', 'P/S', 'P/B', 'EV/EBITDA', 'Short Ratio', '52W Range', '52W High', '52W Low', 'Dividend Yield', 'Profit Margin', 'Gross Margin', 'Operating Margin', 'Rev Growth', 'YoY', 'Constant Currency'] },
  { name: 'Income Statement', terms: ['Revenue', 'RPO', 'Gross Profit', 'Operating Income', 'EBITDA', 'Net Income', 'EPS (Diluted)', 'EPS (Basic)', 'R&D Expenses', 'SG&A Expenses', 'Interest Expense', 'Income Tax'] },
  { name: 'Balance Sheet', terms: ['Total Assets', 'Current Assets', 'Cash & Equivalents', 'Goodwill & Intangibles', 'Total Liabilities', 'Current Liabilities', 'Long-Term Debt', "Stockholders' Equity", 'Retained Earnings'] },
  { name: 'Cash Flow', terms: ['Operating Cash Flow', 'Capital Expenditures', 'Free Cash Flow', 'FCF', 'D&A', 'Investing Activities', 'Financing Activities', 'Dividends Paid'] },
  { name: 'Technical Indicators', terms: ['SMA 50', 'SMA 200', 'EMA 20', 'BB', 'RSI', 'MACD'] },
  { name: 'Portfolio & Holdings', terms: ['Total Value', 'Cost Basis', 'Market Value', 'Unrealized P/L', 'Total P/L', 'Today P&L', 'Day Change', 'Avg Price', 'Allocation', 'Earnings', 'Thesis'] },
  { name: 'Health Score', terms: ['Health', 'Profitability', 'Financial Strength', 'Valuation', 'Growth', 'Market Risk', 'Current Ratio', 'Debt-to-Equity'] },
  { name: 'Price Panel', terms: ['Open', 'High', 'Low', 'Prev Close'] },
  { name: 'Revenue Flow', terms: ['Cost of Revenue', 'Other OpEx', 'Tax & Other', 'Total Costs'] },
  { name: 'Macro & Economy', terms: ['Federal Reserve', 'Interest Rate', 'Jobs Report', 'Inflation', 'CPI', 'Unemployment Rate', 'Oil Price', 'Discount Rate', 'Growth Stock', 'Value Stock', 'Yield Curve', 'Yield Curve Inversion', 'Credit Spread', 'Sector Rotation', 'Recession'] },
];

function categoryOf(term: string): string | undefined {
  return GLOSSARY_CATEGORIES.find((c) => c.terms.includes(term))?.name;
}

/** URL-safe slug for a glossary term, e.g. "P/E (TTM)" → "pe-ttm". */
export function glossarySlug(term: string): string {
  return term
    .toLowerCase()
    .replace(/[()/&']/g, ' ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Terms worth their own indexed page: the first term (by declaration order)
 * for each distinct description. A few entries are pure aliases with
 * byte-identical descriptions (e.g. "Mkt Cap" duplicates "Market Cap" — see
 * the "Watchlist shorthands" comment above) — publishing both as separate
 * pages would be duplicate content, so the alias is dropped here rather than
 * hand-picked, and any lookup for it resolves to the canonical term instead.
 */
export function canonicalGlossaryTerms(): string[] {
  const seenDescriptions = new Set<string>();
  const canonical: string[] = [];
  for (const [term, entry] of Object.entries(GLOSSARY)) {
    if (seenDescriptions.has(entry.description)) continue;
    seenDescriptions.add(entry.description);
    canonical.push(term);
  }
  return canonical;
}

/** Reverse-lookup: slug → canonical term. Aliases resolve to their canonical term's slug. */
export function resolveGlossaryTermFromSlug(slug: string): string | undefined {
  const canonical = canonicalGlossaryTerms();
  return canonical.find((term) => glossarySlug(term) === slug);
}

/** Up to `max` other terms from the same category, for "related terms" links. */
export function relatedGlossaryTerms(term: string, max = 6): string[] {
  const category = categoryOf(term);
  if (!category) return [];
  const canonicalSet = new Set(canonicalGlossaryTerms());
  const siblings = GLOSSARY_CATEGORIES.find((c) => c.name === category)!.terms;
  return siblings.filter((t) => t !== term && canonicalSet.has(t)).slice(0, max);
}
