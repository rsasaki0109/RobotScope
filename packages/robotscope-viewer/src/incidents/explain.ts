import { buildAutowareSnapshot } from "@robotscope/plugin-autoware";
import { buildMoveItSnapshot } from "@robotscope/plugin-moveit";
import { buildNav2Snapshot } from "@robotscope/plugin-nav2";
import type { McapQueryEngine, SessionInfo } from "@robotscope/core";

import type { RecipeTimelineMarker } from "../failure-recipes/types.js";

export interface IncidentEvidence {
  label: string;
  observed: string;
  threshold?: string;
  source?: string;
  entity_path: string;
}

export interface IncidentExplanation {
  marker: RecipeTimelineMarker;
  facts: IncidentEvidence[];
  inference: string;
  matched_symptoms: string[];
  highlight_panels: string[];
}

function number(value: number | undefined, digits = 2): string {
  return value == null ? "unavailable" : value.toFixed(digits);
}

function fact(
  label: string,
  observed: string,
  entityPath: string,
  source?: string,
  threshold?: string,
): IncidentEvidence {
  return { label, observed, threshold, source, entity_path: entityPath };
}

async function explainAutoware(
  engine: McapQueryEngine,
  session: SessionInfo,
  marker: RecipeTimelineMarker,
): Promise<IncidentEvidence[]> {
  const snapshot = await buildAutowareSnapshot(engine, session, marker.time_ns);
  const symptoms = new Set(marker.matched_symptoms ?? snapshot.failure_recipe?.matched_symptoms ?? []);
  const facts: IncidentEvidence[] = [];

  if (symptoms.has("ndt_score_worsens")) {
    facts.push(fact("NDT score", number(snapshot.ndt?.score), "/robot/ego/localization/ndt_score", snapshot.ndt?.topic, snapshot.ndt ? `warning at ${snapshot.ndt.threshold.toFixed(2)}` : undefined));
  }
  if (symptoms.has("covariance_grows")) {
    facts.push(fact("Pose covariance XY", `${number(snapshot.localization?.covariance_xy_m)} m`, "/robot/ego/localization/pose", snapshot.localization?.topic, "> 0.35 m"));
  }
  if (symptoms.has("map_odom_stale")) {
    facts.push(fact("Map / odom context", snapshot.warnings.find((warning) => /map|lanelet/i.test(warning)) ?? "map input unavailable", "/world/map", snapshot.topics.map_vector ?? snapshot.topics.map_occupancy));
  }
  if (symptoms.has("trajectory_velocity_zero")) {
    facts.push(fact("Planned trajectory length", `${number(snapshot.planning?.length_m)} m`, "/robot/ego/planning/trajectory", snapshot.planning?.topic, "< 0.35 m with multiple points"));
  }
  if (symptoms.has("brief_perception_object")) {
    facts.push(fact("Perception objects", `${snapshot.perception?.object_count ?? 0} total · ${snapshot.perception?.low_confidence_count ?? 0} low-confidence · brief=${snapshot.perception?.brief_spike === true}`, "/robot/ego/perception/objects", snapshot.perception?.topic, "brief spike or low-confidence object"));
  }
  if (symptoms.has("lateral_error_elevated")) {
    facts.push(fact("Lateral tracking error", `${number(snapshot.control?.lateral_error_m)} m`, "/robot/ego/control/lateral_error", snapshot.control?.lateral_error_topic, "> |0.15| m"));
  }
  if (symptoms.has("longitudinal_error_elevated")) {
    facts.push(fact("Longitudinal tracking error", `${number(snapshot.control?.longitudinal_error_m)} m`, "/robot/ego/control/longitudinal_error", snapshot.control?.longitudinal_error_topic, "> |0.12| m"));
  }
  if (symptoms.has("command_velocity_low")) {
    facts.push(fact("Commanded velocity", `${number(snapshot.control?.linear_x_mps)} m/s`, "/robot/ego/control/cmd_vel", snapshot.control?.cmd_vel_topic, "< 0.08 m/s while a plan exists"));
  }

  return facts;
}

