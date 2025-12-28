'use client';

import { Receipt } from '@/types';

interface ReceiptFeedProps {
  receipts: Receipt[];
  title?: string;
}

function formatTime(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - new Date(date).getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor(diff / (1000 * 60));

  if (hours > 24) {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
  }
  if (hours > 0) {
    return `${hours}h ago`;
  }
  if (minutes > 0) {
    return `${minutes}m ago`;
  }
  return 'just now';
}

function getLanguageFlag(lang: string): string {
  switch (lang) {
    case 'he':
      return '🇮🇱';
    case 'ru':
      return '🇷🇺';
    case 'en':
      return '🇺🇸';
    default:
      return '🌐';
  }
}

export function ReceiptFeed({ receipts, title = 'Latest Updates' }: ReceiptFeedProps) {
  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">{title}</span>
        <span style={{ color: 'var(--muted)', fontSize: '0.75rem' }}>
          {receipts.length} items
        </span>
      </div>

      {receipts.length === 0 ? (
        <p style={{ color: 'var(--muted)' }}>No items to display</p>
      ) : (
        <div>
          {receipts.map((receipt) => (
            <div key={receipt.id} className="receipt-item">
              <a
                href={receipt.url}
                target="_blank"
                rel="noopener noreferrer"
                className="receipt-title"
              >
                {receipt.title}
              </a>
              <div className="receipt-meta">
                <span>{getLanguageFlag(receipt.language)} {receipt.source}</span>
                <span>{formatTime(receipt.createdAt)}</span>
                {receipt.engagement > 0 && <span>⬆ {receipt.engagement}</span>}
              </div>
              {receipt.snippet && (
                <p className="receipt-snippet">
                  {receipt.snippet.length > 150
                    ? receipt.snippet.substring(0, 150) + '...'
                    : receipt.snippet}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
