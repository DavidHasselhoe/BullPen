// Rate Limiting Utility
// Uses Upstash Redis when configured; falls back to in-memory store for dev.
// In-memory store does NOT share state across serverless instances — configure
// UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN for production.

import type { NextRequest } from 'next/server';

export interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: number;
}

// ── In-memory fallback (per-instance, not shared across serverless) ─────────

interface MemoryRecord {
  count: number;
  resetTime: number;
}

const memoryStore: Record<string, MemoryRecord> = {};

function rateLimitMemory(
  identifier: string,
  options: RateLimitOptions
): RateLimitResult {
  const now = Date.now();
  const { windowMs, maxRequests } = options;

  if (Math.random() < 0.1) {
    Object.keys(memoryStore).forEach((k) => {
      if (memoryStore[k].resetTime < now) delete memoryStore[k];
    });
  }

  const record = memoryStore[identifier];

  if (!record || record.resetTime < now) {
    memoryStore[identifier] = {
      count: 1,
      resetTime: now + windowMs,
    };
    return {
      allowed: true,
      remaining: maxRequests - 1,
      resetTime: now + windowMs,
    };
  }

  if (record.count >= maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetTime: record.resetTime,
    };
  }

  record.count++;
  return {
    allowed: true,
    remaining: maxRequests - record.count,
    resetTime: record.resetTime,
  };
}

// ── Upstash (shared across all serverless instances) ─────────────────────────

function checkRateLimitUpstash(
  identifier: string,
  options: RateLimitOptions
): Promise<RateLimitResult> | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  try {
    const { Ratelimit } = require('@upstash/ratelimit');
    const { Redis } = require('@upstash/redis');

    const windowSeconds = Math.max(1, Math.ceil(options.windowMs / 1000));
    const limiter = new Ratelimit({
      redis: Redis.fromEnv(),
      limiter: Ratelimit.fixedWindow(options.maxRequests, `${windowSeconds} s`),
    });

    return (async () => {
      const result = await limiter.limit(identifier);
      await result.pending; // Ensure Redis write completes (Edge-safe)
      return {
        allowed: result.success,
        remaining: result.remaining,
        resetTime: result.reset * 1000,
      };
    })();
  } catch {
    return null;
  }
}

/**
 * Check rate limit (async). Uses Upstash when UPSTASH_REDIS_REST_URL and
 * UPSTASH_REDIS_REST_TOKEN are set; otherwise in-memory (not shared).
 * Rate limiting is skipped entirely in development — you're the only caller.
 */
export async function checkRateLimit(
  identifier: string,
  options: RateLimitOptions = { windowMs: 60 * 1000, maxRequests: 60 }
): Promise<RateLimitResult> {
  if (process.env.NODE_ENV === 'development') {
    return { allowed: true, remaining: 9999, resetTime: Date.now() + options.windowMs };
  }
  const upstashResult = checkRateLimitUpstash(identifier, options);
  if (upstashResult) {
    return upstashResult;
  }
  return rateLimitMemory(identifier, options);
}

/**
 * Sync in-memory rate limit (for backward compatibility).
 * Prefer checkRateLimit for production — it uses Upstash when configured.
 */
export function rateLimit(
  identifier: string,
  options: RateLimitOptions = { windowMs: 60 * 1000, maxRequests: 60 }
): RateLimitResult {
  return rateLimitMemory(identifier, options);
}

/**
 * Get client identifier from request (IP address).
 * Tries several headers so Vercel / Cloudflare / proxies still identify the real client.
 */
export function getClientIdentifier(request: NextRequest): string {
  const first = (h: string | null) => h?.split(',')[0]?.trim() || '';
  const ip =
    first(request.headers.get('x-forwarded-for')) ||
    first(request.headers.get('x-vercel-forwarded-for')) ||
    first(request.headers.get('cf-connecting-ip')) ||
    first(request.headers.get('x-real-ip'));
  return ip || 'unknown';
}
