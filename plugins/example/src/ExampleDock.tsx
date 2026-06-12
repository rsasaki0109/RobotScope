import { useState, type ReactNode } from "react";

import type { ExampleSnapshot } from "./types.js";
import styles from "./ExampleDock.module.css";
import { SessionPanel } from "./panels/SessionPanel.js";

export interface ExampleDockProps {
  snapshot: ExampleSnapshot | null;
  loading?: boolean;
  inspector?: ReactNode;
}

export function ExampleDock({ snapshot, loading, inspector }: ExampleDockProps) {
  const [tab, setTab] = useState<"debug" | "inspector">("debug");

  return (
    <aside className={styles.exampleDock}>
      <div className={styles.tabs}>
        <button
          type="button"
          className={tab === "debug" ? styles.tabActive : styles.tab}
          onClick={() => setTab("debug")}
        >
          Example Plugin
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
          {loading ? <p className={styles.loading}>Updating example panels…</p> : null}

          <div className={styles.banner}>
            Third-party plugin template — copy <code>plugins/example/</code> and register in{" "}
            <code>registry.ts</code>.
          </div>

          {snapshot?.warnings.length ? (
            <ul className={styles.warnings}>
              {snapshot.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : null}

          <SessionPanel session={snapshot?.session} />
        </div>
      )}
    </aside>
  );
}
