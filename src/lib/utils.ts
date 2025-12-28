import { createHash } from 'crypto';

/**
 * Generate a stable hash ID from content
 */
export function generateId(content: string): string {
  return createHash('sha256').update(content).digest('hex').substring(0, 16);
}

/**
 * Parse a date string or timestamp into a Date object
 */
export function parseDate(input: string | number | Date): Date {
  if (input instanceof Date) return input;
  if (typeof input === 'number') return new Date(input * 1000);

  const date = new Date(input);
  if (isNaN(date.getTime())) {
    return new Date();
  }
  return date;
}

/**
 * Get the date string in YYYY-MM-DD format
 */
export function getDateString(date: Date = new Date()): string {
  return date.toISOString().split('T')[0];
}

/**
 * Calculate recency weight (exponential decay)
 * Returns 1.0 for very recent, approaching 0 for old items
 */
export function recencyWeight(createdAt: Date, halfLifeHours: number = 6): number {
  const ageMs = Date.now() - createdAt.getTime();
  const ageHours = ageMs / (1000 * 60 * 60);
  return Math.exp(-0.693 * ageHours / halfLifeHours);
}

/**
 * Cap engagement score to prevent outliers from dominating
 */
export function capEngagement(engagement: number, cap: number = 1000): number {
  return Math.min(engagement, cap);
}

/**
 * Source-specific engagement normalization factors
 * These factors normalize engagement to a comparable scale across sources
 *
 * Reddit: score + comments - typically ranges 1-10000+, very high variance
 * HN: score + comments - typically ranges 1-500, moderate variance
 * RSS: always 0 (no engagement data)
 *
 * We normalize to a 0-100 scale where 100 = "high engagement for this source"
 */
const ENGAGEMENT_FACTORS: Record<string, { scale: number; baseline: number }> = {
  reddit: { scale: 500, baseline: 10 },   // 500 engagement = 100 normalized
  hn: { scale: 200, baseline: 5 },        // 200 engagement = 100 normalized
  rss: { scale: 1, baseline: 0 },         // RSS has no engagement, use baseline
};

/**
 * Normalize engagement score across different sources
 * Returns a value between 0-100 where 100 = high engagement for that source type
 */
export function normalizeEngagement(rawEngagement: number, source: string): number {
  const factor = ENGAGEMENT_FACTORS[source] || { scale: 100, baseline: 0 };

  // If engagement is 0, use a baseline value for the source
  if (rawEngagement === 0) {
    return factor.baseline;
  }

  // Normalize using logarithmic scaling to handle high variance
  // log10(engagement + 1) / log10(scale + 1) * 100
  const normalized = (Math.log10(rawEngagement + 1) / Math.log10(factor.scale + 1)) * 100;

  // Cap at 100
  return Math.min(100, Math.max(0, normalized));
}

/**
 * Normalize a value to 0-1 range using logarithmic scaling
 */
export function logNormalize(value: number, max: number = 100): number {
  if (value <= 0) return 0;
  return Math.min(1, Math.log10(value + 1) / Math.log10(max + 1));
}

/**
 * Calculate cosine similarity between two vectors
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Strip HTML tags from a string
 */
export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Truncate text to a maximum length
 */
export function truncate(text: string, maxLength: number = 200): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

/**
 * Sleep for a given number of milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 */
export async function retry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  baseDelayMs: number = 1000
): Promise<T> {
  let lastError: Error | undefined;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      if (i < maxRetries - 1) {
        await sleep(baseDelayMs * Math.pow(2, i));
      }
    }
  }

  throw lastError;
}

/**
 * Get favicon URL from a website URL using Google's favicon service
 * This is more reliable than trying to fetch /favicon.ico directly
 */
export function getFaviconUrl(url: string): string | undefined {
  try {
    const domain = new URL(url).hostname;
    // Use Google's favicon service - it handles most edge cases
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
  } catch {
    return undefined;
  }
}

// ============================================================================
// MOOD/TENSION COLOR UTILITIES
// ============================================================================

/**
 * Get color for a mood score (0-100)
 * 0 = very negative (red), 50 = neutral (yellow), 100 = very positive (green)
 * Uses smooth HSL interpolation for a natural gradient
 */
export function getMoodColor(moodScore: number): string {
  // Clamp to 0-100
  const score = Math.min(100, Math.max(0, moodScore));

  // Map score to hue: 0 (red) -> 60 (yellow) -> 120 (green)
  // 0 score = hue 0 (red)
  // 50 score = hue 45 (orange-yellow)
  // 100 score = hue 120 (green)
  const hue = (score / 100) * 120;

  // Saturation: keep vibrant
  const saturation = 70;

  // Lightness: slightly brighter in the middle for better visibility
  const lightness = 45 + Math.sin((score / 100) * Math.PI) * 5;

  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

/**
 * Get color for a tension index (0-100)
 * INVERSE of mood: 0 = calm (green), 100 = high tension (red)
 */
export function getTensionColor(tensionIndex: number): string {
  // Tension is inverse of mood: high tension = low mood
  return getMoodColor(100 - tensionIndex);
}

/**
 * Get a discrete color category for tension (for legends/badges)
 */
export function getTensionCategory(tensionIndex: number): {
  color: string;
  label: string;
  bgColor: string;
} {
  if (tensionIndex >= 70) {
    return { color: '#dc2626', label: 'High', bgColor: 'rgba(220, 38, 38, 0.2)' };
  }
  if (tensionIndex >= 50) {
    return { color: '#ea580c', label: 'Elevated', bgColor: 'rgba(234, 88, 12, 0.2)' };
  }
  if (tensionIndex >= 30) {
    return { color: '#ca8a04', label: 'Moderate', bgColor: 'rgba(202, 138, 4, 0.2)' };
  }
  return { color: '#16a34a', label: 'Calm', bgColor: 'rgba(22, 163, 74, 0.2)' };
}

/**
 * Get a discrete color category for mood score (for legends/badges)
 */
export function getMoodCategory(moodScore: number): {
  color: string;
  label: string;
  bgColor: string;
} {
  if (moodScore >= 70) {
    return { color: '#16a34a', label: 'Positive', bgColor: 'rgba(22, 163, 74, 0.2)' };
  }
  if (moodScore >= 50) {
    return { color: '#ca8a04', label: 'Neutral', bgColor: 'rgba(202, 138, 4, 0.2)' };
  }
  if (moodScore >= 30) {
    return { color: '#ea580c', label: 'Concerning', bgColor: 'rgba(234, 88, 12, 0.2)' };
  }
  return { color: '#dc2626', label: 'Negative', bgColor: 'rgba(220, 38, 38, 0.2)' };
}
