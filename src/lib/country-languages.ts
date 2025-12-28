/**
 * Dynamic Country Language Detection
 *
 * Uses LLM to determine the top 3 languages for searching news/content
 * about a specific country. Results are cached for 24 hours.
 */

import { prisma } from '@/lib/db';
import { rateLimitedChatCompletion, isOpenAIConfigured } from '@/lib/openai-client';

export interface CountryLanguages {
  primary: string;
  secondary: string;
  tertiary: string;
  googleCodes: string[];
}

/**
 * Get top 3 languages for a country via LLM (cached for 24h)
 */
export async function getCountryLanguages(countryName: string): Promise<CountryLanguages> {
  const cacheKey = `country-languages:${countryName.toLowerCase()}`;

  // Check cache first
  const cached = await getCachedLanguages(cacheKey);
  if (cached) {
    console.log(`[LANGUAGES] ${countryName} (cached): ${cached.googleCodes.join(', ')}`);
    return cached;
  }

  if (!isOpenAIConfigured()) {
    console.log(`[LANGUAGES] ${countryName}: No API key, using defaults`);
    return getDefaultLanguages(countryName);
  }

  const prompt = `What are the top 3 languages for searching news and content about ${countryName}?

Consider:
- Languages commonly used in local media
- Languages spoken by significant populations
- Languages used for international news coverage about this country

Return ONLY a JSON object:
{
  "primary": "Language name",
  "secondary": "Language name",
  "tertiary": "Language name",
  "googleCodes": ["code1", "code2", "code3"]
}

Use Google search language codes (e.g., "iw" for Hebrew, "en" for English, "ru" for Russian, "ar" for Arabic, "es" for Spanish, "de" for German, "fr" for French, "zh" for Chinese, "ja" for Japanese, "ko" for Korean, "pt" for Portuguese, "it" for Italian, "tr" for Turkish, "pl" for Polish, "uk" for Ukrainian).`;

  try {
    const response = await rateLimitedChatCompletion({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0,
      max_tokens: 150,
    });

    const content = response.choices[0]?.message?.content || '{}';
    const languages = JSON.parse(content.replace(/```json\n?|\n?```/g, '').trim());

    // Validate response structure
    if (!languages.googleCodes || !Array.isArray(languages.googleCodes)) {
      throw new Error('Invalid response structure');
    }

    console.log(`[LANGUAGES] ${countryName}: ${languages.primary}, ${languages.secondary}, ${languages.tertiary}`);

    await cacheLanguages(cacheKey, languages, 24); // Cache for 24 hours
    return languages;
  } catch (error) {
    console.error('[LANGUAGES] Failed to detect languages:', error);
    return getDefaultLanguages(countryName);
  }
}

/**
 * Fallback defaults when LLM is unavailable
 */
function getDefaultLanguages(countryName: string): CountryLanguages {
  // Only use defaults as absolute fallback - LLM should determine these
  const defaults: Record<string, CountryLanguages> = {
    israel: {
      primary: 'Hebrew',
      secondary: 'Arabic',
      tertiary: 'Russian',
      googleCodes: ['iw', 'ar', 'ru'],
    },
  };

  const result = defaults[countryName.toLowerCase()] || {
    primary: 'English',
    secondary: 'English',
    tertiary: 'English',
    googleCodes: ['en'],
  };

  console.log(`[LANGUAGES] ${countryName} (default): ${result.googleCodes.join(', ')}`);
  return result;
}

/**
 * Get cached languages from database
 */
async function getCachedLanguages(cacheKey: string): Promise<CountryLanguages | null> {
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
 * Cache languages in database
 */
async function cacheLanguages(
  cacheKey: string,
  languages: CountryLanguages,
  ttlHours: number
): Promise<void> {
  try {
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);
    await prisma.lLMCache.upsert({
      where: { cacheKey },
      update: { output: JSON.stringify(languages), expiresAt },
      create: { cacheKey, output: JSON.stringify(languages), expiresAt },
    });
  } catch (error) {
    console.error('[LANGUAGES] Failed to cache languages:', error);
  }
}
