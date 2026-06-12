import { applyTransform, type Transform3D } from "../tf/transform-math.js";

export interface PointCloudField {
  name: string;
  offset: number;
  datatype: number;
  count: number;
}

export interface DecodedPointCloud2 {
  frame_id: string;
  width: number;
  height: number;
  point_step: number;
  row_step: number;
  is_bigendian: boolean;
  is_dense: boolean;
  fields: PointCloudField[];
  data: Uint8Array;
}

export interface ParsedPointCloud {
  frame_id: string;
  points: Float32Array;
  colors?: Float32Array;
  point_count: number;
}

const MAX_POINTS = 120_000;

export function isPointCloud2Message(value: unknown): value is DecodedPointCloud2 {
  if (!value || typeof value !== "object") {
    return false;
  }
  const msg = value as Record<string, unknown>;
  return (
    typeof msg.width === "number" &&
    typeof msg.point_step === "number" &&
    Array.isArray(msg.fields) &&
    msg.data instanceof Uint8Array
  );
}

export function parsePointCloud2(
  message: DecodedPointCloud2,
  transformToFixed?: Transform3D,
): ParsedPointCloud | undefined {
  const xField = message.fields.find((field) => field.name === "x");
  const yField = message.fields.find((field) => field.name === "y");
  const zField = message.fields.find((field) => field.name === "z");
  if (!xField || !yField || !zField) {
    return undefined;
  }

  const pointCount = message.width * message.height;
  if (pointCount === 0) {
    return undefined;
  }

  const stride = Math.max(1, Math.ceil(pointCount / MAX_POINTS));
  const outputCount = Math.ceil(pointCount / stride);
  const points = new Float32Array(outputCount * 3);
  const data = message.data;
  let out = 0;

  for (let i = 0; i < pointCount; i += stride) {
    const base = i * message.point_step;
    const x = readFloat32(data, base + xField.offset, message.is_bigendian);
    const y = readFloat32(data, base + yField.offset, message.is_bigendian);
    const z = readFloat32(data, base + zField.offset, message.is_bigendian);

    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
      continue;
    }

    if (transformToFixed) {
      const transformed = applyTransform(transformToFixed, [x, y, z]);
      points[out++] = transformed[0];
      points[out++] = transformed[1];
      points[out++] = transformed[2];
    } else {
      points[out++] = x;
      points[out++] = y;
      points[out++] = z;
    }
  }

  return {
    frame_id: message.frame_id ?? "",
    points: points.slice(0, out),
    point_count: out / 3,
  };
}

function readFloat32(data: Uint8Array, offset: number, bigEndian: boolean): number {
  const view = new DataView(data.buffer, data.byteOffset + offset, 4);
  return view.getFloat32(0, !bigEndian);
}
