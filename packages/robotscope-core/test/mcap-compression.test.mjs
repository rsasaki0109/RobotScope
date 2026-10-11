import assert from "node:assert/strict";
import test from "node:test";
import * as zstdModule from "@foxglove/wasm-zstd";
import { openMcap } from "../dist/index.js";
import { channel, message } from "./helpers/live-fixture.mjs";
import { compressedRecording, lz4Frame } from "./helpers/compressed-fixture.mjs";


test("reads and queries Zstandard-compressed multi-chunk ROS MCAP", async () => {
  const zstd = zstdModule.default ?? zstdModule;
  await zstd.isLoaded;
  const handle = await openMcap(await compressedRecording("zstd", (data) => zstd.compress(data)));
  assert.equal(handle.engine.getIndexStatus().topic_index_messages, 50);
  const raw = await handle.engine.getRawMessageNearTime(channel.topic, message(49).log_time_ns);
  assert.equal(raw.decoded.data, 4.9);
  const series = await handle.engine.getNumericSeries(channel.topic, "data", message(0).log_time_ns, message(49).log_time_ns, 50);
  assert.equal(series.v.length, 50);
  await handle.close();
});

test("reads and queries LZ4-framed multi-chunk ROS MCAP", async () => {
  const handle = await openMcap(await compressedRecording("lz4", lz4Frame));
  assert.equal(handle.engine.getIndexStatus().topic_index_messages, 50);
  assert.equal((await handle.engine.getRawMessageNearTime(channel.topic, message(49).log_time_ns)).decoded.data, 4.9);
  await handle.close();
});

test("rejects unsupported compression and damaged Zstandard chunks", async () => {
  await assert.rejects(openMcap(await compressedRecording("unsupported", (data) => data)), /Unsupported compression/);
  await assert.rejects(openMcap(await compressedRecording("zstd", () => new Uint8Array([1, 2, 3]))));
});
