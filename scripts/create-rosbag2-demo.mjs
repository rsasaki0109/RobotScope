#!/usr/bin/env node
/**
 * Generate a small rosbag2 SQLite folder bag for RobotScope timeseries testing.
 * Usage: node scripts/create-rosbag2-demo.mjs [outDir]
 */
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";

import { MessageWriter } from "@foxglove/rosmsg2-serialization";
import { ros2humble } from "@foxglove/rosmsg-msgs-common";
import initSqlJs from "sql.js";

const require = createRequire(import.meta.url);

const BAG_FILENAME = "demo-rosbag2_0.db3";
const SERIALIZATION_FORMAT = "cdr";
const BASE_NS = 1_000_000_000_000;
const STEP_NS = 100_000_000;
const SAMPLE_COUNT = 20;
const EXPECTED_TOPIC_COUNT = 5;
const EXPECTED_MESSAGE_COUNT = 100;

const outDir = resolve(process.argv[2] ?? "sample_data/demo-rosbag2");
const dbPath = resolve(outDir, BAG_FILENAME);
const metadataPath = resolve(outDir, "metadata.yaml");

const topics = [
  {
    id: 1,
    name: "/localization/pose_estimator/ndt_score",
    type: "std_msgs/msg/Float64",
    messageAt(sampleIndex) {
      const t = sampleIndex / (SAMPLE_COUNT - 1);
      return { data: roundSignal(1.0 - 0.6 * t + 0.006 * Math.sin(4 * Math.PI * t)) };
    },
  },
  {
    id: 2,
    name: "/control/trajectory_follower/lateral_error",
    type: "std_msgs/msg/Float64",
    messageAt(sampleIndex) {
      return { data: roundSignal(0.2 * Math.sin((2 * Math.PI * sampleIndex) / 10)) };
    },
  },
  {
    id: 3,
    name: "/control/trajectory_follower/longitudinal_error",
    type: "std_msgs/msg/Float64",
    messageAt(sampleIndex) {
      return {
        data: roundSignal(0.15 * Math.sin((2 * Math.PI * sampleIndex) / 10 + Math.PI / 3)),
      };
    },
  },
  {
    id: 4,
    name: "/cmd_vel",
    type: "geometry_msgs/msg/Twist",
    messageAt(sampleIndex) {
      const phase = (2 * Math.PI * sampleIndex) / 10;
      return {
        linear: { x: roundSignal(0.5 + 0.4 * Math.sin(phase)), y: 0, z: 0 },
        angular: { x: 0, y: 0, z: roundSignal(0.2 * Math.cos(phase)) },
      };
    },
  },
  {
    id: 5,
    name: "/odom",
    type: "nav_msgs/msg/Odometry",
    messageAt(sampleIndex, timestamp) {
      return {
        header: {
          stamp: {
            sec: Math.floor(timestamp / 1_000_000_000),
            nanosec: timestamp % 1_000_000_000,
          },
          frame_id: "odom",
        },
        child_frame_id: "base_link",
        pose: {
          pose: {
            position: {
              x: roundSignal(0.1 * sampleIndex),
              y: roundSignal(0.02 * sampleIndex),
              z: 0,
            },
            orientation: { x: 0, y: 0, z: 0, w: 1 },
          },
          covariance: new Array(36).fill(0),
        },
        twist: {
          twist: {
            linear: { x: 0.5, y: 0, z: 0 },
            angular: { x: 0, y: 0, z: 0.1 },
          },
          covariance: new Array(36).fill(0),
        },
      };
    },
  },
];

function roundSignal(value) {
  return Number(value.toFixed(6));
}

function requiredSingleValue(db, sql) {
  const row = db.exec(sql)[0]?.values[0];
  if (!row) {
    throw new Error(`Self-check query returned no rows: ${sql}`);
  }
  return Number(row[0]);
}

function normalizeMessageType(type) {
  return type.replace("/msg/", "/");
}

function collectDefinitions(rootName) {
  const out = [];
  const seen = new Set();
  const visit = (name) => {
    if (seen.has(name)) {
      return;
    }
    seen.add(name);

    const entry = ros2humble[name];
    if (!entry) {
      return;
    }

    out.push(entry);
    for (const field of entry.definitions) {
      if (field.isComplex === true && field.isConstant !== true) {
        visit(field.type);
      }
    }
  };

  visit(rootName);
  if (out.length === 0) {
    throw new Error(`Missing ROS2 message definition from @foxglove/rosmsg-msgs-common: ${rootName}`);
  }
  return out;
}

