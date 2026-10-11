import { decodeMessage } from "../data/message-decoder.js";
import { isTransformChannel, storedTransforms } from "../data/transforms.js";
import type { McapIndexedReader } from "@mcap/core";

import type { SchemaInfo } from "../ros2/decoder.js";
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
    if (isTransformChannel(channel.topic, reader.schemasById.get(channel.schemaId)?.name ?? "")) {
      tfTopics.add(channel.topic);
    }
    const schema = reader.schemasById.get(channel.schemaId);
    topicIndex.registerChannel(channel.topic, channel.id, schema?.name ?? "unknown");
  }

  let messages_read = 0;
  let tf_message_count = 0;
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

    if (!schemaRecord || !isTransformChannel(channel.topic, schemaRecord.name)) {
      if (messages_read % 500 === 0) {
        onProgress?.({
          messages_read,
          transforms_added,
          topics_indexed: topicIndex.topicCount(),
        });
      }
      continue;
    }

    const decoded = decodeMessage(schemaRecord, message.data, channel.messageEncoding);
    if (!decoded.value) {
      continue;
    }
    tf_message_count += 1;

    for (const transform of storedTransforms(schemaRecord.name, decoded.value, Number(message.logTime), channel.topic)) {
      tfBuffer.addTransform(transform);
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
    tf_message_count,
    tf_transform_count: transforms_added,
    tf_topics: [...tfTopics].sort(),
  };
}
