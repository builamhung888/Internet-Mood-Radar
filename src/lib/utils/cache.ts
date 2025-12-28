/**
 * Cache Utilities
 *
 * Consolidated cache key generation and common cache patterns
 * used across LLM, location, and pulse caching.
 */

import { prisma } from '@/lib/db';
import { generateId } from '@/lib/utils';

/**
 * Cache result type - discriminated union for type safety
 */
export type CacheResult<T> =
  | { status: 'hit'; value: T }
  | { status: 'miss' }
  | { status: 'expired' };

/**
 * Generate a deterministic cache key from a prefix and context data
 * Uses SHA-256 hash for consistent key generation
 */
export function generateCacheKey(prefix: string, context: unknown): string {
  const contextStr = typeof context === 'string' ? context : JSON.stringify(context);
  return generateId(`${prefix}:${contextStr}`);
}

/**
 * Get cached value from LLMCache table
 * Returns discriminated union for proper type handling
 */
export async function getCached<T>(cacheKey: string): Promise<CacheResult<T>> {
  try {
    const cached = await prisma.lLMCache.findUnique({
      where: { cacheKey },
    });

    if (!cached) {
      return { status: 'miss' };
    }

    if (cached.expiresAt < new Date()) {
      // Clean up expired entry in background
      prisma.lLMCache.delete({ where: { cacheKey } }).catch(() => {});
      return { status: 'expired' };
    }

    const value = JSON.parse(cached.output) as T;
    return { status: 'hit', value };
  } catch {
    return { status: 'miss' };
  }
}

/**
 * Get cached string value (common case for LLM outputs)
 */
export async function getCachedString(cacheKey: string): Promise<string | null> {
  try {
    const cached = await prisma.lLMCache.findUnique({
      where: { cacheKey },
    });

    if (cached && cached.expiresAt > new Date()) {
      return cached.output;
    }

    // Clean up expired cache
    if (cached) {
      prisma.lLMCache.delete({ where: { cacheKey } }).catch(() => {});
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Save value to cache with TTL in hours
 */
export async function saveToCache<T>(
  cacheKey: string,
  value: T,
  ttlHours: number
): Promise<void> {
  try {
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + ttlHours);

    const output = typeof value === 'string' ? value : JSON.stringify(value);

    await prisma.lLMCache.upsert({
      where: { cacheKey },
      update: { output, expiresAt },
      create: { cacheKey, output, expiresAt },
    });
  } catch {
    // Cache errors are non-fatal - silently ignore
    console.debug('[Cache] Failed to save to cache:', cacheKey);
  }
}

/**
 * Save string value to cache (common case for LLM outputs)
 */
export async function saveToCacheString(
  cacheKey: string,
  output: string,
  ttlHours: number
): Promise<void> {
  return saveToCache(cacheKey, output, ttlHours);
}

/**
 * Delete a cache entry
 */
export async function deleteFromCache(cacheKey: string): Promise<void> {
  try {
    await prisma.lLMCache.delete({ where: { cacheKey } });
  } catch {
    // Ignore if not found
  }
}

/**
 * Delete all cache entries matching a prefix
 */
export async function deleteCacheByPrefix(prefix: string): Promise<number> {
  try {
    const result = await prisma.lLMCache.deleteMany({
      where: {
        cacheKey: {
          startsWith: prefix,
        },
      },
    });
    return result.count;
  } catch {
    return 0;
  }
}

/**
 * Check if a cache entry exists and is valid
 */
export async function isCached(cacheKey: string): Promise<boolean> {
  try {
    const cached = await prisma.lLMCache.findUnique({
      where: { cacheKey },
      select: { expiresAt: true },
    });
    return cached !== null && cached.expiresAt > new Date();
  } catch {
    return false;
  }
}
