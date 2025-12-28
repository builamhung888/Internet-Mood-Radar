import { Location } from '@/types';
import { prisma } from '@/lib/db';
import { generateId } from '@/lib/utils';
import { rateLimitedChatCompletion, isOpenAIConfigured } from '@/lib/openai-client';

const MODEL = 'gpt-4o-mini';
const GEOCODE_CACHE_TTL_DAYS = 30; // Cache geocoding results for 30 days
const COUNTRY_NORM_CACHE_TTL_DAYS = 90; // Cache country normalization for 90 days

// In-memory cache for country normalization (avoids repeated DB lookups)
const countryNormCache = new Map<string, string>();

/**
 * Normalize country name to official format using LLM with caching
 * This ensures consistent country names across the app without hardcoding
 */
export async function normalizeCountryName(country: string): Promise<string> {
  if (!country) return country;

  const lower = country.toLowerCase().trim();

  // Check in-memory cache first
  if (countryNormCache.has(lower)) {
    return countryNormCache.get(lower)!;
  }

  // Check database cache
  const cacheKey = `country-norm:${lower}`;
  try {
    const cached = await prisma.lLMCache.findUnique({
      where: { cacheKey },
    });

    if (cached && cached.expiresAt > new Date()) {
      const normalized = cached.output;
      countryNormCache.set(lower, normalized);
      return normalized;
    }
  } catch {
    // Continue to LLM if cache fails
  }

  // Use LLM to normalize
  if (!isOpenAIConfigured()) {
    return country; // Return as-is if no API key
  }

  try {
    const response = await rateLimitedChatCompletion({
      model: MODEL,
      max_tokens: 50,
      temperature: 0,
      messages: [
        {
          role: 'system',
          content: `You normalize country names to their official short English names.
Return ONLY the normalized country name, nothing else.

Examples:
- "USA" → "United States"
- "UK" → "United Kingdom"
- "UAE" → "United Arab Emirates"
- "america" → "United States"
- "england" → "United Kingdom"
- "Deutschland" → "Germany"
- "Brasil" → "Brazil"
- "Россия" → "Russia"
- "中国" → "China"
- "日本" → "Japan"

If it's already a proper country name, return it with proper capitalization.
If it's not a country (e.g., a region like "Europe" or "Middle East"), return it as-is.`,
        },
        {
          role: 'user',
          content: country,
        },
      ],
    });

    const normalized = response.choices[0]?.message?.content?.trim() || country;

    // Cache the result
    try {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + COUNTRY_NORM_CACHE_TTL_DAYS);

      await prisma.lLMCache.upsert({
        where: { cacheKey },
        update: { output: normalized, expiresAt },
        create: { cacheKey, output: normalized, expiresAt },
      });
    } catch {
      // Ignore cache errors
    }

    countryNormCache.set(lower, normalized);
    return normalized;
  } catch (error) {
    console.error('[GEOCODE] Country normalization failed:', error);
    return country;
  }
}

/**
 * Synchronous country normalization - uses cache only, returns as-is if not cached
 */
export function normalizeCountryNameSync(country: string): string {
  if (!country) return country;
  const lower = country.toLowerCase().trim();
  return countryNormCache.get(lower) || country;
}

// In-memory cache for region detection (avoids repeated LLM calls)
const regionCache = new Map<string, boolean>();

/**
 * Check if a name is a region (not a country) using LLM with caching
 */
export async function isRegion(name: string): Promise<boolean> {
  if (!name) return false;

  const lower = name.toLowerCase().trim();

  // Check in-memory cache
  if (regionCache.has(lower)) {
    return regionCache.get(lower)!;
  }

  // Check database cache
  const cacheKey = `is-region:${lower}`;
  try {
    const cached = await prisma.lLMCache.findUnique({
      where: { cacheKey },
    });

    if (cached && cached.expiresAt > new Date()) {
      const isReg = cached.output === 'true';
      regionCache.set(lower, isReg);
      return isReg;
    }
  } catch {
    // Continue to LLM
  }

  // Use LLM to determine
  if (!isOpenAIConfigured()) {
    return false; // Assume country if no API key
  }

  try {
    const response = await rateLimitedChatCompletion({
      model: MODEL,
      max_tokens: 10,
      temperature: 0,
      messages: [
        {
          role: 'system',
          content: `Determine if the given name is a geographic REGION (not a sovereign country).
Return ONLY "true" or "false".

Regions include: continents, subcontinents, political/economic unions, and multi-country areas.
Examples of REGIONS (return "true"):
- Europe, Asia, Africa, Middle East, Asia Pacific, European Union, EU, Scandinavia, Balkans, Gulf States, Latin America

Examples of COUNTRIES (return "false"):
- United States, Germany, France, Japan, Brazil, Israel, United Kingdom, China, Russia`,
        },
        {
          role: 'user',
          content: name,
        },
      ],
    });

    const result = response.choices[0]?.message?.content?.trim().toLowerCase() === 'true';

    // Cache the result
    try {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + COUNTRY_NORM_CACHE_TTL_DAYS);

      await prisma.lLMCache.upsert({
        where: { cacheKey },
        update: { output: String(result), expiresAt },
        create: { cacheKey, output: String(result), expiresAt },
      });
    } catch {
      // Ignore cache errors
    }

    regionCache.set(lower, result);
    return result;
  } catch (error) {
    console.error('[GEOCODE] Region check failed:', error);
    return false;
  }
}

