import type { NumericSeries, QueryEngine, SessionInfo } from "@robotscope/core";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  listNumericFieldCandidates,
  pickDefaultNumericField,
} from "../field-catalog.js";
import {
  buildDerivedTimeSeries,
  derivedSeriesIdFromKey,
  isDerivedSeriesKey,
} from "../derived-series.js";
import type {
  AddDerivedSeriesInput,
  BinaryOp,
  DerivedSeriesDef,
  DerivedSeriesKind,
  NumericFieldCandidate,
  TimeSeriesPlotSeries,
  TimeSeriesSnapshot,
  TimeSeriesXRange,
} from "../types.js";

export interface TimeSeriesDataState {
  snapshot: TimeSeriesSnapshot | null;
  loading: boolean;
}

export interface TimeSeriesViewerSlice {
  ingest: { engine: QueryEngine } | null;
  session: SessionInfo | null;
  currentTimeNs: number;
  setCurrentTimeNs: (timeNs: number) => void;
  xRange?: TimeSeriesXRange | null;
}

interface SeriesSelection {
  key: string;
  color: string;
  visible: boolean;
}

interface SeriesState {
  seriesByKey: Map<string, TimeSeriesPlotSeries["series"]>;
  warnings: string[];
  overviewSeriesByKey: Map<string, TimeSeriesPlotSeries["series"]>;
  overviewWarnings: string[];
  overviewRequestKey: string | null;
  displayedRequestKey: string | null;
}

interface NumericSeriesQueryEngine extends QueryEngine {
  getNumericSeries(
    topic: string,
    fieldPath: string,
    t0_ns: number,
    t1_ns: number,
    maxPoints?: number,
  ): Promise<NumericSeries>;
}

