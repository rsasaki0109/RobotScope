import { isMcapQueryEngine, type QueryEngine, type SessionInfo } from "@robotscope/core";
import { useEffect, useState } from "react";

import { buildAutowareSnapshot } from "../build-snapshot.js";
import type { AutowareSnapshot } from "../types.js";

export interface AutowareDataState {
  snapshot: AutowareSnapshot | null;
  loading: boolean;
}

/** Minimal store interface to avoid coupling plugin to viewer package. */
export interface AutowareViewerSlice {
  ingest: { engine: QueryEngine } | null;
  session: SessionInfo | null;
  currentTimeNs: number;
}

export function useAutowareSnapshot(slice: AutowareViewerSlice): AutowareDataState {
  const [snapshot, setSnapshot] = useState<AutowareSnapshot | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const engine = slice.ingest?.engine;
    if (!engine || !slice.session || !isMcapQueryEngine(engine)) {
      setSnapshot(null);
      return;
    }

    let cancelled = false;
    setLoading(true);

    void buildAutowareSnapshot(engine, slice.session, slice.currentTimeNs).then((next) => {
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
