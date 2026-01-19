// ABOUTME: API route handlers for the metadata extraction service using OpenAPI.
// ABOUTME: Defines /process, /content, /health, /ready endpoints with OpenAPI documentation.

import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { basicAuth } from "hono/basic-auth";
import { logger } from "hono/logger";
import { Browser } from "playwright";

import { fetchPage } from "./browser/index.js";
import { extractMetadata, extractReadableContent } from "./extraction/index.js";
import {
  ProcessRequestSchema,
  MetadataResponseSchema,
  ReadabilityResponseSchema,
  ErrorResponseSchema,
  HealthResponseSchema,
  ReadyResponseSchema,
} from "./schemas.js";
import { apiKeyAuth, rateLimiter, validateUrl } from "./security/index.js";

// =============================================================================
// Route Definitions
// =============================================================================

const healthRoute = createRoute({
  method: "get",
  path: "/health",
  tags: ["Health"],
  summary: "Health check",
  description: "Returns OK if the service is running.",
  responses: {
    200: {
      content: {
        "application/json": {
          schema: HealthResponseSchema,
        },
      },
      description: "Service is healthy",
    },
  },
});

const readyRoute = createRoute({
  method: "get",
  path: "/ready",
  tags: ["Health"],
  summary: "Readiness check",
  description: "Returns ready status and verifies browser connection is available.",
  responses: {
    200: {
      content: {
        "application/json": {
          schema: ReadyResponseSchema,
        },
      },
      description: "Service is ready",
    },
    503: {
      content: {
        "application/json": {
          schema: ReadyResponseSchema,
        },
      },
      description: "Service is not ready (browser not connected)",
    },
  },
});

const processRoute = createRoute({
  method: "post",
  path: "/process",
  tags: ["Extraction"],
  summary: "Extract metadata from URL",
  description:
    "Fetches the given URL using headless Chrome and extracts metadata including title, description, images, author, dates, and more using metascraper.",
  security: [{ bearerAuth: [] }],
  request: {
    body: {
      content: {
        "application/json": {
          schema: ProcessRequestSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: MetadataResponseSchema,
        },
      },
      description: "Successfully extracted metadata",
    },
    400: {
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
      description: "Invalid request (validation failed or SSRF blocked)",
    },
    401: {
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
      description: "Unauthorized (missing or invalid API key)",
    },
    429: {
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
      description: "Rate limit exceeded",
    },
    500: {
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
      description: "Internal server error during extraction",
    },
    503: {
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
      description: "Browser not available",
    },
  },
});

const contentRoute = createRoute({
  method: "post",
  path: "/content",
  tags: ["Extraction"],
  summary: "Extract readable content from URL",
  description:
    "Fetches the given URL using headless Chrome and extracts clean, readable article content using Mozilla Readability. The HTML is sanitized with DOMPurify.",
  security: [{ bearerAuth: [] }],
  request: {
    body: {
      content: {
        "application/json": {
          schema: ProcessRequestSchema,
        },
      },
      required: true,
    },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: ReadabilityResponseSchema,
        },
      },
      description: "Successfully extracted readable content",
    },
    400: {
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
      description: "Invalid request (validation failed or SSRF blocked)",
    },
    401: {
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
      description: "Unauthorized (missing or invalid API key)",
    },
    422: {
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
      description: "Could not extract readable content from the page",
    },
    429: {
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
      description: "Rate limit exceeded",
    },
    500: {
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
      description: "Internal server error during extraction",
    },
    503: {
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
      description: "Browser not available",
    },
  },
});

// =============================================================================
// App Factory
// =============================================================================

/**
 * Creates and configures the OpenAPIHono application with all routes.
 * @param getBrowser - Function to get the current browser instance
 */
