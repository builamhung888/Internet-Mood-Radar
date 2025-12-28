/**
 * MCP Client for Bright Data
 *
 * Connects to Bright Data's MCP server via SSE transport.
 * Provides search_engine and scrape_as_markdown tools.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

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

// Singleton client instance
let client: Client | null = null;
let connectionPromise: Promise<Client> | null = null;

/**
 * Get MCP URL from environment
 */
function getMcpUrl(): string | null {
  const apiKey = process.env.BRIGHTDATA_API_KEY;
  if (!apiKey) return null;
  return `https://mcp.brightdata.com/sse?token=${apiKey}&pro=1`;
}

/**
 * Check if MCP is available
 */
export function getMcpStatus(): { available: boolean; message: string } {
  const url = getMcpUrl();
  if (!url) {
    return {
      available: false,
      message: 'BRIGHTDATA_API_KEY not configured',
    };
  }
  return {
    available: true,
    message: 'Bright Data MCP ready',
  };
}

/**
 * Get or create MCP client connection
 */
export async function getMcpClient(): Promise<Client> {
  if (client) return client;

  // Prevent multiple simultaneous connection attempts
  if (connectionPromise) return connectionPromise;

  const url = getMcpUrl();
  if (!url) {
    throw new Error('BRIGHTDATA_API_KEY not configured');
  }

  connectionPromise = (async () => {
    console.log('[MCP] Connecting to Bright Data MCP server...');

    const transport = new SSEClientTransport(new URL(url));
    const newClient = new Client(
      { name: 'internet-mood-radar', version: '1.0.0' },
      { capabilities: {} }
    );

    await newClient.connect(transport);
    console.log('[MCP] Connected successfully');

    client = newClient;
    return newClient;
  })();

  try {
    return await connectionPromise;
  } finally {
    connectionPromise = null;
  }
}

/**
 * Close MCP client connection
 */
export async function closeMcpClient(): Promise<void> {
  if (client) {
    try {
      await client.close();
    } catch {
      // Ignore close errors
    }
    client = null;
  }
}

/**
 * Execute a Google search via MCP
 */
export async function mcpSearch(query: string): Promise<SerpResult[]> {
  const c = await getMcpClient();

  console.log(`[MCP] Searching: "${query}"`);

  const result = await c.callTool({
    name: 'search_engine',
    arguments: { query, engine: 'google' },
  });

  // Parse the result content
  let data: any;
  if (result.content && Array.isArray(result.content)) {
    // MCP SDK returns content as array of content blocks
    const textContent = result.content.find((c: any) => c.type === 'text');
    if (textContent && 'text' in textContent) {
      data = JSON.parse(textContent.text);
    }
  } else if (typeof result.content === 'string') {
    data = JSON.parse(result.content);
  } else {
    data = result.content;
  }

  // Extract organic results
  const organic = data?.organic || data?.results || [];

  return organic.map((r: any, i: number) => ({
    title: r.title || '',
    url: r.link || r.url || '',
    snippet: r.snippet || r.description || '',
    position: i + 1,
  }));
}

/**
 * Scrape a URL as markdown via MCP
 */
export async function mcpScrape(url: string): Promise<ScrapeResult> {
  const c = await getMcpClient();

  const domain = new URL(url).hostname.replace('www.', '');

  const result = await c.callTool({
    name: 'scrape_as_markdown',
    arguments: { url },
  });

  // Parse the result content
  let content: string;
  if (result.content && Array.isArray(result.content)) {
    const textContent = result.content.find((c: any) => c.type === 'text');
    content = textContent && 'text' in textContent ? textContent.text : '';
  } else if (typeof result.content === 'string') {
    content = result.content;
  } else {
    content = JSON.stringify(result.content);
  }

  const contentSize = content?.length || 0;
  const sizeKb = (contentSize / 1024).toFixed(1);
  console.log(`[MCP] Scraped ${domain}: ${sizeKb}KB${contentSize < 500 ? ' (WARNING: very small content)' : ''}`);

  // Extract title from markdown if present
  const titleMatch = content.match(/^#\s+(.+)$/m);
  const title = titleMatch ? titleMatch[1].trim() : undefined;

  // Extract the best article image from markdown content
  const imageUrl = extractBestImage(content);

  return { content, title, imageUrl };
}

/**
 * Extract the best article image from markdown content
 * Filters out common non-article images like logos, icons, ads
 */
function extractBestImage(content: string): string | undefined {
  // Find all markdown images: ![alt](url)
  const imageRegex = /!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g;
  const images: { alt: string; url: string }[] = [];

  let match;
  while ((match = imageRegex.exec(content)) !== null) {
    images.push({ alt: match[1], url: match[2] });
  }

  if (images.length === 0) return undefined;

  // Patterns to exclude (logos, icons, avatars, ads, tracking pixels)
  const excludePatterns = [
    /logo/i,
    /icon/i,
    /avatar/i,
    /favicon/i,
    /sprite/i,
    /banner/i,
    /advertisement/i,
    /tracking/i,
    /pixel/i,
    /badge/i,
    /button/i,
    /widget/i,
    /thumbnail.*small/i,
    /gravatar/i,
    /profile/i,
    /emoji/i,
    /\.svg$/i,
    /\.gif$/i,  // Often animated ads or icons
    /1x1/i,     // Tracking pixels
    /spacer/i,
    /blank/i,
    /transparent/i,
    /placeholder/i,
    /loading/i,
    /spinner/i,
    /social/i,  // Social media icons
    /share/i,
    /twitter/i,
    /facebook/i,
    /linkedin/i,
    /whatsapp/i,
    /pinterest/i,
    /email.*icon/i,
    /print.*icon/i,
    /comment.*icon/i,
    /author/i,           // Author photos
    /thumb(?!.*large)/i, // Thumbnails without "large"
    /ad[-_]/i,           // Ad images
    /promo/i,            // Promotional images
    /\d{2,3}x\d{2,3}/,   // Small dimensions like 50x50, 100x100
  ];

  // Patterns that indicate good article images
  const preferPatterns = [
    /featured/i,
    /article/i,
    /hero/i,
    /main/i,
    /cover/i,
    /header/i,
    /image/i,
    /photo/i,
    /picture/i,
    /thumb.*large/i,
    /wp-content.*uploads/i,  // WordPress uploads are usually article images
    /cdn.*article/i,
    /media.*\d{4}/i,  // Media URLs with year often are article images
    /cloudinary.*w_\d{3,}/i, // Cloudinary with width 100+
    /imgix.*w=\d{3,}/i,      // Imgix with width 100+
  ];

  // Filter out excluded images
  const filteredImages = images.filter(img => {
    const combined = `${img.alt} ${img.url}`.toLowerCase();
    return !excludePatterns.some(pattern => pattern.test(combined));
  });

  if (filteredImages.length === 0) {
    // If all images were filtered, try the first non-svg/gif image
    const fallback = images.find(img =>
      !img.url.endsWith('.svg') &&
      !img.url.endsWith('.gif') &&
      !img.url.includes('1x1')
    );
    return fallback?.url;
  }

  // Prefer images matching good patterns
  const preferred = filteredImages.find(img => {
    const combined = `${img.alt} ${img.url}`.toLowerCase();
    return preferPatterns.some(pattern => pattern.test(combined));
  });

  if (preferred) return preferred.url;

  // Otherwise return the first filtered image (likely the main content image)
  return filteredImages[0]?.url;
}
