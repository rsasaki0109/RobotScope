import { decodeMessage } from "../data/message-decoder.js";
import { isTransformChannel, storedTransforms } from "../data/transforms.js";
import type { McapIndexedReader } from "@mcap/core";

import type { SchemaInfo } from "../ros2/decoder.js";
import { TfBuffer } from "./tf-buffer.js";

export interface TfIndexProgress {
  messages_read: number;
  transforms_added: number;
}

export interface TfIndexResult {
  buffer: TfBuffer;
  messages_read: number;
  transforms_added: number;
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

export async function indexTfFromMcap(
  reader: McapIndexedReader,
  onProgress?: (progress: TfIndexProgress) => void,
): Promise<TfIndexResult> {
  const buffer = new TfBuffer();
  const tfTopics: string[] = [];

  for (const channel of reader.channelsById.values()) {
    if (isTransformChannel(channel.topic, reader.schemasById.get(channel.schemaId)?.name ?? "")) {
      tfTopics.push(channel.topic);
    }
  }

  if (tfTopics.length === 0) {
    return {
      buffer,
      messages_read: 0,
      transforms_added: 0,
      tf_topics: [],
    };
  }

  let messages_read = 0;
  let transforms_added = 0;

  for await (const message of reader.readMessages({ topics: tfTopics })) {
    messages_read += 1;

    const channel = reader.channelsById.get(message.channelId);
    if (!channel) {
      continue;
    }

    const schema = schemaFromReader(reader, channel.schemaId);
    if (!schema || !isTransformChannel(channel.topic, schema.name)) {
      continue;
    }

    const decoded = decodeMessage(schema, message.data, channel.messageEncoding);
    if (!decoded.value) {
      continue;
    }

    for (const transform of storedTransforms(schema.name, decoded.value, Number(message.logTime), channel.topic)) {
      buffer.addTransform(transform);
      transforms_added += 1;
    }

    if (messages_read % 250 === 0) {
      onProgress?.({ messages_read, transforms_added });
    }
  }

  onProgress?.({ messages_read, transforms_added });

  return {
    buffer,
    messages_read,
    transforms_added,
    tf_topics: tfTopics.sort(),
  };
}
