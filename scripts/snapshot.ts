/**
 * Daily Snapshot Script
 * Run this daily (e.g., via cron) to save snapshots for delta calculations
 *
 * Usage: npx tsx scripts/snapshot.ts
 */

import { fetchAllSources } from '../src/adapters';
import { scoreRelevance, deduplicateItems } from '../src/lib/relevance';
import { aggregateEmotions, calculateTensionIndex } from '../src/lib/mood';
import { clusterIntoTopics } from '../src/lib/clustering';
import { enhanceTopicsWithLLM, generateOverallSummary } from '../src/lib/llm';
import { saveSnapshot, createSnapshot, cleanupOldSnapshots } from '../src/lib/snapshot';
import { getDateString } from '../src/lib/utils';
import { TIME_WINDOWS } from '../src/lib/config';

async function runSnapshot() {
  console.log('Starting daily snapshot...');
  console.log(`Date: ${getDateString()}`);

  // Calculate time window (24 hours for daily snapshot)
  const since = new Date(Date.now() - TIME_WINDOWS['24h']);

  // Fetch all sources
  console.log('Fetching sources...');
  const { items, errors } = await fetchAllSources(since);

  if (errors.length > 0) {
    console.log(`Encountered ${errors.length} non-fatal errors:`);
    for (const error of errors) {
      console.log(`  - ${error.source}: ${error.message}`);
    }
  }

  console.log(`Fetched ${items.length} items`);

  // Score relevance
  console.log('Scoring relevance...');
  const scoredItems = items.map((item) => ({
    ...item,
    relevanceScore: scoreRelevance(item),
  }));

  // Deduplicate
  console.log('Deduplicating...');
  const dedupedItems = deduplicateItems(scoredItems);
  const uniqueCount = dedupedItems.filter((i) => !i.duplicateOf).length;
  console.log(`${uniqueCount} unique items after deduplication`);

  // Aggregate emotions
  console.log('Computing emotions...');
  const emotions = aggregateEmotions(dedupedItems);
  const tensionIndex = calculateTensionIndex(emotions);
  console.log(`Tension index: ${tensionIndex}/100`);

  // Cluster into topics
  console.log('Clustering into topics...');
  const topics = clusterIntoTopics(dedupedItems);
  console.log(`Created ${topics.length} topic clusters`);

  // Enhance with LLM (if available)
  console.log('Generating LLM content...');
  const enhancedTopics = await enhanceTopicsWithLLM(topics);

  // Generate overall summary
  const overallSummary = await generateOverallSummary(enhancedTopics, tensionIndex, emotions);

  // Build LLM outputs cache
  const llmOutputs: Record<string, string> = {
    overallSummary,
  };

  for (const topic of enhancedTopics) {
    llmOutputs[`topic:${topic.id}:title`] = topic.title;
    llmOutputs[`topic:${topic.id}:whyTrending`] = topic.whyTrending;
  }

  // Create and save snapshot
  console.log('Saving snapshot...');
  const snapshot = createSnapshot(
    getDateString(),
    tensionIndex,
    emotions,
    enhancedTopics,
    llmOutputs
  );

  await saveSnapshot(snapshot);

  // Cleanup old snapshots
  console.log('Cleaning up old snapshots...');
  const cleaned = await cleanupOldSnapshots();
  if (cleaned > 0) {
    console.log(`Removed ${cleaned} old snapshots`);
  }

  console.log('Snapshot complete!');
  console.log(`Summary: ${overallSummary}`);
}

// Run
runSnapshot()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Snapshot failed:', error);
    process.exit(1);
  });
