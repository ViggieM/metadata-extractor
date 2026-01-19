// ABOUTME: Optional API key authentication middleware using Hono's bearerAuth.
// ABOUTME: When API_KEY env var is set, requires valid Bearer token; otherwise skips auth.

import { bearerAuth } from "hono/bearer-auth";
import type { MiddlewareHandler } from "hono";

const API_KEY = process.env.API_KEY;

/**
 * Creates an optional API key authentication middleware.
 * If API_KEY environment variable is set, requires valid Bearer token.
 * If not set, authentication is skipped entirely.
 */
export function apiKeyAuth(): MiddlewareHandler {
  // If no API_KEY configured, skip authentication entirely
  if (!API_KEY) {
    return async (_c, next) => {
      await next();
    };
  }

  // Use Hono's built-in bearerAuth with custom error messages
  return bearerAuth({
    token: API_KEY,
    noAuthenticationHeaderMessage: { error: "Missing API key" },
    invalidAuthenticationHeaderMessage: { error: "Invalid Authorization header format" },
    invalidTokenMessage: { error: "Invalid API key" },
  });
}
