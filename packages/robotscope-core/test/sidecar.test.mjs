import assert from "node:assert/strict";
import test from "node:test";
import { parseSidecarManifest, serializeSidecarManifest, sidecarFromTopicIndex, validateSidecarFingerprint, openMcap } from "../dist/index.js";
import { LiveMcapRecorder } from "../dist/live/recorder.js";
import { channel, message } from "./helpers/live-fixture.mjs";

const fingerprint = { name: "test.mcap", size: 100, last_modified_ms: 42 };
const manifest = sidecarFromTopicIndex([{ topic: channel.topic, schema: channel.schema,
  channel_id: 1, entries: [{ log_time_ns: 1, sequence: 0 }, { log_time_ns: 2, sequence: 1 }] }],
  { start_ns: 1, end_ns: 2 }, { messages: 0, transforms: 0 }, fingerprint, "mcap");

test("sidecar roundtrip retains source, tuples and matching fingerprint", () => {
  assert.deepEqual(parseSidecarManifest(serializeSidecarManifest(manifest)), manifest);
  assert.equal(validateSidecarFingerprint(manifest, fingerprint), true);
  assert.equal(validateSidecarFingerprint(manifest, { ...fingerprint, last_modified_ms: 43 }), false);
});

test("ignores malformed or unsorted sidecars instead of breaking playback", () => {
  for (const invalid of [null, {}, { ...manifest, start_ns: "1" }, { ...manifest, end_ns: 0 },
    { ...manifest, topics: [null] }, { ...manifest, topics: [...manifest.topics, ...manifest.topics] },
    { ...manifest, topics: [{ ...manifest.topics[0], times: [[2], [1]] }] },
    { ...manifest, topics: [{ ...manifest.topics[0], times: [[1, -1]] }] },
    { ...manifest, fingerprint: { size: 10 } },
  ]) assert.equal(parseSidecarManifest(JSON.stringify(invalid)), null);
});

test("a rosbag2 sidecar cannot supply an MCAP timestamp index even with matching file metadata", async () => {
  const recorder = new LiveMcapRecorder();
  await recorder.start(); await recorder.registerChannel(channel); await recorder.writeMessage(message(1));
  const result = await recorder.finish();
  const fingerprint = { name: "test.mcap", size: result.data.length };
  const sidecar = { ...result.sidecar, fingerprint, recording_source: "rosbag2" };
  const handle = await openMcap(result.data, { sidecar, fingerprint });
  assert.equal(handle.engine.getIndexStatus().sidecar_loaded, false);
  assert.equal((await handle.engine.getRawMessageNearTime(channel.topic, message(1).log_time_ns)).decoded.data, 0.1);
  await handle.close();
});
