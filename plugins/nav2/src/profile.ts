import type { TopicInfo } from "@robotscope/core";

import type { ResolvedNav2Topics } from "./types.js";

export const NAV2_PROFILE = {
  id: "nav2.default",
  version: "0.1",
  rules: {
    amcl_pose: ["/amcl_pose", "/odom"],
    global_costmap: ["/global_costmap/costmap", "/local_costmap/costmap"],
    global_plan: ["/plan", "/received_global_plan"],
    local_plan: ["/local_plan", "/transformed_global_plan"],
    goal: ["/goal_pose"],
    cmd_vel: ["/cmd_vel"],
  },
} as const;

export function resolveNav2Topics(sessionTopics: TopicInfo[]): ResolvedNav2Topics {
  const names = new Set(sessionTopics.map((topic) => topic.name));
  const pick = (candidates: readonly string[]) =>
    candidates.find((candidate) => names.has(candidate));

  return {
    amcl_pose: pick(NAV2_PROFILE.rules.amcl_pose),
    global_costmap: pick(NAV2_PROFILE.rules.global_costmap),
    global_plan: pick(NAV2_PROFILE.rules.global_plan),
    local_plan: pick(NAV2_PROFILE.rules.local_plan),
    goal: pick(NAV2_PROFILE.rules.goal),
    cmd_vel: pick(NAV2_PROFILE.rules.cmd_vel),
  };
}
