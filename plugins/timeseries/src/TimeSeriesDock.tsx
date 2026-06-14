import { useMemo, useState, type DragEvent, type ReactNode } from "react";

import { PlotCanvas } from "./panels/PlotCanvas.js";
import type {
  NumericFieldCandidate,
  TimeSeriesPlotSeries,
  TimeSeriesSnapshot,
} from "./types.js";
import styles from "./TimeSeriesDock.module.css";

export interface TimeSeriesDockProps {
  snapshot: TimeSeriesSnapshot | null;
  loading?: boolean;
  inspector?: ReactNode;
}

function formatSeconds(ns: number): string {
  return `${(ns / 1e9).toFixed(2)}s`;
}

function sampleCount(series: TimeSeriesPlotSeries[]): number {
  return series.reduce((total, item) => total + (item.series?.t.length ?? 0), 0);
}

function fieldMeta(candidate: NumericFieldCandidate): string {
  return `${candidate.schema} · ${candidate.fieldPath}`;
}

function onFieldDragStart(event: DragEvent<HTMLButtonElement>, candidate: NumericFieldCandidate) {
  event.dataTransfer.effectAllowed = "copy";
  event.dataTransfer.setData("application/x-robotscope-timeseries-field", candidate.key);
  event.dataTransfer.setData("text/plain", candidate.key);
}

export function TimeSeriesDock({ snapshot, loading, inspector }: TimeSeriesDockProps) {
  const [tab, setTab] = useState<"plot" | "inspector">("plot");
  const selectedKeys = useMemo(
    () => new Set(snapshot?.selectedSeries.map((series) => series.key) ?? []),
    [snapshot?.selectedSeries],
  );
  const visibleSeries = snapshot?.selectedSeries.filter((series) => series.visible) ?? [];
  const visibleSampleCount = sampleCount(visibleSeries);

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
                <div className={styles.meta}>
                  <span>
                    {visibleSeries.length} visible / {snapshot.selectedSeries.length} selected
                  </span>
                  <span>{visibleSampleCount} samples</span>
                  <span>
                    {formatSeconds(snapshot.startNs)} - {formatSeconds(snapshot.endNs)}
                  </span>
                </div>
              </div>

              <section className={styles.seriesPanel} aria-label="Selected time series">
                <div className={styles.sectionHeader}>
                  <h3>Series</h3>
                  <span>{snapshot.selectedSeries.length}</span>
                </div>
                {snapshot.selectedSeries.length ? (
                  <ul className={styles.seriesList}>
                    {snapshot.selectedSeries.map((series) => (
                      <li
                        key={series.key}
                        className={series.visible ? styles.seriesItem : styles.seriesItemMuted}
                      >
                        <label className={styles.visibilityToggle}>
                          <input
                            type="checkbox"
                            checked={series.visible}
                            onChange={() => snapshot.toggleSeriesVisible(series.key)}
                          />
                          <span
                            className={styles.colorSwatch}
                            style={{ backgroundColor: series.color }}
                            aria-hidden
                          />
                          <span className={styles.seriesText}>
                            <span className={styles.seriesLabel}>{series.candidate.label}</span>
                            <span className={styles.seriesMeta}>
                              {series.series?.t.length ?? 0} samples
                            </span>
                          </span>
                        </label>
                        <button
                          type="button"
                          className={styles.removeButton}
                          onClick={() => snapshot.removeSeriesKey(series.key)}
                          aria-label={`Remove ${series.candidate.label}`}
                        >
                          x
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className={styles.emptyState}>Select fields below to add plot series.</div>
                )}
              </section>

              {snapshot.warnings.length ? (
                <ul className={styles.warnings}>
                  {snapshot.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              ) : null}

              <PlotCanvas
                series={snapshot.selectedSeries}
                startNs={snapshot.startNs}
                endNs={snapshot.endNs}
                currentTimeNs={snapshot.currentTimeNs}
                onSeekTimeNs={snapshot.seekToTimeNs}
                onDropFieldKey={snapshot.addSeriesKey}
              />

              <section className={styles.fieldPanel} aria-label="Numeric fields">
                <div className={styles.sectionHeader}>
                  <h3>Fields</h3>
                  <span>{snapshot.candidates.length}</span>
                </div>
                {snapshot.candidates.length ? (
                  <div className={styles.fieldList}>
                    {snapshot.candidates.map((candidate) => {
                      const selected = selectedKeys.has(candidate.key);
                      return (
                        <button
                          key={candidate.key}
                          type="button"
                          draggable
                          className={selected ? styles.fieldItemSelected : styles.fieldItem}
                          onClick={() =>
                            selected
                              ? snapshot.removeSeriesKey(candidate.key)
                              : snapshot.addSeriesKey(candidate.key)
                          }
                          onDragStart={(event) => onFieldDragStart(event, candidate)}
                          aria-pressed={selected}
                        >
                          <span className={styles.fieldLabel}>{candidate.label}</span>
                          <span className={styles.fieldMeta}>{fieldMeta(candidate)}</span>
                          <span className={styles.fieldAction}>{selected ? "Remove" : "Add"}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className={styles.emptyState}>No numeric field candidates.</div>
                )}
              </section>
            </>
          ) : (
            <div className={styles.emptyState}>Load an MCAP recording to plot a numeric field.</div>
          )}
        </div>
      )}
    </aside>
  );
}
