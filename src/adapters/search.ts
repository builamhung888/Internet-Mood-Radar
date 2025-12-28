/**
 * Search Adapter - Dynamic search-based data collection
 *
 * Pipeline:
 * 1. Generate search queries + direct URLs (LLM discovers platforms with URLs)
 * 2. Run SERP searches in parallel (BrightData) - worker pool
 * 3. Merge direct URLs with SERP results
 * 4. Deduplicate URLs
 * 5. LLM selects best URLs
 * 6. Scrape selected URLs (BrightData) - worker pool
 * 7. Extract & summarize content (LLM) - worker pool
 */

import { BaseAdapter } from './base';
import {
  FetchResult,
  NormalizedItem,
  SourceConfig,
  CountryConfig,
  ContentCategory,
  NonFatalError,
} from '@/types';
import {
  serpSearch,
  scrapeAsMarkdown,
  SerpResult,
  getBrightDataStatus,
} from '@/lib/brightdata';
import {
  generateSearchQueries,
  selectBestUrls,
  extractContent,
} from '@/lib/search-queries';
import { COUNTRY_CONFIG, SEARCH_SETTINGS } from '@/lib/config';
import { generateId, getFaviconUrl } from '@/lib/utils';
import { detectLanguage } from '@/lib/language';
import { geocode } from '@/lib/geocoding';
import { workerPoolCollect } from '@/lib/worker-pool';
import { getRecentlyScrapedUrls } from '@/lib/history';
import { normalizeUrl } from '@/lib/utils/url';

// Types for internal use
interface UrlToScrape {
  url: string;
  title: string;
  snippet: string;
  category: ContentCategory;
}

interface ScrapedContent {
  url: string;
  content: string;
  imageUrl?: string;
  title?: string;
  category: ContentCategory;
}

interface SearchSettings {
  maxQueries?: number;
  maxUrlsToScrape?: number;
  uiLanguage?: string; // Language for extracted content (en, he, ru)
}

export class SearchAdapter extends BaseAdapter {
  private countryConfig: CountryConfig;
  private settings: SearchSettings;

  constructor(
    config: SourceConfig,
    countryConfig: CountryConfig = COUNTRY_CONFIG,
    settings: SearchSettings = {}
  ) {
    super(config);
    this.countryConfig = countryConfig;
    this.settings = settings;
  }

