'use client';

import { Topic, Emotion } from '@/types';
import { EMOTION_COLORS } from '@/lib/constants';
import Link from 'next/link';

interface TopicCardProps {
  topic: Topic;
}

export function TopicCard({ topic }: TopicCardProps) {
  // Get dominant emotion
  const dominantEmotion = (Object.entries(topic.emotionMix) as [Emotion, number][])
    .sort((a, b) => b[1] - a[1])[0];

  return (
    <Link href={`/topic/${topic.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
      <div className="card topic-card">
        <div className="card-header">
          <span className="card-title">{topic.title}</span>
          {topic.delta > 0 && <span className="new-badge">NEW</span>}
        </div>

        <p style={{ color: 'var(--muted)', fontSize: '0.875rem', marginBottom: '0.75rem' }}>
          {topic.whyTrending}
        </p>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
          <div
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: EMOTION_COLORS[dominantEmotion[0]],
            }}
          />
          <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
            {dominantEmotion[0].charAt(0).toUpperCase() + dominantEmotion[0].slice(1)} ({(dominantEmotion[1] * 100).toFixed(0)}%)
          </span>
          <span style={{ fontSize: '0.75rem', color: 'var(--muted)', marginLeft: 'auto' }}>
            {topic.receipts.length} sources
          </span>
        </div>

        <div className="topic-keywords">
          {topic.keywords.slice(0, 4).map((keyword) => (
            <span key={keyword} className="keyword-tag">
              {keyword}
            </span>
          ))}
        </div>
      </div>
    </Link>
  );
}
