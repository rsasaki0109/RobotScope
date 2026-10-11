import { readFile } from "node:fs/promises";
import { test, expect } from "@playwright/test";

async function attachStore(page) {
  await page.evaluate(async () => {
    window.validationStore = (await import("/src/store/viewer-store.ts")).useViewerStore;
  });
}

async function waitForSource(page, source) {
  await page.waitForFunction((source) => {
    const state = window.validationStore.getState();
    return state.session?.source === source && state.topics.length > 0 && !state.sceneLoading;
  }, source);
}

test("incident playback exposes facts, inference and an exported report", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/?layout=autoware&demo=incident&incident=phantom-obstacle-stop");
  const panel = page.getByRole("region", { name: "Incident Explainer" });
  await expect(panel.getByText("FACTS", { exact: true })).toBeVisible();
  await expect(panel.getByText("INFERENCE", { exact: true })).toBeVisible();
  await expect(panel.getByRole("heading", { level: 3 })).toHaveText("Phantom obstacle stop suspected");
  const pending = page.waitForEvent("download");
  await panel.getByRole("button", { name: "Export .md", exact: true }).click();
  const download = await pending;
  const report = await readFile(await download.path(), "utf8");
  expect(report).toContain("## Facts (observed)");
  expect(report).toContain("## Inference (heuristic)");
  expect(report).toContain("Planned trajectory length");
  await expect(page.locator("canvas").first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("showcase drives, turns and stops the recorded robot before explaining the incident", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/?showcase=phantom-stop&capture=1");
  await expect(page.locator('[data-showcase-ready="true"]')).toBeVisible();
  await attachStore(page);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("robotscope:showcase-time", { detail: 2000 })));
  const replay = page.locator('[data-showcase-phase="replay"][data-showcase-scene-ready="true"]');
  await expect(replay).toBeVisible();
  await expect(replay.getByText("0 detected", { exact: true })).toBeVisible();
  const firstPose = await page.evaluate(() => window.validationStore.getState().sceneSnapshot.poses[0]);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("robotscope:showcase-time", { detail: 6000 })));
  await expect(page.locator('[data-showcase-time="6000"][data-showcase-scene-ready="true"]')).toBeVisible();
  const laterPose = await page.evaluate(() => window.validationStore.getState().sceneSnapshot.poses[0]);
  expect(laterPose.position[0] - firstPose.position[0]).toBeGreaterThan(3.5);
  expect(firstPose.rotation[2]).toBeGreaterThan(0);
  expect(laterPose.rotation[2]).toBeLessThan(0);
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("robotscope:showcase-time", { detail: 7200 })));
  const facts = page.locator('[data-showcase-phase="facts"][data-showcase-scene-ready="true"]');
  await expect(facts).toBeVisible();
  await expect(facts.getByText("OBSERVED", { exact: true })).toBeVisible();
  await expect(facts.getByText("0.05 m", { exact: true }).last()).toBeVisible();
  await expect(facts.getByRole("status", { name: "Robot stopped" })).toBeVisible();
  await expect(facts.getByText("1 detected", { exact: true })).toBeVisible();
  const stoppedPose = await page.evaluate(() => window.validationStore.getState().sceneSnapshot.poses[0]);
  expect(stoppedPose.position[0]).toBeCloseTo(7.2, 4);
  await expect(facts.getByRole("img", { name: "Planned trajectory length from the MCAP recording" })).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("robotscope:showcase-time", { detail: 8600 })));
  await expect(page.getByText("INFERENCE · HEURISTIC", { exact: true })).toBeVisible();
  await expect(page.getByText("A debugging lead. Not a proven root cause.", { exact: true })).toBeVisible();
  const finalPose = await page.evaluate(() => window.validationStore.getState().sceneSnapshot.poses[0]);
  expect(finalPose.position).toEqual(stoppedPose.position);
  expect(errors).toEqual([]);
});

test("rosbag2 loads and remains usable when IndexedDB is disabled", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "indexedDB", { value: { open() { throw new Error("Storage disabled"); } } });
  });
  await page.goto("/?layout=timeseries&demo=rosbag2");
  await attachStore(page);
  await waitForSource(page, "rosbag2");
  expect(await page.evaluate(() => window.validationStore.getState().topics.length)).toBe(5);
  const values = await page.evaluate(async () => {
    const s = window.validationStore.getState();
    const result = await s.ingest.engine.getNumericSeries("/localization/pose_estimator/ndt_score", "data", s.session.start_ns, s.session.end_ns, 20);
    return Array.from(result.v);
  });
  expect(values).toHaveLength(20);
  expect(values[0]).toBe(1);
  expect(values.at(-1)).toBe(0.4);
});

