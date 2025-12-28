/**
 * Platform Source Discovery
 *
 * Uses LLM to dynamically discover the best platforms/sources for each
 * content category in a given country. Results are cached for 7 days.
 *
 * NO HARDCODED FALLBACKS - if LLM fails, returns empty array and
 * query generators should use generic country-based queries.
 */

import { prisma } from '@/lib/db';
import { ContentCategory } from '@/types';
import { rateLimitedChatCompletion, isOpenAIConfigured } from '@/lib/openai-client';

const CACHE_TTL_DAYS = 7;

export interface TargetSource {
  name: string;               // e.g., "r/news" (for display/logging)
  url: string;                // e.g., "https://reddit.com/r/news/new" (for direct scraping)
}

export interface PlatformSource {
  platform: string;           // "Reddit", "X", "Telegram", "Instagram", etc.
  sitePattern: string;        // "site:reddit.com" or "site:t.me"
  specificTargets: TargetSource[];  // Targets with full URLs for direct scraping
  queryHints: string[];       // Platform-specific search tips
}

export interface CategorySources {
  category: ContentCategory;
  country: string;
  sources: PlatformSource[];
}


/**
 * Get the best platforms/sources for a category in a country via LLM
 * Cached for 7 days. If LLM fails, returns empty sources array.
 */
export async function getCategorySources(
  category: ContentCategory,
  countryName: string,
  maxSources: number = 4
): Promise<CategorySources> {
  // v2 cache key - new format with full URLs
  const cacheKey = `platform-sources-v2:${category}:${countryName.toLowerCase()}:${maxSources}`;

  // Check cache first
  const cached = await getCachedSources(cacheKey);
  if (cached) {
    console.log(`[SOURCES] ${countryName} ${category} (cached): ${cached.sources.map(s => s.platform).join(', ')}`);
    return cached;
  }

  if (!isOpenAIConfigured()) {
    console.log(`[SOURCES] ${countryName} ${category}: No API key, returning empty sources`);
    return { category, country: countryName, sources: [] };
  }

  const categoryDescriptions: Record<ContentCategory, string> = {
    news: 'breaking news, politics, security, economy, current events',
    social: 'social media discussions, public opinion, community forums, Reddit, X/Twitter, Telegram, Facebook groups',
    events: 'concerts, festivals, sports events, protests, cultural events, nightlife',
    tech: 'startups, tech industry, funding news, innovation, tech blogs',
    weather: 'weather forecasts, weather alerts, meteorological services',
  };

  const prompt = `What are the ${maxSources} best online platforms and specific communities for finding ${categoryDescriptions[category]} about ${countryName}?

For each platform, provide:
1. Platform name (e.g., Reddit, X/Twitter, Telegram, Instagram, Facebook, TikTok, news sites, blogs)
2. The Google search site: pattern to target this platform
3. Specific communities with FULL SCRAPEABLE URLs:
   - Reddit: Use /new suffix for latest (e.g., https://reddit.com/r/news/new)
   - Telegram: Use /s/ for public view (e.g., https://t.me/s/channelname)
   - X/Twitter: Full profile URL (e.g., https://x.com/username)
   - Facebook: Full page URL (e.g., https://facebook.com/pagename)
   - News sites: Full homepage or section URL (e.g., https://cnn.com/world)
4. Tips for searching this platform effectively

Consider:
- Which platforms are most popular in ${countryName}
- Which have the most active ${category} content
- Both local-language and English sources

Return ONLY a valid JSON object with this exact structure:
{
  "sources": [
    {
      "platform": "Platform Name",
      "sitePattern": "site:domain.com",
      "specificTargets": [
        {"name": "r/news", "url": "https://reddit.com/r/news/new"},
        {"name": "r/worldnews", "url": "https://reddit.com/r/worldnews/new"}
      ],
      "queryHints": ["tip for searching this platform"]
    }
  ]
}`;

  try {
    const response = await rateLimitedChatCompletion({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 1200, // Increased to avoid truncation
    });

    const content = response.choices[0]?.message?.content || '{}';
    let cleanedContent = content.replace(/```json\n?|\n?```/g, '').trim();

    // Try to parse, with fallback for truncated JSON
    let parsed;
    try {
      parsed = JSON.parse(cleanedContent);
    } catch (parseError) {
      // Try to repair truncated JSON by closing brackets
      console.warn(`[SOURCES] JSON parse failed for ${category} in ${countryName}, attempting repair...`);

      // Count unclosed brackets
      const openBraces = (cleanedContent.match(/{/g) || []).length;
      const closeBraces = (cleanedContent.match(/}/g) || []).length;
      const openBrackets = (cleanedContent.match(/\[/g) || []).length;
      const closeBrackets = (cleanedContent.match(/]/g) || []).length;

      // Add missing closing brackets/braces
      let repaired = cleanedContent;
      for (let i = 0; i < openBrackets - closeBrackets; i++) repaired += ']';
      for (let i = 0; i < openBraces - closeBraces; i++) repaired += '}';

      // Remove trailing commas before closing brackets
      repaired = repaired.replace(/,\s*]/g, ']').replace(/,\s*}/g, '}');

      try {
        parsed = JSON.parse(repaired);
        console.log(`[SOURCES] JSON repair successful for ${category} in ${countryName}`);
      } catch {
        // If repair fails, return empty sources
        console.error(`[SOURCES] JSON repair failed for ${category} in ${countryName}`);
        return { category, country: countryName, sources: [] };
      }
    }

    if (!parsed.sources || !Array.isArray(parsed.sources)) {
      console.error('[SOURCES] Invalid response structure from LLM');
      return { category, country: countryName, sources: [] };
    }

    const result: CategorySources = {
      category,
      country: countryName,
      sources: parsed.sources.slice(0, maxSources).map((s: PlatformSource) => ({
        platform: s.platform || 'Unknown',
        sitePattern: s.sitePattern || '',
        specificTargets: Array.isArray(s.specificTargets)
          ? s.specificTargets.map((t: TargetSource | string) => {
              // Handle both new format {name, url} and legacy string format
              if (typeof t === 'string') {
                return { name: t, url: '' }; // Legacy format - no URL
              }
              return { name: t.name || '', url: t.url || '' };
            }).filter((t: TargetSource) => t.url) // Only keep targets with URLs
          : [],
        queryHints: Array.isArray(s.queryHints) ? s.queryHints : [],
      })),
    };

    console.log(`[SOURCES] ${countryName} ${category}: ${result.sources.map(s => `${s.platform} (${s.specificTargets.length} targets)`).join(', ')}`);

    await cacheSources(cacheKey, result, CACHE_TTL_DAYS);
    return result;
  } catch (error) {
    console.error(`[SOURCES] Failed to discover sources for ${category} in ${countryName}:`, error);
    return { category, country: countryName, sources: [] };
  }
}

