// SEC Filing Parser
// Extracts structured sections from SEC filing documents (10-K, 10-Q, 8-K)

import type { SectionType } from '../types/database';

/**
 * Parsed section from a filing
 */
export interface ParsedSection {
  type: SectionType;
  name: string;
  content: string;
  order: number;
}

/**
 * Result of parsing a complete filing
 */
export interface ParsedFiling {
  sections: ParsedSection[];
  rawContent: string;
  contentLength: number;
}

/**
 * Section patterns for 10-K filings
 * SEC requires specific "Items" in 10-K filings
 * 
 * Pattern Strategy:
 * - Primary patterns: Standard "ITEM X." format
 * - Secondary patterns: Variations with colons, dashes, parentheses
 * - Tertiary patterns: Fallbacks without "ITEM" prefix
 * - All patterns are case-insensitive and whitespace-tolerant
 */
const SECTION_10K_PATTERNS = [
  {
    type: 'business_overview' as SectionType,
    patterns: [
      // Standard formats: "ITEM 1. BUSINESS" or "ITEM 1 BUSINESS"
      /ITEM\s+1\.?\s+BUSINESS/i,
      /ITEM\s+1\b[^\n]{0,30}BUSINESS/i,
      // With separators: "ITEM 1 - BUSINESS" or "ITEM 1: BUSINESS"
      /ITEM\s+1\s*[:\-—]\s*BUSINESS/i,
      // Table of contents style: "Item 1 Business 10"
      /ITEM\s+1\s+BUSINESS\s+\d+/i,
      // Fallback without "ITEM": Look for isolated "BUSINESS" header
      /^[\s]*BUSINESS[\s]*$/im,
    ],
    name: 'Item 1. Business',
    order: 1,
  },
  {
    type: 'risk_factors' as SectionType,
    patterns: [
      // Standard: "ITEM 1A. RISK FACTORS"
      /ITEM\s+1A\.?\s+RISK\s+FACTORS/i,
      /ITEM\s+1A\b[^\n]{0,30}RISK\s+FACTORS/i,
      // With separators
      /ITEM\s+1A\s*[:\-—]\s*RISK\s+FACTORS/i,
      // Table of contents
      /ITEM\s+1A\s+RISK\s+FACTORS\s+\d+/i,
      // Fallback: Just "RISK FACTORS" on its own line
      /^[\s]*RISK\s+FACTORS[\s]*$/im,
    ],
    name: 'Item 1A. Risk Factors',
    order: 2,
  },
  {
    type: 'legal_proceedings' as SectionType,
    patterns: [
      // Standard: "ITEM 3. LEGAL PROCEEDINGS"
      /ITEM\s+3\.?\s+LEGAL\s+PROCEEDINGS/i,
      /ITEM\s+3\b[^\n]{0,30}LEGAL\s+PROCEEDINGS/i,
      // With separators
      /ITEM\s+3\s*[:\-—]\s*LEGAL\s+PROCEEDINGS/i,
      // Table of contents
      /ITEM\s+3\s+LEGAL\s+PROCEEDINGS\s+\d+/i,
      // Fallback
      /^[\s]*LEGAL\s+PROCEEDINGS[\s]*$/im,
    ],
    name: 'Item 3. Legal Proceedings',
    order: 3,
  },
  {
    type: 'management_discussion_analysis' as SectionType,
    patterns: [
      // Standard: "ITEM 7. MANAGEMENT'S DISCUSSION AND ANALYSIS"
      // Note: Use \s+ for whitespace to handle multiple spaces
      /ITEM\s+7\.?\s+MANAGEMENT[''']?S\s+DISCUSSION\s+AND\s+ANALYSIS/i,
      // More flexible: allows any amount of whitespace and optional punctuation
      /ITEM\s+7[\.\s]+MANAGEMENT[''']?S\s+DISCUSSION/i,
      // Abbreviated: "ITEM 7. MD&A"
      /ITEM\s+7\.?\s+MD\s*&\s*A/i,
      // With separators
      /ITEM\s+7\s*[:\-—]\s*MANAGEMENT[''']?S\s+DISCUSSION/i,
      // Table of contents (with page number)
      /ITEM\s+7\s+MANAGEMENT[''']?S\s+DISCUSSION\s+AND\s+ANALYSIS\s+\d+/i,
      // Fallback: Long form on its own line
      /^[\s]*MANAGEMENT[''']?S\s+DISCUSSION\s+AND\s+ANALYSIS/im,
      // Fallback: Abbreviated
      /^[\s]*MD\s*&\s*A[\s]*$/im,
    ],
    name: 'Item 7. Management\'s Discussion and Analysis',
    order: 7,
  },
  {
    type: 'financial_statements' as SectionType,
    patterns: [
      // Standard: "ITEM 8. FINANCIAL STATEMENTS AND SUPPLEMENTARY DATA"
      /ITEM\s+8\.?\s+FINANCIAL\s+STATEMENTS/i,
      /ITEM\s+8\b[^\n]{0,50}FINANCIAL\s+STATEMENTS/i,
      // With "and supplementary data"
      /ITEM\s+8\.?\s+FINANCIAL\s+STATEMENTS\s+AND\s+SUPPLEMENTARY\s+DATA/i,
      // With separators
      /ITEM\s+8\s*[:\-—]\s*FINANCIAL\s+STATEMENTS/i,
      // Table of contents
      /ITEM\s+8\s+FINANCIAL\s+STATEMENTS\s+\d+/i,
      // Fallback
      /^[\s]*FINANCIAL\s+STATEMENTS[\s]*$/im,
    ],
    name: 'Item 8. Financial Statements',
    order: 8,
  },
  {
    type: 'controls_procedures' as SectionType,
    patterns: [
      // Standard: "ITEM 9A. CONTROLS AND PROCEDURES"
      /ITEM\s+9A\.?\s+CONTROLS\s+AND\s+PROCEDURES/i,
      /ITEM\s+9A\b[^\n]{0,30}CONTROLS\s+AND\s+PROCEDURES/i,
      // With separators
      /ITEM\s+9A\s*[:\-—]\s*CONTROLS\s+AND\s+PROCEDURES/i,
      // Table of contents
      /ITEM\s+9A\s+CONTROLS\s+AND\s+PROCEDURES\s+\d+/i,
      // Fallback
      /^[\s]*CONTROLS\s+AND\s+PROCEDURES[\s]*$/im,
    ],
    name: 'Item 9A. Controls and Procedures',
    order: 9,
  },
];

/**
 * Section patterns for 10-Q filings
 */
/**
 * Section patterns for 20-F filings (foreign private issuer annual reports)
 * 20-F is similar to 10-K but may have slightly different section structure
 */
const SECTION_20F_PATTERNS = [
  {
    type: 'business_overview' as SectionType,
    patterns: [
      // 20-F often uses "Item 4. Information on the Company" or "Item 4.B. Business Overview"
      /ITEM\s+4\.?\s+(?:INFORMATION\s+ON\s+THE\s+COMPANY|BUSINESS\s+OVERVIEW)/i,
      /ITEM\s+4\b[^\n]{0,30}(?:INFORMATION\s+ON\s+THE\s+COMPANY|BUSINESS)/i,
      /ITEM\s+4\s*[:\-—]\s*BUSINESS/i,
      // Fallback: "BUSINESS OVERVIEW" or "BUSINESS DESCRIPTION"
      /^[\s]*BUSINESS\s+(?:OVERVIEW|DESCRIPTION)[\s]*$/im,
    ],
    name: 'Item 4. Business Overview',
    order: 1,
  },
  {
    type: 'risk_factors' as SectionType,
    patterns: [
      // 20-F uses "Item 3.D. Risk Factors" or "Item 4. Risk Factors"
      /ITEM\s+(?:3\.?\s*D\.?|4\.?)\s*RISK\s+FACTORS/i,
      /ITEM\s+(?:3\.?\s*D|4)\b[^\n]{0,30}RISK\s+FACTORS/i,
      /ITEM\s+3\.?\s*D\.?\s*RISK\s+FACTORS/i,
      // Fallback
      /^[\s]*RISK\s+FACTORS[\s]*$/im,
    ],
    name: 'Item 3.D. / Item 4. Risk Factors',
    order: 2,
  },
  {
    type: 'management_discussion_analysis' as SectionType,
    patterns: [
      // 20-F uses "Item 5. Operating and Financial Review and Prospects" (MD&A equivalent)
      /ITEM\s+5\.?\s+OPERATING\s+AND\s+FINANCIAL\s+REVIEW/i,
      /ITEM\s+5\b[^\n]{0,30}OPERATING\s+AND\s+FINANCIAL/i,
      /ITEM\s+5\s*[:\-—]\s*OPERATING/i,
      // Fallback: Look for "Operating and Financial Review"
      /OPERATING\s+AND\s+FINANCIAL\s+REVIEW/i,
    ],
    name: 'Item 5. Operating and Financial Review',
    order: 3,
  },
  {
    type: 'financial_statements' as SectionType,
    patterns: [
      // 20-F uses "Item 18. Financial Statements"
      /ITEM\s+18\.?\s+FINANCIAL\s+STATEMENTS/i,
      /ITEM\s+18\b[^\n]{0,30}FINANCIAL\s+STATEMENTS/i,
      /ITEM\s+18\s*[:\-—]\s*FINANCIAL/i,
      // Fallback
      /CONSOLIDATED\s+FINANCIAL\s+STATEMENTS/i,
    ],
    name: 'Item 18. Financial Statements',
    order: 4,
  },
];

/**
 * Section patterns for 6-K filings (foreign private issuer current reports)
 * 6-K filings are varied - often earnings releases, press releases, etc.
 * Sections depend on content - may not have standard structure
 */
const SECTION_6K_PATTERNS = [
  {
    type: 'business_overview' as SectionType,
    patterns: [
      // 6-K may have "Item 1. Information Contained in this Form 6-K Report"
      /ITEM\s+1\.?\s+INFORMATION/i,
      /ITEM\s+1\b[^\n]{0,30}INFORMATION/i,
      // Look for earnings release content (often in exhibits)
      /(?:QUARTERLY|EARNINGS)\s+(?:RESULTS?|REPORT|RELEASE)/i,
      // Fallback: "INFORMATION" or "REPORT" headers
      /^[\s]*INFORMATION\s+CONTAINED[\s]*$/im,
    ],
    name: 'Item 1. Information / Earnings Release',
    order: 1,
  },
  {
    type: 'management_discussion_analysis' as SectionType,
    patterns: [
      // 6-K may contain financial discussion in earnings releases
      /MANAGEMENT['\']?S?\s+(?:DISCUSSION|COMMENTARY)/i,
      /FINANCIAL\s+(?:RESULTS?|DISCUSSION|COMMENTARY)/i,
      /OPERATING\s+(?:RESULTS?|REVIEW)/i,
      // Look for "Three months ended" or "Quarter ended" sections
      /(?:THREE|3)\s+MONTHS?\s+ENDED[\s\S]{0,200}(?:REVENUE|NET\s+INCOME|OPERATING)/i,
    ],
    name: 'Financial Discussion / MD&A',
    order: 2,
  },
  {
    type: 'financial_statements' as SectionType,
    patterns: [
      // 6-K earnings releases often contain condensed financial statements
      /(?:CONDENSED|UNAUDITED)\s+(?:CONSOLIDATED\s+)?FINANCIAL\s+STATEMENTS/i,
      /(?:CONSOLIDATED\s+)?STATEMENTS?\s+OF\s+(?:INCOME|OPERATIONS|EARNINGS)/i,
      /(?:CONSOLIDATED\s+)?BALANCE\s+SHEET/i,
      /(?:CONSOLIDATED\s+)?STATEMENTS?\s+OF\s+CASH\s+FLOWS/i,
    ],
    name: 'Condensed Financial Statements',
    order: 3,
  },
];

const SECTION_10Q_PATTERNS = [
  {
    type: 'financial_statements' as SectionType,
    patterns: [
      /ITEM\s+1\.?\s+FINANCIAL\s+STATEMENTS/i,
    ],
    name: 'Item 1. Financial Statements',
    order: 1,
  },
  {
    type: 'management_discussion_analysis' as SectionType,
    patterns: [
      /ITEM\s+2\.?\s+MANAGEMENT[''']S\s+DISCUSSION/i,
      /ITEM\s+2\b[^\n]*?MD&A/i,
    ],
    name: 'Item 2. Management\'s Discussion and Analysis',
    order: 2,
  },
  {
    type: 'risk_factors' as SectionType,
    patterns: [
      /ITEM\s+1A\.?\s+RISK\s+FACTORS/i,
    ],
    name: 'Item 1A. Risk Factors',
    order: 3,
  },
  {
    type: 'legal_proceedings' as SectionType,
    patterns: [
      /ITEM\s+1\.?\s+LEGAL\s+PROCEEDINGS/i,
    ],
    name: 'Item 1. Legal Proceedings',
    order: 4,
  },
  {
    type: 'controls_procedures' as SectionType,
    patterns: [
      /ITEM\s+4\.?\s+CONTROLS\s+AND\s+PROCEDURES/i,
    ],
    name: 'Item 4. Controls and Procedures',
    order: 5,
  },
];

