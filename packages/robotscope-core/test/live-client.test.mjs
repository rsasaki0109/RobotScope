import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import WebSocket from "ws";
import { openLive } from "../dist/index.js";
import { channel, session, message, server, recordingMessages } from "./helpers/live-fixture.mjs";

// Node 20 does not provide a default global WebSocket; use the browser-compatible ws API.
globalThis.WebSocket = WebSocket;

test("requires a session handshake and closes a silent peer on timeout", async (t) => {
  const { server: peer, url } = await server(t, () => {});
  await assert.rejects(openLive(url, { connectTimeoutMs: 40 }), /session handshake/);
  const sockets = [...peer.clients];
  if (sockets.length) await once(sockets[0], "close");
  assert.equal(peer.clients.size, 0);
});

test("rejects unsupported protocol and closes the failed connection", async (t) => {
  const { url } = await server(t, (socket) => socket.send(JSON.stringify({ ...session, protocol: "unknown" })));
  await assert.rejects(openLive(url), /Unsupported live protocol/);
});

test("aborts a pending handshake and rejects pre-aborted requests", async (t) => {
  const { server: peer, url } = await server(t, () => {});
  const controller = new AbortController();
  const connected = once(peer, "connection");
  const opening = openLive(url, { signal: controller.signal });
  const rejected = assert.rejects(opening, { name: "AbortError" });
  await connected;
  controller.abort();
  await rejected;
  await assert.rejects(openLive(url, { signal: controller.signal }), { name: "AbortError" });
});

test("remote close before the handshake rejects promptly", async (t) => {
  const { url } = await server(t, (socket) => socket.close());
  await assert.rejects(openLive(url), /closed before ready/);
});

test("remote disconnect rejects in-flight commands instead of waiting five seconds", async (t) => {
  const { url } = await server(t, (socket) => {
    socket.send(JSON.stringify({ ...session, capabilities: { command_publish: ["/cmd_vel"] } }));
    socket.on("message", () => socket.close());
  });
  const handle = await openLive(url);
  t.after(() => handle.close());
  await assert.rejects(handle.publishCommand({ topic: "/cmd_vel", schema: "geometry_msgs/msg/Twist", zero_twist: true }), /disconnected/);
});

test("live roundtrip records a burst, decodes it and clears callbacks on close", async (t) => {
  let peer;
  const { url } = await server(t, (socket) => {
    peer = socket;
    socket.send(JSON.stringify(session));
    socket.send(JSON.stringify({ type: "channel", channel }));
  });
  let updates = 0;
  const handle = await openLive(url, { onSessionUpdate: () => updates++ });
  t.after(() => handle.close());
  await handle.startRecording();
  for (let i = 0; i < 100; i++) peer.send(JSON.stringify(message(i)));
  await new Promise((resolve, reject) => {
    const deadline = setTimeout(() => { clearInterval(poll); reject(new Error("100 messages were not recorded")); }, 1000);
    const poll = setInterval(() => {
      if (handle.getRecordedMessageCount() !== 100) return;
      clearTimeout(deadline); clearInterval(poll); resolve();
    }, 5);
  });
  assert.equal((await handle.engine.getRawMessageNearTime(channel.topic, message(50).log_time_ns)).decoded.data, 5);
  const result = await handle.stopRecording();
  assert.equal(result.message_count, 100);
  assert.equal((await recordingMessages(result.data)).messages.length, 100);
  await handle.close();
  const before = updates;
  await new Promise((resolve) => setTimeout(resolve, 130));
  assert.equal(updates, before);
  await assert.rejects(handle.publishCommand({ topic: "/cmd_vel", schema: "geometry_msgs/msg/Twist" }), /not connected/);
});

test("command capabilities are opt-in and reject unlisted destinations", async (t) => {
  const { url } = await server(t, (socket) => socket.send(JSON.stringify(session)));
  const handle = await openLive(url);
  t.after(() => handle.close());
  await assert.rejects(handle.publishCommand({ topic: "/cmd_vel", schema: "geometry_msgs/msg/Twist" }), /not allowlisted/);
  await assert.rejects(handle.callService({ service: "/test", schema: "std_srvs/srv/Trigger" }), /not allowlisted/);
  await assert.rejects(handle.sendActionGoal({ action: "/test", schema: "example_interfaces/action/Fibonacci", fibonacci: { order: 3 } }), /not allowlisted/);
  await assert.rejects(handle.cancelActionGoal({ action: "/test" }), /not allowlisted/);
});
