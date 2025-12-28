import { Emotion } from '@/types';

/**
 * Color mapping for emotions - used across UI components
 */
export const EMOTION_COLORS: Record<Emotion, string> = {
  anger: '#ef4444',
  anxiety: '#f97316',
  sadness: '#6366f1',
  resilience: '#22c55e',
  hope: '#10b981',
  excitement: '#f59e0b',
  cynicism: '#8b5cf6',
  neutral: '#6b7280',
};

/**
 * Display labels for emotions
 */
export const EMOTION_LABELS: Record<Emotion, string> = {
  anger: 'Anger',
  anxiety: 'Anxiety',
  sadness: 'Sadness',
  resilience: 'Resilience',
  hope: 'Hope',
  excitement: 'Excitement',
  cynicism: 'Cynicism',
  neutral: 'Neutral',
};
