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
const STD_SRVS_SETBOOL_SCHEMA = "std_srvs/srv/SetBool";
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function fibonacciSequence(order) {
  const normalized = Math.max(0, Math.trunc(Number(order) || 0));
  if (normalized === 0) {
    return [0];
  }
  const sequence = [0, 1];
  while (sequence.length <= normalized) {
    sequence.push(sequence[sequence.length - 1] + sequence[sequence.length - 2]);
  }
  return sequence.slice(0, normalized + 1);
}

function simulateFibonacciAction(socket, action, order, activeSimulations) {
  const existing = activeSimulations.get(action);
  if (existing) {
    existing.cancel();
  }

  const sequence = fibonacciSequence(order);
  let index = 0;
  let timer;
  let cancelled = false;

  const sendOutcome = (status, ok, message) => {
    activeSimulations.delete(action);
    if (socket.readyState !== 1) {
      return;
    }
    socket.send(
      JSON.stringify({
        type: "command.action_outcome",
        action,
        ok,
        status,
        sequence: sequence.slice(0, Math.max(index + 1, 1)),
        message,
      }),
    );
  };

  const simulation = {
    cancel() {
      if (cancelled) {
        return;
      }
      cancelled = true;
      if (timer !== undefined) {
        clearTimeout(timer);
      }
      sendOutcome("canceled", false, `Demo Fibonacci canceled on ${action}`);
    },
  };

  const tick = () => {
    if (socket.readyState !== 1 || cancelled) {
      return;
    }

    socket.send(
      JSON.stringify({
        type: "command.action_feedback",
        action,
        sequence: sequence.slice(0, index + 1),
      }),
    );

    if (index >= sequence.length - 1) {
      sendOutcome("succeeded", true, `Demo Fibonacci completed (order=${order})`);
      return;
    }

    index += 1;
    timer = setTimeout(tick, 120);
  };

  activeSimulations.set(action, simulation);
  timer = setTimeout(tick, 120);
}

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
    allowService: [],
    allowSetBool: [],
    allowAction: [],
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
    } else if (arg === "--allow-service") {
      const service = argv[++i];
      if (service) {
        options.allowService.push(service);
      }
    } else if (arg === "--allow-set-bool") {
      const service = argv[++i];
      if (service) {
        options.allowSetBool.push(service);
      }
    } else if (arg === "--allow-action") {
      const action = argv[++i];
      if (action) {
        options.allowAction.push(action);
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

async function streamRecording(
  socket,
  recording,
  loop,
  allowPublish,
  allowService,
  allowSetBool,
  allowAction,
) {
  const capabilities = {};
  const serviceAllowlist = [...new Set([...allowService, ...allowSetBool])];
  if (allowPublish.length > 0) {
    capabilities.command_publish = allowPublish;
  }
  if (serviceAllowlist.length > 0) {
    capabilities.command_service_call = serviceAllowlist;
  }
  if (allowSetBool.length > 0) {
    capabilities.command_service_types = Object.fromEntries(
      allowSetBool.map((service) => [service, STD_SRVS_SETBOOL_SCHEMA]),
    );
  }
  if (allowAction.length > 0) {
    capabilities.command_action_send_goal = allowAction;
  }

  socket.send(
    JSON.stringify({
      type: "session",
      protocol: LIVE_PROTOCOL_VERSION,
      agent: "robotscope-live-agent-demo",
      start_ns: recording.bounds.start_ns,
      topics: recording.topics,
      ...(Object.keys(capabilities).length > 0 ? { capabilities } : {}),
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
  let replayStartMs = Date.now();

  do {
    socket.send(JSON.stringify({ type: "status", phase: "streaming", message: "Replay started" }));
    // Re-anchor the clock each loop so every pass replays in real time; otherwise
    // subsequent loops fire all messages instantly and can exhaust memory.
    replayStartMs = Date.now();

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
if (options.allowService.length > 0) {
  console.log(`Service allowlist: ${options.allowService.join(", ")}`);
}
if (options.allowSetBool.length > 0) {
  console.log(`SetBool service allowlist: ${options.allowSetBool.join(", ")}`);
}
if (options.allowAction.length > 0) {
  console.log(`Action allowlist: ${options.allowAction.join(", ")}`);
}
const serviceAllowlist = [...new Set([...options.allowService, ...options.allowSetBool])];

server.on("connection", (socket) => {
  console.log("Viewer connected");
  const activeActionSimulations = new Map();

  socket.on("close", () => {
    for (const simulation of activeActionSimulations.values()) {
      simulation.cancel();
    }
    activeActionSimulations.clear();
  });

  void streamRecording(
    socket,
    recording,
    options.loop,
    options.allowPublish,
    options.allowService,
    options.allowSetBool,
    options.allowAction,
  ).catch((error) => {
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

    if (payload?.type === "command.service_call") {
      const service = payload.service;
      if (typeof service !== "string" || !serviceAllowlist.includes(service)) {
        socket.send(
          JSON.stringify({
            type: "command.service_result",
            ok: false,
            service,
            message: `Service ${service ?? "?"} is not allowlisted for call`,
          }),
        );
        return;
      }

      if (payload.schema === STD_SRVS_SETBOOL_SCHEMA || options.allowSetBool.includes(service)) {
        const data = payload.data === true;
        console.log(`SetBool service call: service=${service} data=${data}`);
        socket.send(
          JSON.stringify({
            type: "command.service_result",
            ok: true,
            service,
            success: data,
            message: `Demo agent accepted SetBool(data=${data}) on ${service} (no ROS service call)`,
          }),
        );
        return;
      }

      socket.send(
        JSON.stringify({
          type: "command.service_result",
          ok: true,
          service,
          success: true,
          message: `Demo agent accepted Trigger call on ${service} (no ROS service call)`,
        }),
      );
      return;
    }

    if (payload?.type === "command.action_send_goal") {
      const action = payload.action;
      if (typeof action !== "string" || !options.allowAction.includes(action)) {
        socket.send(
          JSON.stringify({
            type: "command.action_result",
            ok: false,
            action,
            message: `Action ${action ?? "?"} is not allowlisted for goal send`,
          }),
        );
        return;
      }

      const order =
        payload.fibonacci && typeof payload.fibonacci === "object"
          ? payload.fibonacci.order
          : 3;
      const preempt = payload.preempt === true;

      if (preempt && activeActionSimulations.has(action)) {
        activeActionSimulations.get(action)?.cancel();
      } else if (!preempt && activeActionSimulations.has(action)) {
        socket.send(
          JSON.stringify({
            type: "command.action_result",
            ok: false,
            action,
            goal_accepted: false,
            message: `Demo agent rejected goal on ${action} — active goal running (use preempt)`,
          }),
        );
        return;
      }

      socket.send(
        JSON.stringify({
          type: "command.action_result",
          ok: true,
          action,
          goal_accepted: true,
          message: `Demo agent accepted Fibonacci goal order=${order} on ${action} (no ROS action)`,
        }),
      );
      simulateFibonacciAction(socket, action, order, activeActionSimulations);
      return;
    }

    if (payload?.type === "command.action_cancel_goal") {
      const action = payload.action;
      if (typeof action !== "string" || !options.allowAction.includes(action)) {
        socket.send(
          JSON.stringify({
            type: "command.action_cancel_result",
            ok: false,
            action,
            message: `Action ${action ?? "?"} is not allowlisted for goal cancel`,
          }),
        );
        return;
      }

      const simulation = activeActionSimulations.get(action);
      if (!simulation) {
        socket.send(
          JSON.stringify({
            type: "command.action_cancel_result",
            ok: false,
            action,
            message: `No active goal on ${action}`,
          }),
        );
        return;
      }

      simulation.cancel();
      socket.send(
        JSON.stringify({
          type: "command.action_cancel_result",
          ok: true,
          action,
          cancel_accepted: true,
          message: `Demo agent canceled Fibonacci on ${action}`,
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

    const twist = payload.twist;
    const readTwist = (field) =>
      twist && typeof twist === "object" && typeof twist[field] === "number"
        ? twist[field]
        : 0;
    const linearX = readTwist("linear_x");
    const linearY = readTwist("linear_y");
    const linearZ = readTwist("linear_z");
    const angularX = readTwist("angular_x");
    const angularY = readTwist("angular_y");
    const angularZ = readTwist("angular_z");
    const zeroTwist = payload.zero_twist === true;
    const twistSummary = [
      ["vx", linearX],
      ["vy", linearY],
      ["vz", linearZ],
      ["ωx", angularX],
      ["ωy", angularY],
      ["ωz", angularZ],
    ]
      .filter(([, value]) => Math.abs(value) > 1e-9)
      .map(([label, value]) => `${label}=${value.toFixed(2)}`)
      .join(" ");

    socket.send(
      JSON.stringify({
        type: "command.publish_result",
        ok: true,
        topic,
        message: zeroTwist
          ? `Demo agent accepted zero cmd_vel on ${topic} (no ROS publish)`
          : `Demo agent accepted cmd_vel ${twistSummary || "vx=0 ωz=0"} on ${topic} (no ROS publish)`,
      }),
    );
  });

  socket.on("close", () => {
    console.log("Viewer disconnected");
  });
});
