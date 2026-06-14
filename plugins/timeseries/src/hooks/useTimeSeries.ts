import { isMcapQueryEngine, type QueryEngine, type SessionInfo } from "@robotscope/core";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  listNumericFieldCandidates,
  pickDefaultNumericField,
} from "../field-catalog.js";
import type { NumericFieldCandidate, TimeSeriesPlotSeries, TimeSeriesSnapshot } from "../types.js";

export interface TimeSeriesDataState {
  snapshot: TimeSeriesSnapshot | null;
  loading: boolean;
}

export interface TimeSeriesViewerSlice {
  ingest: { engine: QueryEngine } | null;
  session: SessionInfo | null;
  currentTimeNs: number;
  setCurrentTimeNs: (timeNs: number) => void;
}

interface SeriesSelection {
  key: string;
  color: string;
  visible: boolean;
}

interface SeriesState {
  seriesByKey: Map<string, TimeSeriesPlotSeries["series"]>;
  warnings: string[];
}

const SERIES_COLORS = [
  "#38bdf8",
  "#f97316",
  "#22c55e",
  "#e879f9",
  "#facc15",
  "#a78bfa",
  "#2dd4bf",
  "#fb7185",
];

function nextSeriesColor(selections: SeriesSelection[]): string {
  const used = new Set(selections.map((selection) => selection.color));
  return SERIES_COLORS.find((color) => !used.has(color)) ??
    SERIES_COLORS[selections.length % SERIES_COLORS.length]!;
}

