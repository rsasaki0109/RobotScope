import type { NumericSeries } from "@robotscope/core";

import type {
  BinaryOp,
  DerivedSeriesDef,
  NumericFieldCandidate,
  TimeSeriesPlotSeries,
} from "./types.js";

export const DERIVED_SERIES_KEY_PREFIX = "derived:";

interface DerivedBuildResult {
  series: TimeSeriesPlotSeries[];
  warnings: string[];
}

interface ComputedSeriesResult {
  series: NumericSeries | null;
  warning: string | null;
}

interface FiniteSamples {
  t: number[];
  v: number[];
}

const BINARY_OP_SYMBOL: Record<BinaryOp, string> = {
  add: "+",
  subtract: "-",
  multiply: "*",
  divide: "/",
};

function normalizeWindowSize(windowSize: number | undefined, fallback = 1): number {
  const normalized = Math.floor(windowSize ?? fallback);
  return Number.isFinite(normalized) && normalized >= 1 ? normalized : 1;
}

function seriesFromArrays(t: number[], v: number[]): NumericSeries {
  return {
    t: Float64Array.from(t),
    v: Float64Array.from(v),
  };
}

export function derivedSeriesKey(id: string): string {
  return `${DERIVED_SERIES_KEY_PREFIX}${id}`;
}

export function isDerivedSeriesKey(key: string): boolean {
  return key.startsWith(DERIVED_SERIES_KEY_PREFIX);
}

export function derivedSeriesIdFromKey(key: string): string | null {
  return isDerivedSeriesKey(key) ? key.slice(DERIVED_SERIES_KEY_PREFIX.length) : null;
}

function finiteSamples(series: NumericSeries | null): FiniteSamples {
  if (!series) {
    return { t: [], v: [] };
  }

  const length = Math.min(series.t.length, series.v.length);
  const t: number[] = [];
  const v: number[] = [];
  for (let i = 0; i < length; i += 1) {
    const timeNs = series.t[i]!;
    const value = series.v[i]!;
    if (Number.isFinite(timeNs) && Number.isFinite(value)) {
      t.push(timeNs);
      v.push(value);
    }
  }
  return { t, v };
}

function hasSamples(series: TimeSeriesPlotSeries): boolean {
  return series.series != null && series.series.t.length > 0 && series.series.v.length > 0;
}

function movingAverage(source: TimeSeriesPlotSeries, windowSize: number): ComputedSeriesResult {
  if (!hasSamples(source)) {
    return {
      series: null,
      warning: "source series has no numeric samples.",
    };
  }

  const samples = finiteSamples(source.series);
  if (samples.t.length === 0) {
    return {
      series: null,
      warning: "source series has no finite numeric samples.",
    };
  }

  const t: number[] = [];
  const v: number[] = [];
  let sum = 0;
  for (let i = 0; i < samples.v.length; i += 1) {
    sum += samples.v[i]!;
    if (i >= windowSize) {
      sum -= samples.v[i - windowSize]!;
    }
    const count = Math.min(i + 1, windowSize);
    const average = sum / count;
    if (Number.isFinite(average)) {
      t.push(samples.t[i]!);
      v.push(average);
    }
  }

  return t.length > 0
    ? { series: seriesFromArrays(t, v), warning: null }
    : {
        series: null,
        warning: "moving average produced no finite samples.",
      };
}

function derivative(source: TimeSeriesPlotSeries): ComputedSeriesResult {
  if (!hasSamples(source)) {
    return {
      series: null,
      warning: "source series has no numeric samples.",
    };
  }

  const samples = finiteSamples(source.series);
  if (samples.t.length < 2) {
    return {
      series: null,
      warning: "derivative needs at least two finite samples.",
    };
  }

  const t: number[] = [];
  const v: number[] = [];
  for (let i = 1; i < samples.t.length; i += 1) {
    const dtSec = (samples.t[i]! - samples.t[i - 1]!) / 1e9;
    if (!Number.isFinite(dtSec) || dtSec === 0) {
      continue;
    }
    const value = (samples.v[i]! - samples.v[i - 1]!) / dtSec;
    if (Number.isFinite(value)) {
      t.push(samples.t[i]!);
      v.push(value);
    }
  }

  return t.length > 0
    ? { series: seriesFromArrays(t, v), warning: null }
    : {
        series: null,
        warning: "derivative produced no finite samples.",
      };
}

