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
const MESSAGE_TYPE = "std_msgs/msg/Float64";
const SERIALIZATION_FORMAT = "cdr";
const BASE_NS = 1_000_000_000_000;
const STEP_NS = 100_000_000;
const SAMPLE_COUNT = 20;

const outDir = resolve(process.argv[2] ?? "sample_data/demo-rosbag2");
const dbPath = resolve(outDir, BAG_FILENAME);
const metadataPath = resolve(outDir, "metadata.yaml");

const topics = [
  {
    id: 1,
    name: "/localization/pose_estimator/ndt_score",
    valueAt(sampleIndex) {
      const t = sampleIndex / (SAMPLE_COUNT - 1);
      return 1.0 - 0.6 * t + 0.006 * Math.sin(4 * Math.PI * t);
    },
  },
  {
    id: 2,
    name: "/control/trajectory_follower/lateral_error",
    valueAt(sampleIndex) {
      return 0.2 * Math.sin((2 * Math.PI * sampleIndex) / 10);
    },
  },
  {
    id: 3,
    name: "/control/trajectory_follower/longitudinal_error",
    valueAt(sampleIndex) {
      return 0.15 * Math.sin((2 * Math.PI * sampleIndex) / 10 + Math.PI / 3);
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

function buildMetadata() {
  const totalMessages = topics.length * SAMPLE_COUNT;
  const durationNs = (SAMPLE_COUNT - 1) * STEP_NS;
  const topicEntries = topics
    .map(
      (topic) => `    - topic_metadata:
        name: ${topic.name}
        type: ${MESSAGE_TYPE}
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

const float64Definition = ros2humble["std_msgs/Float64"];
if (!float64Definition) {
  throw new Error("Missing std_msgs/Float64 definition from @foxglove/rosmsg-msgs-common");
}

const SQL = await initSqlJs({
  locateFile: () => require.resolve("sql.js/dist/sql-wasm.wasm"),
});
const writer = new MessageWriter([float64Definition]);
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
  insertTopic.run([topic.id, topic.name, MESSAGE_TYPE, SERIALIZATION_FORMAT, ""]);
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
    const value = roundSignal(topic.valueAt(sampleIndex));
    const payload = writer.writeMessage({ data: value });
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

if (verifiedTopics !== topics.length) {
  throw new Error(`Self-check failed: expected ${topics.length} topics, got ${verifiedTopics}`);
}
if (verifiedMessages !== topics.length * SAMPLE_COUNT) {
  throw new Error(
    `Self-check failed: expected ${topics.length * SAMPLE_COUNT} messages, got ${verifiedMessages}`,
  );
}
if (minPayloadBytes !== 12 || maxPayloadBytes !== 12) {
  throw new Error(
    `Self-check failed: expected 12-byte Float64 CDR payloads, got ${minPayloadBytes}-${maxPayloadBytes}`,
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
