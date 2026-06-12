/** RobotScope live agent WebSocket protocol v0.1 */

export const LIVE_PROTOCOL_VERSION = "robotscope.live.v0.1" as const;

export interface LiveChannelDefinition {
  id: number;
  topic: string;
  schema: string;
  encoding: "ros2msg" | "ros2idl" | string;
  /** ROS message definition text (ros2msg). */
  definition: string;
}

export interface LiveSessionMessage {
  type: "session";
  protocol: typeof LIVE_PROTOCOL_VERSION;
  agent: string;
  start_ns: number;
  topics: Array<{ name: string; schema: string }>;
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

export type LiveServerMessage =
  | LiveSessionMessage
  | LiveChannelMessage
  | LiveDataMessage
  | LiveStatusMessage
  | LiveErrorMessage;

export interface LivePingMessage {
  type: "ping";
}

export type LiveClientMessage = LivePingMessage;

export function parseLiveServerMessage(raw: string): LiveServerMessage | null {
  try {
    const value = JSON.parse(raw) as LiveServerMessage;
    if (!value || typeof value !== "object" || !("type" in value)) {
      return null;
    }
    return value;
  } catch {
    return null;
  }
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
