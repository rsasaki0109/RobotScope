import { parse } from "@foxglove/rosmsg";
import type { MessageDefinition } from "@foxglove/message-definition";
import { MessageReader } from "@foxglove/rosmsg2-serialization";
import { ros2humble } from "@foxglove/rosmsg-msgs-common";

export interface SchemaInfo {
  name: string;
  encoding: string;
  data: Uint8Array;
}

const readerCache = new Map<string, MessageReader>();

/** Normalize `tf2_msgs/msg/TFMessage` → `tf2_msgs/TFMessage`. */
export function normalizeSchemaName(name: string): string {
  return name.replace(/\/msg\//, "/").replace(/^package:\/\//, "");
}

function cacheKey(schema: SchemaInfo): string {
  return `${schema.encoding}:${schema.name}:${schema.data.byteLength}`;
}

function definitionsFromSchema(schema: SchemaInfo): MessageDefinition[] | undefined {
  const text = new TextDecoder().decode(schema.data).trim();
  if (!text) {
    return undefined;
  }

  try {
    return parse(text, { ros2: schema.encoding.includes("ros2") || schema.encoding === "cdr" });
  } catch {
    return undefined;
  }
}

function definitionsFromCommon(schemaName: string): MessageDefinition[] | undefined {
  const normalized = normalizeSchemaName(schemaName);
  const root = ros2humble[normalized as keyof typeof ros2humble];
  if (!root) {
    return undefined;
  }

  const collected: MessageDefinition[] = [];
  const seen = new Set<string>();
  const visit = (name: string): void => {
    if (seen.has(name)) {
      return;
    }
    seen.add(name);

    const entry = ros2humble[name as keyof typeof ros2humble];
    if (!entry) {
      return;
    }

    collected.push(entry);
    for (const field of entry.definitions) {
      if (field.isComplex === true && field.isConstant !== true) {
        visit(field.type);
      }
    }
  };

  visit(normalized);
  return collected;
}

export function getMessageReader(schema: SchemaInfo): MessageReader | undefined {
  const key = cacheKey(schema);
  const cached = readerCache.get(key);
  if (cached) {
    return cached;
  }

  const definitions =
    definitionsFromSchema(schema) ?? definitionsFromCommon(schema.name);

  if (!definitions) {
    return undefined;
  }

  const reader = new MessageReader(definitions);
  readerCache.set(key, reader);
  return reader;
}

export function decodeRos2Message(
  schema: SchemaInfo,
  data: Uint8Array,
): { value?: unknown; error?: string } {
  const reader = getMessageReader(schema);
  if (!reader) {
    return { error: `No decoder for schema ${schema.name}` };
  }

  try {
    return { value: reader.readMessage(data) };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Decode failed",
    };
  }
}

export function isTfTopic(topic: string): boolean {
  return topic === "/tf" || topic === "/tf_static" || topic.endsWith("/tf");
}

export function isTfMessageSchema(schemaName: string): boolean {
  const normalized = normalizeSchemaName(schemaName);
  return normalized === "tf2_msgs/TFMessage" || normalized.endsWith("/TFMessage");
}
