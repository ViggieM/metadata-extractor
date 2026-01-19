// ABOUTME: Metadata extraction module that parses HTML and extracts metadata.
// ABOUTME: Uses metascraper to extract title, description, images, author, dates, and more.

import metascraper from "metascraper";
import metascraperAmazon from "metascraper-amazon";
import metascraperAuthor from "metascraper-author";
import metascraperDate from "metascraper-date";
import metascraperDescription from "metascraper-description";
import metascraperImage from "metascraper-image";
import metascraperLogo from "metascraper-logo-favicon";
import metascraperPublisher from "metascraper-publisher";
import metascraperSoundcloud from "metascraper-soundcloud";
import metascraperSpotify from "metascraper-spotify";
import metascraperTitle from "metascraper-title";
import metascraperUrl from "metascraper-url";
import metascraperX from "metascraper-x";
import metascraperYoutube from "metascraper-youtube";

export interface Metadata {
  title: string;
  description: string;
  keywords: string[]; // Empty array for backward compatibility
  image: string | null; // og:image / twitter:image
  favicon: string | null; // Site favicon/logo
  author: string | null;
  publisher: string | null;
  datePublished: string | null; // ISO 8601
  dateModified: string | null; // ISO 8601
  url: string; // Canonical URL
  statusCode: number | null; // HTTP status code from target site
}

// Initialize metascraper with plugins
// Plugin order matters: site-specific plugins should come BEFORE generic ones
// so they can override generic metadata extraction with site-specific logic
const metascraperParser = metascraper([
  // Site-specific plugins (highest priority)
  metascraperAmazon(),
  metascraperYoutube(),
  metascraperX(),
  metascraperSpotify(),
  metascraperSoundcloud(),
  // Generic plugins (fallback)
  metascraperDate({
    dateModified: true,
    datePublished: true,
  }),
  metascraperAuthor(),
  metascraperPublisher(),
  metascraperTitle(),
  metascraperDescription(),
  metascraperImage(),
  metascraperLogo(),
  metascraperUrl(),
]);

/**
 * Extracts metadata from HTML content using metascraper.
 * Returns structured metadata including title, description, images, author, dates, and more.
 */
export async function extractMetadata(
  html: string,
  url: string
): Promise<Metadata> {
  try {
    const meta = await metascraperParser({
      url,
      html,
      // Skip URL validation since we've already validated and fetched the page
      validateUrl: false,
    });

    return {
      title: sanitizeString(meta.title ?? ""),
      description: sanitizeString(meta.description ?? ""),
      keywords: [], // metascraper doesn't extract keywords, kept for backward compatibility
      image: meta.image ?? null,
      favicon: meta.logo ?? null,
      author: meta.author ?? null,
      publisher: meta.publisher ?? null,
      datePublished: meta.date ?? null,
      dateModified: null, // metascraper-date puts dateModified in a separate field if available
      url: meta.url ?? url,
      statusCode: null, // Set by caller from fetch response
    };
  } catch (error) {
    console.warn(
      `[Extractor] Failed to parse HTML with metascraper: ${error instanceof Error ? error.message : error}`
    );
    return {
      title: "",
      description: "",
      keywords: [],
      image: null,
      favicon: null,
      author: null,
      publisher: null,
      datePublished: null,
      dateModified: null,
      url,
      statusCode: null, // Set by caller from fetch response
    };
  }
}

/**
 * Sanitizes a string by trimming whitespace and limiting length.
 */
function sanitizeString(str: string, maxLength = 1000): string {
  return str.trim().slice(0, maxLength);
}
