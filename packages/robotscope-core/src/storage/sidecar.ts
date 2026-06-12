export const SIDECAR_VERSION = "0.1" as const;

export interface FileFingerprint {
  name: string;
  size: number;
  last_modified_ms?: number;
}

export interface SidecarTopicTimes {
  topic: string;
  schema: string;
  channel_id: number;
  /** Compact tuples: [log_time_ns, sequence?] */
  times: Array<[number, number?]>;
}

export interface SidecarManifest {
  version: typeof SIDECAR_VERSION;
  fingerprint?: FileFingerprint;
  /** Distinguishes rosbag2 `[time, storage_id]` tuples from MCAP `[time, sequence?]`. */
  recording_source?: "mcap" | "rosbag2" | "live";
  start_ns: number;
  end_ns: number;
  built_at_ms: number;
  topics: SidecarTopicTimes[];
  tf_message_count: number;
  tf_transform_count: number;
}

export function sidecarFromTopicIndex(
  topics: import("./topic-time-index.js").TopicTimeIndexExport[],
  bounds: { start_ns: number; end_ns: number },
  tfStats: { messages: number; transforms: number },
  fingerprint?: FileFingerprint,
  recording_source?: SidecarManifest["recording_source"],
): SidecarManifest {
  return {
    version: SIDECAR_VERSION,
    fingerprint,
    recording_source,
    start_ns: bounds.start_ns,
    end_ns: bounds.end_ns,
    built_at_ms: Date.now(),
    topics: topics.map((topic) => ({
      topic: topic.topic,
      schema: topic.schema,
      channel_id: topic.channel_id,
      times:
        recording_source === "rosbag2"
          ? topic.entries.map((entry) => [entry.log_time_ns, entry.storage_id ?? 0])
          : topic.entries.map((entry) =>
              entry.sequence != null ? [entry.log_time_ns, entry.sequence] : [entry.log_time_ns],
            ),
    })),
    tf_message_count: tfStats.messages,
    tf_transform_count: tfStats.transforms,
  };
}

export function validateSidecarFingerprint(
  sidecar: SidecarManifest,
  fingerprint: FileFingerprint,
): boolean {
  if (!sidecar.fingerprint) {
    return false;
  }
  if (sidecar.fingerprint.name !== fingerprint.name) {
    return false;
  }
  if (sidecar.fingerprint.size !== fingerprint.size) {
    return false;
  }
  if (
    sidecar.fingerprint.last_modified_ms != null &&
    fingerprint.last_modified_ms != null &&
    sidecar.fingerprint.last_modified_ms !== fingerprint.last_modified_ms
  ) {
    return false;
  }
  return true;
}

export function parseSidecarManifest(json: string): SidecarManifest | null {
  try {
    const value = JSON.parse(json) as SidecarManifest;
    if (value.version !== SIDECAR_VERSION || !Array.isArray(value.topics)) {
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

export function serializeSidecarManifest(manifest: SidecarManifest): string {
  return JSON.stringify(manifest);
}

/** Browser download name for a sidecar saved next to an MCAP recording. */
export function sidecarDownloadFilenameForMcap(mcapFilename: string): string {
  return `${mcapFilename}.robotscope-index.json`;
}

/** Path convention for CLI/desktop: recording.mcap → recording.mcap.robotscope/index.json */
export function sidecarPathForMcap(mcapPath: string): string {
  return `${mcapPath}.robotscope/index.json`;
}

/** Browser download name for a rosbag2 sidecar. */
export function sidecarDownloadFilenameForRosbag2(db3Filename: string): string {
  return `${db3Filename}.robotscope-index.json`;
}
