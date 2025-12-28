/**
 * Dynamic Country Boundary Generation using Natural Earth Data
 *
 * Fetches country boundaries from Natural Earth dataset (via datahub.io)
 * Results are cached in the database for 30 days.
 */

import { prisma } from '@/lib/db';

const NATURAL_EARTH_URL = 'https://datahub.io/core/geo-countries/r/countries.geojson';
const CACHE_TTL_DAYS = 30;
const FETCH_TIMEOUT_MS = 30000;

export interface CountryBoundary {
  type: 'FeatureCollection';
  features: {
    type: 'Feature';
    properties: {
      name: string;
      id: string;
      'ISO3166-1-Alpha-2'?: string;
      'ISO3166-1-Alpha-3'?: string;
    };
    geometry: {
      type: 'Polygon' | 'MultiPolygon';
      coordinates: number[][][] | number[][][][];
    };
  }[];
}

interface NaturalEarthFeature {
  type: 'Feature';
  properties: {
    ADMIN?: string;
    name?: string;
    'ISO_A2'?: string;
    'ISO_A3'?: string;
    'ISO3166-1-Alpha-2'?: string;
    'ISO3166-1-Alpha-3'?: string;
  };
  geometry: {
    type: 'Polygon' | 'MultiPolygon';
    coordinates: number[][][] | number[][][][];
  };
}

interface NaturalEarthData {
  type: 'FeatureCollection';
  features: NaturalEarthFeature[];
}

// Country name aliases for better matching
// Maps common short names and variations to the official Natural Earth names
const COUNTRY_ALIASES: Record<string, string[]> = {
  'israel': ['israel', 'state of israel'],
  'usa': ['united states of america', 'united states', 'usa', 'us', 'america'],
  'uk': ['united kingdom', 'great britain', 'england', 'uk', 'britain', 'gb'],
  'russia': ['russia', 'russian federation'],
  'south korea': ['south korea', 'korea, republic of', 'republic of korea', 'korea'],
  'north korea': ['north korea', "korea, democratic people's republic of", 'dprk'],
  'palestine': ['palestine', 'palestinian territories', 'west bank and gaza', 'gaza'],
  'germany': ['germany', 'federal republic of germany', 'deutschland'],
  'france': ['france', 'french republic'],
  'japan': ['japan', 'nippon'],
  'china': ['china', "people's republic of china", 'prc'],
  'taiwan': ['taiwan', 'republic of china', 'roc'],
  'uae': ['united arab emirates', 'uae', 'emirates', 'dubai'],
  'brazil': ['brazil', 'brasil', 'federative republic of brazil'],
  'india': ['india', 'republic of india', 'bharat'],
  'canada': ['canada'],
  'australia': ['australia', 'commonwealth of australia'],
  'spain': ['spain', 'kingdom of spain', 'españa'],
  'italy': ['italy', 'italian republic', 'italia'],
  'netherlands': ['netherlands', 'holland', 'the netherlands'],
  'belgium': ['belgium', 'kingdom of belgium'],
  'switzerland': ['switzerland', 'swiss confederation'],
  'austria': ['austria', 'republic of austria'],
  'poland': ['poland', 'republic of poland'],
  'ukraine': ['ukraine'],
  'turkey': ['turkey', 'türkiye', 'republic of turkey'],
  'iran': ['iran', 'islamic republic of iran', 'persia'],
  'iraq': ['iraq', 'republic of iraq'],
  'syria': ['syria', 'syrian arab republic'],
  'lebanon': ['lebanon', 'lebanese republic'],
  'jordan': ['jordan', 'hashemite kingdom of jordan'],
  'egypt': ['egypt', 'arab republic of egypt'],
  'saudi arabia': ['saudi arabia', 'kingdom of saudi arabia', 'ksa'],
  'mexico': ['mexico', 'united mexican states'],
  'argentina': ['argentina', 'argentine republic'],
  'chile': ['chile', 'republic of chile'],
  'colombia': ['colombia', 'republic of colombia'],
  'venezuela': ['venezuela', 'bolivarian republic of venezuela'],
  'peru': ['peru', 'republic of peru'],
  'south africa': ['south africa', 'republic of south africa', 'rsa'],
  'nigeria': ['nigeria', 'federal republic of nigeria'],
  'kenya': ['kenya', 'republic of kenya'],
  'morocco': ['morocco', 'kingdom of morocco'],
  'algeria': ['algeria', "people's democratic republic of algeria"],
  'new zealand': ['new zealand', 'nz', 'aotearoa'],
  'singapore': ['singapore', 'republic of singapore'],
  'malaysia': ['malaysia'],
  'indonesia': ['indonesia', 'republic of indonesia'],
  'philippines': ['philippines', 'republic of the philippines'],
  'vietnam': ['vietnam', 'viet nam', 'socialist republic of vietnam'],
  'thailand': ['thailand', 'kingdom of thailand'],
  'greece': ['greece', 'hellenic republic', 'hellas'],
  'portugal': ['portugal', 'portuguese republic'],
  'sweden': ['sweden', 'kingdom of sweden'],
  'norway': ['norway', 'kingdom of norway'],
  'denmark': ['denmark', 'kingdom of denmark'],
  'finland': ['finland', 'republic of finland'],
  'ireland': ['ireland', 'republic of ireland', 'eire'],
  'czech republic': ['czech republic', 'czechia', 'czech'],
  'hungary': ['hungary'],
  'romania': ['romania'],
  'bulgaria': ['bulgaria', 'republic of bulgaria'],
};

