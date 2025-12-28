/**
 * Scan Status Management
 * Tracks background scan progress for UI feedback
 */

export type ScanPhase =
  | 'idle'
  | 'fetching'      // Fetching from sources
  | 'processing'    // Deduplicating, scoring mood
  | 'clustering'    // Topic clustering
  | 'summarizing'   // LLM summaries
  | 'saving'        // Saving to history
  | 'complete'
  | 'error';

export interface ScanStatus {
  phase: ScanPhase;
  message: string;
  progress?: number; // 0-100
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
  itemCount?: number;
}

// In-memory scan status (single instance for this process)
let currentStatus: ScanStatus = {
  phase: 'idle',
  message: 'Ready',
};

let scanPromise: Promise<void> | null = null;

export function getScanStatus(): ScanStatus {
  return { ...currentStatus };
}

export function updateScanStatus(update: Partial<ScanStatus>): void {
  currentStatus = { ...currentStatus, ...update };
  console.log(`[SCAN] ${update.phase || currentStatus.phase}: ${update.message || currentStatus.message}`);
}

export function isScanInProgress(): boolean {
  return currentStatus.phase !== 'idle' &&
         currentStatus.phase !== 'complete' &&
         currentStatus.phase !== 'error';
}

export function setScanPromise(promise: Promise<void> | null): void {
  scanPromise = promise;
}

export function getScanPromise(): Promise<void> | null {
  return scanPromise;
}

export function resetScanStatus(): void {
  currentStatus = {
    phase: 'idle',
    message: 'Ready',
  };
  scanPromise = null;
}
