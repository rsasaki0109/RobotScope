import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import uPlot from "uplot";
import type { AlignedData, Options } from "uplot";
import "uplot/dist/uPlot.min.css";

import { buildAlignedTimeSeriesData } from "../series-align.js";
import type { TimeSeriesPlotSeries, TimeSeriesXRange } from "../types.js";
import styles from "./PlotCanvas.module.css";

export interface PlotCanvasProps {
  series: TimeSeriesPlotSeries[];
  startNs: number;
  endNs: number;
  currentTimeNs: number;
  xRange: TimeSeriesXRange | null;
  onXRangeChange: (range: TimeSeriesXRange | null) => void;
  onSeekTimeNs: (timeNs: number) => void;
  onDropFieldKey?: (key: string) => void;
  onToggleSeriesVisible?: (key: string) => void;
  timeFormat?: "relative" | "absolute";
  yRange?: { min: number; max: number } | null;
  compact?: boolean;
  plotLabel?: {
    label: string;
    color: string;
  };
}

interface Size {
  width: number;
  height: number;
}

interface PlotData {
  data: AlignedData;
  visibleSeries: TimeSeriesPlotSeries[];
}

interface AxisAssignment {
  scaleKey: string;
  axisVisible: boolean;
  color: string;
  side: uPlot.Axis.Side;
}

const FIELD_DROP_TYPE = "application/x-robotscope-timeseries-field";
const MAX_VISIBLE_Y_AXES = 3;
const DRAG_CLICK_THRESHOLD_PX = 4;
const MIN_X_SPAN_SECONDS = 1e-6;
const WHEEL_ZOOM_FACTOR = 1.18;
const AXIS_SIDE_RIGHT = 1 as uPlot.Axis.Side;
const AXIS_SIDE_LEFT = 3 as uPlot.Axis.Side;

function formatValue(value: number): string {
  if (value === 0) {
    return "0";
  }
  if (Math.abs(value) >= 1000 || Math.abs(value) < 0.001) {
    return value.toExponential(2);
  }
  return value.toFixed(3).replace(/\.?0+$/, "");
}

function padClockPart(value: number): string {
  return String(value).padStart(2, "0");
}

function formatAbsoluteTime(valueSeconds: number, startNs: number): string {
  const absMs = (startNs + valueSeconds * 1e9) / 1e6;
  if (!Number.isFinite(absMs)) {
    return "";
  }

  const date = new Date(Math.round(absMs / 100) * 100);
  return `${padClockPart(date.getHours())}:${padClockPart(date.getMinutes())}:${
    padClockPart(date.getSeconds())
  }.${Math.floor(date.getMilliseconds() / 100)}`;
}

function hideTooltip(tooltip: HTMLDivElement | null): void {
  if (tooltip) {
    tooltip.style.display = "none";
  }
}

function renderTooltipContent(
  tooltip: HTMLDivElement,
  timeLabel: string,
  plotData: PlotData,
  data: AlignedData,
  index: number,
): void {
  tooltip.replaceChildren();

  const time = document.createElement("div");
  time.className = styles.tooltipTime;
  time.textContent = timeLabel;
  tooltip.append(time);

  const rows = document.createElement("div");
  rows.className = styles.tooltipRows;

  plotData.visibleSeries.forEach((series, seriesIndex) => {
    const value = data[seriesIndex + 1]?.[index];
    const formattedValue = typeof value === "number" && Number.isFinite(value)
      ? formatValue(value)
      : "—";

    const row = document.createElement("div");
    row.className = styles.tooltipRow;

    const swatch = document.createElement("span");
    swatch.className = styles.tooltipSwatch;
    swatch.style.backgroundColor = series.color;

    const label = document.createElement("span");
    label.className = styles.tooltipLabel;
    label.textContent = series.candidate.label;

    const valueNode = document.createElement("span");
    valueNode.className = styles.tooltipValue;
    valueNode.textContent = formattedValue;

    row.append(swatch, label, valueNode);
    rows.append(row);
  });

  tooltip.append(rows);
}

