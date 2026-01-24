// ABOUTME: Extraction module barrel export.
// ABOUTME: Re-exports all content extraction functionality.

export { extractMetadata } from "./metadata.js";
export type { Metadata } from "./metadata.js";
export { extractReadableContent } from "./readability.js";
export type { ReadabilityResult } from "./readability.js";
export { processFavicon } from "./favicon.js";
export type { FaviconResult } from "./favicon.js";
