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

export interface TimeSeriesSnapshot {
  session: SessionInfo;
  candidates: NumericFieldCandidate[];
  selectedSeries: TimeSeriesPlotSeries[];
  currentTimeNs: number;
  startNs: number;
  endNs: number;
  warnings: string[];
  addSeriesKey: (key: string) => void;
  removeSeriesKey: (key: string) => void;
  toggleSeriesVisible: (key: string) => void;
  seekToTimeNs: (timeNs: number) => void;
}
