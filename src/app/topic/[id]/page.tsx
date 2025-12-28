'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { PulseResponse, Topic, Emotion } from '@/types';
import { ReceiptFeed, EmotionBars } from '@/components';

export default function TopicPage() {
  const params = useParams();
  const topicId = params.id as string;

  const [topic, setTopic] = useState<Topic | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchTopic() {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch('/api/pulse?window=6h');
        if (!response.ok) {
          throw new Error(`Failed to fetch: ${response.statusText}`);
        }
        const pulse: PulseResponse = await response.json();
        const found = pulse.topics.find((t) => t.id === topicId);

        if (!found) {
          setError('Topic not found');
        } else {
          setTopic(found);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }

    fetchTopic();
  }, [topicId]);

  // Convert emotionMix to EmotionWithDelta format for EmotionBars
  const emotionsWithDelta = topic
    ? (Object.entries(topic.emotionMix) as [Emotion, number][]).map(([emotion, value]) => ({
        emotion,
        value,
        delta: 0,
      }))
    : [];

  return (
    <div className="container">
      <nav className="nav">
        <Link href="/">← Back to Home</Link>
        <Link href="/debug">Debug</Link>
      </nav>

      {loading && (
        <div className="loading">
          <div className="spinner" />
        </div>
      )}

      {error && (
        <div className="error-banner">
          <strong>Error:</strong> {error}
        </div>
      )}

      {topic && !loading && (
        <>
          <header className="header">
            <h1>{topic.title}</h1>
            {topic.delta > 0 && (
              <span className="new-badge" style={{ marginLeft: '1rem' }}>
                NEW
              </span>
            )}
          </header>

          <div className="summary-box">
            <p className="summary-text">{topic.whyTrending}</p>
          </div>

          <div className="grid" style={{ marginBottom: '2rem' }}>
            <div className="card">
              <div className="card-header">
                <span className="card-title">Topic Keywords</span>
              </div>
              <div className="topic-keywords">
                {topic.keywords.map((keyword) => (
                  <span key={keyword} className="keyword-tag">
                    {keyword}
                  </span>
                ))}
              </div>
            </div>

            <EmotionBars emotions={emotionsWithDelta} />
          </div>

          <h2 style={{ marginBottom: '1rem' }}>Sources ({topic.receipts.length})</h2>
          <ReceiptFeed receipts={topic.receipts} title="Topic Sources" />
        </>
      )}
    </div>
  );
}
