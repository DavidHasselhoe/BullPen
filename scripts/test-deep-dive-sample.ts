/**
 * The Deep Dive paywall's sample report still matches the report schema and
 * carries nobody's portfolio fit.
 *   npx tsx scripts/test-deep-dive-sample.ts
 */
import assert from 'node:assert/strict';
import { ModelReportSchema } from '@/lib/ai/deep-dive/schema';
import { DEEP_DIVE_SAMPLE } from '@/lib/billing/deep-dive-sample';

ModelReportSchema.parse(DEEP_DIVE_SAMPLE);
assert.equal('portfolioFit' in DEEP_DIVE_SAMPLE, false, 'sample must not carry a portfolio fit');
assert.ok(DEEP_DIVE_SAMPLE.verdict.threeThings, 'sample needs threeThings, the page shows them');
assert.ok(DEEP_DIVE_SAMPLE.companyName && DEEP_DIVE_SAMPLE.generatedAt, 'the label needs company and date');
console.log('✓ deep dive sample report is valid');
