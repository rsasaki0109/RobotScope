/** Frozen at v0.1.0-rc.0 — see docs/api-v0.1.md. Bump only with a new schema directory. */
export const PLUGIN_API_VERSION = "0.1" as const;

export type PluginCapability =
  | "read.entities"
  | "read.ros_graph"
  | "render.scene"
  | "register.panels"
  | "register.decoders"
  | "register.renderers"
  | "register.transforms";

export interface PluginManifest {
  name: string;
  version: string;
  api: typeof PLUGIN_API_VERSION;
  license: string;
  entrypoints?: {
    frontend?: string;
    backend?: string;
  };
  capabilities?: PluginCapability[];
  permissions?: {
    "command.publish"?: boolean;
    "command.service_call"?: boolean;
    network?: boolean;
  };
  contributes?: {
    panels?: string[];
    renderers?: string[];
    archetypes?: string[];
    layouts?: string[];
  };
}

export interface PluginLayoutDescriptor {
  id: string;
  pluginName: string;
  pluginVersion: string;
}

export function validatePluginManifest(value: unknown): PluginManifest | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const manifest = value as PluginManifest;
  if (typeof manifest.name !== "string" || !manifest.name.startsWith("robotscope-")) {
    return null;
  }
  if (typeof manifest.version !== "string") {
    return null;
  }
  if (manifest.api !== PLUGIN_API_VERSION) {
    return null;
  }
  if (typeof manifest.license !== "string") {
    return null;
  }

  return manifest;
}

export function layoutIdsFromManifest(manifest: PluginManifest): string[] {
  return manifest.contributes?.layouts ?? [];
}

export function expandLayoutDescriptors(manifest: PluginManifest): PluginLayoutDescriptor[] {
  return layoutIdsFromManifest(manifest).map((id) => ({
    id,
    pluginName: manifest.name,
    pluginVersion: manifest.version,
  }));
}
