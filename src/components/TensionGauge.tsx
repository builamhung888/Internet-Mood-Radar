'use client';

interface TensionGaugeProps {
  value: number; // 0-100
  delta: number;
}

export function TensionGauge({ value, delta }: TensionGaugeProps) {
  // Convert 0-100 to -90 to 90 degrees
  const rotation = -90 + (value / 100) * 180;

  const getDeltaClass = () => {
    if (delta > 0) return 'delta-positive';
    if (delta < 0) return 'delta-negative';
    return 'delta-neutral';
  };

  const getDeltaText = () => {
    if (delta === 0) return '—';
    return delta > 0 ? `+${delta.toFixed(0)}` : delta.toFixed(0);
  };

  const getTensionLabel = () => {
    if (value < 25) return 'Calm';
    if (value < 50) return 'Moderate';
    if (value < 75) return 'Elevated';
    return 'High';
  };

  return (
    <div className="card" style={{ textAlign: 'center' }}>
      <div className="card-header">
        <span className="card-title">Tension Index</span>
        <span className={getDeltaClass()}>{getDeltaText()} vs yesterday</span>
      </div>

      <div className="tension-gauge">
        <div className="tension-gauge-bg" />
        <div className="tension-gauge-cover" />
        <div
          className="tension-needle"
          style={{ transform: `translateX(-50%) rotate(${rotation}deg)` }}
        />
        <div className="tension-value">{value}</div>
      </div>

      <p style={{ marginTop: '1rem', color: 'var(--muted)' }}>
        {getTensionLabel()}
      </p>
    </div>
  );
}