/**
 * Synchronous region check - uses cache only
 */
export function isRegionSync(name: string): boolean {
  if (!name) return false;
  return regionCache.get(name.toLowerCase().trim()) || false;
}

/**
 * Check if a name is a valid country (not a region) - async version
 */
export async function isValidCountry(name: string): Promise<boolean> {
  if (!name) return false;
  return !(await isRegion(name));
}

/**
 * Synchronous valid country check - uses cache only
 */
export function isValidCountrySync(name: string): boolean {
  if (!name) return false;
  return !isRegionSync(name);
}


/**
 * Generate cache key for geocoding
 */
function generateCacheKey(placeName: string): string {
  return generateId(`geocode:${placeName.toLowerCase().trim()}`);
}

/**
 * Get cached geocoding result
 */
async function getCached(cacheKey: string): Promise<Location | null> {
  try {
    const cached = await prisma.lLMCache.findUnique({
      where: { cacheKey },
    });

    if (cached && cached.expiresAt > new Date()) {
      return JSON.parse(cached.output) as Location;
    }

    // Clean up expired cache
    if (cached) {
      await prisma.lLMCache.delete({ where: { cacheKey } });
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Save geocoding result to cache
 */
async function saveToCache(cacheKey: string, location: Location): Promise<void> {
  try {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + GEOCODE_CACHE_TTL_DAYS);

    await prisma.lLMCache.upsert({
      where: { cacheKey },
      update: { output: JSON.stringify(location), expiresAt },
      create: { cacheKey, output: JSON.stringify(location), expiresAt },
    });
  } catch {
    // Ignore cache errors
  }
}

/**
 * Use LLM to geocode a place name
 */
async function geocodeWithLLM(placeName: string): Promise<Location | null> {
  if (!isOpenAIConfigured()) return null;

  try {
    const response = await rateLimitedChatCompletion({
      model: MODEL,
      max_tokens: 100,
      temperature: 0, // Deterministic output
      messages: [
        {
          role: 'system',
          content: `You are a geocoding API. Given a place name, return its coordinates in JSON format.
Return ONLY valid JSON with this exact structure: {"name": "Official Name", "lat": number, "lng": number, "country": "Country Name"}

IMPORTANT for "country" field:
- MUST be an actual sovereign nation (e.g., "Germany", "France", "United States")
- NEVER use organizations like "European Union", "NATO", "UN"
- NEVER use regions like "Middle East", "Europe", "Asia Pacific"
- If the place is in a disputed territory, use the de facto controlling country

If you cannot identify a specific location, return: {"error": true}
Do not include any explanation, only the JSON.`,
        },
        {
          role: 'user',
          content: placeName,
        },
      ],
    });

    const content = response.choices[0]?.message?.content?.trim();
    if (!content) return null;

    const result = JSON.parse(content);
    if (result.error) return null;

    // Validate the result
    if (
      typeof result.lat !== 'number' ||
      typeof result.lng !== 'number' ||
      typeof result.name !== 'string' ||
      typeof result.country !== 'string'
    ) {
      return null;
    }

    // Normalize the country name
    const normalizedCountry = await normalizeCountryName(result.country);

    return {
      name: result.name,
      lat: result.lat,
      lng: result.lng,
      country: normalizedCountry,
    };
  } catch {
    return null;
  }
}

/**
 * Geocode a place name to coordinates
 * Uses LLM with aggressive caching for all geocoding
 */
export async function geocode(placeName: string): Promise<Location | null> {
  if (!placeName) return null;

  const normalized = placeName.toLowerCase().trim();

  // 1. Check cache first (includes all previous LLM results)
  const cacheKey = generateCacheKey(normalized);
  const cached = await getCached(cacheKey);
  if (cached) {
    return cached;
  }

  // 2. Use LLM for geocoding (result will be cached)
  const llmResult = await geocodeWithLLM(placeName);
  if (llmResult) {
    await saveToCache(cacheKey, llmResult);
    return llmResult;
  }

  return null;
}

// In-memory cache for geocode results (for sync access)
const geocodeSyncCache = new Map<string, Location>();

/**
 * Synchronous geocode - uses cache only
 * Call async geocode() first to populate cache
 */
export function geocodeSync(placeName: string): Location | null {
  if (!placeName) return null;
  const normalized = placeName.toLowerCase().trim();
  return geocodeSyncCache.get(normalized) || null;
}

/**
 * Pre-populate the sync cache from an async geocode result
 */
export function cacheGeocodeSyncResult(placeName: string, location: Location): void {
  geocodeSyncCache.set(placeName.toLowerCase().trim(), location);
}

/**
 * Get default location for a region using LLM geocoding
 * Returns undefined if no location can be determined (items won't show on map)
 */
export async function getDefaultLocation(region?: string): Promise<Location | undefined> {
  if (region) {
    const location = await geocode(region);
    if (location) {
      return location;
    }
  }
  // Don't return a random location - let items without location be excluded from map
  return undefined;
}

/**
 * Get default location for the first region in the list
 * Returns undefined if no location can be determined
 */
export async function getDefaultLocationForRegions(regions: string[]): Promise<Location | undefined> {
  if (regions.length > 0) {
    return getDefaultLocation(regions[0]);
  }
  return undefined;
}

// In-memory cache for region bounds (populated by LLM)
const regionBoundsCache = new Map<string, { north: number; south: number; east: number; west: number }>();

/**
 * Get bounding box for a region using LLM with caching
 */
async function getRegionBounds(region: string): Promise<{ north: number; south: number; east: number; west: number } | null> {
  const lower = region.toLowerCase().trim();

  // Check in-memory cache
  if (regionBoundsCache.has(lower)) {
    return regionBoundsCache.get(lower)!;
  }

  // Check database cache
  const cacheKey = `region-bounds:${lower}`;
  try {
    const cached = await prisma.lLMCache.findUnique({
      where: { cacheKey },
    });

    if (cached && cached.expiresAt > new Date()) {
      const bounds = JSON.parse(cached.output);
      regionBoundsCache.set(lower, bounds);
      return bounds;
    }
  } catch {
    // Continue to LLM
  }

  // Use LLM to get bounds
  if (!isOpenAIConfigured()) return null;

  try {
    const response = await rateLimitedChatCompletion({
      model: MODEL,
      max_tokens: 100,
      temperature: 0,
      messages: [
        {
          role: 'system',
          content: `Return the approximate bounding box for a geographic region or country.
Return ONLY valid JSON: {"north": lat, "south": lat, "east": lng, "west": lng}
All values should be numbers (latitude: -90 to 90, longitude: -180 to 180).
If unknown, return: {"error": true}`,
        },
        {
          role: 'user',
          content: region,
        },
      ],
    });

    const content = response.choices[0]?.message?.content?.trim();
    if (!content) return null;

    const result = JSON.parse(content);
    if (result.error) return null;

    const bounds = {
      north: result.north,
      south: result.south,
      east: result.east,
      west: result.west,
    };

    // Cache the result
    try {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + GEOCODE_CACHE_TTL_DAYS);

      await prisma.lLMCache.upsert({
        where: { cacheKey },
        update: { output: JSON.stringify(bounds), expiresAt },
        create: { cacheKey, output: JSON.stringify(bounds), expiresAt },
      });
    } catch {
      // Ignore cache errors
    }

    regionBoundsCache.set(lower, bounds);
    return bounds;
  } catch {
    return null;
  }
}

/**
 * Check if a location is within a region's bounds
 */
export async function isInRegion(location: Location, region: string): Promise<boolean> {
  const normalizedRegion = region.toLowerCase().trim();
  const bounds = await getRegionBounds(region);

  if (!bounds) {
    // If no bounds defined, check if country matches
    const normalizedCountry = location.country?.toLowerCase().trim() || '';
    return normalizedCountry === normalizedRegion;
  }

  // Handle longitude wrapping for regions that cross the date line
  if (bounds.west > bounds.east) {
    // Region crosses date line (e.g., Asia Pacific)
    return (
      location.lat >= bounds.south &&
      location.lat <= bounds.north &&
      (location.lng >= bounds.west || location.lng <= bounds.east)
    );
  }

  return (
    location.lat >= bounds.south &&
    location.lat <= bounds.north &&
    location.lng >= bounds.west &&
    location.lng <= bounds.east
  );
}

/**
 * Calculate distance between two locations (in km)
 */
export function getDistance(loc1: Location, loc2: Location): number {
  const R = 6371; // Earth's radius in km
  const dLat = ((loc2.lat - loc1.lat) * Math.PI) / 180;
  const dLng = ((loc2.lng - loc1.lng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((loc1.lat * Math.PI) / 180) *
      Math.cos((loc2.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
