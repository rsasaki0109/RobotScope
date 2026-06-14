import type { IngestProgress, LiveRecordingResult, TimeRange } from "../query.js";

import type {
  LiveActionCancelGoalRequest,
  LiveActionCancelGoalResult,
  LiveActionProgressUpdate,
  LiveActionSendGoalRequest,
  LiveActionSendGoalResult,
} from "./action-gateway.js";
import type {
  LiveCommandPublishRequest,
  LiveCommandPublishResult,
} from "./command-gateway.js";
import type {
  LiveServiceCallRequest,
  LiveServiceCallResult,
} from "./service-gateway.js";
import type { LiveIngestBuffer, LiveIngestStats } from "./ingest-buffer.js";
import { LIVE_PROTOCOL_VERSION, encodeLiveClientMessage, parseLiveServerMessage } from "./protocol.js";
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
  onActionProgress?: (update: LiveActionProgressUpdate) => void;
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
  private publishTopics: string[] = [];
  private serviceCallServices: string[] = [];
  private actionSendGoalActions: string[] = [];
  private publishResolver:
    | ((result: LiveCommandPublishResult) => void)
    | null = null;
  private publishReject: ((error: Error) => void) | null = null;
  private publishTimeout: ReturnType<typeof setTimeout> | undefined;
  private serviceResolver: ((result: LiveServiceCallResult) => void) | null = null;
  private serviceReject: ((error: Error) => void) | null = null;
  private serviceTimeout: ReturnType<typeof setTimeout> | undefined;
  private actionResolver: ((result: LiveActionSendGoalResult) => void) | null = null;
  private actionReject: ((error: Error) => void) | null = null;
  private actionTimeout: ReturnType<typeof setTimeout> | undefined;
  private actionCancelResolver: ((result: LiveActionCancelGoalResult) => void) | null = null;
  private actionCancelReject: ((error: Error) => void) | null = null;
  private actionCancelTimeout: ReturnType<typeof setTimeout> | undefined;

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
            this.publishTopics = message.capabilities?.command_publish ?? [];
            this.serviceCallServices = message.capabilities?.command_service_call ?? [];
            this.actionSendGoalActions = message.capabilities?.command_action_send_goal ?? [];
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
          case "command.publish_result":
            this.resolvePublish({
              ok: message.ok,
              topic: message.topic,
              message: message.message,
            });
            break;
          case "command.service_result":
            this.resolveServiceCall({
              ok: message.ok,
              service: message.service,
              message: message.message,
              success: message.success,
            });
            break;
          case "command.action_result":
            this.resolveActionGoal({
              ok: message.ok,
              action: message.action,
              message: message.message,
              goal_accepted: message.goal_accepted,
            });
            break;
          case "command.action_feedback":
            if (message.action && Array.isArray(message.sequence)) {
              this.options.onActionProgress?.({
                kind: "feedback",
                action: message.action,
                sequence: message.sequence,
              });
            }
            break;
          case "command.action_outcome":
            if (message.action && Array.isArray(message.sequence)) {
              this.options.onActionProgress?.({
                kind: "outcome",
                action: message.action,
                ok: message.ok,
                status: message.status,
                sequence: message.sequence,
                message: message.message,
              });
            }
            break;
          case "command.action_cancel_result":
            this.resolveActionCancel({
              ok: message.ok,
              action: message.action,
              message: message.message,
              cancel_accepted: message.cancel_accepted,
            });
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
    this.clearPublishPending(new Error("Live agent disconnected"));
    this.clearServicePending(new Error("Live agent disconnected"));
    this.clearActionPending(new Error("Live agent disconnected"));
    this.clearActionCancelPending(new Error("Live agent disconnected"));
    this.unsubscribeBuffer?.();
    this.recorder = null;
    this.socket?.close();
    this.socket = null;
    this.publishTopics = [];
    this.serviceCallServices = [];
    this.actionSendGoalActions = [];
  }

  getCommandPublishTopics(): string[] {
    return [...this.publishTopics];
  }

  getCommandServiceCallServices(): string[] {
    return [...this.serviceCallServices];
  }

  getCommandActionSendGoalActions(): string[] {
    return [...this.actionSendGoalActions];
  }

  publishCommand(request: LiveCommandPublishRequest): Promise<LiveCommandPublishResult> {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("Live agent not connected"));
    }
    if (!this.publishTopics.includes(request.topic)) {
      return Promise.reject(
        new Error(`Topic ${request.topic} is not allowlisted by the live agent`),
      );
    }
    if (this.publishResolver) {
      return Promise.reject(new Error("Another publish is in progress"));
    }

    return new Promise((resolve, reject) => {
      this.publishResolver = resolve;
      this.publishReject = reject;
      this.publishTimeout = setTimeout(() => {
        this.clearPublishPending(new Error("Command publish timed out"));
      }, 5000);

      this.socket?.send(
        encodeLiveClientMessage({
          type: "command.publish",
          topic: request.topic,
          schema: request.schema,
          twist: request.twist,
          zero_twist: request.zero_twist,
          data_b64: request.data_b64,
        }),
      );
    });
  }

  callService(request: LiveServiceCallRequest): Promise<LiveServiceCallResult> {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("Live agent not connected"));
    }
    if (!this.serviceCallServices.includes(request.service)) {
      return Promise.reject(
        new Error(`Service ${request.service} is not allowlisted by the live agent`),
      );
    }
    if (this.serviceResolver) {
      return Promise.reject(new Error("Another service call is in progress"));
    }

    return new Promise((resolve, reject) => {
      this.serviceResolver = resolve;
      this.serviceReject = reject;
      this.serviceTimeout = setTimeout(() => {
        this.clearServicePending(new Error("Service call timed out"));
      }, 5000);

      this.socket?.send(
        encodeLiveClientMessage({
          type: "command.service_call",
          service: request.service,
          schema: request.schema,
          trigger: request.trigger,
        }),
      );
    });
  }

  sendActionGoal(request: LiveActionSendGoalRequest): Promise<LiveActionSendGoalResult> {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("Live agent not connected"));
    }
    if (!this.actionSendGoalActions.includes(request.action)) {
      return Promise.reject(
        new Error(`Action ${request.action} is not allowlisted by the live agent`),
      );
    }
    if (this.actionResolver) {
      return Promise.reject(new Error("Another action goal is in progress"));
    }

    return new Promise((resolve, reject) => {
      this.actionResolver = resolve;
      this.actionReject = reject;
      this.actionTimeout = setTimeout(() => {
        this.clearActionPending(new Error("Action goal send timed out"));
      }, 5000);

      this.socket?.send(
        encodeLiveClientMessage({
          type: "command.action_send_goal",
          action: request.action,
          schema: request.schema,
          fibonacci: request.fibonacci,
          preempt: request.preempt,
        }),
      );
    });
  }

  cancelActionGoal(request: LiveActionCancelGoalRequest): Promise<LiveActionCancelGoalResult> {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("Live agent not connected"));
    }
    if (!this.actionSendGoalActions.includes(request.action)) {
      return Promise.reject(
        new Error(`Action ${request.action} is not allowlisted by the live agent`),
      );
    }
    if (this.actionCancelResolver) {
      return Promise.reject(new Error("Another action cancel is in progress"));
    }

    return new Promise((resolve, reject) => {
      this.actionCancelResolver = resolve;
      this.actionCancelReject = reject;
      this.actionCancelTimeout = setTimeout(() => {
        this.clearActionCancelPending(new Error("Action cancel timed out"));
      }, 5000);

      this.socket?.send(
        encodeLiveClientMessage({
          type: "command.action_cancel_goal",
          action: request.action,
        }),
      );
    });
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

  private resolvePublish(result: LiveCommandPublishResult): void {
    if (!this.publishResolver) {
      return;
    }
    const resolve = this.publishResolver;
    this.clearPublishPending();
    resolve(result);
  }

  private clearPublishPending(error?: Error): void {
    if (this.publishTimeout) {
      clearTimeout(this.publishTimeout);
      this.publishTimeout = undefined;
    }
    const reject = this.publishReject;
    this.publishResolver = null;
    this.publishReject = null;
    if (error && reject) {
      reject(error);
    }
  }

  private resolveServiceCall(result: LiveServiceCallResult): void {
    if (!this.serviceResolver) {
      return;
    }
    const resolve = this.serviceResolver;
    this.clearServicePending();
    resolve(result);
  }

  private clearServicePending(error?: Error): void {
    if (this.serviceTimeout) {
      clearTimeout(this.serviceTimeout);
      this.serviceTimeout = undefined;
    }
    const reject = this.serviceReject;
    this.serviceResolver = null;
    this.serviceReject = null;
    if (error && reject) {
      reject(error);
    }
  }

  private resolveActionGoal(result: LiveActionSendGoalResult): void {
    if (!this.actionResolver) {
      return;
    }
    const resolve = this.actionResolver;
    this.clearActionPending();
    resolve(result);
  }

  private clearActionPending(error?: Error): void {
    if (this.actionTimeout) {
      clearTimeout(this.actionTimeout);
      this.actionTimeout = undefined;
    }
    const reject = this.actionReject;
    this.actionResolver = null;
    this.actionReject = null;
    if (error && reject) {
      reject(error);
    }
  }

  private resolveActionCancel(result: LiveActionCancelGoalResult): void {
    if (!this.actionCancelResolver) {
      return;
    }
    const resolve = this.actionCancelResolver;
    this.clearActionCancelPending();
    resolve(result);
  }

  private clearActionCancelPending(error?: Error): void {
    if (this.actionCancelTimeout) {
      clearTimeout(this.actionCancelTimeout);
      this.actionCancelTimeout = undefined;
    }
    const reject = this.actionCancelReject;
    this.actionCancelResolver = null;
    this.actionCancelReject = null;
    if (error && reject) {
      reject(error);
    }
  }
}
