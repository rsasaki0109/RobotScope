import { buildAutowareSnapshot } from "@robotscope/plugin-autoware";
import { buildMoveItSnapshot } from "@robotscope/plugin-moveit";
import { buildNav2Snapshot } from "@robotscope/plugin-nav2";
import type { McapQueryEngine, SessionInfo } from "@robotscope/core";

import { RECIPE_SAMPLE_STEP_NS, type RecipeTimelineMarker } from "./types.js";

export async function indexFailureRecipeMarkers(
  engine: McapQueryEngine,
  session: SessionInfo,
  onProgress?: (message: string) => void,
): Promise<RecipeTimelineMarker[]> {
  const start = session.start_ns;
  const end = session.end_ns;
  const markers: RecipeTimelineMarker[] = [];

  for (let time_ns = start; time_ns <= end; time_ns += RECIPE_SAMPLE_STEP_NS) {
    onProgress?.(
      `Indexing failure recipes (${Math.round(((time_ns - start) / Math.max(end - start, 1)) * 100)}%)`,
    );

    const [autowareSnapshot, nav2Snapshot, moveitSnapshot] = await Promise.all([
      buildAutowareSnapshot(engine, session, time_ns),
      buildNav2Snapshot(engine, session, time_ns),
      buildMoveItSnapshot(engine, session, time_ns),
    ]);

    if (autowareSnapshot.failure_recipe) {
      markers.push({
        time_ns,
        stack: "autoware",
        recipe_id: autowareSnapshot.failure_recipe.recipe_id,
        label: autowareSnapshot.failure_recipe.label,
      });
    }
    if (nav2Snapshot.failure_recipe) {
      markers.push({
        time_ns,
        stack: "nav2",
        recipe_id: nav2Snapshot.failure_recipe.recipe_id,
        label: nav2Snapshot.failure_recipe.label,
      });
    }
    if (moveitSnapshot.failure_recipe) {
      markers.push({
        time_ns,
        stack: "moveit",
        recipe_id: moveitSnapshot.failure_recipe.recipe_id,
        label: moveitSnapshot.failure_recipe.label,
      });
    }
  }

  return markers;
}

export function activeRecipeMarkersAt(
  markers: RecipeTimelineMarker[],
  time_ns: number,
): RecipeTimelineMarker[] {
  const bucket = Math.round(time_ns / RECIPE_SAMPLE_STEP_NS) * RECIPE_SAMPLE_STEP_NS;
  const seen = new Set<string>();
  const active: RecipeTimelineMarker[] = [];

  for (const marker of markers) {
    if (marker.time_ns !== bucket) {
      continue;
    }
    const key = `${marker.stack}:${marker.recipe_id}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    active.push(marker);
  }

  return active;
}
