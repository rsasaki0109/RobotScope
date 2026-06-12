import type { McapQueryEngine, SessionInfo } from "@robotscope/core";

import {
  extractControlView,
  extractLocalizationView,
  extractNdtView,
  extractPlanningView,
} from "./extractors.js";
import { resolveAutowareTopics } from "./profile.js";
import type { AutowareSnapshot } from "./types.js";

export async function buildAutowareSnapshot(
  engine: McapQueryEngine,
  session: SessionInfo,
  time_ns: number,
): Promise<AutowareSnapshot> {
  const topics = resolveAutowareTopics(session.topics);
  const warnings: string[] = [];

  const [localizationRaw, ndtRaw, planningRaw, lateralRaw, longitudinalRaw] =
    await Promise.all([
      topics.localization_pose
        ? engine.getRawMessageNearTime(topics.localization_pose, time_ns)
        : Promise.resolve(null),
      topics.ndt_score
        ? engine.getRawMessageNearTime(topics.ndt_score, time_ns)
        : Promise.resolve(null),
      topics.planning_trajectory
        ? engine.getRawMessageNearTime(topics.planning_trajectory, time_ns)
        : Promise.resolve(null),
      topics.control_lateral_error
        ? engine.getRawMessageNearTime(topics.control_lateral_error, time_ns)
        : Promise.resolve(null),
      topics.control_longitudinal_error
        ? engine.getRawMessageNearTime(topics.control_longitudinal_error, time_ns)
        : Promise.resolve(null),
    ]);

  const localization =
    topics.localization_pose && localizationRaw?.decoded
      ? extractLocalizationView(topics.localization_pose, localizationRaw.decoded)
      : undefined;

  if (!topics.localization_pose) {
    warnings.push("Localization pose topic not found (profile autoware.universe)");
  }

  const ndt =
    topics.ndt_score && ndtRaw?.decoded
      ? extractNdtView(topics.ndt_score, ndtRaw.decoded)
      : undefined;

  if (!topics.ndt_score) {
    warnings.push("NDT score topic not found");
  }

  const planning =
    topics.planning_trajectory && planningRaw?.decoded
      ? extractPlanningView(topics.planning_trajectory, planningRaw.decoded)
      : undefined;

  const control = extractControlView(
    topics.control_lateral_error,
    lateralRaw?.decoded,
    topics.control_longitudinal_error,
    longitudinalRaw?.decoded,
  );

  if (localization && localization.covariance_xy_m > 0.5) {
    warnings.push(`Localization covariance elevated (${localization.covariance_xy_m.toFixed(2)} m)`);
  }
  if (ndt?.warning) {
    warnings.push(`NDT score below threshold (${ndt.score.toFixed(2)} < ${ndt.threshold})`);
  }

  return {
    time_ns,
    topics,
    localization,
    ndt,
    planning,
    control,
    warnings,
  };
}
