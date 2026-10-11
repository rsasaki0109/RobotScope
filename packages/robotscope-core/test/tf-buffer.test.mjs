import assert from "node:assert/strict";
import test from "node:test";
import { TfBuffer } from "../dist/index.js";

function transform(time, extra = {}) {
  return { parent_frame_id: "map", child_frame_id: "base_link", time_ns: time,
    translation: [time, 0, 0], rotation: [0, 0, 0, 1], is_static: false, ...extra };
}

test("offline TF retains early transforms beyond the former 4000-sample cutoff", () => {
  const buffer = new TfBuffer();
  for (let i = 0; i < 5000; i++) buffer.addTransform(transform(i));
  assert.equal(buffer.transformCount, 5000);
  assert.equal(buffer.lookupTransform("map", "base_link", 0).translation[0], 0);
  assert.equal(buffer.lookupTransform("map", "base_link", 4500).translation[0], 4500);
});

test("out-of-order TF uses the newest past sample and never a future transform", () => {
  const buffer = new TfBuffer();
  for (const time of [300, 100, 200]) buffer.addTransform(transform(time));
  assert.equal(buffer.lookupTransform("map", "base_link", 99), undefined);
  assert.equal(buffer.lookupTransform("map", "base_link", 250).time_ns, 200);
  assert.equal(buffer.lookupTransform("map", "base_link", 300).time_ns, 300);
});

test("explicit live TF retention bounds history while keeping static frames", () => {
  const buffer = new TfBuffer(3);
  buffer.addTransform(transform(0, { child_frame_id: "camera", is_static: true }));
  for (let i = 0; i < 10; i++) buffer.addTransform(transform(i));
  assert.equal(buffer.transformCount, 4);
  assert.equal(buffer.lookupTransform("map", "base_link", 6), undefined);
  assert.equal(buffer.lookupTransform("map", "base_link", 8).time_ns, 8);
  assert.equal(buffer.lookupTransform("map", "camera", -1).is_static, true);
});

test("composes parent and child transforms and terminates cycles", () => {
  const buffer = new TfBuffer();
  buffer.addTransform(transform(1, { is_static: true, translation: [1, 0, 0] }));
  buffer.addTransform(transform(1, { parent_frame_id: "base_link", child_frame_id: "camera", is_static: true, translation: [0, 2, 0] }));
  assert.deepEqual(buffer.lookupTransformToFixed("camera", "map", 1).translation, [1, 2, 0]);
  buffer.addTransform(transform(1, { parent_frame_id: "camera", child_frame_id: "map", is_static: true }));
  assert.equal(buffer.lookupTransformToFixed("camera", "missing", 1), undefined);
});
