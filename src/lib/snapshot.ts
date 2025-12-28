import { prisma } from '@/lib/db';
import { DailySnapshot, EmotionDistribution, Topic, Emotion } from '@/types';
import { getDateString } from '@/lib/utils';
import { createEmptyDistribution, EMOTIONS } from '@/lib/mood';

/**
 * Validate that an object is a valid EmotionDistribution
 */
function isValidEmotionDistribution(obj: unknown): obj is EmotionDistribution {
  if (!obj || typeof obj !== 'object') {
    return false;
  }

  const emotions = obj as Record<string, unknown>;

  for (const emotion of EMOTIONS) {
    if (typeof emotions[emotion] !== 'number' || isNaN(emotions[emotion] as number)) {
      return false;
    }
  }

  return true;
}

/**
 * Validate that an array contains valid topic data
 */
function isValidTopTopics(arr: unknown): arr is DailySnapshot['topTopics'] {
  if (!Array.isArray(arr)) {
    return false;
  }

  for (const item of arr) {
    if (!item || typeof item !== 'object') {
      return false;
    }

    const topic = item as Record<string, unknown>;

    if (!Array.isArray(topic.keywords) || !topic.keywords.every(k => typeof k === 'string')) {
      return false;
    }

    if (!Array.isArray(topic.receiptIds) || !topic.receiptIds.every(id => typeof id === 'string')) {
      return false;
    }
  }

  return true;
}

/**
 * Validate that an object is a valid llmOutputs record
 */
function isValidLLMOutputs(obj: unknown): obj is Record<string, string> {
  if (!obj || typeof obj !== 'object') {
    return false;
  }

  for (const [key, value] of Object.entries(obj)) {
    if (typeof key !== 'string' || typeof value !== 'string') {
      return false;
    }
  }

  return true;
}

/**
 * Safely parse JSON with validation
 */
function safeJSONParse<T>(
  json: string,
  validator: (obj: unknown) => obj is T,
  defaultValue: T
): T {
  try {
    const parsed = JSON.parse(json);
    if (validator(parsed)) {
      return parsed;
    }
    console.warn('[Snapshot] Invalid JSON structure, using default');
    return defaultValue;
  } catch (error) {
    console.error('[Snapshot] Failed to parse JSON:', error);
    return defaultValue;
  }
}

/**
 * Save a daily snapshot
 */
export async function saveSnapshot(snapshot: DailySnapshot): Promise<void> {
  await prisma.snapshot.upsert({
    where: { date: snapshot.date },
    update: {
      tensionIndex: snapshot.tensionIndex,
      emotions: JSON.stringify(snapshot.emotions),
      topTopics: JSON.stringify(snapshot.topTopics),
      llmOutputs: JSON.stringify(snapshot.llmOutputs),
    },
    create: {
      date: snapshot.date,
      tensionIndex: snapshot.tensionIndex,
      emotions: JSON.stringify(snapshot.emotions),
      topTopics: JSON.stringify(snapshot.topTopics),
      llmOutputs: JSON.stringify(snapshot.llmOutputs),
    },
  });
}

/**
 * Load a snapshot for a specific date
 * Validates JSON data and returns null if data is corrupted
 */
export async function loadSnapshot(date: string): Promise<DailySnapshot | null> {
  const snapshot = await prisma.snapshot.findUnique({
    where: { date },
  });

  if (!snapshot) {
    return null;
  }

  // Parse and validate each JSON field
  const emotions = safeJSONParse(
    snapshot.emotions,
    isValidEmotionDistribution,
    createEmptyDistribution()
  );

  const topTopics = safeJSONParse(
    snapshot.topTopics,
    isValidTopTopics,
    [] as DailySnapshot['topTopics']
  );

  const llmOutputs = safeJSONParse(
    snapshot.llmOutputs,
    isValidLLMOutputs,
    {} as Record<string, string>
  );

  return {
    date: snapshot.date,
    tensionIndex: snapshot.tensionIndex,
    emotions,
    topTopics,
    llmOutputs,
  };
}

/**
 * Get yesterday's date string
 */
export function getYesterdayDateString(): string {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return getDateString(yesterday);
}

/**
 * Load yesterday's snapshot
 */
export async function loadYesterdaySnapshot(): Promise<DailySnapshot | null> {
  return loadSnapshot(getYesterdayDateString());
}

/**
 * Calculate tension delta compared to yesterday
 */
export function calculateTensionDelta(
  currentTension: number,
  yesterdaySnapshot: DailySnapshot | null
): number {
  if (!yesterdaySnapshot) {
    return 0;
  }
  return currentTension - yesterdaySnapshot.tensionIndex;
}

/**
 * Calculate topic delta compared to yesterday
 * Returns a score indicating how much the topic changed
 */
export function calculateTopicDelta(
  topic: Topic,
  yesterdaySnapshot: DailySnapshot | null
): number {
  if (!yesterdaySnapshot || !yesterdaySnapshot.topTopics) {
    return 0;
  }

  // Find matching topic from yesterday by keyword overlap
  let bestMatch = 0;

  for (const yesterdayTopic of yesterdaySnapshot.topTopics) {
    const overlap = topic.keywords.filter((k) =>
      yesterdayTopic.keywords.includes(k)
    ).length;
    const maxKeywords = Math.max(topic.keywords.length, yesterdayTopic.keywords.length);
    const similarity = maxKeywords > 0 ? overlap / maxKeywords : 0;
    bestMatch = Math.max(bestMatch, similarity);
  }

  // If topic wasn't present yesterday (low similarity), it's "new" (+1)
  // If topic was present, delta is 0
  if (bestMatch < 0.3) {
    return 1; // New topic
  }

  return 0;
}

/**
 * Create a snapshot from current data
 */
export function createSnapshot(
  date: string,
  tensionIndex: number,
  emotions: EmotionDistribution,
  topics: Topic[],
  llmOutputs: Record<string, string>
): DailySnapshot {
  return {
    date,
    tensionIndex,
    emotions,
    topTopics: topics.slice(0, 10).map((t) => ({
      keywords: t.keywords,
      receiptIds: t.receipts.map((r) => r.id),
    })),
    llmOutputs,
  };
}

/**
 * Apply deltas from yesterday's snapshot to topics
 */
export function applyTopicDeltas(
  topics: Topic[],
  yesterdaySnapshot: DailySnapshot | null
): Topic[] {
  return topics.map((topic) => ({
    ...topic,
    delta: calculateTopicDelta(topic, yesterdaySnapshot),
  }));
}

/**
 * Get emotion deltas compared to yesterday
 */
export function getEmotionDeltas(
  current: EmotionDistribution,
  yesterday: DailySnapshot | null
): EmotionDistribution {
  const deltas = createEmptyDistribution();

  if (!yesterday) {
    return deltas;
  }

  for (const emotion of EMOTIONS) {
    deltas[emotion] = current[emotion] - (yesterday.emotions[emotion] || 0);
  }

  return deltas;
}

/**
 * Clean up old snapshots (keep last 30 days)
 */
export async function cleanupOldSnapshots(): Promise<number> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const cutoffStr = getDateString(cutoff);

  const result = await prisma.snapshot.deleteMany({
    where: {
      date: {
        lt: cutoffStr,
      },
    },
  });

  return result.count;
}
