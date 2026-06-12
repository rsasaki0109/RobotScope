import { applyTransform, multiplyQuaternions, type Transform3D } from "../tf/transform-math.js";

export interface ParsedPose {
  frame_id: string;
  child_frame_id?: string;
  position: [number, number, number];
  rotation: [number, number, number, number];
}

export function extractPose(message: unknown): ParsedPose | undefined {
  if (!message || typeof message !== "object") {
    return undefined;
  }

  const msg = message as Record<string, unknown>;
  const header = msg.header as { frame_id?: string } | undefined;

  if (msg.pose && header && typeof msg.pose === "object" && "pose" in msg.pose && !msg.child_frame_id) {
    const poseWithCov = msg.pose as {
      pose?: { position?: Vec3; orientation?: Quat };
    };
    const pose = poseWithCov.pose;
    const position = readVec3(pose?.position);
    const rotation = readQuat(pose?.orientation);
    if (position && rotation) {
      return {
        frame_id: header.frame_id ?? "map",
        position,
        rotation,
      };
    }
  }

  if (typeof msg.child_frame_id === "string" && msg.pose && typeof msg.pose === "object") {
    const poseWithCov = msg.pose as {
      pose?: { position?: Vec3; orientation?: Quat };
    };
    const pose = poseWithCov.pose;
    const position = readVec3(pose?.position);
    const rotation = readQuat(pose?.orientation);
    if (!position || !rotation) {
      return undefined;
    }
    return {
      frame_id: header?.frame_id ?? "odom",
      child_frame_id: msg.child_frame_id,
      position,
      rotation,
    };
  }

  if (msg.pose && header) {
    const pose = msg.pose as { position?: Vec3; orientation?: Quat };
    const position = readVec3(pose.position);
    const rotation = readQuat(pose.orientation);
    if (!position || !rotation) {
      return undefined;
    }
    return {
      frame_id: header.frame_id ?? "map",
      position,
      rotation,
    };
  }

  return undefined;
}

export function transformPoseToFixed(
  pose: ParsedPose,
  transformToFixed: Transform3D,
): ParsedPose {
  return {
    ...pose,
    frame_id: "fixed",
    position: applyTransform(transformToFixed, pose.position),
    rotation: multiplyQuaternions(transformToFixed.rotation, pose.rotation),
  };
}

interface Vec3 {
  x?: number;
  y?: number;
  z?: number;
}

interface Quat {
  x?: number;
  y?: number;
  z?: number;
  w?: number;
}

function readVec3(value?: Vec3): [number, number, number] | undefined {
  if (!value) {
    return undefined;
  }
  const { x = 0, y = 0, z = 0 } = value;
  return [x, y, z];
}

function readQuat(value?: Quat): [number, number, number, number] | undefined {
  if (!value) {
    return undefined;
  }
  const { x = 0, y = 0, z = 0, w = 1 } = value;
  return [x, y, z, w];
}
