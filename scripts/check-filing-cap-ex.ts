// Check filing-specific XBRL data for CapEx
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { createServerClient } from '../lib/supabase/client';

async function main() {
  const companyId = process.argv[2] || '1b09229f-48c1-4427-9d42-ccc27a7d9237';
  
  console.log(`🔍 Checking filing-specific XBRL for CapEx\n`);
  
  const supabase = createServerClient();
  
  // Get company
  const { data: company } = await supabase
    .from('companies')
    .select('*')
    .eq('id', companyId)
    .single();
  
  if (!company) {
    console.error('❌ Company not found');
    return;
  }
  
  // Get recent 10-Q filing
  const { data: filing } = await supabase
    .from('filings')
    .select('*')
    .eq('company_id', companyId)
    .eq('filing_type', '10-Q')
    .eq('processing_status', 'completed')
    .order('filing_date', { ascending: false })
    .limit(1)
    .single();
  
  if (!filing) {
    console.error('❌ No filing found');
    return;
  }
  
  console.log(`✅ Filing: ${filing.filing_type} - ${filing.accession_number}`);
  console.log(`   Period End: ${filing.period_end_date}\n`);
  
  // Fetch filing-specific XBRL data
  const accessionNumber = filing.accession_number;
  const cik = company.cik.padStart(10, '0');
  
  // Convert accession number to path (e.g., 0001045810-25-000230 -> 1045810/25/000230)
  const parts = accessionNumber.split('-');
  if (parts.length !== 3) {
    console.error('❌ Invalid accession number format');
    return;
  }
  
  const path = `${parts[0].substring(1)}/${parts[1]}/${parts[2]}`;
  const xbrlUrl = `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`;
  
  // Try filing-specific XBRL first
  const submissionUrl = `https://data.sec.gov/submissions/CIK${cik}.json`;
  
  console.log(`🔍 Fetching filing-specific XBRL data...\n`);
  
  try {
    // Try to fetch the filing submission to get the exact XBRL path
    const submissionResponse = await fetch(submissionUrl, {
      headers: {
        'User-Agent': 'BullPen Financial App (contact@bullpen.com)',
        'Accept': 'application/json',
      },
    });
    
    if (!submissionResponse.ok) {
      console.error(`❌ Failed to fetch submissions: ${submissionResponse.status}`);
      return;
    }
    
    const submissions = await submissionResponse.json();
    const recentFilings = submissions.filings?.recent || {};
    
    // Find our filing
    const filingIndex = recentFilings.accessionNumber?.findIndex(
      (accn: string) => accn.replace(/-/g, '') === accessionNumber.replace(/-/g, '')
    );
    
    if (filingIndex === -1 || !filingIndex) {
      console.log('⚠️  Filing not found in recent submissions');
      console.log('   Trying direct XBRL fetch...\n');
    } else {
      console.log(`✅ Found filing in submissions at index ${filingIndex}`);
    }
    
    // Try fetching filing-specific XBRL from the submission path
    // The XBRL data should be at: https://data.sec.gov/xbrl/companyfacts/CIK{cik}.json
    // But for filing-specific, we might need: https://data.sec.gov/api/xbrl/frames/us-gaap/{concept}/{period}/{instant}.json
    
    // Instead, let's try the company facts endpoint which has filing-specific data
    const factsUrl = `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`;
    const factsResponse = await fetch(factsUrl, {
      headers: {
        'User-Agent': 'BullPen Financial App (contact@bullpen.com)',
        'Accept': 'application/json',
      },
    });
    
    if (!factsResponse.ok) {
      console.error(`❌ Failed to fetch company facts: ${factsResponse.status}`);
      return;
    }
    
    const facts = await factsResponse.json();
    
    if (!facts.facts || !facts.facts['us-gaap']) {
      console.error('❌ No us-gaap facts found');
      return;
    }
    
    const gaapFacts = facts.facts['us-gaap'];
    
    // Check for CapEx concepts
    const capExConcepts = [
      'PaymentsToAcquirePropertyPlantAndEquipment',
      'CapitalExpenditures',
      'CapitalExpendituresIncurredButNotYetPaid',
    ];
    
    console.log(`📊 Checking CapEx concepts in filing-specific data...\n`);
    
    for (const concept of capExConcepts) {
      const conceptData = gaapFacts[concept];
      
      if (!conceptData) {
        console.log(`❌ Concept not found: ${concept}`);
        continue;
      }
      
      console.log(`✅ Found concept: ${concept}`);
      console.log(`   Label: ${conceptData.label || concept}`);
      
      const units = conceptData.units || {};
      
      if (!units['USD']) {
        console.log(`   ⚠️  No USD units found`);
        console.log(`   Available units: ${Object.keys(units).join(', ')}`);
        continue;
      }
      
      const usdUnits = units['USD'];
      console.log(`   Total data points: ${usdUnits.length}`);
      
      // Find entries matching our filing period
      const matchingEntries = usdUnits.filter((u: any) => {
        const matchesPeriod = u.end === filing.period_end_date;
        const matchesForm = u.form === '10-Q';
        return matchesPeriod && matchesForm;
      });
      
      if (matchingEntries.length > 0) {
        console.log(`   ⭐ MATCHES filing period (${filing.period_end_date}):`);
        matchingEntries.forEach((u: any) => {
          console.log(`      Value: ${u.val} USD`);
          console.log(`      Form: ${u.form}, End: ${u.end}, FP: ${u.fp}`);
          console.log(`      Filed: ${u.filed}`);
          if (u.accn) {
            console.log(`      Accession: ${u.accn}`);
          }
        });
      } else {
        // Find most recent 10-Q entries
        const recentQ = usdUnits
          .filter((u: any) => u.form === '10-Q')
          .sort((a: any, b: any) => b.end.localeCompare(a.end))
          .slice(0, 5);
        
        if (recentQ.length > 0) {
          console.log(`   ⚠️  No exact period match. Recent 10-Q entries:`);
          recentQ.forEach((u: any) => {
            const match = u.end === filing.period_end_date ? '⭐' : '  ';
            console.log(`      ${match} ${u.end}: ${u.val} USD (FP: ${u.fp})`);
            if (u.accn) {
              console.log(`          Accession: ${u.accn}`);
            }
          });
        }
      }
      
      console.log('');
    }
    
    // Check if our filing's accession number appears in any concept
    console.log(`\n🔍 Checking if accession number ${accessionNumber} appears in any CapEx data...\n`);
    
    for (const concept of capExConcepts) {
      const conceptData = gaapFacts[concept];
      if (!conceptData || !conceptData.units || !conceptData.units['USD']) {
        continue;
      }
      
      const matching = conceptData.units['USD'].find((u: any) => 
        u.accn && u.accn.replace(/-/g, '') === accessionNumber.replace(/-/g, '')
      );
      
      if (matching) {
        console.log(`✅ Found accession match in ${concept}:`);
        console.log(`   Value: ${matching.val} USD`);
        console.log(`   Period End: ${matching.end}`);
        console.log(`   Form: ${matching.form}`);
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

main().catch(console.error);
