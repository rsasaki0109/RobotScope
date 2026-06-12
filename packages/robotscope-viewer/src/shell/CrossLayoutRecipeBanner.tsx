import { activeRecipeMarkersAt } from "../failure-recipes/index-recipes.js";
import type { RecipeStack, RecipeTimelineMarker } from "../failure-recipes/types.js";
import { useViewerStore } from "../store/viewer-store";
import styles from "./CrossLayoutRecipeBanner.module.css";

const STACK_CHIP: Record<RecipeStack, string> = {
  autoware: styles.chipAutoware,
  nav2: styles.chipNav2,
  moveit: styles.chipMoveit,
};

const STACK_PREFIX: Record<RecipeStack, string> = {
  autoware: "Autoware",
  nav2: "Nav2",
  moveit: "MoveIt",
};

const STACK_LAYOUT: Record<RecipeStack, string> = {
  autoware: "autoware",
  nav2: "nav2",
  moveit: "moveit",
};

function resolveActiveRecipes(
  isLive: boolean,
  recipeMarkers: RecipeTimelineMarker[],
  liveActiveRecipes: RecipeTimelineMarker[],
  currentTimeNs: number,
): RecipeTimelineMarker[] {
  if (isLive) {
    return liveActiveRecipes;
  }
  return activeRecipeMarkersAt(recipeMarkers, currentTimeNs);
}

export function CrossLayoutRecipeBanner() {
  const session = useViewerStore((s) => s.session);
  const layoutId = useViewerStore((s) => s.layoutId);
  const setLayoutId = useViewerStore((s) => s.setLayoutId);
  const recipeMarkers = useViewerStore((s) => s.recipeMarkers);
  const liveActiveRecipes = useViewerStore((s) => s.liveActiveRecipes);
  const currentTimeNs = useViewerStore((s) => s.currentTimeNs);

  if (!session) {
    return null;
  }

  const isLive = session.source === "live";
  const active = resolveActiveRecipes(isLive, recipeMarkers, liveActiveRecipes, currentTimeNs);

  if (active.length === 0) {
    return null;
  }

  const switchLayout = (stack: RecipeStack) => {
    const next = STACK_LAYOUT[stack];
    setLayoutId(next);
    const url = new URL(window.location.href);
    url.searchParams.set("layout", next);
    window.history.replaceState({}, "", url);
  };

  return (
    <div className={styles.banner} aria-live="polite">
      <span className={styles.label}>All stacks</span>
      {isLive ? <span className={styles.liveBadge}>live</span> : null}
      <div className={styles.chips}>
        {active.map((marker) => {
          const targetLayout = STACK_LAYOUT[marker.stack];
          const isCurrentLayout = layoutId === targetLayout;
          return (
            <button
              key={`${marker.stack}-${marker.recipe_id}-${marker.time_ns}`}
              type="button"
              className={`${STACK_CHIP[marker.stack]} ${isCurrentLayout ? styles.chipActive : ""}`}
              title={`Open ${STACK_PREFIX[marker.stack]} layout`}
              onClick={() => switchLayout(marker.stack)}
            >
              {STACK_PREFIX[marker.stack]} · {marker.label}
              {isCurrentLayout ? " ✓" : ""}
            </button>
          );
        })}
      </div>
      <span className={styles.hint}>click chip → switch layout</span>
    </div>
  );
}
