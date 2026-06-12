import { useState, type ReactNode } from "react";

import { isPanelHighlighted, type AutowarePanelId } from "./failure-recipes.js";
import type { AutowareSnapshot } from "./types.js";
import styles from "./AutowareDock.module.css";
import { ControlErrorPanel } from "./panels/ControlErrorPanel.js";
import { LocalizationPanel } from "./panels/LocalizationPanel.js";
import { MapPanel } from "./panels/MapPanel.js";
import { NdtScorePanel } from "./panels/NdtScorePanel.js";
import { PlanningPanel } from "./panels/PlanningPanel.js";

export interface AutowareDockProps {
  snapshot: AutowareSnapshot | null;
  loading?: boolean;
  inspector?: ReactNode;
}

function RecipePanel({
  panelId,
  snapshot,
  children,
}: {
  panelId: AutowarePanelId;
  snapshot: AutowareSnapshot | null;
  children: ReactNode;
}) {
  const highlighted = isPanelHighlighted(panelId, snapshot?.failure_recipe);
  return (
    <div className={highlighted ? styles.panelHighlight : styles.panelWrap} data-panel={panelId}>
      {children}
    </div>
  );
}

export function AutowareDock({ snapshot, loading, inspector }: AutowareDockProps) {
  const [tab, setTab] = useState<"debug" | "inspector">("debug");
  const recipe = snapshot?.failure_recipe;

  return (
    <aside className={styles.autowareDock}>
      <div className={styles.tabs}>
        <button
          type="button"
          className={tab === "debug" ? styles.tabActive : styles.tab}
          onClick={() => setTab("debug")}
        >
          Autoware Debug
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
          {loading ? <p className={styles.loading}>Updating Autoware panels…</p> : null}

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
              {recipe.highlight_panels.includes("tf_health") ? (
                <p className={styles.recipeHint}>Also check the TF tree panel (left sidebar).</p>
              ) : null}
            </section>
          ) : null}

          {snapshot?.warnings.length ? (
            <ul className={styles.warnings}>
              {snapshot.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : null}

          <RecipePanel panelId="autoware.map" snapshot={snapshot}>
            <MapPanel
              map={snapshot?.map}
              ego={
                snapshot?.localization
                  ? {
                      frame_id: snapshot.localization.header_frame,
                      position: snapshot.localization.position,
                    }
                  : undefined
              }
            />
          </RecipePanel>
          <RecipePanel panelId="autoware.localization" snapshot={snapshot}>
            <LocalizationPanel data={snapshot?.localization} />
          </RecipePanel>
          <RecipePanel panelId="autoware.ndt_score" snapshot={snapshot}>
            <NdtScorePanel data={snapshot?.ndt} />
          </RecipePanel>
          <RecipePanel panelId="autoware.planning" snapshot={snapshot}>
            <PlanningPanel data={snapshot?.planning} />
          </RecipePanel>
          <RecipePanel panelId="autoware.control_error" snapshot={snapshot}>
            <ControlErrorPanel data={snapshot?.control} />
          </RecipePanel>
        </div>
      )}
    </aside>
  );
}
