import type {
  BinaryOp,
  DerivedSeriesDef,
  DerivedSeriesKind,
} from "./types.js";

export interface PersistedSeriesSelection {
  key: string;
  color: string;
  visible: boolean;
}

export interface TimeSeriesPersistedState {
  series: PersistedSeriesSelection[];
  derived: DerivedSeriesDef[];
}

export const TIMESERIES_URL_PARAM = "ts";

type CompactVisible = 0 | 1;
type CompactSeriesSelection = [key: string, visible: CompactVisible, color: string];

interface CompactDerivedSeriesDef {
  i: string;
  k: DerivedSeriesKind;
  s: string[];
  w?: number;
  o?: BinaryOp;
  sc?: number;
  of?: number;
  c: string;
  v: CompactVisible;
}

interface CompactTimeSeriesState {
  s: CompactSeriesSelection[];
  d: CompactDerivedSeriesDef[];
}

const DERIVED_SERIES_KINDS: ReadonlySet<DerivedSeriesKind> = new Set([
  "moving-average",
  "derivative",
  "binary-op",
  "integral",
  "abs",
  "scale-offset",
]);

const BINARY_OPS: ReadonlySet<BinaryOp> = new Set([
  "add",
  "subtract",
  "multiply",
  "divide",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value != null && !Array.isArray(value);
}

function isDerivedSeriesKind(value: unknown): value is DerivedSeriesKind {
  return typeof value === "string" &&
    DERIVED_SERIES_KINDS.has(value as DerivedSeriesKind);
}

function isBinaryOp(value: unknown): value is BinaryOp {
  return typeof value === "string" && BINARY_OPS.has(value as BinaryOp);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function visibleToCompact(visible: boolean): CompactVisible {
  return visible ? 1 : 0;
}

function compactToVisible(value: unknown): boolean | null {
  if (value === 1) {
    return true;
  }
  if (value === 0) {
    return false;
  }
  return null;
}

function encodeBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function decodeBase64Url(value: string): string {
  if (!/^[A-Za-z0-9_-]*$/.test(value) || value.length % 4 === 1) {
    throw new Error("Invalid base64url input.");
  }

  let base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const paddingLength = base64.length % 4;
  if (paddingLength > 0) {
    base64 += "=".repeat(4 - paddingLength);
  }

  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new TextDecoder().decode(bytes);
}

function compactSeriesSelection(
  selection: PersistedSeriesSelection,
): CompactSeriesSelection {
  return [selection.key, visibleToCompact(selection.visible), selection.color];
}

function compactDerivedSeriesDef(def: DerivedSeriesDef): CompactDerivedSeriesDef {
  const compact: CompactDerivedSeriesDef = {
    i: def.id,
    k: def.kind,
    s: def.sourceKeys,
    c: def.color,
    v: visibleToCompact(def.visible),
  };

  if (isFiniteNumber(def.window)) {
    compact.w = def.window;
  }
  if (def.op != null) {
    compact.o = def.op;
  }
  if (isFiniteNumber(def.scale)) {
    compact.sc = def.scale;
  }
  if (isFiniteNumber(def.offset)) {
    compact.of = def.offset;
  }
  return compact;
}

function decodeCompactSeriesSelection(value: unknown): PersistedSeriesSelection | null {
  if (!Array.isArray(value) || value.length !== 3) {
    return null;
  }

  const [key, visibleRaw, color] = value;
  const visible = compactToVisible(visibleRaw);
  if (typeof key !== "string" || typeof color !== "string" || visible == null) {
    return null;
  }
  return { key, color, visible };
}

function decodeCompactDerivedSeriesDef(value: unknown): DerivedSeriesDef | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = value.i;
  const kind = value.k;
  const sourceKeys = value.s;
  const color = value.c;
  const visible = compactToVisible(value.v);
  if (
    typeof id !== "string" ||
    !isDerivedSeriesKind(kind) ||
    !Array.isArray(sourceKeys) ||
    !sourceKeys.every((sourceKey): sourceKey is string => typeof sourceKey === "string") ||
    typeof color !== "string" ||
    visible == null
  ) {
    return null;
  }

  const sourceCount = kind === "binary-op" ? 2 : 1;
  if (sourceKeys.length !== sourceCount) {
    return null;
  }

  const def: DerivedSeriesDef = {
    id,
    kind,
    sourceKeys,
    color,
    visible,
  };

  if (value.w !== undefined) {
    if (!isFiniteNumber(value.w)) {
      return null;
    }
    def.window = value.w;
  }
  if (value.o !== undefined) {
    if (!isBinaryOp(value.o)) {
      return null;
    }
    def.op = value.o;
  }
  if (value.sc !== undefined) {
    if (!isFiniteNumber(value.sc)) {
      return null;
    }
    def.scale = value.sc;
  }
  if (value.of !== undefined) {
    if (!isFiniteNumber(value.of)) {
      return null;
    }
    def.offset = value.of;
  }

  return def;
}

function decodeCompactTimeSeriesState(value: unknown): TimeSeriesPersistedState | null {
  if (!isRecord(value) || !Array.isArray(value.s) || !Array.isArray(value.d)) {
    return null;
  }

  const series: PersistedSeriesSelection[] = [];
  for (const item of value.s) {
    const selection = decodeCompactSeriesSelection(item);
    if (!selection) {
      return null;
    }
    series.push(selection);
  }

  const derived: DerivedSeriesDef[] = [];
  for (const item of value.d) {
    const def = decodeCompactDerivedSeriesDef(item);
    if (!def) {
      return null;
    }
    derived.push(def);
  }

  return { series, derived };
}

export function encodeTimeSeriesState(state: TimeSeriesPersistedState): string {
  const compact: CompactTimeSeriesState = {
    s: state.series.map(compactSeriesSelection),
    d: state.derived.map(compactDerivedSeriesDef),
  };
  return encodeBase64Url(JSON.stringify(compact));
}

export function decodeTimeSeriesState(raw: string): TimeSeriesPersistedState | null {
  try {
    const parsed = JSON.parse(decodeBase64Url(raw)) as unknown;
    return decodeCompactTimeSeriesState(parsed);
  } catch {
    return null;
  }
}
