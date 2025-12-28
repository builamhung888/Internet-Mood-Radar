// Hebrew Unicode range (including punctuation like ״)
const HEBREW_TEST_REGEX = /[\u0590-\u05FF]/;
// Russian Cyrillic Unicode range
const RUSSIAN_TEST_REGEX = /[\u0400-\u04FF]/;

// Map franc's ISO 639-3 codes to our simplified codes
const LANG_CODE_MAP: Record<string, 'he' | 'en' | 'ru' | 'other'> = {
  heb: 'he',
  eng: 'en',
  rus: 'ru',
};

// Dynamically import franc (ESM module) with fallback
let francFunction: ((text: string, options?: { minLength?: number; only?: string[] }) => string) | null = null;
let francLoadAttempted = false;

async function loadFranc(): Promise<void> {
  if (francLoadAttempted) return;
  francLoadAttempted = true;

  try {
    const francLib = await import('franc');
    francFunction = francLib.franc;
  } catch {
    // franc not available (e.g., in test environment), use fallback
    francFunction = null;
  }
}

// Start loading franc immediately
loadFranc();

/**
 * Detect the primary language of a text
 * Uses script-based detection which is reliable for Hebrew/Russian/English
 * Returns: 'he' | 'en' | 'ru' | 'other'
 */
export function detectLanguage(text: string): 'he' | 'en' | 'ru' | 'other' {
  if (!text || text.trim().length === 0) {
    return 'other';
  }

  // For short texts or when franc is not available, use script-based detection
  if (text.length < 50 || !francFunction) {
    return detectByScript(text);
  }

  // Try franc for longer texts
  try {
    const detected = francFunction(text, {
      minLength: 10,
      only: ['heb', 'eng', 'rus', 'ara', 'fra', 'deu', 'spa'],
    });

    if (detected in LANG_CODE_MAP) {
      return LANG_CODE_MAP[detected];
    }
  } catch {
    // Fall through to script-based detection
  }

  return detectByScript(text);
}

/**
 * Script-based language detection (fallback for short texts)
 * Uses Unicode character ranges to identify the primary script
 */
function detectByScript(text: string): 'he' | 'en' | 'ru' | 'other' {
  // Count characters in each script
  const hebrewCount = (text.match(/[\u0590-\u05FF]/g) || []).length;
  const russianCount = (text.match(/[\u0400-\u04FF]/g) || []).length;
  const latinCount = (text.match(/[a-zA-Z]/g) || []).length;
  const totalLetters = hebrewCount + russianCount + latinCount;

  if (totalLetters === 0) {
    return 'other';
  }

  // Calculate percentages
  const hebrewPct = hebrewCount / totalLetters;
  const russianPct = russianCount / totalLetters;
  const latinPct = latinCount / totalLetters;

  // Threshold for detection (20%)
  const THRESHOLD = 0.2;

  if (hebrewPct >= THRESHOLD && hebrewPct >= russianPct && hebrewPct >= latinPct) {
    return 'he';
  }

  if (russianPct >= THRESHOLD && russianPct >= hebrewPct && russianPct >= latinPct) {
    return 'ru';
  }

  if (latinPct >= THRESHOLD) {
    return 'en';
  }

  return 'other';
}

/**
 * Check if text contains Hebrew characters
 */
export function containsHebrew(text: string): boolean {
  return HEBREW_TEST_REGEX.test(text);
}

/**
 * Check if text contains Russian characters
 */
export function containsRussian(text: string): boolean {
  return RUSSIAN_TEST_REGEX.test(text);
}

/**
 * Get a display label for a language code
 */
export function getLanguageLabel(code: string): string {
  const labels: Record<string, string> = {
    he: 'Hebrew',
    en: 'English',
    ru: 'Russian',
    other: 'Other',
  };
  return labels[code] || code;
}
