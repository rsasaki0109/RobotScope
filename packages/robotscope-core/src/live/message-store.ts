import type { RawMessage } from "../query.js";

const DEFAULT_MAX_MESSAGES_PER_TOPIC = 512;

export class LiveMessageStore {
  private readonly byTopic = new Map<string, RawMessage[]>();

  add(message: RawMessage, maxPerTopic = DEFAULT_MAX_MESSAGES_PER_TOPIC): void {
    let entries = this.byTopic.get(message.topic);
    if (!entries) {
      entries = [];
      this.byTopic.set(message.topic, entries);
    }

    entries.push(message);

    if (entries.length > maxPerTopic) {
      entries.splice(0, entries.length - maxPerTopic);
    }
  }

  findNearest(topic: string, time_ns: number): RawMessage | null {
    const entries = this.byTopic.get(topic);
    if (!entries || entries.length === 0) {
      return null;
    }

    let lo = 0;
    let hi = entries.length - 1;

    if (time_ns <= entries[lo]!.log_time_ns) {
      return entries[lo]!;
    }
    if (time_ns >= entries[hi]!.log_time_ns) {
      return entries[hi]!;
    }

    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const value = entries[mid]!.log_time_ns;
      if (value === time_ns) {
        return entries[mid]!;
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
      return after ?? null;
    }
    if (!after) {
      return before;
    }
    return Math.abs(before.log_time_ns - time_ns) <= Math.abs(after.log_time_ns - time_ns)
      ? before
      : after;
  }

  findRange(topic: string, start_ns: number, end_ns: number): RawMessage[] {
    const entries = this.byTopic.get(topic);
    if (!entries || entries.length === 0) {
      return [];
    }
    return entries.filter(
      (entry) => entry.log_time_ns >= start_ns && entry.log_time_ns <= end_ns,
    );
  }

  messageCount(): number {
    let count = 0;
    for (const entries of this.byTopic.values()) {
      count += entries.length;
    }
    return count;
  }
}
