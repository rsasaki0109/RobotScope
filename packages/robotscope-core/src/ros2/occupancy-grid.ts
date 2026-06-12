import { applyTransform, type Transform3D } from "../tf/transform-math.js";

export interface ParsedOccupancyGrid {
  frame_id: string;
  width: number;
  height: number;
  resolution: number;
  origin: {
    position: [number, number, number];
    rotation: [number, number, number, number];
  };
  /** RGBA pixels, row-major with ROS map indexing (x + y * width). */
  rgba: Uint8Array;
}

function readOrientation(value: unknown): [number, number, number, number] {
  const q = value as { x?: number; y?: number; z?: number; w?: number } | undefined;
  return [q?.x ?? 0, q?.y ?? 0, q?.z ?? 0, q?.w ?? 1];
}

function cellColor(value: number): [number, number, number, number] {
  if (value < 0) {
    return [40, 44, 52, 180];
  }
  if (value > 50) {
    return [214, 61, 92, 230];
  }
  return [22, 27, 34, 160];
}

export function parseOccupancyGrid(message: unknown): ParsedOccupancyGrid | undefined {
  if (!message || typeof message !== "object") {
    return undefined;
  }

  const msg = message as {
    header?: { frame_id?: string };
    info?: {
      width?: number;
      height?: number;
      resolution?: number;
      origin?: {
        position?: { x?: number; y?: number; z?: number };
        orientation?: unknown;
      };
    };
    data?: number[];
  };

  const width = msg.info?.width ?? 0;
  const height = msg.info?.height ?? 0;
  if (width <= 0 || height <= 0) {
    return undefined;
  }

  const rgba = new Uint8Array(width * height * 4);
  const cells = msg.data ?? [];
  for (let index = 0; index < width * height; index += 1) {
    const [r, g, b, a] = cellColor(cells[index] ?? -1);
    const offset = index * 4;
    rgba[offset] = r;
    rgba[offset + 1] = g;
    rgba[offset + 2] = b;
    rgba[offset + 3] = a;
  }

  return {
    frame_id: msg.header?.frame_id ?? "map",
    width,
    height,
    resolution: msg.info?.resolution ?? 0.05,
    origin: {
      position: [
        msg.info?.origin?.position?.x ?? 0,
        msg.info?.origin?.position?.y ?? 0,
        msg.info?.origin?.position?.z ?? 0,
      ],
      rotation: readOrientation(msg.info?.origin?.orientation),
    },
    rgba,
  };
}

export function transformOccupancyGridToFixed(
  grid: ParsedOccupancyGrid,
  transformToFixed: Transform3D,
): ParsedOccupancyGrid {
  const originPosition = applyTransform(transformToFixed, grid.origin.position);
  return {
    ...grid,
    frame_id: "fixed",
    origin: {
      position: originPosition,
      rotation: grid.origin.rotation,
    },
  };
}
