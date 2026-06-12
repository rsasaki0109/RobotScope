import path from "node:path";
import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const rootDir = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig(({ mode }) => ({
  base: mode === "pages" ? "/RobotScope/" : "/",
  plugins: [react()],
  server: {
    port: 5173,
    open: true,
  },
  optimizeDeps: {
    exclude: ["sql.js/dist/sql-asm.js"],
  },
  resolve: {
    preserveSymlinks: true,
    alias: [
      {
        find: "@robotscope/core/ingest/rosbag2",
        replacement: path.resolve(rootDir, "../robotscope-core/src/ingest/rosbag2.ts"),
      },
      {
        find: "@robotscope/core",
        replacement: path.resolve(rootDir, "../robotscope-core/src/index.ts"),
      },
      {
        find: "@robotscope/plugin-autoware/manifest",
        replacement: path.resolve(rootDir, "../../plugins/autoware/src/manifest.ts"),
      },
      {
        find: "@robotscope/plugin-nav2/manifest",
        replacement: path.resolve(rootDir, "../../plugins/nav2/src/manifest.ts"),
      },
      {
        find: "@robotscope/plugin-moveit/manifest",
        replacement: path.resolve(rootDir, "../../plugins/moveit/src/manifest.ts"),
      },
      {
        find: "@robotscope/plugin-example/manifest",
        replacement: path.resolve(rootDir, "../../plugins/example/src/manifest.ts"),
      },
      {
        find: "@robotscope/plugin-autoware",
        replacement: path.resolve(rootDir, "../../plugins/autoware/src/index.ts"),
      },
      {
        find: "@robotscope/plugin-nav2",
        replacement: path.resolve(rootDir, "../../plugins/nav2/src/index.ts"),
      },
      {
        find: "@robotscope/plugin-moveit",
        replacement: path.resolve(rootDir, "../../plugins/moveit/src/index.ts"),
      },
      {
        find: "@robotscope/plugin-example",
        replacement: path.resolve(rootDir, "../../plugins/example/src/index.ts"),
      },
    ],
  },
}));
