'use client';

import { EmotionWithDelta } from '@/types';
import { EMOTION_COLORS, EMOTION_LABELS } from '@/lib/constants';

interface EmotionBarsProps {
  emotions: EmotionWithDelta[];
}

export function EmotionBars({ emotions }: EmotionBarsProps) {
  // Sort by value descending
  const sorted = [...emotions].sort((a, b) => b.value - a.value);

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Emotion Distribution</span>
      </div>

      {sorted.map((emotion) => (
        <div key={emotion.emotion} className="emotion-bar">
          <span className="emotion-label">{EMOTION_LABELS[emotion.emotion]}</span>
          <div className="emotion-bar-container">
            <div
              className="emotion-bar-fill"
              style={{
                width: `${emotion.value * 100}%`,
                backgroundColor: EMOTION_COLORS[emotion.emotion],
              }}
            />
          </div>
          <span
            className={`emotion-delta ${
              emotion.delta > 0.01
                ? 'delta-positive'
                : emotion.delta < -0.01
                ? 'delta-negative'
                : 'delta-neutral'
            }`}
          >
            {emotion.delta > 0.01
              ? `+${(emotion.delta * 100).toFixed(0)}%`
              : emotion.delta < -0.01
              ? `${(emotion.delta * 100).toFixed(0)}%`
              : '—'}
          </span>
        </div>
      ))}
    </div>
  );
}
