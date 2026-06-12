import { activeRecipeMarkersAt } from "../failure-recipes/index-recipes.js";
import type { RecipeStack, RecipeTimelineMarker } from "../failure-recipes/types.js";
import styles from "./FailureRecipeStrip.module.css";

const STACK_CHIP: Record<RecipeStack, string> = {
  autoware: styles.chipAutoware,
  nav2: styles.chipNav2,
  moveit: styles.chipMoveit,
};

const STACK_MARKER: Record<RecipeStack, string> = {
  autoware: styles.markerAutoware,
  nav2: styles.markerNav2,
  moveit: styles.markerMoveit,
};

const STACK_PREFIX: Record<RecipeStack, string> = {
  autoware: "Autoware",
  nav2: "Nav2",
  moveit: "MoveIt",
};

const LEGEND_STACKS: RecipeStack[] = ["autoware", "nav2", "moveit"];

export interface FailureRecipeStripProps {
  markers: RecipeTimelineMarker[];
  currentTimeNs: number;
  startNs: number;
  endNs: number;
  isLive?: boolean;
  liveActive?: RecipeTimelineMarker[];
  onSeek?: (timeNs: number) => void;
}

export function FailureRecipeStrip({
  markers,
  currentTimeNs,
  startNs,
  endNs,
  isLive = false,
  liveActive,
  onSeek,
}: FailureRecipeStripProps) {
  const span = Math.max(endNs - startNs, 1);
  const active = liveActive ?? activeRecipeMarkersAt(markers, currentTimeNs);

  return (
    <>
      <div className={styles.strip} aria-live="polite">
        <span className={styles.label}>Failure recipes</span>
        {isLive ? <span className={styles.liveBadge}>live</span> : null}
        {active.length === 0 ? (
          <span className={styles.empty}>{isLive ? "none right now" : "none at this time"}</span>
        ) : (
          active.map((marker) => (
            <span key={`${marker.stack}-${marker.recipe_id}-${marker.time_ns}`} className={STACK_CHIP[marker.stack]}>
              {STACK_PREFIX[marker.stack]} · {marker.label}
            </span>
          ))
        )}
      </div>

      {markers.length > 0 || isLive ? (
        <>
          <div className={styles.legend}>
            {LEGEND_STACKS.map((stack) => (
              <span key={stack} className={styles.legendItem}>
                <span className={`${styles.legendSwatch} ${STACK_MARKER[stack]}`} />
                {STACK_PREFIX[stack]}
              </span>
            ))}
            <span className={styles.legendHint}>
              {isLive ? "recipes update as data streams" : "click ticks to seek"}
            </span>
          </div>
          <div className={styles.markerTrack}>
            {markers.map((marker) => {
              const left = ((marker.time_ns - startNs) / span) * 100;
              return (
                <button
                  key={`${marker.stack}-${marker.recipe_id}-${marker.time_ns}`}
                  type="button"
                  className={`${styles.marker} ${STACK_MARKER[marker.stack]}`}
                  style={{ left: `${left}%` }}
                  title={`${STACK_PREFIX[marker.stack]}: ${marker.label} @ ${(marker.time_ns / 1e9).toFixed(2)}s`}
                  onClick={() => onSeek?.(marker.time_ns)}
                />
              );
            })}
          </div>
        </>
      ) : null}
    </>
  );
}
