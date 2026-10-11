import assert from "node:assert/strict";
import test from "node:test";
import { parseLiveServerMessage } from "../dist/live/protocol.js";
import { LiveIngestBuffer } from "../dist/live/ingest-buffer.js";
import { LiveMessageStore } from "../dist/live/message-store.js";
import { LiveQueryEngineImpl } from "../dist/live/live-query-engine.js";
import { channel, session, message } from "./helpers/live-fixture.mjs";

test("accepts protocol messages with valid ROS timestamps and optional capabilities", () => {
  for (const item of [session, { type: "channel", channel }, message(0),
    { ...session, start_ns: 1_800_000_000_000_000_000, capabilities: { command_publish: ["/cmd_vel"] } },
    { type: "status", phase: "waiting_for_topics", topics_pending: 2 },
    { type: "command.action_feedback", action: "/demo", sequence: [0, 1, 1, 2] },
    { type: "command.service_result", ok: false, message: "denied" },
  ]) assert.deepEqual(parseLiveServerMessage(JSON.stringify(item)), item);
});

test("drops malformed sessions, channels, payloads and command results without throwing", () => {
  for (const item of [null, [], {}, { type: "unknown" },
    { ...session, topics: null }, { ...session, start_ns: "1" },
    { ...session, capabilities: { command_publish: true } },
    { ...session, capabilities: { command_service_types: ["invalid"] } },
    { type: "channel", channel: null }, { type: "channel", channel: { ...channel, id: -1 } },
    { ...message(0), data_b64: "%%%" }, { ...message(0), log_time_ns: -1 },
    { ...message(0), channel_id: 1.5 }, { ...message(0), publish_time_ns: null },
    { type: "status", phase: "invalid" }, { type: "status", phase: "ready", topics_pending: -1 },
    { type: "command.publish_result", ok: "true", message: "wrong" },
    { type: "command.action_outcome", action: "/demo", sequence: [], ok: true, status: "unknown" },
  ]) assert.equal(parseLiveServerMessage(JSON.stringify(item)), null, JSON.stringify(item));
  assert.equal(parseLiveServerMessage("{"), null);
  assert.equal(parseLiveServerMessage('{"type":"message","channel_id":1,"log_time_ns":1e999,"data_b64":""}'), null);
});

test("live nearest-message lookup handles out-of-order timestamps and remains bounded", () => {
  const store = new LiveMessageStore();
  const raw = (time) => ({ topic: channel.topic, schema: channel.schema, log_time_ns: time, data_size: 12 });
  for (const time of [30, 10, 50, 20, 40]) store.add(raw(time), 4);
  assert.equal(store.messageCount(), 4);
  assert.equal(store.findNearest(channel.topic, 21).log_time_ns, 20);
  assert.equal(store.findNearest(channel.topic, 49).log_time_ns, 50);
  assert.deepEqual(store.findRange(channel.topic, 20, 40).map((item) => item.log_time_ns), [20, 30, 40]);
});

test("a replacement agent session cannot expose previous buffered data", () => {
  const buffer = new LiveIngestBuffer();
  buffer.resetSession(session.start_ns, session.topics);
  buffer.registerChannel(channel);
  buffer.ingest(message(5));
  assert.equal(buffer.getStats().message_count, 1);
  buffer.resetSession(session.start_ns + 1_000_000, session.topics);
  assert.equal(buffer.getStats().message_count, 0);
  assert.equal(buffer.messageStore.findNearest(channel.topic, message(5).log_time_ns), null);
  assert.equal(buffer.getChannelDefinitions().length, 0);
});

test("long live streams keep 512 messages/index entries per topic and count all received data", () => {
  const buffer = new LiveIngestBuffer();
  buffer.resetSession(session.start_ns, session.topics);
  buffer.registerChannel(channel);
  for (let i = 0; i < 2000; i++) buffer.ingest(message(i));
  assert.equal(buffer.messageStore.messageCount(), 512);
  assert.equal(buffer.topicIndex.messageCount, 512);
  assert.equal(buffer.getStats().message_count, 2000);
  assert.equal(buffer.topicIndex.findNearest(channel.topic, message(1999).log_time_ns).sequence, 1999);
});

test("live queries refresh cached values when new data or a new session arrives", async () => {
  const buffer = new LiveIngestBuffer();
  const engine = new LiveQueryEngineImpl(buffer);
  buffer.resetSession(session.start_ns, session.topics);
  buffer.registerChannel(channel);
  buffer.ingest(message(0));
  assert.equal((await engine.getRawMessageNearTime(channel.topic, message(1).log_time_ns)).decoded.data, 0);
  assert.equal((await engine.getNumericSeries(channel.topic, "data", message(0).log_time_ns, message(1).log_time_ns)).v.length, 1);
  buffer.ingest(message(1));
  assert.equal((await engine.getRawMessageNearTime(channel.topic, message(1).log_time_ns)).decoded.data, 0.1);
  assert.equal((await engine.getNumericSeries(channel.topic, "data", message(0).log_time_ns, message(1).log_time_ns)).v.length, 2);
  buffer.resetSession(session.start_ns, session.topics);
  assert.equal(await engine.getRawMessageNearTime(channel.topic, message(1).log_time_ns), null);
});
