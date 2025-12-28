/**
 * Dynamic Region/Country Configuration via LLM
 *
 * Generates complete region config on-the-fly, cached for 30 days.
 * This allows adding new regions with zero code changes - just type the name.
 */

import { prisma } from '@/lib/db';
import { CountryConfig, ContentCategory } from '@/types';
import { rateLimitedChatCompletion, isOpenAIConfigured } from '@/lib/openai-client';

const MODEL = 'gpt-4o-mini';
const CONFIG_CACHE_TTL_DAYS = 30;

// Predefined regions for common use cases
export const PREDEFINED_REGIONS: Record<string, string[]> = {
  'Middle East': ['Israel', 'Lebanon', 'Jordan', 'Syria', 'Egypt', 'Saudi Arabia', 'UAE', 'Iran', 'Iraq'],
  'Europe': ['Germany', 'France', 'UK', 'Italy', 'Spain', 'Netherlands', 'Poland', 'Sweden'],
  'North America': ['USA', 'Canada', 'Mexico'],
  'Asia Pacific': ['Japan', 'South Korea', 'China', 'India', 'Australia', 'Singapore'],
  'South America': ['Brazil', 'Argentina', 'Chile', 'Colombia'],
  'Africa': ['South Africa', 'Nigeria', 'Egypt', 'Kenya', 'Morocco', 'Ethiopia', 'Ghana', 'Tanzania'],
};

// All available regions (only predefined regions, no individual countries)
export function getAvailableRegions(): string[] {
  return Object.keys(PREDEFINED_REGIONS);
}

/**
 * Dynamic country/region configuration
 */
export interface DynamicCountryConfig extends CountryConfig {
  center: {
    lat: number;
    lng: number;
  };
  isRegion: boolean; // true if this is a multi-country region
  countries?: string[]; // If region, list of countries included
}


/**
 * Get cached config from database
 */
async function getCachedConfig(cacheKey: string): Promise<DynamicCountryConfig | null> {
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
 * Cache config in database
 */
async function cacheConfig(
  cacheKey: string,
  config: DynamicCountryConfig,
  ttlDays: number
): Promise<void> {
  try {
    const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);
    await prisma.lLMCache.upsert({
      where: { cacheKey },
      update: { output: JSON.stringify(config), expiresAt },
      create: { cacheKey, output: JSON.stringify(config), expiresAt },
    });
  } catch (error) {
    console.error('[COUNTRY-CONFIG] Failed to cache config:', error);
  }
}

/**
 * Get country/region configuration via LLM (cached for 30 days)
 */
export async function getCountryConfig(regionName: string): Promise<DynamicCountryConfig> {
  const normalizedName = regionName.toLowerCase().trim();
  const cacheKey = `country-config:${normalizedName}`;

  // Check cache first
  const cached = await getCachedConfig(cacheKey);
  if (cached) {
    console.log(`[COUNTRY-CONFIG] ${regionName} (cached)`);
    return cached;
  }

  // Try to generate via LLM
  if (!isOpenAIConfigured()) {
    console.warn(`[COUNTRY-CONFIG] No OpenAI key, using minimal config for ${regionName}`);
    return createMinimalConfig(regionName);
  }

  try {
    console.log(`[COUNTRY-CONFIG] Generating config for ${regionName}...`);
    const config = await generateConfigViaLLM(regionName);
    await cacheConfig(cacheKey, config, CONFIG_CACHE_TTL_DAYS);
    console.log(`[COUNTRY-CONFIG] ${regionName}: Generated with ${config.keywords.length} keywords, ${config.cities.length} cities`);
    return config;
  } catch (error) {
    console.error(`[COUNTRY-CONFIG] Failed to generate config for ${regionName}:`, error);
    return createMinimalConfig(regionName);
  }
}

/**
 * Generate config via LLM
 */
async function generateConfigViaLLM(
  regionName: string
): Promise<DynamicCountryConfig> {
  const isRegion = PREDEFINED_REGIONS[regionName] !== undefined;
  const countries = isRegion ? PREDEFINED_REGIONS[regionName] : undefined;

  const prompt = isRegion
    ? `Generate a configuration for the geographic region "${regionName}" which includes: ${countries?.join(', ')}.`
    : `Generate a configuration for the country "${regionName}".`;

  const response = await rateLimitedChatCompletion({
    model: MODEL,
    max_tokens: 800,
    temperature: 0,
    messages: [
      {
        role: 'user',
        content: `${prompt}

Return ONLY a valid JSON object with this exact structure (no markdown, no explanation):
{
  "name": "Full official name or region name",
  "code": "ISO 2-letter code (for countries) or abbreviation (for regions)",
  "languages": ["primary language codes: he, en, ru, or other"],
  "searchLanguages": ["Google search language codes like en, iw, ar, de, ru, es, zh"],
  "cities": ["Top 8 major cities in this region/country"],
  "keywords": [
    "30-50 relevance keywords including:",
    "- Region/country names in English and native scripts",
    "- Capital and major cities",
    "- Government and political terms",
    "- Current political figures and parties",
    "- Major landmarks and cultural terms",
    "- Military and security terms if relevant",
    "- Economic terms and major companies",
    "- Regional conflicts or issues if any"
  ],
  "center": { "lat": 0.0, "lng": 0.0 },
  "isRegion": ${isRegion},
  ${isRegion ? `"countries": ${JSON.stringify(countries)},` : ''}
}

IMPORTANT:
- keywords array should have 30-50 terms for effective filtering
- searchLanguages should include the top 3 languages used for news in this region
- center should be the geographic center coordinates
- Use proper ISO language codes: iw (Hebrew), ar (Arabic), de (German), ru (Russian), etc.`,
      },
    ],
  });

  const content = response.choices[0]?.message?.content || '{}';
  // Clean up potential markdown formatting
  const cleanJson = content.replace(/```json\n?|\n?```/g, '').trim();
  const parsed = JSON.parse(cleanJson);

  // Ensure all required fields with proper defaults
  const config: DynamicCountryConfig = {
    name: parsed.name || regionName,
    code: parsed.code || regionName.substring(0, 2).toLowerCase(),
    languages: parsed.languages || ['en'],
    searchLanguages: parsed.searchLanguages || ['en'],
    cities: parsed.cities || [],
    categories: ['news', 'events', 'tech', 'social', 'weather'] as ContentCategory[],
    keywords: parsed.keywords || [regionName.toLowerCase()],
    center: parsed.center || { lat: 0, lng: 0 },
    isRegion: isRegion,
    countries: isRegion ? countries : undefined,
  };

  return config;
}