/**
 * Extracts main document from SEC SGML structure
 * SEC filings contain multiple documents; we want the primary 10-K document
 * 
 * Strategy:
 * 1. Find the primary 10-K document in <TEXT> tags
 * 2. Skip past the table of contents
 * 3. Find the start of actual content (PART I or first Item)
 */
function extractMainDocument(content: string): string {
  // Step 1: Extract the main 10-K document from <TEXT> tags
  const patterns = [
    /<DOCUMENT>[\s\S]*?<TYPE>10-K[\s\S]*?<TEXT>([\s\S]*?)<\/TEXT>[\s\S]*?<\/DOCUMENT>/i,
    /<DOCUMENT>[\s\S]*?<TYPE>10-K\/A[\s\S]*?<TEXT>([\s\S]*?)<\/TEXT>[\s\S]*?<\/DOCUMENT>/i,
    /<TEXT>([\s\S]*?)<\/TEXT>/i, // Fallback: first TEXT block
  ];

  let extracted = '';
  for (const pattern of patterns) {
    const match = content.match(pattern);
    if (match && match[1] && match[1].length > 10000) {
      extracted = match[1];
      break;
    }
  }

  if (!extracted) {
    return content; // Fallback to original if extraction failed
  }

  // Step 2: Try to skip past the table of contents
  // Look for "PART I" followed by "Item 1" with substantial text (not just page numbers)
  // TOC has format like "Item 1. Business 5" (page number)
  // Real content has "PART I\n\nItem 1.    Business\n\nCompany Background..."
  
  // Find all occurrences of "PART I"
  const partIPattern = /PART\s+I\b/gi;
  const partIMatches: number[] = [];
  let match;
  while ((match = partIPattern.exec(extracted)) !== null) {
    partIMatches.push(match.index);
  }
  
  // If we found multiple "PART I", the second one is likely after the TOC
  // If only one, use it
  if (partIMatches.length > 1) {
    extracted = extracted.slice(partIMatches[1]);
  } else if (partIMatches.length === 1) {
    extracted = extracted.slice(partIMatches[0]);
  }

  return extracted;
}

