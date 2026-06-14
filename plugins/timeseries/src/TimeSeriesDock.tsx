import { useCallback, useMemo, useState, type DragEvent, type ReactNode } from "react";

import { countExportableRows, downloadTimeSeriesCsv } from "./csv-export.js";
import { PlotCanvas } from "./panels/PlotCanvas.js";
import type {
  NumericFieldCandidate,
  TimeSeriesPlotSeries,
  TimeSeriesSnapshot,
  TimeSeriesXRange,
} from "./types.js";
import styles from "./TimeSeriesDock.module.css";

export interface TimeSeriesDockProps {
  snapshot: TimeSeriesSnapshot | null;
  loading?: boolean;
  inspector?: ReactNode;
  xRange?: TimeSeriesXRange | null;
  onXRangeChange?: (range: TimeSeriesXRange | null) => void;
}

function formatSeconds(ns: number): string {
  return `${(ns / 1e9).toFixed(2)}s`;
}

function sampleCount(series: TimeSeriesPlotSeries[]): number {
  return series.reduce((total, item) => total + (item.series?.t.length ?? 0), 0);
}

const MAX_VISIBLE_Y_AXES = 3;
const EMPTY_PLOT_SERIES: TimeSeriesPlotSeries[] = [];
type PlotDisplayMode = "overlay" | "stacked";

function xRangeEquals(
  left: TimeSeriesXRange | null,
  right: TimeSeriesXRange | null,
): boolean {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }
  return Math.abs(left.minSec - right.minSec) < 1e-9 &&
    Math.abs(left.maxSec - right.maxSec) < 1e-9;
}

function fieldMeta(candidate: NumericFieldCandidate): string {
  return `${candidate.schema} · ${candidate.fieldPath}`;
}

function formatSeriesValue(value: number): string {
  if (value === 0) {
    return "0";
  }
  if (Math.abs(value) >= 1000 || Math.abs(value) < 0.001) {
    return value.toExponential(2);
  }
  return value.toFixed(3).replace(/\.?0+$/, "");
}

function nearestValueAtTime(series: TimeSeriesPlotSeries, currentTimeNs: number): number | null {
  const data = series.series;
  if (!data || data.t.length === 0) {
    return null;
  }

  let low = 0;
  let high = data.t.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (data.t[middle]! < currentTimeNs) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }

  const rightIndex = low;
  const leftIndex = Math.max(0, rightIndex - 1);
  const leftDelta = Math.abs(data.t[leftIndex]! - currentTimeNs);
  const rightDelta = Math.abs(data.t[rightIndex]! - currentTimeNs);
  const value = data.v[leftDelta <= rightDelta ? leftIndex : rightIndex];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function yAxisLabel(axisIndex: number | undefined): string {
  if (axisIndex == null) {
    return "Hidden";
  }
  return axisIndex < MAX_VISIBLE_Y_AXES
    ? `Y${axisIndex + 1}`
    : `Y${axisIndex + 1} scale`;
}

function onFieldDragStart(event: DragEvent<HTMLButtonElement>, candidate: NumericFieldCandidate) {
  event.dataTransfer.effectAllowed = "copy";
  event.dataTransfer.setData("application/x-robotscope-timeseries-field", candidate.key);
  event.dataTransfer.setData("text/plain", candidate.key);
}

interface StackedSeriesPlotProps {
  series: TimeSeriesPlotSeries;
  startNs: number;
  endNs: number;
  currentTimeNs: number;
  xRange: TimeSeriesXRange | null;
  onXRangeChange: (range: TimeSeriesXRange | null) => void;
  onSeekTimeNs: (timeNs: number) => void;
  onDropFieldKey: (key: string) => void;
}

function StackedSeriesPlot({
  series,
  startNs,
  endNs,
  currentTimeNs,
  xRange,
  onXRangeChange,
  onSeekTimeNs,
  onDropFieldKey,
}: StackedSeriesPlotProps) {
  const singleSeries = useMemo(() => [series], [series]);
  return (
    <PlotCanvas
      series={singleSeries}
      startNs={startNs}
      endNs={endNs}
      currentTimeNs={currentTimeNs}
      xRange={xRange}
      onXRangeChange={onXRangeChange}
      onSeekTimeNs={onSeekTimeNs}
      onDropFieldKey={onDropFieldKey}
      compact
      plotLabel={{
        label: series.candidate.label,
        color: series.color,
      }}
    />
  );
}

