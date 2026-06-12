import { McapWriter, TempBuffer } from "@mcap/core";

import type { LiveRecordingResult } from "../query.js";
import { sidecarFromTopicIndex } from "../storage/sidecar.js";
import { TopicTimeIndex } from "../storage/topic-time-index.js";
import type { LiveChannelDefinition, LiveDataMessage } from "./protocol.js";
import { decodeBase64Payload } from "./protocol.js";

export class LiveMcapRecorder {
  private readonly buffer = new TempBuffer();
  private readonly writer: McapWriter;
  private active = false;
  private finished = false;
  private readonly schemaIds = new Map<number, number>();
  private readonly channelIds = new Map<number, number>();
  private readonly channelMeta = new Map<number, { topic: string; schema: string }>();
  private readonly sequences = new Map<number, number>();
  private readonly topicIndex = TopicTimeIndex.empty();
  private recordedMessages = 0;
  private start_ns = 0;
  private end_ns = 0;
  private hasBounds = false;

  constructor() {
    this.writer = new McapWriter({ writable: this.buffer });
  }

  isActive(): boolean {
    return this.active && !this.finished;
  }

  getRecordedMessageCount(): number {
    return this.recordedMessages;
  }

  async start(): Promise<void> {
    if (this.active || this.finished) {
      return;
    }
    await this.writer.start({
      profile: "ros2",
      library: "robotscope-live-recorder",
    });
    this.active = true;
  }

  async registerChannel(channel: LiveChannelDefinition): Promise<void> {
    if (!this.active || this.finished || this.channelIds.has(channel.id)) {
      return;
    }

    let schemaId = this.schemaIds.get(channel.id);
    if (schemaId == null) {
      schemaId = await this.writer.registerSchema({
        name: channel.schema,
        encoding: channel.encoding,
        data: new TextEncoder().encode(channel.definition),
      });
      this.schemaIds.set(channel.id, schemaId);
    }

    const channelId = await this.writer.registerChannel({
      topic: channel.topic,
      messageEncoding: "cdr",
      schemaId,
      metadata: new Map(),
    });
    this.channelIds.set(channel.id, channelId);
    this.channelMeta.set(channel.id, { topic: channel.topic, schema: channel.schema });
    this.topicIndex.registerChannel(channel.topic, channelId, channel.schema);
  }

  async writeMessage(message: LiveDataMessage): Promise<void> {
    if (!this.active || this.finished) {
      return;
    }

    const channelId = this.channelIds.get(message.channel_id);
    const meta = this.channelMeta.get(message.channel_id);
    if (channelId == null || !meta) {
      return;
    }

    const sequence = message.sequence ?? this.sequences.get(message.channel_id) ?? 0;
    this.sequences.set(message.channel_id, sequence + 1);

    if (!this.hasBounds) {
      this.start_ns = message.log_time_ns;
      this.end_ns = message.log_time_ns;
      this.hasBounds = true;
    } else {
      this.start_ns = Math.min(this.start_ns, message.log_time_ns);
      this.end_ns = Math.max(this.end_ns, message.log_time_ns);
    }

    this.topicIndex.add(meta.topic, channelId, meta.schema, {
      log_time_ns: message.log_time_ns,
      sequence: message.sequence,
    });

    await this.writer.addMessage({
      channelId,
      sequence,
      logTime: BigInt(message.log_time_ns),
      publishTime: BigInt(message.publish_time_ns ?? message.log_time_ns),
      data: decodeBase64Payload(message.data_b64),
    });
    this.recordedMessages += 1;
  }

  async finish(filenamePrefix = "robotscope-live"): Promise<LiveRecordingResult> {
    if (this.finished) {
      throw new Error("Live recording already finalized");
    }

    if (this.active) {
      await this.writer.end();
    }

    this.active = false;
    this.finished = true;
    this.topicIndex.finalize();

    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const bounds = this.hasBounds ? { start_ns: this.start_ns, end_ns: this.end_ns } : { start_ns: 0, end_ns: 0 };
    const sidecar = sidecarFromTopicIndex(
      this.topicIndex.exportTopics(),
      bounds,
      { messages: 0, transforms: 0 },
    );

    return {
      data: this.buffer.get(),
      message_count: this.recordedMessages,
      filename: `${filenamePrefix}-${stamp}.mcap`,
      sidecar,
    };
  }
}

export function defaultLiveRecordingFilename(prefix = "robotscope-live"): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${prefix}-${stamp}.mcap`;
}