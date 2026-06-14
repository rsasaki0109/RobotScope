import type { IngestProgress, LiveIngestHandle, TimeRange } from "../query.js";

import { LiveAgentClient } from "./client.js";
import { LiveIngestBuffer } from "./ingest-buffer.js";
import type { LiveIngestStats } from "./ingest-buffer.js";
import { LiveQueryEngineImpl } from "./live-query-engine.js";

export interface LiveOpenOptions {
  onProgress?: (progress: IngestProgress) => void;
  onSessionUpdate?: (
    bounds: TimeRange,
    stats: LiveIngestStats,
    engine: LiveQueryEngineImpl,
  ) => void;
  onActionProgress?: (update: import("./action-gateway.js").LiveActionProgressUpdate) => void;
}

export async function openLive(url: string, options: LiveOpenOptions = {}): Promise<LiveIngestHandle> {
  const buffer = new LiveIngestBuffer();
  const engine = new LiveQueryEngineImpl(buffer);
  const client = new LiveAgentClient(url, buffer, engine, {
    onProgress: options.onProgress,
    onSessionUpdate: (bounds, stats, liveEngine) => {
      options.onSessionUpdate?.(bounds, stats, liveEngine);
    },
    onActionProgress: options.onActionProgress,
  });
  await client.connect();

  return {
    engine,
    close: async () => {
      client.disconnect();
    },
    startRecording: () => client.startRecording(),
    stopRecording: () => client.stopRecording(),
    isRecording: () => client.isRecording(),
    getRecordedMessageCount: () => client.getRecordedMessageCount(),
    getCommandPublishTopics: () => client.getCommandPublishTopics(),
    getCommandServiceCallServices: () => client.getCommandServiceCallServices(),
    getCommandActionSendGoalActions: () => client.getCommandActionSendGoalActions(),
    publishCommand: (request) => client.publishCommand(request),
    callService: (request) => client.callService(request),
    sendActionGoal: (request) => client.sendActionGoal(request),
  };
}

export { LiveAgentClient } from "./client.js";
export { LiveIngestBuffer } from "./ingest-buffer.js";
export { LiveQueryEngineImpl } from "./live-query-engine.js";
export { LiveMcapRecorder, defaultLiveRecordingFilename } from "./recorder.js";
export type { LiveRecordingResult } from "../query.js";
export * from "./protocol.js";
