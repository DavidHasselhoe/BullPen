/**
 * AI Compare Explanation API
 * Generates a short analytical interpretation of a company comparison.
 * Uses existing financial data only — no market/price data.
 */

import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { NextRequest, NextResponse } from 'next/server';

const EXPLAIN_SYSTEM = `You are BullPen AI, a financial research analyst. The user has compared companies using SEC filing data. Your task is to provide a concise, interpretive summary of the key differences—focus on what the numbers mean for business quality and competitive positioning. Do NOT simply repeat numbers. Offer insight: pricing power, margin structure, growth trajectory, capital efficiency, scale advantages. Write 2-4 short paragraphs. Be professional and specific.`;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { context } = body as { context: string };

    if (!context || typeof context !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Missing context' },
        { status: 400 }
      );
    }

    const { text } = await generateText({
      model: openai('gpt-4o'),
      system: EXPLAIN_SYSTEM,
      prompt: `Based on the following company comparison data from SEC filings, provide an analytical explanation of the key differences. Focus on interpretation and insight, not number repetition.\n\n${context}`,
      maxOutputTokens: 600,
    });

    return NextResponse.json({ success: true, explanation: text });
  } catch (err) {
    console.error('[compare-explain]', err);
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'Failed to generate explanation' },
      { status: 500 }
    );
  }
}
