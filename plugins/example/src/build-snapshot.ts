import type { McapQueryEngine, SessionInfo } from "@robotscope/core";

import { resolveExampleTopics } from "./profile.js";
import type { ExampleSnapshot } from "./types.js";

function formatSeconds(ns: number): number {
  return Math.round((ns / 1e9) * 100) / 100;
}

export async function buildExampleSnapshot(
  _engine: McapQueryEngine,
  session: SessionInfo,
  time_ns: number,
): Promise<ExampleSnapshot> {
  const topics = resolveExampleTopics(session.topics.map((topic) => topic.name));
  const warnings: string[] = [];

  if (!topics.tf) {
    warnings.push("No /tf topic found — open a bag with TF or use the demo MCAP.");
  }

  const sample_topics = session.topics
    .slice(0, 8)
    .map((topic) => topic.name);

  return {
    session: {
      source: session.source,
      topic_count: session.topics.length,
      playhead_s: formatSeconds(time_ns),
      duration_s: formatSeconds(Math.max(session.end_ns - session.start_ns, 0)),
      has_tf: Boolean(topics.tf),
      has_odom: Boolean(topics.odom),
      sample_topics,
    },
    warnings,
  };
}
