import { extractPose } from "@robotscope/core";

import type {
  AutowareControlView,
  AutowareLanelet2View,
  AutowareLocalizationView,
  AutowareNdtView,
  AutowareOccupancyMapView,
  AutowarePerceptionObjectView,
  AutowarePerceptionView,
  AutowarePlanningView,
} from "./types.js";
import { AUTOWARE_PROFILE } from "./profile.js";

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function yawFromQuaternion(x: number, y: number, z: number, w: number): number {
  const siny_cosp = 2 * (w * z + x * y);
  const cosy_cosp = 1 - 2 * (y * y + z * z);
  return (Math.atan2(siny_cosp, cosy_cosp) * 180) / Math.PI;
}

export function extractLocalizationView(
  topic: string,
  decoded: unknown,
): AutowareLocalizationView | undefined {
  const pose = extractPose(decoded);
  if (!pose) {
    return undefined;
  }

  const msg = decoded as {
    twist?: { twist?: { linear?: { x?: number }; angular?: { z?: number } } };
    pose?: { covariance?: number[] };
  };

  const covariance = msg.pose?.covariance ?? [];
  const covX = covariance[0] ?? 0;
  const covY = covariance[7] ?? 0;
  const covYaw = covariance[35] ?? 0;

  return {
    topic,
    header_frame: pose.frame_id,
    child_frame: pose.child_frame_id ?? "base_link",
    position: pose.position,
    yaw_deg: yawFromQuaternion(
      pose.rotation[0],
      pose.rotation[1],
      pose.rotation[2],
      pose.rotation[3],
    ),
    covariance_xy_m: Math.sqrt(Math.max(0, (covX + covY) / 2)),
    covariance_yaw_deg: Math.sqrt(Math.max(0, covYaw)) * (180 / Math.PI),
    linear_x_mps: msg.twist?.twist?.linear?.x ?? 0,
    angular_z_rps: msg.twist?.twist?.angular?.z ?? 0,
  };
}

export function extractNdtView(topic: string, decoded: unknown): AutowareNdtView | undefined {
  const msg = decoded as Record<string, unknown>;
  const score =
    readNumber(msg.data) ??
    readNumber(msg.score) ??
    readNumber(msg.ndt_score) ??
    readNumber((msg as { value?: number }).value);

  if (score == null) {
    return undefined;
  }

  const threshold = AUTOWARE_PROFILE.ndt_warning_threshold;
  return {
    topic,
    score,
    threshold,
    warning: score < threshold,
  };
}

export function extractPlanningView(
  topic: string,
  decoded: unknown,
): AutowarePlanningView | undefined {
  type Position = { x?: number; y?: number; z?: number };
  type PlanningPoint = {
    longitudinal_velocity_mps?: number;
    pose?: { position?: Position };
  };
  type PlanningPose = { pose?: { position?: Position } };

  const msg = decoded as {
    points?: PlanningPoint[];
    poses?: PlanningPose[];
  };

  const points =
    msg.points ??
    msg.poses?.map((entry) => ({
      pose: entry.pose,
      longitudinal_velocity_mps: undefined,
    })) ??
    [];

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
      const dx = current[0] - prev[0];
      const dy = current[1] - prev[1];
      const dz = current[2] - prev[2];
      length += Math.hypot(dx, dy, dz);
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

export function extractControlView(
  lateralTopic: string | undefined,
  lateralDecoded: unknown,
  longitudinalTopic: string | undefined,
  longitudinalDecoded: unknown,
  cmdVelTopic?: string,
  cmdVelDecoded?: unknown,
): AutowareControlView | undefined {
  const lateral = lateralTopic ? readControlError(lateralDecoded) : undefined;
  const longitudinal = longitudinalTopic ? readControlError(longitudinalDecoded) : undefined;
  const linear_x_mps = cmdVelTopic ? readCmdVelLinearX(cmdVelDecoded) : undefined;

  if (lateral == null && longitudinal == null && linear_x_mps == null) {
    return undefined;
  }

  return {
    lateral_error_topic: lateralTopic,
    longitudinal_error_topic: longitudinalTopic,
    cmd_vel_topic: cmdVelTopic,
    lateral_error_m: lateral,
    longitudinal_error_m: longitudinal,
    linear_x_mps,
  };
}

function readCmdVelLinearX(decoded: unknown): number | undefined {
  if (!decoded || typeof decoded !== "object") {
    return undefined;
  }
  const msg = decoded as {
    linear?: { x?: number };
    twist?: { linear?: { x?: number } };
  };
  return readNumber(msg.linear?.x) ?? readNumber(msg.twist?.linear?.x);
}

function readControlError(decoded: unknown): number | undefined {
  if (!decoded || typeof decoded !== "object") {
    return undefined;
  }
  const msg = decoded as Record<string, unknown>;
  return (
    readNumber(msg.data) ??
    readNumber(msg.error) ??
    readNumber(msg.lateral_error) ??
    readNumber(msg.longitudinal_error)
  );
}

export function extractLanelet2View(
  topic: string,
  decoded: unknown,
): AutowareLanelet2View | undefined {
  const msg = decoded as Record<string, unknown>;
  const raw = msg.data;
  let byte_size = 0;
  if (Array.isArray(raw)) {
    byte_size = raw.length;
  } else if (raw instanceof Uint8Array) {
    byte_size = raw.byteLength;
  }

  if (byte_size === 0) {
    return undefined;
  }

  const format_version =
    typeof msg.format_version === "string"
      ? msg.format_version
      : readNumber(msg.version) ?? readNumber(msg.format_version);

  return {
    topic,
    byte_size,
    format_version,
  };
}

export function extractOccupancyMapView(
  topic: string,
  decoded: unknown,
): AutowareOccupancyMapView | undefined {
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

const LOW_CONFIDENCE_THRESHOLD = 0.55;

export function extractPerceptionView(
  topic: string,
  decoded: unknown,
  options: { brief_spike?: boolean } = {},
): AutowarePerceptionView | undefined {
  const msg = decoded as {
    header?: { frame_id?: string };
    objects?: Array<{
      existence_probability?: number;
      label?: string;
      classification?: { label?: string };
      kinematics?: {
        pose_with_covariance?: { pose?: { position?: { x?: number; y?: number; z?: number } } };
      };
      position?: { x?: number; y?: number; z?: number };
    }>;
  };

  const rawObjects = msg.objects ?? [];
  const objects: AutowarePerceptionObjectView[] = [];

  for (const object of rawObjects) {
    const probability = readNumber(object.existence_probability) ?? 0;
    const label = object.label ?? object.classification?.label ?? "unknown";
    const position = object.position ?? object.kinematics?.pose_with_covariance?.pose?.position;
    objects.push({
      label,
      existence_probability: probability,
      position: [position?.x ?? 0, position?.y ?? 0, position?.z ?? 0],
    });
  }

  if (objects.length === 0 && rawObjects.length === 0) {
    return {
      topic,
      frame_id: msg.header?.frame_id ?? "map",
      object_count: 0,
      max_existence_probability: 0,
      low_confidence_count: 0,
      brief_spike: false,
      objects: [],
    };
  }

  const max_existence_probability = objects.reduce(
    (max, object) => Math.max(max, object.existence_probability),
    0,
  );
  const low_confidence_count = objects.filter(
    (object) => object.existence_probability < LOW_CONFIDENCE_THRESHOLD,
  ).length;

  return {
    topic,
    frame_id: msg.header?.frame_id ?? "map",
    object_count: objects.length,
    max_existence_probability,
    low_confidence_count,
    brief_spike: options.brief_spike ?? false,
    objects,
  };
}