/**
 * Removes HTML/XML tags and artifacts while preserving structure
 */
function removeMarkup(content: string): string {
  let cleaned = content;

  // Remove SGML/XML metadata tags (but not content)
  cleaned = cleaned.replace(/<TYPE>[\s\S]*?<\/TYPE>/g, '');
  cleaned = cleaned.replace(/<SEQUENCE>[\s\S]*?<\/SEQUENCE>/g, '');
  cleaned = cleaned.replace(/<FILENAME>[\s\S]*?<\/FILENAME>/g, '');
  cleaned = cleaned.replace(/<DESCRIPTION>[\s\S]*?<\/DESCRIPTION>/g, '');

  // Remove script and style tags with their content
  cleaned = cleaned.replace(/<script[\s\S]*?<\/script>/gi, '');
  cleaned = cleaned.replace(/<style[\s\S]*?<\/style>/gi, '');

  // Replace common block-level HTML tags with newlines to preserve structure
  cleaned = cleaned.replace(/<\/?(?:p|div|br|tr|table|h\d)[\s\S]*?>/gi, '\n');

  // Remove all other HTML/XML tags
  cleaned = cleaned.replace(/<[^>]+>/g, ' ');

  return cleaned;
}

/**
 * Decodes HTML entities to plain text
 */
