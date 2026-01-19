# URL Metadata Extraction Service

A Docker-based service that extracts metadata (title, description, keywords) from URLs using headless Chrome and Playwright.
The code is based on [karakeep](https://github.com/karakeep-app/karakeep), simplified to only provide a REST Endpoint for metadata and content extraction.

Features:
- Rich metadata extraction via metascraper (title, description, images, author, dates, favicon)
- Site-specific plugins for YouTube, Amazon, X/Twitter, Spotify, Soundcloud
- Readable content extraction via `/content` endpoint (Readability.js + DOMPurify)
- SSRF protection with DNS caching and IP range validation
- Bot detection evasion and GDPR consent handling
- Rate limiting

Not implemented:
- reuse persistent browser connection
- page screenshot
- archiving
- save to PDF

## Quick Start

```bash
# Start the service
docker compose up -d

# Extract metadata from a URL
curl -X POST http://localhost:3000/process \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'
  
# Extract content from a URL
curl -X POST http://localhost:3000/content \
  -H "Content-Type: application/json" \
  -d '{"url": "https://example.com"}'
```

## Architecture

```
┌─────────────────┐     ┌──────────────────┐
│   API Service   │────▶│  Chrome Browser  │
│   (Node.js)     │     │  (alpine-chrome) │
│   Port: 3000    │     │  Port: 9222      │
└─────────────────┘     └──────────────────┘
```

- **API Service**: Hono web server that receives URL requests and returns extracted metadata
- **Chrome Browser**: Headless Chrome instance accessed via Chrome DevTools Protocol (CDP)

Overview:
- Browser connects via CDP to an external Chrome instance (not bundled Chromium)
- Each page fetch uses an isolated browser context, closed after use
- All URLs are validated against private IP ranges before fetching (SSRF protection)
- Sub-requests during page load are also validated and blocked if targeting forbidden IPs
- Metascraper plugins are ordered: site-specific (YouTube, Amazon, X) run before generic extractors

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `BROWSER_WEB_URL` | `http://chrome.localhost:9222` | Chrome CDP endpoint |
| `FETCH_TIMEOUT_MS` | `30000` | Page fetch timeout |
| `PORT` | `3000` | API server port |
| `DNS_RESOLVER_TIMEOUT_MS` | `3000` | DNS lookup timeout |
| `RATE_LIMIT_REQUESTS` | `5` | Max requests per window |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Rate limit window |
| `CONSENT_COOKIES_PATH` | `config/consent-cookies.json` | Cookie bypass config |

## TODOs

- **Authentication** - Add API key auth (but make it optional)
- **Prometheus metrics** - Request counts, latencies, error rates
- **Structured logging** - Replace console.log with structured JSON logging for easier debugging and monitoring.
- **Tests** - Unit tests for extractor, integration tests for API
- **bruno** - add local api client https://www.usebruno.com/
- **API Documentation** - document API endpoints

## Known Issues

1. **YouTube descriptions are generic** - Returns "Enjoy the videos and music you love..." instead of actual video description. YouTube loads this dynamically via JS; may need longer wait or different extraction strategy.
2. **Some sites still detect bot** - Stealth plugin helps but isn't perfect. Sites like LinkedIn, Instagram may still block.
3. **Memory usage unknown** - No profiling done. Long-running service with adblocker may accumulate memory.
