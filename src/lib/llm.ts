import OpenAI from 'openai';
import { Topic, GroundingContext, EmotionDistribution } from '@/types';
import { LLM_CACHE_TTL_HOURS } from '@/lib/config';
import { formatEmotion, getDominantEmotion } from '@/lib/mood';
import { containsHebrew, containsRussian } from '@/lib/language';
import { AppLanguage } from '@/lib/translations';
import { rateLimitedChatCompletion, isOpenAIConfigured } from '@/lib/openai-client';
import { generateCacheKey, getCachedString, saveToCacheString } from '@/lib/utils/cache';

const MODEL = 'gpt-4o-mini';

// Language instruction for prompts
const LANGUAGE_INSTRUCTIONS: Record<AppLanguage, string> = {
  en: 'Respond in English.',
  he: 'Respond in Hebrew (עברית).',
  ru: 'Respond in Russian (Русский).',
};

function getLanguageInstruction(language: AppLanguage): string {
  return LANGUAGE_INSTRUCTIONS[language] || LANGUAGE_INSTRUCTIONS.en;
}

/**
 * Safely extract text from an OpenAI API response
 */
function extractTextFromResponse(response: OpenAI.Chat.Completions.ChatCompletion): string {
  const choice = response.choices[0];
  if (!choice || !choice.message || !choice.message.content) {
    throw new Error('Empty response from LLM');
  }
  return choice.message.content.trim();
}

/**
 * Create translation hint for non-English content
 * The LLM understands most languages natively, so we just indicate the language
 */
function createTranslationHint(text: string): string | undefined {
  if (!containsHebrew(text) && !containsRussian(text)) {
    return undefined;
  }

  // Just indicate the language - LLM handles translation inline
  return containsHebrew(text)
    ? '[Hebrew content]'
    : '[Russian content]';
}

/**
 * Build grounding context for a topic
 */
function buildGroundingContext(topic: Topic): GroundingContext {
  const receiptCount = topic.receipts.length;
  const totalEngagement = topic.receipts.reduce((sum, r) => sum + r.engagement, 0);

  return {
    topicKeywords: topic.keywords,
    aggregates: {
      itemCount: receiptCount,
      avgEngagement: receiptCount > 0 ? totalEngagement / receiptCount : 0,
      emotionMix: topic.emotionMix,
    },
    receipts: topic.receipts.map((receipt) => ({
      title: receipt.title,
      snippet: receipt.snippet,
      translatedSnippet: createTranslationHint(receipt.snippet),
      url: receipt.url,
    })),
  };
}

// Cache utilities are now imported from @/lib/utils/cache

/**
 * Validate that OpenAI is configured
 */
function validateConfig(): void {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is required. Get your API key from https://platform.openai.com/api-keys');
  }
}


/**
 * Generate topic title using LLM
 */
export async function generateTopicTitle(topic: Topic, language: AppLanguage = 'en'): Promise<string> {
  const cacheKey = generateCacheKey('topic-title', { keywords: topic.keywords, language });
  const cached = await getCachedString(cacheKey);
  if (cached) return cached;

  validateConfig();
  const context = buildGroundingContext(topic);
  const langInstruction = getLanguageInstruction(language);

  const response = await rateLimitedChatCompletion({
    model: MODEL,
    max_tokens: 50,
    messages: [
      {
        role: 'user',
        content: `Based ONLY on these keywords and receipts, generate a concise topic title (max 6 words).

Keywords: ${context.topicKeywords.join(', ')}

Receipts:
${context.receipts.map((r) => `- ${r.title}`).join('\n')}

If the evidence is unclear, respond with a generic "Developing Story" equivalent.

${langInstruction}

Topic title:`,
      },
    ],
  });

  const title = extractTextFromResponse(response);
  await saveToCacheString(cacheKey, title, LLM_CACHE_TTL_HOURS);
  return title;
}

/**
 * Generate "why trending" explanation using LLM
 */
export async function generateWhyTrending(
  topic: Topic,
  language: AppLanguage = 'en',
  regions: string[] = []
): Promise<string> {
  const cacheKey = generateCacheKey('why-trending', { keywords: topic.keywords, language, regions });
  const cached = await getCachedString(cacheKey);
  if (cached) return cached;

  validateConfig();
  const context = buildGroundingContext(topic);
  const langInstruction = getLanguageInstruction(language);
  const regionText = regions.length > 0 ? regions.join(', ') : 'the selected regions';

  const response = await rateLimitedChatCompletion({
    model: MODEL,
    max_tokens: 100,
    messages: [
      {
        role: 'user',
        content: `Based ONLY on these receipts, explain in 1-2 sentences why this topic is trending.

Keywords: ${context.topicKeywords.join(', ')}

Receipts:
${context.receipts
  .map((r) => `- "${r.title}": ${r.snippet}${r.translatedSnippet ? ` [Translation hint: ${r.translatedSnippet}]` : ''}`)
  .join('\n')}

Dominant emotion: ${formatEmotion(getDominantEmotion(context.aggregates.emotionMix))}

IMPORTANT: Do not invent facts. Only summarize what's in the receipts.
If the evidence is insufficient, respond with a "Not enough evidence yet" equivalent.

${langInstruction}

Why trending:`,
      },
    ],
  });

  const explanation = extractTextFromResponse(response);
  await saveToCacheString(cacheKey, explanation, LLM_CACHE_TTL_HOURS);
  return explanation;
}

