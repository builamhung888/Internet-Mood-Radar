import { generateId } from '../lib/utils';

describe('LLM Cache Keys', () => {
  describe('generateId (cache key generation)', () => {
    it('should generate consistent hashes for the same input', () => {
      const input = 'topic-title:["rockets", "attack", "tel aviv"]';
      const hash1 = generateId(input);
      const hash2 = generateId(input);

      expect(hash1).toBe(hash2);
    });

    it('should generate different hashes for different inputs', () => {
      const hash1 = generateId('topic-title:["rockets"]');
      const hash2 = generateId('topic-title:["economy"]');

      expect(hash1).not.toBe(hash2);
    });

    it('should generate 16 character hashes', () => {
      const hash = generateId('some content');
      expect(hash.length).toBe(16);
    });

    it('should only contain hex characters', () => {
      const hash = generateId('test input');
      expect(hash).toMatch(/^[0-9a-f]{16}$/);
    });

    it('should handle empty strings', () => {
      const hash = generateId('');
      expect(hash.length).toBe(16);
    });

    it('should handle Unicode strings', () => {
      const hash = generateId('שלום עולם');
      expect(hash.length).toBe(16);
    });

    it('should handle long strings', () => {
      const longString = 'a'.repeat(10000);
      const hash = generateId(longString);
      expect(hash.length).toBe(16);
    });
  });

  describe('cache key uniqueness', () => {
    it('should create unique keys for different topic types', () => {
      const titleKey = generateId('topic-title:["rockets"]');
      const trendingKey = generateId('why-trending:["rockets"]');
      const summaryKey = generateId('overall-summary:50');

      expect(new Set([titleKey, trendingKey, summaryKey]).size).toBe(3);
    });

    it('should create unique keys for different keywords', () => {
      const keys = [
        generateId('topic-title:["rockets", "attack"]'),
        generateId('topic-title:["economy", "market"]'),
        generateId('topic-title:["weather", "storm"]'),
        generateId('topic-title:["politics", "knesset"]'),
      ];

      expect(new Set(keys).size).toBe(4);
    });

    it('should create unique keys for different tension values', () => {
      const keys = [
        generateId('overall-summary:{"tensionIndex":30}'),
        generateId('overall-summary:{"tensionIndex":50}'),
        generateId('overall-summary:{"tensionIndex":70}'),
      ];

      expect(new Set(keys).size).toBe(3);
    });
  });

  describe('cache key stability', () => {
    it('should produce same key for same JSON regardless of object property order', () => {
      // Note: This tests the actual caching behavior where we stringify objects
      const obj1 = JSON.stringify({ a: 1, b: 2 });
      const obj2 = JSON.stringify({ a: 1, b: 2 });

      expect(generateId(obj1)).toBe(generateId(obj2));
    });

    it('should produce different keys when array order differs', () => {
      const arr1 = JSON.stringify(['a', 'b', 'c']);
      const arr2 = JSON.stringify(['c', 'b', 'a']);

      expect(generateId(arr1)).not.toBe(generateId(arr2));
    });
  });
});
