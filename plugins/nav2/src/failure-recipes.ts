import type { Nav2Snapshot } from "./types.js";

export type Nav2PanelId =
  | "nav2.amcl"
  | "nav2.costmap"
  | "nav2.global_plan"
  | "nav2.local_plan"
  | "nav2.goal"
  | "nav2.controller";

export interface FailureRecipeDefinition {
  id: string;
  label: string;
  description: string;
  symptoms: string[];
  panels: Nav2PanelId[];
}

export interface FailureRecipeMatch {
  recipe_id: string;
  label: string;
  description: string;
  matched_symptoms: string[];
  highlight_panels: Nav2PanelId[];
}

export const NAV2_FAILURE_RECIPES: FailureRecipeDefinition[] = [
  {
    id: "nav2_controller_stuck",
    label: "Nav2 controller stuck suspected",
    description: "Local plan collapses while cmd_vel drops — goal may still be active.",
    symptoms: ["local_plan_short", "cmd_vel_stalled", "goal_active"],
    panels: ["nav2.local_plan", "nav2.controller", "nav2.goal"],
  },
  {
    id: "nav2_localization_uncertainty",
    label: "Nav2 localization uncertainty suspected",
    description: "AMCL covariance grows while the local costmap is mostly unknown.",
    symptoms: ["amcl_covariance_high", "costmap_unknown_heavy"],
    panels: ["nav2.amcl", "nav2.costmap"],
  },
];

const RECIPE_MIN_MATCHES: Record<string, number> = {
  nav2_controller_stuck: 2,
  nav2_localization_uncertainty: 2,
};

const LOCAL_PLAN_SHORT_M = 0.25;
const CMD_VEL_STALL_MPS = 0.08;
const AMCL_COVARIANCE_THRESHOLD_M = 0.35;

type SymptomEvaluator = (snapshot: Nav2Snapshot) => boolean;

const SYMPTOM_CHECKS: Record<string, SymptomEvaluator> = {
  local_plan_short: (snapshot) => {
    const plan = snapshot.local_plan;
    if (!plan) {
      return false;
    }
    return plan.point_count > 1 && plan.length_m < LOCAL_PLAN_SHORT_M;
  },
  cmd_vel_stalled: (snapshot) =>
    Math.abs(snapshot.controller?.linear_x_mps ?? Number.POSITIVE_INFINITY) < CMD_VEL_STALL_MPS,
  goal_active: (snapshot) => snapshot.goal != null,
  amcl_covariance_high: (snapshot) =>
    (snapshot.amcl?.covariance_xy_m ?? 0) > AMCL_COVARIANCE_THRESHOLD_M,
  costmap_unknown_heavy: (snapshot) => {
    const costmap = snapshot.costmap;
    if (!costmap) {
      return false;
    }
    const total = costmap.occupied_cells + costmap.free_cells + costmap.unknown_cells;
    if (total === 0) {
      return false;
    }
    return costmap.unknown_cells / total > 0.35;
  },
};

export function evaluateFailureRecipes(snapshot: Nav2Snapshot): FailureRecipeMatch | null {
  let best: FailureRecipeMatch | null = null;
  let bestScore = 0;

  for (const recipe of NAV2_FAILURE_RECIPES) {
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
  panelId: Nav2PanelId,
  match: FailureRecipeMatch | null | undefined,
): boolean {
  return match?.highlight_panels.includes(panelId) ?? false;
}
