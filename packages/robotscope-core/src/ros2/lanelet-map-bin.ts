import { parseBoostLaneletMap } from "./lanelet-boost-bin.js";

const DEMO_MAGIC = [0x52, 0x4c, 0x32, 0x44]; // "RL2D"

export interface ParsedLaneletBoundary {
  id: number;
  boundary: Array<[number, number, number]>;
}

export interface ParsedLaneletMapBin {
  format: "demo-rl2d" | "boost-lanelet2" | "unknown";
  lanelets: ParsedLaneletBoundary[];
  lanelet_count: number;
  boundary_point_count: number;
  point_count?: number;
  linestring_count?: number;
}

function toByteArray(raw: unknown): Uint8Array | null {
  if (raw instanceof Uint8Array) {
    return raw;
  }
  if (Array.isArray(raw)) {
    return Uint8Array.from(raw.map((value) => Number(value) & 0xff));
  }
  return null;
}

function readDemoRl2d(bytes: Uint8Array): ParsedLaneletMapBin | null {
  if (bytes.byteLength < 7) {
    return null;
  }
  for (let i = 0; i < DEMO_MAGIC.length; i += 1) {
    if (bytes[i] !== DEMO_MAGIC[i]) {
      return null;
    }
  }
  if (bytes[4] !== 1) {
    return null;
  }

  const laneletCount = bytes[5]! | (bytes[6]! << 8);
  let offset = 7;
  const lanelets: ParsedLaneletBoundary[] = [];
  let boundaryPointCount = 0;

  for (let id = 0; id < laneletCount; id += 1) {
    if (offset >= bytes.byteLength) {
      return null;
    }
    const pointCount = bytes[offset]!;
    offset += 1;
    const boundary: Array<[number, number, number]> = [];

    for (let pointIndex = 0; pointIndex < pointCount; pointIndex += 1) {
      if (offset + 8 > bytes.byteLength) {
        return null;
      }
      const view = new DataView(bytes.buffer, bytes.byteOffset + offset, 8);
      const x = view.getFloat32(0, true);
      const y = view.getFloat32(4, true);
      boundary.push([x, y, 0.02]);
      offset += 8;
    }

    if (boundary.length >= 3) {
      lanelets.push({ id, boundary });
      boundaryPointCount += boundary.length;
    }
  }

  return {
    format: "demo-rl2d",
    lanelets,
    lanelet_count: lanelets.length,
    boundary_point_count: boundaryPointCount,
  };
}

/** Parse LaneletMapBin payloads. Supports RobotScope demo RL2D v1 and lanelet2_io Boost bins (alpha). */
export function parseLaneletMapBin(decoded: unknown): ParsedLaneletMapBin | null {
  const msg = decoded as { data?: unknown; format_version?: string };
  const bytes = toByteArray(msg.data);
  if (!bytes || bytes.byteLength === 0) {
    return null;
  }

  const demo = readDemoRl2d(bytes);
  if (demo) {
    return demo;
  }

  const boost = parseBoostLaneletMap(bytes);
  if (boost) {
    return {
      format: "boost-lanelet2",
      lanelets: boost.lanelets.map((lanelet) => ({
        id: lanelet.id,
        boundary: lanelet.boundary,
      })),
      lanelet_count: boost.lanelet_count,
      boundary_point_count: boost.boundary_point_count,
      point_count: boost.point_count,
      linestring_count: boost.linestring_count,
    };
  }

  return {
    format: "unknown",
    lanelets: [],
    lanelet_count: 0,
    boundary_point_count: 0,
  };
}

export function isDemoLaneletMapFormat(decoded: unknown): boolean {
  return parseLaneletMapBin(decoded)?.format === "demo-rl2d";
}

export function isBoostLaneletMapFormat(decoded: unknown): boolean {
  return parseLaneletMapBin(decoded)?.format === "boost-lanelet2";
}
