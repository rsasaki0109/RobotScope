import type { TopicInfo } from "@robotscope/core";

import type { ResolvedMoveItTopics } from "./types.js";

export const MOVEIT_PROFILE = {
  id: "moveit.default",
  version: "0.1",
  rules: {
    joint_states: ["/joint_states"],
    planning_scene: ["/monitored_planning_scene", "/planning_scene"],
    display_trajectory: ["/display_planned_path", "/trajectory_execution/display_planned_path"],
  },
} as const;

export function resolveMoveItTopics(sessionTopics: TopicInfo[]): ResolvedMoveItTopics {
  const names = new Set(sessionTopics.map((topic) => topic.name));
  const pick = (candidates: readonly string[]) =>
    candidates.find((candidate) => names.has(candidate));

  return {
    joint_states: pick(MOVEIT_PROFILE.rules.joint_states),
    planning_scene: pick(MOVEIT_PROFILE.rules.planning_scene),
    display_trajectory: pick(MOVEIT_PROFILE.rules.display_trajectory),
  };
}
