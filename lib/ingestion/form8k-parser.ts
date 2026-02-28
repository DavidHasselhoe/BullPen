// Form 8-K Parser
// Extracts items and events from Form 8-K filings

/**
 * Valid 8-K item numbers
 */
export const VALID_8K_ITEMS = [
  '1.01', // Entry into Material Agreement
  '2.02', // Results of Operations and Financial Condition (earnings release)
  '2.03', // Creation of Financial Obligation
  '3.01', // Notice of Delisting or Failure to Satisfy Listing Rule
  '3.02', // Unregistered Sales of Equity Securities
  '5.02', // Departure of Directors or Principal Officers
  '7.01', // Regulation FD Disclosure
  '8.01', // Other Events
] as const;

export type Form8KItem = typeof VALID_8K_ITEMS[number];

/**
 * Result of parsing 8-K items
 */
export interface Parsed8KItems {
  items: Form8KItem[];
  itemContents: Record<Form8KItem, string>;
}

/**
 * Extracts 8-K item numbers from filing content
 * Items are typically listed in the header or table of contents
 */
export function extract8KItems(content: string): Form8KItem[] {
  const items: Form8KItem[] = [];
  const upperContent = content.toUpperCase();

  // Look for item patterns in header/table of contents
  // Pattern: "ITEM 2.02" or "ITEM 2.02." or "2.02"
  for (const item of VALID_8K_ITEMS) {
    const patterns = [
      new RegExp(`ITEM\\s+${item.replace('.', '\\.')}\\.?`, 'i'),
      new RegExp(`\\b${item.replace('.', '\\.')}\\b`, 'i'),
    ];

    for (const pattern of patterns) {
      if (pattern.test(upperContent)) {
        items.push(item);
        break;
      }
    }
  }

  return items;
}

/**
 * Extracts content for a specific 8-K item
 */
export function extract8KItemContent(content: string, item: Form8KItem): string | null {
  // Clean content first
  const cleaned = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Patterns to find item start
  const itemPatterns = [
    new RegExp(`ITEM\\s+${item.replace('.', '\\.')}\\.?\\s*[\\r\\n]`, 'i'),
    new RegExp(`ITEM\\s+${item.replace('.', '\\.')}\\.?\\s*[:\-—]`, 'i'),
  ];

  let itemStartIndex = -1;

  for (const pattern of itemPatterns) {
    const match = cleaned.match(pattern);
    if (match && match.index !== undefined) {
      itemStartIndex = match.index + match[0].length;
      break;
    }
  }

  if (itemStartIndex === -1) {
    return null;
  }

  // Find the next item or end of document
  const remainingContent = cleaned.substring(itemStartIndex);
  
  // Look for next item pattern
  let itemEndIndex = remainingContent.length;
  for (const nextItem of VALID_8K_ITEMS) {
    if (nextItem === item) continue;
    
    const nextItemPattern = new RegExp(`ITEM\\s+${nextItem.replace('.', '\\.')}\\.?`, 'i');
    const nextMatch = remainingContent.match(nextItemPattern);
    if (nextMatch && nextMatch.index !== undefined) {
      itemEndIndex = Math.min(itemEndIndex, nextMatch.index);
    }
  }

  return remainingContent.substring(0, itemEndIndex).trim();
}

/**
 * Parses all 8-K items from filing content
 */
export function parse8KItems(content: string): Parsed8KItems {
  const items = extract8KItems(content);
  const itemContents: Record<string, string> = {};

  for (const item of items) {
    const itemContent = extract8KItemContent(content, item);
    if (itemContent) {
      itemContents[item] = itemContent;
    }
  }

  return {
    items,
    itemContents: itemContents as Record<Form8KItem, string>,
  };
}

/**
 * Validates that an item number is valid
 */
export function isValid8KItem(item: string): item is Form8KItem {
  return VALID_8K_ITEMS.includes(item as Form8KItem);
}
