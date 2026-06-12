export type RecipeStack = "autoware" | "nav2" | "moveit";

export interface RecipeTimelineMarker {
  time_ns: number;
  stack: RecipeStack;
  recipe_id: string;
  label: string;
}

export const RECIPE_SAMPLE_STEP_NS = 100_000_000;
