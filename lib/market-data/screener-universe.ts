/**
 * Canonical list of companies available in the screener.
 * Ordered roughly by market cap (largest first).
 * This file is imported by both server (refresh API) and client (screener page + SSE subscription).
 */
export const SCREENER_UNIVERSE = [
  'AAPL','MSFT','NVDA','AMZN','GOOGL','META','BRK.B','TSLA','LLY','AVGO',
  'JPM','V','UNH','XOM','COST','MA','HD','PG','JNJ','ABBV',
  'BAC','MRK','NFLX','CRM','ORCL','CVX','WMT','KO','AMD','PEP',
  'TMO','ACN','MCD','CSCO','IBM','GE','CAT','QCOM','LIN','ABT',
  'TXN','NOW','DHR','INTU','NEE','RTX','LOW','AMGN','SPGI','BA',
  'MS','GS','BLK','DE','ISRG','PLD','SCHW','SYK','MMM','UNP',
  'DIS','VRTX','MDLZ','AXP','REGN','GILD','CB','ZTS','CI','TJX',
  'ELV','ADI','PGR','EOG','CME','PANW','BSX','KLAC','MRNA','KKR',
  'F','GM','UBER','LYFT','SHOP','SQ','PLTR','SNOW','DDOG','CRWD',
  'ADBE','INTC','MU','WFC','USB','PNC','TGT','SBUX','NKE','PYPL',
];
