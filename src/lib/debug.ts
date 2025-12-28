/**
 * Debug utilities for saving pipeline data at each step
 *
 * Saves JSON files to /debug folder (overwrites on each run)
 * Only active when DEBUG_PIPELINE=true in .env
 */

import fs from 'fs';
import path from 'path';

const DEBUG_DIR = path.join(process.cwd(), 'debug');
const DEBUG_ENABLED = process.env.DEBUG_PIPELINE === 'true';

/**
 * Initialize debug folder (clears previous data)
 */
export function startDebugRun(): void {
  if (!DEBUG_ENABLED) return;

  try {
    // Create or clear debug folder
    if (fs.existsSync(DEBUG_DIR)) {
      const files = fs.readdirSync(DEBUG_DIR);
      for (const file of files) {
        fs.unlinkSync(path.join(DEBUG_DIR, file));
      }
    } else {
      fs.mkdirSync(DEBUG_DIR, { recursive: true });
    }
    console.log(`[DEBUG] Debug folder ready: ${DEBUG_DIR}`);
  } catch (err) {
    console.error('[DEBUG] Failed to initialize debug folder:', err);
  }
}

/**
 * Save data from a pipeline step
 */
export function saveDebugStep(stepName: string, data: unknown): void {
  if (!DEBUG_ENABLED) return;

  const filename = `${stepName.replace(/\s+/g, '-').toLowerCase()}.json`;
  const filepath = path.join(DEBUG_DIR, filename);

  try {
    const jsonData = JSON.stringify(data, (key, value) => {
      // Handle Date objects
      if (value instanceof Date) {
        return value.toISOString();
      }
      return value;
    }, 2);

    fs.writeFileSync(filepath, jsonData);
    console.log(`[DEBUG] Saved: ${filename} (${(jsonData.length / 1024).toFixed(1)}KB)`);
  } catch (err) {
    console.error(`[DEBUG] Failed to save ${stepName}:`, err);
  }
}

/**
 * Save a summary of the run
 */
export function saveDebugSummary(summary: {
  totalItems: number;
  topics: number;
  tensionIndex: number;
  errors: number;
  durationMs: number;
}): void {
  if (!DEBUG_ENABLED) return;

  const filepath = path.join(DEBUG_DIR, '00-summary.json');

  try {
    const data = {
      ...summary,
      timestamp: new Date().toISOString(),
    };
    fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
    console.log(`[DEBUG] Summary saved`);
  } catch (err) {
    console.error('[DEBUG] Failed to save summary:', err);
  }
}

/**
 * Check if debug mode is enabled
 */
export function isDebugEnabled(): boolean {
  return DEBUG_ENABLED;
}
