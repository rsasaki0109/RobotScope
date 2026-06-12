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
  resolve: {
    preserveSymlinks: true,
    alias: {
      "@robotscope/core": path.resolve(rootDir, "../robotscope-core/src/index.ts"),
      "@robotscope/plugin-autoware/manifest": path.resolve(
        rootDir,
        "../../plugins/autoware/src/manifest.ts",
      ),
      "@robotscope/plugin-nav2/manifest": path.resolve(
        rootDir,
        "../../plugins/nav2/src/manifest.ts",
      ),
      "@robotscope/plugin-moveit/manifest": path.resolve(
        rootDir,
        "../../plugins/moveit/src/manifest.ts",
      ),
      "@robotscope/plugin-example/manifest": path.resolve(
        rootDir,
        "../../plugins/example/src/manifest.ts",
      ),
      "@robotscope/plugin-autoware": path.resolve(
        rootDir,
        "../../plugins/autoware/src/index.ts",
      ),
      "@robotscope/plugin-nav2": path.resolve(rootDir, "../../plugins/nav2/src/index.ts"),
      "@robotscope/plugin-moveit": path.resolve(rootDir, "../../plugins/moveit/src/index.ts"),
      "@robotscope/plugin-example": path.resolve(rootDir, "../../plugins/example/src/index.ts"),
    },
  },
}));
