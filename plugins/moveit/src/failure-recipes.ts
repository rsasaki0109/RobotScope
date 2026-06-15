import type { MoveItSnapshot } from "./types.js";

export type MoveItPanelId =
  | "moveit.joint_states"
  | "moveit.joint_detail"
  | "moveit.planning_scene"
  | "moveit.trajectory";

export interface FailureRecipeDefinition {
  id: string;
  label: string;
  description: string;
  symptoms: string[];
  panels: MoveItPanelId[];
}

export interface FailureRecipeMatch {
  recipe_id: string;
  label: string;
  description: string;
  matched_symptoms: string[];
  highlight_panels: MoveItPanelId[];
}

export const MOVEIT_FAILURE_RECIPES: FailureRecipeDefinition[] = [
  {
    id: "moveit_joint_overspeed",
    label: "MoveIt joint overspeed suspected",
    description: "Joint velocity spikes while a display trajectory is present.",
    symptoms: ["joint_velocity_high", "trajectory_active"],
    panels: ["moveit.joint_states", "moveit.joint_detail", "moveit.trajectory"],
  },
  {
    id: "moveit_scene_collision",
    label: "MoveIt scene collision suspected",
    description: "Collision objects in the planning scene while motion stays idle.",
    symptoms: ["scene_has_collisions", "joint_motion_idle"],
    panels: ["moveit.planning_scene", "moveit.joint_states"],
  },
];

const RECIPE_MIN_MATCHES: Record<string, number> = {
  moveit_joint_overspeed: 2,
  moveit_scene_collision: 2,
};

export const JOINT_VELOCITY_THRESHOLD_RPS = 2.5;
const JOINT_IDLE_THRESHOLD_RPS = 0.5;

type SymptomEvaluator = (snapshot: MoveItSnapshot) => boolean;

const SYMPTOM_CHECKS: Record<string, SymptomEvaluator> = {
  joint_velocity_high: (snapshot) =>
    (snapshot.joint_states?.max_velocity_rps ?? 0) > JOINT_VELOCITY_THRESHOLD_RPS,
  trajectory_active: (snapshot) => (snapshot.trajectory?.point_count ?? 0) > 1,
  scene_has_collisions: (snapshot) =>
    (snapshot.planning_scene?.collision_object_count ?? 0) > 0,
  joint_motion_idle: (snapshot) =>
    (snapshot.joint_states?.max_velocity_rps ?? Number.POSITIVE_INFINITY) <
    JOINT_IDLE_THRESHOLD_RPS,
};

export function evaluateFailureRecipes(snapshot: MoveItSnapshot): FailureRecipeMatch | null {
  let best: FailureRecipeMatch | null = null;
  let bestScore = 0;

  for (const recipe of MOVEIT_FAILURE_RECIPES) {
    const matched_symptoms = recipe.symptoms.filter((symptom) => {
      const check = SYMPTOM_CHECKS[symptom];
      return check ? check(snapshot) : false;
    });

    if (matched_symptoms.length === 0) {
      continue;
    }

    const minMatches = RECIPE_MIN_MATCHES[recipe.id] ?? 1;
    if (matched_symptoms.length < minMatches) {
      continue;
    }

    const score = matched_symptoms.length / recipe.symptoms.length;
    if (
      score > bestScore ||
      (score === bestScore && matched_symptoms.length > (best?.matched_symptoms.length ?? 0))
    ) {
      bestScore = score;
      best = {
        recipe_id: recipe.id,
        label: recipe.label,
        description: recipe.description,
        matched_symptoms,
        highlight_panels: recipe.panels,
      };
    }
  }

  return best;
}

export function isPanelHighlighted(
  panelId: MoveItPanelId,
  match: FailureRecipeMatch | null | undefined,
): boolean {
  return match?.highlight_panels.includes(panelId) ?? false;
}
