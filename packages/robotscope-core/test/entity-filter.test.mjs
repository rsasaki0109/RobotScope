import assert from "node:assert/strict";
import test from "node:test";

import { filterEntities } from "../dist/entity-filter.js";

const entities = [
  {
    id: "pose",
    path: "/robot/ego/pose",
    kind: "robot",
    tags: ["Pose", "localization", "primary"],
  },
  {
    id: "image",
    path: "/robot/ego/sensors/camera/image",
    kind: "sensor",
    tags: ["Image", "camera", "primary"],
  },
  {
    id: "map",
    path: "/world/map/occupancy",
    kind: "world",
    tags: ["OccupancyGrid", "map"],
  },
];

test("returns all entities when no populated constraints are provided", () => {
  assert.deepEqual(filterEntities(entities, undefined), entities);
  assert.deepEqual(filterEntities(entities, { paths: [], tags: [] }), entities);
});

test("combines filter fields with AND semantics", () => {
  const result = filterEntities(entities, {
    paths: ["/robot/ego/pose", "/robot/ego/sensors/camera/image"],
    kinds: ["sensor"],
    archetypes: ["Image"],
    tags: ["camera", "primary"],
  });

  assert.deepEqual(result.map((entity) => entity.id), ["image"]);
});

test("requires every requested tag", () => {
  assert.deepEqual(
    filterEntities(entities, { tags: ["primary", "localization"] }).map(
      (entity) => entity.id,
    ),
    ["pose"],
  );
  assert.deepEqual(filterEntities(entities, { tags: ["primary", "missing"] }), []);
});

test("matches archetypes independently from other tags", () => {
  assert.deepEqual(
    filterEntities(entities, { archetypes: ["Pose", "OccupancyGrid"] }).map(
      (entity) => entity.id,
    ),
    ["pose", "map"],
  );
});
