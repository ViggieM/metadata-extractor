// ABOUTME: In-memory rate limiting middleware using sliding window algorithm.
// ABOUTME: Limits requests per IP to prevent abuse of the extraction endpoints.

import { getConnInfo } from "@hono/node-server/conninfo";
import { Context, MiddlewareHandler } from "hono";
import { LRUCache } from "lru-cache";

const RATE_LIMIT_REQUESTS = parseInt(
  process.env.RATE_LIMIT_REQUESTS || "5",
  10
);
const RATE_LIMIT_WINDOW_MS = parseInt(
  process.env.RATE_LIMIT_WINDOW_MS || "60000",
  10
);

// Store request timestamps per IP
const rateLimitStore = new LRUCache<string, number[]>({
  max: 10000, // Max IPs to track
  ttl: RATE_LIMIT_WINDOW_MS,
});

function getClientIp(c: Context): string {
  const connInfo = getConnInfo(c);
  return connInfo?.remote?.address || "unknown";
}

export function rateLimiter(): MiddlewareHandler {
  return async (c, next) => {
    const ip = getClientIp(c);
    const now = Date.now();
    const windowStart = now - RATE_LIMIT_WINDOW_MS;

    // Get existing timestamps, filter to current window
    const timestamps = (rateLimitStore.get(ip) || []).filter(
      (t) => t > windowStart
    );

    if (timestamps.length >= RATE_LIMIT_REQUESTS) {
      const oldestInWindow = Math.min(...timestamps);
      const retryAfter = Math.ceil(
        (oldestInWindow + RATE_LIMIT_WINDOW_MS - now) / 1000
      );

      console.warn(`[RateLimit] Limit exceeded for IP: ${ip}`);
      return c.json({ error: "Rate limit exceeded", retryAfter }, 429);
    }

    // Add current request timestamp
    timestamps.push(now);
    rateLimitStore.set(ip, timestamps);

    await next();
  };
}

/**
 * Clears the rate limit store. Useful for testing.
 */
export function clearRateLimitStore(): void {
  rateLimitStore.clear();
}

/**
 * Returns rate limit store statistics. Useful for monitoring.
 */
export function getRateLimitStats(): { size: number; max: number } {
  return {
    size: rateLimitStore.size,
    max: 10000,
  };
}
