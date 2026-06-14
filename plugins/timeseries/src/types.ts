import type { NumericSeries, SessionInfo } from "@robotscope/core";

export interface NumericFieldCandidate {
  key: string;
  topic: string;
  fieldPath: string;
  label: string;
  schema: string;
}

export interface TimeSeriesPlotSeries {
  key: string;
  candidate: NumericFieldCandidate;
  color: string;
  visible: boolean;
  series: NumericSeries | null;
}

export type DerivedSeriesKind =
  | "moving-average"
  | "derivative"
  | "binary-op"
  | "integral"
  | "abs"
  | "scale-offset";

export type BinaryOp = "add" | "subtract" | "multiply" | "divide";

export interface DerivedSeriesDef {
  id: string;
  kind: DerivedSeriesKind;
  sourceKeys: string[];
  window?: number;
  op?: BinaryOp;
  scale?: number;
  offset?: number;
  color: string;
  visible: boolean;
}

export type AddDerivedSeriesInput =
  Omit<DerivedSeriesDef, "id" | "color" | "visible"> &
  Partial<Pick<DerivedSeriesDef, "id" | "color" | "visible">>;

export interface TimeSeriesXRange {
  minSec: number;
  maxSec: number;
}

export interface TimeSeriesSnapshot {
  session: SessionInfo;
  candidates: NumericFieldCandidate[];
  selectedSeries: TimeSeriesPlotSeries[];
  currentTimeNs: number;
  startNs: number;
  endNs: number;
  warnings: string[];
  addSeriesKey: (key: string) => void;
  addDerivedSeries: (def: AddDerivedSeriesInput) => void;
  removeSeriesKey: (key: string) => void;
  toggleSeriesVisible: (key: string) => void;
  seekToTimeNs: (timeNs: number) => void;
}
