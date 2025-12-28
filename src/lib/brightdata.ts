/**
 * Bright Data Integration via MCP
 *
 * Uses Bright Data's MCP server (SSE transport) for:
 * 1. search_engine - Google search results
 * 2. scrape_as_markdown - Web page scraping
 */

import {
  getMcpStatus,
  mcpSearch,
  mcpScrape,
  SerpResult as McpSerpResult,
  ScrapeResult as McpScrapeResult,
} from './mcp-client';

// Re-export types for compatibility
export interface SerpResult {
  title: string;
  url: string;
  snippet: string;
  position: number;
}

export interface ScrapeResult {
  content: string;
  imageUrl?: string;
  title?: string;
}

/**
 * Check if Bright Data MCP is available
 */
export function getBrightDataStatus(): { available: boolean; message: string } {
  return getMcpStatus();
}

/**
 * Execute a Google search via Bright Data MCP
 */
export async function serpSearch(
  query: string,
  options: {
    country?: string;
    language?: string;
    numResults?: number;
  } = {}
): Promise<SerpResult[]> {
  const status = getMcpStatus();
  if (!status.available) {
    throw new Error(status.message);
  }

  // Note: MCP search_engine doesn't support country/language params directly
  // The query itself should be crafted appropriately
  return mcpSearch(query);
}

/**
 * Scrape a URL and return markdown content via Bright Data MCP
 */
export async function scrapeAsMarkdown(url: string): Promise<ScrapeResult> {
  const status = getMcpStatus();
  if (!status.available) {
    throw new Error(status.message);
  }

  return mcpScrape(url);
}

/**
 * Alternative scrape function (kept for API compatibility, uses same MCP)
 */
export async function scrapeWithProxy(url: string): Promise<ScrapeResult> {
  return scrapeAsMarkdown(url);
}