function decodeHtmlEntities(content: string): string {
  let decoded = content;

  // Common HTML entities
  decoded = decoded.replace(/&nbsp;/g, ' ');
  decoded = decoded.replace(/&amp;/g, '&');
  decoded = decoded.replace(/&lt;/g, '<');
  decoded = decoded.replace(/&gt;/g, '>');
  decoded = decoded.replace(/&quot;/g, '"');
  decoded = decoded.replace(/&#39;/g, "'");
  decoded = decoded.replace(/&apos;/g, "'");
  decoded = decoded.replace(/&mdash;/g, '—');
  decoded = decoded.replace(/&ndash;/g, '–');
  decoded = decoded.replace(/&rsquo;/g, "'");
  decoded = decoded.replace(/&lsquo;/g, "'");

  // Numeric entities (common ones)
  decoded = decoded.replace(/&#(\d+);/g, (match, dec) => {
    return String.fromCharCode(dec);
  });

  return decoded;
}

/**
 * Normalizes whitespace and line breaks for consistent parsing
 */
function normalizeWhitespace(content: string): string {
  let normalized = content;

  // Normalize line endings
  normalized = normalized.replace(/\r\n/g, '\n');
  normalized = normalized.replace(/\r/g, '\n');

  // Convert tabs to spaces
  normalized = normalized.replace(/\t/g, ' ');

  // Collapse multiple spaces (but preserve single newlines)
  normalized = normalized.replace(/ +/g, ' ');

  // Remove spaces at start/end of lines
  normalized = normalized.replace(/^ +/gm, '');
  normalized = normalized.replace(/ +$/gm, '');

  // Normalize excessive blank lines (more than 2 consecutive)
  normalized = normalized.replace(/\n{3,}/g, '\n\n');

  return normalized.trim();
}