interface TimeSeriesFetchWindow {
  startNs: number;
  endNs: number;
  maxPoints: number;
  overview: boolean;
  key: string;
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
const MAX_SERIES_POINTS = 2000;
const WINDOW_FETCH_DEBOUNCE_MS = 200;

function hasNumericSeriesQueryEngine(engine: QueryEngine): engine is NumericSeriesQueryEngine {
  return typeof (engine as Partial<NumericSeriesQueryEngine>).getNumericSeries === "function";
}

function nextColor(usedColors: string[]): string {
  const used = new Set(usedColors);
  return SERIES_COLORS.find((color) => !used.has(color)) ??
    SERIES_COLORS[usedColors.length % SERIES_COLORS.length]!;
}

function clampTimeNs(timeNs: number, session: SessionInfo): number {
  return Math.min(session.end_ns, Math.max(session.start_ns, Math.round(timeNs)));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function clampRangeTimeNs(timeNs: number, session: SessionInfo): number {
  return Math.min(session.end_ns, Math.max(session.start_ns, Math.round(timeNs)));
}

function finiteSeconds(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

function buildFetchWindow(
  session: SessionInfo,
  xRange: TimeSeriesXRange | null | undefined,
): TimeSeriesFetchWindow {
  if (!xRange) {
    return {
      startNs: session.start_ns,
      endNs: session.end_ns,
      maxPoints: MAX_SERIES_POINTS,
      overview: true,
      key: `${session.source}|${session.path ?? ""}|${session.start_ns}|${session.end_ns}|full|${MAX_SERIES_POINTS}`,
    };
  }

  const fullSpanSec = Math.max((session.end_ns - session.start_ns) / 1e9, 0);
  let minSec = finiteSeconds(xRange.minSec, 0);
  let maxSec = finiteSeconds(xRange.maxSec, fullSpanSec);
  if (minSec > maxSec) {
    [minSec, maxSec] = [maxSec, minSec];
  }
  minSec = Math.min(fullSpanSec, Math.max(0, minSec));
  maxSec = Math.min(fullSpanSec, Math.max(0, maxSec));

  const startNs = clampRangeTimeNs(session.start_ns + minSec * 1e9, session);
  const endNs = clampRangeTimeNs(session.start_ns + maxSec * 1e9, session);

  return {
    startNs,
    endNs,
    maxPoints: MAX_SERIES_POINTS,
    overview: false,
    key: `${session.source}|${session.path ?? ""}|${session.start_ns}|${session.end_ns}|${startNs}|${endNs}|${MAX_SERIES_POINTS}`,
  };
}

function emptySeriesState(): SeriesState {
  return {
    seriesByKey: new Map(),
    warnings: [],
    overviewSeriesByKey: new Map(),
    overviewWarnings: [],
    overviewRequestKey: null,
    displayedRequestKey: null,
  };
}

function sanitizeDerivedId(id: string): string {
  const sanitized = id.trim().replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return sanitized || "series";
}

function uniqueDerivedId(baseId: string, defs: DerivedSeriesDef[]): string {
  const used = new Set(defs.map((def) => def.id));
  if (!used.has(baseId)) {
    return baseId;
  }

  let index = 2;
  let candidate = `${baseId}-${index}`;
  while (used.has(candidate)) {
    index += 1;
    candidate = `${baseId}-${index}`;
  }
  return candidate;
}

function requiredSourceCount(kind: DerivedSeriesKind): number {
  return kind === "binary-op" ? 2 : 1;
}

function normalizeBinaryOp(op: BinaryOp | undefined): BinaryOp {
  return op ?? "add";
}

export function useTimeSeries(slice: TimeSeriesViewerSlice): TimeSeriesDataState {
  const [seriesSelections, setSeriesSelections] = useState<SeriesSelection[]>([]);
  const [derivedDefs, setDerivedDefs] = useState<DerivedSeriesDef[]>([]);
  const [seriesState, setSeriesState] = useState<SeriesState>(emptySeriesState);
  const [fetchWindow, setFetchWindow] = useState<TimeSeriesFetchWindow | null>(null);
  const fetchWindowRef = useRef<TimeSeriesFetchWindow | null>(null);
  const nextDerivedIdRef = useRef(1);
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
      const usedColors = [
        ...current.map((selection) => selection.color),
        ...derivedDefs.map((def) => def.color),
      ];
      return [...current, { key, color: nextColor(usedColors), visible: true }];
    });
  }, [candidateByKey, derivedDefs]);

  const addDerivedSeries = useCallback((input: AddDerivedSeriesInput) => {
    if (isDerivedSeriesKey(input.id ?? "")) {
      return;
    }

    const sourceCount = requiredSourceCount(input.kind);
    const sourceKeys = input.sourceKeys.slice(0, sourceCount);
    if (
      sourceKeys.length !== sourceCount ||
      sourceKeys.some((key) => isDerivedSeriesKey(key)) ||
      sourceKeys.some((key) => !seriesSelections.some((selection) => selection.key === key))
    ) {
      return;
    }

    setDerivedDefs((current) => {
      const fallbackId = `analysis-${nextDerivedIdRef.current}`;
      nextDerivedIdRef.current += 1;
      const baseId = sanitizeDerivedId(input.id ?? fallbackId);
      const usedColors = [
        ...seriesSelections.map((selection) => selection.color),
        ...current.map((def) => def.color),
      ];
      const def: DerivedSeriesDef = {
        id: uniqueDerivedId(baseId, current),
        kind: input.kind,
        sourceKeys,
        color: input.color ?? nextColor(usedColors),
        visible: input.visible ?? true,
      };
      if (input.kind === "moving-average") {
        def.window = Math.max(1, Math.floor(input.window ?? 5));
      }
      if (input.kind === "binary-op") {
        def.op = normalizeBinaryOp(input.op);
      }
      return [...current, def];
    });
  }, [seriesSelections]);

  const removeSeriesKey = useCallback((key: string) => {
    const derivedId = derivedSeriesIdFromKey(key);
    if (derivedId != null) {
      setDerivedDefs((current) => current.filter((def) => def.id !== derivedId));
      return;
    }
    setSeriesSelections((current) => current.filter((selection) => selection.key !== key));
  }, []);

  const toggleSeriesVisible = useCallback((key: string) => {
    const derivedId = derivedSeriesIdFromKey(key);
    if (derivedId != null) {
      setDerivedDefs((current) =>
        current.map((def) =>
          def.id === derivedId
            ? { ...def, visible: !def.visible }
            : def,
        ),
      );
      return;
    }

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

  const desiredFetchWindow = useMemo(() => {
    return slice.session ? buildFetchWindow(slice.session, slice.xRange) : null;
  }, [slice.session, slice.xRange]);

  useEffect(() => {
    fetchWindowRef.current = fetchWindow;
  }, [fetchWindow]);

  useEffect(() => {
    if (!desiredFetchWindow) {
      setFetchWindow(null);
      return undefined;
    }

    const applyWindow = () => {
      setFetchWindow((current) =>
        current?.key === desiredFetchWindow.key ? current : desiredFetchWindow,
      );
    };

    if (!fetchWindowRef.current) {
      applyWindow();
      return undefined;
    }

    const timeout = setTimeout(applyWindow, WINDOW_FETCH_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [desiredFetchWindow]);

  useEffect(() => {
    if (!desiredFetchWindow?.overview) {
      return;
    }
    const requestKey = `${desiredFetchWindow.key}|${selectedKeysSignature}`;
    setSeriesState((current) => {
      if (
        current.overviewRequestKey !== requestKey ||
        current.displayedRequestKey === requestKey
      ) {
        return current;
      }
      return {
        ...current,
        seriesByKey: current.overviewSeriesByKey,
        warnings: current.overviewWarnings,
        displayedRequestKey: requestKey,
      };
    });
  }, [desiredFetchWindow, selectedKeysSignature]);

  useEffect(() => {
    const engine = slice.ingest?.engine;
    const session = slice.session;
    if (!engine || !session || !hasNumericSeriesQueryEngine(engine)) {
      setSeriesState(emptySeriesState());
      setLoading(false);
      return;
    }

    if (candidates.length === 0) {
      setSeriesState({
        seriesByKey: new Map(),
        warnings: ["No numeric field candidates were found in this session."],
        overviewSeriesByKey: new Map(),
        overviewWarnings: [],
        overviewRequestKey: null,
        displayedRequestKey: null,
      });
      setLoading(false);
      return;
    }

    if (selectedFetchCandidates.length === 0) {
      setSeriesState(emptySeriesState());
      setLoading(false);
      return;
    }

    if (!fetchWindow) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    const requestKey = `${fetchWindow.key}|${selectedKeysSignature}`;

    void Promise.all(
      selectedFetchCandidates.map(async (selection) => {
        try {
          const series = await engine.getNumericSeries(
            selection.candidate.topic,
            selection.candidate.fieldPath,
            fetchWindow.startNs,
            fetchWindow.endNs,
            fetchWindow.maxPoints,
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
        setSeriesState((current) => {
          if (!fetchWindow.overview) {
            return {
              ...current,
              seriesByKey,
              warnings,
              displayedRequestKey: requestKey,
            };
          }
          return {
            seriesByKey,
            warnings,
            overviewSeriesByKey: seriesByKey,
            overviewWarnings: warnings,
            overviewRequestKey: requestKey,
            displayedRequestKey: requestKey,
          };
        });
        setLoading(false);
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        setSeriesState((current) => ({
          ...current,
          warnings: [errorMessage(error)],
        }));
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    candidates.length,
    fetchWindow,
    selectedFetchCandidates,
    selectedKeysSignature,
    slice.ingest,
    slice.session,
  ]);

  const realSelectedSeries = useMemo<TimeSeriesPlotSeries[]>(() => {
    return selectedCandidates.map((selection) => ({
      key: selection.key,
      candidate: selection.candidate,
      color: selection.color,
      visible: selection.visible,
      series: seriesState.seriesByKey.get(selection.key) ?? null,
    }));
  }, [selectedCandidates, seriesState.seriesByKey]);

  const derivedResult = useMemo(() => {
    return buildDerivedTimeSeries(realSelectedSeries, derivedDefs);
  }, [derivedDefs, realSelectedSeries]);

  const selectedSeries = useMemo<TimeSeriesPlotSeries[]>(() => {
    return [...realSelectedSeries, ...derivedResult.series];
  }, [derivedResult.series, realSelectedSeries]);

  const warnings = useMemo(() => {
    return [...seriesState.warnings, ...derivedResult.warnings];
  }, [derivedResult.warnings, seriesState.warnings]);

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
      warnings,
      addSeriesKey,
      addDerivedSeries,
      removeSeriesKey,
      toggleSeriesVisible,
      seekToTimeNs,
    };
  }, [
    addDerivedSeries,
    addSeriesKey,
    candidates,
    removeSeriesKey,
    seekToTimeNs,
    selectedSeries,
    slice.currentTimeNs,
    slice.session,
    toggleSeriesVisible,
    warnings,
  ]);

  return { snapshot, loading };
}
