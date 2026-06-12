#!/usr/bin/env node
/**
 * Demo ROS2 live agent — replays sample MCAP over WebSocket for local testing.
 *
 * Usage:
 *   node scripts/live-agent-demo.mjs [mcapPath] [--port 8765] [--loop]
 */
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { McapIndexedReader, TempBuffer } from "@mcap/core";
import { WebSocketServer } from "ws";

const LIVE_PROTOCOL_VERSION = "robotscope.live.v0.1";
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function parseArgs(argv) {
  const options = {
    mcapPath: resolve(repoRoot, "sample_data/demo-scene.mcap"),
    port: 8765,
    loop: true,
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--port") {
      options.port = Number(argv[++i] ?? options.port);
    } else if (arg === "--no-loop") {
      options.loop = false;
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

async function streamRecording(socket, recording, loop) {
  socket.send(
    JSON.stringify({
      type: "session",
      protocol: LIVE_PROTOCOL_VERSION,
      agent: "robotscope-live-agent-demo",
      start_ns: recording.bounds.start_ns,
      topics: recording.topics,
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

server.on("connection", (socket) => {
  console.log("Viewer connected");
  void streamRecording(socket, recording, options.loop).catch((error) => {
    socket.send(JSON.stringify({ type: "error", message: String(error) }));
    socket.close();
  });

  socket.on("close", () => {
    console.log("Viewer disconnected");
  });
});