function integral(source: TimeSeriesPlotSeries): ComputedSeriesResult {
  if (!hasSamples(source)) {
    return {
      series: null,
      warning: "source series has no numeric samples.",
    };
  }

  const samples = finiteSamples(source.series);
  if (samples.t.length < 2) {
    return {
      series: null,
      warning: "integral needs at least two finite samples.",
    };
  }

  const t: number[] = [samples.t[0]!];
  const v: number[] = [0];
  let acc = 0;
  for (let i = 1; i < samples.t.length; i += 1) {
    const dtSec = (samples.t[i]! - samples.t[i - 1]!) / 1e9;
    if (!Number.isFinite(dtSec) || dtSec <= 0) {
      continue;
    }

    acc += ((samples.v[i]! + samples.v[i - 1]!) / 2) * dtSec;
    if (Number.isFinite(acc)) {
      t.push(samples.t[i]!);
      v.push(acc);
    }
  }

  return t.length > 0
    ? { series: seriesFromArrays(t, v), warning: null }
    : {
        series: null,
        warning: "integral produced no finite samples.",
      };
}

function absValue(source: TimeSeriesPlotSeries): ComputedSeriesResult {
  if (!hasSamples(source)) {
    return {
      series: null,
      warning: "source series has no numeric samples.",
    };
  }

  const samples = finiteSamples(source.series);
  if (samples.t.length === 0) {
    return {
      series: null,
      warning: "source series has no finite numeric samples.",
    };
  }

  const t: number[] = [];
  const v: number[] = [];
  for (let i = 0; i < samples.t.length; i += 1) {
    const value = Math.abs(samples.v[i]!);
    if (Number.isFinite(value)) {
      t.push(samples.t[i]!);
      v.push(value);
    }
  }

  return t.length > 0
    ? { series: seriesFromArrays(t, v), warning: null }
    : {
        series: null,
        warning: "absolute value produced no finite samples.",
      };
}

function scaleOffset(
  source: TimeSeriesPlotSeries,
  scale: number,
  offset: number,
): ComputedSeriesResult {
  if (!hasSamples(source)) {
    return {
      series: null,
      warning: "source series has no numeric samples.",
    };
  }

  const samples = finiteSamples(source.series);
  if (samples.t.length === 0) {
    return {
      series: null,
      warning: "source series has no finite numeric samples.",
    };
  }

  const t: number[] = [];
  const v: number[] = [];
  for (let i = 0; i < samples.t.length; i += 1) {
    const value = scale * samples.v[i]! + offset;
    if (Number.isFinite(value)) {
      t.push(samples.t[i]!);
      v.push(value);
    }
  }

  return t.length > 0
    ? { series: seriesFromArrays(t, v), warning: null }
    : {
        series: null,
        warning: "scale-offset produced no finite samples.",
      };
}

function applyBinaryOp(left: number, right: number, op: BinaryOp): number | null {
  switch (op) {
    case "add":
      return left + right;
    case "subtract":
      return left - right;
    case "multiply":
      return left * right;
    case "divide":
      return right === 0 ? null : left / right;
  }
  return null;
}

function binaryOp(
  left: TimeSeriesPlotSeries,
  right: TimeSeriesPlotSeries,
  op: BinaryOp,
): ComputedSeriesResult {
  if (!hasSamples(left) || !hasSamples(right)) {
    return {
      series: null,
      warning: "source series has no numeric samples.",
    };
  }

  const leftSamples = finiteSamples(left.series);
  const rightSamples = finiteSamples(right.series);
  if (leftSamples.t.length === 0 || rightSamples.t.length === 0) {
    return {
      series: null,
      warning: "source series has no finite numeric samples.",
    };
  }

  const timeNs = new Set<number>();
  for (const time of leftSamples.t) {
    timeNs.add(time);
  }
  for (const time of rightSamples.t) {
    timeNs.add(time);
  }

  const alignedTimes = [...timeNs].sort((a, b) => a - b);
  const t: number[] = [];
  const v: number[] = [];
  let leftIndex = 0;
  let rightIndex = 0;
  let leftValue: number | null = null;
  let rightValue: number | null = null;

  for (const time of alignedTimes) {
    while (leftIndex < leftSamples.t.length && leftSamples.t[leftIndex]! <= time) {
      leftValue = leftSamples.v[leftIndex]!;
      leftIndex += 1;
    }
    while (rightIndex < rightSamples.t.length && rightSamples.t[rightIndex]! <= time) {
      rightValue = rightSamples.v[rightIndex]!;
      rightIndex += 1;
    }
    if (leftValue == null || rightValue == null) {
      continue;
    }

    const value = applyBinaryOp(leftValue, rightValue, op);
    if (value != null && Number.isFinite(value)) {
      t.push(time);
      v.push(value);
    }
  }

  return t.length > 0
    ? { series: seriesFromArrays(t, v), warning: null }
    : {
        series: null,
        warning: "operation produced no finite samples.",
      };
}

