import { indexMcapMessages } from "../ingest/mcap-indexer.js";
import { indexTfFromMcap } from "../tf/mcap-tf-indexer.js";
import type { McapIndexedReader } from "@mcap/core";

import {
  mapTopics,
  mappedTopicToEntity,
  type MappedTopic,
} from "../mapping/entity-mapper.js";
import type { Entity } from "../rdm.js";
import type {
  EntityQuery,
  EntityQueryResult,
  IndexStatus,
  McapQueryEngine,
  RawMessage,
  SessionInfo,
  TimeRange,
} from "../query.js";
import { decodeRos2Message, type SchemaInfo } from "../ros2/decoder.js";
import {
  buildSceneSnapshot,
  type SceneBuildOptions,
  type SceneSnapshot,
} from "../scene/scene-builder.js";
import {
  sidecarFromTopicIndex,
  type FileFingerprint,
  type SidecarManifest,
  validateSidecarFingerprint,
} from "../storage/sidecar.js";
import { TopicTimeIndex } from "../storage/topic-time-index.js";
import { TfBuffer, type TfTreeSnapshot } from "../tf/tf-buffer.js";

export interface McapEngineCreateOptions {
  sidecar?: SidecarManifest;
  fingerprint?: FileFingerprint;
  onIndexProgress?: (message: string, percent: number) => void;
}

export class McapQueryEngineImpl implements McapQueryEngine {
  private readonly tfBuffer: TfBuffer;
  private readonly topicIndex: TopicTimeIndex;
  private readonly mappedTopics: MappedTopic[];
  private readonly indexStatus: IndexStatus;
  private readonly sidecarManifest: SidecarManifest;
  private rawMessageCache = new Map<string, RawMessage>();

  private constructor(
    private readonly reader: McapIndexedReader,
    private readonly session: SessionInfo,
    tfBuffer: TfBuffer,
    topicIndex: TopicTimeIndex,
    mappedTopics: MappedTopic[],
    indexStatus: IndexStatus,
    sidecarManifest: SidecarManifest,
  ) {
    this.tfBuffer = tfBuffer;
    this.topicIndex = topicIndex;
    this.mappedTopics = mappedTopics;
    this.indexStatus = indexStatus;
    this.sidecarManifest = sidecarManifest;
  }

  static async create(
    reader: McapIndexedReader,
    session: SessionInfo,
    options: McapEngineCreateOptions = {},
  ): Promise<McapQueryEngineImpl> {
    const mappedTopics = mapTopics(
      session.topics.map((topic) => ({ name: topic.name, schema: topic.schema })),
    );

    const useCachedSidecar =
      options.sidecar &&
      options.fingerprint &&
      validateSidecarFingerprint(options.sidecar, options.fingerprint);

    let tfBuffer: TfBuffer;
    let topicIndex: TopicTimeIndex;
    let tf_message_count = 0;
    let tf_transform_count = 0;
    let tf_topics: string[] = [];

    if (useCachedSidecar && options.sidecar) {
      options.onIndexProgress?.("Loading sidecar index…", 40);
      topicIndex = TopicTimeIndex.fromSidecarTopics(
        options.sidecar.topics,
        options.sidecar.recording_source ?? "mcap",
      );
      const tfResult = await indexTfFromMcap(reader, (progress) => {
        options.onIndexProgress?.(
          `TF ${progress.messages_read} msgs (${progress.transforms_added} transforms)`,
          Math.min(85, 40 + Math.floor(progress.messages_read / 50)),
        );
      });
      tfBuffer = tfResult.buffer;
      tf_message_count = tfResult.messages_read;
      tf_transform_count = tfResult.transforms_added;
      tf_topics = tfResult.tf_topics;
    } else {
      const indexResult = await indexMcapMessages(reader, (progress) => {
        options.onIndexProgress?.(
          `Indexing ${progress.messages_read} msgs · ${progress.topics_indexed} topics · ${progress.transforms_added} TF`,
          Math.min(85, 35 + Math.floor(progress.messages_read / 50)),
        );
      });
      tfBuffer = indexResult.tfBuffer;
      topicIndex = indexResult.topicIndex;
      tf_message_count = indexResult.tf_message_count;
      tf_transform_count = indexResult.tf_transform_count;
      tf_topics = indexResult.tf_topics;
    }

    const indexStatus: IndexStatus = {
      tf_indexed: tf_topics.length > 0,
      tf_message_count,
      tf_transform_count,
      tf_topics,
      sidecar_loaded: Boolean(useCachedSidecar),
      topic_index_messages: topicIndex.messageCount,
    };

    const sidecarManifest = sidecarFromTopicIndex(
      topicIndex.exportTopics(),
      { start_ns: session.start_ns, end_ns: session.end_ns },
      { messages: tf_message_count, transforms: tf_transform_count },
      options.fingerprint,
      "mcap",
    );

    const enrichedSession: SessionInfo = {
      ...session,
      tf_indexed: indexStatus.tf_indexed,
      tf_transform_count: indexStatus.tf_transform_count,
      mapped_entity_count: mappedTopics.length,
      sidecar_message_count: indexStatus.topic_index_messages,
    };

    return new McapQueryEngineImpl(
      reader,
      enrichedSession,
      tfBuffer,
      topicIndex,
      mappedTopics,
      indexStatus,
      sidecarManifest,
    );
  }

