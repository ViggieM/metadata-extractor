# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A Docker-based metadata extraction service that fetches URLs using headless Chrome (Playwright) and extracts metadata (title, description, images, author, dates) via metascraper, or readable content via Mozilla Readability.

Based on [karakeep](https://github.com/karakeep-app/karakeep), simplified to only provide REST endpoints for metadata and content extraction.

## Commands

```bash
# Development (requires external Chrome instance on port 9222)
pnpm dev                    # Watch mode with hot reload
pnpm build                  # TypeScript compilation

# Docker (recommended - includes Chrome)
docker compose up -d        # Start API + Chrome containers
docker compose down         # Stop containers
docker compose build        # Rebuild after code changes
```

## API Endpoints

- `POST /process` - Extract metadata (title, description, image, author, dates, etc.)
- `POST /content` - Extract readable article content (Readability + DOMPurify)
- `GET /health` - Health check
- `GET /ready` - Readiness check (verifies browser connection)
- `GET /doc` - OpenAPI 3.1 JSON specification
- `GET /docs` - Swagger UI for interactive API documentation

Request body: `{ "url": "https://example.com", "timeout": 30000 }` (timeout optional)

## Architecture

```
src/
├── index.ts          # Entry point: server startup, browser lifecycle, shutdown
├── routes.ts         # Hono routes and request handlers
├── schemas.ts        # Zod validation schemas for API requests
├── browser/
│   ├── index.ts      # Barrel export
│   ├── connection.ts # CDP connection with retry logic
│   ├── fetcher.ts    # Page fetching, adblocker, SSRF sub-request blocking
│   └── consent.ts    # Consent cookie management for bypassing dialogs
├── extraction/
│   ├── index.ts      # Barrel export
│   ├── metadata.ts   # Metascraper extraction with site-specific plugins
│   ├── readability.ts# Mozilla Readability + DOMPurify sanitization
│   └── favicon.ts    # Favicon fetch, ICO decoding (icojs), compression, base64 data URI
└── security/
    ├── index.ts      # Barrel export
    ├── apiKey.ts     # Optional API key authentication (Bearer token)
    ├── ssrf.ts       # SSRF protection: DNS resolution, IP range blocking
    └── rateLimit.ts  # Sliding window rate limiting per IP
```

**Key patterns:**
- Browser connects to Chrome via CDP (Chrome DevTools Protocol), not bundled Chromium
- Each page fetch creates isolated browser context, closed after use
- All URLs validated against private IP ranges before fetching (SSRF protection)
- Sub-requests during page load are also validated and blocked if forbidden
- Metascraper plugins ordered: site-specific (YouTube, Amazon, X) before generic

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `BROWSER_WEB_URL` | `http://localhost:9222` | Chrome CDP endpoint |
| `FETCH_TIMEOUT_MS` | `30000` | Page fetch timeout |
| `PORT` | `3000` | API server port |
| `DNS_RESOLVER_TIMEOUT_MS` | `3000` | DNS lookup timeout |
| `RATE_LIMIT_REQUESTS` | `5` | Max requests per window |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Rate limit window |
| `CONSENT_COOKIES_PATH` | `config/consent-cookies.json` | Cookie bypass config |
| `API_KEY` | (none) | Optional API key; if set, requires `Authorization: Bearer <key>` header |
| `DOCS_USERNAME` | (none) | Optional basic auth username for `/doc` and `/docs` endpoints |
| `DOCS_PASSWORD` | (none) | Optional basic auth password for `/doc` and `/docs` endpoints |
| `FAVICON_SIZE` | `32` | Target max dimension in pixels for favicon compression |
| `FAVICON_MAX_SIZE_BYTES` | `3072` | Max favicon size in bytes (3KB); larger falls back to URL |
| `FAVICON_OUTPUT_FORMAT` | `png` | Output format for favicon (`png` or `webp`) |
| `FAVICON_FETCH_TIMEOUT_MS` | `5000` | Timeout for fetching favicon URLs |

## Code Conventions

- All source files must start with two `ABOUTME:` comment lines explaining the file's purpose
- TypeScript with strict mode, ES modules (`"type": "module"`)
- Use Zod for runtime validation of external input
- Preserve existing comments unless provably false
