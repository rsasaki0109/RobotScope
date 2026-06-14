import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import uPlot from "uplot";
import type { AlignedData, Options } from "uplot";
import "uplot/dist/uPlot.min.css";

import type { TimeSeriesPlotSeries } from "../types.js";
import styles from "./PlotCanvas.module.css";

export interface PlotCanvasProps {
  series: TimeSeriesPlotSeries[];
  startNs: number;
  endNs: number;
  currentTimeNs: number;
  onSeekTimeNs: (timeNs: number) => void;
  onDropFieldKey?: (key: string) => void;
}

interface Size {
  width: number;
  height: number;
}

interface PlotData {
  data: AlignedData;
  visibleSeries: TimeSeriesPlotSeries[];
}

interface XRange {
  min: number;
  max: number;
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

function buildPlotData(series: TimeSeriesPlotSeries[], startNs: number): PlotData {
  const visibleSeries = series.filter((item) =>
    item.visible && item.series && item.series.t.length > 0,
  );
  if (visibleSeries.length === 0) {
    return { data: [[]], visibleSeries: [] };
  }

  const timeSet = new Set<number>();
  for (const item of visibleSeries) {
    const itemSeries = item.series!;
    for (let i = 0; i < itemSeries.t.length; i += 1) {
      timeSet.add(itemSeries.t[i]!);
    }
  }

  const timeNs = [...timeSet].sort((left, right) => left - right);
  const indexByTime = new Map<number, number>();
  for (let i = 0; i < timeNs.length; i += 1) {
    indexByTime.set(timeNs[i]!, i);
  }

  const x = timeNs.map((time) => (time - startNs) / 1e9);
  const yValues = visibleSeries.map((item) => {
    const values = Array<number | null>(timeNs.length).fill(null);
    const itemSeries = item.series!;
    for (let i = 0; i < itemSeries.t.length; i += 1) {
      const index = indexByTime.get(itemSeries.t[i]!);
      if (index != null) {
        values[index] = itemSeries.v[i]!;
      }
    }
    return values;
  });

  return { data: [x, ...yValues], visibleSeries };
}

function clampSeconds(value: number, endNs: number, startNs: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const endSeconds = Math.max((endNs - startNs) / 1e9, 0);
  return Math.min(endSeconds, Math.max(0, value));
}

function fullXRange(startNs: number, endNs: number): XRange {
  return { min: 0, max: Math.max((endNs - startNs) / 1e9, 0) };
}

function rangeEquals(left: XRange | null, right: XRange | null): boolean {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }
  return Math.abs(left.min - right.min) < 1e-9 && Math.abs(left.max - right.max) < 1e-9;
}

function normalizeXRange(range: XRange, startNs: number, endNs: number): XRange {
  const full = fullXRange(startNs, endNs);
  const fullSpan = full.max - full.min;
  if (fullSpan <= 0) {
    return full;
  }

  let min = Number.isFinite(range.min) ? range.min : full.min;
  let max = Number.isFinite(range.max) ? range.max : full.max;
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

  if (min < full.min) {
    max += full.min - min;
    min = full.min;
  }
  if (max > full.max) {
    min -= max - full.max;
    max = full.max;
  }

  min = Math.max(full.min, min);
  max = Math.min(full.max, max);
  if (max - min >= fullSpan - 1e-9) {
    return full;
  }

  return { min, max };
}

