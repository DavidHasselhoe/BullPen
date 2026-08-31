import Anthropic from '@anthropic-ai/sdk';
import type { GridProfile } from './profile-grid';
import type { DecodeResult } from './types';
import { MAPPING_SYSTEM_PROMPT, buildMappingUserPrompt } from './mapping-prompt';
import { MappingSpecError, parseMappingSpec, type MappingSpec } from './mapping-schema';
import { heuristicMapping } from './heuristic-mapping';

const HAIKU_MODEL = 'claude-haiku-4-5-20251001';
const SONNET_MODEL = 'claude-sonnet-4-6';
const CONFIDENCE_ESCALATION_THRESHOLD = 0.6;

let _anthropic: Anthropic | null = null;
function getAnthropic(): Anthropic {
  if (!_anthropic) _anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return _anthropic;
}

export interface InferMappingResult {
  spec: MappingSpec;
  source: 'ai' | 'heuristic';
  model: string | null;
  inputTokens: number;
  outputTokens: number;
  attempts: number;
}

interface ModelCallResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
}

async function callModel(model: string, userPrompt: string, priorError?: string): Promise<ModelCallResult> {
  const anthropic = getAnthropic();
  const fullUserPrompt = priorError
    ? `${userPrompt}\n\nYour previous answer was rejected for this reason, fix it: ${priorError}`
    : userPrompt;

  const result = await anthropic.messages.create({
    model,
    max_tokens: 2000,
    system: MAPPING_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: fullUserPrompt }],
  });

  const textBlock = result.content.find((b): b is Anthropic.TextBlock => b.type === 'text');
  return {
    text: textBlock?.text ?? '',
    inputTokens: result.usage.input_tokens,
    outputTokens: result.usage.output_tokens,
  };
}

/**
 * Infers the column-mapping spec for a transaction file. This is a small,
 * cheap, structural call (schema mapping, not row-by-row extraction), with
 * a two-step escalation ladder: Haiku first, and only on a validation
 * failure or low self-reported confidence, one retry on Sonnet with the
 * specific rejection reason appended. Two cheap attempts beat one expensive
 * one for a task this structural.
 */
export async function inferMappingSpec(
  fileName: string,
  decode: DecodeResult,
  delimiter: string,
  profile: GridProfile,
  distinctTypeValues: string[],
  opts?: { useAi?: boolean }
): Promise<InferMappingResult> {
  if (opts?.useAi === false || !process.env.ANTHROPIC_API_KEY) {
    return { spec: heuristicMapping(profile, distinctTypeValues), source: 'heuristic', model: null, inputTokens: 0, outputTokens: 0, attempts: 0 };
  }

  const userPrompt = buildMappingUserPrompt(fileName, decode, delimiter, profile);
  const models = [HAIKU_MODEL, SONNET_MODEL];
  let inputTokens = 0;
  let outputTokens = 0;
  let priorError: string | undefined;

  for (let attempt = 0; attempt < models.length; attempt++) {
    const model = models[attempt];
    try {
      const { text, inputTokens: inTok, outputTokens: outTok } = await callModel(model, userPrompt, priorError);
      inputTokens += inTok;
      outputTokens += outTok;

      const spec = parseMappingSpec(text, profile.columns.length, distinctTypeValues);
      const isLastAttempt = attempt === models.length - 1;
      if (spec.confidence < CONFIDENCE_ESCALATION_THRESHOLD && !isLastAttempt) {
        priorError = `confidence too low (${spec.confidence}) — re-examine the column mapping carefully`;
        continue;
      }
      return { spec, source: 'ai', model, inputTokens, outputTokens, attempts: attempt + 1 };
    } catch (err) {
      priorError = err instanceof MappingSpecError ? err.message : err instanceof Error ? err.message : String(err);
      if (attempt === models.length - 1) {
        // Every model attempt failed — fall back to the deterministic
        // heuristic rather than blocking the import entirely.
        console.error('[import] AI mapping failed on every model, falling back to heuristic:', priorError);
        return { spec: heuristicMapping(profile, distinctTypeValues), source: 'heuristic', model: null, inputTokens, outputTokens, attempts: attempt + 1 };
      }
    }
  }

  // Unreachable — the loop above always returns.
  return { spec: heuristicMapping(profile, distinctTypeValues), source: 'heuristic', model: null, inputTokens, outputTokens, attempts: models.length };
}
