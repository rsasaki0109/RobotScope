#!/usr/bin/env node
/** Synthetic robot drive → stop, recorded as ordinary CDR + JSON MCAP. */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { McapWriter, TempBuffer } from "@mcap/core";
import { parse } from "@foxglove/rosmsg";
import { MessageWriter } from "@foxglove/rosmsg2-serialization";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = resolve(process.argv[2] ?? `${root}/packages/robotscope-viewer/public/demo/demo-hero.mcap`);
const buffer = new TempBuffer();
const writer = new McapWriter({ writable: buffer });
const textEncoder = new TextEncoder();
const STOP_SEC = 4.2;
const STOP_X = 7.2;
const curveY = (x) => 0.9 * Math.sin(x * Math.PI / 8);
const yawAt = (x) => Math.atan(0.9 * Math.PI / 8 * Math.cos(x * Math.PI / 8));
const rotation = (x) => ({ x: 0, y: 0, z: Math.sin(yawAt(x) / 2), w: Math.cos(yawAt(x) / 2) });
const stamp = (ns) => ({ sec: Math.floor(ns / 1e9), nanosec: ns % 1e9 });

async function cdr(topic, name, definition) {
  const schemaId = await writer.registerSchema({ name, encoding: "ros2msg", data: textEncoder.encode(definition) });
  const channelId = await writer.registerChannel({ topic, schemaId, messageEncoding: "cdr", metadata: new Map() });
  const messageWriter = new MessageWriter(parse(definition, { ros2: true }));
  return { channelId, encode: (value) => messageWriter.writeMessage(value) };
}
async function common(topic, name, path) {
  return cdr(topic, name, readFileSync(`${root}/node_modules/@foxglove/rosmsg-msgs-common/msgdefs/ros2humble/${path}`, "utf8"));
}
async function json(topic, name, archetype, entityPath, kind) {
  const schemaId = await writer.registerSchema({ name, encoding: "jsonschema", data: textEncoder.encode('{"type":"object"}') });
  const channelId = await writer.registerChannel({ topic, schemaId, messageEncoding: "json", metadata: new Map([
    ["robotscope.entity_path", entityPath], ["robotscope.archetype", archetype], ["robotscope.kind", kind],
  ]) });
  return { channelId, encode: (value) => textEncoder.encode(JSON.stringify(value)) };
}
const odom = await common("/localization/kinematic_state", "nav_msgs/msg/Odometry", "nav_msgs/msg/Odometry.msg");
const path = await common("/planning/scenario_planning/trajectory", "nav_msgs/msg/Path", "nav_msgs/msg/Path.msg");
const map = await common("/map/lanelet2_centerlines", "nav_msgs/msg/Path", "nav_msgs/msg/Path.msg");
const command = await common("/cmd_vel", "geometry_msgs/msg/Twist", "geometry_msgs/msg/Twist.msg");
const tf = await json("/robot/ego/transform", "robotscope.Transform.v1", "TF", "/robot/ego/transform", "robot");
const cloud = await json("/sensing/lidar/points", "robotscope.PointCloud.v1", "PointCloud", "/robot/ego/sensing/lidar/points", "sensor");
const detection = await json("/perception/detection/points", "robotscope.PointCloud.v1", "PointCloud", "/world/detection/points", "world");
const perception = await cdr("/perception/object_recognition/objects", "autoware_perception_msgs/msg/DetectedObjects", `std_msgs/Header header
demo/DetectedObjectStub[] objects
================================================================================
MSG: std_msgs/Header
builtin_interfaces/Time stamp
string frame_id
================================================================================
MSG: builtin_interfaces/Time
int32 sec
uint32 nanosec
================================================================================
MSG: demo/DetectedObjectStub
float32 existence_probability
string label
geometry_msgs/Point position
================================================================================
MSG: geometry_msgs/Point
float64 x
float64 y
float64 z`);

function poses(points, ns = 0) {
  return { header: { stamp: stamp(ns), frame_id: "map" }, poses: points.map(([x, y, z]) => ({
    header: { stamp: stamp(ns), frame_id: "map" },
    pose: { position: { x, y, z }, orientation: rotation(x) },
  })) };
}
async function write(channel, ns, value) {
  await writer.addMessage({ channelId: channel.channelId, sequence: ns / 25_000_000, logTime: BigInt(ns), publishTime: BigInt(ns), data: channel.encode(value) });
}

