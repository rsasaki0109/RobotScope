import { decodeRos2Message, type SchemaInfo } from "../ros2/decoder.js";
import { validateJsonPayload } from "./json-recording.js";

/** Dispatch on the channel's message encoding, never infer CDR from a topic. */
export function decodeMessage(
  schema: SchemaInfo,
  data: Uint8Array,
  messageEncoding: string,
): { value?: unknown; error?: string } {
  try {
    if (messageEncoding === "json") {
      const value: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(data));
      validateJsonPayload(schema.name, value);
      return { value };
    }
    if (messageEncoding === "cdr") return decodeRos2Message(schema, data);
    return { error: `Unsupported message encoding: ${messageEncoding}` };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Decode failed" };
  }
}
