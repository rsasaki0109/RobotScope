import { once } from "node:events";
import { McapIndexedReader, TempBuffer } from "@mcap/core";
import { WebSocketServer } from "ws";

export const channel = {
  id: 1, topic: "/localization/pose_estimator/ndt_score",
  schema: "std_msgs/msg/Float64", encoding: "ros2msg", definition: "float64 data",
};
export const session = {
  type: "session", protocol: "robotscope.live.v0.1", agent: "test-agent",
  start_ns: 1_000_000_000, topics: [{ name: channel.topic, schema: channel.schema }],
};
export function message(index) {
  const data = Buffer.alloc(12);
  data[1] = 1; // little-endian CDR encapsulation
  data.writeDoubleLE(index / 10, 4);
  return { type: "message", channel_id: 1, log_time_ns: 1_000_000_000 + index * 1_000_000,
    sequence: index, data_b64: data.toString("base64") };
}
export async function recordingMessages(data) {
  const reader = await McapIndexedReader.Initialize({ readable: new TempBuffer(data) });
  const messages = [];
  for await (const message of reader.readMessages()) messages.push(message);
  return { reader, messages };
}
export async function server(t, onConnection) {
  const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  server.on("connection", onConnection);
  await once(server, "listening");
  t.after(async () => {
    for (const socket of server.clients) socket.terminate();
    await new Promise((resolve) => server.close(resolve));
  });
  return { server, url: `ws://127.0.0.1:${server.address().port}` };
}
