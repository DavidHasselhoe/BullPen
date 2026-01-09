// Check what SEC concepts are available for Apple
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

const cik = '0000320193';
const numericCik = parseInt(cik, 10).toString().padStart(10, '0');

async function main() {
  console.log('Checking SEC Company Facts API for Apple...\n');
  console.log(`CIK: ${cik} (numeric: ${numericCik})\n`);

  const url = `https://data.sec.gov/api/xbrl/companyfacts/CIK${numericCik}.json`;

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'BullPen Analytics contact@bullpen.example.com',
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      console.error(`Error: ${response.status} ${response.statusText}`);
      return;
    }

    const data = await response.json();
    
    console.log('✅ Company Facts data retrieved\n');
    console.log(`Company: ${data.entityName}`);
    console.log(`CIK: ${data.cik}\n`);

    // Show available facts/concepts
    if (data.facts && data.facts['us-gaap']) {
      const gaapFacts = data.facts['us-gaap'];
      console.log(`Available US-GAAP concepts: ${Object.keys(gaapFacts).length}\n`);
      
      // Look for exact revenue concepts
      const exactRevenue = Object.keys(gaapFacts).filter(key => 
        key === 'Revenues' ||
        key === 'RevenueFromContractWithCustomerExcludingAssessedTax' ||
        key === 'SalesRevenueNet' ||
        key.toLowerCase() === 'revenues'
      );
      
      console.log(`Exact revenue concepts: ${exactRevenue.length}`);
      exactRevenue.forEach(concept => {
        console.log(`  ✅ ${concept}`);
        const fact = gaapFacts[concept];
        if (fact && fact.units) {
          console.log(`     Units: ${Object.keys(fact.units).join(', ')}`);
        }
      });
      
      // Also show concepts that start with "Revenue" or "Sales"
      const revenueStarts = Object.keys(gaapFacts).filter(key => 
        key.startsWith('Revenue') || key.startsWith('Sales')
      );
      
      console.log(`\nConcepts starting with Revenue/Sales (${revenueStarts.length}, showing first 15):`);
      revenueStarts.slice(0, 15).forEach(concept => {
        console.log(`  - ${concept}`);
      });
      
      // Look for income concepts
      const incomeConcepts = Object.keys(gaapFacts).filter(key => 
        key.toLowerCase().includes('income') || 
        key.toLowerCase().includes('earnings')
      );
      
      console.log(`\nIncome/Earnings concepts (${incomeConcepts.length}, showing first 10):`);
      incomeConcepts.slice(0, 10).forEach(concept => {
        console.log(`  - ${concept}`);
      });
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

main();
