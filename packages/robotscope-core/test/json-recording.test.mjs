import assert from "node:assert/strict";
import { test } from "node:test";
import { McapWriter, TempBuffer } from "@mcap/core";
import { decodeMessage, JSON_SCHEMAS, mapTopic, openMcap, openLive, validateJsonPayload } from "../dist/index.js";
import { server, session, channel as rosChannel, message as rosMessage } from "./helpers/live-fixture.mjs";
import { WebSocket } from "ws";
globalThis.WebSocket ??= WebSocket;

const metadata = (path, archetype, kind = "robot") => ({ "robotscope.entity_path": path, "robotscope.archetype": archetype, "robotscope.kind": kind });
const pose = { frame_id: "camera", position: [1, 2, 3], rotation: [0, 0, 0, 1] };
const transform = { parent_frame_id: "map", child_frame_id: "camera", translation: [10, 0, 0], rotation: [0, 0, 0, 1], is_static: true };

async function recording(items) {
  const out = new TempBuffer();
  const writer = new McapWriter({ writable: out, useChunks: true });
  await writer.start({ profile: "", library: "json-input-test" });
  for (const item of items) {
    const id = item.schema === null ? 0 : await writer.registerSchema({ name: item.schema ?? "custom.Telemetry", encoding: "jsonschema", data: new TextEncoder().encode('{"type":"object"}') });
    const channel = await writer.registerChannel({ topic: item.topic, schemaId: id, messageEncoding: item.encoding ?? "json", metadata: new Map(Object.entries(item.metadata ?? {})) });
    for (const [time, value] of item.values) await writer.addMessage({ channelId: channel, sequence: 0, logTime: BigInt(time), publishTime: BigInt(time), data: typeof value === "string" ? new TextEncoder().encode(value) : new TextEncoder().encode(JSON.stringify(value)) });
  }
  await writer.end();
  return out.get();
}

test("JSON and schema-less MCAP channels support raw inspection and numeric queries", async () => {
  const handle = await openMcap(await recording([{ topic: "/metrics", schema: null, values: [[0, { motor: { temperature: 42 } }], [100, { motor: { temperature: 43 } }]] }]));
  const raw = await handle.engine.getRawMessageNearTime("/metrics", 100);
  assert.equal(raw.message_encoding, "json");
  assert.equal(raw.decoded.motor.temperature, 43);
  const series = await handle.engine.getNumericSeries("/metrics", "motor.temperature", 0, 100, 20);
  assert.deepEqual(Array.from(series.v), [42, 43]);
  await handle.close();
});

test("native semantic geometry and transforms survive indexing and sidecar reuse", async () => {
  const input = await recording([
    { topic: "frame-stream", schema: JSON_SCHEMAS.Transform, metadata: metadata("/system/frames/camera", "TF", "system"), values: [[0, transform]] },
    { topic: "pose-stream", schema: JSON_SCHEMAS.Pose, metadata: metadata("/robot/test/pose", "Pose"), values: [[100, pose]] },
    { topic: "points-stream", schema: JSON_SCHEMAS.PointCloud, metadata: metadata("/robot/test/points", "PointCloud", "sensor"), values: [[100, { frame_id: "camera", points: [[1, 0, 0]] }]] },
    { topic: "plan-stream", schema: JSON_SCHEMAS.Trajectory, metadata: metadata("/robot/test/plan", "Trajectory"), values: [[100, { frame_id: "camera", points: [[0, 0, 0], [1, 0, 0]] }]] },
  ]);
  const fingerprint = { name: "json.mcap", size: input.length };
  const handle = await openMcap(input, { fingerprint });
  assert.equal(handle.engine.getIndexStatus().tf_message_count, 1);
  const cached = await openMcap(input, { fingerprint, sidecar: handle.engine.getSidecarManifest() });
  assert.equal(cached.engine.getIndexStatus().sidecar_loaded, true);
  for (const engine of [handle.engine, cached.engine]) {
    const entities = await engine.queryEntities({ time_ns: 100, filter: { paths: ["/robot/test/pose"] } });
    assert.equal(entities.entities[0].components.at(-1).frame.frame_id, "camera");
    assert.deepEqual(entities.entities[0].components.at(-1).value.position, [1, 2, 3]);
    const scene = await engine.getSceneSnapshot(100, { fixed_frame: "map" });
    assert.deepEqual(scene.poses[0].position, [11, 2, 3]);
    assert.deepEqual(Array.from(scene.point_clouds[0].points), [11, 0, 0]);
    assert.deepEqual(Array.from(scene.trajectories[0].points), [10, 0, 0, 11, 0, 0]);
    assert.deepEqual(scene.warnings, []);
  }
  await Promise.all([handle.close(), cached.close()]);
});

