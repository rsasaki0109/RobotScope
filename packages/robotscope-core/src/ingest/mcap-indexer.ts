import type { McapIndexedReader } from "@mcap/core";

import {
  decodeRos2Message,
  isTfMessageSchema,
  isTfTopic,
  type SchemaInfo,
} from "../ros2/decoder.js";
import { TopicTimeIndex } from "../storage/topic-time-index.js";
import { TfBuffer } from "../tf/tf-buffer.js";

export interface McapIndexProgress {
  messages_read: number;
  transforms_added: number;
  topics_indexed: number;
}

export interface McapIndexResult {
  tfBuffer: TfBuffer;
  topicIndex: TopicTimeIndex;
  tf_message_count: number;
  tf_transform_count: number;
  tf_topics: string[];
}

interface DecodedTransform {
  header: { stamp: { sec: number; nanosec?: number; nsec?: number }; frame_id: string };
  child_frame_id: string;
  transform: {
    translation: { x: number; y: number; z: number };
    rotation: { x: number; y: number; z: number; w: number };
  };
}

function schemaFromReader(
  reader: McapIndexedReader,
  schemaId: number,
): SchemaInfo | undefined {
  const schema = reader.schemasById.get(schemaId);
  if (!schema) {
    return undefined;
  }
  return {
    name: schema.name,
    encoding: schema.encoding,
    data: schema.data,
  };
}

/** Single-pass MCAP index: TF buffer + per-topic timestamp index. */
export async function indexMcapMessages(
  reader: McapIndexedReader,
  onProgress?: (progress: McapIndexProgress) => void,
): Promise<McapIndexResult> {
  const tfBuffer = new TfBuffer();
  const topicIndex = TopicTimeIndex.empty();
  const tfTopics = new Set<string>();

  for (const channel of reader.channelsById.values()) {
    if (isTfTopic(channel.topic)) {
      tfTopics.add(channel.topic);
    }
    const schema = reader.schemasById.get(channel.schemaId);
    topicIndex.registerChannel(channel.topic, channel.id, schema?.name ?? "unknown");
  }

  let messages_read = 0;
  let transforms_added = 0;

  for await (const message of reader.readMessages()) {
    messages_read += 1;

    const channel = reader.channelsById.get(message.channelId);
    if (!channel) {
      continue;
    }

    const schemaRecord = schemaFromReader(reader, channel.schemaId);
    const log_time_ns = Number(message.logTime);

    topicIndex.add(channel.topic, channel.id, schemaRecord?.name ?? "unknown", {
      log_time_ns,
      sequence: message.sequence,
    });

    if (!schemaRecord || !isTfTopic(channel.topic) || !isTfMessageSchema(schemaRecord.name)) {
      if (messages_read % 500 === 0) {
        onProgress?.({
          messages_read,
          transforms_added,
          topics_indexed: topicIndex.topicCount(),
        });
      }
      continue;
    }

    const decoded = decodeRos2Message(schemaRecord, message.data);
    if (!decoded.value) {
      continue;
    }

    const tfMessage = decoded.value as { transforms?: DecodedTransform[] };
    const isStatic = channel.topic.includes("static");

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
  };
}