function sourceLabel(source: TimeSeriesPlotSeries | null, sourceKey: string | undefined): string {
  return source?.candidate.label ?? sourceKey ?? "missing";
}

function labelForDef(
  def: DerivedSeriesDef,
  left: TimeSeriesPlotSeries | null,
  right: TimeSeriesPlotSeries | null,
): string {
  if (def.kind === "moving-average") {
    const windowSize = normalizeWindowSize(def.window);
    return `avg${windowSize}(${sourceLabel(left, def.sourceKeys[0])})`;
  }
  if (def.kind === "derivative") {
    return `d/dt ${sourceLabel(left, def.sourceKeys[0])}`;
  }
  if (def.kind === "integral") {
    return `integral(${sourceLabel(left, def.sourceKeys[0])})`;
  }
  if (def.kind === "abs") {
    return `abs(${sourceLabel(left, def.sourceKeys[0])})`;
  }
  if (def.kind === "scale-offset") {
    const scale = Number.isFinite(def.scale) ? def.scale! : 1;
    const offset = Number.isFinite(def.offset) ? def.offset! : 0;
    return `${scale}*${sourceLabel(left, def.sourceKeys[0])} + ${offset}`;
  }

  const op = def.op ?? "add";
  return `${sourceLabel(left, def.sourceKeys[0])} ${BINARY_OP_SYMBOL[op]} ${sourceLabel(right, def.sourceKeys[1])}`;
}

function candidateForDef(def: DerivedSeriesDef, label: string): NumericFieldCandidate {
  return {
    key: derivedSeriesKey(def.id),
    topic: "",
    fieldPath: label,
    schema: "derived",
    label,
  };
}

function computeDerivedSeries(
  def: DerivedSeriesDef,
  sourceByKey: Map<string, TimeSeriesPlotSeries>,
): { item: TimeSeriesPlotSeries; warning: string | null } {
  const left = sourceByKey.get(def.sourceKeys[0] ?? "") ?? null;
  const right = def.kind === "binary-op"
    ? sourceByKey.get(def.sourceKeys[1] ?? "") ?? null
    : null;
  const label = labelForDef(def, left, right);
  const itemBase = {
    key: derivedSeriesKey(def.id),
    candidate: candidateForDef(def, label),
    color: def.color,
    visible: def.visible,
  };

  if (!left || (def.kind === "binary-op" && !right)) {
    return {
      item: { ...itemBase, series: null },
      warning: `${label}: source series is not selected.`,
    };
  }

  const result = (() => {
    switch (def.kind) {
      case "moving-average":
        return movingAverage(left, normalizeWindowSize(def.window));
      case "derivative":
        return derivative(left);
      case "binary-op":
        return binaryOp(left, right!, def.op ?? "add");
      case "integral":
        return integral(left);
      case "abs":
        return absValue(left);
      case "scale-offset": {
        const scale = Number.isFinite(def.scale) ? def.scale! : 1;
        const offset = Number.isFinite(def.offset) ? def.offset! : 0;
        return scaleOffset(left, scale, offset);
      }
    }
  })();

  return {
    item: { ...itemBase, series: result.series },
    warning: result.warning ? `${label}: ${result.warning}` : null,
  };
}

export function buildDerivedTimeSeries(
  sourceSeries: TimeSeriesPlotSeries[],
  defs: DerivedSeriesDef[],
): DerivedBuildResult {
  const sourceByKey = new Map<string, TimeSeriesPlotSeries>();
  for (const series of sourceSeries) {
    if (!isDerivedSeriesKey(series.key)) {
      sourceByKey.set(series.key, series);
    }
  }

  const series: TimeSeriesPlotSeries[] = [];
  const warnings: string[] = [];
  for (const def of defs) {
    const result = computeDerivedSeries(def, sourceByKey);
    series.push(result.item);
    sourceByKey.set(result.item.key, result.item);
    if (result.warning) {
      warnings.push(result.warning);
    }
  }
  return { series, warnings };
}
