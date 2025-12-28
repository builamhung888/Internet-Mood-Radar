import {
  scoreItemEmotions,
  aggregateEmotions,
  calculateTensionIndex,
  normalizeDistribution,
  getDominantEmotion,
  createEmptyDistribution,
} from '../lib/mood';
import { NormalizedItem, EmotionDistribution } from '../types';

describe('Mood Engine', () => {
  const createMockItem = (
    title: string,
    text: string,
    engagement: number = 10
  ): NormalizedItem => ({
    id: 'test',
    source: 'rss',
    lens: 'Headlines',
    language: 'en',
    title,
    text,
    createdAt: new Date(),
    url: 'https://example.com',
    engagement,
    context: 'Test Source',
    relevanceScore: 0.8,
  });

  describe('scoreItemEmotions', () => {
    it('should detect anger in text', () => {
      const item = createMockItem('Angry protesters', 'Furious response to decision');
      const emotions = scoreItemEmotions(item);

      expect(emotions.anger).toBeGreaterThan(0);
    });

    it('should detect anxiety in text', () => {
      const item = createMockItem('Rocket alert', 'Sirens heard, residents seek shelter');
      const emotions = scoreItemEmotions(item);

      expect(emotions.anxiety).toBeGreaterThan(0);
    });

    it('should detect hope in text', () => {
      const item = createMockItem('Peace talks progress', 'Optimistic outlook for negotiations');
      const emotions = scoreItemEmotions(item);

      expect(emotions.hope).toBeGreaterThan(0);
    });

    it('should detect resilience in text', () => {
      const item = createMockItem('Community stands strong', 'United and resilient');
      const emotions = scoreItemEmotions(item);

      expect(emotions.resilience).toBeGreaterThan(0);
    });

    it('should mark neutral for no emotional keywords', () => {
      const item = createMockItem('Weather report', 'Sunny with clouds');
      const emotions = scoreItemEmotions(item);

      expect(emotions.neutral).toBe(1);
    });

    it('should normalize to sum of 1', () => {
      const item = createMockItem('Angry and worried', 'Furious and anxious about danger');
      const emotions = scoreItemEmotions(item);

      const sum = Object.values(emotions).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1, 5);
    });

    it('should detect anxiety emotion keywords', () => {
      // Test with English keywords (Hebrew content is translated before emotion scoring)
      const item = createMockItem('Siren alert in Tel Aviv', 'Fear and shelter evacuation');
      const emotions = scoreItemEmotions(item);

      expect(emotions.anxiety).toBeGreaterThan(0);
    });
  });

  describe('aggregateEmotions', () => {
    it('should return neutral for empty array', () => {
      const emotions = aggregateEmotions([]);
      expect(emotions.neutral).toBe(1);
    });

    it('should weight recent items more heavily', () => {
      const recentItem = createMockItem('Angry news', 'Outrage');
      recentItem.createdAt = new Date();

      const oldItem = createMockItem('Happy news', 'Hope and excitement');
      oldItem.createdAt = new Date(Date.now() - 24 * 60 * 60 * 1000);

      const emotions = aggregateEmotions([recentItem, oldItem]);

      // Recent angry item should have more weight
      expect(emotions.anger).toBeGreaterThan(emotions.hope);
    });

    it('should skip duplicate items', () => {
      const original = createMockItem('Angry news', 'Outrage');
      const duplicate = { ...createMockItem('Same story', 'Outrage'), duplicateOf: 'original' };

      const withDupe = aggregateEmotions([original, duplicate]);
      const withoutDupe = aggregateEmotions([original]);

      // Should be the same since duplicate is skipped
      expect(withDupe.anger).toBeCloseTo(withoutDupe.anger, 5);
    });

    it('should always sum to 1', () => {
      const items = [
        createMockItem('Angry news', 'Outrage'),
        createMockItem('Sad news', 'Tragic loss'),
        createMockItem('Happy news', 'Hope'),
      ];

      const emotions = aggregateEmotions(items);
      const sum = Object.values(emotions).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1, 5);
    });
  });

  describe('calculateTensionIndex', () => {
    it('should return 0 for fully neutral emotions', () => {
      const emotions = createEmptyDistribution();
      emotions.neutral = 1;
      const tension = calculateTensionIndex(emotions);
      expect(tension).toBe(0);
    });

    it('should return high tension for anger and anxiety', () => {
      const emotions = createEmptyDistribution();
      emotions.anger = 0.5;
      emotions.anxiety = 0.5;
      const tension = calculateTensionIndex(emotions);
      expect(tension).toBeGreaterThan(50);
    });

    it('should reduce tension with hope and resilience', () => {
      const anxious = createEmptyDistribution();
      anxious.anxiety = 0.5;
      anxious.anger = 0.5;

      const balanced = createEmptyDistribution();
      balanced.anxiety = 0.3;
      balanced.anger = 0.3;
      balanced.hope = 0.2;
      balanced.resilience = 0.2;

      const tensionAnxious = calculateTensionIndex(anxious);
      const tensionBalanced = calculateTensionIndex(balanced);

      expect(tensionBalanced).toBeLessThan(tensionAnxious);
    });

    it('should cap at 100', () => {
      const extreme = createEmptyDistribution();
      extreme.anger = 1;
      const tension = calculateTensionIndex(extreme);
      expect(tension).toBeLessThanOrEqual(100);
    });

    it('should not go below 0', () => {
      const hopeful = createEmptyDistribution();
      hopeful.hope = 1;
      const tension = calculateTensionIndex(hopeful);
      expect(tension).toBeGreaterThanOrEqual(0);
    });
  });

  describe('normalizeDistribution', () => {
    it('should normalize to sum of 1', () => {
      const dist: EmotionDistribution = {
        anger: 10,
        anxiety: 20,
        sadness: 5,
        resilience: 5,
        hope: 5,
        excitement: 2,
        cynicism: 3,
        neutral: 0,
      };

      const normalized = normalizeDistribution(dist);
      const sum = Object.values(normalized).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1, 5);
    });

    it('should preserve ratios', () => {
      const dist: EmotionDistribution = {
        anger: 10,
        anxiety: 20,
        sadness: 0,
        resilience: 0,
        hope: 0,
        excitement: 0,
        cynicism: 0,
        neutral: 0,
      };

      const normalized = normalizeDistribution(dist);
      expect(normalized.anxiety / normalized.anger).toBeCloseTo(2, 5);
    });

    it('should return neutral=1 for zero distribution', () => {
      const dist = createEmptyDistribution();
      const normalized = normalizeDistribution(dist);
      expect(normalized.neutral).toBe(1);
    });
  });

  describe('getDominantEmotion', () => {
    it('should return emotion with highest value', () => {
      const dist = createEmptyDistribution();
      dist.anger = 0.5;
      dist.anxiety = 0.3;
      dist.neutral = 0.2;

      expect(getDominantEmotion(dist)).toBe('anger');
    });

    it('should return neutral for empty distribution', () => {
      const dist = createEmptyDistribution();
      expect(getDominantEmotion(dist)).toBe('neutral');
    });
  });
});