/**
 * Cleans raw SEC filing content
 * Multi-step process: extract → remove markup → decode → normalize
 * 
 * Note: extractMainDocument is called per filing type in parse10K/parse10Q/etc
 * This function assumes content is already extracted or doesn't need extraction
 */
function cleanFilingContent(content: string): string {
  // Step 1: Remove HTML/XML markup
  let cleaned = removeMarkup(content);

  // Step 2: Decode HTML entities
  cleaned = decodeHtmlEntities(cleaned);

  // Step 3: Normalize whitespace
  cleaned = normalizeWhitespace(cleaned);

  return cleaned;
}

/**
 * Finds section boundaries in filing content
 * Uses multiple patterns per section, with early exit on first match
 * Sorts results by document position to preserve filing structure
 */
function findSectionBoundaries(
  content: string,
  patterns: typeof SECTION_10K_PATTERNS
): Array<{ type: SectionType; name: string; startIndex: number; order: number }> {
  const boundaries: Array<{ type: SectionType; name: string; startIndex: number; order: number }> = [];
  const seenTypes = new Set<SectionType>();

  // Try each section pattern
  for (const section of patterns) {
    // Skip if we already found this section type
    if (seenTypes.has(section.type)) {
      continue;
    }

    // Try each pattern for this section (in priority order)
    for (const pattern of section.patterns) {
      const match = content.match(pattern);
      if (match && match.index !== undefined) {
        boundaries.push({
          type: section.type,
          name: section.name,
          startIndex: match.index,
          order: section.order,
        });
        seenTypes.add(section.type);
        break; // Found match, no need to try other patterns for this section
      }
    }
  }

  // Sort by position in document (preserves filing structure)
  boundaries.sort((a, b) => a.startIndex - b.startIndex);

  return boundaries;
}

/**
 * Extracts section content between boundaries
 * Removes the section header line and trims whitespace
 */
function extractSectionContent(
  content: string,
  startIndex: number,
  endIndex?: number
): string {
  const sectionContent = endIndex
    ? content.slice(startIndex, endIndex)
    : content.slice(startIndex);

  // Remove the first line (section header) and trim
  const lines = sectionContent.split('\n');
  const contentWithoutHeader = lines.slice(1).join('\n');

  return contentWithoutHeader.trim();
}

/**
 * Parses a 10-K filing into sections
 * 
 * Process:
 * 1. Extract main document from SGML structure
 * 2. Clean and normalize the raw filing content
 * 3. Find section boundaries using regex patterns
 * 4. Extract content between boundaries
 * 5. Filter out sections with insufficient content
 * 6. Return structured sections with metadata
 */
