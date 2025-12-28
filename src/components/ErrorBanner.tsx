'use client';

import { NonFatalError } from '@/types';

interface ErrorBannerProps {
  errors: NonFatalError[];
}

export function ErrorBanner({ errors }: ErrorBannerProps) {
  if (errors.length === 0) return null;

  return (
    <div className="error-banner">
      <strong>Some sources encountered issues:</strong>
      <ul style={{ marginTop: '0.5rem', marginLeft: '1.5rem' }}>
        {errors.map((error, i) => (
          <li key={i}>
            {error.source}: {error.message}
          </li>
        ))}
      </ul>
    </div>
  );
}
