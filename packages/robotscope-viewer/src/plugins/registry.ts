import { AutowareDock, AUTOWARE_PLUGIN_MANIFEST, useAutowareSnapshot } from "@robotscope/plugin-autoware";
import {
  ExampleDock,
  EXAMPLE_PLUGIN_MANIFEST,
  useExampleSnapshot,
} from "@robotscope/plugin-example";
import { MoveItDock, MOVEIT_PLUGIN_MANIFEST, useMoveItSnapshot } from "@robotscope/plugin-moveit";
import { Nav2Dock, NAV2_PLUGIN_MANIFEST, useNav2Snapshot } from "@robotscope/plugin-nav2";
import { TIMESERIES_PLUGIN_MANIFEST } from "@robotscope/plugin-timeseries";
import { layoutIdsFromManifest, type PluginManifest } from "@robotscope/core";

import { registerPlugin } from "./create-plugin-column";
import { TimeSeriesRightColumn } from "./timeseries-column";
import type { LayoutOption, RegisteredPlugin } from "./types";

const BUILTIN_LAYOUTS: LayoutOption[] = [
  { id: "default", label: "Default", pluginName: "robotscope-viewer" },
];

const LAYOUT_LABELS: Record<string, string> = {
  default: "Default",
  autoware: "Autoware Debug",
  "autoware-daily-debug": "Autoware Daily Debug",
  nav2: "Nav2 Debug",
  "nav2-daily-debug": "Nav2 Daily Debug",
  moveit: "MoveIt Debug",
  "moveit-manipulation-debug": "MoveIt Manipulation Debug",
  timeseries: "Time Series",
  example: "Example Plugin",
  "example-starter": "Example Starter",
};

const registeredPlugins: RegisteredPlugin[] = [
  registerPlugin(
    AUTOWARE_PLUGIN_MANIFEST,
    layoutIdsFromManifest(AUTOWARE_PLUGIN_MANIFEST),
    useAutowareSnapshot,
    AutowareDock,
  ),
  registerPlugin(
    NAV2_PLUGIN_MANIFEST,
    layoutIdsFromManifest(NAV2_PLUGIN_MANIFEST),
    useNav2Snapshot,
    Nav2Dock,
  ),
  registerPlugin(
    MOVEIT_PLUGIN_MANIFEST,
    layoutIdsFromManifest(MOVEIT_PLUGIN_MANIFEST),
    useMoveItSnapshot,
    MoveItDock,
  ),
  {
    manifest: TIMESERIES_PLUGIN_MANIFEST,
    layoutIds: layoutIdsFromManifest(TIMESERIES_PLUGIN_MANIFEST),
    RightColumn: TimeSeriesRightColumn,
  },
  registerPlugin(
    EXAMPLE_PLUGIN_MANIFEST,
    layoutIdsFromManifest(EXAMPLE_PLUGIN_MANIFEST),
    useExampleSnapshot,
    ExampleDock,
  ),
];

const layoutToPlugin = new Map<string, RegisteredPlugin>();
for (const plugin of registeredPlugins) {
  for (const layoutId of plugin.layoutIds) {
    layoutToPlugin.set(layoutId, plugin);
  }
}

export function getRegisteredPlugins(): readonly RegisteredPlugin[] {
  return registeredPlugins;
}

export function resolvePluginForLayout(layoutId: string): RegisteredPlugin | undefined {
  return layoutToPlugin.get(layoutId);
}

export function resolveRightColumn(layoutId: string) {
  const plugin = resolvePluginForLayout(layoutId);
  return plugin?.RightColumn ?? null;
}

export function listLayoutOptions(): LayoutOption[] {
  const pluginLayouts = registeredPlugins.flatMap((plugin) =>
    plugin.layoutIds.map((id) => ({
      id,
      label: LAYOUT_LABELS[id] ?? formatLayoutLabel(id),
      pluginName: plugin.manifest.name,
    })),
  );

  return [...BUILTIN_LAYOUTS, ...pluginLayouts];
}

export function getPluginManifestForLayout(layoutId: string): PluginManifest | undefined {
  return resolvePluginForLayout(layoutId)?.manifest;
}

function formatLayoutLabel(layoutId: string): string {
  return layoutId
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function validateRegisteredPlugins(): string[] {
  const errors: string[] = [];
  const seenLayouts = new Set<string>();

  for (const plugin of registeredPlugins) {
    const manifestLayouts = new Set(layoutIdsFromManifest(plugin.manifest));
    for (const layoutId of plugin.layoutIds) {
      if (!manifestLayouts.has(layoutId)) {
        errors.push(
          `${plugin.manifest.name}: layout "${layoutId}" missing from manifest.contributes.layouts`,
        );
      }
      if (seenLayouts.has(layoutId)) {
        errors.push(`Duplicate layout id registered: ${layoutId}`);
      }
      seenLayouts.add(layoutId);
    }
  }

  return errors;
}

const startupErrors = validateRegisteredPlugins();
if (startupErrors.length > 0) {
  console.warn("[RobotScope] Plugin registry validation:", startupErrors.join("; "));
}
