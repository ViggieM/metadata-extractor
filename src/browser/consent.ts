// ABOUTME: Consent cookie management for bypassing cookie consent dialogs.
// ABOUTME: Loads cookie configurations from JSON and applies them to matching URLs.

import { readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

import { z } from "zod";

// Consent cookie configuration schema
const cookieSchema = z.object({
  name: z.string(),
  value: z.string(),
  domain: z.string(),
  path: z.string(),
});

const consentConfigSchema = z.object({
  patterns: z.array(
    z.object({
      match: z.array(z.string()), // URL patterns to match
      cookies: z.array(cookieSchema),
    })
  ),
});

type ConsentConfig = z.infer<typeof consentConfigSchema>;
export type Cookie = z.infer<typeof cookieSchema>;

// Default path for consent cookies config (relative to this file)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_CONSENT_COOKIES_PATH = path.resolve(
  __dirname,
  "../../config/consent-cookies.json"
);
const CONSENT_COOKIES_PATH =
  process.env.CONSENT_COOKIES_PATH || DEFAULT_CONSENT_COOKIES_PATH;

// Global consent cookie config (loaded once on first use)
let consentConfig: ConsentConfig | null = null;

/**
 * Loads the consent cookie configuration from a JSON file.
 * Should be called at startup to ensure the config is valid.
 */
export async function loadConsentCookies(): Promise<void> {
  try {
    console.log(
      `[Browser] Loading consent cookies from: ${CONSENT_COOKIES_PATH}`
    );
    const content = await readFile(CONSENT_COOKIES_PATH, "utf-8");
    const json = JSON.parse(content);
    consentConfig = consentConfigSchema.parse(json);
    console.log(
      `[Browser] Loaded ${consentConfig.patterns.length} consent cookie pattern(s)`
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      console.warn(
        `[Browser] Consent cookies file not found at ${CONSENT_COOKIES_PATH}, using empty config`
      );
      consentConfig = { patterns: [] };
    } else if (error instanceof z.ZodError) {
      console.error("[Browser] Invalid consent cookies config:", error.issues);
      throw new Error(`Invalid consent cookies config: ${error.message}`);
    } else {
      console.error("[Browser] Failed to load consent cookies:", error);
      throw error;
    }
  }
}

/**
 * Returns cookies needed to bypass consent screens for common sites.
 * Uses the configured patterns from consent-cookies.json.
 */
export function getConsentCookies(url: string): Cookie[] {
  if (!consentConfig) return [];

  const cookies: Cookie[] = [];
  for (const pattern of consentConfig.patterns) {
    if (pattern.match.some((m) => url.includes(m))) {
      cookies.push(...pattern.cookies);
    }
  }
  return cookies;
}
