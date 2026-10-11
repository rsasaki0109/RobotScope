import { isTfMessageSchema, isTfTopic } from "../ros2/decoder.js";
import type { StoredTransform } from "../tf/tf-buffer.js";
import { JSON_SCHEMAS, type JsonTransform } from "./json-recording.js";

export function isTransformChannel(topic: string, schema: string): boolean {
  return schema === JSON_SCHEMAS.Transform || (isTfTopic(topic) && isTfMessageSchema(schema));
}

export function storedTransforms(schema: string, value: unknown, time_ns: number, topic: string): StoredTransform[] {
  if (schema === JSON_SCHEMAS.Transform) {
    const data = value as JsonTransform;
    return [{ ...data, time_ns: data.is_static ? 0 : time_ns }];
  }
  const data = value as { transforms?: Array<{
    header: { frame_id: string }; child_frame_id: string;
    transform: { translation: { x: number; y: number; z: number }; rotation: { x: number; y: number; z: number; w: number } };
  }> };
  return (data.transforms ?? []).map((transform) => ({
    parent_frame_id: transform.header.frame_id, child_frame_id: transform.child_frame_id,
    translation: [transform.transform.translation.x, transform.transform.translation.y, transform.transform.translation.z],
    rotation: [transform.transform.rotation.x, transform.transform.rotation.y, transform.transform.rotation.z, transform.transform.rotation.w],
    time_ns: topic.includes("static") ? 0 : time_ns, is_static: topic.includes("static"),
  }));
}
