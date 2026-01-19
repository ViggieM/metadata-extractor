// ABOUTME: Zod OpenAPI validation schemas for API request/response validation.
// ABOUTME: Defines the shape and constraints for all API endpoints with OpenAPI documentation.

import { z } from "@hono/zod-openapi";

// =============================================================================
// Request Schemas
// =============================================================================

/**
 * Schema for URL processing requests.
 * Used by both /process and /content endpoints.
 */
export const ProcessRequestSchema = z
  .object({
    url: z
      .string()
      .url()
      .openapi({
        example: "https://example.com/article",
        description: "The URL to fetch and extract metadata/content from",
      })
      .refine((url) => url.startsWith("http://") || url.startsWith("https://"), {
        message: "URL must use http or https protocol",
      })
      .refine((url) => url.length <= 2048, {
        message: "URL must be 2048 characters or less",
      }),
    timeout: z
      .number()
      .int()
      .min(1000, { message: "Timeout must be at least 1000ms" })
      .max(120000, { message: "Timeout must not exceed 120000ms (2 minutes)" })
      .optional()
      .openapi({
        example: 30000,
        description: "Optional timeout in milliseconds (default: 30000, max: 120000)",
      }),
  })
  .openapi("ProcessRequest");

export type ProcessRequest = z.infer<typeof ProcessRequestSchema>;

// =============================================================================
// Response Schemas
// =============================================================================

/**
 * Schema for metadata extraction response.
 */
export const MetadataResponseSchema = z
  .object({
    title: z.string().openapi({
      example: "Example Article Title",
      description: "The page title",
    }),
    description: z.string().openapi({
      example: "A brief description of the article content.",
      description: "The page description or excerpt",
    }),
    keywords: z.array(z.string()).openapi({
      example: [],
      description: "Keywords extracted from the page (currently empty for backward compatibility)",
    }),
    image: z.string().nullable().openapi({
      example: "https://example.com/og-image.jpg",
      description: "The Open Graph or Twitter card image URL",
    }),
    favicon: z.string().nullable().openapi({
      example: "https://example.com/favicon.ico",
      description: "The site favicon or logo URL",
    }),
    author: z.string().nullable().openapi({
      example: "John Doe",
      description: "The article author",
    }),
    publisher: z.string().nullable().openapi({
      example: "Example News",
      description: "The publisher or site name",
    }),
    datePublished: z.string().nullable().openapi({
      example: "2024-01-15T10:30:00Z",
      description: "Publication date in ISO 8601 format",
    }),
    dateModified: z.string().nullable().openapi({
      example: "2024-01-16T14:00:00Z",
      description: "Last modification date in ISO 8601 format",
    }),
    url: z.string().openapi({
      example: "https://example.com/article",
      description: "The canonical URL of the page",
    }),
    statusCode: z.number().nullable().openapi({
      example: 200,
      description: "HTTP status code from the target site",
    }),
  })
  .openapi("MetadataResponse");

export type MetadataResponse = z.infer<typeof MetadataResponseSchema>;

/**
 * Schema for readability content extraction response.
 */
export const ReadabilityResponseSchema = z
  .object({
    title: z.string().openapi({
      example: "Example Article Title",
      description: "The article title",
    }),
    content: z.string().openapi({
      example: "<div><p>Article content...</p></div>",
      description: "Sanitized HTML content of the article",
    }),
    textContent: z.string().openapi({
      example: "Article content in plain text...",
      description: "Plain text content of the article",
    }),
    length: z.number().openapi({
      example: 1500,
      description: "Length of the text content in characters",
    }),
    excerpt: z.string().openapi({
      example: "A short excerpt from the article...",
      description: "Short excerpt from the article",
    }),
    siteName: z.string().nullable().openapi({
      example: "Example News",
      description: "Name of the site if detected",
    }),
    url: z.string().openapi({
      example: "https://example.com/article",
      description: "The URL of the article",
    }),
    statusCode: z.number().nullable().openapi({
      example: 200,
      description: "HTTP status code from the target site",
    }),
  })
  .openapi("ReadabilityResponse");

export type ReadabilityResponse = z.infer<typeof ReadabilityResponseSchema>;

/**
 * Schema for error responses.
 */
export const ErrorResponseSchema = z
  .object({
    error: z.string().openapi({
      example: "Validation failed",
      description: "Error message",
    }),
    details: z.any().optional().openapi({
      description: "Additional error details (validation errors, etc.)",
    }),
  })
  .openapi("ErrorResponse");

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

/**
 * Schema for health check response.
 */
export const HealthResponseSchema = z
  .object({
    status: z.literal("ok").openapi({
      example: "ok",
      description: "Health status",
    }),
  })
  .openapi("HealthResponse");

/**
 * Schema for readiness check response.
 */
export const ReadyResponseSchema = z
  .object({
    status: z.enum(["ready", "not_ready"]).openapi({
      example: "ready",
      description: "Readiness status",
    }),
    reason: z.string().optional().openapi({
      example: "browser not connected",
      description: "Reason for not being ready (only present when not_ready)",
    }),
  })
  .openapi("ReadyResponse");