/**
 * Get country boundary GeoJSON from Natural Earth data (cached for 30 days)
 */
export async function getCountryBoundary(countryName: string): Promise<CountryBoundary | null> {
  const normalizedName = countryName.toLowerCase().trim();
  const cacheKey = `country-boundary:${normalizedName}`;

  // Check cache first
  const cached = await getCachedBoundary(cacheKey);
  if (cached) {
    console.log(`[BOUNDARY] ${countryName} (cached)`);
    return cached;
  }

  try {
    console.log(`[BOUNDARY] Fetching Natural Earth data for ${countryName}...`);

    // Fetch the full Natural Earth dataset
    const allCountries = await fetchNaturalEarthData();
    if (!allCountries) {
      console.error('[BOUNDARY] Failed to fetch Natural Earth data');
      return null;
    }

    // Find the matching country
    const countryFeature = findCountryFeature(allCountries, normalizedName);
    if (!countryFeature) {
      console.error(`[BOUNDARY] Country not found: ${countryName}`);
      return null;
    }

    // Create the boundary object
    const boundary: CountryBoundary = {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature',
        properties: {
          name: countryFeature.properties.ADMIN || countryFeature.properties.name || countryName,
          id: normalizedName.replace(/\s+/g, '-'),
          'ISO3166-1-Alpha-2': countryFeature.properties['ISO_A2'] || countryFeature.properties['ISO3166-1-Alpha-2'],
          'ISO3166-1-Alpha-3': countryFeature.properties['ISO_A3'] || countryFeature.properties['ISO3166-1-Alpha-3'],
        },
        geometry: countryFeature.geometry,
      }],
    };

    console.log(`[BOUNDARY] ${countryName}: Found boundary with ${getCoordinateCount(countryFeature.geometry)} points`);

    // Cache the result
    await cacheBoundary(cacheKey, boundary, CACHE_TTL_DAYS);

    return boundary;
  } catch (error) {
    console.error(`[BOUNDARY] Failed to get boundary for ${countryName}:`, error);
    return null;
  }
}

/**
 * Fetch Natural Earth data (cached globally for 30 days)
 */
