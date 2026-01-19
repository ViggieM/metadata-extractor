// ABOUTME: Browser connection module for connecting to Chrome via CDP.
// ABOUTME: Manages browser lifecycle with connection retries.

import { Browser } from "playwright";
import { chromium } from "playwright-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";

// Apply stealth plugin to avoid bot detection
chromium.use(StealthPlugin());

const BROWSER_WEB_URL =
  process.env.BROWSER_WEB_URL || "http://chrome.localhost:9222";
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

/**
 * Connects to a Chrome browser instance via CDP.
 * Retries connection up to MAX_RETRIES times with RETRY_DELAY_MS delay between attempts.
 */
export async function connectBrowser(): Promise<Browser> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.log(
        `[Browser] Connecting to ${BROWSER_WEB_URL} (attempt ${attempt}/${MAX_RETRIES})...`
      );

      const browser = await chromium.connectOverCDP(BROWSER_WEB_URL, {
        timeout: 5000,
      });

      console.log("[Browser] Connected successfully");
      return browser;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(
        `[Browser] Connection attempt ${attempt} failed: ${lastError.message}`
      );

      if (attempt < MAX_RETRIES) {
        console.log(`[Browser] Retrying in ${RETRY_DELAY_MS}ms...`);
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      }
    }
  }

  throw new Error(
    `Failed to connect to browser after ${MAX_RETRIES} attempts: ${lastError?.message}`
  );
}
