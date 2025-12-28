'use client';

import { useMemo } from 'react';

interface EmotionPanelProps {
  emotions: Record<string, number>;
}

// Emotion colors matching the main app
const EMOTION_COLORS: Record<string, string> = {
  anger: '#ef4444',
  anxiety: '#f97316',
  sadness: '#3b82f6',
  resilience: '#22c55e',
  hope: '#10b981',
  excitement: '#8b5cf6',
  cynicism: '#6b7280',
  neutral: '#9ca3af',
};

const EMOTION_LABELS: Record<string, string> = {
  anger: 'Anger',
  anxiety: 'Anxiety',
  sadness: 'Sadness',
  resilience: 'Resilience',
  hope: 'Hope',
  excitement: 'Excitement',
  cynicism: 'Cynicism',
  neutral: 'Neutral',
};

interface EmotionBar {
  emotion: string;
  label: string;
  value: number;
  percentage: number;
  color: string;
}

export function EmotionPanel({ emotions }: EmotionPanelProps) {
  const sortedEmotions = useMemo<EmotionBar[]>(() => {
    const entries = Object.entries(emotions);
    const total = entries.reduce((sum, [, v]) => sum + v, 0);

    return entries
      .map(([emotion, value]) => ({
        emotion,
        label: EMOTION_LABELS[emotion] || emotion,
        value,
        percentage: total > 0 ? (value / total) * 100 : 0,
        color: EMOTION_COLORS[emotion] || '#6b7280',
      }))
      .sort((a, b) => b.value - a.value);
  }, [emotions]);

  if (sortedEmotions.length === 0) {
    return (
      <div className="emotion-panel-empty">
        <p>No emotion data available</p>
      </div>
    );
  }

  return (
    <div className="emotion-panel">
      {sortedEmotions.map((item) => (
        <div key={item.emotion} className="emotion-bar-container">
          <div className="emotion-bar-header">
            <span className="emotion-label">{item.label}</span>
            <span className="emotion-value">{item.percentage.toFixed(0)}%</span>
          </div>
          <div className="emotion-bar-track">
            <div
              className="emotion-bar-fill"
              style={{
                width: `${item.percentage}%`,
                backgroundColor: item.color,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
