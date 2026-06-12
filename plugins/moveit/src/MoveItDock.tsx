import { useState, type ReactNode } from "react";

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

export function MoveItDock({ snapshot, loading, inspector }: MoveItDockProps) {
  const [tab, setTab] = useState<"debug" | "inspector">("debug");

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

          {snapshot?.warnings.length ? (
            <ul className={styles.warnings}>
              {snapshot.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : null}

          <JointStatePanel data={snapshot?.joint_states} />
          <PlanningScenePanel data={snapshot?.planning_scene} />
          <TrajectoryPanel data={snapshot?.trajectory} />
        </div>
      )}
    </aside>
  );
}
