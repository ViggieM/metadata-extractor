// ABOUTME: SSRF protection module that validates URLs before fetching.
// ABOUTME: Blocks private IP ranges and caches DNS lookups for performance.

import dns from "node:dns/promises";
import ipaddr from "ipaddr.js";
import { LRUCache } from "lru-cache";

// IP ranges that are forbidden for SSRF protection
// These match the ranges used in apps/workers/network.ts
const DISALLOWED_IP_RANGES = new Set([
  // IPv4 ranges
  "unspecified",
  "broadcast",
  "multicast",
  "linkLocal",
  "loopback",
  "private",
  "reserved",
  "carrierGradeNat",
  // IPv6 ranges
  "uniqueLocal",
  "6to4", // RFC 3056 - IPv6 transition mechanism
  "teredo", // RFC 4380 - IPv6 tunneling
  "benchmarking", // RFC 5180 - benchmarking addresses
  "deprecated", // RFC 3879 - deprecated IPv6 addresses
  "discard", // RFC 6666 - discard-only prefix
]);

// DNS cache with 5 minute TTL and max 1000 entries
const dnsCache = new LRUCache<string, string[]>({
  max: 1000,
  ttl: 5 * 60 * 1000, // 5 minutes in milliseconds
});

const DNS_RESOLVER_TIMEOUT_MS = parseInt(
  process.env.DNS_RESOLVER_TIMEOUT_MS || "3000",
  10
);

/**
 * Resolves a hostname to all its IP addresses (both IPv4 and IPv6).
 */
async function resolveHostAddresses(hostname: string): Promise<string[]> {
  const resolver = new dns.Resolver({
    timeout: DNS_RESOLVER_TIMEOUT_MS,
  });

  const results = await Promise.allSettled([
    resolver.resolve4(hostname),
    resolver.resolve6(hostname),
  ]);

  const addresses: string[] = [];
  const errors: string[] = [];

  for (const result of results) {
    if (result.status === "fulfilled") {
      addresses.push(...result.value);
    } else {
      const reason = result.reason;
      if (reason instanceof Error) {
        errors.push(reason.message);
      } else {
        errors.push(String(reason));
      }
    }
  }

  if (addresses.length > 0) {
    return addresses;
  }

  const errorMessage =
    errors.length > 0
      ? errors.join("; ")
      : "DNS lookup did not return any A or AAAA records";
  throw new Error(errorMessage);
}

/**
 * Checks if an IP address is in a forbidden range.
 * Handles both IPv4 and IPv6 addresses, including IPv4-mapped IPv6.
 */
function isAddressForbidden(address: string): boolean {
  if (!ipaddr.isValid(address)) {
    return true;
  }

  const parsed = ipaddr.parse(address);

  // Handle IPv4-mapped IPv6 addresses (e.g., ::ffff:127.0.0.1)
  if (
    parsed.kind() === "ipv6" &&
    (parsed as ipaddr.IPv6).isIPv4MappedAddress()
  ) {
    const mapped = (parsed as ipaddr.IPv6).toIPv4Address();
    return DISALLOWED_IP_RANGES.has(mapped.range());
  }

  return DISALLOWED_IP_RANGES.has(parsed.range());
}

export type UrlValidationResult =
  | { ok: true; url: URL }
  | { ok: false; reason: string };

/**
 * Validates a URL for SSRF protection.
 * - Parses and validates the URL format
 * - Ensures HTTP/HTTPS protocol
 * - Resolves hostname to IP addresses (with caching)
 * - Checks all resolved IPs against forbidden ranges
 */
export async function validateUrl(
  urlCandidate: string
): Promise<UrlValidationResult> {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(urlCandidate);
  } catch (error) {
    return {
      ok: false,
      reason: `Invalid URL "${urlCandidate}": ${
        error instanceof Error ? error.message : String(error)
      }`,
    } as const;
  }

  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    return {
      ok: false,
      reason: `Unsupported protocol for URL: ${parsedUrl.toString()}`,
    } as const;
  }

  const hostname = parsedUrl.hostname;
  if (!hostname) {
    return {
      ok: false,
      reason: `URL ${parsedUrl.toString()} must include a hostname`,
    } as const;
  }

  // If the hostname is already an IP address, validate it directly
  if (ipaddr.isValid(hostname)) {
    if (isAddressForbidden(hostname)) {
      return {
        ok: false,
        reason: `Refusing to access forbidden IP address ${hostname}`,
      } as const;
    }
    return { ok: true, url: parsedUrl } as const;
  }

  // Check cache first
  let records = dnsCache.get(hostname);

  if (!records) {
    // Cache miss or expired - perform DNS resolution
    try {
      records = await resolveHostAddresses(hostname);
      dnsCache.set(hostname, records);
    } catch (error) {
      return {
        ok: false,
        reason: `Failed to resolve hostname ${hostname}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      } as const;
    }
  }

  if (!records || records.length === 0) {
    return {
      ok: false,
      reason: `DNS lookup for ${hostname} did not return any addresses`,
    } as const;
  }

  // Check all resolved addresses against forbidden ranges
  for (const record of records) {
    if (isAddressForbidden(record)) {
      return {
        ok: false,
        reason: `Refusing to access forbidden resolved address ${record} for host ${hostname}`,
      } as const;
    }
  }

  return { ok: true, url: parsedUrl } as const;
}

/**
 * Clears the DNS cache. Useful for testing.
 */
export function clearDnsCache(): void {
  dnsCache.clear();
}

/**
 * Returns DNS cache statistics. Useful for monitoring.
 */
export function getDnsCacheStats(): { size: number; max: number } {
  return {
    size: dnsCache.size,
    max: 1000,
  };
}
