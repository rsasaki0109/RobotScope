import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, test } from "node:test";
import { openMcap } from "../dist/index.js";
import { openRosbag2, openRosbag2Folder } from "../dist/ingest/rosbag2.js";

const repo = fileURLToPath(new URL("../../..", import.meta.url));
let dir;
let mcap;
let sqlite;
let metadata;
const dbName = "demo-rosbag2_0.db3";
const score = "/localization/pose_estimator/ndt_score";

before(() => {
  dir = mkdtempSync(path.join(os.tmpdir(), "robotscope-ingest-"));
  execFileSync(process.execPath, ["scripts/create-tf-demo.mjs", path.join(dir, "test.mcap")], { cwd: repo });
  execFileSync(process.execPath, ["scripts/create-rosbag2-demo.mjs", path.join(dir, "bag")], { cwd: repo });
  mcap = readFileSync(path.join(dir, "test.mcap"));
  sqlite = readFileSync(path.join(dir, "bag", dbName));
  metadata = readFileSync(path.join(dir, "bag/metadata.yaml"), "utf8");
});
after(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });

test("MCAP reconstructs ROS TF, mapped entities, scene and numeric series", async () => {
  const handle = await openMcap(mcap);
  const info = await handle.engine.getSessionInfo();
  assert.equal(info.topics.length, 21);
  assert.equal(info.topics.reduce((count, topic) => count + topic.message_count, 0), 288);
  assert.ok(info.tf_transform_count > 0);
  const tree = await handle.engine.getTfTree(info.end_ns, "map");
  assert.ok(tree.frames.length > 0);
  const scene = await handle.engine.getSceneSnapshot(info.end_ns, { fixed_frame: "map" });
  assert.ok(scene);
  const raw = await handle.engine.getRawMessageNearTime(score, info.end_ns);
  assert.equal(raw.decode_error, undefined);
  assert.equal(typeof raw.decoded.data, "number");
  const series = await handle.engine.getNumericSeries(score, "data", info.start_ns, info.end_ns, 2000);
  assert.ok(series.v.length > 1);
  const entities = await handle.engine.queryEntities({ time_ns: info.end_ns, filter: { paths: ["/robot/ego/localization/pose"] } });
  assert.equal(entities.entities.length, 1);
  assert.ok(entities.entities[0].components.some((component) => component.name === "data" && component.value));
  await handle.close();
});

test("MCAP reuses a matching sidecar and rebuilds a mismatched fingerprint", async () => {
  const fingerprint = { name: "test.mcap", size: mcap.length };
  const first = await openMcap(mcap, { fingerprint });
  const sidecar = first.engine.getSidecarManifest();
  const cached = await openMcap(mcap, { fingerprint, sidecar });
  assert.equal(cached.engine.getIndexStatus().sidecar_loaded, true);
  assert.equal(cached.engine.getIndexStatus().topic_index_messages, 288);
  const stale = await openMcap(mcap, { fingerprint: { ...fingerprint, size: mcap.length + 1 }, sidecar });
  assert.equal(stale.engine.getIndexStatus().sidecar_loaded, false);
  assert.equal((await stale.engine.getRawMessageNearTime(score, sidecar.end_ns)).decode_error, undefined);
  await Promise.all([first.close(), cached.close(), stale.close()]);
});

test("rosbag2 decodes standard Float64, Twist and Odometry schemas", async () => {
  const handle = await openRosbag2(sqlite);
  const info = await handle.engine.getSessionInfo();
  assert.equal(info.source, "rosbag2");
  assert.equal(info.topics.length, 5);
  assert.equal(info.sidecar_message_count, 100);
  const scalar = await handle.engine.getRawMessageNearTime(score, info.start_ns);
  assert.equal(scalar.decoded.data, 1);
  const twist = await handle.engine.getRawMessageNearTime("/cmd_vel", info.start_ns);
  assert.equal(twist.decoded.linear.x, 0.5);
  const odom = await handle.engine.getRawMessageNearTime("/odom", info.start_ns);
  assert.equal(odom.decoded.header.frame_id, "odom");
  assert.equal(odom.decoded.child_frame_id, "base_link");
  const series = await handle.engine.getNumericSeries(score, "data", info.end_ns, info.start_ns, 20);
  assert.equal(series.v.length, 20);
  assert.equal(series.v[0], 1);
  assert.equal(series.v[19], 0.4);
  const missing = await handle.engine.getNumericSeries(score, "nonexistent", info.start_ns, info.end_ns);
  assert.equal(missing.v.length, 0);
  await handle.close();
});

test("rosbag2 folder metadata and sidecar roundtrip preserve SQLite payload references", async () => {
  const files = [{ relativePath: `bag/${dbName}`, data: sqlite }];
  const fingerprint = { name: "metadata.yaml", size: sqlite.length + metadata.length };
  const first = await openRosbag2Folder(metadata, files, { fingerprint });
  const sidecar = first.engine.getSidecarManifest();
  const cached = await openRosbag2Folder(metadata, files, { fingerprint, sidecar });
  assert.equal(cached.engine.getIndexStatus().sidecar_loaded, true);
  assert.equal((await cached.engine.getRawMessageNearTime(score, sidecar.start_ns)).decoded.data, 1);
  await assert.rejects(openRosbag2Folder(metadata, []), /Missing rosbag2 storage file/);
  await Promise.all([first.close(), cached.close()]);
});

test("truncated MCAP, invalid SQLite and missing folder metadata reject visibly", async () => {
  await assert.rejects(openMcap(mcap.subarray(0, mcap.length - 50)));
  await assert.rejects(openRosbag2(new Uint8Array([1, 2, 3])));
  await assert.rejects(openRosbag2Folder("", []), /no relative_file_paths/);
});
