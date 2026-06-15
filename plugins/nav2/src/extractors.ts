import { extractPose } from "@robotscope/core";

import type {
  Nav2AmclView,
  Nav2ControllerView,
  Nav2CostmapView,
  Nav2GoalView,
  Nav2PlanView,
} from "./types.js";

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function yawFromQuaternion(x: number, y: number, z: number, w: number): number {
  const siny_cosp = 2 * (w * z + x * y);
  const cosy_cosp = 1 - 2 * (y * y + z * z);
  return (Math.atan2(siny_cosp, cosy_cosp) * 180) / Math.PI;
}

export function extractAmclView(topic: string, decoded: unknown): Nav2AmclView | undefined {
  const pose = extractPose(decoded);
  if (!pose) {
    return undefined;
  }

  const msg = decoded as {
    pose?: { covariance?: number[]; pose?: { position?: unknown } };
  };
  const covariance = msg.pose?.covariance ?? [];
  const covX = covariance[0] ?? 0;
  const covY = covariance[7] ?? 0;

  return {
    topic,
    frame_id: pose.frame_id,
    position: pose.position,
    yaw_deg: yawFromQuaternion(
      pose.rotation[0],
      pose.rotation[1],
      pose.rotation[2],
      pose.rotation[3],
    ),
    covariance_xy_m: Math.sqrt(Math.max(0, (covX + covY) / 2)),
  };
}

export function extractCostmapView(topic: string, decoded: unknown): Nav2CostmapView | undefined {
  const msg = decoded as {
    header?: { frame_id?: string };
    info?: {
      width?: number;
      height?: number;
      resolution?: number;
      origin?: { position?: { x?: number; y?: number } };
    };
    data?: number[];
  };

  const width = msg.info?.width ?? 0;
  const height = msg.info?.height ?? 0;
  if (width <= 0 || height <= 0) {
    return undefined;
  }

  const cells = msg.data ?? [];
  let occupied = 0;
  let free = 0;
  let unknown = 0;
  for (const cell of cells) {
    if (cell < 0) {
      unknown += 1;
    } else if (cell > 50) {
      occupied += 1;
    } else {
      free += 1;
    }
  }

  return {
    topic,
    frame_id: msg.header?.frame_id ?? "map",
    width,
    height,
    resolution_m: msg.info?.resolution ?? 0,
    origin_xy: [msg.info?.origin?.position?.x ?? 0, msg.info?.origin?.position?.y ?? 0],
    occupied_cells: occupied,
    free_cells: free,
    unknown_cells: unknown,
    cells,
  };
}

export function extractPlanView(topic: string, decoded: unknown): Nav2PlanView | undefined {
  type Position = { x?: number; y?: number; z?: number };
  type PlanPoint = { pose?: { position?: Position } };

  const msg = decoded as {
    points?: PlanPoint[];
    poses?: PlanPoint[];
  };

  const points = msg.points ?? msg.poses ?? [];
  if (points.length === 0) {
    return undefined;
  }

  let length = 0;
  let prev: [number, number, number] | undefined;

  for (const point of points) {
    const position = point.pose?.position;
    if (!position) {
      continue;
    }
    const current: [number, number, number] = [
      position.x ?? 0,
      position.y ?? 0,
      position.z ?? 0,
    ];
    if (prev) {
      length += Math.hypot(current[0] - prev[0], current[1] - prev[1], current[2] - prev[2]);
    }
    prev = current;
  }

  const last = points[points.length - 1]?.pose?.position;
  return {
    topic,
    point_count: points.length,
    length_m: length,
    end_point: [last?.x ?? 0, last?.y ?? 0, last?.z ?? 0],
  };
}

export function extractGoalView(topic: string, decoded: unknown): Nav2GoalView | undefined {
  const pose = extractPose(decoded);
  if (!pose) {
    return undefined;
  }

  return {
    topic,
    frame_id: pose.frame_id,
    position: pose.position,
    yaw_deg: yawFromQuaternion(
      pose.rotation[0],
      pose.rotation[1],
      pose.rotation[2],
      pose.rotation[3],
    ),
  };
}

export function extractControllerView(topic: string, decoded: unknown): Nav2ControllerView | undefined {
  const msg = decoded as {
    linear?: { x?: number; y?: number };
    angular?: { z?: number };
    twist?: { linear?: { x?: number; y?: number }; angular?: { z?: number } };
  };

  const linear = msg.linear ?? msg.twist?.linear;
  const angular = msg.angular ?? msg.twist?.angular;
  const linear_x = readNumber(linear?.x);
  const linear_y = readNumber(linear?.y);
  const angular_z = readNumber(angular?.z);

  if (linear_x == null && linear_y == null && angular_z == null) {
    return undefined;
  }

  return {
    topic,
    linear_x_mps: linear_x ?? 0,
    linear_y_mps: linear_y ?? 0,
    angular_z_rps: angular_z ?? 0,
  };
}