await writer.start({ profile: "", library: "RobotScope synthetic moving robot showcase" });
const route = Array.from({ length: 101 }, (_, i) => [i * 0.1, curveY(i * 0.1), 0.025]);
await write(map, 0, poses(route));
// Deterministic synthetic warehouse returns. These are stored in the recording,
// rather than invented by the renderer or captured from a physical robot.
const points = [];
for (const [cx, cy, height] of [[2.5, 2.9, 1.2], [5.5, -2.5, 0.9], [8.8, 2.7, 1.3]]) {
  for (let a = -0.6; a <= 0.6; a += 0.1) {
    for (let z = 0.1; z <= height; z += 0.1) {
      points.push([cx + a, cy - 0.6, z], [cx + a, cy + 0.6, z], [cx - 0.6, cy + a, z], [cx + 0.6, cy + a, z]);
    }
  }
}
for (let x = -1; x <= 11; x += 0.15) {
  for (let z = 0; z <= 1.5; z += 0.15) points.push([x, 4, z], [x, -4, z]);
}
await write(cloud, 0, { frame_id: "map", points });
for (let i = 0; i <= 240; i++) {
  const ns = i * 25_000_000;
  const sec = ns / 1e9;
  const stopped = sec >= STOP_SEC;
  const x = STOP_X * Math.min(sec / STOP_SEC, 1);
  const y = curveY(x);
  const q = rotation(x);
  const speed = stopped ? 0 : STOP_X / STOP_SEC * Math.hypot(1, 0.9 * Math.PI / 8 * Math.cos(x * Math.PI / 8));
  const slope = 0.9 * Math.PI / 8 * Math.cos(x * Math.PI / 8);
  const angularSpeed = stopped ? 0 : -0.9 * (Math.PI / 8) ** 2 * Math.sin(x * Math.PI / 8) / (1 + slope ** 2) * STOP_X / STOP_SEC;
  await write(odom, ns, {
    header: { stamp: stamp(ns), frame_id: "map" }, child_frame_id: "base_link",
    pose: { pose: { position: { x, y, z: 0 }, orientation: q } },
    twist: { twist: { linear: { x: speed, y: 0, z: 0 }, angular: { x: 0, y: 0, z: angularSpeed } } },
  });
  await write(tf, ns, { parent_frame_id: "map", child_frame_id: "base_link", translation: [x, y, 0], rotation: [q.x, q.y, q.z, q.w], is_static: false });
  const planned = stopped
    ? [[x, y, 0.03], [x + 0.05, y, 0.03]]
    : Array.from({ length: 31 }, (_, n) => { const px = x + n * 0.1; return [px, curveY(px), 0.03]; });
  await write(path, ns, poses(planned, ns));
  await write(command, ns, { linear: { x: speed, y: 0, z: 0 }, angular: { x: 0, y: 0, z: angularSpeed } });
  await write(perception, ns, { header: { stamp: stamp(ns), frame_id: "map" }, objects: stopped ? [{
    existence_probability: 0.38, label: "unknown", position: { x: STOP_X + 1.2, y: curveY(STOP_X + 1.2), z: 0 },
  }] : [] });
  const detectedPoints = [];
  if (stopped) {
    for (let a = -0.22; a <= 0.22; a += 0.044) {
      for (let z = 0.05; z <= 0.65; z += 0.05) {
        const cx = STOP_X + 1.2, cy = curveY(cx);
        detectedPoints.push([cx + a, cy - 0.22, z], [cx + a, cy + 0.22, z], [cx - 0.22, cy + a, z], [cx + 0.22, cy + a, z]);
      }
    }
  }
  await write(detection, ns, { frame_id: "map", points: detectedPoints });
}
await writer.end();
const bytes = await buffer.get();
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, bytes);
console.log(`Wrote ${output} (${bytes.byteLength} bytes): 7.2 m drive, turn, stop at ${STOP_SEC}s; synthetic demo`);