async function explainNav2(
  engine: McapQueryEngine,
  session: SessionInfo,
  marker: RecipeTimelineMarker,
): Promise<IncidentEvidence[]> {
  const snapshot = await buildNav2Snapshot(engine, session, marker.time_ns);
  const symptoms = new Set(marker.matched_symptoms ?? snapshot.failure_recipe?.matched_symptoms ?? []);
  const facts: IncidentEvidence[] = [];

  if (symptoms.has("local_plan_short")) facts.push(fact("Local plan length", `${number(snapshot.local_plan?.length_m)} m`, "/robot/ego/nav2/local_plan", snapshot.local_plan?.topic, "< 0.25 m with multiple points"));
  if (symptoms.has("cmd_vel_stalled")) facts.push(fact("Commanded velocity", `${number(snapshot.controller?.linear_x_mps)} m/s`, "/robot/ego/control/cmd_vel", snapshot.controller?.topic, "< |0.08| m/s"));
  if (symptoms.has("goal_active")) facts.push(fact("Navigation goal", snapshot.goal ? `active at (${snapshot.goal.position[0].toFixed(2)}, ${snapshot.goal.position[1].toFixed(2)})` : "unavailable", "/robot/ego/nav2/goal", snapshot.goal?.topic));
  if (symptoms.has("amcl_covariance_high")) facts.push(fact("AMCL covariance XY", `${number(snapshot.amcl?.covariance_xy_m)} m`, "/robot/ego/localization/amcl", snapshot.amcl?.topic, "> 0.35 m"));
  if (symptoms.has("costmap_unknown_heavy")) {
    const costmap = snapshot.costmap;
    const total = costmap ? costmap.occupied_cells + costmap.free_cells + costmap.unknown_cells : 0;
    const ratio = total > 0 && costmap ? costmap.unknown_cells / total : undefined;
    facts.push(fact("Unknown costmap cells", ratio == null ? "unavailable" : `${(ratio * 100).toFixed(1)}%`, "/robot/ego/nav2/costmap", costmap?.topic, "> 35%"));
  }
  return facts;
}

async function explainMoveIt(
  engine: McapQueryEngine,
  session: SessionInfo,
  marker: RecipeTimelineMarker,
): Promise<IncidentEvidence[]> {
  const snapshot = await buildMoveItSnapshot(engine, session, marker.time_ns);
  const symptoms = new Set(marker.matched_symptoms ?? snapshot.failure_recipe?.matched_symptoms ?? []);
  const facts: IncidentEvidence[] = [];

  if (symptoms.has("joint_velocity_high")) facts.push(fact("Maximum joint velocity", `${number(snapshot.joint_states?.max_velocity_rps)} rad/s`, "/robot/ego/manipulation/joint_states", snapshot.joint_states?.topic, "> 2.50 rad/s"));
  if (symptoms.has("trajectory_active")) facts.push(fact("Display trajectory", `${snapshot.trajectory?.point_count ?? 0} points · ${number(snapshot.trajectory?.duration_sec)} s`, "/robot/ego/manipulation/trajectory", snapshot.trajectory?.topic, "> 1 point"));
  if (symptoms.has("scene_has_collisions")) facts.push(fact("Collision objects", String(snapshot.planning_scene?.collision_object_count ?? 0), "/robot/ego/manipulation/planning_scene", snapshot.planning_scene?.topic, "> 0"));
  if (symptoms.has("joint_motion_idle")) facts.push(fact("Maximum joint velocity", `${number(snapshot.joint_states?.max_velocity_rps)} rad/s`, "/robot/ego/manipulation/joint_states", snapshot.joint_states?.topic, "< 0.50 rad/s"));
  return facts;
}

export async function explainIncident(
  engine: McapQueryEngine,
  session: SessionInfo,
  marker: RecipeTimelineMarker,
): Promise<IncidentExplanation> {
  const facts = marker.stack === "autoware"
    ? await explainAutoware(engine, session, marker)
    : marker.stack === "nav2"
      ? await explainNav2(engine, session, marker)
      : await explainMoveIt(engine, session, marker);

  return {
    marker,
    facts,
    inference: marker.description ?? marker.label,
    matched_symptoms: marker.matched_symptoms ?? [],
    highlight_panels: marker.highlight_panels ?? [],
  };
}

