// ABOUTME: Main entry point for the metadata extraction API service.
// ABOUTME: Handles server startup, browser lifecycle, and graceful shutdown.

import { serve } from "@hono/node-server";
import { Browser } from "playwright";

import { connectBrowser, loadConsentCookies } from "./browser/index.js";
import { createApp } from "./routes.js";

/**
 * Environment variables:
 * - BROWSER_WEB_URL: Chrome CDP URL (default: http://localhost:9222)
 * - FETCH_TIMEOUT_MS: Page fetch timeout in ms (default: 30000)
 * - PORT: Server port (default: 3000)
 * - DNS_RESOLVER_TIMEOUT_MS: DNS resolution timeout in ms (default: 3000)
 * - RATE_LIMIT_REQUESTS: Max requests per window (default: 5)
 * - RATE_LIMIT_WINDOW_MS: Rate limit window in ms (default: 60000)
 */

const PORT = parseInt(process.env.PORT || "3000", 10);

// Browser instance (initialized on startup)
let browser: Browser | null = null;
let browserConnecting = false;

async function ensureBrowser(): Promise<Browser | null> {
  if (browser) return browser;
  if (browserConnecting) {
    // Wait for ongoing connection attempt
    while (browserConnecting) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return browser;
  }

  browserConnecting = true;
  try {
    browser = await connectBrowser();
    return browser;
  } finally {
    browserConnecting = false;
  }
}

// Getter function for routes to access browser
function getBrowser(): Browser | null {
  // Trigger lazy connection if needed (fire and forget)
  if (!browser && !browserConnecting) {
    ensureBrowser().catch((err) => {
      console.error("[Browser] Failed to connect:", err);
    });
  }
  return browser;
}

// Create the Hono app with routes
const app = createApp(getBrowser);

// Graceful shutdown
async function shutdown() {
  console.log("Shutting down...");
  if (browser) {
    await browser.close().catch(() => {});
  }
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

// Start server
async function main() {
  // Load consent cookies configuration
  await loadConsentCookies();

  console.log("Connecting to browser...");

  // Try to connect to browser (with retries handled in connectBrowser)
  try {
    browser = await connectBrowser();
    console.log("Browser connected successfully");
  } catch (error) {
    console.warn(
      "Could not connect to browser on startup, will retry on first request:",
      error instanceof Error ? error.message : error
    );
  }

  console.log(`Starting server on port ${PORT}...`);
  serve({
    fetch: app.fetch,
    port: PORT,
  });
  console.log(`Server listening on http://localhost:${PORT}`);
}

main().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
