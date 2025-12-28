'use client';

import { TopicAggregate } from '@/lib/history';

interface TopicsPanelProps {
  topics: TopicAggregate[];
  maxTopics?: number;
}

export function TopicsPanel({ topics, maxTopics = 10 }: TopicsPanelProps) {
  const displayTopics = topics.slice(0, maxTopics);

  if (displayTopics.length === 0) {
    return (
      <div className="topics-panel">
        <p className="topics-empty">No topics available</p>
      </div>
    );
  }

  return (
    <div className="topics-panel">
      <div className="topics-list">
        {displayTopics.map((topic, index) => (
          <div key={topic.title} className="topic-item">
            <div className="topic-header">
              <span className="topic-rank">{index + 1}</span>
              <span className="topic-title">{topic.title}</span>
              <span className="topic-count">{topic.count}×</span>
            </div>
            {topic.keywords.length > 0 && (
              <div className="topic-keywords">
                {topic.keywords.slice(0, 4).map((keyword) => (
                  <span key={keyword} className="topic-keyword">
                    {keyword}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