  getSidecarManifest(): SidecarManifest {
    return this.sidecarManifest;
  }

  async getSessionInfo(): Promise<SessionInfo> {
    return this.session;
  }

  async getTimelineBounds(): Promise<TimeRange> {
    return {
      start_ns: this.session.start_ns,
      end_ns: this.session.end_ns,
    };
  }

  async queryEntities(query: EntityQuery): Promise<EntityQueryResult> {
    const entities: Entity[] = this.mappedTopics.map(mappedTopicToEntity);

    if (query.filter?.paths?.length) {
      const allowed = new Set(query.filter.paths);
      return {
        entities: entities.filter((entity) => allowed.has(entity.path)),
        cursor_time_ns: query.time_ns,
      };
    }

    if (query.filter?.kinds?.length) {
      const allowed = new Set(query.filter.kinds);
      return {
        entities: entities.filter((entity) => allowed.has(entity.kind)),
        cursor_time_ns: query.time_ns,
      };
    }

    return {
      entities,
      cursor_time_ns: query.time_ns,
    };
  }

  async resolveTime(_clock: keyof import("../rdm.js").Timeline, time_ns: number): Promise<number> {
    return time_ns;
  }

  getIndexStatus(): IndexStatus {
    return this.indexStatus;
  }

  getMappedTopics(): MappedTopic[] {
    return this.mappedTopics;
  }

  async getTfTree(time_ns: number, fixed_frame = "map"): Promise<TfTreeSnapshot> {
    return this.tfBuffer.getSnapshot(time_ns, fixed_frame);
  }

  async getSceneSnapshot(
    time_ns: number,
    options: SceneBuildOptions = {},
  ): Promise<SceneSnapshot> {
    return buildSceneSnapshot(
      this.tfBuffer,
      this.mappedTopics,
      time_ns,
      (topic, atTime) => this.getRawMessageNearTime(topic, atTime),
      options,
    );
  }

  async getRawMessageNearTime(topic: string, time_ns: number): Promise<RawMessage | null> {
    const cacheKey = `${topic}@${Math.floor(time_ns / 1_000_000)}`;
    const cached = this.rawMessageCache.get(cacheKey);
    if (cached && cached.topic === topic) {
      return cached;
    }

    const nearest = this.topicIndex.findNearest(topic, time_ns);
    if (!nearest) {
      return null;
    }

    const channel = [...this.reader.channelsById.values()].find((c) => c.topic === topic);
    if (!channel) {
      return null;
    }

    const schemaRecord = this.reader.schemasById.get(channel.schemaId);
    if (!schemaRecord) {
      return null;
    }

    const schema: SchemaInfo = {
      name: schemaRecord.name,
      encoding: schemaRecord.encoding,
      data: schemaRecord.data,
    };

    const target = BigInt(nearest.log_time_ns);
    let best: RawMessage | null = null;

    for await (const message of this.reader.readMessages({
      topics: [topic],
      startTime: target,
      endTime: target + 1n,
    })) {
      const decoded = decodeRos2Message(schema, message.data);
      best = {
        topic,
        schema: schema.name,
        log_time_ns: Number(message.logTime),
        publish_time_ns: message.publishTime ? Number(message.publishTime) : undefined,
        sequence: message.sequence,
        data_size: message.data.byteLength,
        decoded: decoded.value,
        decode_error: decoded.error,
      };
      break;
    }

    if (best) {
      this.rawMessageCache.set(cacheKey, best);
      if (this.rawMessageCache.size > 128) {
        const firstKey = this.rawMessageCache.keys().next().value;
        if (firstKey) {
          this.rawMessageCache.delete(firstKey);
        }
      }
    }

    return best;
  }

  getReader(): McapIndexedReader {
    return this.reader;
  }
}
