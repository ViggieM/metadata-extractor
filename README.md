# URL Metadata Extraction Service

A Docker-based service that extracts metadata (title, description, keywords) from URLs using headless Chrome and Playwright.
The code is based on [karakeep](https://github.com/karakeep-app/karakeep), simplified to only provide a REST Endpoint for metadata and content extraction.

Features:
- Rich metadata extraction via metascraper (title, description, images, author, dates, favicon with automatic compression)
- Site-specific plugins for YouTube, Amazon, X/Twitter, Spotify, Soundcloud
- Readable content extraction via `/content` endpoint (Readability.js + DOMPurify)
- SSRF protection with DNS caching and IP range validation
- Bot detection evasion and GDPR consent handling
- Rate limiting
- Optional API key authentication
- OpenAPI 3.1 documentation with Swagger UI
- Production-ready with Traefik and Cloudflare Zero Trust tunnel support

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

# With API key authentication (if API_KEY is set)
curl -X POST http://localhost:3000/process \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your-secret-api-key" \
  -d '{"url": "https://example.com"}'

# View API documentation
open http://localhost:3000/docs
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
| `API_KEY` | (none) | Optional API key; if set, requires `Authorization: Bearer <key>` header |
| `DOCS_USERNAME` | (none) | Optional basic auth username for `/doc` and `/docs` endpoints |
| `DOCS_PASSWORD` | (none) | Optional basic auth password for `/doc` and `/docs` endpoints |
| `FAVICON_SIZE` | `32` | Target max dimension in pixels for favicon compression |
| `FAVICON_MAX_SIZE_BYTES` | `3072` | Max favicon size in bytes (3KB); larger falls back to URL |
| `FAVICON_OUTPUT_FORMAT` | `png` | Output format for favicon (`png` or `webp`) |
| `FAVICON_FETCH_TIMEOUT_MS` | `5000` | Timeout for fetching favicon URLs |
| `CLOUDFLARE_TUNNEL_TOKEN` | (none) | Cloudflare Tunnel token for production deployment |
| `API_HOST` | (none) | Public hostname for Traefik routing (e.g., `metadata.yourdomain.com`) |

## Production Deployment with Cloudflare Zero Trust

The service includes Traefik reverse proxy and Cloudflare Tunnel for secure production deployment. Local port access (`:3000`) remains available for development.

### Architecture

```
Local dev:   localhost:3000 → API Container → Chrome Container

Production:  Internet → Cloudflare Tunnel → Traefik → API Container → Chrome Container
```

### Setup Instructions

1. Go to [Cloudflare Zero Trust dashboard](https://one.dash.cloudflare.com/)
2. Navigate to **Networks → Tunnels → Create a tunnel**
3. Select **Cloudflared** connector type
4. Name your tunnel (e.g., `metadata-extractor`)
5. Copy the tunnel token and add it to your `.env` file:
   ```bash
   CLOUDFLARE_TUNNEL_TOKEN=your-token-here
   ```
6. In the tunnel configuration, add a **Public Hostname**:
   - **Subdomain**: your choice (e.g., `metadata`)
   - **Domain**: select your Cloudflare domain
   - **Service Type**: HTTP
   - **URL**: `traefik:80`
7. Update `API_HOST` in `.env` to match your hostname:
   ```bash
   API_HOST=metadata.yourdomain.com
   ```
8. Start the service:
   ```bash
   docker compose up -d
   ```

### Verification

```bash
# Check all containers are running
docker compose ps

# Test local access
curl http://localhost:3000/health

# Test tunnel access
curl https://metadata.yourdomain.com/health
```

## Privacy

### No Data Persistence
- The service is **stateless** — it doesn't store fetched content, extracted metadata, or user requests
- Each page fetch creates an **isolated browser context** that is closed immediately after use
- No databases, caches, or logs retain user-submitted URLs or extracted data

### Security Measures That Support Privacy

1. **SSRF Protection** — Validates all URLs against private/internal IP ranges before fetching. Sub-requests during page load are also validated and blocked if targeting forbidden IPs.

2. **Rate Limiting** — Sliding window rate limiting per IP prevents abuse (default: 5 requests per 60-second window).

3. **Optional API Key Authentication** — When `API_KEY` is set, requires `Authorization: Bearer <key>` header to prevent unauthorized access.

4. **Content Sanitization** — Uses DOMPurify to sanitize extracted content, removing potentially malicious scripts.

### What the Service Does Access
- Fetches the provided URL using headless Chrome
- May set consent cookies to bypass cookie dialogs (configured via `consent-cookies.json`)
- Uses an adblocker to reduce tracking during page fetches

### Recommendations for Operators
- Deploy behind a reverse proxy with TLS
- Set `API_KEY` to restrict access
- Consider network isolation for the Chrome container

## TODOs
- **Prometheus metrics** - Request counts, latencies, error rates
- **Structured logging** - Replace console.log with structured JSON logging for easier debugging and monitoring.
- **Tests** - Unit tests for extractor, integration tests for API
- **bruno** - add local api client https://www.usebruno.com/

## Known Issues

1. **YouTube descriptions are generic** - Returns "Enjoy the videos and music you love..." instead of actual video description. YouTube loads this dynamically via JS; may need longer wait or different extraction strategy.
2. **Some sites still detect bot** - Stealth plugin helps but isn't perfect. Sites like LinkedIn, Instagram may still block.
3. **Memory usage unknown** - No profiling done. Long-running service with adblocker may accumulate memory.
