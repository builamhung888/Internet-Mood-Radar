import { scoreRelevance, calculateSimilarity, deduplicateItems, setRelevanceKeywords } from '../lib/relevance';
import { NormalizedItem } from '../types';

describe('Relevance Scoring', () => {
  // Set up keywords before running tests (simulates what fetchAllSources does)
  beforeAll(() => {
    setRelevanceKeywords([
      'usa', 'united states', 'american', 'washington', 'new york', 'california',
      'congress', 'white house', 'senate', 'federal', 'biden', 'trump',
      'economy', 'politics', 'breaking news',
    ]);
  });

  const createMockItem = (
    title: string,
    text: string,
    context: string = 'Test Source'
  ): NormalizedItem => ({
    id: 'test',
    source: 'rss',
    lens: 'Headlines',
    language: 'en',
    title,
    text,
    createdAt: new Date(),
    url: 'https://example.com',
    engagement: 10,
    context,
  });

  describe('scoreRelevance', () => {
    it('should give high score to region-related content', () => {
      const item = createMockItem(
        'Breaking: Congress passes new bill',
        'United States lawmakers in Washington area'
      );
      const score = scoreRelevance(item);
      expect(score).toBeGreaterThan(0.5);
    });

    it('should give low score to non-region content', () => {
      const item = createMockItem(
        'Weather in Paris',
        'Sunny skies expected in France'
      );
      const score = scoreRelevance(item);
      expect(score).toBeLessThan(0.5);
    });

    it('should boost score for search source items', () => {
      const searchItem: NormalizedItem = {
        ...createMockItem('News story', 'Content'),
        source: 'search',
      };
      const rssItem: NormalizedItem = {
        ...createMockItem('News story', 'Content'),
        source: 'rss',
      };

      const searchScore = scoreRelevance(searchItem);
      const rssScore = scoreRelevance(rssItem);

      // Search items get a small boost
      expect(searchScore).toBeGreaterThan(rssScore);
    });

    it('should cap score at 1', () => {
      const item = createMockItem(
        'USA United States Congress Washington New York Biden Trump',
        'Full of keywords: USA American Washington Congress Senate',
        'CNN Breaking News'
      );
      const score = scoreRelevance(item);
      expect(score).toBeLessThanOrEqual(1);
    });
  });

  describe('calculateSimilarity', () => {
    it('should return 1 for identical URLs', () => {
      const a = { ...createMockItem('Title A', 'Text A'), url: 'https://example.com/same' };
      const b = { ...createMockItem('Title B', 'Text B'), url: 'https://example.com/same' };
      expect(calculateSimilarity(a, b)).toBe(1);
    });

    it('should return high similarity for near-identical titles', () => {
      const a = createMockItem('Breaking: Storm hits New York', 'Details');
      const b = createMockItem('Breaking: Storm in New York', 'More details');
      expect(calculateSimilarity(a, b)).toBeGreaterThan(0.6);
    });

    it('should return low similarity for different topics', () => {
      const a = { ...createMockItem('Storm hits city', 'Weather incident'), url: 'https://example.com/1' };
      const b = { ...createMockItem('Stock market crashes', 'Economic news'), url: 'https://example.com/2' };
      expect(calculateSimilarity(a, b)).toBeLessThan(0.3);
    });

    it('should handle empty text', () => {
      const a = createMockItem('Title only', '');
      const b = createMockItem('Title only', '');
      expect(calculateSimilarity(a, b)).toBeGreaterThan(0.8);
    });
  });

  describe('deduplicateItems', () => {
    it('should remove duplicates and keep higher engagement item', () => {
      const items: NormalizedItem[] = [
        { ...createMockItem('Breaking news story', 'Details here'), id: '1', engagement: 100 },
        { ...createMockItem('Breaking news story', 'Same details'), id: '2', engagement: 50 },
      ];

      const deduped = deduplicateItems(items);

      // Should only contain the higher engagement item
      expect(deduped.length).toBe(1);
      expect(deduped[0].id).toBe('1');
      expect(deduped[0].engagement).toBe(100);
    });

    it('should keep unique items unchanged', () => {
      const items: NormalizedItem[] = [
        { ...createMockItem('Storm warning', 'Weather'), id: '1', url: 'https://example.com/1' },
        { ...createMockItem('Market news', 'Economy'), id: '2', url: 'https://example.com/2' },
        { ...createMockItem('Sports update', 'Game'), id: '3', url: 'https://example.com/3' },
      ];

      const deduped = deduplicateItems(items);

      expect(deduped.length).toBe(3);
    });

    it('should respect similarity threshold', () => {
      const items: NormalizedItem[] = [
        { ...createMockItem('Storm warning', 'Details'), id: '1', engagement: 100, url: 'https://example.com/1' },
        { ...createMockItem('Storm alert', 'Similar'), id: '2', engagement: 50, url: 'https://example.com/2' },
      ];

      // With high threshold, both items should be kept (not similar enough)
      const dedupedHigh = deduplicateItems(items, 0.9);
      expect(dedupedHigh.length).toBe(2);

      // With low threshold, only one item should remain (duplicate removed)
      const dedupedLow = deduplicateItems(items, 0.3);
      expect(dedupedLow.length).toBe(1);
    });
  });
});
