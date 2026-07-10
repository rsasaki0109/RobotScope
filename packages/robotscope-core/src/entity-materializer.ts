import { mappedTopicToEntity, type MappedTopic } from "./mapping/entity-mapper.js";
import type { Component, Entity, FrameRef, Timeline } from "./rdm.js";
import type { RawMessage } from "./query.js";

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value != null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : undefined;
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function sensorTimeFromDecoded(decoded: unknown): number | undefined {
  const header = asRecord(asRecord(decoded)?.header);
  const stamp = asRecord(header?.stamp);
  const seconds = finiteNumber(stamp?.sec) ?? finiteNumber(stamp?.secs);
  const nanoseconds =
    finiteNumber(stamp?.nanosec) ?? finiteNumber(stamp?.nsec) ?? finiteNumber(stamp?.nsecs);

  if (seconds == null || nanoseconds == null) {
    return undefined;
  }
  return seconds * 1_000_000_000 + nanoseconds;
}

function frameFromDecoded(decoded: unknown): FrameRef | undefined {
  const header = asRecord(asRecord(decoded)?.header);
  const frameId = header?.frame_id ?? header?.frameId;
  return typeof frameId === "string" && frameId.length > 0
    ? { frame_id: frameId }
    : undefined;
}

export function materializeMappedEntity(
  mapping: MappedTopic,
  message: RawMessage | null,
): Entity {
  const entity = mappedTopicToEntity(mapping);
  if (!message) {
    return entity;
  }

  const time: Timeline = { log_time_ns: message.log_time_ns };
  const sensorTime = sensorTimeFromDecoded(message.decoded);
  if (sensorTime != null) {
    time.sensor_time_ns = sensorTime;
  }

  const data: Component = {
    name: "data",
    type: mapping.archetype,
    time,
    frame: frameFromDecoded(message.decoded),
    source: {
      topic: message.topic,
      schema: message.schema,
      sequence: message.sequence,
    },
  };

  if (message.decode_error) {
    data.quality = { flags: ["decode_error", message.decode_error] };
  } else {
    data.value = message.decoded;
  }

  entity.components = [...(entity.components ?? []), data];
  return entity;
}