function buildMetadata() {
  const totalMessages = topics.length * SAMPLE_COUNT;
  const durationNs = (SAMPLE_COUNT - 1) * STEP_NS;
  const topicEntries = topics
    .map(
      (topic) => `    - topic_metadata:
        name: ${topic.name}
        type: ${topic.type}
        serialization_format: ${SERIALIZATION_FORMAT}
        offered_qos_profiles: ""
      message_count: ${SAMPLE_COUNT}`,
    )
    .join("\n");

  return `rosbag2_bagfile_information:
  version: 5
  storage_identifier: sqlite3
  duration:
    nanoseconds: ${durationNs}
  starting_time:
    nanoseconds_since_epoch: ${BASE_NS}
  message_count: ${totalMessages}
  topics_with_message_count:
${topicEntries}
  relative_file_paths:
    - ${BAG_FILENAME}
`;
}

const SQL = await initSqlJs({
  locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
});
const writersByType = new Map(
  [...new Set(topics.map((topic) => topic.type))].map((type) => [
    type,
    new MessageWriter(collectDefinitions(normalizeMessageType(type))),
  ]),
);
const db = new SQL.Database();

db.run(`
CREATE TABLE topics(
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  serialization_format TEXT NOT NULL,
  offered_qos_profiles TEXT NOT NULL DEFAULT ''
);
CREATE TABLE messages(
  id INTEGER PRIMARY KEY,
  topic_id INTEGER NOT NULL,
  timestamp INTEGER NOT NULL,
  data BLOB NOT NULL
);
`);

const insertTopic = db.prepare(`
INSERT INTO topics(id, name, type, serialization_format, offered_qos_profiles)
VALUES (?, ?, ?, ?, ?)
`);
for (const topic of topics) {
  insertTopic.run([topic.id, topic.name, topic.type, SERIALIZATION_FORMAT, ""]);
}
insertTopic.free();

const insertMessage = db.prepare(`
INSERT INTO messages(id, topic_id, timestamp, data)
VALUES (?, ?, ?, ?)
`);
let messageId = 1;
for (let sampleIndex = 0; sampleIndex < SAMPLE_COUNT; sampleIndex += 1) {
  const timestamp = BASE_NS + sampleIndex * STEP_NS;
  for (const topic of topics) {
    const writer = writersByType.get(topic.type);
    if (!writer) {
      throw new Error(`Missing MessageWriter for ${topic.type}`);
    }
    const payload = writer.writeMessage(topic.messageAt(sampleIndex, timestamp));
    insertMessage.run([messageId, topic.id, timestamp, payload]);
    messageId += 1;
  }
}
insertMessage.free();

mkdirSync(outDir, { recursive: true });
writeFileSync(dbPath, Buffer.from(db.export()));
writeFileSync(metadataPath, buildMetadata());
db.close();

const verificationDb = new SQL.Database(readFileSync(dbPath));
const verifiedTopics = requiredSingleValue(verificationDb, "SELECT COUNT(*) FROM topics");
const verifiedMessages = requiredSingleValue(verificationDb, "SELECT COUNT(*) FROM messages");
const minPayloadBytes = requiredSingleValue(verificationDb, "SELECT MIN(length(data)) FROM messages");
const maxPayloadBytes = requiredSingleValue(verificationDb, "SELECT MAX(length(data)) FROM messages");
verificationDb.close();

if (verifiedTopics !== EXPECTED_TOPIC_COUNT) {
  throw new Error(`Self-check failed: expected ${EXPECTED_TOPIC_COUNT} topics, got ${verifiedTopics}`);
}
if (verifiedMessages !== EXPECTED_MESSAGE_COUNT) {
  throw new Error(
    `Self-check failed: expected ${EXPECTED_MESSAGE_COUNT} messages, got ${verifiedMessages}`,
  );
}
if (minPayloadBytes <= 0 || maxPayloadBytes < minPayloadBytes) {
  throw new Error(
    `Self-check failed: invalid CDR payload byte range ${minPayloadBytes}-${maxPayloadBytes}`,
  );
}

console.log(`Created rosbag2 demo bag: ${outDir}`);
console.log(`  storage: ${dbPath}`);
console.log(`  metadata: ${metadataPath}`);
console.log(`  topics: ${topics.length}`);
console.log(`  samples: ${SAMPLE_COUNT} per topic (${verifiedMessages} messages total)`);
console.log(
  `  self-check: topics=${verifiedTopics}, messages=${verifiedMessages}, payload_bytes=${minPayloadBytes}-${maxPayloadBytes}`,
);
