import type { ComponentType } from "react";

import { useViewerStore } from "../store/viewer-store";
import { EntityInspector } from "../shell/EntityInspector";
import type { PluginDockProps, PluginSnapshotHook, RegisteredPlugin } from "./types";

export function createPluginRightColumn<TSnapshot>(
  useSnapshot: PluginSnapshotHook<TSnapshot>,
  Dock: ComponentType<PluginDockProps<TSnapshot>>,
): ComponentType {
  return function PluginRightColumn() {
    const ingest = useViewerStore((s) => s.ingest);
    const session = useViewerStore((s) => s.session);
    const currentTimeNs = useViewerStore((s) => s.currentTimeNs);
    const setCurrentTimeNs = useViewerStore((s) => s.setCurrentTimeNs);
    const laneletOsmOverlay = useViewerStore((s) => s.laneletOsmOverlay);

    const { snapshot, loading } = useSnapshot({
      ingest,
      session,
      currentTimeNs,
      setCurrentTimeNs,
      laneletOsmOverlay,
    });

    return (
      <Dock snapshot={snapshot} loading={loading} inspector={<EntityInspector />} />
    );
  };
}

export function registerPlugin<TSnapshot>(
  manifest: import("@robotscope/core").PluginManifest,
  layoutIds: string[],
  useSnapshot: PluginSnapshotHook<TSnapshot>,
  Dock: ComponentType<PluginDockProps<TSnapshot>>,
): RegisteredPlugin {
  return {
    manifest,
    layoutIds,
    RightColumn: createPluginRightColumn(useSnapshot, Dock),
  };
}
