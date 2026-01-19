// ABOUTME: Zod validation schemas for API request/response validation.
// ABOUTME: Defines the shape and constraints for all API endpoints.

import { z } from "zod";

/**
 * Schema for URL processing requests.
 * Used by both /process and /content endpoints.
 */
export const processRequestSchema = z.object({
  url: z
    .string()
    .url()
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
    .optional(),
});

export type ProcessRequest = z.infer<typeof processRequestSchema>;