function clampTimeNs(timeNs: number, session: SessionInfo): number {
  return Math.min(session.end_ns, Math.max(session.start_ns, Math.round(timeNs)));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function useTimeSeries(slice: TimeSeriesViewerSlice): TimeSeriesDataState {
  const [seriesSelections, setSeriesSelections] = useState<SeriesSelection[]>([]);
  const [seriesState, setSeriesState] = useState<SeriesState>({
    seriesByKey: new Map(),
    warnings: [],
  });
  const [loading, setLoading] = useState(false);

  const candidates = useMemo(
    () => listNumericFieldCandidates(slice.session),
    [slice.session],
  );

  const candidateByKey = useMemo(() => {
    const next = new Map<string, NumericFieldCandidate>();
    for (const candidate of candidates) {
      next.set(candidate.key, candidate);
    }
    return next;
  }, [candidates]);

  useEffect(() => {
    setSeriesSelections((current) => {
      const valid = current.filter((selection) => candidateByKey.has(selection.key));
      if (valid.length > 0 || candidates.length === 0) {
        return valid;
      }

      const defaultCandidate = pickDefaultNumericField(candidates);
      return defaultCandidate
        ? [{ key: defaultCandidate.key, color: SERIES_COLORS[0]!, visible: true }]
        : [];
    });
  }, [candidateByKey, candidates]);

  const selectedCandidates = useMemo(() => {
    return seriesSelections
      .map((selection) => {
        const candidate = candidateByKey.get(selection.key);
        return candidate ? { ...selection, candidate } : null;
      })
      .filter((selection): selection is SeriesSelection & { candidate: NumericFieldCandidate } =>
        selection != null,
      );
  }, [candidateByKey, seriesSelections]);

  const selectedKeysSignature = useMemo(() => {
    return seriesSelections.map((selection) => selection.key).join("\n");
  }, [seriesSelections]);

  const selectedFetchCandidates = useMemo(() => {
    return seriesSelections
      .map((selection) => {
        const candidate = candidateByKey.get(selection.key);
        return candidate ? { key: selection.key, candidate } : null;
      })
      .filter((selection): selection is { key: string; candidate: NumericFieldCandidate } =>
        selection != null,
      );
  }, [candidateByKey, selectedKeysSignature]);

  const addSeriesKey = useCallback((key: string) => {
    if (!candidateByKey.has(key)) {
      return;
    }
    setSeriesSelections((current) => {
      if (current.some((selection) => selection.key === key)) {
        return current;
      }
      return [...current, { key, color: nextSeriesColor(current), visible: true }];
    });
  }, [candidateByKey]);

  const removeSeriesKey = useCallback((key: string) => {
    setSeriesSelections((current) => current.filter((selection) => selection.key !== key));
  }, []);

  const toggleSeriesVisible = useCallback((key: string) => {
    setSeriesSelections((current) =>
      current.map((selection) =>
        selection.key === key
          ? { ...selection, visible: !selection.visible }
          : selection,
      ),
    );
  }, []);

  const seekToTimeNs = useCallback((timeNs: number) => {
    if (!slice.session) {
      return;
    }
    slice.setCurrentTimeNs(clampTimeNs(timeNs, slice.session));
  }, [slice.session, slice.setCurrentTimeNs]);

  useEffect(() => {
    const engine = slice.ingest?.engine;
    const session = slice.session;
    if (!engine || !session || !isMcapQueryEngine(engine)) {
      setSeriesState({ seriesByKey: new Map(), warnings: [] });
      setLoading(false);
      return;
    }

    if (candidates.length === 0) {
      setSeriesState({
        seriesByKey: new Map(),
        warnings: ["No numeric field candidates were found in this session."],
      });
      setLoading(false);
      return;
    }

    if (selectedFetchCandidates.length === 0) {
      setSeriesState({ seriesByKey: new Map(), warnings: [] });
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    void Promise.all(
      selectedFetchCandidates.map(async (selection) => {
        try {
          const series = await engine.getNumericSeries(
            selection.candidate.topic,
            selection.candidate.fieldPath,
            session.start_ns,
            session.end_ns,
            2000,
          );
          return { selection, series, warning: null as string | null };
        } catch (error: unknown) {
          return {
            selection,
            series: null,
            warning: `${selection.candidate.label}: ${errorMessage(error)}`,
          };
        }
      }),
    )
      .then((results) => {
        if (cancelled) {
          return;
        }
        const seriesByKey = new Map<string, TimeSeriesPlotSeries["series"]>();
        const warnings: string[] = [];
        for (const result of results) {
          seriesByKey.set(result.selection.key, result.series);
          if (result.warning) {
            warnings.push(result.warning);
          } else if (result.series && result.series.t.length === 0) {
            warnings.push(
              `${result.selection.candidate.topic} ${result.selection.candidate.fieldPath} did not resolve to numeric samples.`,
            );
          }
        }
        setSeriesState({ seriesByKey, warnings });
        setLoading(false);
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        setSeriesState({ seriesByKey: new Map(), warnings: [errorMessage(error)] });
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [candidates.length, selectedFetchCandidates, slice.ingest, slice.session]);

  const selectedSeries = useMemo<TimeSeriesPlotSeries[]>(() => {
    return selectedCandidates.map((selection) => ({
      key: selection.key,
      candidate: selection.candidate,
      color: selection.color,
      visible: selection.visible,
      series: seriesState.seriesByKey.get(selection.key) ?? null,
    }));
  }, [selectedCandidates, seriesState.seriesByKey]);

  const snapshot = useMemo<TimeSeriesSnapshot | null>(() => {
    if (!slice.session) {
      return null;
    }
    return {
      session: slice.session,
      candidates,
      selectedSeries,
      currentTimeNs: slice.currentTimeNs,
      startNs: slice.session.start_ns,
      endNs: slice.session.end_ns,
      warnings: seriesState.warnings,
      addSeriesKey,
      removeSeriesKey,
      toggleSeriesVisible,
      seekToTimeNs,
    };
  }, [
    addSeriesKey,
    candidates,
    removeSeriesKey,
    seekToTimeNs,
    selectedSeries,
    seriesState.warnings,
    slice.currentTimeNs,
    slice.session,
    toggleSeriesVisible,
  ]);

  return { snapshot, loading };
}
