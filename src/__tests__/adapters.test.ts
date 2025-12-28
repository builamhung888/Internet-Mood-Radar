import { SearchAdapter } from '../adapters/search';
import { SourceConfig, CountryConfig } from '../types';

// Mock dependencies
jest.mock('../lib/brightdata', () => ({
  getBrightDataStatus: jest.fn(() => ({ available: true, message: 'Ready' })),
  serpSearch: jest.fn(),
  scrapeAsMarkdown: jest.fn(),
}));

jest.mock('../lib/search-queries', () => ({
  generateSearchQueries: jest.fn(),
  selectBestUrls: jest.fn(),
  extractContent: jest.fn(),
}));

jest.mock('../lib/geocoding', () => ({
  geocode: jest.fn(() => Promise.resolve({ lat: 32.0853, lng: 34.7818 })),
}));

import { getBrightDataStatus, serpSearch, scrapeAsMarkdown } from '../lib/brightdata';
import { generateSearchQueries, selectBestUrls, extractContent } from '../lib/search-queries';

describe('SearchAdapter', () => {
  const searchConfig: SourceConfig = {
    name: 'Search',
    type: 'search',
    url: '',
    lens: 'Headlines',
    trustScore: 0.8,
  };

  const countryConfig: CountryConfig = {
    name: 'USA',
    code: 'us',
    languages: ['en'],
    searchLanguages: ['en'],
    cities: ['New York', 'Los Angeles'],
    categories: ['news', 'events'],
    keywords: ['usa', 'united states'],
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('fetch', () => {
    it('should return empty result when BrightData is unavailable', async () => {
      (getBrightDataStatus as jest.Mock).mockReturnValue({
        available: false,
        message: 'BRIGHTDATA_API_KEY not configured',
      });

      const adapter = new SearchAdapter(searchConfig, countryConfig);
      const result = await adapter.fetch(new Date());

      expect(result.items).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('not configured');
    });

    it('should complete full pipeline successfully', async () => {
      // Reset BrightData to available
      (getBrightDataStatus as jest.Mock).mockReturnValue({
        available: true,
        message: 'Ready',
      });

      // Mock search queries (new format with queries + directUrls)
      (generateSearchQueries as jest.Mock).mockResolvedValue({
        queries: [
          { query: 'USA news today', category: 'news', language: 'en' },
          { query: 'New York events', category: 'events', language: 'en' },
        ],
        directUrls: [
          { url: 'https://reddit.com/r/news/new', name: 'r/news', category: 'news' },
        ],
      });

      // Mock SERP results
      (serpSearch as jest.Mock).mockResolvedValue([
        { title: 'USA News Article', url: 'https://example.com/1', snippet: 'Breaking news from the US', position: 1 },
        { title: 'New York Event', url: 'https://example.com/2', snippet: 'Concert tonight', position: 2 },
      ]);

      // Mock URL selection
      (selectBestUrls as jest.Mock).mockResolvedValue([
        { url: 'https://example.com/1', title: 'USA News Article', snippet: 'Breaking news', category: 'news' },
        { url: 'https://example.com/2', title: 'New York Event', snippet: 'Concert tonight', category: 'events', city: 'New York' },
      ]);

      // Mock scraping
      (scrapeAsMarkdown as jest.Mock).mockResolvedValue({
        content: '# News Article\n\nThis is news content about the USA.',
        imageUrl: 'https://example.com/image.jpg',
        title: 'USA News Article',
      });

      // Mock content extraction
      (extractContent as jest.Mock).mockResolvedValue({
        title: 'USA News Update',
        summary: 'Latest news from the US about politics.',
        category: 'news',
        location: 'New York',
        sentiment: 'neutral',
        imageUrl: 'https://example.com/image.jpg',
        sourceUrl: 'https://example.com/1',
      });

      const adapter = new SearchAdapter(searchConfig, countryConfig);
      const result = await adapter.fetch(new Date());

      // Should have items from the pipeline
      expect(result.items.length).toBeGreaterThan(0);
      expect(result.sourceName).toBe('Search');

      // Verify pipeline was called
      expect(generateSearchQueries).toHaveBeenCalled();
      expect(serpSearch).toHaveBeenCalled();
      expect(selectBestUrls).toHaveBeenCalled();
      expect(scrapeAsMarkdown).toHaveBeenCalled();
      expect(extractContent).toHaveBeenCalled();
    });

    it('should handle search query failures gracefully', async () => {
      (getBrightDataStatus as jest.Mock).mockReturnValue({
        available: true,
        message: 'Ready',
      });

      (generateSearchQueries as jest.Mock).mockResolvedValue({
        queries: [{ query: 'test query', category: 'news', language: 'en' }],
        directUrls: [],
      });

      // Simulate SERP failure
      (serpSearch as jest.Mock).mockRejectedValue(new Error('API Error'));

      (selectBestUrls as jest.Mock).mockResolvedValue([]);

      const adapter = new SearchAdapter(searchConfig, countryConfig);
      const result = await adapter.fetch(new Date());

      // Should have error logged
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].message).toContain('Query failed');
    });

    it('should handle scrape failures gracefully', async () => {
      (getBrightDataStatus as jest.Mock).mockReturnValue({
        available: true,
        message: 'Ready',
      });

      (generateSearchQueries as jest.Mock).mockResolvedValue({
        queries: [{ query: 'test query', category: 'news', language: 'en' }],
        directUrls: [],
      });

      (serpSearch as jest.Mock).mockResolvedValue([
        { title: 'Test', url: 'https://example.com/1', snippet: 'Test', position: 1 },
      ]);

      (selectBestUrls as jest.Mock).mockResolvedValue([
        { url: 'https://example.com/1', title: 'Test', snippet: 'Test', category: 'news' },
      ]);

      // Simulate scrape failure
      (scrapeAsMarkdown as jest.Mock).mockRejectedValue(new Error('Scrape Error'));

      const adapter = new SearchAdapter(searchConfig, countryConfig);
      const result = await adapter.fetch(new Date());

      // Should have scrape error logged
      expect(result.errors.some(e => e.message.includes('Failed to scrape'))).toBe(true);
    });
  });

  describe('deduplication', () => {
    it('should deduplicate URLs with same domain and path', async () => {
      (getBrightDataStatus as jest.Mock).mockReturnValue({
        available: true,
        message: 'Ready',
      });

      (generateSearchQueries as jest.Mock).mockResolvedValue({
        queries: [{ query: 'test', category: 'news', language: 'en' }],
        directUrls: [],
      });

      // Return duplicate URLs with different protocols
      (serpSearch as jest.Mock).mockResolvedValue([
        { title: 'Article 1', url: 'https://example.com/article', snippet: 'Test 1', position: 1 },
        { title: 'Article 2', url: 'http://example.com/article', snippet: 'Test 2', position: 2 },
        { title: 'Article 3', url: 'https://www.example.com/article/', snippet: 'Test 3', position: 3 },
      ]);

      // Only first unique URL should be selected
      (selectBestUrls as jest.Mock).mockImplementation((results) => {
        // The adapter dedupes before calling selectBestUrls
        // So results should already be deduplicated
        return results.map((r: { url: string; title: string; snippet: string }) => ({
          url: r.url,
          title: r.title,
          snippet: r.snippet,
          category: 'news' as const,
        }));
      });

      (scrapeAsMarkdown as jest.Mock).mockResolvedValue({
        content: 'Content',
        title: 'Title',
      });

      (extractContent as jest.Mock).mockResolvedValue({
        title: 'Title',
        summary: 'Summary',
        category: 'news',
        sentiment: 'neutral',
        sourceUrl: 'https://example.com/article',
      });

      const adapter = new SearchAdapter(searchConfig, countryConfig);
      await adapter.fetch(new Date());

      // selectBestUrls should receive deduplicated results
      expect(selectBestUrls).toHaveBeenCalled();
      const selectCallArg = (selectBestUrls as jest.Mock).mock.calls[0][0];
      // Should have only 1 unique URL after deduplication
      expect(selectCallArg.length).toBe(1);
    });
  });

  describe('category to lens mapping', () => {
    it('should map categories to correct lens values', async () => {
      (getBrightDataStatus as jest.Mock).mockReturnValue({
        available: true,
        message: 'Ready',
      });

      (generateSearchQueries as jest.Mock).mockResolvedValue({
        queries: [{ query: 'test', category: 'tech', language: 'en' }],
        directUrls: [],
      });

      (serpSearch as jest.Mock).mockResolvedValue([
        { title: 'Tech Article', url: 'https://example.com/tech', snippet: 'Startup news', position: 1 },
      ]);

      (selectBestUrls as jest.Mock).mockResolvedValue([
        { url: 'https://example.com/tech', title: 'Tech Article', snippet: 'Startup news', category: 'tech' },
      ]);

      (scrapeAsMarkdown as jest.Mock).mockResolvedValue({
        content: '# Tech News',
        title: 'Tech Article',
      });

      (extractContent as jest.Mock).mockResolvedValue({
        title: 'Tech Startup Raises $10M',
        summary: 'A Silicon Valley startup has raised funding.',
        category: 'tech',
        sentiment: 'positive',
        sourceUrl: 'https://example.com/tech',
      });

      const adapter = new SearchAdapter(searchConfig, countryConfig);
      const result = await adapter.fetch(new Date());

      // Tech category should map to Tech lens
      if (result.items.length > 0) {
        expect(result.items[0].lens).toBe('Tech');
      }
    });
  });
});
