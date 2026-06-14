import { useEffect, useMemo, useRef, useState } from "react";
import uPlot from "uplot";
import type { AlignedData, Options } from "uplot";
import "uplot/dist/uPlot.min.css";

import type { NumericSeries } from "@robotscope/core";

import styles from "./PlotCanvas.module.css";

export interface PlotCanvasProps {
  series: NumericSeries | null;
  label: string;
  startNs: number;
  endNs: number;
  currentTimeNs: number;
}

interface Size {
  width: number;
  height: number;
}

function formatValue(value: number): string {
  if (Math.abs(value) >= 1000 || Math.abs(value) < 0.001) {
    return value.toExponential(2);
  }
  return value.toFixed(3).replace(/\.?0+$/, "");
}

function seriesToData(series: NumericSeries | null, startNs: number): AlignedData {
  if (!series || series.t.length === 0) {
    return [[], []];
  }
  const x: number[] = [];
  const y: number[] = [];
  for (let i = 0; i < series.t.length; i += 1) {
    x.push((series.t[i]! - startNs) / 1e9);
    y.push(series.v[i]!);
  }
  return [x, y];
}

export function PlotCanvas({
  series,
  label,
  startNs,
  endNs,
  currentTimeNs,
}: PlotCanvasProps) {
  const shellRef = useRef<HTMLDivElement | null>(null);
  const plotRootRef = useRef<HTMLDivElement | null>(null);
  const plotRef = useRef<uPlot | null>(null);
  const [size, setSize] = useState<Size>({ width: 0, height: 0 });
  const data = useMemo(() => seriesToData(series, startNs), [series, startNs]);
  const hasData = Boolean(series && series.t.length > 0);

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
        {
          label,
          stroke: "#38bdf8",
          width: 2,
          points: { show: false },
        },
      ],
    };

    const plot = new uPlot(options, data, plotRoot);
    plotRef.current = plot;
    return () => {
      plot.destroy();
      if (plotRef.current === plot) {
        plotRef.current = null;
      }
    };
  }, [data, hasData, label, size]);

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

  return (
    <div ref={shellRef} className={styles.plotShell}>
      <div ref={plotRootRef} className={styles.plotRoot} />
      {!hasData ? <div className={styles.empty}>No numeric samples</div> : null}
    </div>
  );
}