function clampTooltipPosition(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

function positionTooltip(
  tooltip: HTMLDivElement,
  shell: HTMLDivElement,
  plot: uPlot,
  cursorLeft: number,
  cursorTop: number,
): void {
  const overRect = plot.over.getBoundingClientRect();
  const shellRect = shell.getBoundingClientRect();
  const overLeft = overRect.left - shellRect.left;
  const overTop = overRect.top - shellRect.top;
  const gap = 12;
  const margin = 8;

  tooltip.style.display = "block";
  tooltip.style.left = "0px";
  tooltip.style.top = "0px";

  const tooltipWidth = tooltip.offsetWidth;
  const tooltipHeight = tooltip.offsetHeight;
  const overRight = overLeft + overRect.width;
  const overBottom = overTop + overRect.height;
  let left = overLeft + cursorLeft + gap;
  let top = overTop + cursorTop + gap;

  if (left + tooltipWidth > overRight - margin) {
    left = overLeft + cursorLeft - tooltipWidth - gap;
  }
  if (top + tooltipHeight > overBottom - margin) {
    top = overTop + cursorTop - tooltipHeight - gap;
  }

  tooltip.style.left = `${
    clampTooltipPosition(left, overLeft + margin, overRight - tooltipWidth - margin)
  }px`;
  tooltip.style.top = `${
    clampTooltipPosition(top, overTop + margin, overBottom - tooltipHeight - margin)
  }px`;
}

function normalizeYRange(
  range: PlotCanvasProps["yRange"],
): { min: number; max: number } | null {
  if (!range || !Number.isFinite(range.min) || !Number.isFinite(range.max)) {
    return null;
  }
  return range.min < range.max ? range : null;
}

function buildPlotData(series: TimeSeriesPlotSeries[], startNs: number): PlotData {
  const aligned = buildAlignedTimeSeriesData(series);
  if (aligned.alignedSeries.length === 0 || aligned.timeNs.length === 0) {
    return { data: [[]], visibleSeries: [] };
  }

  const x = aligned.timeNs.map((time) => (time - startNs) / 1e9);

  return { data: [x, ...aligned.valueColumns], visibleSeries: aligned.alignedSeries };
}

function clampSeconds(value: number, endNs: number, startNs: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const endSeconds = Math.max((endNs - startNs) / 1e9, 0);
  return Math.min(endSeconds, Math.max(0, value));
}

function fullXRange(startNs: number, endNs: number): TimeSeriesXRange {
  return { minSec: 0, maxSec: Math.max((endNs - startNs) / 1e9, 0) };
}

function rangeEquals(left: TimeSeriesXRange | null, right: TimeSeriesXRange | null): boolean {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }
  return Math.abs(left.minSec - right.minSec) < 1e-9 &&
    Math.abs(left.maxSec - right.maxSec) < 1e-9;
}

function normalizeXRange(
  range: TimeSeriesXRange,
  startNs: number,
  endNs: number,
): TimeSeriesXRange {
  const full = fullXRange(startNs, endNs);
  const fullSpan = full.maxSec - full.minSec;
  if (fullSpan <= 0) {
    return full;
  }

  let min = Number.isFinite(range.minSec) ? range.minSec : full.minSec;
  let max = Number.isFinite(range.maxSec) ? range.maxSec : full.maxSec;
  if (min > max) {
    [min, max] = [max, min];
  }

  const span = max - min;
  if (span >= fullSpan) {
    return full;
  }

  const minSpan = Math.min(fullSpan, Math.max(MIN_X_SPAN_SECONDS, fullSpan / 1_000_000));
  if (span < minSpan) {
    const center = (min + max) / 2;
    min = center - minSpan / 2;
    max = center + minSpan / 2;
  }

  if (min < full.minSec) {
    max += full.minSec - min;
    min = full.minSec;
  }
  if (max > full.maxSec) {
    min -= max - full.maxSec;
    max = full.maxSec;
  }

  min = Math.max(full.minSec, min);
  max = Math.min(full.maxSec, max);
  if (max - min >= fullSpan - 1e-9) {
    return full;
  }

  return { minSec: min, maxSec: max };
}

