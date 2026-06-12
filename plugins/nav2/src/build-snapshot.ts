import type { McapQueryEngine, SessionInfo } from "@robotscope/core";

import {
  extractAmclView,
  extractControllerView,
  extractCostmapView,
  extractGoalView,
  extractPlanView,
} from "./extractors.js";
import { resolveNav2Topics } from "./profile.js";
import type { Nav2Snapshot } from "./types.js";

export async function buildNav2Snapshot(
  engine: McapQueryEngine,
  session: SessionInfo,
  time_ns: number,
): Promise<Nav2Snapshot> {
  const topics = resolveNav2Topics(session.topics);
  const warnings: string[] = [];

  const [amclRaw, costmapRaw, globalPlanRaw, localPlanRaw, goalRaw, cmdVelRaw] =
    await Promise.all([
      topics.amcl_pose
        ? engine.getRawMessageNearTime(topics.amcl_pose, time_ns)
        : Promise.resolve(null),
      topics.global_costmap
        ? engine.getRawMessageNearTime(topics.global_costmap, time_ns)
        : Promise.resolve(null),
      topics.global_plan
        ? engine.getRawMessageNearTime(topics.global_plan, time_ns)
        : Promise.resolve(null),
      topics.local_plan
        ? engine.getRawMessageNearTime(topics.local_plan, time_ns)
        : Promise.resolve(null),
      topics.goal
        ? engine.getRawMessageNearTime(topics.goal, time_ns)
        : Promise.resolve(null),
      topics.cmd_vel
        ? engine.getRawMessageNearTime(topics.cmd_vel, time_ns)
        : Promise.resolve(null),
    ]);

  const amcl =
    topics.amcl_pose && amclRaw?.decoded
      ? extractAmclView(topics.amcl_pose, amclRaw.decoded)
      : undefined;
  const costmap =
    topics.global_costmap && costmapRaw?.decoded
      ? extractCostmapView(topics.global_costmap, costmapRaw.decoded)
      : undefined;
  const global_plan =
    topics.global_plan && globalPlanRaw?.decoded
      ? extractPlanView(topics.global_plan, globalPlanRaw.decoded)
      : undefined;
  const local_plan =
    topics.local_plan && localPlanRaw?.decoded
      ? extractPlanView(topics.local_plan, localPlanRaw.decoded)
      : undefined;
  const goal =
    topics.goal && goalRaw?.decoded
      ? extractGoalView(topics.goal, goalRaw.decoded)
      : undefined;
  const controller =
    topics.cmd_vel && cmdVelRaw?.decoded
      ? extractControllerView(topics.cmd_vel, cmdVelRaw.decoded)
      : undefined;

  if (!topics.amcl_pose) {
    warnings.push("AMCL pose topic not found (profile nav2.default)");
  }
  if (!topics.global_costmap) {
    warnings.push("Costmap topic not found");
  }
  if (costmap && costmap.unknown_cells > costmap.free_cells + costmap.occupied_cells) {
    warnings.push("Costmap has high unknown cell ratio");
  }
  if (amcl && amcl.covariance_xy_m > 0.35) {
    warnings.push(`AMCL covariance elevated (${amcl.covariance_xy_m.toFixed(2)} m)`);
  }

  return {
    time_ns,
    topics,
    amcl,
    costmap,
    global_plan,
    local_plan,
    goal,
    controller,
    warnings,
  };
}
