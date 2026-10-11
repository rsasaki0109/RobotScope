import { decodeMessage } from "../data/message-decoder.js";
import { isTransformChannel, storedTransforms } from "../data/transforms.js";
import { mapTopics, type MappedTopic } from "../mapping/entity-mapper.js";
import type { RawMessage, SessionInfo, TimeRange, TopicInfo } from "../query.js";
import type { SchemaInfo } from "../ros2/decoder.js";
import {
  sidecarFromTopicIndex,
  type SidecarManifest,
} from "../storage/sidecar.js";
import { TopicTimeIndex } from "../storage/topic-time-index.js";
import { TfBuffer } from "../tf/tf-buffer.js";

import type { LiveChannelDefinition, LiveDataMessage } from "./protocol.js";
import { decodeBase64Payload } from "./protocol.js";
import { LiveMessageStore, DEFAULT_MAX_MESSAGES_PER_TOPIC } from "./message-store.js";

export interface LiveIngestStats {
  message_count: number;
  topic_count: number;
  tf_message_count: number;
  tf_transform_count: number;
}

export class LiveIngestBuffer {
  readonly tfBuffer = new TfBuffer(4000);
  topicIndex = TopicTimeIndex.empty();
  readonly messageStore = new LiveMessageStore();

  private readonly schemas = new Map<number, SchemaInfo>();
  private readonly channels = new Map<number, { topic: string; schemaId: number }>();
  private readonly channelDefinitions = new Map<number, LiveChannelDefinition>();
  private readonly topicStats = new Map<string, TopicInfo>();
  private readonly tfTopics = new Set<string>();

  private start_ns = 0;
  private end_ns = 0;
  private hasBounds = false;
  private message_count = 0;
  private revision = 0;
  private tf_message_count = 0;
  private tf_transform_count = 0;
  private mappedTopics: MappedTopic[] = [];

  private listeners = new Set<(stats: LiveIngestStats) => void>();

  onUpdate(listener: (stats: LiveIngestStats) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  resetSession(start_ns: number, topics: Array<{ name: string; schema: string }>): void {
    this.revision += 1;
    this.tfBuffer.clear();
    this.messageStore.clear();
    this.topicIndex = TopicTimeIndex.empty();
    this.schemas.clear();
    this.channels.clear();
    this.channelDefinitions.clear();
    this.topicStats.clear();
    this.tfTopics.clear();
    this.mappedTopics = [];
    this.start_ns = start_ns;
    this.end_ns = start_ns;
    this.hasBounds = false;
    this.message_count = 0;
    this.tf_message_count = 0;
    this.tf_transform_count = 0;

    for (const topic of topics) {
      this.topicStats.set(topic.name, {
        name: topic.name,
        schema: topic.schema,
        message_count: 0,
      });
    }
  }

  registerChannel(channel: LiveChannelDefinition): void {
    this.revision += 1;
    this.channelDefinitions.set(channel.id, channel);
    const schema: SchemaInfo = {
      name: channel.schema,
      encoding: channel.encoding,
      data: new TextEncoder().encode(channel.definition),
    };
    this.schemas.set(channel.id, schema);
    this.channels.set(channel.id, { topic: channel.topic, schemaId: channel.id });

    if (isTransformChannel(channel.topic, channel.schema)) {
      this.tfTopics.add(channel.topic);
    }

    const existing = this.topicStats.get(channel.topic);
    this.topicStats.set(channel.topic, {
      name: channel.topic,
      schema: channel.schema,
      message_encoding: channel.message_encoding ?? "cdr",
      metadata: channel.metadata,
      message_count: existing?.message_count ?? 0,
    });

    this.topicIndex.registerChannel(channel.topic, channel.id, channel.schema);
    this.remapTopics();
    this.notify();
  }

  ingest(message: LiveDataMessage): RawMessage | null {
    const channel = this.channels.get(message.channel_id);
    const schema = this.schemas.get(message.channel_id);
    if (!channel || !schema) {
      return null;
    }

    const payload = decodeBase64Payload(message.data_b64);
    const messageEncoding = this.channelDefinitions.get(message.channel_id)?.message_encoding ?? "cdr";
    const decoded = decodeMessage(schema, payload, messageEncoding);
    const raw: RawMessage = {
      topic: channel.topic,
      schema: schema.name,
      message_encoding: messageEncoding,
      log_time_ns: message.log_time_ns,
      publish_time_ns: message.publish_time_ns,
      sequence: message.sequence,
      data_size: payload.byteLength,
      decoded: decoded.value,
      decode_error: decoded.error,
    };

    if (!this.hasBounds) {
      this.start_ns = message.log_time_ns;
      this.end_ns = message.log_time_ns;
      this.hasBounds = true;
    } else {
      this.start_ns = Math.min(this.start_ns, message.log_time_ns);
      this.end_ns = Math.max(this.end_ns, message.log_time_ns);
    }

    this.topicIndex.addBounded(channel.topic, message.channel_id, schema.name, {
      log_time_ns: message.log_time_ns,
      sequence: message.sequence,
    }, DEFAULT_MAX_MESSAGES_PER_TOPIC);
    this.messageStore.add(raw);
    this.message_count += 1;
    this.revision += 1;

    const topicInfo = this.topicStats.get(channel.topic);
    if (topicInfo) {
      topicInfo.message_count = (topicInfo.message_count ?? 0) + 1;
    }

    if (isTransformChannel(channel.topic, schema.name) && decoded.value) {
      this.tf_message_count += 1;
      for (const transform of storedTransforms(schema.name, decoded.value, message.log_time_ns, channel.topic)) {
        this.tfBuffer.addTransform(transform);
        this.tf_transform_count += 1;
      }
    }

    this.notify();
    return raw;
  }

  getSessionInfo(): SessionInfo {
    const topics = [...this.topicStats.values()].sort((a, b) => a.name.localeCompare(b.name));
    return {
      source: "live",
      start_ns: this.start_ns,
      end_ns: this.end_ns,
      topics,
      tf_indexed: this.tfTopics.size > 0,
      tf_transform_count: this.tf_transform_count,
      mapped_entity_count: this.mappedTopics.length,
      sidecar_message_count: this.topicIndex.messageCount,
    };
  }

  getTimelineBounds(): TimeRange {
    return { start_ns: this.start_ns, end_ns: this.end_ns };
  }

  getMappedTopics(): MappedTopic[] {
    return this.mappedTopics;
  }

  getSidecarManifest(): SidecarManifest {
    return sidecarFromTopicIndex(
      this.topicIndex.exportTopics(),
      this.getTimelineBounds(),
      { messages: this.tf_message_count, transforms: this.tf_transform_count },
    );
  }

  getStats(): LiveIngestStats {
    return {
      message_count: this.message_count,
      topic_count: this.topicStats.size,
      tf_message_count: this.tf_message_count,
      tf_transform_count: this.tf_transform_count,
    };
  }

  getRevision(): number {
    return this.revision;
  }

  getTfTopics(): string[] {
    return [...this.tfTopics];
  }

  getChannelDefinitions(): LiveChannelDefinition[] {
    return [...this.channelDefinitions.values()];
  }

  private remapTopics(): void {
    this.mappedTopics = mapTopics(
      [...this.topicStats.values()],
    );
  }

  private notify(): void {
    const stats = this.getStats();
    for (const listener of this.listeners) {
      listener(stats);
    }
  }
}
