import type { Database } from "sql.js";

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
} from "../storage/sidecar.js";
import { TopicTimeIndex } from "../storage/topic-time-index.js";
import { TfBuffer, type TfTreeSnapshot } from "../tf/tf-buffer.js";

export class Rosbag2QueryEngineImpl implements McapQueryEngine {
  private readonly topicSchemas = new Map<string, SchemaInfo>();
  private rawMessageCache = new Map<string, RawMessage>();

  private constructor(
    private readonly databases: Database[],
    private readonly session: SessionInfo,
    private readonly tfBuffer: TfBuffer,
    private readonly topicIndex: TopicTimeIndex,
    private readonly mappedTopics: MappedTopic[],
    private readonly indexStatus: IndexStatus,
    private readonly sidecarManifest: SidecarManifest,
    private readonly messagePayloads: Map<number, Uint8Array>,
  ) {}

  static create(
    databases: Database[],
    session: SessionInfo,
    tfBuffer: TfBuffer,
    topicIndex: TopicTimeIndex,
    indexStatus: IndexStatus,
    messagePayloads: Map<number, Uint8Array>,
    fingerprint?: FileFingerprint,
  ): Rosbag2QueryEngineImpl {
    const mappedTopics = mapTopics(
      session.topics.map((topic) => ({ name: topic.name, schema: topic.schema })),
    );

    const sidecarManifest = sidecarFromTopicIndex(
      topicIndex.exportTopics(),
      { start_ns: session.start_ns, end_ns: session.end_ns },
      {
        messages: indexStatus.tf_message_count,
        transforms: indexStatus.tf_transform_count,
      },
      fingerprint,
      "rosbag2",
    );

    const enrichedSession: SessionInfo = {
      ...session,
      tf_indexed: indexStatus.tf_indexed,
      tf_transform_count: indexStatus.tf_transform_count,
      mapped_entity_count: mappedTopics.length,
      sidecar_message_count: indexStatus.topic_index_messages,
    };

    const engine = new Rosbag2QueryEngineImpl(
      databases,
      enrichedSession,
      tfBuffer,
      topicIndex,
      mappedTopics,
      indexStatus,
      sidecarManifest,
      messagePayloads,
    );

    for (const topic of enrichedSession.topics) {
      engine.topicSchemas.set(topic.name, {
        name: topic.schema,
        encoding: "cdr",
        data: new Uint8Array(),
      });
    }

    return engine;
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
    if (!nearest || nearest.storage_id == null) {
      return null;
    }

    const payload = this.messagePayloads.get(nearest.storage_id);
    const schema = this.topicSchemas.get(topic);
    if (!payload || !schema) {
      return null;
    }

    const decoded = decodeRos2Message(schema, payload);
    const best: RawMessage = {
      topic,
      schema: schema.name,
      log_time_ns: nearest.log_time_ns,
      data_size: payload.byteLength,
      decoded: decoded.value,
      decode_error: decoded.error,
    };

    this.rawMessageCache.set(cacheKey, best);
    if (this.rawMessageCache.size > 128) {
      const firstKey = this.rawMessageCache.keys().next().value;
      if (firstKey) {
        this.rawMessageCache.delete(firstKey);
      }
    }

    return best;
  }

  close(): void {
    for (const db of this.databases) {
      db.close();
    }
  }
}
