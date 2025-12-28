'use client';

import Link from 'next/link';
import { useLanguage } from '@/contexts/LanguageContext';
import { getTensionColor, getTensionCategory } from '@/lib/utils';

interface MapControlsProps {
  window: '1h' | '6h' | '24h';
  onWindowChange: (window: '1h' | '6h' | '24h') => void;
  tensionIndex: number;
  topicCount: number;
  sourceCount: number;
  totalCount?: number;
  eventCount?: number;
  showEvents?: boolean;
  onToggleEvents?: (show: boolean) => void;
  onOpenSettings?: () => void;
  onOpenNewsFeed?: () => void;
  loading?: boolean;
  selectedCountry?: string | null;
  onClearSelection?: () => void;
}

export function MapControls({
  window,
  onWindowChange,
  tensionIndex,
  topicCount,
  sourceCount,
  totalCount = 0,
  eventCount = 0,
  showEvents = true,
  onToggleEvents,
  onOpenSettings,
  onOpenNewsFeed,
  loading,
  selectedCountry,
  onClearSelection,
}: MapControlsProps) {
  const { t } = useLanguage();

  return (
    <>
      {/* Top left - Logo and title */}
      <div className="map-control map-control-top-left">
        <div className="map-logo">
          <h1>{t.appTitle}</h1>
          <span className="version-badge">V1: World</span>
        </div>
      </div>

      {/* Top right - Navigation */}
      <div className="map-control map-control-top-right">
        <nav className="map-nav">
          <Link href="/" className="map-nav-link active">Map</Link>
          <Link href="/history" className="map-nav-link">History</Link>
          <Link href="/debug" className="map-nav-link">Debug</Link>
          {onOpenSettings && (
            <button
              className="map-nav-link settings-btn-icon"
              onClick={onOpenSettings}
              title="Settings"
              aria-label="Open settings"
            >
              ⚙️
            </button>
          )}
        </nav>
      </div>

      {/* Bottom left - Mood legend and layer toggles */}
      <div className="map-control map-control-bottom-left">
        <div className="mood-legend">
          <div className="mood-legend-title">Mood Level</div>
          <div className="mood-legend-scale">
            <div className="mood-level" style={{ background: '#22c55e' }}>
              Calm
            </div>
            <div className="mood-level" style={{ background: '#eab308' }}>
              Moderate
            </div>
            <div className="mood-level" style={{ background: '#ef4444' }}>
              Tense
            </div>
          </div>
        </div>

        {/* Layer toggles */}
        {onToggleEvents && (
          <div className="layer-toggles">
            <button
              className={`layer-toggle ${showEvents ? 'active' : ''}`}
              onClick={() => onToggleEvents(!showEvents)}
              title={showEvents ? 'Hide events' : 'Show events'}
            >
              <span className="layer-icon">🎭</span>
              <span className="layer-label">{t.events}</span>
              {eventCount > 0 && (
                <span className="layer-count">{eventCount}</span>
              )}
            </button>
          </div>
        )}

        {/* All News button */}
        {onOpenNewsFeed && totalCount > 0 && (
          <button className="news-btn" onClick={onOpenNewsFeed}>
            <span>📰</span>
            <span>{t.allNews}</span>
            <span className="news-btn-count">{totalCount}</span>
          </button>
        )}
      </div>

      {/* Bottom center - Time window and stats */}
      <div className="map-control map-control-bottom-center">
        <div className="map-stats-panel">
          {/* Time window selector */}
          <div className="time-selector">
            {(['1h', '6h', '24h'] as const).map((w) => (
              <button
                key={w}
                className={`time-btn ${window === w ? 'active' : ''}`}
                onClick={() => onWindowChange(w)}
                disabled={loading}
              >
                {w}
              </button>
            ))}
          </div>

          {/* Tension indicator */}
          <div className="tension-indicator">
            <div
              className="tension-circle"
              style={{ background: getTensionColor(tensionIndex) }}
            >
              {tensionIndex}
            </div>
            <div className="tension-label">
              {selectedCountry ? (
                <span className="selected-country-label">
                  {selectedCountry}
                  {onClearSelection && (
                    <button
                      className="clear-selection-btn"
                      onClick={onClearSelection}
                      title="Clear selection"
                    >
                      ×
                    </button>
                  )}
                </span>
              ) : (
                getTensionCategory(tensionIndex).label
              )}
            </div>
          </div>

          {/* Stats */}
          <div className="map-stats">
            <span>{topicCount} {t.topics}</span>
            <span className="stat-divider">|</span>
            <span>{sourceCount} {t.sources}</span>
          </div>
        </div>
      </div>

      {/* Loading overlay */}
      {loading && (
        <div className="map-loading-overlay">
          <div className="map-spinner" />
        </div>
      )}
    </>
  );
}
