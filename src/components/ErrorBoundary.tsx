'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="error-boundary">
          <div className="error-boundary-content">
            <h2>Something went wrong</h2>
            <p>
              {this.state.error?.message || 'An unexpected error occurred'}
            </p>
            <button
              onClick={this.handleRetry}
              className="error-boundary-button"
            >
              Try Again
            </button>
          </div>
          <style jsx>{`
            .error-boundary {
              display: flex;
              justify-content: center;
              align-items: center;
              min-height: 50vh;
              padding: 2rem;
            }
            .error-boundary-content {
              text-align: center;
              padding: 2rem;
              background: var(--card-bg, #1a1a2e);
              border-radius: 8px;
              max-width: 400px;
            }
            .error-boundary-content h2 {
              color: #ef4444;
              margin-bottom: 1rem;
            }
            .error-boundary-content p {
              color: var(--muted, #888);
              margin-bottom: 1.5rem;
            }
            .error-boundary-button {
              background: var(--accent, #6366f1);
              color: white;
              border: none;
              padding: 0.75rem 1.5rem;
              border-radius: 4px;
              cursor: pointer;
              font-size: 1rem;
            }
            .error-boundary-button:hover {
              opacity: 0.9;
            }
          `}</style>
        </div>
      );
    }

    return this.props.children;
  }
}