export function createApp(getBrowser: () => Browser | null) {
  const app = new OpenAPIHono();

  // Middleware
  app.use(logger());

  // Apply auth before rate limiting (fail fast if unauthorized)
  app.use("/process", apiKeyAuth());
  app.use("/content", apiKeyAuth());

  // Rate limit the extraction endpoints (not /health or /ready)
  app.use("/process", rateLimiter());
  app.use("/content", rateLimiter());

  // Protect API documentation with basic auth (optional, only if credentials are set)
  const docsUsername = process.env.DOCS_USERNAME;
  const docsPassword = process.env.DOCS_PASSWORD;
  if (docsUsername && docsPassword) {
    const docsAuth = basicAuth({ username: docsUsername, password: docsPassword });
    app.use("/docs", docsAuth);
    app.use("/doc", docsAuth);
  }

  // Health check endpoint
  app.openapi(healthRoute, (c) => {
    return c.json({ status: "ok" as const }, 200);
  });

  // Readiness check - returns 503 if browser is not connected
  app.openapi(readyRoute, (c) => {
    const browser = getBrowser();
    if (!browser) {
      return c.json({ status: "not_ready" as const, reason: "browser not connected" }, 503);
    }
    return c.json({ status: "ready" as const }, 200);
  });

  // Main processing endpoint
  app.openapi(processRoute, async (c) => {
    const startTime = Date.now();
    const { url, timeout } = c.req.valid("json");

    console.log(`[Process] Starting extraction for: ${url}`);

    // Validate URL for SSRF protection
    const urlValidation = await validateUrl(url);
    if (!urlValidation.ok) {
      console.warn(`[Process] SSRF check failed for ${url}: ${urlValidation.reason}`);
      return c.json({ error: urlValidation.reason }, 400);
    }

    try {
      // Ensure browser is connected
      const browser = getBrowser();
      if (!browser) {
        return c.json({ error: "Browser not available" }, 503);
      }

      // Fetch the page
      const { html, finalUrl, statusCode } = await fetchPage(browser, url, timeout);

      // Extract metadata
      const metadata = await extractMetadata(html, finalUrl);

      const duration = Date.now() - startTime;
      console.log(`[Process] Completed in ${duration}ms: ${url}`);

      return c.json({ ...metadata, statusCode }, 200);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(`[Process] Failed for ${url}: ${message}`);
      return c.json({ error: message }, 500);
    }
  });

  // Readability content extraction endpoint
  app.openapi(contentRoute, async (c) => {
    const startTime = Date.now();
    const { url, timeout } = c.req.valid("json");

    console.log(`[Content] Starting extraction for: ${url}`);

    // Validate URL for SSRF protection
    const urlValidation = await validateUrl(url);
    if (!urlValidation.ok) {
      console.warn(`[Content] SSRF check failed for ${url}: ${urlValidation.reason}`);
      return c.json({ error: urlValidation.reason }, 400);
    }

    try {
      // Ensure browser is connected
      const browser = getBrowser();
      if (!browser) {
        return c.json({ error: "Browser not available" }, 503);
      }

      // Fetch the page
      const { html, finalUrl, statusCode } = await fetchPage(browser, url, timeout);

      // Extract readable content
      const content = extractReadableContent(html, finalUrl);

      if (!content) {
        console.warn(`[Content] Readability could not parse: ${url}`);
        return c.json(
          { error: "Could not extract readable content from this page" },
          422
        );
      }

      const duration = Date.now() - startTime;
      console.log(`[Content] Completed in ${duration}ms: ${url}`);

      return c.json({ ...content, statusCode }, 200);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(`[Content] Failed for ${url}: ${message}`);
      return c.json({ error: message }, 500);
    }
  });

  // =============================================================================
  // OpenAPI Documentation
  // =============================================================================

  // Register security scheme
  app.openAPIRegistry.registerComponent("securitySchemes", "bearerAuth", {
    type: "http",
    scheme: "bearer",
    description: "Optional API key authentication. Set API_KEY environment variable to enable.",
  });

  // OpenAPI JSON spec endpoint
  app.doc("/doc", {
    openapi: "3.1.0",
    info: {
      title: "Metadata Extractor API",
      version: "1.0.0",
      description:
        "A Docker-based metadata extraction service that fetches URLs using headless Chrome (Playwright) and extracts metadata via metascraper, or readable content via Mozilla Readability.",
      license: {
        name: "MIT",
      },
    },
    servers: [
      {
        url: "http://localhost:3000",
        description: "Local development server",
      },
    ],
  });

  // Swagger UI
  app.get("/docs", (c) => {
    return c.html(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Metadata Extractor API - Swagger UI</title>
        <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css">
      </head>
      <body>
        <div id="swagger-ui"></div>
        <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
        <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-standalone-preset.js"></script>
        <script>
          window.onload = () => {
            SwaggerUIBundle({
              url: '/doc',
              dom_id: '#swagger-ui',
              presets: [
                SwaggerUIBundle.presets.apis,
                SwaggerUIStandalonePreset
              ],
              layout: "StandaloneLayout"
            });
          };
        </script>
      </body>
      </html>
    `);
  });

  return app;
}
