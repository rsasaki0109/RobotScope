import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  outputDir: "test-results",
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:5173",
    viewport: { width: 1440, height: 1000 },
    trace: "retain-on-failure",
    launchOptions: {
      executablePath: process.env.CHROME_PATH || undefined,
      args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
    },
  },
  webServer: [
    {
      command: "BROWSER=none npm run dev --workspace=@robotscope/viewer -- --host 127.0.0.1 --strictPort",
      url: "http://127.0.0.1:5173",
      reuseExistingServer: !process.env.CI,
    },
    {
      command: "npm run demo:live-agent",
      port: 8765,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: "node scripts/live-agent-demo.mjs packages/robotscope-viewer/public/demo/demo-python.mcap --port 8766 --loop",
      port: 8766,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: "BROWSER=none npm run preview --workspace=@robotscope/viewer -- --host 127.0.0.1 --port 4173 --strictPort",
      url: "http://127.0.0.1:4173",
      reuseExistingServer: !process.env.CI,
    },
  ],
});
