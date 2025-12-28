import { NonFatalError, FetchResult, SourceConfig } from '@/types';
import { FETCH_TIMEOUT_MS } from '@/lib/config';

/**
 * Base adapter class for all data sources
 */
export abstract class BaseAdapter {
  protected config: SourceConfig;

  constructor(config: SourceConfig) {
    this.config = config;
  }

  /**
   * Log helper with source prefix
   */
  protected log(message: string, data?: unknown): void {
    const prefix = `[${this.config.type.toUpperCase()}:${this.config.name}]`;
    if (data !== undefined) {
      console.log(prefix, message, data);
    } else {
      console.log(prefix, message);
    }
  }

  /**
   * Error log helper
   */
  protected logError(message: string, error?: unknown): void {
    const prefix = `[${this.config.type.toUpperCase()}:${this.config.name}]`;
    console.error(prefix, message, error || '');
  }

  /**
   * Fetch items from the source
   */
  abstract fetch(since: Date): Promise<FetchResult>;

  /**
   * Fetch with timeout and error handling
   */
  protected async fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const startTime = Date.now();
    this.log(`Fetching: ${url}`);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      const elapsed = Date.now() - startTime;
      this.log(`Fetch completed in ${elapsed}ms - Status: ${response.status}`);
      return response;
    } catch (error) {
      const elapsed = Date.now() - startTime;
      if (error instanceof Error && error.name === 'AbortError') {
        this.logError(`Fetch timed out after ${elapsed}ms`);
      } else {
        this.logError(`Fetch failed after ${elapsed}ms:`, error);
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Create an error result
   */
  protected createError(message: string): NonFatalError {
    return {
      source: this.config.name,
      message,
      timestamp: new Date(),
    };
  }

  /**
   * Create an empty result with an error
   */
  protected emptyResult(error: string): FetchResult {
    return {
      items: [],
      errors: [this.createError(error)],
      sourceName: this.config.name,
    };
  }
}
