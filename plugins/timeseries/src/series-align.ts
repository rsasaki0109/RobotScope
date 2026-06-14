import type { TimeSeriesPlotSeries } from "./types.js";

export interface AlignedTimeSeriesData {
  timeNs: number[];
  valueColumns: Array<Array<number | null>>;
  alignedSeries: TimeSeriesPlotSeries[];
}

export interface AlignTimeSeriesOptions {
  visibleOnly?: boolean;
  minTimeNs?: number;
  maxTimeNs?: number;
}

export function buildAlignedTimeSeriesData(
  series: TimeSeriesPlotSeries[],
  options: AlignTimeSeriesOptions = {},
): AlignedTimeSeriesData {
  const visibleOnly = options.visibleOnly ?? true;
  const minTimeNs = options.minTimeNs ?? Number.NEGATIVE_INFINITY;
  const maxTimeNs = options.maxTimeNs ?? Number.POSITIVE_INFINITY;
  const alignedSeries = series.filter((item) =>
    (!visibleOnly || item.visible) && item.series && item.series.t.length > 0,
  );

  if (alignedSeries.length === 0) {
    return { timeNs: [], valueColumns: [], alignedSeries: [] };
  }

  const timeSet = new Set<number>();
  for (const item of alignedSeries) {
    const itemSeries = item.series!;
    for (let i = 0; i < itemSeries.t.length; i += 1) {
      const timeNs = itemSeries.t[i]!;
      if (timeNs >= minTimeNs && timeNs <= maxTimeNs) {
        timeSet.add(timeNs);
      }
    }
  }

  const timeNs = [...timeSet].sort((left, right) => left - right);
  if (timeNs.length === 0) {
    return { timeNs: [], valueColumns: [], alignedSeries };
  }

  const indexByTime = new Map<number, number>();
  for (let i = 0; i < timeNs.length; i += 1) {
    indexByTime.set(timeNs[i]!, i);
  }

  const valueColumns = alignedSeries.map((item) => {
    const values = Array<number | null>(timeNs.length).fill(null);
    const itemSeries = item.series!;
    for (let i = 0; i < itemSeries.t.length; i += 1) {
      const sampleTimeNs = itemSeries.t[i]!;
      if (sampleTimeNs < minTimeNs || sampleTimeNs > maxTimeNs) {
        continue;
      }
      const index = indexByTime.get(sampleTimeNs);
      if (index != null) {
        values[index] = itemSeries.v[i]!;
      }
    }
    return values;
  });

  return { timeNs, valueColumns, alignedSeries };
}