for (const compression of ["zstd", "lz4"]) {
  test(`${compression} MCAP decodes in the browser using WebAssembly`, async ({ page }) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/");
    await attachStore(page);
    await page.evaluate((compression) => window.validationStore.getState().openMcapUrl(`/demo/validation-${compression}.mcap`), compression);
    await waitForSource(page, "mcap");
    const value = await page.evaluate(async () => {
      const s = window.validationStore.getState();
      return (await s.ingest.engine.getRawMessageNearTime(s.topics[0].name, s.session.end_ns)).decoded.data;
    });
    expect(value).toBe(4.9);
    expect(errors).toEqual([]);
  });
}

test("StrictMode auto-connect creates one socket; recording reload stays in playback", async ({ page }) => {
  await page.addInitScript(() => {
    window.liveSocketCount = 0;
    const NativeWebSocket = window.WebSocket;
    window.WebSocket = class extends NativeWebSocket {
      constructor(...args) {
        super(...args);
        if (String(args[0]).includes(":8765")) window.liveSocketCount++;
      }
    };
  });
  await page.goto("/?layout=autoware&live=1");
  await attachStore(page);
  await waitForSource(page, "live");
  expect(await page.evaluate(() => window.liveSocketCount)).toBe(1);
  await page.getByRole("button", { name: "Record Live", exact: true }).click();
  await page.waitForFunction(() => window.validationStore.getState().ingest.getRecordedMessageCount() > 30);
  const downloads = [];
  page.on("download", (download) => downloads.push(download));
  await page.getByRole("button", { name: "Stop & Save MCAP", exact: true }).click();
  await waitForSource(page, "mcap");
  await expect.poll(() => downloads.length).toBe(2);
  expect(downloads.some((d) => d.suggestedFilename().endsWith(".mcap"))).toBe(true);
  expect(downloads.some((d) => d.suggestedFilename().endsWith(".robotscope-index.json"))).toBe(true);
  await page.waitForTimeout(500); // Detect delayed callbacks from the previous live session.
  expect(await page.evaluate(() => window.validationStore.getState().session.source)).toBe("mcap");
  expect(await page.evaluate(() => window.liveSocketCount)).toBe(1);
});

test("explicit disconnect cancels auto-connect and permits a manual reconnect", async ({ page }) => {
  await page.goto("/?layout=autoware&live=1");
  await attachStore(page);
  await waitForSource(page, "live");
  await page.getByRole("button", { name: "Disconnect", exact: true }).click();
  await expect(page.getByRole("button", { name: "Connect Live", exact: true })).toBeVisible();
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => window.validationStore.getState().session)).toBeNull();
  await page.getByRole("button", { name: "Connect Live", exact: true }).click();
  await waitForSource(page, "live");
});

test("a newer file selection wins over a delayed older fetch", async ({ page }) => {
  let unblock;
  const blocked = new Promise((resolve) => { unblock = resolve; });
  await page.route("**/delayed.mcap", async (route) => {
    await blocked;
    try { await route.fulfill({ status: 200, body: Buffer.from("invalid older file") }); } catch { /* request aborted */ }
  });
  await page.goto("/");
  await attachStore(page);
  await page.evaluate(() => { window.olderOpen = window.validationStore.getState().openMcapUrl("/delayed.mcap"); });
  await page.evaluate(() => window.validationStore.getState().openMcapUrl("/demo/demo-rosbag2/demo-rosbag2_0.db3"));
  unblock();
  await page.evaluate(() => window.olderOpen);
  await waitForSource(page, "rosbag2");
  expect(await page.evaluate(() => window.validationStore.getState().statusMessage)).not.toContain("failed");
});

test("a corrupt recording clears loading indicators and leaves a recoverable error", async ({ page }) => {
  await page.goto("/");
  await attachStore(page);
  const state = await page.evaluate(async () => {
    const store = window.validationStore;
    try { await store.getState().openMcapFile(new File(["invalid"], "corrupt.mcap")); } catch { /* expected */ }
    const s = store.getState();
    return { inspect: s.inspectLoading, scene: s.sceneLoading, message: s.statusMessage };
  });
  expect(state.inspect).toBe(false);
  expect(state.scene).toBe(false);
  expect(state.message).toContain("Recording load failed");
  await page.evaluate(() => window.validationStore.getState().openMcapUrl("/demo/demo-scene.mcap"));
  await waitForSource(page, "mcap");
});