test("native geometry with an unresolved frame is omitted with a warning", async () => {
  const handle = await openMcap(await recording([{ topic: "pose", schema: JSON_SCHEMAS.Pose, metadata: metadata("/robot/test/pose", "Pose"), values: [[0, pose]] }]));
  const scene = await handle.engine.getSceneSnapshot(0);
  assert.equal(scene.poses.length, 0);
  assert.match(scene.warnings[0], /Missing transform camera/);
});

test("malformed JSON, invalid native payloads and unsupported encodings report decode errors", () => {
  const bytes = (value) => new TextEncoder().encode(value);
  const schema = { name: JSON_SCHEMAS.Pose, encoding: "jsonschema", data: new Uint8Array() };
  assert.ok(decodeMessage(schema, bytes('{"position":'), "json").error);
  assert.match(decodeMessage(schema, bytes(JSON.stringify({ ...pose, rotation: [0, 0, 0, 0] })), "json").error, /Invalid/);
  assert.match(decodeMessage(schema, bytes('{}'), "protobuf").error, /Unsupported message encoding/);
  assert.ok(decodeMessage(schema, new Uint8Array([0xff]), "json").error);
  for (const image of [
    { frame_id: "camera", width: 1, height: 1, encoding: "rgb8", data_b64: "AA==" },
    { frame_id: "camera", width: 1, height: 1, encoding: "png", data_b64: "AAAA" },
    { frame_id: "camera", width: -1, height: 1, encoding: "rgb8", data_b64: "AAAA" },
  ]) assert.throws(() => validateJsonPayload(JSON_SCHEMAS.Image, image));
  validateJsonPayload(JSON_SCHEMAS.Image, { frame_id: "camera", width: 1, height: 1, encoding: "rgb8", data_b64: "/wAA" });
});

test("explicit entity metadata rejects invalid paths and incompatible archetypes", () => {
  assert.equal(mapTopic("pose", JSON_SCHEMAS.Pose, metadata("/robot/test/pose", "Pose")).entity_path, "/robot/test/pose");
  for (const path of ["relative", "/robot/../pose", "/robot//pose"]) assert.equal(mapTopic("pose", JSON_SCHEMAS.Pose, metadata(path, "Pose")), undefined);
  assert.equal(mapTopic("pose", JSON_SCHEMAS.Pose, metadata("/robot/test/pose", "PointCloud")), undefined);
  assert.equal(mapTopic("unknown", "custom.Telemetry", { "robotscope.entity_path": "/robot/test/state", "robotscope.kind": "robot" }), undefined);
});

test("mixed ROS/JSON live channels record and reopen with encodings and semantic metadata", async (t) => {
  const jsonChannel = { id: 2, topic: "pose-stream", schema: JSON_SCHEMAS.Pose, encoding: "jsonschema", definition: '{"type":"object"}', message_encoding: "json", metadata: metadata("/robot/test/pose", "Pose") };
  let peer;
  const live = await server(t, (socket) => {
    peer = socket;
    socket.send(JSON.stringify(session));
    socket.send(JSON.stringify({ type: "channel", channel: rosChannel }));
    socket.send(JSON.stringify({ type: "channel", channel: jsonChannel }));
  });
  const handle = await openLive(live.url);
  t.after(() => handle.close());
  // Channel messages sent after the handshake need one event-loop turn.
  await new Promise((resolve) => setTimeout(resolve, 30));
  await handle.startRecording();
  peer.send(JSON.stringify(rosMessage(0)));
  peer.send(JSON.stringify({ type: "message", channel_id: 2, log_time_ns: 1_000_000_000, data_b64: Buffer.from(JSON.stringify({ ...pose, frame_id: "map" })).toString("base64") }));
  for (let i = 0; handle.getRecordedMessageCount() < 2 && i < 100; i++) await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(handle.getRecordedMessageCount(), 2);
  const result = await handle.stopRecording();
  const reopened = await openMcap(result.data);
  assert.equal((await reopened.engine.getRawMessageNearTime(rosChannel.topic, 1_000_000_000)).decoded.data, 0);
  assert.deepEqual((await reopened.engine.getRawMessageNearTime("pose-stream", 1_000_000_000)).decoded.position, [1, 2, 3]);
  assert.equal(reopened.engine.getMappedTopics().find((m) => m.topic === "pose-stream").entity_path, "/robot/test/pose");
  assert.deepEqual((await reopened.engine.getSceneSnapshot(1_000_000_000)).poses[0].position, [1, 2, 3]);
  await reopened.close();
});
