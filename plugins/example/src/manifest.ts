import type { PluginManifest } from "../../../packages/robotscope-core/src/plugin/manifest.js";

export const EXAMPLE_PLUGIN_MANIFEST: PluginManifest = {
  name: "robotscope-example",
  version: "0.1.0",
  api: "0.1",
  license: "Apache-2.0",
  entrypoints: {
    frontend: "dist/frontend.js",
  },
  capabilities: ["read.entities", "read.ros_graph", "register.panels"],
  permissions: {
    "command.publish": false,
    "command.service_call": false,
    network: false,
  },
  contributes: {
    panels: ["example.session"],
    layouts: ["example", "example-starter"],
  },
};
