import { prisma } from '@/lib/db';
import { NonFatalError } from '@/types';
import { SOURCES } from '@/lib/config';

export interface SourceHealthStatus {
  source: string;
  status: 'healthy' | 'degraded' | 'down' | 'unknown';
  lastFetchAt: Date | null;
  lastSuccessAt: Date | null;
  errorCount: number;
  lastError: string | null;
}

/**
 * Update source health based on fetch errors
 */
export async function updateSourceHealth(errors: NonFatalError[]): Promise<void> {
  const errorSources = new Set(errors.map((e) => e.source));
  const now = new Date();

  // Update all sources
  for (const source of SOURCES) {
    const hasError = errorSources.has(source.name);
    const errorMsg = errors.find((e) => e.source === source.name)?.message || null;

    try {
      const existing = await prisma.sourceHealth.findUnique({
        where: { source: source.name },
      });

      if (hasError) {
        // Increment error count
        const newErrorCount = (existing?.errorCount || 0) + 1;
        const status = newErrorCount >= 3 ? 'down' : newErrorCount >= 1 ? 'degraded' : 'healthy';

        await prisma.sourceHealth.upsert({
          where: { source: source.name },
          update: {
            lastFetchAt: now,
            errorCount: newErrorCount,
            lastError: errorMsg,
            status,
          },
          create: {
            source: source.name,
            lastFetchAt: now,
            errorCount: newErrorCount,
            lastError: errorMsg,
            status,
          },
        });
      } else {
        // Success - reset error count
        await prisma.sourceHealth.upsert({
          where: { source: source.name },
          update: {
            lastFetchAt: now,
            lastSuccessAt: now,
            errorCount: 0,
            lastError: null,
            status: 'healthy',
          },
          create: {
            source: source.name,
            lastFetchAt: now,
            lastSuccessAt: now,
            errorCount: 0,
            lastError: null,
            status: 'healthy',
          },
        });
      }
    } catch (error) {
      // Health tracking errors are non-critical - log for debugging
      console.debug(`[Health] Failed to update health for ${source.name}:`, error);
    }
  }
}

/**
 * Get health status for all sources
 */
export async function getSourceHealth(): Promise<SourceHealthStatus[]> {
  try {
    const health = await prisma.sourceHealth.findMany();

    // Map to include sources that may not have been fetched yet
    type HealthRecord = typeof health[number];
    const healthMap = new Map<string, HealthRecord>(
      health.map((h: HealthRecord) => [h.source, h] as [string, HealthRecord])
    );

    return SOURCES.map((source) => {
      const h = healthMap.get(source.name);
      return {
        source: source.name,
        status: (h?.status as SourceHealthStatus['status']) || 'unknown',
        lastFetchAt: h?.lastFetchAt || null,
        lastSuccessAt: h?.lastSuccessAt || null,
        errorCount: h?.errorCount || 0,
        lastError: h?.lastError || null,
      };
    });
  } catch (error) {
    console.warn('[Health] Failed to fetch source health, returning unknown status:', error);
    return SOURCES.map((source) => ({
      source: source.name,
      status: 'unknown',
      lastFetchAt: null,
      lastSuccessAt: null,
      errorCount: 0,
      lastError: null,
    }));
  }
}

/**
 * Get overall system health
 */
export async function getSystemHealth(): Promise<{
  overall: 'healthy' | 'degraded' | 'down';
  sourceCount: number;
  healthyCount: number;
  degradedCount: number;
  downCount: number;
}> {
  const sources = await getSourceHealth();

  const healthyCount = sources.filter((s) => s.status === 'healthy').length;
  const degradedCount = sources.filter((s) => s.status === 'degraded').length;
  const downCount = sources.filter((s) => s.status === 'down').length;

  let overall: 'healthy' | 'degraded' | 'down' = 'healthy';
  if (downCount > sources.length / 2) {
    overall = 'down';
  } else if (degradedCount > 0 || downCount > 0) {
    overall = 'degraded';
  }

  return {
    overall,
    sourceCount: sources.length,
    healthyCount,
    degradedCount,
    downCount,
  };
}
