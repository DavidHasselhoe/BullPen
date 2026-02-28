// Check what CapEx concepts are available in XBRL for NVIDIA
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { createServerClient } from '../lib/supabase/client';

async function main() {
  const companyId = process.argv[2] || '1b09229f-48c1-4427-9d42-ccc27a7d9237';
  
  console.log(`🔍 Checking available CapEx concepts for company: ${companyId}\n`);
  
  const supabase = createServerClient();
  
  // Get company
  const { data: company, error: companyError } = await supabase
    .from('companies')
    .select('*')
    .eq('id', companyId)
    .single();
  
  if (companyError || !company) {
    console.error('❌ Company not found:', companyError);
    return;
  }
  
  console.log(`✅ Company: ${company.name} (${company.ticker})\n`);
  
  // Get recent 10-Q filing
  const { data: filing, error: filingError } = await supabase
    .from('filings')
    .select('*')
    .eq('company_id', companyId)
    .eq('filing_type', '10-Q')
    .eq('processing_status', 'completed')
    .order('filing_date', { ascending: false })
    .limit(1)
    .single();
  
  if (filingError || !filing) {
    console.error('❌ No 10-Q filing found:', filingError);
    return;
  }
  
  console.log(`✅ Filing: ${filing.filing_type} - ${filing.accession_number}`);
  console.log(`   Period End: ${filing.period_end_date}\n`);
  
  // Try different CapEx concepts
  const capExConcepts = [
    'PaymentsToAcquirePropertyPlantAndEquipment',
    'CapitalExpenditures',
    'PaymentsForPropertyPlantAndEquipment',
    'PurchasesOfPropertyPlantAndEquipment',
    'CapitalExpendituresIncurredButNotYetPaid',
    'ProceedsFromSaleOfPropertyPlantAndEquipment',
    'PaymentsToAcquireAssets',
    'PaymentsForInvestmentsInPropertyPlantAndEquipment',
  ];
  
  console.log('🔍 Checking SEC XBRL API for CapEx concepts...\n');
  
  for (const concept of capExConcepts) {
    try {
      const url = `https://data.sec.gov/api/xbrl/companyconcept/CIK${company.cik.padStart(10, '0')}/us-gaap/${concept}.json`;
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'BullPen Financial App (your-email@example.com)',
          'Accept': 'application/json',
        },
      });
      
      if (response.ok) {
        const data = await response.json();
        const units = data.units || {};
        
        // Check for USD or USD/shares units
        const usdUnits = units['USD'] || units['USD/shares'] || [];
        
        if (usdUnits.length > 0) {
          console.log(`✅ Found concept: ${concept}`);
          console.log(`   Units: ${Object.keys(units).join(', ')}`);
          console.log(`   Data points: ${usdUnits.length}`);
          
          // Find the most recent quarterly entry
          const quarterly = usdUnits.filter((u: any) => 
            u.form === '10-Q' && u.end === filing.period_end_date
          );
          
          if (quarterly.length > 0) {
            console.log(`   ⭐ MATCHES filing period (${filing.period_end_date}):`);
            quarterly.forEach((u: any) => {
              console.log(`      Value: ${u.val} ${u.unit || 'USD'}`);
              console.log(`      Form: ${u.form}, End: ${u.end}`);
            });
          } else {
            console.log(`   ⚠️  No exact period match, but concept exists`);
            // Show recent entries
            const recent = usdUnits
              .filter((u: any) => u.form === '10-Q')
              .sort((a: any, b: any) => b.end.localeCompare(a.end))
              .slice(0, 3);
            
            if (recent.length > 0) {
              console.log(`   Recent 10-Q entries:`);
              recent.forEach((u: any) => {
                console.log(`      ${u.end}: ${u.val} ${u.unit || 'USD'}`);
              });
            }
          }
          console.log('');
        } else {
          console.log(`❌ Concept exists but no USD units: ${concept}`);
        }
      } else if (response.status === 404) {
        console.log(`❌ Concept not found: ${concept}`);
      } else {
        console.log(`⚠️  Error checking ${concept}: ${response.status} ${response.statusText}`);
      }
      
      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 200));
    } catch (error) {
      console.error(`❌ Error checking ${concept}:`, error);
    }
  }
  
  console.log('\n📋 SUMMARY:\n');
  console.log('Checked common CapEx XBRL concepts. If none match, we may need to:');
  console.log('1. Check the actual filing XBRL data for the concept name used');
  console.log('2. Add alternative concept mappings');
  console.log('3. Or extract CapEx from the cash flow statement text');
}

main().catch(console.error);
