import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { parseBoostLaneletMap } from "../packages/robotscope-core/src/ros2/lanelet-boost-bin.ts";

const fixture = path.join(
  fileURLToPath(new URL(".", import.meta.url)),
  "../packages/robotscope-core/fixtures/lanelet-boost-1llt.bin",
);

const bytes = new Uint8Array(readFileSync(fixture));
const parsed = parseBoostLaneletMap(bytes);

if (!parsed) {
  console.error("parseBoostLaneletMap returned null");
  process.exit(1);
}

console.log(JSON.stringify(parsed, null, 2));

if (parsed.lanelet_count !== 1) {
  console.error(`expected 1 lanelet, got ${parsed.lanelet_count}`);
  process.exit(1);
}

const boundary = parsed.lanelets[0]?.boundary ?? [];
if (boundary.length < 4) {
  console.error(`expected closed boundary, got ${boundary.length} points`);
  process.exit(1);
}

console.log("ok");
