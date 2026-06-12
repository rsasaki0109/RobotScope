import type { ComponentType, ReactNode } from "react";

import type { PluginManifest } from "@robotscope/core";

import type { ParsedLaneletOsmMap } from "@robotscope/core";

export interface PluginViewerSlice {
  ingest: import("@robotscope/core").IngestHandle | null;
  session: import("@robotscope/core").SessionInfo | null;
  currentTimeNs: number;
  laneletOsmOverlay?: ParsedLaneletOsmMap | null;
}

export interface PluginSnapshotState<TSnapshot> {
  snapshot: TSnapshot | null;
  loading: boolean;
}

export interface PluginDockProps<TSnapshot> {
  snapshot: TSnapshot | null;
  loading?: boolean;
  inspector?: ReactNode;
}

export type PluginSnapshotHook<TSnapshot> = (
  slice: PluginViewerSlice,
) => PluginSnapshotState<TSnapshot>;

export interface RegisteredPlugin {
  manifest: PluginManifest;
  layoutIds: string[];
  RightColumn: ComponentType;
}

export interface LayoutOption {
  id: string;
  label: string;
  pluginName: string;
}
