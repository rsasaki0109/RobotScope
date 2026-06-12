import { McapIndexedReader, TempBuffer } from "@mcap/core";

import type {
  FileFingerprint,
  SidecarManifest,
} from "../storage/sidecar.js";
import type { IngestHandle, IngestProgress, QueryEngine, SessionInfo, TopicInfo } from "../query.js";
import { McapQueryEngineImpl } from "./mcap-query-engine.js";

export interface McapOpenOptions {
  onProgress?: (progress: IngestProgress) => void;
  /** Preloaded `.robotscope/` sidecar (skips topic time scan when fingerprint matches). */
  sidecar?: SidecarManifest;
  fingerprint?: FileFingerprint;
}

export async function openMcap(
  data: Uint8Array | ArrayBuffer,
  options: McapOpenOptions = {},
): Promise<IngestHandle> {
  options.onProgress?.({ phase: "opening", percent: 0, message: "Reading MCAP header" });

  const buffer =
    data instanceof ArrayBuffer ? new Uint8Array(data) : data;

  const reader = await McapIndexedReader.Initialize({
    readable: new TempBuffer(buffer),
  });

  options.onProgress?.({ phase: "indexing", percent: 15, message: "Listing topics" });

  const topics = collectTopics(reader);
  const bounds = reader.statistics
    ? {
        start_ns: Number(reader.statistics.messageStartTime),
        end_ns: Number(reader.statistics.messageEndTime),
      }
    : { start_ns: 0, end_ns: 0 };

  const session: SessionInfo = {
    source: "mcap",
    start_ns: bounds.start_ns,
    end_ns: bounds.end_ns,
    topics,
  };

  options.onProgress?.({
    phase: "indexing",
    percent: 25,
    message: options.sidecar ? "Loading sidecar + TF" : "Building sidecar index",
  });

  const engine: QueryEngine = await McapQueryEngineImpl.create(reader, session, {
    sidecar: options.sidecar,
    fingerprint: options.fingerprint,
    onIndexProgress: (message, percent) => {
      options.onProgress?.({ phase: "indexing", percent, message });
    },
  });

  const indexStatus = (engine as McapQueryEngineImpl).getIndexStatus();
  options.onProgress?.({
    phase: "ready",
    percent: 100,
    message: indexStatus.sidecar_loaded
      ? `Ready (sidecar · ${indexStatus.topic_index_messages} indexed msgs)`
      : `Ready (${indexStatus.topic_index_messages} indexed msgs)`,
  });

  return {
    engine,
    close: async () => {
      /* reader holds no persistent handles in v0.1 prototype */
    },
  };
}

function collectTopics(reader: McapIndexedReader): TopicInfo[] {
  const byChannel = new Map<number, TopicInfo>();

  for (const channel of reader.channelsById.values()) {
    const schema = reader.schemasById.get(channel.schemaId);
    byChannel.set(channel.id, {
      name: channel.topic,
      schema: schema?.name ?? "unknown",
      message_count: reader.statistics?.channelMessageCounts.get(channel.id)
        ? Number(reader.statistics.channelMessageCounts.get(channel.id))
        : undefined,
    });
  }

  return [...byChannel.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export { McapQueryEngineImpl } from "./mcap-query-engine.js";
