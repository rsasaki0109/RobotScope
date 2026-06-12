import { useState, type ReactNode } from "react";

import type { AutowareSnapshot } from "./types.js";
import styles from "./AutowareDock.module.css";
import { ControlErrorPanel } from "./panels/ControlErrorPanel.js";
import { LocalizationPanel } from "./panels/LocalizationPanel.js";
import { NdtScorePanel } from "./panels/NdtScorePanel.js";
import { PlanningPanel } from "./panels/PlanningPanel.js";

export interface AutowareDockProps {
  snapshot: AutowareSnapshot | null;
  loading?: boolean;
  inspector?: ReactNode;
}

export function AutowareDock({ snapshot, loading, inspector }: AutowareDockProps) {
  const [tab, setTab] = useState<"debug" | "inspector">("debug");

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

          {snapshot?.warnings.length ? (
            <ul className={styles.warnings}>
              {snapshot.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : null}

          <LocalizationPanel data={snapshot?.localization} />
          <NdtScorePanel data={snapshot?.ndt} />
          <PlanningPanel data={snapshot?.planning} />
          <ControlErrorPanel data={snapshot?.control} />
        </div>
      )}
    </aside>
  );
}