export function parse10K(rawContent: string): ParsedFiling {
  const mainDoc = extractMainDocument(rawContent, '10-K');
  const cleaned = cleanFilingContent(mainDoc);
  const boundaries = findSectionBoundaries(cleaned, SECTION_10K_PATTERNS);

  const sections: ParsedSection[] = [];

  for (let i = 0; i < boundaries.length; i++) {
    const boundary = boundaries[i];
    const nextBoundary = boundaries[i + 1];
    
    const content = extractSectionContent(
      cleaned,
      boundary.startIndex,
      nextBoundary?.startIndex
    );

    // Only include sections with meaningful content
    // Reduced threshold from 500 to 200 to catch shorter but valid sections
    if (content.length > 200) {
      sections.push({
        type: boundary.type,
        name: boundary.name,
        content,
        order: boundary.order,
      });
    }
  }

  return {
    sections,
    rawContent: cleaned,
    contentLength: cleaned.length,
  };
}

/**
 * Parses a 10-Q filing into sections
 */
export function parse10Q(rawContent: string): ParsedFiling {
  const mainDoc = extractMainDocument(rawContent, '10-Q');
  const cleaned = cleanFilingContent(mainDoc);
  const boundaries = findSectionBoundaries(cleaned, SECTION_10Q_PATTERNS);

  const sections: ParsedSection[] = [];

  for (let i = 0; i < boundaries.length; i++) {
    const boundary = boundaries[i];
    const nextBoundary = boundaries[i + 1];
    
    const content = extractSectionContent(
      cleaned,
      boundary.startIndex,
      nextBoundary?.startIndex
    );

    if (content.length > 500) {
      sections.push({
        type: boundary.type,
        name: boundary.name,
        content,
        order: boundary.order,
      });
    }
  }

  return {
    sections,
    rawContent: cleaned,
    contentLength: cleaned.length,
  };
}

/**
 * Parses a 20-F filing into sections
 * 20-F is the foreign private issuer equivalent of 10-K
 */
export function parse20F(rawContent: string): ParsedFiling {
  const mainDoc = extractMainDocument(rawContent, '20-F');
  const cleaned = cleanFilingContent(mainDoc);
  const boundaries = findSectionBoundaries(cleaned, SECTION_20F_PATTERNS);

  const sections: ParsedSection[] = [];

  for (let i = 0; i < boundaries.length; i++) {
    const boundary = boundaries[i];
    const nextBoundary = boundaries[i + 1];
    
    const content = extractSectionContent(
      cleaned,
      boundary.startIndex,
      nextBoundary?.startIndex
    );

    // 20-F sections can be shorter than 10-K, use lower threshold
    if (content.length > 200) {
      sections.push({
        type: boundary.type,
        name: boundary.name,
        content,
        order: boundary.order,
      });
    }
  }

  return {
    sections,
    rawContent: cleaned,
    contentLength: cleaned.length,
  };
}

/**
 * Parses a 6-K filing into sections
 * 6-K filings are varied - often earnings releases, press releases, etc.
 * May not have standard structure, so we use more lenient patterns
 */
export function parse6K(rawContent: string): ParsedFiling {
  const cleaned = cleanFilingContent(rawContent);
  const boundaries = findSectionBoundaries(cleaned, SECTION_6K_PATTERNS);

  const sections: ParsedSection[] = [];

  for (let i = 0; i < boundaries.length; i++) {
    const boundary = boundaries[i];
    const nextBoundary = boundaries[i + 1];
    
    const content = extractSectionContent(
      cleaned,
      boundary.startIndex,
      nextBoundary?.startIndex
    );

    // 6-K sections can be very short (earnings releases), use even lower threshold
    if (content.length > 100) {
      sections.push({
        type: boundary.type,
        name: boundary.name,
        content,
        order: boundary.order,
      });
    }
  }

  // If no structured sections found, try to extract from exhibits
  // 6-K earnings releases are often in EX-99.1, EX-99.2
  if (sections.length === 0) {
    // Look for exhibit content markers
    const exhibitPattern = /<DOCUMENT>[\s\S]*?<TYPE>EX-99\.[\d]+[\s\S]*?<TEXT>([\s\S]*?)<\/TEXT>/gi;
    let exhibitMatch;
    let exhibitOrder = 1;

    while ((exhibitMatch = exhibitPattern.exec(cleaned)) !== null && exhibitOrder <= 3) {
      const exhibitContent = exhibitMatch[1].trim();
      if (exhibitContent.length > 500) {
        // Try to parse exhibit content for financial statements
        const hasFinancials = /(?:REVENUE|NET\s+INCOME|OPERATING|CONSOLIDATED\s+STATEMENTS?)/i.test(exhibitContent);
        sections.push({
          type: hasFinancials ? 'financial_statements' : 'other',
          name: `Exhibit 99.${exhibitOrder} Content`,
          content: exhibitContent,
          order: exhibitOrder,
        });
        exhibitOrder++;
      }
    }
  }

  // If still no sections, return cleaned content as single section
  if (sections.length === 0) {
    return {
      sections: [
        {
          type: 'other',
          name: '6-K Filing Content',
          content: cleaned,
          order: 0,
        },
      ],
      rawContent: cleaned,
      contentLength: cleaned.length,
    };
  }

  return {
    sections,
    rawContent: cleaned,
    contentLength: cleaned.length,
  };
}

