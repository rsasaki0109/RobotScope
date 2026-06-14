import type { SessionInfo, TopicInfo } from "@robotscope/core";

import type { NumericFieldCandidate } from "./types.js";

interface FieldRule {
  schema: string;
  fields: Array<{ path: string; label: string }>;
}

const FIELD_RULES: FieldRule[] = [
  {
    schema: "std_msgs/Float32",
    fields: [{ path: "data", label: "data" }],
  },
  {
    schema: "std_msgs/Float64",
    fields: [{ path: "data", label: "data" }],
  },
  {
    schema: "std_msgs/Int32",
    fields: [{ path: "data", label: "data" }],
  },
  {
    schema: "std_msgs/UInt32",
    fields: [{ path: "data", label: "data" }],
  },
  {
    schema: "geometry_msgs/Twist",
    fields: [
      { path: "linear.x", label: "linear x" },
      { path: "linear.y", label: "linear y" },
      { path: "linear.z", label: "linear z" },
      { path: "angular.x", label: "angular x" },
      { path: "angular.y", label: "angular y" },
      { path: "angular.z", label: "angular z" },
    ],
  },
  {
    schema: "geometry_msgs/TwistStamped",
    fields: [
      { path: "twist.linear.x", label: "linear x" },
      { path: "twist.linear.y", label: "linear y" },
      { path: "twist.angular.z", label: "angular z" },
    ],
  },
  {
    schema: "geometry_msgs/PoseStamped",
    fields: [
      { path: "pose.position.x", label: "position x" },
      { path: "pose.position.y", label: "position y" },
      { path: "pose.position.z", label: "position z" },
      { path: "pose.orientation.w", label: "orientation w" },
    ],
  },
  {
    schema: "geometry_msgs/PoseWithCovarianceStamped",
    fields: [
      { path: "pose.pose.position.x", label: "position x" },
      { path: "pose.pose.position.y", label: "position y" },
      { path: "pose.covariance[0]", label: "covariance x" },
      { path: "pose.covariance[7]", label: "covariance y" },
      { path: "pose.covariance[35]", label: "covariance yaw" },
    ],
  },
  {
    schema: "nav_msgs/Odometry",
    fields: [
      { path: "pose.pose.position.x", label: "position x" },
      { path: "pose.pose.position.y", label: "position y" },
      { path: "twist.twist.linear.x", label: "linear x" },
      { path: "twist.twist.angular.z", label: "angular z" },
    ],
  },
  {
    schema: "sensor_msgs/JointState",
    fields: [
      { path: "position[0]", label: "position[0]" },
      { path: "velocity[0]", label: "velocity[0]" },
      { path: "effort[0]", label: "effort[0]" },
    ],
  },
];

const PREFERRED_KEYS = [
  "/localization/pose_estimator/ndt_score|data",
  "/control/trajectory_follower/lateral_error|data",
  "/control/trajectory_follower/longitudinal_error|data",
  "/cmd_vel|linear.x",
  "/localization/kinematic_state|pose.pose.position.x",
  "/amcl_pose|pose.pose.position.x",
  "/joint_states|velocity[0]",
];

function normalizeSchema(schema: string): string {
  return schema.replace(/\/msg\//, "/").replace(/^package:\/\//, "");
}

function makeCandidate(
  topic: TopicInfo,
  fieldPath: string,
  fieldLabel: string,
): NumericFieldCandidate {
  return {
    key: `${topic.name}|${fieldPath}`,
    topic: topic.name,
    fieldPath,
    label: `${topic.name} · ${fieldLabel}`,
    schema: topic.schema,
  };
}

function schemaRules(topic: TopicInfo): NumericFieldCandidate[] {
  const normalized = normalizeSchema(topic.schema);
  const rule = FIELD_RULES.find((candidate) => candidate.schema === normalized);
  if (!rule) {
    return [];
  }
  return rule.fields.map((field) => makeCandidate(topic, field.path, field.label));
}

function topicFallback(topic: TopicInfo): NumericFieldCandidate[] {
  if (
    topic.name.includes("score") ||
    topic.name.includes("error") ||
    topic.name.endsWith("/temperature") ||
    topic.name.endsWith("/battery")
  ) {
    return [makeCandidate(topic, "data", "data")];
  }
  return [];
}

export function listNumericFieldCandidates(session: SessionInfo | null): NumericFieldCandidate[] {
  if (!session) {
    return [];
  }

  const candidates = new Map<string, NumericFieldCandidate>();
  for (const topic of session.topics) {
    for (const candidate of [...schemaRules(topic), ...topicFallback(topic)]) {
      candidates.set(candidate.key, candidate);
    }
  }

  return [...candidates.values()].sort((a, b) => {
    const preferredA = PREFERRED_KEYS.indexOf(a.key);
    const preferredB = PREFERRED_KEYS.indexOf(b.key);
    if (preferredA !== -1 || preferredB !== -1) {
      return (preferredA === -1 ? Number.MAX_SAFE_INTEGER : preferredA) -
        (preferredB === -1 ? Number.MAX_SAFE_INTEGER : preferredB);
    }
    return a.label.localeCompare(b.label);
  });
}

export function pickDefaultNumericField(
  candidates: NumericFieldCandidate[],
): NumericFieldCandidate | null {
  return candidates[0] ?? null;
}
