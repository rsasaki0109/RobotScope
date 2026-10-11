/** ROS-independent JSON payloads stored in standard MCAP channels. */
export const JSON_SCHEMAS = {
  Scalar: "robotscope.Scalar.v1",
  Observation: "robotscope.Observation.v1",
  Pose: "robotscope.Pose.v1",
  Image: "robotscope.Image.v1",
  PointCloud: "robotscope.PointCloud.v1",
  Trajectory: "robotscope.Trajectory.v1",
  Transform: "robotscope.Transform.v1",
} as const;

export interface JsonPose {
  frame_id: string;
  position: [number, number, number];
  rotation: [number, number, number, number]; // xyzw
}
export interface JsonImage {
  frame_id: string;
  width: number;
  height: number;
  encoding: "rgb8" | "rgba8" | "mono8";
  data_b64: string; // tightly packed rows
}
export interface JsonPoints {
  frame_id: string;
  points: Array<[number, number, number]>;
}
export interface JsonTransform {
  parent_frame_id: string;
  child_frame_id: string;
  translation: [number, number, number];
  rotation: [number, number, number, number];
  is_static: boolean;
}

function tuple(value: unknown, length: number): value is number[] {
  return Array.isArray(value) && value.length === length &&
    value.every((item) => typeof item === "number" && Number.isFinite(item));
}
function rotation(value: unknown): boolean {
  return tuple(value, 4) && Math.abs(Math.hypot(...value) - 1) < 0.001;
}
function frame(value: unknown): boolean {
  return typeof value === "string" && value.length > 0;
}

/** Known payloads have strict geometry/image contracts; arbitrary JSON remains inspectable. */
export function validateJsonPayload(schema: string, value: unknown): void {
  if (!Object.values(JSON_SCHEMAS).includes(schema as typeof JSON_SCHEMAS[keyof typeof JSON_SCHEMAS])) return;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Invalid ${schema} payload`);
  const data = value as Record<string, unknown>;
  let valid = false;
  switch (schema) {
    case JSON_SCHEMAS.Observation:
      valid = true;
      break;
    case JSON_SCHEMAS.Scalar:
      valid = typeof data.value === "number" && Number.isFinite(data.value) &&
        (data.unit === undefined || typeof data.unit === "string");
      break;
    case JSON_SCHEMAS.Pose:
      valid = frame(data.frame_id) && tuple(data.position, 3) && rotation(data.rotation);
      break;
    case JSON_SCHEMAS.PointCloud:
    case JSON_SCHEMAS.Trajectory:
      valid = frame(data.frame_id) && Array.isArray(data.points) && data.points.every((point) => tuple(point, 3));
      break;
    case JSON_SCHEMAS.Transform:
      valid = frame(data.parent_frame_id) && frame(data.child_frame_id) &&
        data.parent_frame_id !== data.child_frame_id && tuple(data.translation, 3) &&
        rotation(data.rotation) && typeof data.is_static === "boolean";
      break;
    case JSON_SCHEMAS.Image: {
      const channels = { rgb8: 3, rgba8: 4, mono8: 1 }[String(data.encoding)];
      if (!frame(data.frame_id) || !Number.isSafeInteger(data.width) || !Number.isSafeInteger(data.height) ||
          Number(data.width) <= 0 || Number(data.height) <= 0 || !channels || typeof data.data_b64 !== "string") break;
      const bytes = Number(data.width) * Number(data.height) * channels;
      valid = Number.isSafeInteger(bytes) && bytes <= 64 * 1024 * 1024 &&
        data.data_b64.length === 4 * Math.ceil(bytes / 3) &&
        /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(data.data_b64) &&
        decodedBase64Length(data.data_b64) === bytes;
      break;
    }
  }
  if (!valid) throw new Error(`Invalid ${schema} payload`);
}

function decodedBase64Length(value: string): number {
  return value.length * 3 / 4 - (value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0);
}
