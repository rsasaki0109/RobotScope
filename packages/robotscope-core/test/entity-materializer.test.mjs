import assert from "node:assert/strict";
import test from "node:test";

import { materializeMappedEntity } from "../dist/entity-materializer.js";

const mapping = {
  topic: "/camera/image_raw",
  schema: "sensor_msgs/msg/Image",
  entity_path: "/robot/ego/sensors/camera/image_raw",
  archetype: "Image",
  kind: "sensor",
  rule_id: "sensor.image",
};

test("materializes decoded data with time, frame, and provenance", () => {
  const entity = materializeMappedEntity(mapping, {
    topic: mapping.topic,
    schema: mapping.schema,
    log_time_ns: 2_500_000_000,
    sequence: 12,
    data_size: 3,
    decoded: {
      header: {
        stamp: { sec: 2, nanosec: 123 },
        frame_id: "camera_optical_frame",
      },
      width: 1,
      height: 1,
    },
  });

  const data = entity.components.at(-1);
  assert.equal(data.name, "data");
  assert.equal(data.type, "Image");
  assert.deepEqual(data.time, {
    log_time_ns: 2_500_000_000,
    sensor_time_ns: 2_000_000_123,
  });
  assert.deepEqual(data.frame, { frame_id: "camera_optical_frame" });
  assert.deepEqual(data.source, {
    topic: mapping.topic,
    schema: mapping.schema,
    sequence: 12,
  });
  assert.equal(data.value.width, 1);
});

test("keeps decode failures separate from component values", () => {
  const entity = materializeMappedEntity(mapping, {
    topic: mapping.topic,
    schema: mapping.schema,
    log_time_ns: 10,
    data_size: 2,
    decode_error: "truncated payload",
  });

  const data = entity.components.at(-1);
  assert.equal(data.value, undefined);
  assert.deepEqual(data.quality, {
    flags: ["decode_error", "truncated payload"],
  });
});

test("returns the catalog entity when no message is available", () => {
  const entity = materializeMappedEntity(mapping, null);
  assert.equal(entity.components.length, 1);
  assert.equal(entity.components[0].name, "source");
});