  async fetch(since: Date): Promise<FetchResult> {
    const errors: NonFatalError[] = [];

    // Check BrightData availability
    const bdStatus = getBrightDataStatus();
    if (!bdStatus.available) {
      return this.emptyResult(bdStatus.message);
    }

    console.log('\n[SEARCH] ═══════════════════════════════════════════════════════');
    console.log(`[SEARCH] Starting search-based collection for ${this.countryConfig.name}`);
    console.log('[SEARCH] ───────────────────────────────────────────────────────');

    // Step 1: Generate search queries + direct URLs from platform targets
    console.log('[SEARCH] Step 1: Generating search queries and discovering direct URLs...');
    const { queries, directUrls } = await generateSearchQueries(this.countryConfig, this.settings.maxQueries);
    console.log(`[SEARCH] Generated ${queries.length} queries + ${directUrls.length} direct URLs`);

    // Step 2: Run SERP searches with worker pool (continuous parallel processing)
    console.log(`[SEARCH] Step 2: Running SERP searches (${SEARCH_SETTINGS.maxConcurrentSearches} workers)...`);
    const serpResults = await this.runSearches(queries, errors);
    console.log(`[SEARCH] Got ${serpResults.length} SERP results`);

    // Step 3: Merge direct URLs with SERP results
    console.log('[SEARCH] Step 3: Merging direct URLs with SERP results...');
    const directAsSerpResults: SerpResult[] = directUrls.map((d, i) => ({
      url: d.url,
      title: d.name,
      snippet: `Direct source: ${d.name}`,
      position: i, // Direct URLs get priority positions
    }));
    const allResults = [...directAsSerpResults, ...serpResults];
    console.log(`[SEARCH] Total: ${allResults.length} URLs (${directUrls.length} direct + ${serpResults.length} from SERP)`);

    // Step 4: Deduplicate URLs
    console.log('[SEARCH] Step 4: Deduplicating URLs...');
    const uniqueResults = this.deduplicateResults(allResults);
    console.log(`[SEARCH] ${uniqueResults.length} unique URLs after dedup`);

    // Step 4b: Filter out already-scraped URLs (skip URLs scraped in last 7 days)
    console.log('[SEARCH] Step 4b: Filtering already-scraped URLs...');
    const existingUrls = await getRecentlyScrapedUrls();
    const newResults = uniqueResults.filter(r => {
      const normalized = normalizeUrl(r.url);
      return !existingUrls.has(normalized);
    });
    const skippedCount = uniqueResults.length - newResults.length;
    console.log(`[SEARCH] ${skippedCount} URLs already scraped, ${newResults.length} new URLs to process`);

    // Step 5: LLM selects best URLs from new (not previously scraped) results
    const maxUrls = this.settings.maxUrlsToScrape ?? SEARCH_SETTINGS.maxUrlsToScrape;
    console.log('[SEARCH] Step 5: Selecting best URLs with LLM...');
    const selectedUrls = await selectBestUrls(
      newResults,
      this.countryConfig,
      maxUrls
    );
    console.log(`[SEARCH] Selected ${selectedUrls.length} URLs to scrape`);

    // Step 6: Scrape with worker pool (continuous parallel processing)
    console.log(`[SEARCH] Step 6: Scraping URLs (${SEARCH_SETTINGS.maxConcurrentScrapes} workers)...`);
    const scrapedContent = await this.scrapeUrls(selectedUrls, errors);
    console.log(`[SEARCH] Scraped ${scrapedContent.length} pages`);

    // Step 7: Extract & normalize with worker pool
    console.log(`[SEARCH] Step 7: Extracting and normalizing content...`);
    const items = await this.extractAndNormalize(scrapedContent, errors);
    console.log(`[SEARCH] Extracted ${items.length} items`);

    console.log('[SEARCH] ───────────────────────────────────────────────────────');
    console.log(`[SEARCH] Complete: ${items.length} items, ${errors.length} errors`);
    console.log('[SEARCH] ═══════════════════════════════════════════════════════\n');

    return {
      items,
      errors,
      sourceName: this.config.name,
    };
  }

  /**
   * Step 2: Run all search queries with worker pool
   * Workers continuously pull from queue as they complete
   */
  private async runSearches(
    queries: { query: string; category: ContentCategory; language: string }[],
    errors: NonFatalError[]
  ): Promise<SerpResult[]> {
    const allResults: SerpResult[] = [];
    let completed = 0;

    const results = await workerPoolCollect(
      queries,
      async (q, index) => {
        const searchResults = await serpSearch(q.query, {
          country: this.countryConfig.code,
          language: q.language,
          numResults: 10,
        });
        completed++;
        console.log(`[SEARCH]   ✓ Search ${completed}/${queries.length}: "${q.query.slice(0, 40)}..." → ${searchResults.length} results`);
        return searchResults;
      },
      SEARCH_SETTINGS.maxConcurrentSearches,
      (q, index, error) => {
        errors.push({
          source: 'Search',
          message: `Query failed: "${q.query}" - ${error.message}`,
          timestamp: new Date(),
        });
      }
    );

    // Flatten results
    for (const r of results) {
      allResults.push(...r);
    }

    return allResults;
  }

  /**
   * Step 3-4: Deduplicate search results by URL
   */
  private deduplicateResults(results: SerpResult[]): SerpResult[] {
    const seen = new Set<string>();
    const unique: SerpResult[] = [];

    for (const result of results) {
      const normalizedUrl = normalizeUrl(result.url);

      if (!seen.has(normalizedUrl)) {
        seen.add(normalizedUrl);
        unique.push(result);
      }
    }

    // Sort by position (higher ranked results first)
    return unique.sort((a, b) => a.position - b.position);
  }

