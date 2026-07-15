import type { RecipeStack, RecipeTimelineMarker } from "../failure-recipes/types.js";
import { RECIPE_SAMPLE_STEP_NS } from "../failure-recipes/types.js";

export interface IncidentRange {
  id: string;
  stack: RecipeStack;
  recipe_id: string;
  label: string;
  description?: string;
  start_ns: number;
  end_ns: number;
  marker: RecipeTimelineMarker;
  sample_count: number;
}

const INCIDENT_JOIN_GAP_NS = RECIPE_SAMPLE_STEP_NS * 2;

export function incidentSlug(recipeId: string): string {
  return recipeId.replaceAll("_", "-");
}

export function groupRecipeMarkers(markers: RecipeTimelineMarker[]): IncidentRange[] {
  const sorted = [...markers].sort((a, b) => a.time_ns - b.time_ns);
  const incidents: IncidentRange[] = [];
  const activeByRecipe = new Map<string, IncidentRange>();

  for (const marker of sorted) {
    const recipeKey = `${marker.stack}:${marker.recipe_id}`;
    const previous = activeByRecipe.get(recipeKey);
    const continuesPrevious =
      previous != null && marker.time_ns - previous.end_ns <= INCIDENT_JOIN_GAP_NS;

    if (previous && continuesPrevious) {
      previous.end_ns = marker.time_ns;
      previous.sample_count += 1;
      continue;
    }

    const incident: IncidentRange = {
      id: `${marker.stack}:${marker.recipe_id}:${marker.time_ns}`,
      stack: marker.stack,
      recipe_id: marker.recipe_id,
      label: marker.label,
      description: marker.description,
      start_ns: marker.time_ns,
      end_ns: marker.time_ns,
      marker,
      sample_count: 1,
    };
    incidents.push(incident);
    activeByRecipe.set(recipeKey, incident);
  }

  return incidents;
}

export function findIncidentBySlug(
  incidents: IncidentRange[],
  requested: string | null,
): IncidentRange | undefined {
  if (!requested) {
    return undefined;
  }
  const normalized = requested.trim().toLowerCase().replaceAll("_", "-");
  return incidents.find(
    (incident) => incidentSlug(incident.recipe_id).toLowerCase() === normalized,
  );
}
