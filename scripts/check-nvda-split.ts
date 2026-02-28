// Quick check for NVIDIA split filing
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { getFilingContent } from '../lib/ingestion/sec-edgar';
import { parse8KItems } from '../lib/ingestion/form8k-parser';

async function main() {
  const accessionNumber = '0001045810-24-000144';
  const cik = '0001045810';
  
  console.log(`Fetching filing: ${accessionNumber}\n`);
  const content = await getFilingContent(accessionNumber, cik);
  
  console.log(`Content length: ${content.length.toLocaleString()} chars\n`);
  
  // Check for various patterns
  const patterns = [
    /ITEM\s+3\.02/gi,
    /ITEM\s+3\.03/gi,
    /3\.02/gi,
    /STOCK\s+SPLIT/gi,
    /10[-\s]?for[-\s]?1/gi,
  ];
  
  console.log('Pattern matches:');
  patterns.forEach(pattern => {
    const matches = content.match(pattern);
    if (matches) {
      console.log(`  ${pattern}: ${matches.length} matches`);
      // Find first occurrence
      const index = content.search(pattern);
      if (index > 0) {
        const context = content.substring(Math.max(0, index - 100), index + 300).replace(/\n/g, ' ');
        console.log(`    Context: ...${context}...`);
      }
    }
  });
  
  // Try parsing
  console.log('\nParsing 8-K items...');
  const parsed = parse8KItems(content);
  console.log(`Parsed items: [${parsed.items.join(', ')}]`);
  console.log(`Item contents: ${Object.keys(parsed.itemContents).join(', ')}`);
  
  // Show first 2000 chars
  console.log('\nFirst 2000 chars of filing:');
  console.log('='.repeat(60));
  console.log(content.substring(0, 2000));
}

main().catch(console.error);