  /**
   * Step 6: Scrape URLs with worker pool
   * Workers continuously pull from queue as they complete
   */
  private async scrapeUrls(
    urls: UrlToScrape[],
    errors: NonFatalError[]
  ): Promise<ScrapedContent[]> {
    let completed = 0;

    const results = await workerPoolCollect(
      urls,
      async (urlInfo, index) => {
        const result = await scrapeAsMarkdown(urlInfo.url);
        completed++;
        const domain = new URL(urlInfo.url).hostname.replace('www.', '');
        const contentSize = result.content?.length || 0;
        const sizeKb = (contentSize / 1024).toFixed(1);
        const status = contentSize > 500 ? '✓' : contentSize > 0 ? '⚠' : '✗';
        console.log(`[SEARCH]   ${status} Scrape ${completed}/${urls.length}: ${domain} (${sizeKb}KB)`);
        return {
          url: urlInfo.url,
          content: result.content,
          imageUrl: result.imageUrl,
          title: result.title || urlInfo.title,
          category: urlInfo.category,
        };
      },
      SEARCH_SETTINGS.maxConcurrentScrapes,
      (urlInfo, index, error) => {
        errors.push({
          source: 'Scrape',
          message: `Failed to scrape: ${urlInfo.url} - ${error.message}`,
          timestamp: new Date(),
        });
      }
    );

    // Summary of scraping results
    const totalSize = results.reduce((sum, r) => sum + (r.content?.length || 0), 0);
    const withContent = results.filter(r => (r.content?.length || 0) > 500).length;
    const emptyOrSmall = results.filter(r => (r.content?.length || 0) <= 500).length;
    console.log(`[SEARCH] Scrape summary: ${withContent}/${results.length} with content (${emptyOrSmall} empty/small), total ${(totalSize / 1024).toFixed(0)}KB`);

    return results;
  }

  /**
   * Step 7: Extract content and convert to NormalizedItems
   * Uses worker pool for parallel LLM extraction
   */
  private async extractAndNormalize(
    scrapedContent: ScrapedContent[],
    errors: NonFatalError[]
  ): Promise<NormalizedItem[]> {
    let completed = 0;

    const extractedItems = await workerPoolCollect(
      scrapedContent,
      async (scraped, index) => {
        const extracted = await extractContent(
          scraped.content,
          scraped.url,
          scraped.imageUrl,
          this.countryConfig,
          this.settings.uiLanguage || 'en',
          scraped.category  // Pass original category from query as hint
        );

        if (!extracted) {
          throw new Error('Extraction returned null');
        }

        completed++;
        console.log(`[SEARCH]   ✓ Extract ${completed}/${scrapedContent.length}: ${extracted.title.slice(0, 50)}...`);

        // Map category to lens
        const lens = this.categoryToLens(extracted.category);

        // Detect language from title
        const language = detectLanguage(extracted.title + ' ' + extracted.summary);

        // Geocode location if present
        let location;
        if (extracted.location) {
          const coords = await geocode(extracted.location);
          if (coords) {
            location = {
              name: extracted.location,
              lat: coords.lat,
              lng: coords.lng,
              // Use country from geocoding result, fallback to config region name
              country: coords.country || this.countryConfig.name,
              // Always track which region this search was for
              region: this.countryConfig.name,
            };
          }
        }

        // Set source to 'events' for event items so they show as purple circles on map
        const source = extracted.category === 'events' ? 'events' : 'search';

        const item: NormalizedItem = {
          id: generateId(`search:${scraped.url}`),
          source,
          lens,
          language,
          title: extracted.title,
          text: extracted.summary,
          createdAt: new Date(),
          url: scraped.url,
          engagement: extracted.engagement, // LLM-extracted engagement metrics (upvotes, likes, comments)
          context: `Search: ${extracted.category}`,
          imageUrl: extracted.imageUrl,
          faviconUrl: getFaviconUrl(scraped.url),
          location,
          moodScore: extracted.moodScore, // LLM-assigned mood score (0-100)
        };

        // Add event date if present
        if (extracted.eventDate) {
          item.eventDate = extracted.eventDate;
        }

        return item;
      },
      SEARCH_SETTINGS.maxConcurrentScrapes, // Use same concurrency for LLM calls
      (scraped, index, error) => {
        errors.push({
          source: 'Extract',
          message: `Failed to extract: ${scraped.url} - ${error.message}`,
          timestamp: new Date(),
        });
      }
    );

    return extractedItems;
  }

  /**
   * Map content category to lens
   */
  private categoryToLens(category: ContentCategory): NormalizedItem['lens'] {
    switch (category) {
      case 'events':
        return 'Events';
      case 'tech':
        return 'Tech';
      case 'weather':
        return 'Weather';
      case 'social':
        return 'Conversation';
      case 'news':
      default:
        return 'Headlines';
    }
  }
}