/**
 * Generate overall mood summary using LLM
 */
export async function generateOverallSummary(
  topics: Topic[],
  tensionIndex: number,
  emotions: EmotionDistribution,
  language: AppLanguage = 'en',
  regions: string[] = []
): Promise<string> {
  const topicData = topics.slice(0, 5).map((t) => ({
    keywords: t.keywords,
    receiptCount: t.receipts.length,
  }));

  const cacheKey = generateCacheKey('overall-summary', { topicData, tensionIndex, language, regions });
  const cached = await getCachedString(cacheKey);
  if (cached) return cached;

  validateConfig();
  const langInstruction = getLanguageInstruction(language);

  if (topics.length === 0) {
    const noActivityMessages: Record<AppLanguage, string> = {
      en: 'No significant news activity detected in the selected time window.',
      he: 'לא זוהתה פעילות חדשותית משמעותית בחלון הזמן שנבחר.',
      ru: 'В выбранном временном окне не обнаружено значительной новостной активности.',
    };
    return noActivityMessages[language] || noActivityMessages.en;
  }

  const topReceipts: string[] = [];
  for (const topic of topics.slice(0, 3)) {
    for (const receipt of topic.receipts.slice(0, 2)) {
      topReceipts.push(`- ${receipt.title}`);
    }
  }

  const regionText = regions.length > 0 ? regions.join(', ') : 'the selected regions';

  const response = await rateLimitedChatCompletion({
    model: MODEL,
    max_tokens: 150,
    messages: [
      {
        role: 'user',
        content: `Based ONLY on these data points, write a 1-3 sentence summary of the current mood in ${regionText}.

Tension Index: ${tensionIndex}/100
Top Topics: ${topics.slice(0, 5).map((t) => t.keywords.slice(0, 3).join(', ')).join(' | ')}
Dominant Emotion: ${formatEmotion(getDominantEmotion(emotions))}

Sample Headlines:
${topReceipts.join('\n')}

IMPORTANT: Do not invent facts. Only summarize patterns from the data.
If data is insufficient, respond with a "Not enough data to assess the current mood" equivalent.

${langInstruction}

Summary:`,
      },
    ],
  });

  const summary = extractTextFromResponse(response);
  await saveToCacheString(cacheKey, summary, LLM_CACHE_TTL_HOURS);
  return summary;
}

/**
 * Generate a summary for a specific country based on its news items
 */
export async function generateCountrySummary(
  country: string,
  headlines: string[],
  tensionIndex: number,
  dominantEmotion: string,
  itemCount: number
): Promise<string> {
  if (headlines.length === 0) {
    return `No significant news from ${country}.`;
  }

  const cacheKey = generateCacheKey('country-summary', {
    country,
    headlines: headlines.slice(0, 5),
    tensionIndex,
  });
  const cached = await getCachedString(cacheKey);
  if (cached) return cached;

  validateConfig();

  const response = await rateLimitedChatCompletion({
    model: MODEL,
    max_tokens: 100,
    messages: [
      {
        role: 'user',
        content: `Based ONLY on these headlines from ${country}, write a 1-2 sentence summary of the current mood in ${country}.

Tension Index: ${tensionIndex}/100
Dominant Emotion: ${dominantEmotion}
Item Count: ${itemCount}

Headlines:
${headlines.slice(0, 5).map(h => `- ${h}`).join('\n')}

IMPORTANT: Do not invent facts. Only summarize patterns from the headlines.
Keep it concise and factual. Start with "The current mood in ${country}..."

Summary:`,
      },
    ],
  });

  const summary = extractTextFromResponse(response);
  await saveToCacheString(cacheKey, summary, LLM_CACHE_TTL_HOURS);
  return summary;
}

/**
 * Enhance topics with LLM-generated content
 */
export async function enhanceTopicsWithLLM(
  topics: Topic[],
  language: AppLanguage = 'en',
  regions: string[] = []
): Promise<Topic[]> {
  const enhanced = await Promise.all(
    topics.map(async (topic) => {
      const [title, whyTrending] = await Promise.all([
        generateTopicTitle(topic, language),
        generateWhyTrending(topic, language, regions),
      ]);

      return {
        ...topic,
        title,
        whyTrending,
      };
    })
  );

  return enhanced;
}

/**
 * Validate LLM configuration on startup
 */
export function validateLLMConfig(): void {
  validateConfig();
}

/**
 * Get LLM availability status
 */
export function getLLMStatus(): { available: boolean; message: string } {
  if (!process.env.OPENAI_API_KEY) {
    return {
      available: false,
      message: 'OPENAI_API_KEY not configured. Get your API key from https://platform.openai.com/api-keys',
    };
  }
  return {
    available: true,
    message: `OpenAI API ready (${MODEL})`,
  };
}