/**
 * Create minimal config when LLM is unavailable
 */
function createMinimalConfig(regionName: string): DynamicCountryConfig {
  const isRegion = PREDEFINED_REGIONS[regionName] !== undefined;
  return {
    name: regionName,
    code: regionName.substring(0, 2).toLowerCase(),
    languages: ['en'],
    searchLanguages: ['en'],
    cities: [],
    categories: ['news', 'events', 'tech', 'social', 'weather'],
    keywords: [regionName.toLowerCase()],
    center: { lat: 0, lng: 0 },
    isRegion: isRegion,
    countries: isRegion ? PREDEFINED_REGIONS[regionName] : undefined,
  };
}

/**
 * Get configs for multiple regions
 */
export async function getMultipleCountryConfigs(regionNames: string[]): Promise<DynamicCountryConfig[]> {
  return Promise.all(regionNames.map(getCountryConfig));
}

/**
 * Clear cached config for a region (useful for regeneration)
 */
export async function clearCountryConfigCache(regionName: string): Promise<void> {
  const cacheKey = `country-config:${regionName.toLowerCase()}`;
  try {
    await prisma.lLMCache.delete({
      where: { cacheKey },
    });
    console.log(`[COUNTRY-CONFIG] Cleared cache for ${regionName}`);
  } catch {
    // Ignore if not found
  }
}

/**
 * Merge keywords from multiple country configs
 */
export function mergeKeywords(configs: DynamicCountryConfig[]): string[] {
  const allKeywords = new Set<string>();
  for (const config of configs) {
    for (const keyword of config.keywords) {
      allKeywords.add(keyword.toLowerCase());
    }
  }
  return Array.from(allKeywords);
}

/**
 * Merge cities from multiple country configs
 */
export function mergeCities(configs: DynamicCountryConfig[]): string[] {
  const allCities = new Set<string>();
  for (const config of configs) {
    for (const city of config.cities) {
      allCities.add(city);
    }
  }
  return Array.from(allCities);
}

/** Estimate token usage for a scan (input + output tokens) */
export function estimateTokenUsage(settings: {
  maxSearchQueries: number;
  maxUrlsToScrape: number;
  regionsCount: number;
}): {
  tokens: number;
  tokensCached: number;
  costUSD: number;
  costCachedUSD: number;
} {
  const { maxSearchQueries, maxUrlsToScrape, regionsCount } = settings;

  // PER ITEM: Single unified location+geocode call (~150 input + 50 output)
  const tokensPerItem = 200;

  // PER QUERY: ~500 input + 700 output average
  const tokensPerQuery = 1200;

  // URL SELECTION: ~200 tokens per URL (batch processing)
  const urlSelectionPerUrl = 200;

  // PER REGION BASE: config + sources + languages + topics + summaries
  const tokensPerRegionBase = 16150;

  // Calculate totals
  const itemTokens = maxUrlsToScrape * tokensPerItem * regionsCount;
  const queryTokens = maxSearchQueries * tokensPerQuery * regionsCount;
  const urlSelectionTokens = maxUrlsToScrape * urlSelectionPerUrl * regionsCount;
  const baseTokens = tokensPerRegionBase * regionsCount;

  const totalTokens = itemTokens + queryTokens + urlSelectionTokens + baseTokens;
  const cachedMultiplier = 0.4;
  const tokensCached = Math.round(totalTokens * cachedMultiplier);

  // gpt-4o-mini: $0.15/1M input, $0.60/1M output (~75% input, 25% output)
  const avgCostPerMillion = 0.75 * 0.15 + 0.25 * 0.60;
  const costUSD = (totalTokens / 1_000_000) * avgCostPerMillion;
  const costCachedUSD = (tokensCached / 1_000_000) * avgCostPerMillion;

  return {
    tokens: totalTokens,
    tokensCached,
    costUSD: Math.round(costUSD * 1000) / 1000,
    costCachedUSD: Math.round(costCachedUSD * 1000) / 1000,
  };
}
