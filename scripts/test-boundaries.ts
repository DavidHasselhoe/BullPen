// Test Section Boundary Finding
import { getFilingContent } from '../lib/ingestion/sec-edgar';

const cik = '0000320193';
const accessionNumber = '0000320193-24-000123';

// Simplified version of the parser logic for debugging
async function main() {
  const content = await getFilingContent(accessionNumber, cik);
  
  // Extract and clean (simplified)
  const textMatch = content.match(/<TEXT>([\s\S]*?)<\/TEXT>/i);
  if (!textMatch) return;
  
  let extracted = textMatch[1];
  
  // Find PART I occurrences
  const partIPattern = /PART\s+I\b/gi;
  const partIMatches: number[] = [];
  let match;
  while ((match = partIPattern.exec(extracted)) !== null) {
    partIMatches.push(match.index);
  }
  
  console.log(`Found ${partIMatches.length} PART I occurrences:`, partIMatches);
  
  // Use second PART I
  if (partIMatches.length > 1) {
    extracted = extracted.slice(partIMatches[1]);
  }
  
  // Find "Item 7" and show context
  const item7Regex = /ITEM\s+7[\.\s]/gi;
  const item7Matches = [];
  let m;
  while ((m = item7Regex.exec(textMatch[1])) !== null && item7Matches.length < 3) {
    item7Matches.push(m.index);
  }
  
  console.log(`\nFound ${item7Matches.length} "Item 7" occurrences\n`);
  
  item7Matches.forEach((index, i) => {
    const start = Math.max(0, index - 50);
    const end = Math.min(textMatch[1].length, index + 500);
    console.log(`=== Occurrence ${i + 1} at index ${index} ===`);
    console.log(textMatch[1].substring(start, end));
    console.log('\n');
  });
}

main();
