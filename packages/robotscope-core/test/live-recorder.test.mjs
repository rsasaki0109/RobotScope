import assert from "node:assert/strict";
import test from "node:test";
import { LiveMcapRecorder, openMcap } from "../dist/index.js";
import { channel, message, recordingMessages } from "./helpers/live-fixture.mjs";

test("recording drains concurrent channel registration and messages before its footer", async () => {
  const recorder = new LiveMcapRecorder();
  await recorder.start();
  const registration = recorder.registerChannel(channel);
  const duplicate = recorder.registerChannel(channel);
  const writes = Array.from({ length: 256 }, (_, index) => recorder.writeMessage(message(index)));
  // Finish while the writer is still draining; no caller-side serialization.
  const result = await recorder.finish();
  await Promise.all([registration, duplicate, ...writes]);
  assert.equal(result.message_count, 256);
  assert.equal(result.sidecar.topics.length, 1);
  assert.equal(result.sidecar.topics[0].times.length, 256);
  const { reader, messages } = await recordingMessages(result.data);
  assert.equal(reader.channelsById.size, 1);
  assert.equal(Number(reader.statistics.messageCount), 256);
  assert.deepEqual(messages.map((item) => item.sequence), Array.from({ length: 256 }, (_, i) => i));
  for (const item of messages) assert.equal(Buffer.from(item.data).readDoubleLE(4), item.sequence / 10);
  const handle = await openMcap(result.data);
  const series = await handle.engine.getNumericSeries(channel.topic, "data", message(0).log_time_ns, message(255).log_time_ns, 256);
  assert.equal(series.v.length, 256);
  assert.equal(series.v[255], 25.5);
  await handle.close();
});

test("recording cannot append after finalization or finalize twice", async () => {
  const recorder = new LiveMcapRecorder();
  await recorder.start();
  await recorder.registerChannel(channel);
  await recorder.writeMessage(message(0));
  const result = await recorder.finish();
  await recorder.writeMessage(message(1));
  assert.equal(recorder.getRecordedMessageCount(), 1);
  assert.equal(result.message_count, 1);
  await assert.rejects(recorder.finish(), /already finalized/);
});

test("recording reports an invalid accepted payload instead of exporting a partial success", async () => {
  const recorder = new LiveMcapRecorder();
  await recorder.start();
  await recorder.registerChannel(channel);
  await assert.rejects(recorder.writeMessage({ ...message(0), data_b64: "%%%" }));
  await assert.rejects(recorder.finish());
});

test("sub-millisecond seeks do not reuse a different message from the same cache bucket", async () => {
  const recorder = new LiveMcapRecorder();
  await recorder.start();
  await recorder.registerChannel(channel);
  await recorder.writeMessage({ ...message(1), log_time_ns: 1_000_000_100 });
  await recorder.writeMessage({ ...message(2), log_time_ns: 1_000_000_200 });
  const result = await recorder.finish();
  const handle = await openMcap(result.data);
  assert.equal((await handle.engine.getRawMessageNearTime(channel.topic, 1_000_000_100)).decoded.data, 0.1);
  assert.equal((await handle.engine.getRawMessageNearTime(channel.topic, 1_000_000_200)).decoded.data, 0.2);
  await handle.close();
});
