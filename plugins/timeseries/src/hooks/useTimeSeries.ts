import { isMcapQueryEngine, type QueryEngine, type SessionInfo } from "@robotscope/core";
import { useEffect, useMemo, useState } from "react";

import {
  listNumericFieldCandidates,
  pickDefaultNumericField,
} from "../field-catalog.js";
import type { NumericFieldCandidate, TimeSeriesSnapshot } from "../types.js";

export interface TimeSeriesDataState {
  snapshot: TimeSeriesSnapshot | null;
  loading: boolean;
}

export interface TimeSeriesViewerSlice {
  ingest: { engine: QueryEngine } | null;
  session: SessionInfo | null;
  currentTimeNs: number;
}

interface SeriesState {
  series: TimeSeriesSnapshot["series"];
  warnings: string[];
}

export function useTimeSeries(slice: TimeSeriesViewerSlice): TimeSeriesDataState {
  const [selectionKey, setSelectionKey] = useState<string | null>(null);
  const [seriesState, setSeriesState] = useState<SeriesState>({
    series: null,
    warnings: [],
  });
  const [loading, setLoading] = useState(false);

  const candidates = useMemo(
    () => listNumericFieldCandidates(slice.session),
    [slice.session],
  );
  const selection = useMemo<NumericFieldCandidate | null>(() => {
    if (selectionKey) {
      const selected = candidates.find((candidate) => candidate.key === selectionKey);
      if (selected) {
        return selected;
      }
    }
    return pickDefaultNumericField(candidates);
  }, [candidates, selectionKey]);

  useEffect(() => {
    const engine = slice.ingest?.engine;
    if (!engine || !slice.session || !isMcapQueryEngine(engine)) {
      setSeriesState({ series: null, warnings: [] });
      setLoading(false);
      return;
    }

    if (!selection) {
      setSeriesState({
        series: null,
        warnings: ["No numeric field candidates were found in this session."],
      });
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    void engine
      .getNumericSeries(
        selection.topic,
        selection.fieldPath,
        slice.session.start_ns,
        slice.session.end_ns,
        2000,
      )
      .then((series) => {
        if (cancelled) {
          return;
        }
        setSeriesState({
          series,
          warnings:
            series.t.length === 0
              ? [`${selection.topic} ${selection.fieldPath} did not resolve to numeric samples.`]
              : [],
        });
        setLoading(false);
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        const message = error instanceof Error ? error.message : String(error);
        setSeriesState({ series: null, warnings: [message] });
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [slice.ingest, slice.session, selection]);

  const snapshot = useMemo<TimeSeriesSnapshot | null>(() => {
    if (!slice.session) {
      return null;
    }
    return {
      session: slice.session,
      candidates,
      selection,
      series: seriesState.series,
      currentTimeNs: slice.currentTimeNs,
      startNs: slice.session.start_ns,
      endNs: slice.session.end_ns,
      warnings: seriesState.warnings,
      setSelectionKey,
    };
  }, [
    candidates,
    selection,
    seriesState,
    slice.currentTimeNs,
    slice.session,
  ]);

  return { snapshot, loading };
}
