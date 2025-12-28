'use client';

import { useState, useEffect, useCallback } from 'react';

interface ScanStatus {
  phase: 'idle' | 'fetching' | 'processing' | 'clustering' | 'summarizing' | 'saving' | 'complete' | 'error';
  message: string;
  progress?: number;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  itemCount?: number;
}

interface ScanStatusIndicatorProps {
  onScanComplete?: () => void;
}

const PHASE_LABELS: Record<ScanStatus['phase'], string> = {
  idle: 'Ready',
  fetching: 'Fetching data...',
  processing: 'Processing...',
  clustering: 'Clustering topics...',
  summarizing: 'Generating summaries...',
  saving: 'Saving...',
  complete: 'Complete',
  error: 'Error',
};

export function ScanStatusIndicator({ onScanComplete }: ScanStatusIndicatorProps) {
  const [status, setStatus] = useState<ScanStatus | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  const pollStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/scan-status');
      if (response.ok) {
        const data: ScanStatus = await response.json();
        setStatus(data);

        // Check if scan just completed
        if (data.phase === 'complete' && isPolling) {
          setShowSuccess(true);
          setIsPolling(false);
          onScanComplete?.();

          // Hide success message after 5 seconds
          setTimeout(() => {
            setShowSuccess(false);
            setStatus(null);
          }, 5000);
        } else if (data.phase === 'error') {
          setIsPolling(false);
        }

        return data;
      }
    } catch (error) {
      console.error('Failed to poll scan status:', error);
    }
    return null;
  }, [isPolling, onScanComplete]);

  // Start polling when component mounts
  useEffect(() => {
    // Initial check
    pollStatus().then((data) => {
      if (data && data.phase !== 'idle' && data.phase !== 'complete' && data.phase !== 'error') {
        setIsPolling(true);
      }
    });
  }, []);

  // Poll interval when a scan is in progress
  useEffect(() => {
    if (!isPolling) return;

    const interval = setInterval(pollStatus, 2000);
    return () => clearInterval(interval);
  }, [isPolling, pollStatus]);

  // Public method to start watching for scan status
  const startWatching = useCallback(() => {
    setIsPolling(true);
    pollStatus();
  }, [pollStatus]);

  // Expose startWatching via window for other components
  useEffect(() => {
    (window as unknown as { startScanStatusWatch?: () => void }).startScanStatusWatch = startWatching;
    return () => {
      delete (window as unknown as { startScanStatusWatch?: () => void }).startScanStatusWatch;
    };
  }, [startWatching]);

  // Don't render if idle and not showing success
  if (!status || (status.phase === 'idle' && !showSuccess)) {
    return null;
  }

  const isActive = status.phase !== 'idle' && status.phase !== 'complete' && status.phase !== 'error';

  return (
    <div className={`scan-status-indicator ${status.phase} ${showSuccess ? 'success-fade' : ''}`}>
      <div className="scan-status-content">
        {isActive && (
          <div className="scan-spinner" />
        )}
        {status.phase === 'complete' && (
          <span className="scan-icon">✓</span>
        )}
        {status.phase === 'error' && (
          <span className="scan-icon error">✕</span>
        )}
        <div className="scan-status-text">
          <span className="scan-status-label">{PHASE_LABELS[status.phase]}</span>
          <span className="scan-status-message">{status.message}</span>
        </div>
        {status.progress !== undefined && isActive && (
          <div className="scan-progress-bar">
            <div
              className="scan-progress-fill"
              style={{ width: `${status.progress}%` }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
