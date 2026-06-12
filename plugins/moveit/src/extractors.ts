import type {
  MoveItJointStateView,
  MoveItPlanningSceneView,
  MoveItTrajectoryView,
} from "./types.js";

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function extractJointStateView(
  topic: string,
  decoded: unknown,
): MoveItJointStateView | undefined {
  const msg = decoded as {
    name?: string[];
    position?: number[];
    velocity?: number[];
  };

  const names = msg.name ?? [];
  const positions = msg.position ?? [];
  if (names.length === 0 && positions.length === 0) {
    return undefined;
  }

  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const value of positions) {
    if (!Number.isFinite(value)) {
      continue;
    }
    min = Math.min(min, value);
    max = Math.max(max, value);
  }

  let maxVelocity = 0;
  for (const value of msg.velocity ?? []) {
    if (Number.isFinite(value)) {
      maxVelocity = Math.max(maxVelocity, Math.abs(value));
    }
  }

  return {
    topic,
    joint_count: Math.max(names.length, positions.length),
    position_min: Number.isFinite(min) ? min : 0,
    position_max: Number.isFinite(max) ? max : 0,
    max_velocity_rps: maxVelocity,
    sample_joints: names.slice(0, 4),
  };
}

export function extractPlanningSceneView(
  topic: string,
  decoded: unknown,
): MoveItPlanningSceneView | undefined {
  const msg = decoded as {
    name?: string;
    robot_state?: { joint_state?: { name?: string[] } };
    world?: { collision_objects?: unknown[] };
    attached_collision_objects?: unknown[];
  };

  const robotJoints =
    msg.robot_state?.joint_state?.name?.length ??
    readNumber((msg as { robot_joint_count?: number }).robot_joint_count) ??
    0;
  const collisionObjects =
    msg.world?.collision_objects?.length ??
    (msg as { collision_objects?: unknown[] }).collision_objects?.length ??
    0;
  const attached = msg.attached_collision_objects?.length ?? 0;

  if (robotJoints === 0 && collisionObjects === 0 && attached === 0 && !msg.name) {
    return undefined;
  }

  return {
    topic,
    scene_name: msg.name,
    robot_joint_count: robotJoints,
    collision_object_count: collisionObjects,
    attached_object_count: attached,
  };
}

export function extractTrajectoryView(
  topic: string,
  decoded: unknown,
): MoveItTrajectoryView | undefined {
  const msg = decoded as {
    joint_names?: string[];
    points?: Array<{
      time_from_start?: { sec?: number; nanosec?: number; nsec?: number };
    }>;
    poses?: unknown[];
  };

  if (msg.points?.length) {
    const last = msg.points[msg.points.length - 1]?.time_from_start;
    const sec = readNumber(last?.sec) ?? 0;
    const nsec = readNumber(last?.nanosec ?? last?.nsec) ?? 0;
    return {
      topic,
      point_count: msg.points.length,
      joint_names: msg.joint_names ?? [],
      duration_sec: sec + nsec / 1e9,
    };
  }

  if (msg.poses?.length) {
    return {
      topic,
      point_count: msg.poses.length,
      joint_names: msg.joint_names ?? [],
      duration_sec: 0,
    };
  }

  return undefined;
}
