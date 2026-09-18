import { resolveCik } from '@/lib/segments/cik';

/**
 * Revenue facts, with their dimensions, straight from a filing's XBRL.
 *
 * Every segment figure a US company reports is tagged here with an explicit
 * axis and member, which is why this feature needs no AI and no table
 * scraping: the numbers arrive already structured and already exact. The
 * dimensionless companyconcept API cannot serve this, it carries only the
 * consolidated total.
 *
 * The instance document is the primary document's name with `.htm` swapped
 * for `_htm.xml`, in the same folder. Its contexts carry NO namespace prefix
 * (`<context id="...">`, not `<xbrli:context>`), and a prefixed pattern
 * silently matches nothing at all.
 */

export interface RevenueFact {
  members: Array<{ axis: string; member: string }>;
  value: number;
  durationDays: number;
  end: string;
}

export interface FilingFacts {
  facts: RevenueFact[];
  periodEnd: string;
  form: '10-K' | '10-Q';
  accession: string;
}

const REVENUE_TAGS = [
  'RevenueFromContractWithCustomerExcludingAssessedTax',
  'RevenueFromContractWithCustomerIncludingAssessedTax',
  'Revenues',
].join('|');

function userAgent(): string {
  return process.env.SEC_EDGAR_USER_AGENT || 'BullPen contact@bullpen.no';
}

async function secFetch(url: string): Promise<string> {
  const res = await fetch(url, { headers: { 'User-Agent': userAgent(), Accept: '*/*' } });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.text();
}

export async function fetchRevenueFacts(
  ticker: string,
  form: '10-K' | '10-Q',
): Promise<FilingFacts | null> {
  const cik = await resolveCik(ticker);
  if (!cik) return null;

  const subs = JSON.parse(await secFetch(`https://data.sec.gov/submissions/CIK${cik}.json`)) as {
    filings: { recent: { form: string[]; accessionNumber: string[]; primaryDocument: string[] } };
  };
  const recent = subs.filings?.recent;
  const idx = recent?.form?.findIndex((f) => f === form) ?? -1;
  if (idx === -1) return null;

  const accession = recent.accessionNumber[idx];
  const folder = accession.replace(/-/g, '');
  const instance = recent.primaryDocument[idx].replace(/\.htm$/i, '_htm.xml');
  const xml = await secFetch(
    `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${folder}/${instance}`,
  );

  const periodEnd = (xml.match(/<dei:DocumentPeriodEndDate[^>]*>([^<]+)</) ?? [])[1];
  if (!periodEnd) return null;

  const contexts = new Map<
    string,
    { start?: string; end?: string; members: RevenueFact['members'] }
  >();
  for (const m of xml.matchAll(/<context id="([^"]+)">([\s\S]*?)<\/context>/g)) {
    const body = m[2];
    contexts.set(m[1], {
      start: (body.match(/<startDate>(.*?)<\/startDate>/) ?? [])[1],
      end: (body.match(/<endDate>(.*?)<\/endDate>/) ?? [])[1],
      members: [...body.matchAll(/dimension="([^"]+)"[^>]*>([^<]+)</g)].map((d) => ({
        axis: d[1].split(':').pop() as string,
        member: d[2].split(':').pop() as string,
      })),
    });
  }

  const facts: RevenueFact[] = [];
  const pattern = new RegExp(
    `<us-gaap:(?:${REVENUE_TAGS})\\b[^>]*contextRef="([^"]+)"[^>]*>([^<]+)<`,
    'g',
  );
  for (const m of xml.matchAll(pattern)) {
    const ctx = contexts.get(m[1]);
    const value = Number(m[2]);
    if (!ctx?.start || !ctx.end || !Number.isFinite(value)) continue;
    facts.push({
      members: ctx.members,
      value,
      durationDays: Math.round((Date.parse(ctx.end) - Date.parse(ctx.start)) / 86_400_000),
      end: ctx.end,
    });
  }

  return { facts, periodEnd, form, accession };
}
