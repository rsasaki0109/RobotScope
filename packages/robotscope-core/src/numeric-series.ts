import type { NumericSeries } from "./query.js";

export interface NumericPoint {
  t: number;
  v: number;
}

interface PathToken {
  key?: string;
  indexes: number[];
}

function parseFieldPath(fieldPath: string): PathToken[] {
  return fieldPath
    .split(".")
    .map((segment) => {
      const keyMatch = /^[^\[]+/.exec(segment);
      const key = keyMatch?.[0];
      const indexes = [...segment.matchAll(/\[(\d+)\]/g)].map((match) => Number(match[1]));
      return { key, indexes };
    })
    .filter((token) => token.key || token.indexes.length > 0);
}

function objectField(value: unknown, key: string): unknown {
  if (value == null || typeof value !== "object") {
    return undefined;
  }
  return (value as Record<string, unknown>)[key];
}

export function resolveFieldPath(value: unknown, fieldPath: string): unknown {
  let cursor = value;
  for (const token of parseFieldPath(fieldPath)) {
    if (token.key) {
      cursor = objectField(cursor, token.key);
    }

    for (const index of token.indexes) {
      if (!Array.isArray(cursor) && !(cursor instanceof Float32Array) && !(cursor instanceof Float64Array)) {
        return undefined;
      }
      cursor = cursor[index];
    }
  }
  return cursor;
}

export function numericValueAtPath(value: unknown, fieldPath: string): number | undefined {
  const resolved = resolveFieldPath(value, fieldPath);
  return typeof resolved === "number" && Number.isFinite(resolved) ? resolved : undefined;
}

function emptySeries(): NumericSeries {
  return {
    t: new Float64Array(),
    v: new Float64Array(),
  };
}

function evenlySample(points: NumericPoint[], maxPoints: number): NumericSeries {
  if (maxPoints <= 0 || points.length === 0) {
    return emptySeries();
  }
  if (points.length <= maxPoints) {
    return pointsToSeries(points);
  }

  const t = new Float64Array(maxPoints);
  const v = new Float64Array(maxPoints);
  const step = (points.length - 1) / Math.max(maxPoints - 1, 1);
  for (let i = 0; i < maxPoints; i += 1) {
    const point = points[Math.round(i * step)]!;
    t[i] = point.t;
    v[i] = point.v;
  }
  return { t, v };
}

function pointsToSeries(points: NumericPoint[]): NumericSeries {
  const t = new Float64Array(points.length);
  const v = new Float64Array(points.length);
  for (let i = 0; i < points.length; i += 1) {
    t[i] = points[i]!.t;
    v[i] = points[i]!.v;
  }
  return { t, v };
}

export function downsampleNumericPoints(
  points: NumericPoint[],
  maxPoints: number,
): NumericSeries {
  const target = Math.max(0, Math.floor(maxPoints));
  if (points.length === 0 || target === 0) {
    return emptySeries();
  }
  if (points.length <= target) {
    return pointsToSeries(points);
  }
  if (target < 3) {
    return evenlySample(points, target);
  }

  const firstTime = points[0]!.t;
  const lastTime = points[points.length - 1]!.t;
  const span = lastTime - firstTime;
  if (span <= 0) {
    return evenlySample(points, target);
  }

  const bucketCount = Math.max(1, Math.floor(target / 2));
  const buckets: Array<{
    minT: number;
    minV: number;
    maxT: number;
    maxV: number;
    seen: boolean;
  }> = Array.from({ length: bucketCount }, () => ({
    minT: 0,
    minV: Infinity,
    maxT: 0,
    maxV: -Infinity,
    seen: false,
  }));

  for (const point of points) {
    const ratio = (point.t - firstTime) / span;
    const index = Math.min(bucketCount - 1, Math.max(0, Math.floor(ratio * bucketCount)));
    const bucket = buckets[index]!;
    if (!bucket.seen || point.v < bucket.minV) {
      bucket.minT = point.t;
      bucket.minV = point.v;
    }
    if (!bucket.seen || point.v > bucket.maxV) {
      bucket.maxT = point.t;
      bucket.maxV = point.v;
    }
    bucket.seen = true;
  }

  const sampled: NumericPoint[] = [];
  for (const bucket of buckets) {
    if (!bucket.seen) {
      continue;
    }
    if (bucket.minT === bucket.maxT) {
      sampled.push({ t: bucket.minT, v: bucket.minV });
      continue;
    }
    if (bucket.minT < bucket.maxT) {
      sampled.push({ t: bucket.minT, v: bucket.minV }, { t: bucket.maxT, v: bucket.maxV });
    } else {
      sampled.push({ t: bucket.maxT, v: bucket.maxV }, { t: bucket.minT, v: bucket.minV });
    }
  }

  return pointsToSeries(sampled.slice(0, target));
}