test("Python recording reconstructs native geometry, numeric plots and image pixels without ROS", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/?demo=python");
  await attachStore(page);
  await waitForSource(page, "mcap");
  const result = await page.evaluate(async () => {
    const s = window.validationStore.getState();
    const engine = s.ingest.engine;
    const scene = await engine.getSceneSnapshot(s.session.end_ns);
    const series = await engine.getNumericSeries("/robot/demo/speed", "value", s.session.start_ns, s.session.end_ns);
    s.setCurrentTimeNs(s.session.end_ns);
    return { count: s.session.mapped_entity_count, position: scene.poses[0].position,
      cloud: Array.from(scene.point_clouds[0].points), speed: series.v.at(-1), warnings: scene.warnings };
  });
  expect(result).toEqual({ count: 6, position: [1.9, 0, 0], cloud: [0, 0, 1, 1, 0, 1, 0, 1, 1], speed: 1.9, warnings: [] });
  await page.getByRole("button", { name: /\/robot\/demo\/camera/ }).click();
  const image = page.getByRole("img", { name: "Recorded image" });
  await expect(image).toBeVisible();
  expect(await image.evaluate((canvas) => Array.from(canvas.getContext("2d").getImageData(0, 0, 1, 1).data))).toEqual([255, 190, 0, 255]);
  await page.evaluate(() => window.validationStore.getState().setLayoutId("timeseries"));
  await expect(page.getByText("/robot/demo/speed · value", { exact: true }).first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("non-ROS live replay records JSON encodings and reopens native entities", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/?live=1&liveUrl=ws://127.0.0.1:8766");
  await attachStore(page);
  await waitForSource(page, "live");
  await page.getByRole("button", { name: "Record Live", exact: true }).click();
  await page.waitForFunction(() => window.validationStore.getState().ingest.getRecordedMessageCount() > 110);
  // Wait for one complete replay loop so the static camera transform is captured.
  const downloads = [];
  page.on("download", (download) => downloads.push(download));
  await page.getByRole("button", { name: "Stop & Save MCAP", exact: true }).click();
  await waitForSource(page, "mcap");
  await expect.poll(() => downloads.length).toBe(2);
  const result = await page.evaluate(async () => {
    const s = window.validationStore.getState();
    const scene = await s.ingest.engine.getSceneSnapshot(s.session.end_ns);
    return { encodings: s.topics.map((t) => t.message_encoding), entities: s.mappedTopics.length,
      poses: scene.poses.length, cloud: scene.point_clouds.length, transforms: s.session.tf_transform_count };
  });
  expect(result.encodings).toEqual(Array(6).fill("json"));
  expect(result.entities).toBe(6);
  expect(result.poses).toBe(1);
  expect(result.cloud).toBe(1);
  expect(result.transforms).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test.describe("production bundle", () => {
  test.use({ baseURL: "http://127.0.0.1:4173" });
  for (const compression of ["zstd", "lz4"]) {
    test(`${compression} asset URLs work after bundling`, async ({ page }) => {
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.goto("/");
      await page.locator('input[type="file"]').first().setInputFiles(`packages/robotscope-viewer/public/demo/validation-${compression}.mcap`);
      await expect(page.locator("header").getByText(new RegExp(`Loaded validation-${compression}\\.mcap`))).toBeVisible();
      await expect(page.locator("canvas").first()).toBeVisible();
      expect(errors).toEqual([]);
    });
  }

  test("built incident demo exports observed evidence", async ({ page }) => {
    await page.goto("/?layout=autoware&demo=incident&incident=phantom-obstacle-stop");
    const panel = page.getByRole("region", { name: "Incident Explainer" });
    await expect(panel.getByText("FACTS", { exact: true })).toBeVisible();
    const pending = page.waitForEvent("download");
    await panel.getByRole("button", { name: "Export .md", exact: true }).click();
    const report = await readFile(await (await pending).path(), "utf8");
    expect(report).toContain("Planned trajectory length");
    expect(report).toContain("## Inference (heuristic)");
  });

  test("built Python demo displays an actual recorded image and semantic pose", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/?demo=python");
    await expect(page.locator("header").getByText(/Loaded demo-python\.mcap/)).toBeVisible();
    await page.getByRole("button", { name: /\/robot\/demo\/pose/ }).click();
    await expect(page.getByText("/robot/demo/pose", { exact: true }).last()).toBeVisible();
    await page.getByRole("button", { name: /\/robot\/demo\/camera/ }).click();
    const image = page.getByRole("img", { name: "Recorded image" });
    await expect(image).toBeVisible();
    expect(await image.evaluate((canvas) => Array.from(canvas.getContext("2d").getImageData(0, 0, 1, 1).data))).toEqual([255, 0, 0, 255]);
    expect(errors).toEqual([]);
  });
});
