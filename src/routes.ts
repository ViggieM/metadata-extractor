// ABOUTME: API route handlers for the metadata extraction service.
// ABOUTME: Defines /process, /content, /health, and /ready endpoints.

import { Hono } from "hono";
import { logger } from "hono/logger";
import { Browser } from "playwright";

import { fetchPage } from "./browser/index.js";
import { extractMetadata, extractReadableContent } from "./extraction/index.js";
import { processRequestSchema } from "./schemas.js";
import { rateLimiter, validateUrl } from "./security/index.js";

/**
 * Creates and configures the Hono application with all routes.
 * @param getBrowser - Function to get the current browser instance
 */
export function createApp(getBrowser: () => Browser | null) {
  const app = new Hono();

  // Middleware
  app.use(logger());

  // Rate limit the extraction endpoints (not /health or /ready)
  app.use("/process", rateLimiter());
  app.use("/content", rateLimiter());

  // Health check endpoint
  app.get("/health", (c) => {
    return c.json({ status: "ok" });
  });

  // Readiness check - returns 503 if browser is not connected
  app.get("/ready", (c) => {
    const browser = getBrowser();
    if (!browser) {
      return c.json({ status: "not_ready", reason: "browser not connected" }, 503);
    }
    return c.json({ status: "ready" });
  });

  // Main processing endpoint
  app.post("/process", async (c) => {
    const startTime = Date.now();

    // Parse JSON body with explicit error handling
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json(
        {
          error: "Invalid JSON",
          details: "Request body must be valid JSON. Check for unescaped characters.",
        },
        400
      );
    }

    const validation = processRequestSchema.safeParse(body);

    if (!validation.success) {
      return c.json(
        {
          error: "Validation failed",
          details: validation.error.issues,
        },
        400
      );
    }

    const { url, timeout } = validation.data;
    console.log(`[Process] Starting extraction for: ${url}`);

    // Validate URL for SSRF protection
    const urlValidation = await validateUrl(url);
    if (!urlValidation.ok) {
      console.warn(`[Process] SSRF check failed for ${url}: ${urlValidation.reason}`);
      return c.json({ error: urlValidation.reason }, 400);
    }

    try {
      // Ensure browser is connected
      const browser = getBrowser();
      if (!browser) {
        return c.json({ error: "Browser not available" }, 503);
      }

      // Fetch the page
      const { html, finalUrl, statusCode } = await fetchPage(browser, url, timeout);

      // Extract metadata
      const metadata = await extractMetadata(html, finalUrl);

      const duration = Date.now() - startTime;
      console.log(`[Process] Completed in ${duration}ms: ${url}`);

      return c.json({ ...metadata, statusCode });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(`[Process] Failed for ${url}: ${message}`);
      return c.json({ error: message }, 500);
    }
  });

  // Readability content extraction endpoint
  app.post("/content", async (c) => {
    const startTime = Date.now();

    // Parse JSON body with explicit error handling
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json(
        {
          error: "Invalid JSON",
          details: "Request body must be valid JSON. Check for unescaped characters.",
        },
        400
      );
    }

    const validation = processRequestSchema.safeParse(body);

    if (!validation.success) {
      return c.json(
        {
          error: "Validation failed",
          details: validation.error.issues,
        },
        400
      );
    }

    const { url, timeout } = validation.data;
    console.log(`[Content] Starting extraction for: ${url}`);

    // Validate URL for SSRF protection
    const urlValidation = await validateUrl(url);
    if (!urlValidation.ok) {
      console.warn(`[Content] SSRF check failed for ${url}: ${urlValidation.reason}`);
      return c.json({ error: urlValidation.reason }, 400);
    }

    try {
      // Ensure browser is connected
      const browser = getBrowser();
      if (!browser) {
        return c.json({ error: "Browser not available" }, 503);
      }

      // Fetch the page
      const { html, finalUrl, statusCode } = await fetchPage(browser, url, timeout);

      // Extract readable content
      const content = extractReadableContent(html, finalUrl);

      if (!content) {
        console.warn(`[Content] Readability could not parse: ${url}`);
        return c.json(
          { error: "Could not extract readable content from this page", statusCode },
          422
        );
      }

      const duration = Date.now() - startTime;
      console.log(`[Content] Completed in ${duration}ms: ${url}`);

      return c.json({ ...content, statusCode });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(`[Content] Failed for ${url}: ${message}`);
      return c.json({ error: message }, 500);
    }
  });

  return app;
}
