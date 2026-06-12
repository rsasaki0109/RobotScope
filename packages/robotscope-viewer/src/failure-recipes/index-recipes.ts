import { buildAutowareSnapshot } from "@robotscope/plugin-autoware";
import { buildMoveItSnapshot } from "@robotscope/plugin-moveit";
import { buildNav2Snapshot } from "@robotscope/plugin-nav2";
import type { McapQueryEngine, SessionInfo } from "@robotscope/core";

import { RECIPE_SAMPLE_STEP_NS, type RecipeTimelineMarker } from "./types.js";

const MAX_LIVE_RECIPE_MARKERS = 180;

function markersFromSnapshots(
  time_ns: number,
  autowareSnapshot: Awaited<ReturnType<typeof buildAutowareSnapshot>>,
  nav2Snapshot: Awaited<ReturnType<typeof buildNav2Snapshot>>,
  moveitSnapshot: Awaited<ReturnType<typeof buildMoveItSnapshot>>,
): RecipeTimelineMarker[] {
  const markers: RecipeTimelineMarker[] = [];

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

  return markers;
}

export async function evaluateFailureRecipesAtTime(
  engine: McapQueryEngine,
  session: SessionInfo,
  time_ns: number,
): Promise<RecipeTimelineMarker[]> {
  const [autowareSnapshot, nav2Snapshot, moveitSnapshot] = await Promise.all([
    buildAutowareSnapshot(engine, session, time_ns),
    buildNav2Snapshot(engine, session, time_ns),
    buildMoveItSnapshot(engine, session, time_ns),
  ]);

  return markersFromSnapshots(time_ns, autowareSnapshot, nav2Snapshot, moveitSnapshot);
}

export function mergeRecipeMarkers(
  existing: RecipeTimelineMarker[],
  incoming: RecipeTimelineMarker[],
): RecipeTimelineMarker[] {
  const seen = new Set(existing.map((marker) => `${marker.time_ns}:${marker.stack}:${marker.recipe_id}`));
  const merged = [...existing];

  for (const marker of incoming) {
    const key = `${marker.time_ns}:${marker.stack}:${marker.recipe_id}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    merged.push(marker);
  }

  if (merged.length <= MAX_LIVE_RECIPE_MARKERS) {
    return merged;
  }

  return merged.slice(-MAX_LIVE_RECIPE_MARKERS);
}

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

    markers.push(...markersFromSnapshots(time_ns, autowareSnapshot, nav2Snapshot, moveitSnapshot));
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
