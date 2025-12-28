/**
 * URL Normalization Utilities
 *
 * Consolidated URL normalization functions used across the codebase
 * for deduplication, comparison, and caching.
 */

/**
 * Normalize URL for comparison and deduplication
 * Removes protocol, www, trailing slashes, and query params
 *
 * @param url - The URL to normalize
 * @param options - Normalization options
 * @returns Normalized URL string
 */
export function normalizeUrl(
  url: string,
  options: {
    removeQuery?: boolean;
    removeHash?: boolean;
    removeProtocol?: boolean;
    removeWww?: boolean;
    removeTrailingSlash?: boolean;
  } = {}
): string {
  const {
    removeQuery = true,
    removeHash = true,
    removeProtocol = true,
    removeWww = true,
    removeTrailingSlash = true,
  } = options;

  try {
    const parsed = new URL(url);

    let normalized = '';

    // Protocol
    if (!removeProtocol) {
      normalized += parsed.protocol + '//';
    }

    // Hostname
    let hostname = parsed.hostname;
    if (removeWww) {
      hostname = hostname.replace(/^www\./, '');
    }
    normalized += hostname;

    // Pathname
    let pathname = parsed.pathname;
    if (removeTrailingSlash) {
      pathname = pathname.replace(/\/$/, '');
    }
    normalized += pathname;

    // Query
    if (!removeQuery && parsed.search) {
      normalized += parsed.search;
    }

    // Hash
    if (!removeHash && parsed.hash) {
      normalized += parsed.hash;
    }

    return normalized.toLowerCase();
  } catch {
    // If URL parsing fails, do basic normalization
    let normalized = url.toLowerCase();
    if (removeProtocol) {
      normalized = normalized.replace(/^https?:\/\//, '');
    }
    if (removeWww) {
      normalized = normalized.replace(/^www\./, '');
    }
    if (removeTrailingSlash) {
      normalized = normalized.replace(/\/$/, '');
    }
    return normalized;
  }
}

/**
 * Extract domain from URL
 * Returns just the hostname without www prefix
 */
export function extractDomain(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/**
 * Check if two URLs point to the same resource
 * Uses normalized comparison
 */
export function urlsMatch(url1: string, url2: string): boolean {
  return normalizeUrl(url1) === normalizeUrl(url2);
}

/**
 * Check if URL is from a specific domain
 */
export function isFromDomain(url: string, domain: string): boolean {
  const urlDomain = extractDomain(url);
  const targetDomain = domain.replace(/^www\./, '').toLowerCase();
  return urlDomain === targetDomain || urlDomain.endsWith('.' + targetDomain);
}
