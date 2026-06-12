import { mapTopics, type MappedTopic } from "../mapping/entity-mapper.js";
import type { RawMessage, SessionInfo, TimeRange, TopicInfo } from "../query.js";
import {
  decodeRos2Message,
  isTfMessageSchema,
  isTfTopic,
  type SchemaInfo,
} from "../ros2/decoder.js";
import {
  sidecarFromTopicIndex,
  type SidecarManifest,
} from "../storage/sidecar.js";
import { TopicTimeIndex } from "../storage/topic-time-index.js";
import { TfBuffer } from "../tf/tf-buffer.js";

import type { LiveChannelDefinition, LiveDataMessage } from "./protocol.js";
import { decodeBase64Payload } from "./protocol.js";
import { LiveMessageStore } from "./message-store.js";

interface DecodedTransform {
  header: { stamp: { sec: number; nanosec?: number; nsec?: number }; frame_id: string };
  child_frame_id: string;
  transform: {
    translation: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number; w: number };
  };
}

export interface LiveIngestStats {
  message_count: number;
  topic_count: number;
  tf_message_count: number;
  tf_transform_count: number;
}

export class LiveIngestBuffer {
  readonly tfBuffer = new TfBuffer();
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
  private tf_message_count = 0;
  private tf_transform_count = 0;
  private mappedTopics: MappedTopic[] = [];

  private listeners = new Set<(stats: LiveIngestStats) => void>();

  onUpdate(listener: (stats: LiveIngestStats) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  resetSession(start_ns: number, topics: Array<{ name: string; schema: string }>): void {
    this.tfBuffer.clear();
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
    this.channelDefinitions.set(channel.id, channel);
    const schema: SchemaInfo = {
      name: channel.schema,
      encoding: channel.encoding,
      data: new TextEncoder().encode(channel.definition),
    };
    this.schemas.set(channel.id, schema);
    this.channels.set(channel.id, { topic: channel.topic, schemaId: channel.id });

    if (isTfTopic(channel.topic)) {
      this.tfTopics.add(channel.topic);
    }

    const existing = this.topicStats.get(channel.topic);
    this.topicStats.set(channel.topic, {
      name: channel.topic,
      schema: channel.schema,
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
    const decoded = decodeRos2Message(schema, payload);
    const raw: RawMessage = {
      topic: channel.topic,
      schema: schema.name,
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

    this.topicIndex.add(channel.topic, message.channel_id, schema.name, {
      log_time_ns: message.log_time_ns,
      sequence: message.sequence,
    });
    this.messageStore.add(raw);

    const topicInfo = this.topicStats.get(channel.topic);
    if (topicInfo) {
      topicInfo.message_count = (topicInfo.message_count ?? 0) + 1;
    }

    if (isTfTopic(channel.topic) && isTfMessageSchema(schema.name) && decoded.value) {
      this.ingestTf(channel.topic, decoded.value as { transforms?: DecodedTransform[] }, message.log_time_ns);
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
      message_count: this.messageStore.messageCount(),
      topic_count: this.topicStats.size,
      tf_message_count: this.tf_message_count,
      tf_transform_count: this.tf_transform_count,
    };
  }

  getTfTopics(): string[] {
    return [...this.tfTopics];
  }

  getChannelDefinitions(): LiveChannelDefinition[] {
    return [...this.channelDefinitions.values()];
  }

  private ingestTf(
    topic: string,
    tfMessage: { transforms?: DecodedTransform[] },
    log_time_ns: number,
  ): void {
    this.tf_message_count += 1;
    const isStatic = topic.includes("static");

    for (const transform of tfMessage.transforms ?? []) {
      this.tfBuffer.addTransform({
        parent_frame_id: transform.header.frame_id,
        child_frame_id: transform.child_frame_id,
        translation: [
          transform.transform.translation.x,
          transform.transform.translation.y,
          transform.transform.translation.z,
        ],
        rotation: [
          transform.transform.rotation.x,
          transform.transform.rotation.y,
          transform.transform.rotation.z,
          transform.transform.rotation.w,
        ],
        time_ns: isStatic ? 0 : log_time_ns,
        is_static: isStatic,
      });
      this.tf_transform_count += 1;
    }
  }

  private remapTopics(): void {
    this.mappedTopics = mapTopics(
      [...this.topicStats.values()].map((topic) => ({
        name: topic.name,
        schema: topic.schema,
      })),
    );
  }

  private notify(): void {
    const stats = this.getStats();
    for (const listener of this.listeners) {
      listener(stats);
    }
  }
}
