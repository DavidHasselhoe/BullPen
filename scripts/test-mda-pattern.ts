// Test MD&A Pattern Matching

const testStrings = [
  "Item 7.    Management's Discussion and Analysis of Financial Condition and Results of Operations",
  "ITEM 7. MANAGEMENT'S DISCUSSION AND ANALYSIS",
  "Item 7.Management's Discussion",
  "ITEM 7    MANAGEMENT'S DISCUSSION",
];

const patterns = [
  /ITEM\s+7\.?\s+MANAGEMENT[''']?S\s+DISCUSSION\s+AND\s+ANALYSIS/i,
  /ITEM\s+7[\.\s]+MANAGEMENT[''']?S\s+DISCUSSION/i,
];

console.log('Testing MD&A patterns:\n');

testStrings.forEach((str, i) => {
  console.log(`Test ${i + 1}: "${str}"`);
  patterns.forEach((pattern, j) => {
    const match = str.match(pattern);
    console.log(`  Pattern ${j + 1}: ${match ? '✅ MATCH' : '❌ NO MATCH'}`);
  });
  console.log('');
});
