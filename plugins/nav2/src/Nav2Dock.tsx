import { useState, type ReactNode } from "react";

import { isPanelHighlighted, type Nav2PanelId } from "./failure-recipes.js";
import type { Nav2Snapshot } from "./types.js";
import styles from "./Nav2Dock.module.css";
import { AmclPanel } from "./panels/AmclPanel.js";
import { ControllerPanel } from "./panels/ControllerPanel.js";
import { CostmapPanel } from "./panels/CostmapPanel.js";
import { GoalPanel } from "./panels/GoalPanel.js";
import { PlanPanel } from "./panels/PlanPanel.js";

export interface Nav2DockProps {
  snapshot: Nav2Snapshot | null;
  loading?: boolean;
  inspector?: ReactNode;
}

function RecipePanel({
  panelId,
  snapshot,
  children,
}: {
  panelId: Nav2PanelId;
  snapshot: Nav2Snapshot | null;
  children: ReactNode;
}) {
  const highlighted = isPanelHighlighted(panelId, snapshot?.failure_recipe);
  return (
    <div className={highlighted ? styles.panelHighlight : styles.panelWrap} data-panel={panelId}>
      {children}
    </div>
  );
}

export function Nav2Dock({ snapshot, loading, inspector }: Nav2DockProps) {
  const [tab, setTab] = useState<"debug" | "inspector">("debug");
  const recipe = snapshot?.failure_recipe;

  return (
    <aside className={styles.nav2Dock}>
      <div className={styles.tabs}>
        <button
          type="button"
          className={tab === "debug" ? styles.tabActive : styles.tab}
          onClick={() => setTab("debug")}
        >
          Nav2 Debug
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
          {loading ? <p className={styles.loading}>Updating Nav2 panels…</p> : null}

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

          <RecipePanel panelId="nav2.amcl" snapshot={snapshot}>
            <AmclPanel data={snapshot?.amcl} />
          </RecipePanel>
          <RecipePanel panelId="nav2.costmap" snapshot={snapshot}>
            <CostmapPanel data={snapshot?.costmap} />
          </RecipePanel>
          <RecipePanel panelId="nav2.global_plan" snapshot={snapshot}>
            <PlanPanel
              title="Global Plan"
              data={snapshot?.global_plan}
              emptyHint="Waiting for /plan…"
            />
          </RecipePanel>
          <RecipePanel panelId="nav2.local_plan" snapshot={snapshot}>
            <PlanPanel
              title="Local Plan"
              data={snapshot?.local_plan}
              emptyHint="Waiting for /local_plan…"
            />
          </RecipePanel>
          <RecipePanel panelId="nav2.goal" snapshot={snapshot}>
            <GoalPanel data={snapshot?.goal} />
          </RecipePanel>
          <RecipePanel panelId="nav2.controller" snapshot={snapshot}>
            <ControllerPanel data={snapshot?.controller} />
          </RecipePanel>
        </div>
      )}
    </aside>
  );
}
