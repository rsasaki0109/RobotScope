/** Synthetic JSON/MCAP baseline for independent input; not a production SLA. */
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { McapWriter, TempBuffer } from "@mcap/core";
import { openMcap, JSON_SCHEMAS } from "../packages/robotscope-core/dist/index.js";
const count = 100_000;
const out = new TempBuffer();
const writer = new McapWriter({ writable: out, useChunks: true, chunkSize: 1024 * 1024 });
const encode = (value) => new TextEncoder().encode(JSON.stringify(value));
await writer.start({ profile: "", library: "robotscope-json-benchmark" });
async function channel(path, schema, archetype, kind) {
  const id = await writer.registerSchema({ name: schema, encoding: "jsonschema", data: encode({ type: "object" }) });
  return writer.registerChannel({ topic: path, schemaId: id, messageEncoding: "json", metadata: new Map([
    ["robotscope.entity_path", path], ["robotscope.archetype", archetype], ["robotscope.kind", kind],
  ]) });
}
const score = await channel("/robot/test/speed", JSON_SCHEMAS.Scalar, "Observation", "robot");
const camera = await channel("/robot/test/camera", JSON_SCHEMAS.Image, "Image", "sensor");
const started = performance.now();
for (let i = 0; i < count; i++) await writer.addMessage({ channelId: score, sequence: i, logTime: BigInt(i * 1_000_000), publishTime: BigInt(i * 1_000_000), data: encode({ value: i / 10, unit: "m/s" }) });
const pixels = Buffer.alloc(640 * 480 * 3, 127);
const image = encode({ frame_id: "camera", width: 640, height: 480, encoding: "rgb8", data_b64: pixels.toString("base64") });
for (let i = 0; i < 100; i++) await writer.addMessage({ channelId: camera, sequence: i, logTime: BigInt(i * 1_000_000_000), publishTime: BigInt(i * 1_000_000_000), data: image });
await writer.end();
const data = out.get();
const generated_ms = performance.now() - started;
let at = performance.now();
const handle = await openMcap(data);
const open_ms = performance.now() - at;
assert.equal(handle.engine.getIndexStatus().topic_index_messages, count + 100);
at = performance.now();
for (let i = 0; i < 100; i++) {
  const index = (i * 997) % count;
  assert.equal((await handle.engine.getRawMessageNearTime("/robot/test/speed", index * 1_000_000)).decoded.value, index / 10);
}
const seek_100_ms = performance.now() - at;
at = performance.now();
const series = await handle.engine.getNumericSeries("/robot/test/speed", "value", 0, (count - 1) * 1_000_000, 2000);
assert.equal(series.v.length, 2000);
const series_2000_ms = performance.now() - at;
at = performance.now();
const raw = await handle.engine.getRawMessageNearTime("/robot/test/camera", 0);
assert.equal(raw.decode_error, undefined);
assert.deepEqual(Buffer.from(raw.decoded.data_b64, "base64"), pixels);
const image_decode_ms = performance.now() - at;
const result = { node: process.version, workload: "synthetic JSON MCAP, 100000 Scalars + 100 RGB images", messages: count + 100, bytes: data.length,
  generated_ms, open_ms, seek_100_ms, series_2000_ms, image_decode_ms, rss_mib: process.memoryUsage().rss / 1024 / 1024 };
assert.ok([open_ms, seek_100_ms, series_2000_ms, image_decode_ms].every((ms) => ms < 15000), JSON.stringify(result));
await handle.close();
console.log(JSON.stringify(result, null, 2));
if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(result, null, 2) + "\n");
