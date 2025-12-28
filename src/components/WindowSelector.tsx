'use client';

interface WindowSelectorProps {
  current: '1h' | '6h' | '24h';
  onChange: (window: '1h' | '6h' | '24h') => void;
}

export function WindowSelector({ current, onChange }: WindowSelectorProps) {
  const windows: Array<{ value: '1h' | '6h' | '24h'; label: string }> = [
    { value: '1h', label: '1 Hour' },
    { value: '6h', label: '6 Hours' },
    { value: '24h', label: '24 Hours' },
  ];

  return (
    <div className="window-selector">
      {windows.map((w) => (
        <button
          key={w.value}
          className={`window-btn ${current === w.value ? 'active' : ''}`}
          onClick={() => onChange(w.value)}
        >
          {w.label}
        </button>
      ))}
    </div>
  );
}
