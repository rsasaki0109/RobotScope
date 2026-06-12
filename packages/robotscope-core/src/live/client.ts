import type { IngestProgress, LiveRecordingResult, TimeRange } from "../query.js";

import type { LiveIngestBuffer, LiveIngestStats } from "./ingest-buffer.js";
import { LIVE_PROTOCOL_VERSION, parseLiveServerMessage } from "./protocol.js";
import type { LiveChannelDefinition, LiveDataMessage, LiveStatusMessage } from "./protocol.js";
import type { LiveQueryEngineImpl } from "./live-query-engine.js";
import { LiveMcapRecorder } from "./recorder.js";

export interface LiveClientOptions {
  onProgress?: (progress: IngestProgress) => void;
  onSessionUpdate?: (
    bounds: TimeRange,
    stats: LiveIngestStats,
    engine: LiveQueryEngineImpl,
  ) => void;
}

function statusToProgress(message: LiveStatusMessage): IngestProgress {
  const base = {
    message: message.message,
    topics_subscribed: message.topics_subscribed,
    topics_pending: message.topics_pending,
  };

  switch (message.phase) {
    case "connecting":
      return { phase: "opening", ...base };
    case "waiting_for_topics":
      return { phase: "waiting_for_topics", ...base };
    case "ready":
      return { phase: "ready", percent: 100, ...base };
    case "streaming":
      return { phase: "streaming", percent: 100, ...base };
    case "error":
      return { phase: "error", ...base };
    default:
      return { phase: "indexing", ...base };
  }
}

export class LiveAgentClient {
  private socket: WebSocket | null = null;
  private closed = false;
  private unsubscribeBuffer?: () => void;
  private updateTimer: ReturnType<typeof setTimeout> | undefined;
  private pendingUpdate = false;
  private recorder: LiveMcapRecorder | null = null;

  constructor(
    private readonly url: string,
    private readonly buffer: LiveIngestBuffer,
    private readonly engine: LiveQueryEngineImpl,
    private readonly options: LiveClientOptions = {},
  ) {}

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.options.onProgress?.({
        phase: "opening",
        message: `Connecting to ${this.url}`,
      });

      const socket = new WebSocket(this.url);
      this.socket = socket;
      let settled = false;

      socket.addEventListener("open", () => {
        this.options.onProgress?.({
          phase: "opening",
          message: "WebSocket connected — waiting for agent…",
        });
      });

      socket.addEventListener("message", (event) => {
        if (typeof event.data !== "string") {
          return;
        }

        const message = parseLiveServerMessage(event.data);
        if (!message) {
          return;
        }

        switch (message.type) {
          case "session":
            if (message.protocol !== LIVE_PROTOCOL_VERSION) {
              reject(new Error(`Unsupported live protocol: ${message.protocol}`));
              return;
            }
            this.buffer.resetSession(message.start_ns, message.topics);
            this.options.onProgress?.({
              phase: "indexing",
              message: `Live session from ${message.agent}`,
              topics_subscribed: message.topics.length,
            });
            if (!settled) {
              settled = true;
              resolve();
            }
            break;
          case "channel":
            this.buffer.registerChannel(message.channel);
            void this.recordChannel(message.channel);
            break;
          case "message":
            this.buffer.ingest(message);
            void this.recordMessage(message);
            this.scheduleSessionUpdate();
            break;
          case "status":
            this.options.onProgress?.(statusToProgress(message));
            break;
          case "error":
            if (!settled) {
              settled = true;
              reject(new Error(message.message));
            } else {
              this.options.onProgress?.({ phase: "error", message: message.message });
            }
            break;
          default:
            break;
        }
      });

      socket.addEventListener("error", () => {
        if (!settled) {
          settled = true;
          reject(new Error(`WebSocket error connecting to ${this.url}`));
        }
      });

      socket.addEventListener("close", () => {
        if (!settled) {
          settled = true;
          reject(new Error("Live agent closed before ready"));
        }
        if (!this.closed) {
          this.options.onProgress?.({ phase: "disconnected", message: "Live agent disconnected" });
        }
      });

      this.unsubscribeBuffer = this.buffer.onUpdate(() => this.scheduleSessionUpdate());

      setTimeout(() => {
        if (!settled && socket.readyState === WebSocket.OPEN) {
          settled = true;
          this.options.onProgress?.({
            phase: "ready",
            percent: 100,
            message: "Live stream connected",
          });
          resolve();
        }
      }, 3000);
    });
  }

  disconnect(): void {
    this.closed = true;
    if (this.updateTimer) {
      clearTimeout(this.updateTimer);
    }
    this.unsubscribeBuffer?.();
    this.recorder = null;
    this.socket?.close();
    this.socket = null;
  }

  async startRecording(): Promise<void> {
    if (this.recorder?.isActive()) {
      return;
    }
    const recorder = new LiveMcapRecorder();
    await recorder.start();
    for (const channel of this.buffer.getChannelDefinitions()) {
      await recorder.registerChannel(channel);
    }
    this.recorder = recorder;
  }

  async stopRecording(): Promise<LiveRecordingResult> {
    if (!this.recorder?.isActive()) {
      throw new Error("No active live recording");
    }
    const result = await this.recorder.finish();
    this.recorder = null;
    const stats = this.buffer.getStats();
    return {
      ...result,
      sidecar: {
        ...result.sidecar,
        tf_message_count: stats.tf_message_count,
        tf_transform_count: stats.tf_transform_count,
      },
    };
  }

  isRecording(): boolean {
    return this.recorder?.isActive() ?? false;
  }

  getRecordedMessageCount(): number {
    return this.recorder?.getRecordedMessageCount() ?? 0;
  }

  private async recordChannel(channel: LiveChannelDefinition): Promise<void> {
    if (!this.recorder?.isActive()) {
      return;
    }
    await this.recorder.registerChannel(channel);
  }

  private async recordMessage(message: LiveDataMessage): Promise<void> {
    if (!this.recorder?.isActive()) {
      return;
    }
    await this.recorder.writeMessage(message);
  }

  private scheduleSessionUpdate(): void {
    if (this.pendingUpdate) {
      return;
    }
    this.pendingUpdate = true;
    this.updateTimer = setTimeout(() => {
      this.pendingUpdate = false;
      const bounds = this.buffer.getTimelineBounds();
      this.options.onSessionUpdate?.(bounds, this.buffer.getStats(), this.engine);
    }, 100);
  }
}
