#!/usr/bin/env node
/**
 * Generate a tiny MCAP with /tf and /tf_static for local RobotScope testing.
 * Usage: node scripts/create-tf-demo.mjs [output.mcap]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { McapWriter, TempBuffer } from "@mcap/core";
import { parse } from "@foxglove/rosmsg";
import { MessageWriter } from "@foxglove/rosmsg2-serialization";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const msgRoot = join(repoRoot, "node_modules/@foxglove/rosmsg-msgs-common/msgdefs/ros2humble");

function loadWriter(relativePath) {
  const text = readFileSync(join(msgRoot, relativePath), "utf8");
  return {
    text,
    writer: new MessageWriter(parse(text, { ros2: true })),
  };
}

const outputPath = resolve(process.argv[2] ?? "sample_data/demo-scene.mcap");

const schemaText = `geometry_msgs/TransformStamped[] transforms
================================================================================
MSG: geometry_msgs/TransformStamped
std_msgs/Header header
string child_frame_id
geometry_msgs/Transform transform
================================================================================
MSG: std_msgs/Header
builtin_interfaces/Time stamp
string frame_id
================================================================================
MSG: builtin_interfaces/Time
int32 sec
uint32 nanosec
================================================================================
MSG: geometry_msgs/Transform
geometry_msgs/Vector3 translation
geometry_msgs/Quaternion rotation
================================================================================
MSG: geometry_msgs/Vector3
float64 x
float64 y
float64 z
================================================================================
MSG: geometry_msgs/Quaternion
float64 x
float64 y
float64 z
float64 w`;

const tfWriter = new MessageWriter(parse(schemaText, { ros2: true }));
const odom = loadWriter("nav_msgs/msg/Odometry.msg");
const pathMsg = loadWriter("nav_msgs/msg/Path.msg");
const float32 = loadWriter("std_msgs/msg/Float32.msg");
const poseCov = loadWriter("geometry_msgs/msg/PoseWithCovarianceStamped.msg");
const poseStamped = loadWriter("geometry_msgs/msg/PoseStamped.msg");
const twist = loadWriter("geometry_msgs/msg/Twist.msg");
const occupancy = loadWriter("nav_msgs/msg/OccupancyGrid.msg");
const jointState = loadWriter("sensor_msgs/msg/JointState.msg");
const laneletSchemaText = `uint32 version
string format_version
uint8[] data`;

const laneletWriter = new MessageWriter(parse(laneletSchemaText, { ros2: true }));

const buffer = new TempBuffer();

const writer = new McapWriter({ writable: buffer });

const schemaId = await writer.registerSchema({
  name: "tf2_msgs/msg/TFMessage",
  encoding: "ros2msg",
  data: new TextEncoder().encode(schemaText),
});

const tfChannelId = await writer.registerChannel({
  topic: "/tf",
  messageEncoding: "cdr",
  schemaId,
  metadata: new Map(),
});

const staticChannelId = await writer.registerChannel({
  topic: "/tf_static",
  messageEncoding: "cdr",
  schemaId,
  metadata: new Map(),
});

const odomSchemaId = await writer.registerSchema({
  name: "nav_msgs/msg/Odometry",
  encoding: "ros2msg",
  data: new TextEncoder().encode(odom.text),
});

const pathSchemaId = await writer.registerSchema({
  name: "nav_msgs/msg/Path",
  encoding: "ros2msg",
  data: new TextEncoder().encode(pathMsg.text),
});

const float32SchemaId = await writer.registerSchema({
  name: "std_msgs/msg/Float32",
  encoding: "ros2msg",
  data: new TextEncoder().encode(float32.text),
});

const poseCovSchemaId = await writer.registerSchema({
  name: "geometry_msgs/msg/PoseWithCovarianceStamped",
  encoding: "ros2msg",
  data: new TextEncoder().encode(poseCov.text),
});

const poseStampedSchemaId = await writer.registerSchema({
  name: "geometry_msgs/msg/PoseStamped",
  encoding: "ros2msg",
  data: new TextEncoder().encode(poseStamped.text),
});

const twistSchemaId = await writer.registerSchema({
  name: "geometry_msgs/msg/Twist",
  encoding: "ros2msg",
  data: new TextEncoder().encode(twist.text),
});

const occupancySchemaId = await writer.registerSchema({
  name: "nav_msgs/msg/OccupancyGrid",
  encoding: "ros2msg",
  data: new TextEncoder().encode(occupancy.text),
});

const jointStateSchemaId = await writer.registerSchema({
  name: "sensor_msgs/msg/JointState",
  encoding: "ros2msg",
  data: new TextEncoder().encode(jointState.text),
});

const laneletSchemaId = await writer.registerSchema({
  name: "autoware_map_msgs/msg/LaneletMapBin",
  encoding: "ros2msg",
  data: new TextEncoder().encode(laneletSchemaText),
});

const odomChannelId = await writer.registerChannel({
  topic: "/localization/kinematic_state",
  messageEncoding: "cdr",
  schemaId: odomSchemaId,
  metadata: new Map(),
});

const pathChannelId = await writer.registerChannel({
  topic: "/planning/scenario_planning/trajectory",
  messageEncoding: "cdr",
  schemaId: pathSchemaId,
  metadata: new Map(),
});

const ndtChannelId = await writer.registerChannel({
  topic: "/localization/pose_estimator/ndt_score",
  messageEncoding: "cdr",
  schemaId: float32SchemaId,
  metadata: new Map(),
});

const lateralErrorChannelId = await writer.registerChannel({
  topic: "/control/trajectory_follower/lateral_error",
  messageEncoding: "cdr",
  schemaId: float32SchemaId,
  metadata: new Map(),
});

const longitudinalErrorChannelId = await writer.registerChannel({
  topic: "/control/trajectory_follower/longitudinal_error",
  messageEncoding: "cdr",
  schemaId: float32SchemaId,
  metadata: new Map(),
});

const amclChannelId = await writer.registerChannel({
  topic: "/amcl_pose",
  messageEncoding: "cdr",
  schemaId: poseCovSchemaId,
  metadata: new Map(),
});

const costmapChannelId = await writer.registerChannel({
  topic: "/local_costmap/costmap",
  messageEncoding: "cdr",
  schemaId: occupancySchemaId,
  metadata: new Map(),
});

const globalPlanChannelId = await writer.registerChannel({
  topic: "/plan",
  messageEncoding: "cdr",
  schemaId: pathSchemaId,
  metadata: new Map(),
});

const localPlanChannelId = await writer.registerChannel({
  topic: "/local_plan",
  messageEncoding: "cdr",
  schemaId: pathSchemaId,
  metadata: new Map(),
});

const goalChannelId = await writer.registerChannel({
  topic: "/goal_pose",
  messageEncoding: "cdr",
  schemaId: poseStampedSchemaId,
  metadata: new Map(),
});

const cmdVelChannelId = await writer.registerChannel({
  topic: "/cmd_vel",
  messageEncoding: "cdr",
  schemaId: twistSchemaId,
  metadata: new Map(),
});

const jointStateChannelId = await writer.registerChannel({
  topic: "/joint_states",
  messageEncoding: "cdr",
  schemaId: jointStateSchemaId,
  metadata: new Map(),
});

const displayPathChannelId = await writer.registerChannel({
  topic: "/display_planned_path",
  messageEncoding: "cdr",
  schemaId: pathSchemaId,
  metadata: new Map(),
});

const vectorMapChannelId = await writer.registerChannel({
  topic: "/map/vector_map",
  messageEncoding: "cdr",
  schemaId: laneletSchemaId,
  metadata: new Map(),
});

const mapGridChannelId = await writer.registerChannel({
  topic: "/map/map",
  messageEncoding: "cdr",
  schemaId: occupancySchemaId,
  metadata: new Map(),
});

const laneletCenterlinesChannelId = await writer.registerChannel({
  topic: "/map/lanelet2_centerlines",
  messageEncoding: "cdr",
  schemaId: pathSchemaId,
  metadata: new Map(),
});

function stamp(timeNs) {
  return { sec: Math.floor(timeNs / 1e9), nanosec: timeNs % 1e9 };
}

function encodeOdom(x, timeNs) {
  const s = stamp(timeNs);
  return odom.writer.writeMessage({
    header: { stamp: s, frame_id: "odom" },
    child_frame_id: "base_link",
    pose: {
      pose: {
        position: { x, y: 0, z: 0 },
        orientation: { x: 0, y: 0, z: 0, w: 1 },
      },
    },
    twist: {
      twist: {
        linear: { x: 0.5, y: 0, z: 0 },
        angular: { x: 0, y: 0, z: 0 },
      },
    },
  });
}

function encodePath(maxX) {
  const poses = [];
  for (let x = 0; x <= maxX; x += 0.5) {
    poses.push({
      header: { stamp: { sec: 0, nanosec: 0 }, frame_id: "map" },
      pose: {
        position: { x, y: 0, z: 0 },
        orientation: { x: 0, y: 0, z: 0, w: 1 },
      },
    });
  }
  return pathMsg.writer.writeMessage({
    header: { stamp: { sec: 0, nanosec: 0 }, frame_id: "map" },
    poses,
  });
}

function encodeFloat32(value) {
  return float32.writer.writeMessage({ data: value });
}

function encodeAmclPose(x, timeNs) {
  return poseCov.writer.writeMessage({
    header: { stamp: stamp(timeNs), frame_id: "map" },
    pose: {
      pose: {
        position: { x, y: 0.05, z: 0 },
        orientation: { x: 0, y: 0, z: 0, w: 1 },
      },
      covariance: [0.04, 0, 0, 0, 0.04, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0.02, 0, 0, 0],
    },
  });
}

function encodeGoalPose() {
  return poseStamped.writer.writeMessage({
    header: { stamp: { sec: 0, nanosec: 0 }, frame_id: "map" },
    pose: {
      position: { x: 3.5, y: 0.5, z: 0 },
      orientation: { x: 0, y: 0, z: 0, w: 1 },
    },
  });
}

function encodeCmdVel(i) {
  return twist.writer.writeMessage({
    linear: { x: 0.35, y: 0, z: 0 },
    angular: { x: 0, y: 0, z: Math.sin(i * 0.25) * 0.15 },
  });
}

function encodeCostmap(timeNs) {
  const width = 10;
  const height = 10;
  const data = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      data.push((x + y) % 3 === 0 ? 100 : 0);
    }
  }
  return occupancy.writer.writeMessage({
    header: { stamp: stamp(timeNs), frame_id: "map" },
    info: {
      map_load_time: stamp(0),
      resolution: 0.05,
      width,
      height,
      origin: {
        position: { x: -0.25, y: -0.25, z: 0 },
        orientation: { x: 0, y: 0, z: 0, w: 1 },
      },
    },
    data,
  });
}

function encodeMapGrid(timeNs) {
  const width = 24;
  const height = 24;
  const data = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const border = x === 0 || y === 0 || x === width - 1 || y === height - 1;
      const lane = y === 12 && x > 2 && x < width - 3;
      data.push(border || lane ? 100 : 0);
    }
  }
  return occupancy.writer.writeMessage({
    header: { stamp: stamp(timeNs), frame_id: "map" },
    info: {
      map_load_time: stamp(0),
      resolution: 0.1,
      width,
      height,
      origin: {
        position: { x: -1.2, y: -1.2, z: 0 },
        orientation: { x: 0, y: 0, z: 0, w: 1 },
      },
    },
    data,
  });
}

function encodeLaneletCenterlines() {
  const poses = [];
  for (let x = -1; x <= 1.2; x += 0.2) {
    poses.push({
      header: { stamp: { sec: 0, nanosec: 0 }, frame_id: "map" },
      pose: {
        position: { x, y: 0.05, z: 0.02 },
        orientation: { x: 0, y: 0, z: 0, w: 1 },
      },
    });
  }
  return pathMsg.writer.writeMessage({
    header: { stamp: { sec: 0, nanosec: 0 }, frame_id: "map" },
    poses,
  });
}
function encodeVectorMap() {
  const data = new Array(512).fill(0).map((_, index) => index % 256);
  return laneletWriter.writeMessage({
    version: 1,
    format_version: "1.0.0-demo",
    data,
  });
}

function encodeLocalPlan(maxX) {
  return encodePath(maxX);
}

function encodeJointStates(i, timeNs) {
  const names = ["shoulder_pan", "shoulder_lift", "elbow", "wrist"];
  const t = i * 0.2;
  const positions = names.map((_, index) => Math.sin(t + index) * 0.6);
  const velocities = names.map((_, index) => Math.cos(t + index) * (index === 2 ? 2.8 : 0.4));
  return jointState.writer.writeMessage({
    header: { stamp: stamp(timeNs), frame_id: "base_link" },
    name: names,
    position: positions,
    velocity: velocities,
  });
}

function encodeTf(parent, child, x, timeNs) {
  const sec = Math.floor(timeNs / 1e9);
  const nanosec = timeNs % 1e9;
  return tfWriter.writeMessage({
    transforms: [
      {
        header: { stamp: { sec, nanosec }, frame_id: parent },
        child_frame_id: child,
        transform: {
          translation: { x, y: 0, z: 0 },
          rotation: { x: 0, y: 0, z: 0, w: 1 },
        },
      },
    ],
  });
}

await writer.start({
  profile: "ros2",
  library: "robotscope-demo",
});

await writer.addMessage({
  channelId: staticChannelId,
  sequence: 0,
  logTime: 0n,
  publishTime: 0n,
  data: encodeTf("map", "odom", 0, 0),
});

await writer.addMessage({
  channelId: pathChannelId,
  sequence: 0,
  logTime: 0n,
  publishTime: 0n,
  data: encodePath(4),
});

await writer.addMessage({
  channelId: globalPlanChannelId,
  sequence: 0,
  logTime: 0n,
  publishTime: 0n,
  data: encodePath(4),
});

await writer.addMessage({
  channelId: displayPathChannelId,
  sequence: 0,
  logTime: 0n,
  publishTime: 0n,
  data: encodePath(3),
});

await writer.addMessage({
  channelId: goalChannelId,
  sequence: 0,
  logTime: 0n,
  publishTime: 0n,
  data: encodeGoalPose(),
});

await writer.addMessage({
  channelId: vectorMapChannelId,
  sequence: 0,
  logTime: 0n,
  publishTime: 0n,
  data: encodeVectorMap(),
});

await writer.addMessage({
  channelId: mapGridChannelId,
  sequence: 0,
  logTime: 0n,
  publishTime: 0n,
  data: encodeMapGrid(0),
});

await writer.addMessage({
  channelId: laneletCenterlinesChannelId,
  sequence: 0,
  logTime: 0n,
  publishTime: 0n,
  data: encodeLaneletCenterlines(),
});

for (let i = 0; i < 20; i += 1) {
  const t = BigInt(i * 100_000_000);
  const timeNs = Number(t);
  const ndtScore = Math.max(0.4, 2.5 - i * 0.12);
  const lateralError = Math.sin(i * 0.4) * 0.08;
  const longitudinalError = Math.cos(i * 0.3) * 0.05;
  await writer.addMessage({
    channelId: tfChannelId,
    sequence: i,
    logTime: t,
    publishTime: t,
    data: encodeTf("odom", "base_link", i * 0.1, timeNs),
  });
  await writer.addMessage({
    channelId: odomChannelId,
    sequence: i,
    logTime: t,
    publishTime: t,
    data: encodeOdom(i * 0.1, timeNs),
  });
  await writer.addMessage({
    channelId: ndtChannelId,
    sequence: i,
    logTime: t,
    publishTime: t,
    data: encodeFloat32(ndtScore),
  });
  await writer.addMessage({
    channelId: lateralErrorChannelId,
    sequence: i,
    logTime: t,
    publishTime: t,
    data: encodeFloat32(lateralError),
  });
  await writer.addMessage({
    channelId: longitudinalErrorChannelId,
    sequence: i,
    logTime: t,
    publishTime: t,
    data: encodeFloat32(longitudinalError),
  });
  await writer.addMessage({
    channelId: amclChannelId,
    sequence: i,
    logTime: t,
    publishTime: t,
    data: encodeAmclPose(i * 0.1, timeNs),
  });
  await writer.addMessage({
    channelId: costmapChannelId,
    sequence: i,
    logTime: t,
    publishTime: t,
    data: encodeCostmap(timeNs),
  });
  await writer.addMessage({
    channelId: localPlanChannelId,
    sequence: i,
    logTime: t,
    publishTime: t,
    data: encodeLocalPlan(Math.min(2, i * 0.15)),
  });
  await writer.addMessage({
    channelId: cmdVelChannelId,
    sequence: i,
    logTime: t,
    publishTime: t,
    data: encodeCmdVel(i),
  });
  await writer.addMessage({
    channelId: jointStateChannelId,
    sequence: i,
    logTime: t,
    publishTime: t,
    data: encodeJointStates(i, timeNs),
  });
}

await writer.end();
writeFileSync(outputPath, buffer.get());
console.log(`Wrote ${outputPath} (${buffer.get().byteLength} bytes)`);
