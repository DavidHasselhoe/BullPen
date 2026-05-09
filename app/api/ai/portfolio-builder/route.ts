import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { withAuth } from '@/lib/security/api-security';
import { checkRateLimit } from '@/lib/security/rate-limiter';
import { PORTFOLIO_BUILDER_SYSTEM_PROMPT } from '@/lib/ai/portfolio-builder/system-prompt';
import {
  parsePortfolio,
  HoldingSchema,
  type Portfolio,
  type PortfolioHolding,
  stripFences,
  extractJsonObject,
} from '@/lib/ai/portfolio-builder/schema';
import { validateTickers } from '@/lib/ai/portfolio-builder/validate-tickers';
import { renormalizeAllocations } from '@/lib/ai/portfolio-builder/renormalize';
import { z } from 'zod';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const MODEL = 'claude-sonnet-4-6';

async function handler(
  request: NextRequest,
  _ctx: unknown,
  session: { userId: string }
): Promise<NextResponse> {
  // Per-user rate limit — these are expensive (extended thinking + ~4k output)
  const limit = await checkRateLimit(`portfolio-builder:${session.userId}`, {
    windowMs: 60_000,
    maxRequests: 5,
  });
  if (!limit.allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded. Please try again in a minute.' }, { status: 429 });
  }

  // Parse body
  let thesis: string;
  try {
    const body = await request.json();
    thesis = String(body.thesis ?? '').trim();
    if (thesis.length < 10 || thesis.length > 500) {
      throw new Error('thesis must be 10-500 characters');
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Invalid request body' },
      { status: 400 }
    );
  }

  const encoder = new TextEncoder();

  const readable = new ReadableStream({
    async start(controller) {
      const send = (obj: Record<string, unknown>) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

      let buffered = '';

      try {
        send({ type: 'started' });

        const stream = anthropic.messages.stream({
          model: MODEL,
          max_tokens: 4096,
          thinking: { type: 'enabled', budget_tokens: 8000 },
          system: [
            {
              type: 'text',
              text: PORTFOLIO_BUILDER_SYSTEM_PROMPT,
              cache_control: { type: 'ephemeral' },
            },
          ],
          messages: [{ role: 'user', content: thesis }],
        });

        // Stream the model's reasoning trace (engaging to watch); buffer the JSON output silently
        // so we can parse it after stream completes. Anthropic emits thinking blocks first, then
        // text blocks, so the user sees a natural "analysis → result" arc.
        for await (const event of stream) {
          if (event.type === 'content_block_delta') {
            const delta = event.delta as { type: string; text?: string; thinking?: string };
            if (delta.type === 'thinking_delta' && delta.thinking) {
              send({ type: 'thinking', delta: delta.thinking });
            } else if (delta.type === 'text_delta' && delta.text) {
              buffered += delta.text;
              // Heartbeat so the client knows we've moved past thinking into structured output
              send({ type: 'composing' });
            }
          }
        }

        // Parse + validate the JSON
        let portfolio: Portfolio;
        try {
          portfolio = parsePortfolio(buffered);
        } catch (parseErr) {
          if (process.env.NODE_ENV === 'development') {
            console.error('[portfolio-builder] parse failed:', parseErr, '\n\nraw:\n', buffered);
          }
          send({
            type: 'error',
            code: 'parse_failed',
            message: 'The model returned an unexpected response. Please try again.',
          });
          return;
        }

        send({ type: 'validating' });

        // Verify every ticker exists; ask the model to substitute the rest
        const initialCheck = await validateTickers(portfolio.holdings);
        let validHoldings = initialCheck.validHoldings;
        let logoMap = initialCheck.logoMap;
        const invalidTickers = initialCheck.invalidTickers;
        const replacedTickers: string[] = [];

        if (invalidTickers.length > 0 && validHoldings.length > 0) {
          const replacements = await requestReplacements({
            previousAssistantTurn: buffered,
            invalidTickers,
            thesis,
          });

          if (replacements.length > 0) {
            const reCheck = await validateTickers(replacements);
            replacedTickers.push(...invalidTickers.filter((t) => !reCheck.invalidTickers.includes(t)));
            validHoldings = [...validHoldings, ...reCheck.validHoldings];
            logoMap = { ...logoMap, ...reCheck.logoMap };
          } else {
            replacedTickers.push(...invalidTickers);
          }
        } else if (invalidTickers.length > 0) {
          // No valid holdings to anchor a retry — drop and continue
          replacedTickers.push(...invalidTickers);
        }

        if (validHoldings.length < 3) {
          send({
            type: 'error',
            code: 'too_few_valid_tickers',
            message: 'Could not assemble enough verified tickers for this thesis. Try rephrasing.',
          });
          return;
        }

        // Final renormalization so allocations always sum to exactly 100
        const finalHoldings = renormalizeAllocations(validHoldings);

        const finalPortfolio = {
          ...portfolio,
          holdings: finalHoldings,
        };

        send({
          type: 'done',
          portfolio: finalPortfolio,
          logoMap,
          replacedTickers,
        });
      } catch (err) {
        if (process.env.NODE_ENV === 'development') {
          console.error('[portfolio-builder] Anthropic error:', err);
        }
        const status = (err as { status?: number })?.status;
        const code =
          status === 401
            ? 'invalid_key'
            : status === 402 || (err instanceof Error && err.message.includes('credit'))
            ? 'payment_required'
            : status === 429
            ? 'rate_limited'
            : 'unknown';
        send({
          type: 'error',
          code,
          message: err instanceof Error ? err.message : 'Unknown error',
        });
      } finally {
        controller.close();
      }
    },
  });

  return new NextResponse(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}

/**
 * Follow-up Claude call: feed the prior assistant response back along with the list of
 * invalid tickers and ask for substitutes. Non-streaming — we just need the JSON.
 */
async function requestReplacements({
  previousAssistantTurn,
  invalidTickers,
  thesis,
}: {
  previousAssistantTurn: string;
  invalidTickers: string[];
  thesis: string;
}): Promise<PortfolioHolding[]> {
  try {
    const result = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1500,
      system: [
        {
          type: 'text',
          text: PORTFOLIO_BUILDER_SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [
        { role: 'user', content: thesis },
        { role: 'assistant', content: previousAssistantTurn },
        {
          role: 'user',
          content: `Holdings ${invalidTickers.join(', ')} are not valid US-listed tickers (verify against NYSE/NASDAQ). Replace each with a real, liquid alternative that fills the same role and subsector exposure in the portfolio.

Return ONLY a JSON array (no other fields, no fences) of replacement holdings, one per invalid ticker, each matching the original holding schema:
[{ "ticker", "company", "exchange", "sector", "subsector_exposure", "allocation_pct", "role", "rationale", "thesis_exposure_score", "key_risk", "risk_level" }]`,
        },
      ],
    });

    const textBlock = result.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') return [];

    const cleaned = stripFences(textBlock.text);
    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      // Recover by extracting the first array
      const arrStart = cleaned.indexOf('[');
      const arrEnd = cleaned.lastIndexOf(']');
      if (arrStart === -1 || arrEnd === -1) {
        // Last-ditch: maybe the model returned a wrapped object
        parsed = JSON.parse(extractJsonObject(cleaned));
      } else {
        parsed = JSON.parse(cleaned.slice(arrStart, arrEnd + 1));
      }
    }

    const arraySchema = z.array(HoldingSchema);
    return arraySchema.parse(parsed);
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.error('[portfolio-builder] replacement request failed:', err);
    }
    return [];
  }
}

export type { Portfolio, PortfolioHolding };

export const POST = withAuth(handler);