/**
 * Get sources for all enabled categories
 */
export async function getAllCategorySources(
  categories: ContentCategory[],
  countryName: string,
  maxSourcesPerCategory: number = 4
): Promise<Map<ContentCategory, CategorySources>> {
  const results = new Map<ContentCategory, CategorySources>();

  // Fetch all categories in parallel
  const promises = categories.map(async (category) => {
    const sources = await getCategorySources(category, countryName, maxSourcesPerCategory);
    return { category, sources };
  });

  const resolved = await Promise.all(promises);
  for (const { category, sources } of resolved) {
    results.set(category, sources);
  }

  return results;
}

/**
 * Result from generating queries - includes both direct URLs and search queries
 */
export interface SourceQueryResult {
  directUrls: { url: string; name: string }[];
  queries: { query: string; language: string }[];
}

/**
 * Generate direct URLs and search queries from discovered sources
 * - Direct URLs: Full URLs from targets for direct scraping
 * - Queries: Broad platform searches for additional content discovery via SERP
 */
export function generateQueriesFromSources(
  sources: CategorySources,
  languages: string[],
  countryName: string,
  maxQueries: number
): SourceQueryResult {
  const directUrls: { url: string; name: string }[] = [];
  const queries: { query: string; language: string }[] = [];

  if (sources.sources.length === 0) {
    return { directUrls: [], queries: [] };
  }

  for (const source of sources.sources) {
    // Collect direct URLs from targets (for direct scraping)
    for (const target of source.specificTargets) {
      if (target.url) {
        directUrls.push({
          url: target.url,
          name: target.name,
        });
      }
    }

    // Generate broad SERP queries for the platform (for additional discovery)
    if (source.sitePattern) {
      queries.push({
        query: `${source.sitePattern} ${countryName} news today`,
        language: languages[0] || 'en',
      });
    }
  }

  return {
    directUrls,
    queries: queries.slice(0, maxQueries),
  };
}

/**
 * Get cached sources from database
 */
async function getCachedSources(cacheKey: string): Promise<CategorySources | null> {
  try {
    const cached = await prisma.lLMCache.findUnique({
      where: { cacheKey },
    });

    if (cached && cached.expiresAt > new Date()) {
      return JSON.parse(cached.output);
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Cache sources in database
 */
async function cacheSources(
  cacheKey: string,
  sources: CategorySources,
  ttlDays: number
): Promise<void> {
  try {
    const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);
    await prisma.lLMCache.upsert({
      where: { cacheKey },
      update: { output: JSON.stringify(sources), expiresAt },
      create: { cacheKey, output: JSON.stringify(sources), expiresAt },
    });
  } catch (error) {
    console.error('[SOURCES] Failed to cache sources:', error);
  }
}
