import {
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
import {
  buildSceneSnapshot,
  type SceneBuildOptions,
  type SceneSnapshot,
} from "../scene/scene-builder.js";
import type { SidecarManifest } from "../storage/sidecar.js";
import type { TfTreeSnapshot } from "../tf/tf-buffer.js";

import type { LiveIngestBuffer } from "./ingest-buffer.js";

export class LiveQueryEngineImpl implements McapQueryEngine {
  private rawMessageCache = new Map<string, RawMessage>();

  constructor(private readonly buffer: LiveIngestBuffer) {}

  getSidecarManifest(): SidecarManifest {
    return this.buffer.getSidecarManifest();
  }

  async getSessionInfo(): Promise<SessionInfo> {
    return this.buffer.getSessionInfo();
  }

  async getTimelineBounds(): Promise<TimeRange> {
    return this.buffer.getTimelineBounds();
  }

  async queryEntities(query: EntityQuery): Promise<EntityQueryResult> {
    const mappedTopics = this.buffer.getMappedTopics();
    const entities: Entity[] = mappedTopics.map(mappedTopicToEntity);

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
    const stats = this.buffer.getStats();
    const session = this.buffer.getSessionInfo();
    return {
      tf_indexed: Boolean(session.tf_indexed),
      tf_message_count: stats.tf_message_count,
      tf_transform_count: stats.tf_transform_count,
      tf_topics: this.buffer.getTfTopics(),
      sidecar_loaded: false,
      topic_index_messages: this.buffer.topicIndex.messageCount,
    };
  }

  getMappedTopics(): MappedTopic[] {
    return this.buffer.getMappedTopics();
  }

  async getTfTree(time_ns: number, fixed_frame = "map"): Promise<TfTreeSnapshot> {
    return this.buffer.tfBuffer.getSnapshot(time_ns, fixed_frame);
  }

  async getSceneSnapshot(
    time_ns: number,
    options: SceneBuildOptions = {},
  ): Promise<SceneSnapshot> {
    return buildSceneSnapshot(
      this.buffer.tfBuffer,
      this.buffer.getMappedTopics(),
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

    const nearest = this.buffer.messageStore.findNearest(topic, time_ns);
    if (nearest) {
      this.rawMessageCache.set(cacheKey, nearest);
      if (this.rawMessageCache.size > 128) {
        const firstKey = this.rawMessageCache.keys().next().value;
        if (firstKey) {
          this.rawMessageCache.delete(firstKey);
        }
      }
    }
    return nearest;
  }
}
