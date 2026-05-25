/**
 * Translate technical errors (HTTP status codes, raw fetch errors, TwelveData /
 * Anthropic / Supabase error messages) into plain English shown to users.
 *
 * Usage:
 *   try { ... } catch (err) { setError(humanizeError(err)); }
 *   <div>{humanizeError(searchError)}</div>
 *
 * Accepts anything — Error, Response, status number, string, or an SSE event
 * payload of shape { type: 'error', message?: string, code?: string }.
 */

interface ErrorShape {
  status?: number;
  message?: string;
  error?: string;
  code?: string;
  name?: string;
}

const RATE_LIMIT_MSG =
  'Live market data is busy right now. Give it about a minute and try again.';
const PLAN_RESTRICTED_MSG =
  'That data point isn’t included on our current data plan.';
const NETWORK_MSG =
  'Couldn’t reach the server. Check your connection and try again.';
const SERVER_MSG =
  'Something went wrong on our end. We’ve been notified — please try again in a moment.';
const NOT_FOUND_MSG =
  'We couldn’t find what you were looking for.';
const AUTH_MSG =
  'You’re not signed in. Please log back in to continue.';
const UPGRADE_MSG =
  'This feature is part of BullPen Pro — upgrade to keep using it.';
const QUOTA_MSG =
  'You’ve hit today’s free limit for this feature. It resets at midnight UTC.';
const TIMEOUT_MSG =
  'The request took too long. Try again in a moment.';
const AI_BUSY_MSG =
  'Our AI is busy right now. Try again in a moment.';

/** Detect substrings indicating common error categories — case-insensitive. */
const MATCHERS: Array<{ test: RegExp; message: string }> = [
  { test: /rate[\s-]?limit|too many requests|429|credits exceeded|quota_exceeded/i, message: RATE_LIMIT_MSG },
  { test: /plan[_\s-]?restricted|enterprise plan|higher plan|not available.*plan/i, message: PLAN_RESTRICTED_MSG },
  { test: /failed to fetch|network|net::|fetch failed|ECONN|ENOTFOUND|DNS/i, message: NETWORK_MSG },
  { test: /upgrade_required|pro[_\s-]?only|payment[_\s-]?required/i, message: UPGRADE_MSG },
  { test: /quota_exceeded|free[_\s-]?quota|daily limit/i, message: QUOTA_MSG },
  { test: /timeout|timed out|aborted/i, message: TIMEOUT_MSG },
  { test: /(claude|anthropic|openai).*(busy|overloaded|529|503)/i, message: AI_BUSY_MSG },
];

function fromStatus(status: number): string | null {
  if (status === 401 || status === 403) return AUTH_MSG;
  if (status === 402) return UPGRADE_MSG;
  if (status === 404) return NOT_FOUND_MSG;
  if (status === 408 || status === 504) return TIMEOUT_MSG;
  if (status === 429) return RATE_LIMIT_MSG;
  if (status === 503 || status === 529) return AI_BUSY_MSG;
  if (status >= 500) return SERVER_MSG;
  return null;
}

function fromMessage(message: string): string | null {
  for (const m of MATCHERS) {
    if (m.test.test(message)) return m.message;
  }
  return null;
}

function isResponseLike(v: unknown): v is { status: number; statusText?: string } {
  return typeof v === 'object' && v !== null && 'status' in v && typeof (v as ErrorShape).status === 'number';
}

/**
 * Returns a plain-English user-facing message for any error-shaped input.
 * Always returns a non-empty string — never `null` or the raw input.
 */
export function humanizeError(input: unknown): string {
  if (input == null) return SERVER_MSG;

  // Plain status code
  if (typeof input === 'number') {
    return fromStatus(input) ?? SERVER_MSG;
  }

  // String error payload
  if (typeof input === 'string') {
    return fromMessage(input) ?? SERVER_MSG;
  }

  // Response or response-like { status, statusText }
  if (isResponseLike(input)) {
    const status = input.status;
    return fromStatus(status) ?? SERVER_MSG;
  }

  // Error / SSE payload / API error envelope
  if (typeof input === 'object') {
    const e = input as ErrorShape;

    // Custom TwelveDataRateLimitError
    if (e.name === 'TwelveDataRateLimitError') return RATE_LIMIT_MSG;

    // Server-side known error codes (we emit these in JSON bodies)
    if (e.code) {
      const msg = fromMessage(e.code);
      if (msg) return msg;
    }

    // Try the `error` envelope field first, then `message`
    const text = (e.error || e.message || '').toString();
    if (text) {
      const msg = fromMessage(text);
      if (msg) return msg;
    }

    // Last resort: status if present
    if (typeof e.status === 'number') {
      return fromStatus(e.status) ?? SERVER_MSG;
    }
  }

  return SERVER_MSG;
}

/**
 * Convenience for catch blocks: parse a fetch Response and return the human
 * message. Reads the JSON body if present so server-side error codes win.
 */
export async function humanizeFetchError(res: Response): Promise<string> {
  try {
    const body = await res.clone().json().catch(() => null);
    if (body && (body.error || body.code || body.message)) {
      return humanizeError({ ...body, status: res.status });
    }
  } catch {
    /* ignore — fall through to status-only */
  }
  return fromStatus(res.status) ?? SERVER_MSG;
}
