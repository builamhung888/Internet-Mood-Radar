'use client';

interface SummaryBoxProps {
  summary: string;
  topicCount: number;
  sourceCount: number;
}

export function SummaryBox({ summary, topicCount, sourceCount }: SummaryBoxProps) {
  return (
    <div className="summary-box">
      <p className="summary-text">{summary}</p>
      <p className="summary-sources">
        Based on {topicCount} topics from {sourceCount} sources
      </p>
    </div>
  );
}
