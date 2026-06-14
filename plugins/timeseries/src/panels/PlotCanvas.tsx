import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
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

const FIELD_DROP_TYPE = "application/x-robotscope-timeseries-field";

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
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });
  const [dropActive, setDropActive] = useState(false);
  const plotData = useMemo(() => buildPlotData(series, startNs), [series, startNs]);
  const hasData = plotData.visibleSeries.length > 0;

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
    const plotRoot = plotRootRef.current;
    if (!plotRoot || !hasData || size.width < 120 || size.height < 160) {
      plotRef.current?.destroy();
      plotRef.current = null;
      return undefined;
    }

    plotRoot.replaceChildren();
    const options: Options = {
      width: size.width,
      height: size.height,
      padding: [12, 12, 0, 0],
      cursor: {
        show: true,
        x: true,
        y: false,
        points: { show: false },
        drag: { x: false, y: false, setScale: false },
      },
      legend: {
        show: false,
      },
      scales: {
        x: {
          time: false,
        },
      },
      axes: [
        {
          stroke: "#94a3b8",
          grid: { stroke: "rgba(148, 163, 184, 0.18)", width: 1 },
          values: (_plot, values) => values.map((value) => `${value.toFixed(1)}s`),
        },
        {
          stroke: "#94a3b8",
          grid: { stroke: "rgba(148, 163, 184, 0.12)", width: 1 },
          values: (_plot, values) => values.map(formatValue),
        },
      ],
      series: [
        {},
        ...plotData.visibleSeries.map((item) => ({
          label: item.candidate.label,
          stroke: item.color,
          width: 2,
          points: { show: false },
          spanGaps: true,
        })),
      ],
    };

    const plot = new uPlot(options, plotData.data, plotRoot);
    plotRef.current = plot;

    let seeking = false;
    const seekFromPointer = (event: PointerEvent) => {
      const rect = plot.over.getBoundingClientRect();
      const left = event.clientX - rect.left;
      const xSeconds = clampSeconds(plot.posToVal(left, "x"), endNs, startNs);
      onSeekTimeNs(startNs + xSeconds * 1e9);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) {
        return;
      }
      seeking = true;
      plot.over.setPointerCapture(event.pointerId);
      seekFromPointer(event);
      event.preventDefault();
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!seeking) {
        return;
      }
      seekFromPointer(event);
      event.preventDefault();
    };
    const stopSeeking = (event: PointerEvent) => {
      if (!seeking) {
        return;
      }
      seeking = false;
      if (plot.over.hasPointerCapture(event.pointerId)) {
        plot.over.releasePointerCapture(event.pointerId);
      }
      event.preventDefault();
    };

    plot.over.addEventListener("pointerdown", onPointerDown);
    plot.over.addEventListener("pointermove", onPointerMove);
    plot.over.addEventListener("pointerup", stopSeeking);
    plot.over.addEventListener("pointercancel", stopSeeking);

    return () => {
      plot.over.removeEventListener("pointerdown", onPointerDown);
      plot.over.removeEventListener("pointermove", onPointerMove);
      plot.over.removeEventListener("pointerup", stopSeeking);
      plot.over.removeEventListener("pointercancel", stopSeeking);
      plot.destroy();
      if (plotRef.current === plot) {
        plotRef.current = null;
      }
    };
  }, [endNs, hasData, onSeekTimeNs, plotData, size, startNs]);

  useEffect(() => {
    const plot = plotRef.current;
    if (!plot || !hasData) {
      return;
    }

    const xSeconds = (currentTimeNs - startNs) / 1e9;
    const startSeconds = 0;
    const endSeconds = Math.max((endNs - startNs) / 1e9, startSeconds);
    if (xSeconds < startSeconds || xSeconds > endSeconds) {
      plot.setCursor({ left: -10, top: 0 }, false);
      return;
    }

    plot.setCursor({ left: plot.valToPos(xSeconds, "x"), top: 0 }, false);
  }, [currentTimeNs, endNs, hasData, size, startNs]);

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
