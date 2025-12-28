/**
 * Pulse Cache - Caches full pipeline results to avoid re-fetching on every page load
 *
 * TTL: 24 hours for news data (use Rescan to force refresh)
 * Storage: Uses existing LLMCache table with special key prefix
 */

import { prisma } from '@/lib/db';
import { PulseResponse } from '@/types';

const PULSE_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const CACHE_KEY_PREFIX = 'pulse:';

/**
 * Generate cache key for a specific time window
 */
function getCacheKey(window: string): string {
  return `${CACHE_KEY_PREFIX}${window}`;
}

/**
 * Get cached pulse data if available and not expired
 */
export async function getCachedPulse(window: string): Promise<PulseResponse | null> {
  try {
    const cacheKey = getCacheKey(window);
    const cached = await prisma.lLMCache.findUnique({
      where: { cacheKey },
    });

    if (!cached) {
      return null;
    }

    // Check if expired
    if (cached.expiresAt < new Date()) {
      // Delete expired cache entry
      await prisma.lLMCache.delete({ where: { cacheKey } }).catch(() => {});
      return null;
    }

    // Parse and return cached data
    const data = JSON.parse(cached.output) as PulseResponse;

    // Convert date strings back to Date objects
    data.fetchedAt = new Date(data.fetchedAt);
    data.receiptsFeed = data.receiptsFeed.map((r) => ({
      ...r,
      createdAt: new Date(r.createdAt),
      eventDate: r.eventDate ? new Date(r.eventDate) : undefined,
    }));
    data.allReceipts = data.allReceipts.map((r) => ({
      ...r,
      createdAt: new Date(r.createdAt),
      eventDate: r.eventDate ? new Date(r.eventDate) : undefined,
    }));
    data.topics = data.topics.map((t) => ({
      ...t,
      receipts: t.receipts.map((r) => ({
        ...r,
        createdAt: new Date(r.createdAt),
        eventDate: r.eventDate ? new Date(r.eventDate) : undefined,
      })),
    }));
    data.errors = data.errors.map((e) => ({
      ...e,
      timestamp: new Date(e.timestamp),
    }));

    console.log(`[PulseCache] Cache hit for window=${window}, age=${Math.round((Date.now() - cached.createdAt.getTime()) / 1000)}s`);
    return data;
  } catch (error) {
    console.error('[PulseCache] Error reading cache:', error);
    return null;
  }
}

/**
 * Cache pulse data for 24 hours
 */
export async function cachePulse(window: string, data: PulseResponse): Promise<void> {
  try {
    const cacheKey = getCacheKey(window);
    const expiresAt = new Date(Date.now() + PULSE_CACHE_TTL_MS);

    await prisma.lLMCache.upsert({
      where: { cacheKey },
      update: {
        output: JSON.stringify(data),
        expiresAt,
        createdAt: new Date(),
      },
      create: {
        cacheKey,
        output: JSON.stringify(data),
        expiresAt,
      },
    });

    console.log(`[PulseCache] Cached pulse for window=${window}, expires at ${expiresAt.toISOString()}`);
  } catch (error) {
    // Cache errors are non-fatal - log and continue
    console.error('[PulseCache] Error writing cache:', error);
  }
}

/**
 * Invalidate pulse cache for a specific window or all windows
 */
export async function invalidatePulseCache(window?: string): Promise<void> {
  try {
    if (window) {
      // Invalidate specific window
      const cacheKey = getCacheKey(window);
      await prisma.lLMCache.delete({ where: { cacheKey } }).catch(() => {});
      console.log(`[PulseCache] Invalidated cache for window=${window}`);
    } else {
      // Invalidate all pulse caches
      await prisma.lLMCache.deleteMany({
        where: {
          cacheKey: {
            startsWith: CACHE_KEY_PREFIX,
          },
        },
      });
      console.log('[PulseCache] Invalidated all pulse caches');
    }
  } catch (error) {
    console.error('[PulseCache] Error invalidating cache:', error);
  }
}

/**
 * Get cache status for debugging
 */
export async function getPulseCacheStatus(): Promise<{
  windows: { window: string; age: number; expiresIn: number }[];
}> {
  try {
    const caches = await prisma.lLMCache.findMany({
      where: {
        cacheKey: {
          startsWith: CACHE_KEY_PREFIX,
        },
      },
      select: {
        cacheKey: true,
        createdAt: true,
        expiresAt: true,
      },
    });

    const now = Date.now();
    return {
      windows: caches.map((c) => ({
        window: c.cacheKey.replace(CACHE_KEY_PREFIX, ''),
        age: Math.round((now - c.createdAt.getTime()) / 1000),
        expiresIn: Math.max(0, Math.round((c.expiresAt.getTime() - now) / 1000)),
      })),
    };
  } catch {
    return { windows: [] };
  }
}