function isFullXRange(range: XRange, startNs: number, endNs: number): boolean {
  return rangeEquals(range, fullXRange(startNs, endNs));
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
  onSeekTimeNs,
  onDropFieldKey,
}: PlotCanvasProps) {
  const shellRef = useRef<HTMLDivElement | null>(null);
  const plotRootRef = useRef<HTMLDivElement | null>(null);
  const plotRef = useRef<uPlot | null>(null);
  const xRangeRef = useRef<XRange | null>(null);
  const currentTimeNsRef = useRef(currentTimeNs);
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });
  const [dropActive, setDropActive] = useState(false);
  const [xRange, setXRange] = useState<XRange | null>(null);
  const plotData = useMemo(() => buildPlotData(series, startNs), [series, startNs]);
  const hasData = plotData.visibleSeries.length > 0;

  const storeXRange = useCallback((range: XRange | null) => {
    const normalized = range ? normalizeXRange(range, startNs, endNs) : null;
    const next = normalized && !isFullXRange(normalized, startNs, endNs) ? normalized : null;
    xRangeRef.current = next;
    setXRange((current) => (rangeEquals(current, next) ? current : next));
  }, [endNs, startNs]);

  const syncCursorToCurrentTime = useCallback((plot: uPlot) => {
    const xSeconds = (currentTimeNsRef.current - startNs) / 1e9;
    const startSeconds = typeof plot.scales.x.min === "number" ? plot.scales.x.min : 0;
    const endSeconds = typeof plot.scales.x.max === "number"
      ? plot.scales.x.max
      : Math.max((endNs - startNs) / 1e9, startSeconds);
    if (xSeconds < startSeconds || xSeconds > endSeconds) {
      plot.setCursor({ left: -10, top: 0 }, false);
      return;
    }

    plot.setCursor({ left: plot.valToPos(xSeconds, "x"), top: 0 }, false);
  }, [endNs, startNs]);

  const applyXRange = useCallback((plot: uPlot, range: XRange | null) => {
    const full = fullXRange(startNs, endNs);
    const normalized = range ? normalizeXRange(range, startNs, endNs) : full;
    plot.setScale("x", normalized);
    storeXRange(normalized);
    syncCursorToCurrentTime(plot);
  }, [endNs, startNs, storeXRange, syncCursorToCurrentTime]);

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
    const storedRange = xRangeRef.current;
    if (!storedRange) {
      return;
    }

    const normalized = normalizeXRange(storedRange, startNs, endNs);
    storeXRange(normalized);
    const plot = plotRef.current;
    if (plot) {
      plot.setScale("x", normalized);
    }
  }, [endNs, startNs, storeXRange]);

  useEffect(() => {
    const plotRoot = plotRootRef.current;
    if (!plotRoot || !hasData || size.width < 120 || size.height < 160) {
      plotRef.current?.destroy();
      plotRef.current = null;
      return undefined;
    }

    plotRoot.replaceChildren();
    const axisAssignments = buildAxisAssignments(plotData.visibleSeries);
    const initialXRange = xRangeRef.current
      ? normalizeXRange(xRangeRef.current, startNs, endNs)
      : null;
    const scales: NonNullable<Options["scales"]> = {
      x: {
        time: false,
        ...(initialXRange ? { min: initialXRange.min, max: initialXRange.max } : {}),
      },
    };
    for (const assignment of axisAssignments) {
      scales[assignment.scaleKey] = { auto: true };
    }

    const options: Options = {
      width: size.width,
      height: size.height,
      padding: [12, 8, 0, 8],
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
          values: (_plot, values) => values.map((value) => `${value.toFixed(1)}s`),
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
        setScale: [
          (plotInstance, scaleKey) => {
            if (scaleKey !== "x") {
              return;
            }
            const scale = plotInstance.scales.x;
            if (typeof scale.min !== "number" || typeof scale.max !== "number") {
              return;
            }
            storeXRange({ min: scale.min, max: scale.max });
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

    const currentScaleRange = (): XRange => {
      const scale = plot.scales.x;
      if (typeof scale.min === "number" && typeof scale.max === "number") {
        return normalizeXRange({ min: scale.min, max: scale.max }, startNs, endNs);
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
    const onWheel = (event: WheelEvent) => {
      const current = currentScaleRange();
      const currentSpan = current.max - current.min;
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
        applyXRange(plot, { min: current.min + panSeconds, max: current.max + panSeconds });
        return;
      }

      const cursorLeft = event.clientX - rect.left;
      const anchor = clampSeconds(plot.posToVal(cursorLeft, "x"), endNs, startNs);
      const anchorRatio = currentSpan > 0 ? (anchor - current.min) / currentSpan : 0.5;
      const boundedAnchorRatio = Math.min(1, Math.max(0, anchorRatio));
      const zoomFactor = event.deltaY > 0 ? WHEEL_ZOOM_FACTOR : 1 / WHEEL_ZOOM_FACTOR;
      const nextSpan = currentSpan * zoomFactor;
      applyXRange(plot, {
        min: anchor - nextSpan * boundedAnchorRatio,
        max: anchor + nextSpan * (1 - boundedAnchorRatio),
      });
    };

    plot.over.addEventListener("mousedown", onMouseDown);
    plot.over.addEventListener("mouseup", onMouseUp);
    plot.over.addEventListener("click", onClick);
    plot.over.addEventListener("dblclick", onDoubleClick);
    plot.over.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      plot.over.removeEventListener("mousedown", onMouseDown);
      plot.over.removeEventListener("mouseup", onMouseUp);
      plot.over.removeEventListener("click", onClick);
      plot.over.removeEventListener("dblclick", onDoubleClick);
      plot.over.removeEventListener("wheel", onWheel);
      plot.destroy();
      if (plotRef.current === plot) {
        plotRef.current = null;
      }
    };
  }, [
    applyXRange,
    endNs,
    hasData,
    onSeekTimeNs,
    plotData,
    size,
    startNs,
    storeXRange,
    syncCursorToCurrentTime,
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

  return (
    <div
      ref={shellRef}
      className={dropActive ? styles.plotShellDropActive : styles.plotShell}
      data-visible-series={plotData.visibleSeries.length}
      data-x-zoomed={xRange ? "true" : "false"}
      onDragEnter={() => setDropActive(Boolean(onDropFieldKey))}
      onDragLeave={() => setDropActive(false)}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <div ref={plotRootRef} className={styles.plotRoot} />
      {!hasData ? <div className={styles.empty}>Add visible numeric fields to plot.</div> : null}
    </div>
  );
}
