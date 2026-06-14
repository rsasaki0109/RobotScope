import { useState, type ReactNode } from "react";

import { PlotCanvas } from "./panels/PlotCanvas.js";
import type { TimeSeriesSnapshot } from "./types.js";
import styles from "./TimeSeriesDock.module.css";

export interface TimeSeriesDockProps {
  snapshot: TimeSeriesSnapshot | null;
  loading?: boolean;
  inspector?: ReactNode;
}

function formatSeconds(ns: number): string {
  return `${(ns / 1e9).toFixed(2)}s`;
}

export function TimeSeriesDock({ snapshot, loading, inspector }: TimeSeriesDockProps) {
  const [tab, setTab] = useState<"plot" | "inspector">("plot");
  const selection = snapshot?.selection;
  const sampleCount = snapshot?.series?.t.length ?? 0;

  return (
    <aside className={styles.timeseriesDock}>
      <div className={styles.tabs}>
        <button
          type="button"
          className={tab === "plot" ? styles.tabActive : styles.tab}
          onClick={() => setTab("plot")}
        >
          Time Series
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
          {loading ? <p className={styles.loading}>Loading series…</p> : null}

          {snapshot ? (
            <>
              <div className={styles.toolbar}>
                <select
                  className={styles.select}
                  value={selection?.key ?? ""}
                  onChange={(event) => snapshot.setSelectionKey(event.target.value)}
                  disabled={snapshot.candidates.length === 0}
                >
                  {snapshot.candidates.length === 0 ? (
                    <option value="">No numeric fields</option>
                  ) : null}
                  {snapshot.candidates.map((candidate) => (
                    <option key={candidate.key} value={candidate.key}>
                      {candidate.label}
                    </option>
                  ))}
                </select>
                <div className={styles.meta}>
                  <span>{sampleCount} samples</span>
                  <span>
                    {formatSeconds(snapshot.startNs)} - {formatSeconds(snapshot.endNs)}
                  </span>
                </div>
              </div>

              {snapshot.warnings.length ? (
                <ul className={styles.warnings}>
                  {snapshot.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              ) : null}

              <PlotCanvas
                series={snapshot.series}
                label={selection?.label ?? "series"}
                startNs={snapshot.startNs}
                endNs={snapshot.endNs}
                currentTimeNs={snapshot.currentTimeNs}
              />
            </>
          ) : (
            <div className={styles.emptyState}>Load an MCAP recording to plot a numeric field.</div>
          )}
        </div>
      )}
    </aside>
  );
}
