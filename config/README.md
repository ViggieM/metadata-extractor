# Configuration Files

## consent-cookies.json

Configures cookies to bypass cookie consent dialogs on specific websites. When fetching a URL, the system checks if the URL matches any pattern and pre-sets the corresponding cookies before loading the page.

### Schema

```json
{
  "patterns": [
    {
      "match": ["domain1.com", "domain2.com"],
      "cookies": [
        {
          "name": "COOKIE_NAME",
          "value": "cookie_value",
          "domain": ".domain.com",
          "path": "/"
        }
      ]
    }
  ]
}
```

### Fields

| Field | Description |
|-------|-------------|
| `patterns` | Array of pattern configurations |
| `patterns[].match` | URL substrings to match (uses `url.includes()`) |
| `patterns[].cookies` | Cookies to set when pattern matches |
| `cookies[].name` | Cookie name |
| `cookies[].value` | Cookie value (consent token) |
| `cookies[].domain` | Cookie domain (use leading `.` for subdomains) |
| `cookies[].path` | Cookie path (typically `"/"`) |

### Common Consent Cookies

| Cookie | Service | Purpose |
|--------|---------|---------|
| `CONSENT` | YouTube | Legacy consent token |
| `SOCS` | Google/YouTube | Stores cookie consent choices (13 months) |
| `NID` | Google | Preferences for signed-out users (6 months) |

### Obtaining Consent Cookie Values

1. Open the target site in a browser
2. Accept the cookie consent dialog
3. Open DevTools → Application → Cookies
4. Copy the relevant cookie values

### Example

```json
{
  "patterns": [
    {
      "match": ["youtube.com"],
      "cookies": [
        {
          "name": "SOCS",
          "value": "CAISHAgBEhJnd3NfMjAyMzA4MTAtMF9SQzIaAmVuIAEaBgiAo_CmBg",
          "domain": ".youtube.com",
          "path": "/"
        }
      ]
    }
  ]
}
```

### Environment Variable

Override the config file path:

```bash
CONSENT_COOKIES_PATH=/custom/path/consent-cookies.json
```
