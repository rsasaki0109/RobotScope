import type { AutowareSnapshot } from "./types.js";

export type AutowarePanelId =
  | "autoware.map"
  | "autoware.ndt_score"
  | "autoware.localization"
  | "autoware.planning"
  | "autoware.control_error"
  | "tf_health"
  | "perception_objects";

export interface FailureRecipeDefinition {
  id: string;
  label: string;
  description: string;
  symptoms: string[];
  panels: AutowarePanelId[];
}

export interface FailureRecipeMatch {
  recipe_id: string;
  label: string;
  description: string;
  matched_symptoms: string[];
  highlight_panels: AutowarePanelId[];
}

export const AUTOWARE_FAILURE_RECIPES: FailureRecipeDefinition[] = [
  {
    id: "localization_drift",
    label: "Localization drift suspected",
    description:
      "NDT score drop and/or growing pose covariance — correlate map, NDT, localization, and TF.",
    symptoms: ["ndt_score_worsens", "covariance_grows", "map_odom_stale"],
    panels: ["autoware.map", "autoware.ndt_score", "autoware.localization", "tf_health"],
  },
  {
    id: "phantom_obstacle_stop",
    label: "Phantom obstacle stop suspected",
    description: "Planning output stalls while perception may show a brief false positive.",
    symptoms: ["trajectory_velocity_zero", "brief_perception_object"],
    panels: ["autoware.planning", "perception_objects"],
  },
];

type SymptomEvaluator = (snapshot: AutowareSnapshot) => boolean;

const SYMPTOM_CHECKS: Record<string, SymptomEvaluator> = {
  ndt_score_worsens: (snapshot) => snapshot.ndt?.warning === true,
  covariance_grows: (snapshot) =>
    (snapshot.localization?.covariance_xy_m ?? 0) > 0.35,
  map_odom_stale: (snapshot) =>
    !snapshot.topics.map_vector ||
    !snapshot.topics.map_occupancy ||
    snapshot.warnings.some((warning) => /map|lanelet/i.test(warning)),
  trajectory_velocity_zero: (snapshot) => {
    const planning = snapshot.planning;
    if (!planning) {
      return false;
    }
    return planning.point_count > 1 && planning.length_m < 0.35;
  },
  brief_perception_object: () => false,
};

export function evaluateFailureRecipes(
  snapshot: AutowareSnapshot,
): FailureRecipeMatch | null {
  let best: FailureRecipeMatch | null = null;
  let bestScore = 0;

  for (const recipe of AUTOWARE_FAILURE_RECIPES) {
    const matched_symptoms = recipe.symptoms.filter((symptom) => {
      const check = SYMPTOM_CHECKS[symptom];
      return check ? check(snapshot) : false;
    });

    if (matched_symptoms.length === 0) {
      continue;
    }

    const score = matched_symptoms.length / recipe.symptoms.length;
    const minMatches = recipe.id === "localization_drift" ? 1 : 1;
    if (matched_symptoms.length < minMatches) {
      continue;
    }

    if (score > bestScore || (score === bestScore && matched_symptoms.length > (best?.matched_symptoms.length ?? 0))) {
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
  panelId: AutowarePanelId,
  match: FailureRecipeMatch | null | undefined,
): boolean {
  return match?.highlight_panels.includes(panelId) ?? false;
}
