// ABOUTME: Favicon fetching and compression module using Sharp.
// ABOUTME: Fetches favicon URLs, validates against SSRF, resizes to 32x32, compresses to under 3KB. Supports ICO format.

import sharp from "sharp";
import { isICO, parseICO } from "icojs";
import { validateUrl } from "../security/ssrf.js";

// Configuration from environment variables
const FAVICON_SIZE = parseInt(process.env.FAVICON_SIZE || "32", 10);
const FAVICON_MAX_SIZE_BYTES = parseInt(
  process.env.FAVICON_MAX_SIZE_BYTES || "3072",
  10
);
const FAVICON_OUTPUT_FORMAT = (process.env.FAVICON_OUTPUT_FORMAT || "png") as
  | "png"
  | "webp";
const FAVICON_FETCH_TIMEOUT_MS = parseInt(
  process.env.FAVICON_FETCH_TIMEOUT_MS || "5000",
  10
);

export interface FaviconResult {
  /** The processed favicon as a data URI, or null if processing failed */
  dataUri: string | null;
  /** The original URL, returned as fallback when processing fails */
  originalUrl: string;
  /** Whether the favicon was successfully processed */
  success: boolean;
  /** Error message if processing failed */
  error?: string;
}

/**
 * Fetches and processes a favicon URL into an optimized base64 data URI.
 * - Validates URL against SSRF protections
 * - Fetches the favicon with timeout
 * - Compresses and resizes if needed (>3KB or >32x32)
 * - Returns base64 data URI or falls back to original URL on error
 */
export async function processFavicon(faviconUrl: string): Promise<FaviconResult> {
  // Validate URL for SSRF protection
  const urlValidation = await validateUrl(faviconUrl);
  if (!urlValidation.ok) {
    console.warn(`[Favicon] SSRF check failed for ${faviconUrl}: ${urlValidation.reason}`);
    return {
      dataUri: null,
      originalUrl: faviconUrl,
      success: false,
      error: urlValidation.reason,
    };
  }

  try {
    // Fetch the favicon
    const buffer = await fetchFavicon(faviconUrl);
    if (!buffer || buffer.length === 0) {
      return {
        dataUri: null,
        originalUrl: faviconUrl,
        success: false,
        error: "Empty response",
      };
    }

    // Process the favicon
    const processed = await compressFavicon(buffer);

    // Check if result is still too large - fall back to original URL
    if (processed.length > FAVICON_MAX_SIZE_BYTES) {
      console.warn(
        `[Favicon] Compressed size ${processed.length} exceeds max ${FAVICON_MAX_SIZE_BYTES}, falling back to URL`
      );
      return {
        dataUri: null,
        originalUrl: faviconUrl,
        success: false,
        error: `Compressed size ${processed.length} exceeds limit`,
      };
    }

    // Convert to data URI
    const mimeType = FAVICON_OUTPUT_FORMAT === "webp" ? "image/webp" : "image/png";
    const base64 = processed.toString("base64");
    const dataUri = `data:${mimeType};base64,${base64}`;

    console.log(
      `[Favicon] Processed ${faviconUrl}: ${buffer.length} -> ${processed.length} bytes`
    );

    return {
      dataUri,
      originalUrl: faviconUrl,
      success: true,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[Favicon] Failed to process ${faviconUrl}: ${message}`);
    return {
      dataUri: null,
      originalUrl: faviconUrl,
      success: false,
      error: message,
    };
  }
}

/**
 * Fetches a favicon URL with timeout.
 */
async function fetchFavicon(url: string): Promise<Buffer> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FAVICON_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        // Common user agent to avoid being blocked
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "image/*,*/*;q=0.8",
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Converts an ICO buffer to PNG by selecting the best available image.
 * Selects the image closest to (but not smaller than) FAVICON_SIZE.
 */
async function convertIcoToPng(buffer: Buffer): Promise<Buffer> {
  const images = await parseICO(buffer, "image/png");

  if (images.length === 0) {
    throw new Error("ICO file contains no images");
  }

  // Sort by size descending and pick the best fit for our target size
  // Prefer images >= FAVICON_SIZE, or the largest available if all are smaller
  const sorted = [...images].sort((a, b) => b.width - a.width);

  // Find smallest image that's >= FAVICON_SIZE, or fall back to largest
  const bestFit =
    sorted.find((img) => img.width >= FAVICON_SIZE && img.height >= FAVICON_SIZE) ||
    sorted[0];

  return Buffer.from(bestFit.buffer);
}

/**
 * Compresses a favicon buffer using Sharp.
 * - Converts ICO format to PNG first if needed
 * - If already small enough (<=3KB), just re-encodes to normalize format
 * - If larger than target size, resizes to 32x32 and compresses
 */
async function compressFavicon(buffer: Buffer): Promise<Buffer> {
  // Convert ICO to PNG if needed
  if (isICO(buffer)) {
    buffer = await convertIcoToPng(buffer);
  }

  // Get image metadata
  const image = sharp(buffer);
  const metadata = await image.metadata();

  const width = metadata.width || 0;
  const height = metadata.height || 0;

  // If already small enough, just re-encode to normalize format
  if (buffer.length <= FAVICON_MAX_SIZE_BYTES) {
    return encodeImage(buffer, Math.max(width, height, FAVICON_SIZE));
  }

  // If image is larger than target size, resize it
  if (width > FAVICON_SIZE || height > FAVICON_SIZE) {
    return encodeImage(buffer, FAVICON_SIZE);
  }

  // Image is small but file is large - re-encode without resizing
  return encodeImage(buffer, Math.max(width, height));
}

/**
 * Encodes an image to the configured output format with compression.
 */
async function encodeImage(buffer: Buffer, size: number): Promise<Buffer> {
  const image = sharp(buffer).resize(size, size, {
    fit: "inside",
    withoutEnlargement: true,
  });

  if (FAVICON_OUTPUT_FORMAT === "webp") {
    return image
      .webp({
        quality: 80,
        effort: 6,
      })
      .toBuffer();
  }

  // Default to PNG with palette mode for smaller files
  return image
    .png({
      compressionLevel: 9,
      palette: true,
      quality: 80,
      effort: 10,
    })
    .toBuffer();
}
