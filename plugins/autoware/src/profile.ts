import type { TopicInfo } from "@robotscope/core";

import type { ResolvedAutowareTopics } from "./types.js";

export const AUTOWARE_PROFILE = {
  id: "autoware.universe",
  version: "0.1",
  rules: {
    localization_pose: [
      "/localization/kinematic_state",
      "/localization/pose_estimator/pose_with_covariance",
    ],
    ndt_score: [
      "/localization/pose_estimator/ndt_score",
      "/localization/pose_estimator/scan_matching_score",
    ],
    planning_trajectory: [
      "/planning/scenario_planning/trajectory",
      "/planning/trajectory",
    ],
    control_lateral_error: [
      "/control/trajectory_follower/lateral_error",
      "/control/trajectory_follower/lateral/diagnostic",
    ],
    control_longitudinal_error: [
      "/control/trajectory_follower/longitudinal_error",
      "/control/trajectory_follower/longitudinal/diagnostic",
    ],
    gnss_pose: ["/sensing/gnss/pose", "/sensing/gnss/pose_with_covariance"],
    map_vector: ["/map/vector_map", "/map/lanelet2_map"],
    map_occupancy: ["/map/map", "/map/pointcloud_map", "/map/occupancy_grid"],
    map_lanelet_centerlines: ["/map/lanelet2_centerlines"],
    perception_objects: [
      "/perception/object_recognition/objects",
      "/perception/object_recognition/tracking/objects",
    ],
  },
  ndt_warning_threshold: 1.2,
} as const;

export function resolveAutowareTopics(
  sessionTopics: TopicInfo[],
): ResolvedAutowareTopics {
  const names = new Set(sessionTopics.map((topic) => topic.name));
  const pick = (candidates: readonly string[]) =>
    candidates.find((candidate) => names.has(candidate));

  return {
    localization_pose: pick(AUTOWARE_PROFILE.rules.localization_pose),
    ndt_score: pick(AUTOWARE_PROFILE.rules.ndt_score),
    planning_trajectory: pick(AUTOWARE_PROFILE.rules.planning_trajectory),
    control_lateral_error: pick(AUTOWARE_PROFILE.rules.control_lateral_error),
    control_longitudinal_error: pick(AUTOWARE_PROFILE.rules.control_longitudinal_error),
    gnss_pose: pick(AUTOWARE_PROFILE.rules.gnss_pose),
    map_vector: pick(AUTOWARE_PROFILE.rules.map_vector),
    map_occupancy: pick(AUTOWARE_PROFILE.rules.map_occupancy),
    perception_objects: pick(AUTOWARE_PROFILE.rules.perception_objects),
  };
}