export function TimeSeriesDock({
  snapshot,
  loading,
  inspector,
  xRange: controlledXRange,
  onXRangeChange,
}: TimeSeriesDockProps) {
  const [tab, setTab] = useState<"plot" | "inspector">("plot");
  const [displayMode, setDisplayMode] = useState<PlotDisplayMode>("overlay");
  const [localXRange, setLocalXRange] = useState<TimeSeriesXRange | null>(null);
  const xRangeControlled = controlledXRange !== undefined;
  const xRange = xRangeControlled ? controlledXRange : localXRange;
  const selectedKeys = useMemo(
    () => new Set(snapshot?.selectedSeries.map((series) => series.key) ?? []),
    [snapshot?.selectedSeries],
  );
  const visibleSeries = snapshot?.selectedSeries.filter((series) => series.visible) ?? [];
  const visibleSampleCount = sampleCount(visibleSeries);
  const axisIndexByKey = useMemo(() => {
    const next = new Map<string, number>();
    let visibleIndex = 0;
    for (const series of snapshot?.selectedSeries ?? []) {
      if (!series.visible) {
        continue;
      }
      next.set(series.key, visibleIndex);
      visibleIndex += 1;
    }
    return next;
  }, [snapshot?.selectedSeries]);
  const exportableRows = useMemo(
    () => countExportableRows(snapshot?.selectedSeries ?? []),
    [snapshot?.selectedSeries],
  );
  const handleExportCsv = useCallback(() => {
    if (!snapshot || exportableRows === 0) {
      return;
    }
    downloadTimeSeriesCsv(snapshot.selectedSeries, snapshot.startNs);
  }, [exportableRows, snapshot]);
  const handleXRangeChange = useCallback((nextRange: TimeSeriesXRange | null) => {
    if (xRangeControlled) {
      if (!xRangeEquals(xRange, nextRange)) {
        onXRangeChange?.(nextRange);
      }
      return;
    }
    setLocalXRange((currentRange) =>
      xRangeEquals(currentRange, nextRange) ? currentRange : nextRange,
    );
  }, [onXRangeChange, xRange, xRangeControlled]);

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
                  <div className={styles.sectionActions}>
                    <div className={styles.modeToggle} role="group" aria-label="Plot display mode">
                      <button
                        type="button"
                        className={displayMode === "overlay"
                          ? styles.modeToggleButtonActive
                          : styles.modeToggleButton}
                        onClick={() => setDisplayMode("overlay")}
                        aria-pressed={displayMode === "overlay"}
                      >
                        Overlay
                      </button>
                      <button
                        type="button"
                        className={displayMode === "stacked"
                          ? styles.modeToggleButtonActive
                          : styles.modeToggleButton}
                        onClick={() => setDisplayMode("stacked")}
                        aria-pressed={displayMode === "stacked"}
                      >
                        Stacked
                      </button>
                    </div>
                    <button
                      type="button"
                      className={styles.exportButton}
                      onClick={handleExportCsv}
                      disabled={exportableRows === 0}
                      title="Download visible series as CSV"
                    >
                      Export CSV
                    </button>
                    <span>{snapshot.selectedSeries.length}</span>
                  </div>
                </div>
                {snapshot.selectedSeries.length ? (
                  <ul className={styles.seriesList}>
                    {snapshot.selectedSeries.map((series) => {
                      const axisIndex = series.visible
                        ? axisIndexByKey.get(series.key)
                        : undefined;
                      const axisLabel = displayMode === "stacked" && series.visible
                        ? "Y1"
                        : yAxisLabel(axisIndex);
                      const currentValue = nearestValueAtTime(series, snapshot.currentTimeNs);
                      return (
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
                                <span>{series.series?.t.length ?? 0} samples</span>
                                <span
                                  className={styles.axisBadge}
                                  style={
                                    series.visible
                                      ? { borderColor: series.color, color: series.color }
                                      : undefined
                                  }
                                >
                                  {axisLabel}
                                </span>
                                {currentValue != null ? (
                                  <span>now {formatSeriesValue(currentValue)}</span>
                                ) : null}
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
                      );
                    })}
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

              {displayMode === "stacked" ? (
                visibleSeries.length ? (
                  <div className={styles.stackedPlots}>
                    {visibleSeries.map((series) => (
                      <StackedSeriesPlot
                        key={series.key}
                        series={series}
                        startNs={snapshot.startNs}
                        endNs={snapshot.endNs}
                        currentTimeNs={snapshot.currentTimeNs}
                        xRange={xRange}
                        onXRangeChange={handleXRangeChange}
                        onSeekTimeNs={snapshot.seekToTimeNs}
                        onDropFieldKey={snapshot.addSeriesKey}
                      />
                    ))}
                  </div>
                ) : (
                  <PlotCanvas
                    series={EMPTY_PLOT_SERIES}
                    startNs={snapshot.startNs}
                    endNs={snapshot.endNs}
                    currentTimeNs={snapshot.currentTimeNs}
                    xRange={xRange}
                    onXRangeChange={handleXRangeChange}
                    onSeekTimeNs={snapshot.seekToTimeNs}
                    onDropFieldKey={snapshot.addSeriesKey}
                    compact
                  />
                )
              ) : (
                <PlotCanvas
                  series={snapshot.selectedSeries}
                  startNs={snapshot.startNs}
                  endNs={snapshot.endNs}
                  currentTimeNs={snapshot.currentTimeNs}
                  xRange={xRange}
                  onXRangeChange={handleXRangeChange}
                  onSeekTimeNs={snapshot.seekToTimeNs}
                  onDropFieldKey={snapshot.addSeriesKey}
                />
              )}

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
