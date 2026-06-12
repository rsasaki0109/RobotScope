import type { McapQueryEngine, SessionInfo } from "@robotscope/core";

import {
  extractControlView,
  extractLanelet2View,
  extractLaneletCenterlinesView,
  extractLocalizationView,
  extractNdtView,
  extractOccupancyMapView,
  extractPerceptionView,
  extractPlanningView,
} from "./extractors.js";
import { evaluateFailureRecipes } from "./failure-recipes.js";
import { resolveAutowareTopics } from "./profile.js";
import type { AutowareMapView, AutowareSnapshot } from "./types.js";

export async function buildAutowareSnapshot(
  engine: McapQueryEngine,
  session: SessionInfo,
  time_ns: number,
): Promise<AutowareSnapshot> {
  const topics = resolveAutowareTopics(session.topics);
  const warnings: string[] = [];

  const [
    localizationRaw,
    ndtRaw,
    planningRaw,
    lateralRaw,
    longitudinalRaw,
    cmdVelRaw,
    mapVectorRaw,
    mapOccupancyRaw,
    mapCenterlinesRaw,
    perceptionRaw,
    perceptionPriorRaw,
  ] = await Promise.all([
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
    topics.control_cmd_vel
      ? engine.getRawMessageNearTime(topics.control_cmd_vel, time_ns)
      : Promise.resolve(null),
    topics.map_vector
      ? engine.getRawMessageNearTime(topics.map_vector, time_ns)
      : Promise.resolve(null),
    topics.map_occupancy
      ? engine.getRawMessageNearTime(topics.map_occupancy, time_ns)
      : Promise.resolve(null),
    topics.map_lanelet_centerlines
      ? engine.getRawMessageNearTime(topics.map_lanelet_centerlines, time_ns)
      : Promise.resolve(null),
    topics.perception_objects
      ? engine.getRawMessageNearTime(topics.perception_objects, time_ns)
      : Promise.resolve(null),
    topics.perception_objects
      ? engine.getRawMessageNearTime(topics.perception_objects, Math.max(0, time_ns - 150_000_000))
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
    topics.control_cmd_vel,
    cmdVelRaw?.decoded,
  );

  const priorPerception =
    topics.perception_objects && perceptionPriorRaw?.decoded
      ? extractPerceptionView(topics.perception_objects, perceptionPriorRaw.decoded)
      : undefined;
  let perception =
    topics.perception_objects && perceptionRaw?.decoded
      ? extractPerceptionView(topics.perception_objects, perceptionRaw.decoded)
      : undefined;
  if (perception) {
    perception = {
      ...perception,
      brief_spike: perception.object_count > 0 && (priorPerception?.object_count ?? 0) === 0,
    };
  }

  if (!topics.perception_objects) {
    warnings.push("Perception objects topic not found");
  }

  const map: AutowareMapView = {
    lanelet2:
      topics.map_vector && mapVectorRaw?.decoded
        ? extractLanelet2View(topics.map_vector, mapVectorRaw.decoded)
        : undefined,
    occupancy:
      topics.map_occupancy && mapOccupancyRaw?.decoded
        ? extractOccupancyMapView(topics.map_occupancy, mapOccupancyRaw.decoded)
        : undefined,
  };

  if (map.lanelet2 && topics.map_lanelet_centerlines && mapCenterlinesRaw?.decoded) {
    const centerlines = extractLaneletCenterlinesView(mapCenterlinesRaw.decoded);
    if (centerlines) {
      map.lanelet2 = { ...map.lanelet2, centerlines };
    }
  }

  if (!topics.map_vector && !topics.map_occupancy) {
    warnings.push("Map topics not found (/map/vector_map, /map/map)");
  } else if (topics.map_vector && !map.lanelet2) {
    warnings.push("Lanelet2 vector map topic present but payload not decoded");
  }

  if (localization && localization.covariance_xy_m > 0.5) {
    warnings.push(`Localization covariance elevated (${localization.covariance_xy_m.toFixed(2)} m)`);
  }
  if (ndt?.warning) {
    warnings.push(`NDT score below threshold (${ndt.score.toFixed(2)} < ${ndt.threshold})`);
  }

  const draft: AutowareSnapshot = {
    time_ns,
    topics,
    map: map.lanelet2 || map.occupancy ? map : undefined,
    localization,
    ndt,
    planning,
    control,
    perception,
    warnings,
    failure_recipe: null,
    highlight_panels: [],
  };

  const failure_recipe = evaluateFailureRecipes(draft);

  return {
    ...draft,
    failure_recipe,
    highlight_panels: failure_recipe?.highlight_panels ?? [],
  };
}
