/** Synthetic readiness workload; no robot data or hardware performance claims. */
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { McapWriter, TempBuffer } from "@mcap/core";
import { MessageWriter } from "@foxglove/rosmsg2-serialization";
import { parse } from "@foxglove/rosmsg";
import { openMcap, TfBuffer } from "../packages/robotscope-core/dist/index.js";
import { LiveIngestBuffer } from "../packages/robotscope-core/dist/live/ingest-buffer.js";
import { channel, message } from "../packages/robotscope-core/test/helpers/live-fixture.mjs";

const count = 100_000;
const started = performance.now();
const output = new TempBuffer();
const writer = new McapWriter({ writable: output, useChunks: true, chunkSize: 1024 * 1024 });
await writer.start({ profile: "ros2", library: "robotscope-synthetic-benchmark" });
const schemaId = await writer.registerSchema({ name: channel.schema, encoding: channel.encoding, data: new TextEncoder().encode(channel.definition) });
const id = await writer.registerChannel({ topic: channel.topic, schemaId, messageEncoding: "cdr", metadata: new Map() });
for (let i = 0; i < count; i++) {
  const item = message(i);
  await writer.addMessage({ channelId: id, sequence: i, logTime: BigInt(item.log_time_ns), publishTime: BigInt(item.log_time_ns), data: Buffer.from(item.data_b64, "base64") });
}
// 100 standard ROS Image messages, 640x480 RGB: ~88 MiB of sensor payload.
// MCAP uses embedded ROS text; load the canonical definition included in the dependency.
const { readFileSync } = await import("node:fs");
const { createRequire } = await import("node:module");
const { dirname, resolve } = await import("node:path");
const require = createRequire(import.meta.url);
const commonDir = dirname(require.resolve("@foxglove/rosmsg-msgs-common/package.json"));
const imageDefinition = readFileSync(resolve(commonDir, "msgdefs/ros2humble/sensor_msgs/msg/Image.msg"));
const imageWriter = new MessageWriter(parse(imageDefinition.toString(), { ros2: true }));
const imageSchema = await writer.registerSchema({ name: "sensor_msgs/msg/Image", encoding: "ros2msg",
  data: imageDefinition });
const imageChannel = await writer.registerChannel({ topic: "/camera/image_raw", schemaId: imageSchema, messageEncoding: "cdr", metadata: new Map() });
const pixels = new Uint8Array(640 * 480 * 3);
for (let i = 0; i < pixels.length; i++) pixels[i] = i % 251;
const image = imageWriter.writeMessage({ header: { stamp: { sec: 1, nanosec: 0 }, frame_id: "camera" }, height: 480, width: 640,
  encoding: "rgb8", is_bigendian: 0, step: 640 * 3, data: pixels });
for (let i = 0; i < 100; i++) await writer.addMessage({ channelId: imageChannel, sequence: i, logTime: BigInt(message(i * 1000).log_time_ns), publishTime: BigInt(message(i * 1000).log_time_ns), data: image });
await writer.end();
const data = output.get();
const generatedMs = performance.now() - started;
const fingerprint = { name: "synthetic.mcap", size: data.length };
const openedAt = performance.now();
const handle = await openMcap(data, { fingerprint });
const openMs = performance.now() - openedAt;
assert.equal(handle.engine.getIndexStatus().topic_index_messages, count + 100);
const seekAt = performance.now();
for (let i = 0; i < 100; i++) {
  const index = (i * 997) % count;
  const raw = await handle.engine.getRawMessageNearTime(channel.topic, message(index).log_time_ns);
  assert.equal(raw.decoded.data, index / 10);
}
const seekMs = performance.now() - seekAt;
const seriesAt = performance.now();
const series = await handle.engine.getNumericSeries(channel.topic, "data", message(0).log_time_ns, message(count - 1).log_time_ns, 2000);
const seriesMs = performance.now() - seriesAt;
assert.ok(series.v.length > 0 && series.v.length <= 2000);
const cachedAt = performance.now();
const cached = await openMcap(data, { fingerprint, sidecar: handle.engine.getSidecarManifest() });
const cachedOpenMs = performance.now() - cachedAt;
assert.equal(cached.engine.getIndexStatus().sidecar_loaded, true);
const camera = await handle.engine.getRawMessageNearTime("/camera/image_raw", message(0).log_time_ns);
assert.equal(camera.decoded.width, 640);
assert.equal(camera.decoded.data.length, pixels.length);

const liveAt = performance.now();
const live = new LiveIngestBuffer();
live.registerChannel(channel);
for (let i = 0; i < count; i++) live.ingest(message(i));
const liveMs = performance.now() - liveAt;
assert.equal(live.getStats().message_count, count);
assert.equal(live.messageStore.messageCount(), 512);
assert.equal(live.topicIndex.messageCount, 512);
const tfAt = performance.now();
const tf = new TfBuffer();
for (let i = 0; i < count; i++) tf.addTransform({ parent_frame_id: "map", child_frame_id: "base_link", time_ns: i,
  translation: [i, 0, 0], rotation: [0, 0, 0, 1], is_static: false });
assert.equal(tf.lookupTransform("map", "base_link", 0).translation[0], 0);
assert.equal(tf.lookupTransform("map", "base_link", count - 1).translation[0], count - 1);
const tfMs = performance.now() - tfAt;

const results = { node: process.version, workload: "synthetic, uncompressed, 100000 Float64 + 100 RGB images",
  messages: count + 100, bytes: data.length, generated_ms: generatedMs, open_ms: openMs,
  sidecar_open_ms: cachedOpenMs, seek_100_ms: seekMs, series_2000_ms: seriesMs,
  live_100000_ms: liveMs, live_retained_messages: live.messageStore.messageCount(),
  tf_100000_ms: tfMs, rss_mib: process.memoryUsage().rss / 1024 / 1024 };
// Broad smoke budgets catch hangs; these are local acceptance limits, not an SLA.
assert.ok(openMs < 15000 && cachedOpenMs < 15000 && seekMs < 15000 && seriesMs < 15000 && liveMs < 15000 && tfMs < 15000, JSON.stringify(results));
await Promise.all([handle.close(), cached.close()]);
console.log(JSON.stringify(results, null, 2));
if (process.argv[2]) writeFileSync(process.argv[2], JSON.stringify(results, null, 2) + "\n");
