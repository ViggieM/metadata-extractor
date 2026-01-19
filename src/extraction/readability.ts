// ABOUTME: Readability extraction module using Mozilla's Readability.
// ABOUTME: Extracts clean article content from HTML and sanitizes it with DOMPurify.

import { Readability } from "@mozilla/readability";
import DOMPurify from "dompurify";
import { JSDOM, VirtualConsole } from "jsdom";

export interface ReadabilityResult {
  /** Article title */
  title: string;
  /** Sanitized HTML content */
  content: string;
  /** Plain text content */
  textContent: string;
  /** Length of the text content */
  length: number;
  /** Short excerpt from the article */
  excerpt: string;
  /** Name of the site (if detected) */
  siteName: string | null;
  /** Final URL of the article */
  url: string;
}

/**
 * Extracts readable content from HTML using Mozilla's Readability library.
 * The extracted HTML is sanitized with DOMPurify to prevent XSS attacks.
 *
 * @param html - The raw HTML content to parse
 * @param url - The URL of the page (used for resolving relative links)
 * @returns The extracted content or null if Readability couldn't parse it
 */
export function extractReadableContent(
  html: string,
  url: string
): ReadabilityResult | null {
  // Use VirtualConsole to suppress JSDOM warnings about malformed HTML
  const virtualConsole = new VirtualConsole();

  const dom = new JSDOM(html, { url, virtualConsole });

  try {
    const readableContent = new Readability(dom.window.document).parse();

    if (!readableContent || typeof readableContent.content !== "string") {
      return null;
    }

    // Create a separate JSDOM window for DOMPurify
    const purifyWindow = new JSDOM("").window;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const purify = DOMPurify(purifyWindow as any);
      const sanitizedContent = purify.sanitize(readableContent.content);

      return {
        title: readableContent.title || "",
        content: sanitizedContent,
        textContent: readableContent.textContent || "",
        length: readableContent.length || 0,
        excerpt: readableContent.excerpt || "",
        siteName: readableContent.siteName || null,
        url,
      };
    } finally {
      // Clean up the purify window to prevent memory leaks
      purifyWindow.close();
    }
  } finally {
    // Always close the main DOM window to prevent memory leaks
    dom.window.close();
  }
}
