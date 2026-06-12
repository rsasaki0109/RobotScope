export interface ExampleSessionView {
  source: string;
  topic_count: number;
  playhead_s: number;
  duration_s: number;
  has_tf: boolean;
  has_odom: boolean;
  sample_topics: string[];
}

export interface ExampleSnapshot {
  session: ExampleSessionView;
  warnings: string[];
}
