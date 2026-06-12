#!/usr/bin/env node
/**
 * Demo ROS2 live agent — replays sample MCAP over WebSocket for local testing.
 *
 * Usage:
 *   node scripts/live-agent-demo.mjs [mcapPath] [--port 8765] [--loop]
 */
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { McapIndexedReader, TempBuffer } from "@mcap/core";
import { WebSocketServer } from "ws";

const LIVE_PROTOCOL_VERSION = "robotscope.live.v0.1";
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function defaultMcapPath() {
  const candidates = [
    resolve(repoRoot, "packages/robotscope-viewer/public/demo/demo-scene.mcap"),
    resolve(repoRoot, "sample_data/demo-scene.mcap"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return candidates[0];
}

function parseArgs(argv) {
  const options = {
    mcapPath: defaultMcapPath(),
    port: 8765,
    loop: true,
    allowPublish: [],
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--port") {
      options.port = Number(argv[++i] ?? options.port);
    } else if (arg === "--no-loop") {
      options.loop = false;
    } else if (arg === "--allow-publish") {
      const topic = argv[++i];
      if (topic) {
        options.allowPublish.push(topic);
      }
    } else if (!arg.startsWith("-")) {
      options.mcapPath = resolve(arg);
    }
  }

  return options;
}

function toBase64(data) {
  return Buffer.from(data).toString("base64");
}

async function loadRecording(mcapPath) {
  const bytes = readFileSync(mcapPath);
  const reader = await McapIndexedReader.Initialize({
    readable: new TempBuffer(bytes),
  });

  const channels = [...reader.channelsById.values()].map((channel) => {
    const schema = reader.schemasById.get(channel.schemaId);
    return {
      id: channel.id,
      topic: channel.topic,
      schema: schema?.name ?? "unknown",
      encoding: schema?.encoding ?? "ros2msg",
      definition: schema?.data ? new TextDecoder().decode(schema.data) : "",
    };
  });

  const messages = [];
  for await (const message of reader.readMessages()) {
    messages.push({
      channel_id: message.channelId,
      log_time_ns: Number(message.logTime),
      publish_time_ns: message.publishTime ? Number(message.publishTime) : undefined,
      sequence: message.sequence,
      data_b64: toBase64(message.data),
    });
  }

  const bounds = reader.statistics
    ? {
        start_ns: Number(reader.statistics.messageStartTime),
        end_ns: Number(reader.statistics.messageEndTime),
      }
    : { start_ns: 0, end_ns: 0 };

  return {
    channels,
    messages,
    bounds,
    topics: channels.map((channel) => ({ name: channel.topic, schema: channel.schema })),
  };
}

async function streamRecording(socket, recording, loop, allowPublish) {
  socket.send(
    JSON.stringify({
      type: "session",
      protocol: LIVE_PROTOCOL_VERSION,
      agent: "robotscope-live-agent-demo",
      start_ns: recording.bounds.start_ns,
      topics: recording.topics,
      ...(allowPublish.length > 0
        ? { capabilities: { command_publish: allowPublish } }
        : {}),
    }),
  );

  for (const channel of recording.channels) {
    socket.send(
      JSON.stringify({
        type: "channel",
        channel: {
          id: channel.id,
          topic: channel.topic,
          schema: channel.schema,
          encoding: channel.encoding,
          definition: channel.definition,
        },
      }),
    );
  }

  socket.send(
    JSON.stringify({
      type: "status",
      phase: "ready",
      message: `Loaded ${recording.messages.length} messages · ${recording.topics.length} topics`,
    }),
  );

  const durationNs = Math.max(recording.bounds.end_ns - recording.bounds.start_ns, 1);
  const replayStartMs = Date.now();

  do {
    socket.send(JSON.stringify({ type: "status", phase: "streaming", message: "Replay started" }));

    for (const message of recording.messages) {
      if (socket.readyState !== socket.OPEN) {
        return;
      }

      const elapsedNs = message.log_time_ns - recording.bounds.start_ns;
      const targetMs = replayStartMs + elapsedNs / 1e6;
      const waitMs = targetMs - Date.now();
      if (waitMs > 0) {
        await new Promise((resolveDelay) => setTimeout(resolveDelay, waitMs));
      }

      socket.send(JSON.stringify({ type: "message", ...message }));
    }

    if (!loop) {
      break;
    }

    socket.send(JSON.stringify({ type: "status", phase: "streaming", message: "Replay loop" }));
  } while (socket.readyState === socket.OPEN);
}

const options = parseArgs(process.argv);
const recording = await loadRecording(options.mcapPath);

const server = new WebSocketServer({ port: options.port });
console.log(`RobotScope live agent demo on ws://127.0.0.1:${options.port}`);
console.log(`Source: ${options.mcapPath} (${recording.messages.length} messages)`);
if (options.allowPublish.length > 0) {
  console.log(`Publish allowlist: ${options.allowPublish.join(", ")}`);
}

server.on("connection", (socket) => {
  console.log("Viewer connected");
  void streamRecording(socket, recording, options.loop, options.allowPublish).catch((error) => {
    socket.send(JSON.stringify({ type: "error", message: String(error) }));
    socket.close();
  });

  socket.on("message", (raw) => {
    const text = typeof raw === "string" ? raw : raw.toString("utf8");
    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      socket.send(
        JSON.stringify({
          type: "command.publish_result",
          ok: false,
          message: "Invalid JSON from viewer",
        }),
      );
      return;
    }

    if (payload?.type !== "command.publish") {
      return;
    }

    const topic = payload.topic;
    if (typeof topic !== "string" || !options.allowPublish.includes(topic)) {
      socket.send(
        JSON.stringify({
          type: "command.publish_result",
          ok: false,
          topic,
          message: `Topic ${topic ?? "?"} is not allowlisted for publish`,
        }),
      );
      return;
    }

    socket.send(
      JSON.stringify({
        type: "command.publish_result",
        ok: true,
        topic,
        message: `Demo agent accepted zero cmd_vel on ${topic} (no ROS publish)`,
      }),
    );
  });

  socket.on("close", () => {
    console.log("Viewer disconnected");
  });
});
