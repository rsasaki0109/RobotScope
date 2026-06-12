import type { McapQueryEngine, SessionInfo } from "@robotscope/core";

import {
  extractJointStateView,
  extractPlanningSceneView,
  extractTrajectoryView,
} from "./extractors.js";
import { evaluateFailureRecipes } from "./failure-recipes.js";
import { resolveMoveItTopics } from "./profile.js";
import type { MoveItSnapshot } from "./types.js";

export async function buildMoveItSnapshot(
  engine: McapQueryEngine,
  session: SessionInfo,
  time_ns: number,
): Promise<MoveItSnapshot> {
  const topics = resolveMoveItTopics(session.topics);
  const warnings: string[] = [];

  const [jointRaw, sceneRaw, trajectoryRaw] = await Promise.all([
    topics.joint_states
      ? engine.getRawMessageNearTime(topics.joint_states, time_ns)
      : Promise.resolve(null),
    topics.planning_scene
      ? engine.getRawMessageNearTime(topics.planning_scene, time_ns)
      : Promise.resolve(null),
    topics.display_trajectory
      ? engine.getRawMessageNearTime(topics.display_trajectory, time_ns)
      : Promise.resolve(null),
  ]);

  const joint_states =
    topics.joint_states && jointRaw?.decoded
      ? extractJointStateView(topics.joint_states, jointRaw.decoded)
      : undefined;
  const planning_scene =
    topics.planning_scene && sceneRaw?.decoded
      ? extractPlanningSceneView(topics.planning_scene, sceneRaw.decoded)
      : undefined;
  const trajectory =
    topics.display_trajectory && trajectoryRaw?.decoded
      ? extractTrajectoryView(topics.display_trajectory, trajectoryRaw.decoded)
      : undefined;

  if (!topics.joint_states) {
    warnings.push("Joint states topic not found (profile moveit.default)");
  }
  if (!topics.planning_scene) {
    warnings.push("Planning scene topic not found");
  }
  if (joint_states && joint_states.max_velocity_rps > 2.5) {
    warnings.push(`High joint velocity (${joint_states.max_velocity_rps.toFixed(2)} rad/s)`);
  }

  const draft: MoveItSnapshot = {
    time_ns,
    topics,
    joint_states,
    planning_scene,
    trajectory,
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
