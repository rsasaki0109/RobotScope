import { isMcapQueryEngine, type QueryEngine, type SessionInfo } from "@robotscope/core";
import { useEffect, useState } from "react";

import { buildMoveItSnapshot } from "../build-snapshot.js";
import type { MoveItSnapshot } from "../types.js";

export interface MoveItDataState {
  snapshot: MoveItSnapshot | null;
  loading: boolean;
}

export interface MoveItViewerSlice {
  ingest: { engine: QueryEngine } | null;
  session: SessionInfo | null;
  currentTimeNs: number;
}

export function useMoveItSnapshot(slice: MoveItViewerSlice): MoveItDataState {
  const [snapshot, setSnapshot] = useState<MoveItSnapshot | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const engine = slice.ingest?.engine;
    if (!engine || !slice.session || !isMcapQueryEngine(engine)) {
      setSnapshot(null);
      return;
    }

    let cancelled = false;
    setLoading(true);

    void buildMoveItSnapshot(engine, slice.session, slice.currentTimeNs).then((next) => {
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
