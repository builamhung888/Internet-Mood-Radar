'use client';

import { useMemo } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { TensionTrend } from '@/lib/history';
import { getTensionColor } from '@/lib/utils';

interface TensionChartProps {
  data: TensionTrend[];
  height?: number;
  hours?: number; // Time range in hours to determine X-axis format
}

interface ChartDataPoint {
  timestamp: string;
  fullDate: string;
  tensionIndex: number;
  color: string;
}

/**
 * Format timestamp for X-axis based on time range
 * - 6h/24h: Show time only (e.g., "2:30 PM")
 * - 7d: Show day + time (e.g., "Mon 2PM")
 * - 30d: Show date (e.g., "Dec 15")
 */
function formatTimestamp(date: Date, hours: number): string {
  if (hours <= 24) {
    // Short range: time only
    return new Intl.DateTimeFormat('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(date);
  } else if (hours <= 168) {
    // 7 days: day + hour
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'short',
      hour: 'numeric',
      hour12: true,
    }).format(date);
  } else {
    // 30 days: month + day
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
    }).format(date);
  }
}

function formatFullDate(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: ChartDataPoint }>;
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload || !payload.length) return null;

  const data = payload[0].payload;
  return (
    <div className="tension-tooltip">
      <div className="tooltip-date">{data.fullDate}</div>
      <div className="tooltip-value" style={{ color: data.color }}>
        Tension: {data.tensionIndex.toFixed(1)}
      </div>
    </div>
  );
}

export function TensionChart({ data, height = 200, hours = 24 }: TensionChartProps) {
  const chartData = useMemo<ChartDataPoint[]>(() => {
    return data.map((point) => {
      const date = new Date(point.timestamp);
      return {
        timestamp: formatTimestamp(date, hours),
        fullDate: formatFullDate(date),
        tensionIndex: point.tensionIndex,
        color: getTensionColor(point.tensionIndex),
      };
    });
  }, [data, hours]);

  // Calculate average for gradient color
  const avgTension = useMemo(() => {
    if (data.length === 0) return 50;
    return data.reduce((sum, p) => sum + p.tensionIndex, 0) / data.length;
  }, [data]);

  const gradientColor = getTensionColor(avgTension);

  if (data.length === 0) {
    return (
      <div className="tension-chart-empty">
        <p>No tension data available for this time range</p>
      </div>
    );
  }

  return (
    <div className="tension-chart">
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart
          data={chartData}
          margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
        >
          <defs>
            <linearGradient id="tensionGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={gradientColor} stopOpacity={0.4} />
              <stop offset="95%" stopColor={gradientColor} stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
          <XAxis
            dataKey="timestamp"
            tick={{ fill: 'rgba(255,255,255,0.6)', fontSize: 11 }}
            tickLine={{ stroke: 'rgba(255,255,255,0.2)' }}
            axisLine={{ stroke: 'rgba(255,255,255,0.2)' }}
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fill: 'rgba(255,255,255,0.6)', fontSize: 11 }}
            tickLine={{ stroke: 'rgba(255,255,255,0.2)' }}
            axisLine={{ stroke: 'rgba(255,255,255,0.2)' }}
            width={35}
          />
          <Tooltip content={<CustomTooltip />} />
          <Area
            type="monotone"
            dataKey="tensionIndex"
            stroke={gradientColor}
            strokeWidth={2}
            fill="url(#tensionGradient)"
            dot={false}
            activeDot={{ r: 5, fill: gradientColor, stroke: '#fff', strokeWidth: 2 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
