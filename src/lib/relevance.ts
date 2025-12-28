import { NormalizedItem } from '@/types';
import { SOURCES } from '@/lib/config'; // Used for source trust scoring
import { normalizeUrl as normalizeUrlUtil, extractDomain } from '@/lib/utils/url';

// Cached keywords for synchronous scoring
let cachedKeywords: string[] | null = null;

/**
 * Set keywords for relevance scoring (called at pipeline start)
 * This allows async keyword loading while keeping scoreRelevance synchronous
 */
export function setRelevanceKeywords(keywords: string[]): void {
  cachedKeywords = keywords.map(k => k.toLowerCase());
}

/**
 * Get current relevance keywords
 */
export function getRelevanceKeywords(): string[] {
  return cachedKeywords || [];
}

/**
 * Score the relevance of an item to the configured regions (0-1)
 * Higher score = more relevant to selected regions
 *
 * Keywords must be set via setRelevanceKeywords() before calling this function.
 * If no keywords are set, returns a default score based on source trust only.
 */
export function scoreRelevance(item: NormalizedItem): number {
  let score = 0;

  // Get source trust score - look up by source type (search, events, etc.)
  const sourceConfig = SOURCES.find((s) => s.type === item.source);
  const trustScore = sourceConfig?.trustScore ?? 0.5;

  // Base score from source trust
  score += trustScore * 0.3;

  // Keyword matching in title and text
  const combinedText = `${item.title} ${item.text || ''}`.toLowerCase();
  let keywordMatches = 0;

  const keywords = cachedKeywords || [];
  for (const keyword of keywords) {
    if (combinedText.includes(keyword)) {
      keywordMatches++;
    }
  }

  // More keyword matches = higher relevance (capped)
  // Adjust divisor based on number of regions (more regions = more keywords expected)
  const keywordScore = Math.min(1, keywordMatches / 3);
  score += keywordScore * 0.5;

  // Boost for search sources
  if (item.source === 'search') {
    score += 0.1;
  }

  // Clamp to 0-1
  return Math.min(1, Math.max(0, score));
}

// URL utilities are imported from @/lib/utils/url

// Pre-compiled regex patterns for entity extraction (performance optimization)
const ENTITY_PATTERNS = {
  numbers: /\b\d+(?:\.\d+)?%?\b/g,
  capitalizedWords: /\b[A-Z][a-z]{2,}\b/g,
  quotedPhrases: /"([^"]+)"/g,
  titles: /(?:president|pm|minister|ceo|cfo)\s+\w+/gi,
  honorifics: /(?:mr\.|mrs\.|dr\.|prof\.)\s+\w+/gi,
} as const;

/**
 * Extract key entities/names from text (proper nouns, numbers, quoted phrases)
 * Uses pre-compiled regex for better performance
 */
function extractKeyEntities(text: string): Set<string> {
  const entities = new Set<string>();

  // Extract numbers (years, amounts, percentages)
  const numbers = text.match(ENTITY_PATTERNS.numbers) || [];
  numbers.forEach(n => entities.add(n));

  // Extract capitalized words (likely names/places) - 2+ chars
  const capitalizedWords = text.match(ENTITY_PATTERNS.capitalizedWords) || [];
  capitalizedWords.forEach(w => entities.add(w.toLowerCase()));

  // Extract quoted phrases
  const quoted = text.match(ENTITY_PATTERNS.quotedPhrases) || [];
  quoted.forEach(q => entities.add(q.toLowerCase()));

  // Extract common news entities patterns (titles, honorifics)
  const titles = text.match(ENTITY_PATTERNS.titles) || [];
  titles.forEach(m => entities.add(m.toLowerCase()));

  const honorifics = text.match(ENTITY_PATTERNS.honorifics) || [];
  honorifics.forEach(m => entities.add(m.toLowerCase()));

  return entities;
}

/**
 * Check if two articles are about the same news story
 * Uses entity overlap and key phrase matching
 */
function isSameStory(a: NormalizedItem, b: NormalizedItem): boolean {
  const textA = `${a.title} ${a.text || ''}`;
  const textB = `${b.title} ${b.text || ''}`;

  // Extract entities from both
  const entitiesA = extractKeyEntities(textA);
  const entitiesB = extractKeyEntities(textB);

  if (entitiesA.size < 2 || entitiesB.size < 2) {
    return false; // Not enough entities to compare
  }

  // Calculate entity overlap
  const intersection = new Set([...entitiesA].filter(e => entitiesB.has(e)));
  const minSize = Math.min(entitiesA.size, entitiesB.size);
  const overlapRatio = intersection.size / minSize;

  // If 60%+ of key entities match, likely same story
  if (overlapRatio >= 0.6 && intersection.size >= 3) {
    return true;
  }

  // Also check for shared unique phrases (3+ word sequences)
  const phrasesA = extractPhrases(textA);
  const phrasesB = extractPhrases(textB);
  const sharedPhrases = phrasesA.filter(p => phrasesB.includes(p));

  // 2+ shared unique phrases = same story
  if (sharedPhrases.length >= 2) {
    return true;
  }

  return false;
}

/**
 * Extract meaningful 3-4 word phrases from text
 */
