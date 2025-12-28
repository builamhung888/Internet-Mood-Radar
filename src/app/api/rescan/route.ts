import { NextResponse } from 'next/server';
import { invalidatePulseCache, cachePulse } from '@/lib/pulse-cache';
import { runPipeline } from '@/lib/pipeline';
import { getSettings } from '@/lib/settings';
import {
  getScanStatus,
  updateScanStatus,
  isScanInProgress,
  setScanPromise,
  resetScanStatus,
} from '@/lib/scan-status';

/**
 * POST /api/rescan
 * Triggers a background scan - returns immediately while scan runs in background
 * New items will be merged with existing historical items
 */
export async function POST() {
  try {
    // Check if a scan is already in progress
    if (isScanInProgress()) {
      return NextResponse.json({
        success: false,
        message: 'A scan is already in progress',
        status: getScanStatus(),
      }, { status: 409 });
    }

    // Clear pulse cache to ensure fresh data is used
    await invalidatePulseCache();

    // Start background scan
    const scanPromise = runBackgroundScan();
    setScanPromise(scanPromise);

    return NextResponse.json({
      success: true,
      message: 'Scan started in background. Poll /api/scan-status for progress.',
      status: getScanStatus(),
    });
  } catch (error) {
    console.error('[API/RESCAN] Error:', error);
    return NextResponse.json(
      { error: 'Failed to start scan' },
      { status: 500 }
    );
  }
}

/**
 * Run the pipeline in the background with status updates
 */
async function runBackgroundScan(): Promise<void> {
  try {
    updateScanStatus({
      phase: 'fetching',
      message: 'Fetching data from sources...',
      progress: 10,
      startedAt: new Date(),
    });

    const settings = await getSettings();

    // Run the pipeline (it has its own internal logging)
    // We'll update status at key points
    updateScanStatus({
      phase: 'processing',
      message: 'Processing and merging items...',
      progress: 40,
    });

    const pulse = await runPipeline({
      window: '6h',
      language: settings.language,
    });

    updateScanStatus({
      phase: 'saving',
      message: 'Caching results...',
      progress: 90,
      itemCount: pulse.allReceipts?.length || 0,
    });

    // Cache the result
    await cachePulse('6h', pulse);

    updateScanStatus({
      phase: 'complete',
      message: `Scan complete. Found ${pulse.allReceipts?.length || 0} items.`,
      progress: 100,
      completedAt: new Date(),
      itemCount: pulse.allReceipts?.length || 0,
    });

    // Auto-reset to idle after 30 seconds
    setTimeout(() => {
      if (getScanStatus().phase === 'complete') {
        resetScanStatus();
      }
    }, 30000);

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[BACKGROUND SCAN] Error:', error);

    updateScanStatus({
      phase: 'error',
      message: `Scan failed: ${errorMessage}`,
      error: errorMessage,
      completedAt: new Date(),
    });

    // Auto-reset to idle after 60 seconds on error
    setTimeout(() => {
      if (getScanStatus().phase === 'error') {
        resetScanStatus();
      }
    }, 60000);
  }
}
