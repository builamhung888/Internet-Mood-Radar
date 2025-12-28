/**
 * Worker Pool - True parallel processing with continuous workers
 *
 * Instead of batch processing (wait for all, then next batch),
 * workers continuously pull from a queue as they complete tasks.
 */

export interface WorkerResult<T> {
  index: number;
  result?: T;
  error?: Error;
}

/**
 * Process items with a pool of concurrent workers.
 * Each worker pulls the next item as soon as it finishes.
 *
 * @param items - Array of items to process
 * @param processor - Async function to process each item
 * @param concurrency - Number of parallel workers
 * @returns Array of results in original order
 */
export async function workerPool<T, R>(
  items: T[],
  processor: (item: T, index: number) => Promise<R>,
  concurrency: number
): Promise<WorkerResult<R>[]> {
  const results: WorkerResult<R>[] = new Array(items.length);
  let nextIndex = 0;
  let completed = 0;

  // Create a promise that resolves when all items are processed
  return new Promise((resolve) => {
    // Worker function - processes items until queue is empty
    const worker = async () => {
      while (true) {
        // Get next item index atomically
        const index = nextIndex++;
        if (index >= items.length) {
          return; // No more items
        }

        const item = items[index];

        try {
          const result = await processor(item, index);
          results[index] = { index, result };
        } catch (error) {
          results[index] = {
            index,
            error: error instanceof Error ? error : new Error(String(error)),
          };
        }

        completed++;
        if (completed === items.length) {
          resolve(results);
        }
      }
    };

    // Handle empty input
    if (items.length === 0) {
      resolve([]);
      return;
    }

    // Start workers (up to concurrency limit or item count)
    const workerCount = Math.min(concurrency, items.length);
    for (let i = 0; i < workerCount; i++) {
      worker();
    }
  });
}

/**
 * Process items with worker pool and collect successful results
 *
 * @param items - Array of items to process
 * @param processor - Async function to process each item
 * @param concurrency - Number of parallel workers
 * @param onError - Optional callback for errors
 * @returns Array of successful results (may be fewer than input)
 */
export async function workerPoolCollect<T, R>(
  items: T[],
  processor: (item: T, index: number) => Promise<R>,
  concurrency: number,
  onError?: (item: T, index: number, error: Error) => void
): Promise<R[]> {
  const results = await workerPool(items, processor, concurrency);

  const successful: R[] = [];
  for (const r of results) {
    if (r.result !== undefined) {
      successful.push(r.result);
    } else if (r.error && onError) {
      onError(items[r.index], r.index, r.error);
    }
  }

  return successful;
}
