'use client';

interface BreakdownItem {
  label: string;
  count: number;
  percentage: number;
}

interface BreakdownPanelProps {
  title: string;
  items: BreakdownItem[];
  maxItems?: number;
  colorScheme?: 'blue' | 'green' | 'purple' | 'orange';
}

const COLOR_SCHEMES = {
  blue: ['#3b82f6', '#60a5fa', '#93c5fd', '#bfdbfe', '#dbeafe'],
  green: ['#22c55e', '#4ade80', '#86efac', '#bbf7d0', '#dcfce7'],
  purple: ['#8b5cf6', '#a78bfa', '#c4b5fd', '#ddd6fe', '#ede9fe'],
  orange: ['#f97316', '#fb923c', '#fdba74', '#fed7aa', '#ffedd5'],
};

export function BreakdownPanel({
  title,
  items,
  maxItems = 5,
  colorScheme = 'blue',
}: BreakdownPanelProps) {
  const displayItems = items.slice(0, maxItems);
  const colors = COLOR_SCHEMES[colorScheme];

  if (displayItems.length === 0) {
    return (
      <div className="breakdown-panel">
        <h3 className="breakdown-title">{title}</h3>
        <p className="breakdown-empty">No data available</p>
      </div>
    );
  }

  return (
    <div className="breakdown-panel">
      <h3 className="breakdown-title">{title}</h3>
      <div className="breakdown-list">
        {displayItems.map((item, index) => (
          <div key={item.label} className="breakdown-item">
            <div className="breakdown-item-header">
              <span
                className="breakdown-dot"
                style={{ backgroundColor: colors[index % colors.length] }}
              />
              <span className="breakdown-label">{item.label}</span>
              <span className="breakdown-count">{item.count}</span>
            </div>
            <div className="breakdown-bar-track">
              <div
                className="breakdown-bar-fill"
                style={{
                  width: `${item.percentage}%`,
                  backgroundColor: colors[index % colors.length],
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
