import type { Entity, Timeline } from "./rdm.js";
import type { MappedTopic } from "./mapping/entity-mapper.js";
import type { TfTreeSnapshot } from "./tf/tf-buffer.js";
import type { SceneBuildOptions, SceneSnapshot } from "./scene/scene-builder.js";

export interface TimeRange {
  start_ns: number;
  end_ns: number;
}

export interface EntityFilter {
  paths?: string[];
  kinds?: string[];
  archetypes?: string[];
  tags?: string[];
}

export interface EntityQuery {
  time_ns: number;
  time_range?: TimeRange;
  filter?: EntityFilter;
}

export interface EntityQueryResult {
  entities: Entity[];
  cursor_time_ns: number;
}

export interface TopicInfo {
  name: string;
  schema: string;
  message_count?: number;
  frequency_hz?: number;
}

export interface SessionInfo {
  source: "mcap" | "live" | "rosbag2";
  path?: string;
  start_ns: number;
  end_ns: number;
  topics: TopicInfo[];
  tf_indexed?: boolean;
  tf_transform_count?: number;
  mapped_entity_count?: number;
  sidecar_message_count?: number;
}

/** Query API surface — implemented by ingest backends (MCAP, live agent). */
export interface QueryEngine {
  getSessionInfo(): Promise<SessionInfo>;
  queryEntities(query: EntityQuery): Promise<EntityQueryResult>;
  getTimelineBounds(): Promise<TimeRange>;
  resolveTime(clock: keyof Timeline, time_ns: number): Promise<number>;
}

export interface RawMessage {
  topic: string;
  schema: string;
  log_time_ns: number;
  publish_time_ns?: number;
  sequence?: number;
  data_size: number;
  decoded?: unknown;
  decode_error?: string;
}

export interface NumericSeries {
  t: Float64Array;
  v: Float64Array;
}

export interface IndexStatus {
  tf_indexed: boolean;
  tf_message_count: number;
  tf_transform_count: number;
  tf_topics: string[];
  sidecar_loaded: boolean;
  topic_index_messages: number;
}

/** Extended MCAP query surface used by the viewer. */
export interface McapQueryEngine extends QueryEngine {
  getIndexStatus(): IndexStatus;
  getMappedTopics(): MappedTopic[];
  getTfTree(time_ns: number, fixed_frame?: string): Promise<TfTreeSnapshot>;
  getSceneSnapshot(time_ns: number, options?: SceneBuildOptions): Promise<SceneSnapshot>;
  getRawMessageNearTime(topic: string, time_ns: number): Promise<RawMessage | null>;
  getNumericSeries(
    topic: string,
    fieldPath: string,
    t0_ns: number,
    t1_ns: number,
    maxPoints?: number,
  ): Promise<NumericSeries>;
  getSidecarManifest(): import("./storage/sidecar.js").SidecarManifest;
}

export function isMcapQueryEngine(engine: unknown): engine is McapQueryEngine {
  if (!engine || typeof engine !== "object") {
    return false;
  }
  return (
    typeof (engine as McapQueryEngine).getRawMessageNearTime === "function" &&
    typeof (engine as McapQueryEngine).getNumericSeries === "function" &&
    typeof (engine as McapQueryEngine).getTfTree === "function" &&
    typeof (engine as McapQueryEngine).getSceneSnapshot === "function" &&
    typeof (engine as McapQueryEngine).getSidecarManifest === "function"
  );
}

export interface IngestProgress {
  phase:
    | "opening"
    | "indexing"
    | "ready"
    | "error"
    | "waiting_for_topics"
    | "streaming"
    | "disconnected";
  message?: string;
  percent?: number;
  topics_subscribed?: number;
  topics_pending?: number;
}

export interface IngestHandle {
  engine: QueryEngine;
  close(): Promise<void>;
}

export interface LiveRecordingResult {
  data: Uint8Array;
  message_count: number;
  filename: string;
  sidecar: import("./storage/sidecar.js").SidecarManifest;
}

/** Live ingest with optional MCAP recording and permission-gated publish (v0.8 alpha). */
export interface LiveIngestHandle extends IngestHandle {
  startRecording(): Promise<void>;
  stopRecording(): Promise<LiveRecordingResult>;
  isRecording(): boolean;
  getRecordedMessageCount(): number;
  getCommandPublishTopics(): string[];
  getCommandServiceCallServices(): string[];
  getCommandActionSendGoalActions(): string[];
  publishCommand(request: import("./live/command-gateway.js").LiveCommandPublishRequest): Promise<import("./live/command-gateway.js").LiveCommandPublishResult>;
  callService(request: import("./live/service-gateway.js").LiveServiceCallRequest): Promise<import("./live/service-gateway.js").LiveServiceCallResult>;
  sendActionGoal(request: import("./live/action-gateway.js").LiveActionSendGoalRequest): Promise<import("./live/action-gateway.js").LiveActionSendGoalResult>;
  cancelActionGoal(request: import("./live/action-gateway.js").LiveActionCancelGoalRequest): Promise<import("./live/action-gateway.js").LiveActionCancelGoalResult>;
}

export function isLiveIngestHandle(
  handle: IngestHandle | null | undefined,
): handle is LiveIngestHandle {
  if (!handle) {
    return false;
  }
  return (
    typeof (handle as LiveIngestHandle).startRecording === "function" &&
    typeof (handle as LiveIngestHandle).stopRecording === "function" &&
    typeof (handle as LiveIngestHandle).publishCommand === "function"
  );
}
