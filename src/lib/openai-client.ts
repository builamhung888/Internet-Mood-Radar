/**
 * Centralized rate-limited OpenAI client
 *
 * All OpenAI calls should go through this module to respect rate limits.
 * gpt-4o-mini has a limit of 2M tokens per minute.
 */

import OpenAI from 'openai';

const LLM_TIMEOUT_MS = 30000;

// Rate limiting configuration
const MIN_DELAY_MS = 50; // Minimum delay between requests
const RATE_LIMIT_BACKOFF_MS = 1000; // Base backoff on rate limit
const MAX_RETRIES = 3;

// Track request timing for rate limiting
let lastRequestTime = 0;
let consecutiveRateLimits = 0;

// Singleton client instance
let clientInstance: OpenAI | null = null;

/**
 * Get or create the OpenAI client singleton
 */
export function getOpenAIClient(): OpenAI | null {
  if (!process.env.OPENAI_API_KEY) {
    return null;
  }

  if (!clientInstance) {
    clientInstance = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: LLM_TIMEOUT_MS,
      maxRetries: 0, // We handle retries ourselves
    });
  }

  return clientInstance;
}

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Wait for rate limit window if needed
 */
async function waitForRateLimit(): Promise<void> {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;

  // Calculate delay based on consecutive rate limits
  const dynamicDelay = MIN_DELAY_MS + (consecutiveRateLimits * 100);

  if (timeSinceLastRequest < dynamicDelay) {
    await sleep(dynamicDelay - timeSinceLastRequest);
  }

  lastRequestTime = Date.now();
}

/**
 * Make a rate-limited chat completion request
 */
export async function rateLimitedChatCompletion(
  params: OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming
): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  const client = getOpenAIClient();
  if (!client) {
    throw new Error('OpenAI client not configured - missing OPENAI_API_KEY');
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    await waitForRateLimit();

    try {
      const response = await client.chat.completions.create(params);

      // Success - reset consecutive rate limits
      consecutiveRateLimits = Math.max(0, consecutiveRateLimits - 1);

      return response;
    } catch (error) {
      lastError = error as Error;

      // Check if it's a rate limit error
      if (error instanceof OpenAI.APIError && error.status === 429) {
        consecutiveRateLimits++;

        // Extract retry-after if available
        const retryAfterMs = error.headers?.['retry-after-ms'];
        const backoffMs = retryAfterMs
          ? parseInt(retryAfterMs, 10)
          : RATE_LIMIT_BACKOFF_MS * Math.pow(2, attempt);

        console.warn(`[OPENAI] Rate limited, waiting ${backoffMs}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
        await sleep(backoffMs);
        continue;
      }

      // For other errors, throw immediately
      throw error;
    }
  }

  throw lastError || new Error('Max retries exceeded');
}

/**
 * Quick helper to check if OpenAI is configured
 */
export function isOpenAIConfigured(): boolean {
  return !!process.env.OPENAI_API_KEY;
}
