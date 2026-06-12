import type { SidecarTopicTimes } from "./sidecar.js";

export interface MessageTimeEntry {
  log_time_ns: number;
  sequence?: number;
}

export interface TopicTimeIndexExport {
  topic: string;
  schema: string;
  channel_id: number;
  entries: MessageTimeEntry[];
}

export class TopicTimeIndex {
  private readonly byTopic = new Map<string, MessageTimeEntry[]>();
  private readonly channelByTopic = new Map<string, { channel_id: number; schema: string }>();

  static empty(): TopicTimeIndex {
    return new TopicTimeIndex();
  }

  static fromSidecarTopics(topics: SidecarTopicTimes[]): TopicTimeIndex {
    const index = new TopicTimeIndex();
    for (const topic of topics) {
      index.channelByTopic.set(topic.topic, {
        channel_id: topic.channel_id,
        schema: topic.schema,
      });
      index.byTopic.set(
        topic.topic,
        topic.times.map(([log_time_ns, sequence]) => ({
          log_time_ns,
          sequence,
        })),
      );
    }
    return index;
  }

  registerChannel(topic: string, channel_id: number, schema: string): void {
    this.channelByTopic.set(topic, { channel_id, schema });
    if (!this.byTopic.has(topic)) {
      this.byTopic.set(topic, []);
    }
  }

  add(topic: string, channel_id: number, schema: string, entry: MessageTimeEntry): void {
    this.registerChannel(topic, channel_id, schema);
    this.byTopic.get(topic)!.push(entry);
  }

  finalize(): void {
    for (const [topic, entries] of this.byTopic.entries()) {
      entries.sort((a, b) => a.log_time_ns - b.log_time_ns);
      this.byTopic.set(topic, entries);
    }
  }

  topicCount(): number {
    return this.byTopic.size;
  }

  findNearest(topic: string, time_ns: number): MessageTimeEntry | undefined {
    const entries = this.byTopic.get(topic);
    if (!entries || entries.length === 0) {
      return undefined;
    }

    let lo = 0;
    let hi = entries.length - 1;

    if (time_ns <= entries[lo]!.log_time_ns) {
      return entries[lo];
    }
    if (time_ns >= entries[hi]!.log_time_ns) {
      return entries[hi];
    }

    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const value = entries[mid]!.log_time_ns;
      if (value === time_ns) {
        return entries[mid];
      }
      if (value < time_ns) {
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }

    const before = entries[hi];
    const after = entries[lo];
    if (!before) {
      return after;
    }
    if (!after) {
      return before;
    }
    return Math.abs(before.log_time_ns - time_ns) <= Math.abs(after.log_time_ns - time_ns)
      ? before
      : after;
  }

  exportTopics(): TopicTimeIndexExport[] {
    return [...this.byTopic.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([topic, entries]) => {
        const meta = this.channelByTopic.get(topic)!;
        return {
          topic,
          schema: meta.schema,
          channel_id: meta.channel_id,
          entries,
        };
      });
  }

  get messageCount(): number {
    let count = 0;
    for (const entries of this.byTopic.values()) {
      count += entries.length;
    }
    return count;
  }
}
