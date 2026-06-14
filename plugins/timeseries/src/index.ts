export type {
  NumericFieldCandidate,
  TimeSeriesSnapshot,
} from "./types.js";
export {
  listNumericFieldCandidates,
  pickDefaultNumericField,
} from "./field-catalog.js";
export { TIMESERIES_PLUGIN_MANIFEST } from "./manifest.js";
export { TimeSeriesDock } from "./TimeSeriesDock.js";
export { useTimeSeries } from "./hooks/useTimeSeries.js";