function extractPhrases(text: string): string[] {
  const words = text.toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2);

  const phrases: string[] = [];
  const stopWords = new Set(['the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'has', 'have', 'was', 'were', 'been', 'being', 'will', 'would', 'could', 'should', 'that', 'this', 'with', 'from', 'they', 'which', 'their', 'there', 'what', 'about', 'into', 'more', 'other', 'than', 'then', 'these', 'some']);

  for (let i = 0; i < words.length - 2; i++) {
    // Skip if starts/ends with stop word
    if (stopWords.has(words[i]) || stopWords.has(words[i + 2])) continue;

    const phrase = `${words[i]} ${words[i + 1]} ${words[i + 2]}`;
    if (phrase.length > 10) { // Meaningful length
      phrases.push(phrase);
    }
  }

  return phrases;
}

/**
 * Calculate similarity between two items for deduplication
 * Returns a score 0-1, where 1 = identical
 */
export function calculateSimilarity(a: NormalizedItem, b: NormalizedItem): number {
  // Same normalized URL = definitely duplicate
  if (a.url && b.url) {
    const urlA = normalizeUrlUtil(a.url);
    const urlB = normalizeUrlUtil(b.url);
    if (urlA === urlB) {
      return 1;
    }
  }

  // Compare titles using Jaccard similarity
  const titleA = tokenize(a.title);
  const titleB = tokenize(b.title);
  const titleSimilarity = jaccardSimilarity(titleA, titleB);

  // Also check for substring match in titles (catches "Title" vs "Title - Source Name")
  const titleALower = a.title.toLowerCase();
  const titleBLower = b.title.toLowerCase();
  const hasSubstringMatch =
    (titleALower.length > 20 && titleBLower.includes(titleALower.slice(0, 30))) ||
    (titleBLower.length > 20 && titleALower.includes(titleBLower.slice(0, 30)));

  if (hasSubstringMatch) {
    return Math.max(titleSimilarity, 0.85);
  }

  // If titles are similar, boost score if from same domain
  if (titleSimilarity > 0.5) {
    const domainA = extractDomain(a.url);
    const domainB = extractDomain(b.url);
    if (domainA && domainB && domainA === domainB) {
      // Same domain with similar title = very likely duplicate
      return Math.max(titleSimilarity, 0.8);
    }
  }

  // Check if same story across different sources (entity/phrase matching)
  if (titleSimilarity > 0.3 && isSameStory(a, b)) {
    return Math.max(titleSimilarity, 0.75);
  }

  // If titles are moderately similar, check text content
  if (titleSimilarity > 0.4) {
    const textA = tokenize(a.text || '');
    const textB = tokenize(b.text || '');
    const textSimilarity = jaccardSimilarity(textA, textB);

    // High text similarity = same story even with different headlines
    if (textSimilarity > 0.5) {
      return Math.max(titleSimilarity * 0.4 + textSimilarity * 0.6, 0.7);
    }

    // Weight title more heavily for moderate matches
    return titleSimilarity * 0.7 + textSimilarity * 0.3;
  }

  return titleSimilarity;
}

/**
 * Tokenize text into words
 */
function tokenize(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .split(/\s+/)
    .filter((w) => w.length > 2);
  return new Set(words);
}

/**
 * Calculate Jaccard similarity between two sets
 */
function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;

  const intersection = new Set([...a].filter((x) => b.has(x)));
  const union = new Set([...a, ...b]);

  return intersection.size / union.size;
}

/**
 * Deduplicate items, keeping the one with highest engagement
 * Removes duplicates entirely (returns only unique items)
 */
export function deduplicateItems(
  items: NormalizedItem[],
  similarityThreshold: number = 0.5
): NormalizedItem[] {
  const unique: NormalizedItem[] = [];
  const seenUrls = new Set<string>();

  // Sort by engagement descending (keep higher engagement versions)
  const sorted = [...items].sort((a, b) => b.engagement - a.engagement);

  for (const item of sorted) {
    // Quick check: normalized URL already seen?
    const normalizedUrl = item.url ? normalizeUrlUtil(item.url) : '';
    if (normalizedUrl && seenUrls.has(normalizedUrl)) {
      continue; // Skip URL duplicate
    }

    // Check if this item is similar to any already accepted item
    let isDuplicate = false;

    for (const existing of unique) {
      const similarity = calculateSimilarity(item, existing);
      if (similarity >= similarityThreshold) {
        isDuplicate = true;
        break;
      }
    }

    if (!isDuplicate) {
      unique.push(item);
      if (normalizedUrl) {
        seenUrls.add(normalizedUrl);
      }
    }
  }

  console.log(`[DEDUP] Kept ${unique.length}/${items.length} unique items (removed ${items.length - unique.length} duplicates)`);
  return unique;
}

// normalizeUrlForDedup is now handled by normalizeUrlUtil from @/lib/utils/url

/**
 * Filter items by relevance score
 */
export function filterByRelevance(
  items: NormalizedItem[],
  minScore: number = 0.3
): NormalizedItem[] {
  return items.filter((item) => {
    const score = item.relevanceScore ?? scoreRelevance(item);
    return score >= minScore;
  });
}
