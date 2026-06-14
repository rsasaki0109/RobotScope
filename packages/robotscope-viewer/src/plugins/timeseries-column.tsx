import { useCallback, useEffect, useMemo, useState } from "react";

import {
  TimeSeriesDock,
  useTimeSeries,
  type TimeSeriesXRange,
} from "@robotscope/plugin-timeseries";

import { EntityInspector } from "../shell/EntityInspector";
import { useViewerStore } from "../store/viewer-store";

export function TimeSeriesRightColumn() {
  const ingest = useViewerStore((s) => s.ingest);
  const session = useViewerStore((s) => s.session);
  const currentTimeNs = useViewerStore((s) => s.currentTimeNs);
  const setCurrentTimeNs = useViewerStore((s) => s.setCurrentTimeNs);
  const [xRange, setXRange] = useState<TimeSeriesXRange | null>(null);

  const sessionIdentity = useMemo(() => {
    if (!session) {
      return null;
    }
    return `${session.source}|${session.path ?? ""}|${session.start_ns}`;
  }, [session]);

  useEffect(() => {
    setXRange(null);
  }, [sessionIdentity]);

  const handleXRangeChange = useCallback((nextRange: TimeSeriesXRange | null) => {
    setXRange(nextRange);
  }, []);

  const { snapshot, loading } = useTimeSeries({
    ingest,
    session,
    currentTimeNs,
    setCurrentTimeNs,
    xRange,
  });

  return (
    <TimeSeriesDock
      snapshot={snapshot}
      loading={loading}
      inspector={<EntityInspector />}
      xRange={xRange}
      onXRangeChange={handleXRangeChange}
    />
  );
}
