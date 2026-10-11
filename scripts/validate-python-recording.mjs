/** Cross-language contract: write with the Python SDK, query with TypeScript. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openMcap } from "../packages/robotscope-core/dist/index.js";
const python = process.env.ROBOTSCOPE_PYTHON || "python3";
execFileSync(python, ["-m", "unittest", "discover", "-s", "sdk/python/tests", "-v"], { stdio: "inherit" });
const dir = mkdtempSync(join(tmpdir(), "robotscope-python-"));
try {
  const file = join(dir, "demo.mcap");
  execFileSync(python, ["sdk/python/examples/record_demo.py", file], { stdio: "inherit" });
  const handle = await openMcap(readFileSync(file));
  const info = await handle.engine.getSessionInfo();
  assert.equal(info.topics.length, 6);
  assert.equal(info.sidecar_message_count, 101);
  assert.equal(info.mapped_entity_count, 6);
  assert.equal(info.tf_transform_count, 1);
  const scene = await handle.engine.getSceneSnapshot(info.end_ns);
  assert.deepEqual(scene.poses[0].position, [1.9, 0, 0]);
  assert.deepEqual(Array.from(scene.point_clouds[0].points), [0, 0, 1, 1, 0, 1, 0, 1, 1]);
  assert.equal(scene.trajectories[0].point_count, 2);
  assert.deepEqual(scene.warnings, []);
  const values = await handle.engine.getNumericSeries("/robot/demo/speed", "value", info.start_ns, info.end_ns, 100);
  assert.equal(values.v.length, 20);
  assert.equal(values.v.at(-1), 1.9);
  const image = await handle.engine.getRawMessageNearTime("/robot/demo/camera", info.end_ns);
  assert.equal(image.decode_error, undefined);
  assert.deepEqual(Array.from(Buffer.from(image.decoded.data_b64, "base64")).slice(0, 3), [255, 190, 0]);
  await handle.close();
  console.log("PASS Python SDK → JSON MCAP → TypeScript entities, numeric series, image pixels and transformed 3D scene");
} finally { rmSync(dir, { recursive: true, force: true }); }