async function fetchNaturalEarthData(): Promise<NaturalEarthData | null> {
  const cacheKey = 'natural-earth-countries';

  // Check if we have cached Natural Earth data
  const cached = await getCachedBoundary(cacheKey);
  if (cached) {
    return cached as unknown as NaturalEarthData;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const response = await fetch(NATURAL_EARTH_URL, {
      signal: controller.signal,
      headers: {
        'Accept': 'application/json',
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.error(`[BOUNDARY] Natural Earth fetch failed: ${response.status}`);
      return null;
    }

    const data = await response.json() as NaturalEarthData;

    if (!data.features || !Array.isArray(data.features)) {
      console.error('[BOUNDARY] Invalid Natural Earth data structure');
      return null;
    }

    console.log(`[BOUNDARY] Fetched Natural Earth data: ${data.features.length} countries`);

    // Cache the full dataset for 30 days
    await cacheBoundary(cacheKey, data as unknown as CountryBoundary, CACHE_TTL_DAYS);

    return data;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.error('[BOUNDARY] Natural Earth fetch timed out');
    } else {
      console.error('[BOUNDARY] Natural Earth fetch error:', error);
    }
    return null;
  }
}

/**
 * Find a country feature by name, with alias support
 */
function findCountryFeature(data: NaturalEarthData, searchName: string): NaturalEarthFeature | null {
  const searchLower = searchName.toLowerCase();

  // Get all possible names to search for (including aliases)
  const searchNames = new Set<string>([searchLower]);
  for (const [key, aliases] of Object.entries(COUNTRY_ALIASES)) {
    if (aliases.includes(searchLower) || key === searchLower) {
      aliases.forEach(a => searchNames.add(a));
      searchNames.add(key);
    }
  }

  // First pass: exact matches only (safest)
  for (const feature of data.features) {
    const countryName = (feature.properties.ADMIN || feature.properties.name || '').toLowerCase();

    // Check if any search name matches exactly
    for (const name of searchNames) {
      if (countryName === name) {
        return feature;
      }
    }

    // Also check ISO codes
    const iso2 = (feature.properties['ISO_A2'] || feature.properties['ISO3166-1-Alpha-2'] || '').toLowerCase();
    const iso3 = (feature.properties['ISO_A3'] || feature.properties['ISO3166-1-Alpha-3'] || '').toLowerCase();

    if (iso2 === searchLower || iso3 === searchLower) {
      return feature;
    }
  }

  // Second pass: partial matches, but only if search term is long enough to be unambiguous
  // This prevents "uk" from matching "ukraine" but allows "united" to match "united kingdom"
  const minLengthForPartialMatch = 5;

  for (const feature of data.features) {
    const countryName = (feature.properties.ADMIN || feature.properties.name || '').toLowerCase();

    for (const name of searchNames) {
      // Only do partial matching for longer search terms
      if (name.length >= minLengthForPartialMatch) {
        if (countryName.includes(name) || name.includes(countryName)) {
          return feature;
        }
      }
    }
  }

  return null;
}

/**
 * Count coordinates in a geometry for logging
 */
function getCoordinateCount(geometry: NaturalEarthFeature['geometry']): number {
  if (geometry.type === 'Polygon') {
    return (geometry.coordinates as number[][][]).reduce((sum, ring) => sum + ring.length, 0);
  } else if (geometry.type === 'MultiPolygon') {
    return (geometry.coordinates as number[][][][]).reduce(
      (sum, polygon) => sum + polygon.reduce((pSum, ring) => pSum + ring.length, 0),
      0
    );
  }
  return 0;
}

/**
 * Get cached boundary from database
 */
async function getCachedBoundary(cacheKey: string): Promise<CountryBoundary | null> {
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
 * Cache boundary in database
 */
async function cacheBoundary(
  cacheKey: string,
  boundary: CountryBoundary,
  ttlDays: number
): Promise<void> {
  try {
    const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);
    await prisma.lLMCache.upsert({
      where: { cacheKey },
      update: { output: JSON.stringify(boundary), expiresAt },
      create: { cacheKey, output: JSON.stringify(boundary), expiresAt },
    });
  } catch (error) {
    console.error('[BOUNDARY] Failed to cache boundary:', error);
  }
}

/**
 * Clear cached boundary for a country (useful for regeneration)
 */
export async function clearCountryBoundaryCache(countryName: string): Promise<void> {
  const cacheKey = `country-boundary:${countryName.toLowerCase()}`;
  try {
    await prisma.lLMCache.delete({
      where: { cacheKey },
    });
    console.log(`[BOUNDARY] Cleared cache for ${countryName}`);
  } catch {
    // Ignore if not found
  }
}

/**
 * Clear all Natural Earth cached data
 */
export async function clearAllBoundaryCache(): Promise<void> {
  try {
    await prisma.lLMCache.deleteMany({
      where: {
        OR: [
          { cacheKey: { startsWith: 'country-boundary:' } },
          { cacheKey: 'natural-earth-countries' },
        ],
      },
    });
    console.log('[BOUNDARY] Cleared all boundary caches');
  } catch (error) {
    console.error('[BOUNDARY] Failed to clear boundary caches:', error);
  }
}
