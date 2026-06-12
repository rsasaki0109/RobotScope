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
  laneletOsmOverlay?: import("@robotscope/core").ParsedLaneletOsmMap | null;
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
        const withOsm =
          slice.laneletOsmOverlay && next
            ? {
                ...next,
                map: {
                  ...next.map,
                  osm_sidecar: {
                    format: slice.laneletOsmOverlay.format,
                    node_count: slice.laneletOsmOverlay.node_count,
                    way_count: slice.laneletOsmOverlay.way_count,
                    lanelet_count: slice.laneletOsmOverlay.lanelet_count,
                    ways: slice.laneletOsmOverlay.ways.map((way) => ({ points: way.points })),
                    lanelets: slice.laneletOsmOverlay.lanelets.map((lanelet) => ({
                      left_bound: lanelet.left_bound
                        ? { points: lanelet.left_bound.points }
                        : undefined,
                      right_bound: lanelet.right_bound
                        ? { points: lanelet.right_bound.points }
                        : undefined,
                      centerline: lanelet.centerline
                        ? { points: lanelet.centerline.points }
                        : undefined,
                    })),
                  },
                },
              }
            : next;
        setSnapshot(withOsm);
        setLoading(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [slice.ingest, slice.session, slice.currentTimeNs, slice.laneletOsmOverlay]);

  return { snapshot, loading };
}
