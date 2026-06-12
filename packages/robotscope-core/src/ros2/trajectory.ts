import { applyTransform, type Transform3D } from "../tf/transform-math.js";

export interface ParsedTrajectory {
  frame_id: string;
  points: Float32Array;
  point_count: number;
}

export function extractTrajectory(message: unknown): ParsedTrajectory | undefined {
  if (!message || typeof message !== "object") {
    return undefined;
  }

  const msg = message as Record<string, unknown>;
  const header = msg.header as { frame_id?: string } | undefined;
  const frame_id = header?.frame_id ?? "map";

  const pointsList =
    (Array.isArray(msg.points) ? msg.points : undefined) ??
    (Array.isArray(msg.poses)
      ? msg.poses.map((entry) => (entry as { pose?: { position?: Vec3 } }).pose?.position)
      : undefined);

  if (!pointsList || pointsList.length === 0) {
    return undefined;
  }

  const points = new Float32Array(pointsList.length * 3);
  let count = 0;

  for (const point of pointsList) {
    const vec = point as Vec3 | undefined;
    if (!vec) {
      continue;
    }
    points[count++] = vec.x ?? 0;
    points[count++] = vec.y ?? 0;
    points[count++] = vec.z ?? 0;
  }

  return {
    frame_id,
    points: points.slice(0, count),
    point_count: count / 3,
  };
}

export function transformTrajectoryToFixed(
  trajectory: ParsedTrajectory,
  transformToFixed: Transform3D,
): ParsedTrajectory {
  const points = new Float32Array(trajectory.points.length);
  for (let i = 0; i < trajectory.point_count; i += 1) {
    const transformed = applyTransform(transformToFixed, [
      trajectory.points[i * 3]!,
      trajectory.points[i * 3 + 1]!,
      trajectory.points[i * 3 + 2]!,
    ]);
    points[i * 3] = transformed[0];
    points[i * 3 + 1] = transformed[1];
    points[i * 3 + 2] = transformed[2];
  }
  return {
    frame_id: "fixed",
    points,
    point_count: trajectory.point_count,
  };
}

interface Vec3 {
  x?: number;
  y?: number;
  z?: number;
}
