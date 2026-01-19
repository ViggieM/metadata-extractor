// ABOUTME: Page fetching module that navigates to URLs and retrieves HTML content.
// ABOUTME: Includes adblocker integration and SSRF protection for sub-requests.

import { PlaywrightBlocker } from "@ghostery/adblocker-playwright";
import { Browser } from "playwright";

import { validateUrl } from "../security/ssrf.js";
import { getConsentCookies } from "./consent.js";

const FETCH_TIMEOUT_MS = parseInt(process.env.FETCH_TIMEOUT_MS || "30000", 10);

// Global adblocker instance (loaded once on first use)
let adBlocker: PlaywrightBlocker | null = null;
let adBlockerLoading = false;

/**
 * Loads the adblocker if not already loaded.
 */
async function getAdBlocker(): Promise<PlaywrightBlocker | null> {
  if (adBlocker) return adBlocker;
  if (adBlockerLoading) {
    // Wait for ongoing load
    while (adBlockerLoading) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return adBlocker;
  }

  adBlockerLoading = true;
  try {
    console.log("[Browser] Loading adblocker...");
    adBlocker = await PlaywrightBlocker.fromPrebuiltFull(fetch);
    console.log("[Browser] Adblocker loaded successfully");
    return adBlocker;
  } catch (error) {
    console.warn(
      `[Browser] Failed to load adblocker: ${error instanceof Error ? error.message : error}`
    );
    return null;
  } finally {
    adBlockerLoading = false;
  }
}

/**
 * Fetches a page and returns its HTML content.
 * Creates a new browser context for isolation, navigates to the URL,
 * and returns the page content along with the final URL after redirects.
 * @param browser - The browser instance to use
 * @param url - The URL to fetch
 * @param timeout - Optional timeout in ms (defaults to FETCH_TIMEOUT_MS env var)
 * @returns Object containing HTML, final URL, and HTTP status code
 */
export async function fetchPage(
  browser: Browser,
  url: string,
  timeout?: number
): Promise<{ html: string; finalUrl: string; statusCode: number | null }> {
  const pageTimeout = timeout ?? FETCH_TIMEOUT_MS;
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    viewport: { width: 1440, height: 900 },
  });

  try {
    // Add consent cookies for sites that require them
    const consentCookies = getConsentCookies(url);
    if (consentCookies.length > 0) {
      await context.addCookies(consentCookies);
    }

    const page = await context.newPage();

    // Enable adblocker on the page
    const blocker = await getAdBlocker();
    if (blocker) {
      await blocker.enableBlockingInPage(page);
    }

    // SSRF protection: block sub-requests to forbidden addresses
    // This catches redirects and resource loads that might target internal IPs
    await page.route("**/*", async (route) => {
      const requestUrl = route.request().url();

      // Only validate HTTP/HTTPS requests
      if (
        requestUrl.startsWith("http://") ||
        requestUrl.startsWith("https://")
      ) {
        const validation = await validateUrl(requestUrl);
        if (!validation.ok) {
          console.warn(`[Browser] Blocking sub-request: ${validation.reason}`);
          await route.abort("blockedbyclient");
          return;
        }
      }

      await route.continue();
    });

    console.log(`[Browser] Navigating to: ${url}`);
    const response = await page.goto(url, {
      timeout: pageTimeout,
      waitUntil: "domcontentloaded",
    });

    // Capture HTTP status code from the navigation response
    const statusCode = response?.status() ?? null;

    // Wait a bit for any dynamic content
    await page
      .waitForLoadState("networkidle", { timeout: 5000 })
      .catch(() => {});

    const html = await page.content();
    const finalUrl = page.url();

    console.log(
      `[Browser] Page loaded, status: ${statusCode}, content length: ${html.length}`
    );

    return { html, finalUrl, statusCode };
  } finally {
    await context.close();
  }
}
