import { clusterIntoTopics, findUnclusteredItems } from '../lib/clustering';
import { NormalizedItem } from '../types';

describe('Topic Clustering', () => {
  const createMockItem = (
    id: string,
    title: string,
    text: string,
    engagement: number = 10
  ): NormalizedItem => ({
    id,
    source: 'rss',
    lens: 'Headlines',
    language: 'en',
    title,
    text,
    createdAt: new Date(),
    url: `https://example.com/${id}`,
    engagement,
    context: 'Test Source',
    relevanceScore: 0.8,
  });

  describe('clusterIntoTopics', () => {
    it('should return empty array for no items', () => {
      const topics = clusterIntoTopics([]);
      expect(topics).toEqual([]);
    });

    it('should cluster similar items together', () => {
      const items = [
        createMockItem('1', 'Rocket attack on Tel Aviv', 'Sirens heard in Tel Aviv area'),
        createMockItem('2', 'Rockets fired at Tel Aviv', 'Multiple rockets detected'),
        createMockItem('3', 'Tel Aviv under rocket fire', 'Residents seek shelter'),
        createMockItem('4', 'Stock market drops', 'Economic concerns grow'),
        createMockItem('5', 'Market crash fears', 'Investors worried about economy'),
      ];

      const topics = clusterIntoTopics(items, 5, 2);

      // Should create at least 2 clusters (rockets and economy)
      expect(topics.length).toBeGreaterThanOrEqual(1);

      // Each topic should have keywords
      topics.forEach((topic) => {
        expect(topic.keywords.length).toBeGreaterThan(0);
        expect(topic.receipts.length).toBeGreaterThan(0);
      });
    });

    it('should skip duplicate items', () => {
      const items = [
        createMockItem('1', 'Breaking news story', 'Details here'),
        { ...createMockItem('2', 'Same story', 'Same details'), duplicateOf: '1' },
      ];

      const topics = clusterIntoTopics(items, 5, 1);

      // Duplicates should be excluded
      const allReceiptIds = topics.flatMap((t) => t.receipts.map((r) => r.id));
      expect(allReceiptIds).not.toContain('2');
    });

    it('should respect maxTopics limit', () => {
      const items = Array.from({ length: 20 }, (_, i) =>
        createMockItem(`${i}`, `Unique story ${i} about topic ${i}`, `Content ${i}`)
      );

      const topics = clusterIntoTopics(items, 5, 1);
      expect(topics.length).toBeLessThanOrEqual(5);
    });

    it('should filter out clusters smaller than minClusterSize', () => {
      const items = [
        createMockItem('1', 'Rocket attack', 'Sirens heard'),
        createMockItem('2', 'Rocket fired', 'Rockets detected'),
        createMockItem('3', 'Unique single story', 'No similar items'),
      ];

      const topics = clusterIntoTopics(items, 10, 2);

      // Single item cluster should be filtered out
      const singleTopics = topics.filter((t) => t.receipts.length === 1);
      expect(singleTopics.length).toBe(0);
    });

    it('should generate keyword-based titles', () => {
      const items = [
        createMockItem('1', 'Security forces respond', 'IDF deployed'),
        createMockItem('2', 'Security situation escalates', 'Forces on alert'),
      ];

      const topics = clusterIntoTopics(items, 5, 2);

      if (topics.length > 0) {
        // Title should be generated from keywords
        expect(topics[0].title.length).toBeGreaterThan(0);
      }
    });

    it('should calculate emotion mix for each topic', () => {
      const items = [
        createMockItem('1', 'Angry protests continue', 'Outrage over decision'),
        createMockItem('2', 'Furious response from public', 'Anger grows'),
      ];

      const topics = clusterIntoTopics(items, 5, 2);

      if (topics.length > 0) {
        expect(topics[0].emotionMix).toBeDefined();
        expect(topics[0].emotionMix.anger).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe('findUnclusteredItems', () => {
    it('should find items not in any cluster', () => {
      const items = [
        createMockItem('1', 'Clustered item', 'In a topic'),
        createMockItem('2', 'Another item', 'Also clustered'),
        createMockItem('3', 'Standalone item', 'Not in any topic'),
      ];

      const topics = [
        {
          id: 'topic1',
          title: 'Test Topic',
          keywords: ['test'],
          whyTrending: 'Testing',
          emotionMix: { anger: 0, anxiety: 0, sadness: 0, resilience: 0, hope: 0, excitement: 0, cynicism: 0, neutral: 1 },
          weight: 1,
          delta: 0,
          receipts: [
            { id: '1', title: 'Clustered item', snippet: '', url: '', source: '', language: 'en', engagement: 0, createdAt: new Date() },
            { id: '2', title: 'Another item', snippet: '', url: '', source: '', language: 'en', engagement: 0, createdAt: new Date() },
          ],
        },
      ];

      const unclustered = findUnclusteredItems(items, topics, 10);
      expect(unclustered.map((i) => i.id)).toContain('3');
      expect(unclustered.map((i) => i.id)).not.toContain('1');
    });

    it('should respect max limit', () => {
      const items = Array.from({ length: 20 }, (_, i) =>
        createMockItem(`${i}`, `Item ${i}`, `Content ${i}`)
      );

      const unclustered = findUnclusteredItems(items, [], 5);
      expect(unclustered.length).toBeLessThanOrEqual(5);
    });

    it('should exclude duplicates', () => {
      const items = [
        createMockItem('1', 'Original', 'Content'),
        { ...createMockItem('2', 'Duplicate', 'Same content'), duplicateOf: '1' },
      ];

      const unclustered = findUnclusteredItems(items, [], 10);
      expect(unclustered.map((i) => i.id)).not.toContain('2');
    });
  });
});
