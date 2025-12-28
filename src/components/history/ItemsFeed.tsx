'use client';

import { HistoricalItemWithDetails } from '@/lib/history';

interface ItemsFeedProps {
  items: HistoricalItemWithDetails[];
  maxHeight?: number;
}

function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - new Date(date).getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

function getSourceColor(source: string): string {
  switch (source.toLowerCase()) {
    case 'search':
      return '#3b82f6'; // blue
    case 'rss':
      return '#f97316'; // orange
    case 'events':
      return '#8b5cf6'; // purple
    case 'reddit':
      return '#ef4444'; // red
    case 'hackernews':
      return '#eab308'; // yellow
    default:
      return '#6b7280'; // gray
  }
}

export function ItemsFeed({ items, maxHeight = 400 }: ItemsFeedProps) {
  if (items.length === 0) {
    return (
      <div className="items-feed-empty">
        <p>No items available for this time range</p>
      </div>
    );
  }

  return (
    <div className="items-feed" style={{ maxHeight }}>
      <div className="items-list">
        {items.map((item) => (
          <a
            key={item.id}
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="feed-item"
          >
            <div className="feed-item-content">
              <h4 className="feed-item-title">{item.title}</h4>
              {item.text && <p className="feed-item-text">{item.text}</p>}
            </div>
            <div className="feed-item-meta">
              <span
                className="feed-item-source"
                style={{ backgroundColor: getSourceColor(item.source) }}
              >
                {item.source}
              </span>
              <span className="feed-item-lens">{item.lens}</span>
              <span className="feed-item-time">
                {formatTimeAgo(item.fetchedAt)}
              </span>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
