// Script to populate investing_quotes table from scraped content
// Run with: tsx scripts/populate-investing-quotes.ts

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  console.error('Please ensure your .env.local file contains:');
  console.error('  NEXT_PUBLIC_SUPABASE_URL=your_url');
  console.error('  SUPABASE_SERVICE_ROLE_KEY=your_service_role_key');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface Quote {
  quote_text: string;
  author: string;
  category: string;
  source_url: string;
}

// Quotes extracted from https://deliberatedirections.com/investing-quotes/
const quotes: Quote[] = [
  // Risk and Loss
  { quote_text: "Rule No. 1: Never lose money. Rule No. 2: Never forget rule No.1.", author: "Warren Buffett", category: "risk", source_url: "https://deliberatedirections.com/investing-quotes/" },
  { quote_text: "Risk comes from not knowing what you're doing.", author: "Warren Buffett", category: "risk", source_url: "https://deliberatedirections.com/investing-quotes/" },
  { quote_text: "Unless you can watch your stock holding decline by 50% without becoming panic-stricken, you should not be in the stock market.", author: "Warren Buffett", category: "risk", source_url: "https://deliberatedirections.com/investing-quotes/" },
  { quote_text: "You shouldn't own common stocks if a 50% decrease in their value in a short period of time would cause you acute distress.", author: "Warren Buffett", category: "risk", source_url: "https://deliberatedirections.com/investing-quotes/" },
  { quote_text: "Activity is the enemy of investment returns.", author: "Warren Buffett", category: "risk", source_url: "https://deliberatedirections.com/investing-quotes/" },
  { quote_text: "Calling someone who trades actively in the market an investor is like calling someone who repeatedly engages in one-night stands a romantic.", author: "Warren Buffett", category: "risk", source_url: "https://deliberatedirections.com/investing-quotes/" },
  { quote_text: "It takes character to sit with all that cash and to do nothing.", author: "Charlie Munger", category: "patience", source_url: "https://deliberatedirections.com/investing-quotes/" },
  { quote_text: "The first rule of compounding: Never interrupt it unnecessarily.", author: "Charlie Munger", category: "patience", source_url: "https://deliberatedirections.com/investing-quotes/" },
  { quote_text: "The single greatest edge an investor can have is a long-term orientation.", author: "Seth Klarman", category: "patience", source_url: "https://deliberatedirections.com/investing-quotes/" },
  { quote_text: "You must buy on the way down.", author: "Seth Klarman", category: "risk", source_url: "https://deliberatedirections.com/investing-quotes/" },
  { quote_text: "It's not whether you're right or wrong that's important, but how much money you make when you're right and how much you lose when you're wrong.", author: "George Soros", category: "strategy", source_url: "https://deliberatedirections.com/investing-quotes/" },
  { quote_text: "There is no point in being confident and having a small position.", author: "George Soros", category: "strategy", source_url: "https://deliberatedirections.com/investing-quotes/" },
  { quote_text: "Minimizing downside risk while maximizing the upside is a powerful concept.", author: "Mohnish Pabrai", category: "risk", source_url: "https://deliberatedirections.com/investing-quotes/" },
  { quote_text: "Everyone has the brainpower to make money in stocks. Not everyone has the stomach.", author: "Peter Lynch", category: "risk", source_url: "https://deliberatedirections.com/investing-quotes/" },
  { quote_text: "The two greatest enemies of the equity fund investor are expenses and emotions.", author: "John Bogle", category: "risk", source_url: "https://deliberatedirections.com/investing-quotes/" },
  { quote_text: "Being a value investor means you look at the downside before looking at the upside.", author: "Li Lu", category: "value_investing", source_url: "https://deliberatedirections.com/investing-quotes/" },
  { quote_text: "Never invest in a business you cannot understand.", author: "Warren Buffett", category: "strategy", source_url: "https://deliberatedirections.com/investing-quotes/" },
  
  // Patience and Discipline
  { quote_text: "The stock market is a device for transferring money from the impatient to the patient.", author: "Warren Buffett", category: "patience", source_url: "https://deliberatedirections.com/investing-quotes/" },
  { quote_text: "Only buy something that you'd be perfectly happy to hold if the market shut down for 10 years.", author: "Warren Buffett", category: "patience", source_url: "https://deliberatedirections.com/investing-quotes/" },
  { quote_text: "Our favorite holding period is forever.", author: "Warren Buffett", category: "patience", source_url: "https://deliberatedirections.com/investing-quotes/" },
  { quote_text: "If you aren't willing to own a stock for 10 years, don't even think about owning it for 10 minutes.", author: "Warren Buffett", category: "patience", source_url: "https://deliberatedirections.com/investing-quotes/" },
  { quote_text: "Most people get interested in stocks when everyone else is. The time to get interested is when no one else is.", author: "Warren Buffett", category: "market_behavior", source_url: "https://deliberatedirections.com/investing-quotes/" },
  { quote_text: "The big money is not in the buying and selling, but in the waiting.", author: "Charlie Munger", category: "patience", source_url: "https://deliberatedirections.com/investing-quotes/" },
  { quote_text: "Waiting helps you as an investor and a lot of people just can't stand to wait.", author: "Charlie Munger", category: "patience", source_url: "https://deliberatedirections.com/investing-quotes/" },
  { quote_text: "Assume life will be really tough, and then ask if you can handle it. If the answer is yes, you've won.", author: "Charlie Munger", category: "strategy", source_url: "https://deliberatedirections.com/investing-quotes/" },
  { quote_text: "You have to let the big ones make up for your mistakes.", author: "Peter Lynch", category: "strategy", source_url: "https://deliberatedirections.com/investing-quotes/" },
  { quote_text: "You can lose money very fast, in two months, but you very rarely make money very fast in the stock market.", author: "Peter Lynch", category: "patience", source_url: "https://deliberatedirections.com/investing-quotes/" },
  { quote_text: "To achieve satisfactory investment results is easier than most people realize; to achieve superior results is harder than it looks.", author: "Benjamin Graham", category: "strategy", source_url: "https://deliberatedirections.com/investing-quotes/" },
  { quote_text: "The longer you can extend your time horizon the less competitive the game becomes.", author: "Howard Marks", category: "patience", source_url: "https://deliberatedirections.com/investing-quotes/" },
  { quote_text: "Time is your friend, impulse is your enemy.", author: "John Bogle", category: "patience", source_url: "https://deliberatedirections.com/investing-quotes/" },
  { quote_text: "The time component of compounding is why 99% of Warren Buffett's net worth came after his 50th birthday.", author: "Morgan Housel", category: "patience", source_url: "https://deliberatedirections.com/investing-quotes/" },
  { quote_text: "Patience is not passive; it is concentrated strength.", author: "Bruce Lee", category: "patience", source_url: "https://deliberatedirections.com/investing-quotes/" },
  { quote_text: "Discipline is remembering what you want.", author: "David Campbell", category: "patience", source_url: "https://deliberatedirections.com/investing-quotes/" },
  
  // Market Behavior
  { quote_text: "Be fearful when others are greedy. Be greedy when others are fearful.", author: "Warren Buffett", category: "market_behavior", source_url: "https://deliberatedirections.com/investing-quotes/" },
  { quote_text: "Look at market fluctuations as your friend rather than your enemy. Profit from folly rather than participate in it.", author: "Warren Buffett", category: "market_behavior", source_url: "https://deliberatedirections.com/investing-quotes/" },
  { quote_text: "Remember that the stock market is a manic depressive.", author: "Warren Buffett", category: "market_behavior", source_url: "https://deliberatedirections.com/investing-quotes/" },
  { quote_text: "In the short run, the market is a voting machine, but in the long run, it is a weighing machine.", author: "Benjamin Graham", category: "market_behavior", source_url: "https://deliberatedirections.com/investing-quotes/" },
  { quote_text: "Far more money has been lost by investors preparing for corrections, or trying to anticipate corrections, than has been lost in corrections themselves.", author: "Peter Lynch", category: "market_behavior", source_url: "https://deliberatedirections.com/investing-quotes/" },
  { quote_text: "The stock market is the story of cycles and of the human behavior that is responsible for overreactions in both directions.", author: "Seth Klarman", category: "market_behavior", source_url: "https://deliberatedirections.com/investing-quotes/" },
  { quote_text: "I think markets will never be efficient because of human nature.", author: "Seth Klarman", category: "market_behavior", source_url: "https://deliberatedirections.com/investing-quotes/" },
  { quote_text: "Successful investing is anticipating the anticipations of others.", author: "Howard Marks", category: "market_behavior", source_url: "https://deliberatedirections.com/investing-quotes/" },
  { quote_text: "If investing is entertaining, if you're having fun, you're probably not making money. Good investing is boring.", author: "George Soros", category: "market_behavior", source_url: "https://deliberatedirections.com/investing-quotes/" },
  { quote_text: "I'm only rich because I know when I'm wrong… I basically have survived by recognizing my mistakes.", author: "George Soros", category: "strategy", source_url: "https://deliberatedirections.com/investing-quotes/" },
  { quote_text: "Markets can remain irrational longer than you can remain solvent.", author: "John Maynard Keynes", category: "market_behavior", source_url: "https://deliberatedirections.com/investing-quotes/" },
  { quote_text: "Bull markets are born on pessimism, grow on skepticism, mature on optimism, and die on euphoria.", author: "Sir John Templeton", category: "market_behavior", source_url: "https://deliberatedirections.com/investing-quotes/" },
  { quote_text: "You make most of your money in a bear market, you just don't realize it at the time.", author: "Shelby Cullom Davis", category: "market_behavior", source_url: "https://deliberatedirections.com/investing-quotes/" },
  
  // Value Investing
  { quote_text: "Price is what you pay. Value is what you get.", author: "Warren Buffett", category: "value_investing", source_url: "https://deliberatedirections.com/investing-quotes/" },
  { quote_text: "It's far better to buy a wonderful company at a fair price than a fair company at a wonderful price.", author: "Warren Buffett", category: "value_investing", source_url: "https://deliberatedirections.com/investing-quotes/" },
  { quote_text: "If a business does well, the stock eventually follows.", author: "Warren Buffett", category: "value_investing", source_url: "https://deliberatedirections.com/investing-quotes/" },
  { quote_text: "The three most important words in investing are margin of safety.", author: "Warren Buffett", category: "value_investing", source_url: "https://deliberatedirections.com/investing-quotes/" },
  { quote_text: "Buy a stock the way you would buy a house. Understand and like it such that you'd be content to own it in the absence of any market.", author: "Warren Buffett", category: "value_investing", source_url: "https://deliberatedirections.com/investing-quotes/" },
  { quote_text: "All intelligent investing is value investing. Acquiring more than you are paying for. You must value the business in order to value the stock.", author: "Charlie Munger", category: "value_investing", source_url: "https://deliberatedirections.com/investing-quotes/" },
  
  // Strategy and Decision-Making
  { quote_text: "Should you find yourself in a chronically leaking boat, energy devoted to changing vessels is likely to be more productive than energy devoted to patching leaks.", author: "Warren Buffett", category: "strategy", source_url: "https://deliberatedirections.com/investing-quotes/" },
  { quote_text: "I make no attempt to forecast the market—my efforts are devoted to finding undervalued securities.", author: "Warren Buffett", category: "strategy", source_url: "https://deliberatedirections.com/investing-quotes/" },
  { quote_text: "We have three baskets for investing: yes, no, and too tough to understand.", author: "Charlie Munger", category: "strategy", source_url: "https://deliberatedirections.com/investing-quotes/" },
  { quote_text: "Our job is to find a few intelligent things to do, not to keep up with every damn thing in the world.", author: "Charlie Munger", category: "strategy", source_url: "https://deliberatedirections.com/investing-quotes/" },
  { quote_text: "Know what you own, and know why you own it.", author: "Peter Lynch", category: "strategy", source_url: "https://deliberatedirections.com/investing-quotes/" },
  { quote_text: "Never invest in a company without understanding its finances.", author: "Peter Lynch", category: "strategy", source_url: "https://deliberatedirections.com/investing-quotes/" },
  { quote_text: "I'm not better than the next trader, just quicker at admitting my mistakes and moving on to the next opportunity.", author: "George Soros", category: "strategy", source_url: "https://deliberatedirections.com/investing-quotes/" },
  { quote_text: "Buying's easier, selling's hard – it's hard to know when to get out.", author: "Seth Klarman", category: "strategy", source_url: "https://deliberatedirections.com/investing-quotes/" },
  { quote_text: "Given a 10% chance of a 100 times payoff, you should take that bet every time.", author: "Jeff Bezos", category: "strategy", source_url: "https://deliberatedirections.com/investing-quotes/" },
  { quote_text: "You can't predict, but you can prepare.", author: "Howard Marks", category: "strategy", source_url: "https://deliberatedirections.com/investing-quotes/" },
  { quote_text: "If you don't study any companies, you have the same success buying stocks as you do in a poker game if you bet without looking at your cards.", author: "Peter Lynch", category: "strategy", source_url: "https://deliberatedirections.com/investing-quotes/" },
  
  // Wealth Building
  { quote_text: "Compound interest is the eighth wonder of the world. He who understands it, earns it. He who doesn't, pays it.", author: "Albert Einstein", category: "wealth_building", source_url: "https://deliberatedirections.com/investing-quotes/" },
  { quote_text: "Wealth is when small efforts produce big results. Poverty is when big efforts produce small results.", author: "Unknown", category: "wealth_building", source_url: "https://deliberatedirections.com/investing-quotes/" },
  { quote_text: "Invest in yourself. Your career is the engine of your wealth.", author: "Paul Clitheroe", category: "wealth_building", source_url: "https://deliberatedirections.com/investing-quotes/" },
  { quote_text: "Earn as much as you can, save as much as you can, invest as much as you can, give as much as you can.", author: "John Wesley", category: "wealth_building", source_url: "https://deliberatedirections.com/investing-quotes/" },
];

async function main() {
  console.log('Starting quote population...');
  
  // Check if quotes already exist
  const { data: existing, error: checkError } = await supabase
    .from('investing_quotes')
    .select('id')
    .limit(1);

  if (checkError) {
    console.error('Error checking existing quotes:', checkError);
    process.exit(1);
  }

  if (existing && existing.length > 0) {
    console.log('Quotes already exist. Skipping population.');
    console.log('To repopulate, delete existing quotes first.');
    process.exit(0);
  }

  // Insert quotes
  const { data, error } = await supabase
    .from('investing_quotes')
    .insert(quotes)
    .select();

  if (error) {
    console.error('Error inserting quotes:', error);
    process.exit(1);
  }

  console.log(`✅ Successfully inserted ${data?.length || 0} quotes!`);
  console.log(`Categories: ${[...new Set(quotes.map(q => q.category))].join(', ')}`);
}

main().catch(console.error);
