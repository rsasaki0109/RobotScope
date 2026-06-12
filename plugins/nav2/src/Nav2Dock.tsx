import { useState, type ReactNode } from "react";

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

export function Nav2Dock({ snapshot, loading, inspector }: Nav2DockProps) {
  const [tab, setTab] = useState<"debug" | "inspector">("debug");

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

          {snapshot?.warnings.length ? (
            <ul className={styles.warnings}>
              {snapshot.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : null}

          <AmclPanel data={snapshot?.amcl} />
          <CostmapPanel data={snapshot?.costmap} />
          <PlanPanel
            title="Global Plan"
            data={snapshot?.global_plan}
            emptyHint="Waiting for /plan…"
          />
          <PlanPanel
            title="Local Plan"
            data={snapshot?.local_plan}
            emptyHint="Waiting for /local_plan…"
          />
          <GoalPanel data={snapshot?.goal} />
          <ControllerPanel data={snapshot?.controller} />
        </div>
      )}
    </aside>
  );
}
