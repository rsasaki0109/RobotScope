import { isMcapQueryEngine, type QueryEngine, type SessionInfo } from "@robotscope/core";
import { useEffect, useState } from "react";

import { buildNav2Snapshot } from "../build-snapshot.js";
import type { Nav2Snapshot } from "../types.js";

export interface Nav2DataState {
  snapshot: Nav2Snapshot | null;
  loading: boolean;
}

export interface Nav2ViewerSlice {
  ingest: { engine: QueryEngine } | null;
  session: SessionInfo | null;
  currentTimeNs: number;
}

export function useNav2Snapshot(slice: Nav2ViewerSlice): Nav2DataState {
  const [snapshot, setSnapshot] = useState<Nav2Snapshot | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const engine = slice.ingest?.engine;
    if (!engine || !slice.session || !isMcapQueryEngine(engine)) {
      setSnapshot(null);
      return;
    }

    let cancelled = false;
    setLoading(true);

    void buildNav2Snapshot(engine, slice.session, slice.currentTimeNs).then((next) => {
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
