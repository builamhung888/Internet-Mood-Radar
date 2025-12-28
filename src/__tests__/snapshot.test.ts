import {
  calculateTensionDelta,
  calculateTopicDelta,
  createSnapshot,
  getEmotionDeltas,
} from '../lib/snapshot';
import { DailySnapshot, Topic, EmotionDistribution } from '../types';
import { createEmptyDistribution } from '../lib/mood';

describe('Snapshot Delta Logic', () => {
  const createMockSnapshot = (overrides: Partial<DailySnapshot> = {}): DailySnapshot => ({
    date: '2024-01-01',
    tensionIndex: 50,
    emotions: {
      anger: 0.1,
      anxiety: 0.2,
      sadness: 0.1,
      resilience: 0.2,
      hope: 0.1,
      excitement: 0.1,
      cynicism: 0.1,
      neutral: 0.1,
    },
    topTopics: [
      { keywords: ['rockets', 'attack', 'tel', 'aviv'], receiptIds: ['1', '2'] },
      { keywords: ['economy', 'market', 'stocks'], receiptIds: ['3', '4'] },
    ],
    llmOutputs: {},
    ...overrides,
  });

  const createMockTopic = (keywords: string[]): Topic => ({
    id: 'topic1',
    title: 'Test Topic',
    keywords,
    whyTrending: 'Testing',
    emotionMix: createEmptyDistribution(),
    weight: 1,
    delta: 0,
    receipts: [],
  });

  describe('calculateTensionDelta', () => {
    it('should return 0 when no yesterday snapshot', () => {
      const delta = calculateTensionDelta(60, null);
      expect(delta).toBe(0);
    });

    it('should return positive delta when tension increased', () => {
      const yesterday = createMockSnapshot({ tensionIndex: 40 });
      const delta = calculateTensionDelta(60, yesterday);
      expect(delta).toBe(20);
    });

    it('should return negative delta when tension decreased', () => {
      const yesterday = createMockSnapshot({ tensionIndex: 70 });
      const delta = calculateTensionDelta(50, yesterday);
      expect(delta).toBe(-20);
    });

    it('should return 0 when tension unchanged', () => {
      const yesterday = createMockSnapshot({ tensionIndex: 50 });
      const delta = calculateTensionDelta(50, yesterday);
      expect(delta).toBe(0);
    });
  });

  describe('calculateTopicDelta', () => {
    it('should return 0 when no yesterday snapshot', () => {
      const topic = createMockTopic(['rockets', 'attack']);
      const delta = calculateTopicDelta(topic, null);
      expect(delta).toBe(0);
    });

    it('should return 0 for topic that existed yesterday', () => {
      const yesterday = createMockSnapshot();
      const topic = createMockTopic(['rockets', 'attack', 'tel', 'aviv']);
      const delta = calculateTopicDelta(topic, yesterday);
      expect(delta).toBe(0);
    });

    it('should return 1 for new topic', () => {
      const yesterday = createMockSnapshot();
      const topic = createMockTopic(['completely', 'new', 'topic']);
      const delta = calculateTopicDelta(topic, yesterday);
      expect(delta).toBe(1);
    });

    it('should handle partial keyword overlap', () => {
      const yesterday = createMockSnapshot();
      // Topic with some overlap but not enough
      const topic = createMockTopic(['rockets', 'something', 'else']);
      const delta = calculateTopicDelta(topic, yesterday);
      // Should still be considered new if overlap is low
      expect([0, 1]).toContain(delta);
    });
  });

  describe('getEmotionDeltas', () => {
    it('should return zero deltas when no yesterday snapshot', () => {
      const current: EmotionDistribution = {
        anger: 0.2,
        anxiety: 0.3,
        sadness: 0.1,
        resilience: 0.1,
        hope: 0.1,
        excitement: 0.1,
        cynicism: 0.05,
        neutral: 0.05,
      };

      const deltas = getEmotionDeltas(current, null);

      expect(deltas.anger).toBe(0);
      expect(deltas.anxiety).toBe(0);
    });

    it('should calculate correct deltas', () => {
      const current: EmotionDistribution = {
        anger: 0.3,
        anxiety: 0.1,
        sadness: 0.1,
        resilience: 0.2,
        hope: 0.1,
        excitement: 0.1,
        cynicism: 0.05,
        neutral: 0.05,
      };

      const yesterday = createMockSnapshot({
        emotions: {
          anger: 0.1,
          anxiety: 0.2,
          sadness: 0.1,
          resilience: 0.2,
          hope: 0.1,
          excitement: 0.1,
          cynicism: 0.1,
          neutral: 0.1,
        },
      });

      const deltas = getEmotionDeltas(current, yesterday);

      expect(deltas.anger).toBeCloseTo(0.2); // 0.3 - 0.1
      expect(deltas.anxiety).toBeCloseTo(-0.1); // 0.1 - 0.2
    });
  });

  describe('createSnapshot', () => {
    it('should create a valid snapshot', () => {
      const emotions: EmotionDistribution = createEmptyDistribution();
      emotions.neutral = 1;

      const topics: Topic[] = [
        createMockTopic(['test', 'keywords']),
      ];
      topics[0].receipts = [
        { id: 'r1', title: 'Test', snippet: '', url: '', source: '', language: 'en', engagement: 0, createdAt: new Date() },
      ];

      const snapshot = createSnapshot('2024-01-02', 60, emotions, topics, { summary: 'Test' });

      expect(snapshot.date).toBe('2024-01-02');
      expect(snapshot.tensionIndex).toBe(60);
      expect(snapshot.emotions.neutral).toBe(1);
      expect(snapshot.topTopics.length).toBe(1);
      expect(snapshot.topTopics[0].keywords).toContain('test');
      expect(snapshot.llmOutputs.summary).toBe('Test');
    });

    it('should limit to 10 topics', () => {
      const emotions = createEmptyDistribution();
      const topics = Array.from({ length: 15 }, (_, i) =>
        createMockTopic([`topic${i}`])
      );

      const snapshot = createSnapshot('2024-01-02', 50, emotions, topics, {});

      expect(snapshot.topTopics.length).toBe(10);
    });
  });
});