/**
 * Parses any filing type (routes to appropriate parser)
 * Supports US forms (10-K, 10-Q) and foreign forms (20-F, 6-K)
 */
export function parseFiling(rawContent: string, filingType: string): ParsedFiling {
  const normalizedType = filingType.toUpperCase().trim();
  
  switch (normalizedType) {
    case '10-K':
    case '10-K/A':
      return parse10K(rawContent);
    case '10-Q':
    case '10-Q/A':
      return parse10Q(rawContent);
    case '20-F':
    case '20-F/A':
      return parse20F(rawContent);
    case '6-K':
      return parse6K(rawContent);
    default:
      // For unsupported types, return raw content as single "other" section
      const cleaned = cleanFilingContent(rawContent);
      return {
        sections: [
          {
            type: 'other',
            name: `${filingType} Filing`,
            content: cleaned,
            order: 0,
          },
        ],
        rawContent: cleaned,
        contentLength: cleaned.length,
      };
  }
}

/**
 * Validates that parsed sections meet minimum requirements
 * 
 * Validation Rules:
 * - HARD ERROR: No sections found (parser completely failed)
 * - WARNING: Content length suspiciously short (may indicate parsing issue)
 * - WARNING: Duplicate section types (same section extracted twice)
 * - WARNING: Very few sections (may indicate missed sections)
 */
export function validateParsedSections(parsed: ParsedFiling): {
  isValid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  // Hard error: No sections found at all
  if (parsed.sections.length === 0) {
    errors.push('No sections found in filing');
  }

  // Warning: Content is very short (but not an error)
  // Reduced from 10,000 to 5,000 since cleaned content is shorter
  if (parsed.contentLength < 5000) {
    errors.push(`Filing content short (${parsed.contentLength} chars) - may indicate parsing issues`);
  }

  // Warning: Very few sections (might have missed some)
  if (parsed.sections.length < 2 && parsed.contentLength > 50000) {
    errors.push(`Only ${parsed.sections.length} section(s) found in large filing - expected more`);
  }

  // Warning: Check for duplicate section types (shouldn't happen with new logic)
  const seenTypes = new Set<string>();
  for (const section of parsed.sections) {
    if (seenTypes.has(section.type)) {
      errors.push(`Duplicate section type found: ${section.type}`);
    }
    seenTypes.add(section.type);
  }

  // Only fail on hard errors (no sections)
  // Warnings are returned but don't fail validation
  const isValid = parsed.sections.length > 0;

  return {
    isValid,
    errors,
  };
}

/**
 * Truncates section content to a maximum length
 * Useful for preview/testing purposes
 */
export function truncateSection(content: string, maxLength: number = 5000): string {
  if (content.length <= maxLength) {
    return content;
  }
  return content.slice(0, maxLength) + '\n\n[Content truncated...]';
}

/**
 * Gets summary statistics about parsed sections
 */
export function getSectionStats(parsed: ParsedFiling): {
  totalSections: number;
  totalLength: number;
  averageLength: number;
  sectionTypes: string[];
} {
  const totalSections = parsed.sections.length;
  const totalLength = parsed.sections.reduce((sum, s) => sum + s.content.length, 0);
  const averageLength = totalSections > 0 ? Math.round(totalLength / totalSections) : 0;
  const sectionTypes = parsed.sections.map(s => s.type);

  return {
    totalSections,
    totalLength,
    averageLength,
    sectionTypes,
  };
}
