/** RobotScope live agent WebSocket protocol v0.1 */

import type { FibonacciActionGoal } from "./action-gateway.js";
import type { TwistVelocityCommand } from "./command-gateway.js";

export const LIVE_PROTOCOL_VERSION = "robotscope.live.v0.1" as const;

export interface LiveChannelDefinition {
  id: number;
  topic: string;
  schema: string;
  encoding: "ros2msg" | "ros2idl" | string;
  /** ROS message definition text (ros2msg). */
  definition: string;
  /** Omitted by older ROS 2 agents; defaults to CDR. */
  message_encoding?: string;
  metadata?: Record<string, string>;
}

export interface LiveSessionMessage {
  type: "session";
  protocol: typeof LIVE_PROTOCOL_VERSION;
  agent: string;
  start_ns: number;
  topics: Array<{ name: string; schema: string }>;
  capabilities?: {
    command_publish?: string[];
    command_service_call?: string[];
    command_service_types?: Record<string, string>;
    command_action_send_goal?: string[];
  };
}

export interface LiveChannelMessage {
  type: "channel";
  channel: LiveChannelDefinition;
}

export interface LiveDataMessage {
  type: "message";
  channel_id: number;
  log_time_ns: number;
  publish_time_ns?: number;
  sequence?: number;
  /** Base64-encoded CDR payload. */
  data_b64: string;
}

export interface LiveStatusMessage {
  type: "status";
  phase: "connecting" | "waiting_for_topics" | "ready" | "streaming" | "error";
  message?: string;
  topics_subscribed?: number;
  topics_pending?: number;
}

export interface LiveErrorMessage {
  type: "error";
  message: string;
}

export interface LiveCommandPublishResultMessage {
  type: "command.publish_result";
  ok: boolean;
  topic?: string;
  message: string;
}

export interface LiveCommandServiceResultMessage {
  type: "command.service_result";
  ok: boolean;
  service?: string;
  message: string;
  success?: boolean;
}

export interface LiveCommandActionResultMessage {
  type: "command.action_result";
  ok: boolean;
  action?: string;
  message: string;
  goal_accepted?: boolean;
}

export interface LiveCommandActionFeedbackMessage {
  type: "command.action_feedback";
  action: string;
  sequence: number[];
}

export interface LiveCommandActionOutcomeMessage {
  type: "command.action_outcome";
  action: string;
  ok: boolean;
  status: "succeeded" | "aborted" | "canceled" | "failed";
  sequence: number[];
  message?: string;
}

export interface LiveCommandActionCancelResultMessage {
  type: "command.action_cancel_result";
  ok: boolean;
  action?: string;
  message: string;
  cancel_accepted?: boolean;
}

export type LiveServerMessage =
  | LiveSessionMessage
  | LiveChannelMessage
  | LiveDataMessage
  | LiveStatusMessage
  | LiveErrorMessage
  | LiveCommandPublishResultMessage
  | LiveCommandServiceResultMessage
  | LiveCommandActionResultMessage
  | LiveCommandActionFeedbackMessage
  | LiveCommandActionOutcomeMessage
  | LiveCommandActionCancelResultMessage;

export interface LiveCommandPublishClientMessage {
  type: "command.publish";
  topic: string;
  schema: string;
  twist?: TwistVelocityCommand;
  zero_twist?: boolean;
  data_b64?: string;
}

export interface LivePingMessage {
  type: "ping";
}

export interface LiveCommandServiceCallClientMessage {
  type: "command.service_call";
  service: string;
  schema: string;
  trigger?: boolean;
  data?: boolean;
}

export interface LiveCommandActionSendGoalClientMessage {
  type: "command.action_send_goal";
  action: string;
  schema: string;
  fibonacci?: FibonacciActionGoal;
  preempt?: boolean;
}

export interface LiveCommandActionCancelGoalClientMessage {
  type: "command.action_cancel_goal";
  action: string;
}

