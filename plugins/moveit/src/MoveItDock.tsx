import { useState, type ReactNode } from "react";

import { isPanelHighlighted, type MoveItPanelId } from "./failure-recipes.js";
import type { MoveItSnapshot } from "./types.js";
import styles from "./MoveItDock.module.css";
import { JointStatePanel } from "./panels/JointStatePanel.js";
import { PlanningScenePanel } from "./panels/PlanningScenePanel.js";
import { TrajectoryPanel } from "./panels/TrajectoryPanel.js";

export interface MoveItDockProps {
  snapshot: MoveItSnapshot | null;
  loading?: boolean;
  inspector?: ReactNode;
}

function RecipePanel({
  panelId,
  snapshot,
  children,
}: {
  panelId: MoveItPanelId;
  snapshot: MoveItSnapshot | null;
  children: ReactNode;
}) {
  const highlighted = isPanelHighlighted(panelId, snapshot?.failure_recipe);
  return (
    <div className={highlighted ? styles.panelHighlight : styles.panelWrap} data-panel={panelId}>
      {children}
    </div>
  );
}

export function MoveItDock({ snapshot, loading, inspector }: MoveItDockProps) {
  const [tab, setTab] = useState<"debug" | "inspector">("debug");
  const recipe = snapshot?.failure_recipe;

  return (
    <aside className={styles.moveitDock}>
      <div className={styles.tabs}>
        <button
          type="button"
          className={tab === "debug" ? styles.tabActive : styles.tab}
          onClick={() => setTab("debug")}
        >
          MoveIt Debug
        </button>
        <button
          type="button"
          className={tab === "inspector" ? styles.tabActive : styles.tab}
          onClick={() => setTab("inspector")}
        >
          Inspector
        </button>
      </div>

      {tab === "inspector" ? (
        <div className={styles.inspectorPane}>{inspector}</div>
      ) : (
        <div className={styles.stack}>
          {loading ? <p className={styles.loading}>Updating MoveIt panels…</p> : null}

          {recipe ? (
            <section className={styles.recipeBanner} aria-live="polite">
              <div className={styles.recipeHeader}>
                <h3 className={styles.recipeTitle}>{recipe.label}</h3>
                <span className={styles.recipeBadge}>failure recipe</span>
              </div>
              <p className={styles.recipeDescription}>{recipe.description}</p>
              <ul className={styles.recipeSymptoms}>
                {recipe.matched_symptoms.map((symptom) => (
                  <li key={symptom}>{symptom.replaceAll("_", " ")}</li>
                ))}
              </ul>
            </section>
          ) : null}

          {snapshot?.warnings.length ? (
            <ul className={styles.warnings}>
              {snapshot.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : null}

          <RecipePanel panelId="moveit.joint_states" snapshot={snapshot}>
            <JointStatePanel data={snapshot?.joint_states} />
          </RecipePanel>
          <RecipePanel panelId="moveit.planning_scene" snapshot={snapshot}>
            <PlanningScenePanel data={snapshot?.planning_scene} />
          </RecipePanel>
          <RecipePanel panelId="moveit.trajectory" snapshot={snapshot}>
            <TrajectoryPanel data={snapshot?.trajectory} />
          </RecipePanel>
        </div>
      )}
    </aside>
  );
}
