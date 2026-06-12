import { isMcapQueryEngine, type QueryEngine, type SessionInfo } from "@robotscope/core";
import { useEffect, useState } from "react";

import { buildExampleSnapshot } from "../build-snapshot.js";
import type { ExampleSnapshot } from "../types.js";

export interface ExampleDataState {
  snapshot: ExampleSnapshot | null;
  loading: boolean;
}

export interface ExampleViewerSlice {
  ingest: { engine: QueryEngine } | null;
  session: SessionInfo | null;
  currentTimeNs: number;
}

export function useExampleSnapshot(slice: ExampleViewerSlice): ExampleDataState {
  const [snapshot, setSnapshot] = useState<ExampleSnapshot | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const engine = slice.ingest?.engine;
    if (!engine || !slice.session || !isMcapQueryEngine(engine)) {
      setSnapshot(null);
      return;
    }

    let cancelled = false;
    setLoading(true);

    void buildExampleSnapshot(engine, slice.session, slice.currentTimeNs).then((next) => {
      if (!cancelled) {
        setSnapshot(next);
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [slice.ingest, slice.session, slice.currentTimeNs]);

  return { snapshot, loading };
}
