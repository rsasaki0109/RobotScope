import type { Database } from "sql.js";

import {
  decodeRos2Message,
  isTfMessageSchema,
  isTfTopic,
  type SchemaInfo,
} from "../ros2/decoder.js";
import { TopicTimeIndex } from "../storage/topic-time-index.js";
import { TfBuffer } from "../tf/tf-buffer.js";

export interface Rosbag2IndexProgress {
  messages_read: number;
  transforms_added: number;
  topics_indexed: number;
}

export interface Rosbag2IndexResult {
  tfBuffer: TfBuffer;
  topicIndex: TopicTimeIndex;
  tf_message_count: number;
  tf_transform_count: number;
  tf_topics: string[];
  messagePayloads: Map<number, Uint8Array>;
}

interface DecodedTransform {
  header: { stamp: { sec: number; nanosec?: number; nsec?: number }; frame_id: string };
  child_frame_id: string;
  transform: {
    translation: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number; w: number };
  };
}

interface Rosbag2TopicRow {
  id: number;
  name: string;
  type: string;
}

function schemaFromTopicType(type: string): SchemaInfo {
  return {
    name: type,
    encoding: "cdr",
    data: new Uint8Array(),
  };
}

function readTopics(db: Database): Rosbag2TopicRow[] {
  const result = db.exec(
    "SELECT id, name, type FROM topics ORDER BY id",
  );
  if (!result.length) {
    return [];
  }

  const [table] = result;
  return table.values.map((row) => ({
    id: Number(row[0]),
    name: String(row[1]),
    type: String(row[2]),
  }));
}

/** Index rosbag2 SQLite storage (topics + messages tables). */
export function indexRosbag2Messages(
  db: Database,
  onProgress?: (progress: Rosbag2IndexProgress) => void,
): Rosbag2IndexResult {
  const topics = readTopics(db);
  if (topics.length === 0) {
    throw new Error("Not a rosbag2 SQLite file (missing topics table)");
  }

  const topicById = new Map(topics.map((topic) => [topic.id, topic]));
  const tfBuffer = new TfBuffer();
  const topicIndex = TopicTimeIndex.empty();
  const messagePayloads = new Map<number, Uint8Array>();
  const tfTopics = new Set<string>();

  for (const topic of topics) {
    if (isTfTopic(topic.name)) {
      tfTopics.add(topic.name);
    }
    topicIndex.registerChannel(topic.name, topic.id, topic.type);
  }

  const rows = db.exec(
    "SELECT id, topic_id, timestamp, data FROM messages ORDER BY timestamp",
  );
  const values = rows[0]?.values ?? [];

  let messages_read = 0;
  let transforms_added = 0;

  for (const row of values) {
    messages_read += 1;
    const messageId = Number(row[0]);
    const topicId = Number(row[1]);
    const log_time_ns = Number(row[2]);
    const data = row[3];

    if (!(data instanceof Uint8Array) && !Array.isArray(data)) {
      continue;
    }

    const payload =
      data instanceof Uint8Array ? data : Uint8Array.from(data.map((value) => Number(value) & 0xff));
    messagePayloads.set(messageId, payload);

    const topic = topicById.get(topicId);
    if (!topic) {
      continue;
    }

    topicIndex.add(topic.name, topic.id, topic.type, {
      log_time_ns,
      storage_id: messageId,
    });

    const schema = schemaFromTopicType(topic.type);
    if (!isTfTopic(topic.name) || !isTfMessageSchema(schema.name)) {
      if (messages_read % 500 === 0) {
        onProgress?.({
          messages_read,
          transforms_added,
          topics_indexed: topicIndex.topicCount(),
        });
      }
      continue;
    }

    const decoded = decodeRos2Message(schema, payload);
    if (!decoded.value) {
      continue;
    }

    const tfMessage = decoded.value as { transforms?: DecodedTransform[] };
    const isStatic = topic.name.includes("static");

    for (const transform of tfMessage.transforms ?? []) {
      tfBuffer.addTransform({
        parent_frame_id: transform.header.frame_id,
        child_frame_id: transform.child_frame_id,
        translation: [
          transform.transform.translation.x,
          transform.transform.translation.y,
          transform.transform.translation.z,
        ],
        rotation: [
          transform.transform.rotation.x,
          transform.transform.rotation.y,
          transform.transform.rotation.z,
          transform.transform.rotation.w,
        ],
        time_ns: isStatic ? 0 : log_time_ns,
        is_static: isStatic,
      });
      transforms_added += 1;
    }

    if (messages_read % 500 === 0) {
      onProgress?.({
        messages_read,
        transforms_added,
        topics_indexed: topicIndex.topicCount(),
      });
    }
  }

  topicIndex.finalize();
  onProgress?.({
    messages_read,
    transforms_added,
    topics_indexed: topicIndex.topicCount(),
  });

  return {
    tfBuffer,
    topicIndex,
    tf_message_count: messages_read,
    tf_transform_count: transforms_added,
    tf_topics: [...tfTopics].sort(),
    messagePayloads,
  };
}

export function rosbag2TimeBounds(db: Database): { start_ns: number; end_ns: number } {
  const result = db.exec("SELECT MIN(timestamp), MAX(timestamp) FROM messages");
  const row = result[0]?.values[0];
  if (!row) {
    return { start_ns: 0, end_ns: 0 };
  }
  return {
    start_ns: Number(row[0] ?? 0),
    end_ns: Number(row[1] ?? 0),
  };
}