function normalizeControlledXRange(
  range: TimeSeriesXRange | null,
  startNs: number,
  endNs: number,
): TimeSeriesXRange | null {
  if (!range) {
    return null;
  }
  const normalized = normalizeXRange(range, startNs, endNs);
  return isFullXRange(normalized, startNs, endNs) ? null : normalized;
}

function isFullXRange(range: TimeSeriesXRange, startNs: number, endNs: number): boolean {
  return rangeEquals(range, fullXRange(startNs, endNs));
}

function toUPlotXRange(range: TimeSeriesXRange): { min: number; max: number } {
  return { min: range.minSec, max: range.maxSec };
}

function plotScaleMatches(plot: uPlot, range: TimeSeriesXRange): boolean {
  const scale = plot.scales.x;
  return typeof scale.min === "number" &&
    typeof scale.max === "number" &&
    Math.abs(scale.min - range.minSec) < 1e-9 &&
    Math.abs(scale.max - range.maxSec) < 1e-9;
}

function buildAxisAssignments(visibleSeries: TimeSeriesPlotSeries[]): AxisAssignment[] {
  return visibleSeries.map((item, index) => ({
    scaleKey: `y${index}`,
    axisVisible: index < MAX_VISIBLE_Y_AXES,
    color: item.color,
    side: index % 2 === 0 ? AXIS_SIDE_LEFT : AXIS_SIDE_RIGHT,
  }));
}

