import { useCallback, useMemo, useState, type DragEvent, type ReactNode } from "react";

import { countExportableRows, downloadTimeSeriesCsv } from "./csv-export.js";
import { isDerivedSeriesKey } from "./derived-series.js";
import { PlotCanvas } from "./panels/PlotCanvas.js";
import type {
  BinaryOp,
  DerivedSeriesKind,
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
type TimeAxisFormat = "relative" | "absolute";
type YAxisMode = "auto" | "fixed";
interface YAxisRange {
  min: number;
  max: number;
}
const BINARY_OP_OPTIONS: Array<{ value: BinaryOp; label: string }> = [
  { value: "add", label: "+" },
  { value: "subtract", label: "-" },
  { value: "multiply", label: "*" },
  { value: "divide", label: "/" },
];

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

function selectedSourceKey(
  sourceSeries: TimeSeriesPlotSeries[],
  requestedKey: string,
  fallbackIndex: number,
): string {
  if (sourceSeries.some((series) => series.key === requestedKey)) {
    return requestedKey;
  }
  return sourceSeries[Math.min(fallbackIndex, sourceSeries.length - 1)]?.key ?? "";
}

interface DerivedSeriesFormProps {
  snapshot: TimeSeriesSnapshot;
  sourceSeries: TimeSeriesPlotSeries[];
}

function DerivedSeriesForm({ snapshot, sourceSeries }: DerivedSeriesFormProps) {
  const [kind, setKind] = useState<DerivedSeriesKind>("moving-average");
  const [sourceAKey, setSourceAKey] = useState("");
  const [sourceBKey, setSourceBKey] = useState("");
  const [binaryOp, setBinaryOp] = useState<BinaryOp>("add");
  const [windowInput, setWindowInput] = useState("5");
  const [scaleInput, setScaleInput] = useState("1");
  const [offsetInput, setOffsetInput] = useState("0");
  const hasSources = sourceSeries.length > 0;
  const sourceA = selectedSourceKey(sourceSeries, sourceAKey, 0);
  const sourceB = selectedSourceKey(sourceSeries, sourceBKey, sourceSeries.length > 1 ? 1 : 0);
  const addDisabled = !hasSources || !sourceA || (kind === "binary-op" && !sourceB);

  const handleAddDerived = useCallback(() => {
    if (addDisabled) {
      return;
    }

    const windowSize = Math.max(1, Math.floor(Number.parseInt(windowInput, 10) || 5));
    snapshot.addDerivedSeries({
      kind,
      sourceKeys: kind === "binary-op" ? [sourceA, sourceB] : [sourceA],
      window: kind === "moving-average" ? windowSize : undefined,
      op: kind === "binary-op" ? binaryOp : undefined,
      scale: kind === "scale-offset" ? Number.parseFloat(scaleInput) : undefined,
      offset: kind === "scale-offset" ? Number.parseFloat(offsetInput) : undefined,
    });
  }, [
    addDisabled,
    binaryOp,
    kind,
    offsetInput,
    scaleInput,
    snapshot,
    sourceA,
    sourceB,
    windowInput,
  ]);

  return (
    <div className={styles.derivedForm} aria-label="Add derived channel">
      <div className={styles.derivedControls}>
        <label className={styles.controlLabel}>
          <span>Type</span>
          <select
            className={styles.controlSelect}
            value={kind}
            onChange={(event) => setKind(event.target.value as DerivedSeriesKind)}
          >
            <option value="moving-average">Moving average</option>
            <option value="derivative">Derivative</option>
            <option value="integral">Integral</option>
            <option value="abs">Abs</option>
            <option value="scale-offset">Scale &amp; offset</option>
            <option value="binary-op">A op B</option>
          </select>
        </label>

        <label className={styles.controlLabel}>
          <span>A</span>
          <select
            className={styles.controlSelect}
            value={sourceA}
            onChange={(event) => setSourceAKey(event.target.value)}
            disabled={!hasSources}
          >
            {sourceSeries.map((series) => (
              <option key={series.key} value={series.key}>
                {series.candidate.label}
              </option>
            ))}
          </select>
        </label>

        {kind === "moving-average" ? (
          <label className={styles.controlLabel}>
            <span>Window</span>
            <input
              className={styles.controlInput}
              type="number"
              min={1}
              step={1}
              value={windowInput}
              onChange={(event) => setWindowInput(event.target.value)}
            />
          </label>
        ) : null}

        {kind === "scale-offset" ? (
          <>
            <label className={styles.controlLabel}>
              <span>Scale</span>
              <input
                className={styles.controlInput}
                type="number"
                step="any"
                value={scaleInput}
                onChange={(event) => setScaleInput(event.target.value)}
              />
            </label>
            <label className={styles.controlLabel}>
              <span>Offset</span>
              <input
                className={styles.controlInput}
                type="number"
                step="any"
                value={offsetInput}
                onChange={(event) => setOffsetInput(event.target.value)}
              />
            </label>
          </>
        ) : null}

        {kind === "binary-op" ? (
          <>
            <label className={styles.controlLabel}>
              <span>Op</span>
              <select
                className={styles.controlSelect}
                value={binaryOp}
                onChange={(event) => setBinaryOp(event.target.value as BinaryOp)}
              >
                {BINARY_OP_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.controlLabel}>
              <span>B</span>
              <select
                className={styles.controlSelect}
                value={sourceB}
                onChange={(event) => setSourceBKey(event.target.value)}
                disabled={!hasSources}
              >
                {sourceSeries.map((series) => (
                  <option key={series.key} value={series.key}>
                    {series.candidate.label}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : null}
      </div>

      <div className={styles.derivedActions}>
        {!hasSources ? (
          <span className={styles.derivedHint}>Select a real series first.</span>
        ) : null}
        <button
          type="button"
          className={styles.addDerivedButton}
          onClick={handleAddDerived}
          disabled={addDisabled}
        >
          Add
        </button>
      </div>
    </div>
  );
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
  timeFormat: TimeAxisFormat;
  yRange: YAxisRange | null;
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
  timeFormat,
  yRange,
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
      timeFormat={timeFormat}
      yRange={yRange}
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
  const [timeFormat, setTimeFormat] = useState<TimeAxisFormat>("relative");
  const [yAxisMode, setYAxisMode] = useState<YAxisMode>("auto");
  const [yMinInput, setYMinInput] = useState("");
  const [yMaxInput, setYMaxInput] = useState("");
  const xRangeControlled = controlledXRange !== undefined;
  const xRange = xRangeControlled ? controlledXRange : localXRange;
  const yRange = useMemo<YAxisRange | null>(() => {
    if (yAxisMode !== "fixed") {
      return null;
    }
    const min = Number.parseFloat(yMinInput);
    const max = Number.parseFloat(yMaxInput);
    return Number.isFinite(min) && Number.isFinite(max) && min < max ? { min, max } : null;
  }, [yAxisMode, yMaxInput, yMinInput]);
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

              <section className={styles.axesPanel} aria-label="Axes">
                <div className={styles.sectionHeader}>
                  <h3>Axes</h3>
                </div>
                <div className={styles.axesControls}>
                  <div className={styles.axisControlGroup}>
                    <span className={styles.axisControlLabel}>Time axis</span>
                    <div className={styles.modeToggle} role="group" aria-label="Time axis format">
                      <button
                        type="button"
                        className={timeFormat === "relative"
                          ? styles.modeToggleButtonActive
                          : styles.modeToggleButton}
                        onClick={() => setTimeFormat("relative")}
                        aria-pressed={timeFormat === "relative"}
                      >
                        Relative (s)
                      </button>
                      <button
                        type="button"
                        className={timeFormat === "absolute"
                          ? styles.modeToggleButtonActive
                          : styles.modeToggleButton}
                        onClick={() => setTimeFormat("absolute")}
                        aria-pressed={timeFormat === "absolute"}
                      >
                        Clock
                      </button>
                    </div>
                  </div>

                  <div className={styles.axisControlGroup}>
                    <span className={styles.axisControlLabel}>Y axis</span>
                    <div className={styles.modeToggle} role="group" aria-label="Y axis range mode">
                      <button
                        type="button"
                        className={yAxisMode === "auto"
                          ? styles.modeToggleButtonActive
                          : styles.modeToggleButton}
                        onClick={() => setYAxisMode("auto")}
                        aria-pressed={yAxisMode === "auto"}
                      >
                        Auto
                      </button>
                      <button
                        type="button"
                        className={yAxisMode === "fixed"
                          ? styles.modeToggleButtonActive
                          : styles.modeToggleButton}
                        onClick={() => setYAxisMode("fixed")}
                        aria-pressed={yAxisMode === "fixed"}
                      >
                        Fixed
                      </button>
                    </div>
                  </div>

                  <label className={styles.axisNumberLabel}>
                    <span>Min</span>
                    <input
                      className={styles.controlInput}
                      type="number"
                      step="any"
                      value={yMinInput}
                      onChange={(event) => setYMinInput(event.target.value)}
                      disabled={yAxisMode !== "fixed"}
                    />
                  </label>

                  <label className={styles.axisNumberLabel}>
                    <span>Max</span>
                    <input
                      className={styles.controlInput}
                      type="number"
                      step="any"
                      value={yMaxInput}
                      onChange={(event) => setYMaxInput(event.target.value)}
                      disabled={yAxisMode !== "fixed"}
                    />
                  </label>
                </div>
              </section>

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
                <DerivedSeriesForm snapshot={snapshot} sourceSeries={snapshot.selectedSeries} />
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
                          <input
                            type="color"
                            className={styles.colorPicker}
                            value={series.color}
                            onChange={(event) => {
                              snapshot.setSeriesColor(series.key, event.target.value);
                            }}
                            aria-label={`Color for ${series.candidate.label}`}
                            title="Change series color"
                          />
                          <label className={styles.visibilityToggle}>
                            <input
                              type="checkbox"
                              checked={series.visible}
                              onChange={() => snapshot.toggleSeriesVisible(series.key)}
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
                                {isDerivedSeriesKey(series.key) ? (
                                  <span className={styles.derivedBadge}>derived</span>
                                ) : null}
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
                        timeFormat={timeFormat}
                        yRange={yRange}
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
                    timeFormat={timeFormat}
                    yRange={yRange}
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
                  onToggleSeriesVisible={snapshot.toggleSeriesVisible}
                  timeFormat={timeFormat}
                  yRange={yRange}
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