export type LiveClientMessage =
  | LivePingMessage
  | LiveCommandPublishClientMessage
  | LiveCommandServiceCallClientMessage
  | LiveCommandActionSendGoalClientMessage
  | LiveCommandActionCancelGoalClientMessage;

export function parseLiveServerMessage(raw: string): LiveServerMessage | null {
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    if (!record(value) || typeof value.type !== "string") return null;
    switch (value.type) {
      case "session": {
        if (typeof value.protocol !== "string" || typeof value.agent !== "string" ||
            !timestamp(value.start_ns) || !Array.isArray(value.topics) ||
            !value.topics.every((topic) => record(topic) && typeof topic.name === "string" && typeof topic.schema === "string")) return null;
        if (value.capabilities !== undefined) {
          const caps = value.capabilities;
          if (!record(caps)) return null;
          for (const key of ["command_publish", "command_service_call", "command_action_send_goal"]) {
            if (caps[key] !== undefined && !stringArray(caps[key])) return null;
          }
          if (caps.command_service_types !== undefined &&
              (!record(caps.command_service_types) || !Object.values(caps.command_service_types).every((item) => typeof item === "string"))) return null;
        }
        break;
      }
      case "channel": {
        const channel = value.channel;
        if (!record(channel) || !integer(channel.id) ||
            ![channel.topic, channel.schema, channel.encoding, channel.definition].every((item) => typeof item === "string")) return null;
        if (!optionalString(channel.message_encoding) ||
            (channel.metadata !== undefined && (!record(channel.metadata) ||
              !Object.values(channel.metadata).every((item) => typeof item === "string")))) return null;
        break;
      }
      case "message":
        if (!integer(value.channel_id) || !timestamp(value.log_time_ns) ||
            (value.publish_time_ns !== undefined && !timestamp(value.publish_time_ns)) ||
            (value.sequence !== undefined && !integer(value.sequence)) ||
            typeof value.data_b64 !== "string" ||
            !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value.data_b64)) return null;
        break;
      case "status":
        if (!["connecting", "waiting_for_topics", "ready", "streaming", "error"].includes(String(value.phase)) ||
            !optionalString(value.message) ||
            (value.topics_subscribed !== undefined && !integer(value.topics_subscribed)) ||
            (value.topics_pending !== undefined && !integer(value.topics_pending))) return null;
        break;
      case "error":
        if (typeof value.message !== "string") return null;
        break;
      case "command.publish_result":
      case "command.service_result":
      case "command.action_result":
      case "command.action_cancel_result":
        if (typeof value.ok !== "boolean" || typeof value.message !== "string" ||
            ![value.topic, value.service, value.action].every(optionalString) ||
            ![value.success, value.goal_accepted, value.cancel_accepted].every((item) => item === undefined || typeof item === "boolean")) return null;
        break;
      case "command.action_feedback":
      case "command.action_outcome":
        if (typeof value.action !== "string" || !Array.isArray(value.sequence) || !value.sequence.every((item) => typeof item === "number" && Number.isFinite(item))) return null;
        if (value.type === "command.action_outcome" &&
            (typeof value.ok !== "boolean" || !["succeeded", "aborted", "canceled", "failed"].includes(String(value.status)) || !optionalString(value.message))) return null;
        break;
      default:
        return null;
    }
    return value as unknown as LiveServerMessage;
  } catch {
    return null;
  }
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function timestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function integer(value: unknown): value is number {
  return timestamp(value) && Number.isSafeInteger(value);
}

function optionalString(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

export function encodeLiveClientMessage(message: LiveClientMessage): string {
  return JSON.stringify(message);
}

export function decodeBase64Payload(data_b64: string): Uint8Array {
  if (typeof globalThis.atob === "function") {
    const binary = globalThis.atob(data_b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  // Node fallback for tests/scripts importing core helpers.
  const buffer = Buffer.from(data_b64, "base64");
  return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}
