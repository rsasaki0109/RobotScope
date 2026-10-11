import { McapWriter, TempBuffer } from "@mcap/core";
import { channel, message } from "./live-fixture.mjs";

// Valid LZ4 frame: independent 64KiB blocks, no checksums. Literal-only
// compressed blocks exercise the actual frame decoder without a test dependency.
export function lz4Frame(data) {
  const parts = [Buffer.from([0x04, 0x22, 0x4d, 0x18, 0x60, 0x40, 0x82])];
  for (let offset = 0; offset < data.length; offset += 60_000) {
    const bytes = data.subarray(offset, offset + 60_000);
    const length = [Math.min(bytes.length, 15) << 4];
    if (bytes.length >= 15) {
      let remainder = bytes.length - 15;
      while (remainder >= 255) { length.push(255); remainder -= 255; }
      length.push(remainder);
    }
    const block = Buffer.concat([Buffer.from(length), bytes]);
    const size = Buffer.alloc(4);
    size.writeUInt32LE(block.length);
    parts.push(size, block);
  }
  parts.push(Buffer.alloc(4));
  return Buffer.concat(parts);
}

export async function compressedRecording(compression, compress) {
  const buffer = new TempBuffer();
  const writer = new McapWriter({ writable: buffer, useChunks: true, chunkSize: 1024,
    compressChunk: (data) => ({ compression, compressedData: compress(data) }) });
  await writer.start({ profile: "ros2", library: "robotscope-compression-test" });
  const schemaId = await writer.registerSchema({ name: channel.schema, encoding: channel.encoding,
    data: new TextEncoder().encode(channel.definition) });
  const channelId = await writer.registerChannel({ topic: channel.topic, schemaId, messageEncoding: "cdr", metadata: new Map() });
  for (let i = 0; i < 50; i++) {
    const item = message(i);
    await writer.addMessage({ channelId, sequence: i, logTime: BigInt(item.log_time_ns), publishTime: BigInt(item.log_time_ns), data: Buffer.from(item.data_b64, "base64") });
  }
  await writer.end();
  return buffer.get();
}
