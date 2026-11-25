/**
 * Head-to-heads that get an indexable /tools/compare/<a>-vs-<b> page and a
 * sitemap entry. Any other pair still renders, but noindex.
 *
 * Made on 2026-11-25 from screener_stats: within each industry, the three
 * largest S&P 500 / Nasdaq 100 companies by market cap that have a Health
 * Score and a warm quarterly financials cache, paired with each other. Pairs
 * that were not real peers (GOOGL vs Nebius) were dropped, and household
 * cross-industry matchups people actually search for were added at the top.
 * The order inside a pair is the canonical URL order; the reverse redirects.
 * Every ticker must stay in SIGNIFICANT_TICKERS (the cron keeps them warm), so
 * a crawl of these pages reads cache only and never spends TwelveData credits.
 */
export const POPULAR_PAIRS: ReadonlyArray<readonly [string, string]> = (
  `AAPL-MSFT AAPL-GOOGL MSFT-GOOGL AAPL-AMZN MSFT-AMZN AMZN-WMT NVDA-AMD AMD-INTC NVDA-INTC AVGO-AMD
  NVDA-AVGO NVDA-MU AVGO-MU MSFT-PLTR MSFT-ORCL PLTR-ORCL GOOGL-META AMZN-PDD AMZN-MELI PDD-MELI
  GE-RTX TSLA-GM TSLA-F GM-F LLY-JNJ LLY-ABBV JNJ-ABBV BRK.B-AIG AIG-HIG WMT-COST WMT-TGT COST-TGT
  JPM-BAC JPM-WFC BAC-WFC V-MA V-AXP MA-AXP XOM-CVX ASML-AMAT ASML-LRCX AMAT-LRCX KO-PEP KO-MNST
  PEP-MNST PG-CL PG-KMB CL-KMB CSCO-MSI CSCO-HPE MSI-HPE HD-LOW UNH-CVS UNH-ELV CVS-ELV PM-MO
  MS-GS MS-SCHW GS-SCHW TMO-DHR TMO-WAT DHR-WAT CAT-DE CAT-PCAR DE-PCAR NFLX-DIS NFLX-LYV DIS-LYV
  LIN-ECL LIN-SHW ECL-SHW IBM-ACN IBM-CTSH ACN-CTSH ANET-DELL ANET-STX DELL-STX MCD-SBUX MCD-CMG
  SBUX-CMG VZ-TMUS VZ-T TMUS-T GEV-ETN GEV-PH ETN-PH ABT-SYK ABT-MDT SYK-MDT APH-GLW APH-TEL GLW-TEL
  WELL-VTR WELL-DOC VTR-DOC NEE-SO NEE-DUK SO-DUK BLK-BX BLK-KKR BX-KKR UNP-CSX UNP-NSC CSX-NSC
  SHOP-CRM COP-EOG COP-OXY EOG-OXY TJX-ROST TJX-LULU ROST-LULU ISRG-BDX ISRG-RMD BDX-RMD CB-PGR
  CB-TRV PGR-TRV VRTX-REGN VRTX-MRNA REGN-MRNA SPGI-CME SPGI-ICE CME-ICE MCK-COR MCK-CAH COR-CAH
  PLD-PSA PLD-EXR PSA-EXR BKNG-ABNB BKNG-RCL ABNB-RCL MAR-HLT MRSH-AJG MRSH-AON AJG-AON HCA-UHS
  HCA-DVA UHS-DVA WM-RSG EQIX-AMT EQIX-DLR AMT-DLR MPC-PSX MPC-VLO PSX-VLO MMM-HON UPS-FDX UPS-EXPD
  FDX-EXPD USB-PNC USB-TFC PNC-TFC CTAS-TRI CTAS-CPRT TRI-CPRT PWR-FER PWR-FIX FER-FIX TT-JCI TT-CARR
  JCI-CARR SPG-O SPG-KIM O-KIM CEG-VST CEG-NRG VST-NRG MDLZ-HSY WMB-KMI WMB-TRGP KMI-TRGP ORLY-AZO
  ORLY-GPC AZO-GPC SLB-BKR SLB-HAL BKR-HAL VRT-BE VRT-HUBB BE-HUBB GWW-FAST GWW-FERG FAST-FERG
  MET-AFL MET-PRU AFL-PRU CRH-MLM CRH-VMC MLM-VMC NUE-STLD DAL-UAL DAL-LUV UAL-LUV GRMN-KEYS NKE-DECK
  ESS-INVH DHI-PHM DHI-LEN PHM-LEN ADM-TSN ADM-BG TSN-BG KHC-GIS KHC-SJM GIS-SJM ULTA-WSM LVS-MGM
  LVS-WYNN MGM-WYNN SNA-SWK CF-MOS`
)
  .split(/\s+/)
  .filter(Boolean)
  .map((p) => p.split('-') as [string, string]);

/** "aapl-vs-msft" for a pair, the URL segment of its page. */
export function pairSlug(a: string, b: string): string {
  return `${a}-vs-${b}`.toLowerCase();
}

/** The tickers in a "aapl-vs-msft" segment, upper-cased, or null when it is not two tickers. */
export function parsePairSlug(slug: string): [string, string] | null {
  const parts = decodeURIComponent(slug).toUpperCase().split('-VS-');
  return parts.length === 2 && parts[0] && parts[1] && parts[0] !== parts[1] ? [parts[0], parts[1]] : null;
}

/** The listed order of a pair if it is curated (either way round), else null. */
export function curatedOrder(a: string, b: string): [string, string] | null {
  const hit = POPULAR_PAIRS.find(([x, y]) => (x === a && y === b) || (x === b && y === a));
  return hit ? [hit[0], hit[1]] : null;
}

/** Curated pairs that include this ticker, in list order, for the stock page's "Compare" links. */
export function pairsFor(ticker: string, limit = 4): Array<[string, string]> {
  return POPULAR_PAIRS.filter(([a, b]) => a === ticker || b === ticker)
    .slice(0, limit)
    .map(([a, b]) => [a, b]);
}

/** Other curated pairs that share a company with this one, for internal links. */
export function relatedPairs(a: string, b: string, limit = 6): Array<[string, string]> {
  return POPULAR_PAIRS.filter(
    ([x, y]) => (x === a || y === a || x === b || y === b) && !((x === a && y === b) || (x === b && y === a))
  )
    .slice(0, limit)
    .map(([x, y]) => [x, y]);
}
