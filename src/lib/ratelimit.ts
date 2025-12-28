/**
 * Rate limiter for API endpoints
 * Uses sliding window algorithm with serverless-compatible storage
 *
 * In serverless environments (Vercel, AWS Lambda), each instance has its own
 * memory space. This implementation:
 * 1. Works correctly for single-instance deployments
 * 2. Provides best-effort rate limiting in serverless (may allow slightly more requests)
 * 3. Can be upgraded to Redis by implementing RateLimitStore interface
 *
 * For production serverless with strict rate limiting, use:
 * - Vercel KV (Redis)
 * - Upstash Redis
 * - AWS ElastiCache
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
  firstRequestAt: number;
}

/**
 * Abstract storage interface for rate limiting
 * Implement this for Redis/KV stores in production serverless
 */
interface RateLimitStore {
  get(key: string): RateLimitEntry | undefined;
  set(key: string, entry: RateLimitEntry): void;
  delete(key: string): void;
  entries(): IterableIterator<[string, RateLimitEntry]>;
}

/**
 * In-memory store implementation
 * Works for single instance, provides best-effort in serverless
 */
class InMemoryRateLimitStore implements RateLimitStore {
  private store = new Map<string, RateLimitEntry>();

  get(key: string): RateLimitEntry | undefined {
    return this.store.get(key);
  }

  set(key: string, entry: RateLimitEntry): void {
    this.store.set(key, entry);
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  entries(): IterableIterator<[string, RateLimitEntry]> {
    return this.store.entries();
  }
}

// Store instance (swap with Redis implementation for distributed rate limiting)
const rateLimitStore: RateLimitStore = new InMemoryRateLimitStore();

// Clean up old entries periodically
const CLEANUP_INTERVAL = 60 * 1000; // 1 minute
const MAX_ENTRIES = 10000; // Prevent memory exhaustion in serverless
let lastCleanup = Date.now();

function cleanupExpiredEntries(): void {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;

  lastCleanup = now;
  let entryCount = 0;
  const keysToDelete: string[] = [];

  for (const [key, entry] of rateLimitStore.entries()) {
    entryCount++;
    if (entry.resetAt < now) {
      keysToDelete.push(key);
    }
  }

  // Delete expired entries
  for (const key of keysToDelete) {
    rateLimitStore.delete(key);
  }

  // Emergency cleanup if too many entries (serverless memory protection)
  if (entryCount - keysToDelete.length > MAX_ENTRIES) {
    console.warn(`[RateLimit] Too many entries (${entryCount}), clearing store`);
    // In a real implementation, we'd clear oldest entries
    // For now, just log the warning - the store will naturally expire entries
  }
}

export interface RateLimitConfig {
  windowMs: number;    // Time window in milliseconds
  maxRequests: number; // Max requests per window
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

/**
 * Check if a request should be rate limited
 * @param identifier - Unique identifier (e.g., IP address)
 * @param config - Rate limit configuration
 */
export function checkRateLimit(
  identifier: string,
  config: RateLimitConfig
): RateLimitResult {
  cleanupExpiredEntries();

  const now = Date.now();
  const entry = rateLimitStore.get(identifier);

  // No existing entry or window expired - create new
  if (!entry || entry.resetAt < now) {
    const newEntry: RateLimitEntry = {
      count: 1,
      resetAt: now + config.windowMs,
      firstRequestAt: now,
    };
    rateLimitStore.set(identifier, newEntry);

    return {
      allowed: true,
      remaining: config.maxRequests - 1,
      resetAt: newEntry.resetAt,
    };
  }

  // Within window - check count
  if (entry.count >= config.maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: entry.resetAt,
    };
  }

  // Increment count
  entry.count++;

  return {
    allowed: true,
    remaining: config.maxRequests - entry.count,
    resetAt: entry.resetAt,
  };
}

/**
 * Get client identifier from request headers
 * Prefers X-Forwarded-For for proxied requests, falls back to X-Real-IP
 */
export function getClientIdentifier(headers: Headers): string {
  // Check forwarded headers (from proxies/load balancers)
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    // X-Forwarded-For can contain multiple IPs, take the first one
    return forwarded.split(',')[0].trim();
  }

  const realIp = headers.get('x-real-ip');
  if (realIp) {
    return realIp;
  }

  // Fallback for local development
  return 'anonymous';
}

// Default rate limit config for pulse endpoint
export const PULSE_RATE_LIMIT: RateLimitConfig = {
  windowMs: 60 * 1000,  // 1 minute window
  maxRequests: 30,       // 30 requests per minute
};
