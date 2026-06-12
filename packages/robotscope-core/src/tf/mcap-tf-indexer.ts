import type { McapIndexedReader } from "@mcap/core";

import {
  decodeRos2Message,
  isTfMessageSchema,
  isTfTopic,
  type SchemaInfo,
} from "../ros2/decoder.js";
import { StoredTransform, TfBuffer } from "./tf-buffer.js";

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

export async function indexTfFromMcap(
  reader: McapIndexedReader,
  onProgress?: (progress: TfIndexProgress) => void,
): Promise<TfIndexResult> {
  const buffer = new TfBuffer();
  const tfTopics: string[] = [];

  for (const channel of reader.channelsById.values()) {
    if (isTfTopic(channel.topic)) {
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
    if (!schema || !isTfMessageSchema(schema.name)) {
      continue;
    }

    const decoded = decodeRos2Message(schema, message.data);
    if (!decoded.value) {
      continue;
    }

    const tfMessage = decoded.value as { transforms?: DecodedTransform[] };
    const isStatic = channel.topic.includes("static");

    for (const transform of tfMessage.transforms ?? []) {
      const stored: StoredTransform = {
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
        time_ns: isStatic ? 0 : Number(message.logTime),
        is_static: isStatic,
      };
      buffer.addTransform(stored);
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
