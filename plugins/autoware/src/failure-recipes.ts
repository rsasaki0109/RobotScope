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
  {
    id: "control_tracking_failure",
    label: "Control tracking failure suspected",
    description:
      "Lateral/longitudinal error spikes while commanded velocity drops — correlate planning output and control errors.",
    symptoms: ["lateral_error_elevated", "longitudinal_error_elevated", "command_velocity_low"],
    panels: ["autoware.control_error", "autoware.planning"],
  },
];

const RECIPE_MIN_MATCHES: Record<string, number> = {
  phantom_obstacle_stop: 2,
  control_tracking_failure: 2,
};

const LATERAL_ERROR_THRESHOLD_M = 0.15;
const LONGITUDINAL_ERROR_THRESHOLD_M = 0.12;
const LOW_COMMAND_VELOCITY_MPS = 0.08;

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
  brief_perception_object: (snapshot) =>
    snapshot.perception?.brief_spike === true ||
    (snapshot.perception?.object_count ?? 0) > 0 &&
      (snapshot.perception?.low_confidence_count ?? 0) > 0,
  lateral_error_elevated: (snapshot) =>
    Math.abs(snapshot.control?.lateral_error_m ?? 0) > LATERAL_ERROR_THRESHOLD_M,
  longitudinal_error_elevated: (snapshot) =>
    Math.abs(snapshot.control?.longitudinal_error_m ?? 0) > LONGITUDINAL_ERROR_THRESHOLD_M,
  command_velocity_low: (snapshot) => {
    const linear_x = snapshot.control?.linear_x_mps;
    if (linear_x == null) {
      return false;
    }
    const hasPlan = (snapshot.planning?.length_m ?? 0) > 0.5;
    return hasPlan && linear_x < LOW_COMMAND_VELOCITY_MPS;
  },
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
    const minMatches = RECIPE_MIN_MATCHES[recipe.id] ?? 1;
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
