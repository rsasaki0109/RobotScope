import type { NumericSeries, SessionInfo } from "@robotscope/core";

export interface NumericFieldCandidate {
  key: string;
  topic: string;
  fieldPath: string;
  label: string;
  schema: string;
}

export interface TimeSeriesSnapshot {
  session: SessionInfo;
  candidates: NumericFieldCandidate[];
  selection: NumericFieldCandidate | null;
  series: NumericSeries | null;
  currentTimeNs: number;
  startNs: number;
  endNs: number;
  warnings: string[];
  setSelectionKey: (key: string) => void;
}