export function PlotCanvas({
  series,
  startNs,
  endNs,
  currentTimeNs,
  xRange,
  onXRangeChange,
  onSeekTimeNs,
  onDropFieldKey,
  onToggleSeriesVisible,
  timeFormat = "relative",
  yRange = null,
  compact = false,
  plotLabel,
}: PlotCanvasProps) {
  const shellRef = useRef<HTMLDivElement | null>(null);
  const plotRootRef = useRef<HTMLDivElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const plotRef = useRef<uPlot | null>(null);
  const xRangeRef = useRef<TimeSeriesXRange | null>(null);
  const currentTimeNsRef = useRef(currentTimeNs);
  const programmaticCursorRef = useRef(false);
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });
  const [dropActive, setDropActive] = useState(false);
  const plotData = useMemo(() => buildPlotData(series, startNs), [series, startNs]);
  const fixedYRange = useMemo(() => normalizeYRange(yRange), [yRange?.max, yRange?.min]);
  const hasData = plotData.visibleSeries.length > 0;
  const hasPlotLabel = Boolean(plotLabel);
  const hasLegend = !compact && series.length > 0 && Boolean(onToggleSeriesVisible);

  const commitXRange = useCallback((range: TimeSeriesXRange | null) => {
    const next = normalizeControlledXRange(range, startNs, endNs);
    if (rangeEquals(xRangeRef.current, next)) {
      return;
    }
    xRangeRef.current = next;
    onXRangeChange(next);
  }, [endNs, onXRangeChange, startNs]);

  const syncCursorToCurrentTime = useCallback((plot: uPlot) => {
    const xSeconds = (currentTimeNsRef.current - startNs) / 1e9;
    const startSeconds = typeof plot.scales.x.min === "number" ? plot.scales.x.min : 0;
    const endSeconds = typeof plot.scales.x.max === "number"
      ? plot.scales.x.max
      : Math.max((endNs - startNs) / 1e9, startSeconds);
    programmaticCursorRef.current = true;
    if (xSeconds < startSeconds || xSeconds > endSeconds) {
      try {
        plot.setCursor({ left: -10, top: 0 }, false);
      } finally {
        programmaticCursorRef.current = false;
      }
      return;
    }

    try {
      plot.setCursor({ left: plot.valToPos(xSeconds, "x"), top: 0 }, false);
    } finally {
      programmaticCursorRef.current = false;
    }
  }, [endNs, startNs]);

  const applyXRange = useCallback((plot: uPlot, range: TimeSeriesXRange | null) => {
    const full = fullXRange(startNs, endNs);
    const normalized = normalizeControlledXRange(range, startNs, endNs);
    const nextScale = normalized ?? full;
    if (!plotScaleMatches(plot, nextScale)) {
      plot.setScale("x", toUPlotXRange(nextScale));
    }
    commitXRange(normalized);
    syncCursorToCurrentTime(plot);
  }, [commitXRange, endNs, startNs, syncCursorToCurrentTime]);

  useEffect(() => {
    currentTimeNsRef.current = currentTimeNs;
  }, [currentTimeNs]);

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) {
      return undefined;
    }
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }
      const width = Math.max(0, Math.floor(entry.contentRect.width));
      const height = Math.max(0, Math.floor(entry.contentRect.height));
      setSize((current) =>
        current.width === width && current.height === height ? current : { width, height },
      );
    });
    observer.observe(shell);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const normalized = normalizeControlledXRange(xRange, startNs, endNs);
    xRangeRef.current = normalized;
    if (!rangeEquals(xRange, normalized)) {
      onXRangeChange(normalized);
    }

    const plot = plotRef.current;
    if (!plot) {
      return;
    }

    const nextScale = normalized ?? fullXRange(startNs, endNs);
    if (!plotScaleMatches(plot, nextScale)) {
      plot.setScale("x", toUPlotXRange(nextScale));
    }
    syncCursorToCurrentTime(plot);
  }, [endNs, onXRangeChange, startNs, syncCursorToCurrentTime, xRange]);

  useEffect(() => {
    const plotRoot = plotRootRef.current;
    if (!plotRoot || !hasData || size.width < 120 || size.height < 160) {
      hideTooltip(tooltipRef.current);
      plotRef.current?.destroy();
      plotRef.current = null;
      return undefined;
    }

    hideTooltip(tooltipRef.current);
    plotRoot.replaceChildren();
    const axisAssignments = buildAxisAssignments(plotData.visibleSeries);
    const initialXRange = xRangeRef.current
      ? normalizeXRange(xRangeRef.current, startNs, endNs)
      : fullXRange(startNs, endNs);
    const scales: NonNullable<Options["scales"]> = {
      x: {
        time: false,
        min: initialXRange.minSec,
        max: initialXRange.maxSec,
      },
    };
    for (const assignment of axisAssignments) {
      scales[assignment.scaleKey] = fixedYRange
        ? { auto: false, range: [fixedYRange.min, fixedYRange.max] }
        : { auto: true };
    }

    const options: Options = {
      width: size.width,
      height: size.height,
      padding: [hasLegend ? 30 : hasPlotLabel ? 24 : 12, 8, 0, 8],
      cursor: {
        show: true,
        x: true,
        y: false,
        points: { show: false },
        drag: {
          x: true,
          y: false,
          setScale: true,
          dist: DRAG_CLICK_THRESHOLD_PX,
        },
      },
      legend: {
        show: false,
      },
      scales,
      axes: [
        {
          stroke: "#94a3b8",
          grid: { stroke: "rgba(148, 163, 184, 0.18)", width: 1 },
          values: (_plot, values) => values.map((value) =>
            timeFormat === "absolute"
              ? formatAbsoluteTime(value, startNs)
              : `${value.toFixed(1)}s`
          ),
        },
        ...axisAssignments
          .filter((assignment) => assignment.axisVisible)
          .map((assignment, axisIndex) => ({
            scale: assignment.scaleKey,
            side: assignment.side,
            size: 44,
            stroke: assignment.color,
            grid: axisIndex === 0
              ? { stroke: "rgba(148, 163, 184, 0.12)", width: 1 }
              : { show: false },
            ticks: { stroke: assignment.color, width: 1 },
            border: { stroke: assignment.color, width: 1 },
            values: (_plot: uPlot, values: number[]) => values.map(formatValue),
          })),
      ],
      series: [
        {},
        ...plotData.visibleSeries.map((item, index) => ({
          label: item.candidate.label,
          scale: axisAssignments[index]?.scaleKey,
          stroke: item.color,
          width: 2,
          points: { show: false },
          spanGaps: true,
        })),
      ],
      hooks: {
        setCursor: [
          (plotInstance) => {
            if (programmaticCursorRef.current) {
              return;
            }

            const tooltip = tooltipRef.current;
            const shell = shellRef.current;
            if (!tooltip || !shell) {
              return;
            }

            const index = plotInstance.cursor.idx;
            if (index == null || index < 0) {
              hideTooltip(tooltip);
              return;
            }

            const cursorLeft = plotInstance.cursor.left;
            if (typeof cursorLeft !== "number" || cursorLeft < 0) {
              hideTooltip(tooltip);
              return;
            }

            const xValue = plotInstance.data[0]?.[index];
            if (typeof xValue !== "number" || !Number.isFinite(xValue)) {
              hideTooltip(tooltip);
              return;
            }

            const cursorTop = typeof plotInstance.cursor.top === "number"
              ? plotInstance.cursor.top
              : 0;
            const timeLabel = timeFormat === "absolute"
              ? formatAbsoluteTime(xValue, startNs)
              : `${xValue.toFixed(2)}s`;

            renderTooltipContent(tooltip, timeLabel, plotData, plotInstance.data, index);
            positionTooltip(tooltip, shell, plotInstance, cursorLeft, cursorTop);
          },
        ],
        setScale: [
          (plotInstance, scaleKey) => {
            if (scaleKey !== "x") {
              return;
            }
            const scale = plotInstance.scales.x;
            if (typeof scale.min !== "number" || typeof scale.max !== "number") {
              return;
            }
            commitXRange({ minSec: scale.min, maxSec: scale.max });
            queueMicrotask(() => {
              if (plotRef.current === plotInstance) {
                syncCursorToCurrentTime(plotInstance);
              }
            });
          },
        ],
      },
    };

    const plot = new uPlot(options, plotData.data, plotRoot);
    plotRef.current = plot;

    const currentScaleRange = (): TimeSeriesXRange => {
      const scale = plot.scales.x;
      if (typeof scale.min === "number" && typeof scale.max === "number") {
        return normalizeXRange({ minSec: scale.min, maxSec: scale.max }, startNs, endNs);
      }
      return fullXRange(startNs, endNs);
    };
    const seekFromMouse = (event: MouseEvent) => {
      const rect = plot.over.getBoundingClientRect();
      const left = event.clientX - rect.left;
      const xSeconds = clampSeconds(plot.posToVal(left, "x"), endNs, startNs);
      onSeekTimeNs(startNs + xSeconds * 1e9);
    };
    let clickStart: { x: number; y: number } | null = null;
    let suppressNextClick = false;
    const onMouseDown = (event: MouseEvent) => {
      if (event.button !== 0) {
        return;
      }
      clickStart = { x: event.clientX, y: event.clientY };
    };
    const onMouseUp = (event: MouseEvent) => {
      if (event.button !== 0 || !clickStart) {
        clickStart = null;
        return;
      }
      const dx = event.clientX - clickStart.x;
      const dy = event.clientY - clickStart.y;
      suppressNextClick = Math.hypot(dx, dy) >= DRAG_CLICK_THRESHOLD_PX;
      clickStart = null;
    };
    const onClick = (event: MouseEvent) => {
      if (event.button !== 0) {
        return;
      }
      if (suppressNextClick) {
        suppressNextClick = false;
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      seekFromMouse(event);
      event.preventDefault();
    };
    const onDoubleClick = (event: MouseEvent) => {
      applyXRange(plot, null);
      event.preventDefault();
      event.stopPropagation();
    };
    const onMouseLeave = () => {
      hideTooltip(tooltipRef.current);
    };
    const onWheel = (event: WheelEvent) => {
      const current = currentScaleRange();
      const currentSpan = current.maxSec - current.minSec;
      if (currentSpan <= 0) {
        return;
      }

      event.preventDefault();
      const rect = plot.over.getBoundingClientRect();
      if (event.shiftKey) {
        const rawDelta = Math.abs(event.deltaX) > Math.abs(event.deltaY)
          ? event.deltaX
          : event.deltaY;
        const panSeconds = (rawDelta / Math.max(rect.width, 1)) * currentSpan;
        applyXRange(plot, {
          minSec: current.minSec + panSeconds,
          maxSec: current.maxSec + panSeconds,
        });
        return;
      }

      const cursorLeft = event.clientX - rect.left;
      const anchor = clampSeconds(plot.posToVal(cursorLeft, "x"), endNs, startNs);
      const anchorRatio = currentSpan > 0 ? (anchor - current.minSec) / currentSpan : 0.5;
      const boundedAnchorRatio = Math.min(1, Math.max(0, anchorRatio));
      const zoomFactor = event.deltaY > 0 ? WHEEL_ZOOM_FACTOR : 1 / WHEEL_ZOOM_FACTOR;
      const nextSpan = currentSpan * zoomFactor;
      applyXRange(plot, {
        minSec: anchor - nextSpan * boundedAnchorRatio,
        maxSec: anchor + nextSpan * (1 - boundedAnchorRatio),
      });
    };

    plot.over.addEventListener("mouseleave", onMouseLeave);
    plot.over.addEventListener("mousedown", onMouseDown);
    plot.over.addEventListener("mouseup", onMouseUp);
    plot.over.addEventListener("click", onClick);
    plot.over.addEventListener("dblclick", onDoubleClick);
    plot.over.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      plot.over.removeEventListener("mouseleave", onMouseLeave);
      plot.over.removeEventListener("mousedown", onMouseDown);
      plot.over.removeEventListener("mouseup", onMouseUp);
      plot.over.removeEventListener("click", onClick);
      plot.over.removeEventListener("dblclick", onDoubleClick);
      plot.over.removeEventListener("wheel", onWheel);
      hideTooltip(tooltipRef.current);
      plot.destroy();
      if (plotRef.current === plot) {
        plotRef.current = null;
      }
    };
  }, [
    applyXRange,
    commitXRange,
    endNs,
    fixedYRange,
    hasLegend,
    hasPlotLabel,
    hasData,
    onSeekTimeNs,
    plotData,
    size,
    startNs,
    syncCursorToCurrentTime,
    timeFormat,
  ]);

  useEffect(() => {
    const plot = plotRef.current;
    if (!plot || !hasData) {
      return;
    }

    currentTimeNsRef.current = currentTimeNs;
    syncCursorToCurrentTime(plot);
  }, [currentTimeNs, hasData, size, syncCursorToCurrentTime]);

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!onDropFieldKey) {
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setDropActive(true);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    if (!onDropFieldKey) {
      return;
    }
    event.preventDefault();
    setDropActive(false);
    const key = event.dataTransfer.getData(FIELD_DROP_TYPE) ||
      event.dataTransfer.getData("text/plain");
    if (key) {
      onDropFieldKey(key);
    }
  };

  const shellClassName = [
    dropActive ? styles.plotShellDropActive : styles.plotShell,
    compact ? styles.plotShellCompact : "",
  ].filter(Boolean).join(" ");

  return (
    <div
      ref={shellRef}
      className={shellClassName}
      data-visible-series={plotData.visibleSeries.length}
      data-x-zoomed={xRange ? "true" : "false"}
      onDragEnter={() => setDropActive(Boolean(onDropFieldKey))}
      onDragLeave={() => setDropActive(false)}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <div ref={plotRootRef} className={styles.plotRoot} />
      <div ref={tooltipRef} className={styles.tooltip} role="tooltip" />
      {plotLabel ? (
        <div className={styles.plotLabel}>
          <span
            className={styles.plotLabelSwatch}
            style={{ backgroundColor: plotLabel.color }}
            aria-hidden
          />
          <span>{plotLabel.label}</span>
        </div>
      ) : null}
      {hasLegend && onToggleSeriesVisible ? (
        <div className={styles.legend} aria-label="Plot series">
          {series.map((item) => (
            <button
              key={item.key}
              type="button"
              className={[
                styles.legendChip,
                item.visible ? "" : styles.legendChipHidden,
              ].filter(Boolean).join(" ")}
              onClick={() => onToggleSeriesVisible(item.key)}
              aria-pressed={item.visible}
              title={item.candidate.label}
            >
              <span
                className={styles.legendSwatch}
                style={{ backgroundColor: item.color }}
                aria-hidden
              />
              <span className={styles.legendLabel}>{item.candidate.label}</span>
            </button>
          ))}
        </div>
      ) : null}
      {!hasData ? <div className={styles.empty}>Add visible numeric fields to plot.</div> : null}
    </div>
  );
}
