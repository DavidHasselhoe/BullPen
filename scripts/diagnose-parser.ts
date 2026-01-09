// Diagnose Parser - See what patterns match in the filing
import { getFilingContent } from '../lib/ingestion/sec-edgar';
import { parse10K } from '../lib/ingestion/filing-parser';

const cik = '0000320193';
const accessionNumber = '0000320193-24-000123';

async function main() {
  console.log('🔍 Fetching filing...\n');
  const content = await getFilingContent(accessionNumber, cik);
  
  console.log(`Raw content length: ${content.length.toLocaleString()} chars\n`);
  
  // Parse it
  const parsed = parse10K(content);
  
  console.log(`Cleaned content length: ${parsed.contentLength.toLocaleString()} chars`);
  console.log(`Sections found: ${parsed.sections.length}\n`);
  
  // Show first 5000 chars of cleaned content to see structure
  console.log('='.repeat(60));
  console.log('First 5000 chars of cleaned content:');
  console.log('='.repeat(60));
  console.log(parsed.rawContent.substring(0, 5000));
  console.log('\n' + '='.repeat(60));
  
  // Show sections
  console.log('\nSections extracted:');
  parsed.sections.forEach((section, i) => {
    console.log(`${i + 1}. ${section.type} (${section.content.length} chars)`);
    console.log(`   Name: ${section.name}`);
    console.log(`   Preview: ${section.content.substring(0, 200)}...\n`);
  });
  
  // Search for specific patterns manually
  console.log('='.repeat(60));
  console.log('Manual pattern search in cleaned content:');
  console.log('='.repeat(60));
  
  const patterns = [
    { name: 'PART I', pattern: /PART\s+I\b/i },
    { name: 'Item 1 Business', pattern: /ITEM\s+1\.?\s+BUSINESS/i },
    { name: 'Item 1A Risk', pattern: /ITEM\s+1A\.?\s+RISK/i },
    { name: 'Item 3 Legal', pattern: /ITEM\s+3\.?\s+LEGAL/i },
    { name: 'Item 7 MD&A', pattern: /ITEM\s+7\.?\s+MANAGEMENT/i },
    { name: 'Item 8 Financials', pattern: /ITEM\s+8\.?\s+FINANCIAL/i },
    { name: 'Item 9A Controls', pattern: /ITEM\s+9A\.?\s+CONTROLS/i },
  ];
  
  for (const { name, pattern } of patterns) {
    const match = parsed.rawContent.match(pattern);
    if (match && match.index !== undefined) {
      const start = Math.max(0, match.index - 50);
      const end = Math.min(parsed.rawContent.length, match.index + 200);
      console.log(`\n✅ Found: ${name} at index ${match.index}`);
      console.log(`   Context: ...${parsed.rawContent.substring(start, end)}...`);
    } else {
      console.log(`\n❌ NOT found: ${name}`);
    }
  }
}

main();
